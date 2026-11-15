// Modo libre (#/libre): sin código de clase. El jugador explora Marte con su astronauta,
// mina el planeta, fabrica bloques y construye su base. Puede jugar solo o crear una sala y
// compartir el enlace (o el QR) para que sus amigos entren al mismo mundo.
//
// Todo vive en el dispositivo: el inventario, las misiones del explorador y los bloques del
// mundo se guardan en el navegador; en una sala, los cambios viajan entre los amigos.

import { useEffect, useMemo, useRef, useState } from 'react';
import { QR, Logo } from '../../components/ui';
import { loadProfile, saveProfile, type PlayerProfile } from '../../lib/profile';
import { useWakeLock, vibrate } from '../../lib/pwa';
import { primeAudio, sfx } from '../../lib/sound';
import { FreeNet, ROOM_RE, newRoomCode, roomLink, type FreeNetState, type FreePeer } from '../../net/freeNet';
import type { BlockEdit, BlockWorld } from '../../world/blocks/BlockWorld';
import { BLOCKS, BLOCK_ORDER, RECIPES, blockIcon, type BlockId, type Recipe } from '../../world/blocks/types';
import { demoSnapshot, type PresenceMap, type WorldSnapshot } from '../../world/colony/snapshot';
import { PLANET_RADIUS } from '../../world/core/config';
import { WorldCanvas } from '../../world/react/WorldCanvas';
import { WorldPlay } from '../../world/react/WorldPlay';
import type { BuildHost, WorldEngine } from '../../world/WorldEngine';
import { AvatarBuilder } from '../play/AvatarBuilder';

/* ---------------- partida guardada ---------------- */

interface Stats {
  walked: number;
  mined: number;
  rare: number;
  placed: number;
  crafted: number;
  lamps: number;
}

interface Save {
  inv: Record<number, number>;
  stats: Stats;
  done: string[];
  sel: number;
}

const SAVE_KEY = 'donrover.libre.v1';
const worldKey = (room: string | null) => `donrover.libre.mundo.${room ?? 'solo'}`;

const newSave = (): Save => ({
  inv: { 1: 8, 6: 16, 7: 6, 9: 2 },
  stats: { walked: 0, mined: 0, rare: 0, placed: 0, crafted: 0, lamps: 0 },
  done: [],
  sel: 5,
});

function loadSave(): Save {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') as Partial<Save> | null;
    if (!raw) return newSave();
    const base = newSave();
    return { inv: { ...raw.inv }, stats: { ...base.stats, ...raw.stats }, done: Array.isArray(raw.done) ? raw.done : [], sel: Number.isInteger(raw.sel) ? Math.min(9, Math.max(0, raw.sel!)) : 5 };
  } catch {
    return newSave();
  }
}

function loadWorld(room: string | null): BlockEdit[] {
  try {
    const raw = JSON.parse(localStorage.getItem(worldKey(room)) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/* ---------------- misiones del explorador ---------------- */

interface Quest {
  id: string;
  emoji: string;
  title: string;
  tip: string;
  goal: number;
  value(s: Stats): number;
  xp: number;
}

const QUESTS: Quest[] = [
  { id: 'walk', emoji: '🥾', title: 'Camina 40 m por la colonia', tip: 'Muévete con el joystick o con W A S D.', goal: 40, value: (s) => Math.floor(s.walked), xp: 20 },
  { id: 'mine', emoji: '⛏️', title: 'Mina 6 bloques', tip: 'Toca o haz clic en el suelo para sacar regolito.', goal: 6, value: (s) => s.mined, xp: 30 },
  { id: 'place', emoji: '🧱', title: 'Coloca 8 bloques', tip: 'Elige un bloque de la barra y constrúyelo donde apuntes.', goal: 8, value: (s) => s.placed, xp: 30 },
  { id: 'craft', emoji: '🖨️', title: 'Fabrica 4 bloques en la impresora 3D', tip: 'Abre «Fabricar» y convierte regolito en ladrillos.', goal: 4, value: (s) => s.crafted, xp: 40 },
  { id: 'rare', emoji: '💎', title: 'Mina 3 bloques de un depósito', tip: 'Fuera de la colonia hay hielo, hematita y cristal.', goal: 3, value: (s) => s.rare, xp: 50 },
  { id: 'lamp', emoji: '💡', title: 'Coloca una lámpara para la noche', tip: 'Las lámparas se fabrican con cristal y un panel.', goal: 1, value: (s) => s.lamps, xp: 40 },
  { id: 'base', emoji: '🏠', title: 'Construye tu base: 40 bloques', tip: 'Paredes, techo, ventanas de vidrio… ¡tú decides!', goal: 40, value: (s) => s.placed, xp: 80 },
  { id: 'mega', emoji: '🏙️', title: 'Gran obra: 150 bloques', tip: 'Invita a tus amigos y construyan juntos.', goal: 150, value: (s) => s.placed, xp: 150 },
];

const canCraft = (r: Recipe, inv: Record<number, number>) => r.needs.every(([id, n]) => (inv[id] ?? 0) >= n);

/** Marte tiene día y noche: todos los de la sala ven la misma hora. */
const isNight = () => (Date.now() / 1000) % 260 > 175;

type Panel = 'craft' | 'invite' | 'quests' | null;

interface Props {
  /** Sala del enlace de invitación (vacío si no hay). */
  initialRoom: string;
  /** "amigos" abre directamente la opción de crear sala. */
  mode: string | null;
}

export function FreePlay({ initialRoom, mode }: Props) {
  const invited = ROOM_RE.test(initialRoom);
  const [profile, setProfile] = useState<PlayerProfile>(() => loadProfile());
  const [stage, setStage] = useState<'menu' | 'game'>('menu');
  const [room, setRoom] = useState<string | null>(invited ? initialRoom : null);
  const [engine, setEngine] = useState<WorldEngine | null>(null);
  const [game, setGame] = useState<Save>(loadSave);
  const [peers, setPeers] = useState<FreePeer[]>([]);
  const [netState, setNetState] = useState<FreeNetState>('connecting');
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const [compass, setCompass] = useState<{ block: BlockId; distance: number; angle: number } | null>(null);

  const gameRef = useRef(game);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const roomRef = useRef(room);
  roomRef.current = room;
  const engineRef = useRef<WorldEngine | null>(null);
  const blocksRef = useRef<BlockWorld | null>(null);
  const netRef = useRef<FreeNet | null>(null);
  const presence = useRef<PresenceMap>({});
  const pendingEdits = useRef<BlockEdit[]>([]);
  const dirty = useRef(false);
  const created = useRef<string | null>(null);
  const lastDenied = useRef(0);
  useWakeLock(stage === 'game');

  const name = profile.name.trim() || 'Astronauta';

  const say = (text: string) => setNotice(text);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3200);
    return () => clearTimeout(t);
  }, [notice]);

  const update = (fn: (g: Save) => Save) => {
    const next = fn(gameRef.current);
    gameRef.current = next;
    setGame(next);
  };

  // Guardar el inventario y el avance.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(game));
      } catch {
        /* almacenamiento lleno o no disponible */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [game]);

  const saveWorld = () => {
    const b = blocksRef.current;
    if (!b) return;
    dirty.current = false;
    try {
      localStorage.setItem(worldKey(roomRef.current), JSON.stringify(b.edits()));
    } catch {
      /* almacenamiento lleno */
    }
  };

  /* ---------------- misiones ---------------- */

  const quest = QUESTS.find((q) => !game.done.includes(q.id)) ?? null;
  useEffect(() => {
    if (!quest || quest.value(game.stats) < quest.goal) return;
    update((g) => ({ ...g, done: [...g.done, quest.id] }));
    const p = profileRef.current;
    const next = { ...p, xp: p.xp + quest.xp };
    saveProfile(next);
    setProfile(next);
    sfx.success();
    vibrate([40, 60, 40]);
    say(`✅ ${quest.title} · +${quest.xp} XP`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quest?.id, game.stats]);

  /* ---------------- motor: bloques, jugador, día y noche ---------------- */

  const host = useMemo<BuildHost>(
    () => ({
      selected: () => {
        const id = BLOCK_ORDER[gameRef.current.sel];
        return (gameRef.current.inv[id] ?? 0) > 0 ? id : 0;
      },
      mined: (block, fromGround) => {
        sfx.pop();
        vibrate(18);
        update((g) => ({
          ...g,
          inv: { ...g.inv, [block]: (g.inv[block] ?? 0) + 1 },
          stats: { ...g.stats, mined: g.stats.mined + 1, rare: g.stats.rare + (!fromGround && block >= 3 && block <= 5 ? 1 : 0) },
        }));
      },
      placed: (block) => {
        sfx.select();
        vibrate(10);
        update((g) => ({
          ...g,
          inv: { ...g.inv, [block]: Math.max(0, (g.inv[block] ?? 0) - 1) },
          stats: { ...g.stats, placed: g.stats.placed + 1, lamps: g.stats.lamps + (block === 9 ? 1 : 0) },
        }));
      },
      denied: (reason) => {
        const now = Date.now();
        if (now - lastDenied.current < 1500) return;
        lastDenied.current = now;
        if (reason === 'empty') say(`No te queda ${BLOCKS[BLOCK_ORDER[gameRef.current.sel]].name.toLowerCase()}: mina o fabrica más`);
        else if (reason === 'self') say('Ahí estás tú: muévete un poco');
        else say('Acércate más para alcanzarlo');
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (!engine) return;
    engineRef.current = engine;
    const blocks = engine.enableBuilding(host);
    blocksRef.current = blocks;
    blocks.load(loadWorld(roomRef.current));
    blocks.load(pendingEdits.current.splice(0));
    blocks.onEdit = (e) => {
      dirty.current = true;
      netRef.current?.sendEdit(e);
    };
    const p = profileRef.current;
    // Un id al azar: cada jugador aparece en un punto distinto de la plaza.
    engine.enterPlayer({ id: `libre-${Math.random().toString(36).slice(2, 8)}`, name: p.name.trim() || 'Astronauta', avatar: p.avatar, role: null }, 'third');
    engine.setPresence(presence.current);
    engine.setLighting(isNight() ? 'dusk' : 'day');
    const clock = setInterval(() => engine.setLighting(isNight() ? 'dusk' : 'day'), 5000);
    const saver = setInterval(() => dirty.current && saveWorld(), 2500);

    // Pose para los amigos y metros caminados.
    let last = '';
    let prev: [number, number, number] | null = null;
    const tick = (force: boolean) => {
      const pose = engine.playerPose();
      if (!pose) return;
      if (prev) {
        // Cuerda entre las dos posiciones (exactamente 0 si el astronauta no se movió).
        const dist = Math.hypot(pose[0] - prev[0], pose[1] - prev[1], pose[2] - prev[2]) * PLANET_RADIUS;
        if (dist > 0.05 && dist < 6) update((g) => ({ ...g, stats: { ...g.stats, walked: g.stats.walked + dist } }));
      }
      prev = [pose[0], pose[1], pose[2]];
      const key = pose.join(',');
      if (!force && key === last) return;
      last = key;
      netRef.current?.sendPose(pose);
    };
    const radar = setInterval(() => setCompass(engine.nearestDeposit()), 500);
    // Golpecitos mientras se mina.
    let hits = -1;
    const offBuild = engine.events.on('build', (aim) => {
      const step = aim.progress > 0 ? Math.floor(aim.progress * 4) : -1;
      if (step !== hits && step >= 0) sfx.tap();
      hits = step;
    });
    const fast = setInterval(() => tick(false), 170);
    const keep = setInterval(() => tick(true), 3000);
    window.addEventListener('pagehide', saveWorld);
    return () => {
      clearInterval(clock);
      clearInterval(saver);
      clearInterval(fast);
      clearInterval(keep);
      clearInterval(radar);
      offBuild();
      window.removeEventListener('pagehide', saveWorld);
      saveWorld();
      blocks.onEdit = null;
      blocksRef.current = null;
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  /* ---------------- sala de amigos ---------------- */

  useEffect(() => {
    if (stage !== 'game' || !room) return;
    setNetState('connecting');
    const p = profileRef.current;
    const net = new FreeNet(
      room,
      { name: p.name.trim() || 'Astronauta', avatar: p.avatar },
      {
        onState: setNetState,
        onPeers: (list) => {
          setPeers((old) => {
            const fresh = list.find((n) => !old.some((o) => o.id === n.id));
            if (fresh) {
              say(`🧑‍🚀 ${fresh.name} entró a la sala`);
              sfx.join();
            }
            return list;
          });
        },
        onPose: (id, pose) => {
          if (pose) presence.current[id] = pose;
          else delete presence.current[id];
          engineRef.current?.setPresence({ ...presence.current });
        },
        onEdits: (edits) => {
          dirty.current = true;
          if (blocksRef.current) blocksRef.current.load(edits);
          else pendingEdits.current.push(...edits);
        },
        onEmote: (peer, e) => say(`${e} ${peer.name}`),
        snapshot: () => blocksRef.current?.edits() ?? [],
      },
    );
    if (created.current === room) net.markSynced();
    netRef.current = net;
    net.start();
    return () => {
      net.stop();
      netRef.current = null;
      presence.current = {};
      engineRef.current?.setPresence({});
      setPeers([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, room]);

  const createRoom = () => {
    const code = newRoomCode();
    created.current = code;
    roomRef.current = code;
    setRoom(code);
    saveWorld();
    history.replaceState(null, '', `#/libre?sala=${code}`);
    return code;
  };

  const share = async () => {
    const code = room ?? createRoom();
    const url = roomLink(code);
    const nav = navigator as Navigator & { share?: (d: { title: string; text: string; url: string }) => Promise<void> };
    try {
      if (nav.share) {
        await nav.share({ title: 'Taller de Don Rover', text: '¡Ven a construir conmigo en Marte! 🚀', url });
        return;
      }
    } catch {
      /* el jugador cerró el menú de compartir */
    }
    copy(url);
  };

  const copy = (text: string) => {
    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => say('Copia el enlace manualmente'));
    else say('Copia el enlace manualmente');
  };

  /* ---------------- fabricar ---------------- */

  const craft = (r: Recipe) => {
    if (!canCraft(r, gameRef.current.inv)) return;
    sfx.unlock();
    update((g) => {
      const inv = { ...g.inv };
      for (const [id, n] of r.needs) inv[id] = (inv[id] ?? 0) - n;
      inv[r.out] = (inv[r.out] ?? 0) + r.count;
      return { ...g, inv, stats: { ...g.stats, crafted: g.stats.crafted + r.count }, sel: BLOCK_ORDER.indexOf(r.out) };
    });
  };

  // Atajos: C abre la impresora 3D y Esc cierra los paneles.
  useEffect(() => {
    if (stage !== 'game') return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'KeyC') setPanel((p) => (p === 'craft' ? null : 'craft'));
      else if (e.code === 'Escape') setPanel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage]);

  const snapshot = useMemo<WorldSnapshot>(() => ({ ...demoSnapshot(), boarding: peers.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, role: null })) }), [peers]);

  const start = (withFriends: boolean) => {
    primeAudio();
    saveProfile(profile);
    if (withFriends && !room) {
      createRoom();
      setPanel('invite');
    }
    setStage('game');
  };

  /* ---------------- menú ---------------- */

  if (stage === 'menu') {
    return (
      <div className="play play-intro space-bg free-menu">
        <div className="starfield" />
        <header className="play-intro-top">
          <a href="#/" className="plain-link" aria-label="Inicio">
            <Logo size="sm" />
          </a>
          <a className="btn small cream" href="#/jugar">
            Tengo un código de clase
          </a>
        </header>
        <main className="intro-card card profile-card free-card">
          <div className="free-head">
            <p className="free-kicker">{invited ? `Sala ${room}` : 'Modo libre'}</p>
            <h1>{invited ? 'Tus amigos te esperan en Marte' : 'Explora Marte a tu manera'}</h1>
            <p className="muted">Mina el planeta, fabrica bloques y construye tu base. Juega solo o comparte un enlace con tus amigos.</p>
          </div>
          <div className="free-avatar">
            <AvatarBuilder
              value={profile.avatar}
              onChange={(avatar) => {
                const next = { ...profile, avatar };
                saveProfile(next);
                setProfile(next);
              }}
            />
          </div>
          <div className="free-form">
          <div className="field">
            <label htmlFor="fname">Tu nombre de astronauta</label>
            <input
              id="fname"
              className="input big-input"
              maxLength={16}
              placeholder="Astronauta"
              value={profile.name}
              autoComplete="nickname"
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            />
          </div>
          {invited ? (
            <div className="free-actions">
              <button className="btn huge block mars" onClick={() => start(true)}>
                👥 Entrar a la sala
              </button>
              <button
                className="btn block cream"
                onClick={() => {
                  setRoom(null);
                  history.replaceState(null, '', '#/libre');
                  start(false);
                }}
              >
                Mejor jugar solo
              </button>
            </div>
          ) : (
            <div className="free-actions two">
              <button className={`btn huge block ${mode === 'amigos' ? 'cream' : 'mars'}`} onClick={() => start(false)}>
                🚀 Jugar solo
              </button>
              <button className={`btn huge block ${mode === 'amigos' ? 'mars' : 'ix'}`} onClick={() => start(true)}>
                👥 Con amigos
              </button>
            </div>
          )}
          <ul className="free-feats">
            <li>⛏️ Mina</li>
            <li>🖨️ Fabrica</li>
            <li>🧱 Construye</li>
            <li>🔗 Invita con un enlace</li>
          </ul>
          <p className="fine center">Sin cuentas: tu astronauta y tu mundo se guardan en este dispositivo.</p>
          </div>
        </main>
      </div>
    );
  }

  /* ---------------- juego ---------------- */

  const link = room ? roomLink(room) : '';
  const done = game.done.length;

  return (
    <div className="world-overlay free-world">
      <WorldCanvas
        snapshot={snapshot}
        keyboard
        onEngine={(e) => {
          // Acceso al motor desde la consola del navegador, para depurar.
          (window as unknown as { __world?: unknown }).__world = e;
          setEngine(e);
        }}
        onFail={() => setFailed(true)}
      >
        <WorldPlay
          engine={engine}
          snapshot={snapshot}
          onExit={() => {
            saveWorld();
            window.location.hash = '/';
          }}
          exitLabel="Salir"
          notice={notice}
          onEmote={(anim) => netRef.current?.sendEmote(anim === 'wave' ? '👋' : anim === 'cheer' ? '🎉' : anim === 'scan' ? '📡' : '👉')}
          build={{
            slots: BLOCK_ORDER.map((id) => ({ id, count: game.inv[id] ?? 0 })),
            selected: game.sel,
            onSelect: (i) => {
              sfx.tick();
              update((g) => ({ ...g, sel: i }));
            },
          }}
          actions={
            <>
              <button className={`wp-btn ${room ? 'live' : ''}`} onClick={() => setPanel(panel === 'invite' ? null : 'invite')} aria-label="Amigos">
                👥 <span>{room ? peers.length + 1 : 'Invitar'}</span>
                {room && <i className={`wp-dot ${netState}`} />}
              </button>
              <button className="wp-btn" onClick={() => setPanel(panel === 'craft' ? null : 'craft')} aria-label="Fabricar">
                🖨️ <span>Fabricar</span>
              </button>
            </>
          }
          objective={
            <>
            <button className="wp-quest" onClick={() => setPanel(panel === 'quests' ? null : 'quests')}>
              {quest ? (
                <>
                  <span>
                    {quest.emoji} {quest.title}
                  </span>
                  <b>
                    {Math.min(quest.goal, quest.value(game.stats))}/{quest.goal}
                  </b>
                </>
              ) : (
                <span>🏆 ¡Completaste todas las misiones del explorador!</span>
              )}
            </button>
            {compass && compass.distance > 4 && (
              <p className="wp-compass" title="Depósito más cercano">
                <i style={{ transform: `rotate(${compass.angle}rad)` }}>↑</i>
                <img src={blockIcon(compass.block)} alt="" />
                {BLOCKS[compass.block].name} a {Math.round(compass.distance)} m
              </p>
            )}
            </>
          }
        >
          {panel === 'craft' && (
            <section className="wp-panel" role="dialog" aria-label="Impresora 3D">
              <header>
                <h3>🖨️ Impresora 3D</h3>
                <button className="wp-close" onClick={() => setPanel(null)} aria-label="Cerrar">
                  ✕
                </button>
              </header>
              <p className="wp-panel-lead">En Marte se fabrica con lo que hay en el planeta. Mina materiales y conviértelos en piezas para tu base.</p>
              <ul className="wp-recipes">
                {RECIPES.map((r) => {
                  const ok = canCraft(r, game.inv);
                  return (
                    <li key={r.out} className={ok ? '' : 'off'}>
                      <div className="wp-recipe-in">
                        {r.needs.map(([id, n]) => (
                          <span key={id} className={(game.inv[id] ?? 0) >= n ? '' : 'missing'} title={BLOCKS[id].name}>
                            <img src={blockIcon(id)} alt={BLOCKS[id].name} />
                            <b>
                              {game.inv[id] ?? 0}/{n}
                            </b>
                          </span>
                        ))}
                      </div>
                      <span className="wp-recipe-arrow">→</span>
                      <div className="wp-recipe-out">
                        <img src={blockIcon(r.out)} alt="" />
                        <span>
                          <b>
                            {BLOCKS[r.out].name} ×{r.count}
                          </b>
                          <small>Tienes {game.inv[r.out] ?? 0}</small>
                        </span>
                      </div>
                      <button className="wp-btn solid" disabled={!ok} onClick={() => craft(r)}>
                        Fabricar
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="wp-panel-foot">
                {BLOCK_ORDER.slice(0, 5).map((id: BlockId) => (
                  <span key={id}>
                    {BLOCKS[id].emoji} <b>{BLOCKS[id].name}:</b> {BLOCKS[id].source}
                  </span>
                ))}
              </p>
            </section>
          )}

          {panel === 'invite' && (
            <section className="wp-panel" role="dialog" aria-label="Jugar con amigos">
              <header>
                <h3>👥 Jugar con amigos</h3>
                <button className="wp-close" onClick={() => setPanel(null)} aria-label="Cerrar">
                  ✕
                </button>
              </header>
              {room ? (
                <>
                  <p className="wp-panel-lead">Comparte este enlace o el código QR. Quien lo abra entra a tu mundo y puede minar y construir contigo.</p>
                  <div className="wp-invite">
                    <div className="wp-invite-qr">
                      <QR value={link} size={132} />
                    </div>
                    <div className="wp-invite-side">
                      <span className="wp-room">
                        Sala <b>{room}</b>
                        <i className={`wp-dot ${netState}`} />
                      </span>
                      <input className="wp-link" readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Enlace de invitación" />
                      <div className="wp-invite-btns">
                        <button className="wp-btn solid" onClick={() => copy(link)}>
                          {copied ? '✓ Copiado' : '🔗 Copiar enlace'}
                        </button>
                        <button className="wp-btn" onClick={share}>
                          📤 Compartir
                        </button>
                      </div>
                    </div>
                  </div>
                  <ul className="wp-people">
                    <li>
                      <i className="wp-dot online" /> {name} <small>(tú)</small>
                    </li>
                    {peers.map((p) => (
                      <li key={p.id}>
                        <i className="wp-dot online" /> {p.name}
                      </li>
                    ))}
                  </ul>
                  {peers.length === 0 && <p className="wp-panel-foot">{netState === 'online' ? 'Sala abierta: esperando a tus amigos…' : 'Abriendo la sala…'}</p>}
                </>
              ) : (
                <>
                  <p className="wp-panel-lead">Estás jugando solo. Crea una sala para invitar a tus amigos a este mismo mundo: verán todo lo que has construido.</p>
                  <button
                    className="wp-btn solid wide"
                    onClick={() => {
                      createRoom();
                      sfx.unlock();
                    }}
                  >
                    🔗 Crear sala e invitar
                  </button>
                </>
              )}
            </section>
          )}

          {panel === 'quests' && (
            <section className="wp-panel" role="dialog" aria-label="Misiones del explorador">
              <header>
                <h3>🎯 Misiones del explorador</h3>
                <button className="wp-close" onClick={() => setPanel(null)} aria-label="Cerrar">
                  ✕
                </button>
              </header>
              <p className="wp-panel-lead">
                {done}/{QUESTS.length} completadas · {profile.xp} XP
              </p>
              <button
                className="wp-btn wide"
                onClick={() => {
                  engineRef.current?.respawnPlayer();
                  setPanel(null);
                }}
              >
                🏠 Volver a la plaza de la colonia
              </button>
              <ul className="wp-quests">
                {QUESTS.map((q) => {
                  const isDone = game.done.includes(q.id);
                  const now = quest?.id === q.id;
                  return (
                    <li key={q.id} className={isDone ? 'done' : now ? 'now' : ''}>
                      <span className="wp-quest-emoji">{isDone ? '✅' : q.emoji}</span>
                      <span>
                        <b>{q.title}</b>
                        <small>{now ? q.tip : `+${q.xp} XP`}</small>
                      </span>
                      {now && (
                        <em>
                          {Math.min(q.goal, q.value(game.stats))}/{q.goal}
                        </em>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </WorldPlay>
        {failed && (
          <div className="free-fail">
            <p>Este dispositivo no puede mostrar el mundo 3D (necesita WebGL 2).</p>
            <a className="btn cream" href="#/">
              Volver al inicio
            </a>
          </div>
        )}
      </WorldCanvas>
    </div>
  );
}
