// Modo libre (#/libre): sin código de clase. El jugador explora Marte con su astronauta,
// recolecta regolito, hielo y hematita en el terreno y construye su propia base con módulos
// de la colonia (paneles solares, extractores, invernaderos, domos, antenas…). Puede jugar
// solo o crear una sala y compartir el enlace (o el QR) para que sus amigos entren al mismo
// mundo y construyan juntos.
//
// Todo vive en el dispositivo: los recursos, las misiones del explorador y los módulos de la
// base se guardan en el navegador; en una sala, los módulos viajan entre los amigos.

import { useEffect, useMemo, useRef, useState } from 'react';
import { QR, Logo } from '../../components/ui';
import { loadProfile, saveProfile, type PlayerProfile } from '../../lib/profile';
import { useWakeLock, vibrate } from '../../lib/pwa';
import { primeAudio, sfx } from '../../lib/sound';
import { FreeNet, ROOM_RE, newRoomCode, roomLink, type FreeNetState, type FreePeer } from '../../net/freeNet';
import { demoSnapshot, type PresenceMap, type WorldSnapshot } from '../../world/colony/snapshot';
import { PLANET_RADIUS } from '../../world/core/config';
import type { Outpost, OutpostHost, PlacingState } from '../../world/outpost/Outpost';
import {
  MODULES,
  MODULE_ORDER,
  RESOURCES,
  RESOURCE_ORDER,
  SUPPLIES,
  SUPPLY_ORDER,
  baseBalance,
  isModuleEdit,
  type ModuleEdit,
  type ModuleKind,
  type ResourceId,
} from '../../world/outpost/types';
import { WorldCanvas } from '../../world/react/WorldCanvas';
import { WorldPlay } from '../../world/react/WorldPlay';
import type { InteractEvent, WorldEngine } from '../../world/WorldEngine';
import { AvatarBuilder } from '../play/AvatarBuilder';

/* ---------------- partida guardada ---------------- */

type Inventory = Record<ResourceId, number>;

interface Stats {
  walked: number;
  gathered: number;
  built: number;
  /** Tipos de módulo que este jugador ya construyó. */
  kinds: ModuleKind[];
}

interface Save {
  inv: Inventory;
  stats: Stats;
  done: string[];
  /** Módulos construidos en este dispositivo (solo esos se pueden desmontar aquí). */
  mine: string[];
}

const SAVE_KEY = 'donrover.libre.v2';
const baseKey = (room: string | null) => `donrover.libre.base.${room ?? 'solo'}`;

const newSave = (): Save => ({
  inv: { regolith: 6, ice: 2, metal: 3 },
  stats: { walked: 0, gathered: 0, built: 0, kinds: [] },
  done: [],
  mine: [],
});

function loadSave(): Save {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') as Partial<Save> | null;
    if (!raw) return newSave();
    const base = newSave();
    const inv = { ...base.inv };
    for (const r of RESOURCE_ORDER) if (Number.isFinite(raw.inv?.[r])) inv[r] = Math.max(0, Math.floor(raw.inv![r]));
    return {
      inv,
      stats: { ...base.stats, ...raw.stats, kinds: Array.isArray(raw.stats?.kinds) ? raw.stats!.kinds.filter((k) => k in MODULES) : [] },
      done: Array.isArray(raw.done) ? raw.done : [],
      mine: Array.isArray(raw.mine) ? raw.mine.slice(-400) : [],
    };
  } catch {
    return newSave();
  }
}

function loadBase(room: string | null): ModuleEdit[] {
  try {
    const raw = JSON.parse(localStorage.getItem(baseKey(room)) || '[]');
    return Array.isArray(raw) ? raw.filter(isModuleEdit) : [];
  } catch {
    return [];
  }
}

const canAfford = (kind: ModuleKind, inv: Inventory) => RESOURCE_ORDER.every((r) => inv[r] >= (MODULES[kind].cost[r] ?? 0));

/* ---------------- misiones del explorador ---------------- */

interface QuestCtx {
  stats: Stats;
  /** Módulos en pie en el mundo (los tuyos y los de tus amigos). */
  modules: ModuleKind[];
}

interface Quest {
  id: string;
  emoji: string;
  title: string;
  tip: string;
  goal: number;
  value(c: QuestCtx): number;
  xp: number;
}

const builtKind = (k: ModuleKind) => (c: QuestCtx) => (c.stats.kinds.includes(k) ? 1 : 0);

/** Base en equilibrio: produce al menos lo que gasta de energía, agua, aire y comida. */
function balanced(mods: ModuleKind[]): boolean {
  if (mods.length < 4) return false;
  const b = baseBalance(mods);
  return (['energy', 'water', 'air', 'food'] as const).every((s) => b[s].made >= b[s].used);
}

const QUESTS: Quest[] = [
  { id: 'walk', emoji: '🥾', title: 'Camina 40 m por la colonia', tip: 'Muévete con el joystick o con W A S D.', goal: 40, value: (c) => Math.floor(c.stats.walked), xp: 20 },
  { id: 'gather', emoji: '🧺', title: 'Recolecta recursos 5 veces', tip: 'Busca montículos de regolito, hielo o hematita y toca «Recolectar».', goal: 5, value: (c) => c.stats.gathered, xp: 30 },
  { id: 'solar', emoji: '☀️', title: 'Construye paneles solares', tip: 'Abre «Construir»: la energía es lo primero que necesita una base.', goal: 1, value: builtKind('solar'), xp: 40 },
  { id: 'water', emoji: '💧', title: 'Saca agua con un extractor de hielo', tip: 'El extractor necesita energía: ponlo cerca de tus paneles.', goal: 1, value: builtKind('extractor'), xp: 40 },
  { id: 'food', emoji: '🌿', title: 'Cultiva comida en un invernadero', tip: 'Los cultivos necesitan agua y luz.', goal: 1, value: builtKind('greenhouse'), xp: 40 },
  { id: 'home', emoji: '🏠', title: 'Construye un domo habitable', tip: 'Necesitará aire, agua y comida para quienes duermen ahí.', goal: 1, value: builtKind('habitat'), xp: 50 },
  { id: 'balance', emoji: '⚖️', title: 'Base en equilibrio', tip: 'Que nada falte: energía, agua, aire y comida sin números rojos (mín. 4 módulos).', goal: 1, value: (c) => (balanced(c.modules) ? 1 : 0), xp: 80 },
  { id: 'antenna', emoji: '📡', title: 'Llama a la Tierra con una antena', tip: 'Un mensaje tarda de 3 a 22 minutos en llegar.', goal: 1, value: builtKind('antenna'), xp: 50 },
  { id: 'city', emoji: '🏙️', title: 'Gran colonia: 12 módulos', tip: 'Invita a tus amigos y construyan juntos.', goal: 12, value: (c) => c.modules.length, xp: 150 },
];

/** Marte tiene día y noche: todos los de la sala ven la misma hora. */
const isNight = () => (Date.now() / 1000) % 260 > 175;

type Panel = 'build' | 'invite' | 'quests' | null;

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
  const [compass, setCompass] = useState<{ res: ResourceId; distance: number; angle: number } | null>(null);
  const [placing, setPlacing] = useState<PlacingState | null>(null);
  const [modules, setModules] = useState<ModuleKind[]>([]);
  const [inspect, setInspect] = useState<ModuleEdit | null>(null);

  const gameRef = useRef(game);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const roomRef = useRef(room);
  roomRef.current = room;
  const engineRef = useRef<WorldEngine | null>(null);
  const outpostRef = useRef<Outpost | null>(null);
  const netRef = useRef<FreeNet | null>(null);
  const presence = useRef<PresenceMap>({});
  const pendingEdits = useRef<ModuleEdit[]>([]);
  const dirty = useRef(false);
  const created = useRef<string | null>(null);
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

  // Guardar los recursos y el avance.
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

  const saveBase = () => {
    const o = outpostRef.current;
    if (!o) return;
    dirty.current = false;
    try {
      localStorage.setItem(baseKey(roomRef.current), JSON.stringify(o.edits()));
    } catch {
      /* almacenamiento lleno */
    }
  };

  const refreshModules = () => setModules(outpostRef.current?.kinds() ?? []);

  /* ---------------- misiones ---------------- */

  const quest = QUESTS.find((q) => !game.done.includes(q.id)) ?? null;
  const questCtx: QuestCtx = { stats: game.stats, modules };
  useEffect(() => {
    if (!quest || quest.value(questCtx) < quest.goal) return;
    update((g) => ({ ...g, done: [...g.done, quest.id] }));
    const p = profileRef.current;
    const next = { ...p, xp: p.xp + quest.xp };
    saveProfile(next);
    setProfile(next);
    sfx.success();
    vibrate([40, 60, 40]);
    say(`✅ ${quest.title} · +${quest.xp} XP`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quest?.id, game.stats, modules]);

  /* ---------------- motor: recursos, módulos, jugador, día y noche ---------------- */

  const host = useMemo<OutpostHost>(
    () => ({
      afford: (kind) => canAfford(kind, gameRef.current.inv),
      built: (kind) => {
        sfx.unlock();
        vibrate([20, 30, 20]);
        update((g) => {
          const inv = { ...g.inv };
          for (const r of RESOURCE_ORDER) inv[r] -= MODULES[kind].cost[r] ?? 0;
          const kinds = g.stats.kinds.includes(kind) ? g.stats.kinds : [...g.stats.kinds, kind];
          return { ...g, inv, stats: { ...g.stats, built: g.stats.built + 1, kinds } };
        });
        say(`${MODULES[kind].emoji} ¡${MODULES[kind].name} construido!`);
      },
      placing: (st) => setPlacing(st),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    if (!engine) return;
    engineRef.current = engine;
    const outpost = engine.enableOutpost(host);
    outpostRef.current = outpost;
    outpost.apply(loadBase(roomRef.current));
    outpost.apply(pendingEdits.current.splice(0));
    outpost.onEdit = (e) => {
      dirty.current = true;
      if (e.k) update((g) => ({ ...g, mine: [...g.mine, e.id].slice(-400) }));
      netRef.current?.sendEdit(e);
      refreshModules();
    };
    refreshModules();
    const p = profileRef.current;
    // Un id al azar: cada jugador aparece en un punto distinto de la plaza.
    engine.enterPlayer({ id: `libre-${Math.random().toString(36).slice(2, 8)}`, name: p.name.trim() || 'Astronauta', avatar: p.avatar, role: null }, 'third');
    engine.setPresence(presence.current);
    engine.setLighting(isNight() ? 'dusk' : 'day');
    const clock = setInterval(() => engine.setLighting(isNight() ? 'dusk' : 'day'), 5000);
    const saver = setInterval(() => dirty.current && saveBase(), 2500);

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
    const radar = setInterval(() => setCompass(engine.nearestResource()), 500);
    const fast = setInterval(() => tick(false), 170);
    const keep = setInterval(() => tick(true), 3000);
    window.addEventListener('pagehide', saveBase);
    return () => {
      clearInterval(clock);
      clearInterval(saver);
      clearInterval(fast);
      clearInterval(keep);
      clearInterval(radar);
      window.removeEventListener('pagehide', saveBase);
      saveBase();
      outpost.onEdit = null;
      outpostRef.current = null;
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  /** Recolectar o revisar un módulo: lo atiende esta pantalla en lugar de la tarjeta genérica. */
  const onInteract = (ev: InteractEvent): boolean => {
    const o = outpostRef.current;
    if (!o) return false;
    if (ev.defId.startsWith('resource.')) {
      const got = o.collect(ev.uid);
      if (!got) {
        say('Este punto está agotado: vuelve a crecer en un rato');
        return true;
      }
      sfx.pop();
      vibrate(18);
      update((g) => ({ ...g, inv: { ...g.inv, [got.res]: g.inv[got.res] + got.amount }, stats: { ...g.stats, gathered: g.stats.gathered + 1 } }));
      say(`+${got.amount} ${RESOURCES[got.res].emoji} ${RESOURCES[got.res].name}`);
      return true;
    }
    if (ev.defId.startsWith('module.')) {
      const m = o.moduleAt(ev.uid);
      if (m) {
        setPanel(null);
        setInspect(m);
      }
      return true;
    }
    return false;
  };

  const startBuild = (kind: ModuleKind) => {
    const o = outpostRef.current;
    if (!o || !canAfford(kind, gameRef.current.inv)) return;
    sfx.select();
    o.startPlacing(kind);
    setPanel(null);
    setInspect(null);
    say('Muévete para elegir el lugar y toca «Construir aquí»');
  };

  const dismantle = (m: ModuleEdit) => {
    const o = outpostRef.current;
    if (!o || !m.k) return;
    const def = MODULES[m.k];
    o.dismantle(m.id);
    // Se recupera la mitad de lo que costó.
    update((g) => {
      const inv = { ...g.inv };
      for (const r of RESOURCE_ORDER) inv[r] += Math.floor((def.cost[r] ?? 0) / 2);
      return { ...g, inv };
    });
    sfx.whoosh();
    setInspect(null);
    say(`♻️ Desmontaste: ${def.name}`);
  };

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
          if (outpostRef.current) {
            outpostRef.current.apply(edits);
            refreshModules();
          } else pendingEdits.current.push(...edits);
        },
        onEmote: (peer, e) => say(`${e} ${peer.name}`),
        snapshot: () => outpostRef.current?.edits() ?? [],
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
    saveBase();
    history.replaceState(null, '', `#/libre?sala=${code}`);
    return code;
  };

  const share = async () => {
    const code = room ?? createRoom();
    const url = roomLink(code);
    const nav = navigator as Navigator & { share?: (d: { title: string; text: string; url: string }) => Promise<void> };
    try {
      if (nav.share) {
        await nav.share({ title: 'Taller de Don Rover', text: '¡Ven a construir una colonia conmigo en Marte! 🚀', url });
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

  // Atajos: B abre «Construir» y Esc cancela la construcción o cierra los paneles.
  useEffect(() => {
    if (stage !== 'game') return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'KeyB') {
        outpostRef.current?.cancel();
        setInspect(null);
        setPanel((p) => (p === 'build' ? null : 'build'));
      } else if (e.code === 'Escape') {
        if (outpostRef.current?.placing) outpostRef.current.cancel();
        setPanel(null);
        setInspect(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage]);

  const snapshot = useMemo<WorldSnapshot>(() => ({ ...demoSnapshot(), boarding: peers.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, role: null })) }), [peers]);
  const balance = useMemo(() => baseBalance(modules), [modules]);

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
            <p className="muted">Recolecta recursos del planeta y construye tu propia base: paneles solares, extractores de hielo, invernaderos y domos. Juega solo o comparte un enlace con tus amigos.</p>
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
              <li>🧊 Recolecta</li>
              <li>☀️ Construye módulos</li>
              <li>⚖️ Equilibra tu base</li>
              <li>🔗 Invita con un enlace</li>
            </ul>
            <p className="fine center">Sin cuentas: tu astronauta y tu base se guardan en este dispositivo.</p>
          </div>
        </main>
      </div>
    );
  }

  /* ---------------- juego ---------------- */

  const link = room ? roomLink(room) : '';
  const done = game.done.length;
  const placingDef = placing ? MODULES[placing.kind] : null;
  const inspectDef = inspect?.k ? MODULES[inspect.k] : null;

  const hotbar = placingDef ? (
    <div className={`wp-place ${placing!.valid ? '' : 'bad'}`} role="group" aria-label={`Construir ${placingDef.name}`}>
      <span className="wp-place-name">
        {placingDef.emoji} {placingDef.name}
        <small>{placing!.valid ? 'Aquí se puede construir' : placing!.problem === 'cost' ? 'Te faltan recursos' : 'Hay algo estorbando: muévete'}</small>
      </span>
      <button className="wp-btn" onClick={() => outpostRef.current?.rotate()} aria-label="Girar el módulo">
        ↻ <span>Girar</span>
      </button>
      <button className="wp-btn solid" disabled={!placing!.valid} onClick={() => outpostRef.current?.confirm()}>
        ✓ Construir aquí
      </button>
      <button className="wp-btn" onClick={() => outpostRef.current?.cancel()} aria-label="Cancelar">
        ✕
      </button>
    </div>
  ) : (
    <div className="wp-res" aria-label="Tus recursos">
      {RESOURCE_ORDER.map((r) => (
        <span key={r} title={RESOURCES[r].desc} style={{ ['--rc' as string]: RESOURCES[r].color }}>
          <i>{RESOURCES[r].emoji}</i>
          <b>{game.inv[r]}</b>
          <small>{RESOURCES[r].name}</small>
        </span>
      ))}
    </div>
  );

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
            saveBase();
            window.location.hash = '/';
          }}
          exitLabel="Salir"
          notice={notice}
          onEmote={(anim) => netRef.current?.sendEmote(anim === 'wave' ? '👋' : anim === 'cheer' ? '🎉' : anim === 'scan' ? '📡' : '👉')}
          onInteract={onInteract}
          hotbar={hotbar}
          touchActions={
            !placing && (
              <button className="wp-round mode" aria-label="Construir" onClick={() => setPanel(panel === 'build' ? null : 'build')}>
                🏗️<small>Construir</small>
              </button>
            )
          }
          keysHelp={
            <span>
              <kbd>B</kbd> construir · <kbd>R</kbd> girar · <kbd>Clic</kbd> o <kbd>E</kbd> colocar
            </span>
          }
          actions={
            <>
              <button className={`wp-btn ${room ? 'live' : ''}`} onClick={() => setPanel(panel === 'invite' ? null : 'invite')} aria-label="Amigos">
                👥 <span>{room ? peers.length + 1 : 'Invitar'}</span>
                {room && <i className={`wp-dot ${netState}`} />}
              </button>
              <button
                className="wp-btn"
                onClick={() => {
                  outpostRef.current?.cancel();
                  setInspect(null);
                  setPanel(panel === 'build' ? null : 'build');
                }}
                aria-label="Construir"
              >
                🏗️ <span>Construir</span>
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
                      {Math.min(quest.goal, quest.value(questCtx))}/{quest.goal}
                    </b>
                  </>
                ) : (
                  <span>🏆 ¡Completaste todas las misiones del explorador!</span>
                )}
              </button>
              {compass && compass.distance > 4 && !placing && (
                <p className="wp-compass" title="Recurso más cercano">
                  <i style={{ transform: `rotate(${compass.angle}rad)` }}>↑</i>
                  {RESOURCES[compass.res].emoji} {RESOURCES[compass.res].name} a {Math.round(compass.distance)} m
                </p>
              )}
            </>
          }
        >
          {panel === 'build' && (
            <section className="wp-panel wp-build-panel" role="dialog" aria-label="Construir módulos">
              <header>
                <h3>🏗️ Construir</h3>
                <button className="wp-close" onClick={() => setPanel(null)} aria-label="Cerrar">
                  ✕
                </button>
              </header>
              <p className="wp-panel-lead">En Marte se construye con lo que hay en el planeta. Cada módulo produce algo y gasta algo: que a tu base no le falte nada.</p>
              <div className="wp-balance" aria-label="Balance de tu base">
                {SUPPLY_ORDER.map((s) => {
                  const net = balance[s].made - balance[s].used;
                  return (
                    <span key={s} className={net < 0 ? 'bad' : net > 0 ? 'ok' : ''} title={`${SUPPLIES[s].name}: produce ${balance[s].made}, gasta ${balance[s].used}`}>
                      {SUPPLIES[s].emoji} <b>{net > 0 ? `+${net}` : net}</b>
                      <small>{SUPPLIES[s].name}</small>
                    </span>
                  );
                })}
              </div>
              <ul className="wp-modules">
                {MODULE_ORDER.map((k) => {
                  const m = MODULES[k];
                  const ok = canAfford(k, game.inv);
                  return (
                    <li key={k} className={ok ? '' : 'off'}>
                      <span className="wp-module-emoji">{m.emoji}</span>
                      <span className="wp-module-info">
                        <b>{m.name}</b>
                        <small>
                          {SUPPLY_ORDER.filter((s) => m.makes[s]).map((s) => `+${m.makes[s]} ${SUPPLIES[s].emoji}`).join(' ')}
                          {SUPPLY_ORDER.some((s) => m.uses[s]) ? ` · gasta ${SUPPLY_ORDER.filter((s) => m.uses[s]).map((s) => `${m.uses[s]} ${SUPPLIES[s].emoji}`).join(' ')}` : ''}
                        </small>
                        <span className="wp-cost">
                          {RESOURCE_ORDER.filter((r) => m.cost[r]).map((r) => (
                            <em key={r} className={game.inv[r] >= m.cost[r]! ? '' : 'missing'} title={RESOURCES[r].name}>
                              {RESOURCES[r].emoji} {game.inv[r]}/{m.cost[r]}
                            </em>
                          ))}
                        </span>
                      </span>
                      <button className="wp-btn solid" disabled={!ok} onClick={() => startBuild(k)}>
                        Construir
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="wp-panel-foot">
                {RESOURCE_ORDER.map((r) => (
                  <span key={r}>
                    {RESOURCES[r].emoji} <b>{RESOURCES[r].name}:</b> {RESOURCES[r].desc}
                  </span>
                ))}
              </p>
            </section>
          )}

          {inspect && inspectDef && (
            <section className="wp-card" role="dialog" aria-label={inspectDef.name} style={{ ['--wc' as string]: '#FFC93C' }}>
              <div className="wp-card-head">
                <span className="wp-card-emoji">{inspectDef.emoji}</span>
                <h3>{inspectDef.name}</h3>
                <button className="wp-close" onClick={() => setInspect(null)} aria-label="Cerrar">
                  ✕
                </button>
              </div>
              <p>{inspectDef.desc}</p>
              {SUPPLY_ORDER.some((s) => inspectDef.makes[s]) && (
                <div className="wp-line">
                  <span>Produce</span>
                  <b>{SUPPLY_ORDER.filter((s) => inspectDef.makes[s]).map((s) => `${inspectDef.makes[s]} ${SUPPLIES[s].emoji} ${SUPPLIES[s].name.toLowerCase()}`).join(' · ')}</b>
                </div>
              )}
              {SUPPLY_ORDER.some((s) => inspectDef.uses[s]) && (
                <div className="wp-line">
                  <span>Gasta</span>
                  <b>{SUPPLY_ORDER.filter((s) => inspectDef.uses[s]).map((s) => `${inspectDef.uses[s]} ${SUPPLIES[s].emoji} ${SUPPLIES[s].name.toLowerCase()}`).join(' · ')}</b>
                </div>
              )}
              {game.mine.includes(inspect.id) ? (
                <button className="wp-btn wide" onClick={() => dismantle(inspect)}>
                  ♻️ Desmontar (recuperas la mitad)
                </button>
              ) : (
                <p className="wp-panel-foot">Lo construyó alguien de tu sala.</p>
              )}
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
                  <p className="wp-panel-lead">Comparte este enlace o el código QR. Quien lo abra entra a tu mundo y puede recolectar y construir contigo.</p>
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
                          {Math.min(q.goal, q.value(questCtx))}/{q.goal}
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
