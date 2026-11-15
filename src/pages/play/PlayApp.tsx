// App del alumno (celular, tableta o computadora). Sin cuentas: la identidad del astronauta
// vive en este dispositivo y la partida llega por WebRTC desde el navegador del profesor.

import { Suspense, lazy, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ROLES } from '../../../shared/content';
import type { PlayerAction, PlayerView } from '../../../shared/types';
import { Astronaut, IXOrb } from '../../components/art';
import { Countdown, Icon, Logo } from '../../components/ui';
import { PACES } from '../../../shared/content';
import { syncClock } from '../../lib/clock';
import { loadProfile, saveProfile, type PlayerProfile } from '../../lib/profile';
import { useInstall, useWakeLock, vibrate } from '../../lib/pwa';
import { primeAudio, sfx } from '../../lib/sound';
import { decodeSignaling } from '../../net/protocol';
import { PlayerNet, type PlayerNetState } from '../../net/playerNet';
import { AvatarBuilder } from './AvatarBuilder';
import { PhaseScreen } from './screens';

const CODE_RE = /^[A-Z]{4}$/;

/** Mundo 3D del alumno (three.js se descarga solo si lo abre). */
const PlayWorld = lazy(() => import('./PlayWorld'));
const IntroWorld = lazy(() => import('./IntroWorld'));

/** ¿Este dispositivo puede mostrar el mundo 3D? (si no, se juega con las pantallas de siempre). */
const SUPPORTS_3D = (() => {
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
})();

const WORLD_LOADING = (
  <div className="world-overlay">
    <div className="world-loading">
      <div className="spinner" />
      Preparando Marte…
    </div>
  </div>
);

function loadSig(raw: string | null) {
  const fromUrl = decodeSignaling(raw);
  try {
    if (fromUrl) localStorage.setItem('ixchel.sig', JSON.stringify(fromUrl));
    else if (raw === null) return JSON.parse(localStorage.getItem('ixchel.sig') || 'null');
  } catch {
    /* nada */
  }
  return fromUrl;
}

export type Act = (a: PlayerAction) => Promise<boolean>;

export function PlayApp({ initialCode, sig }: { initialCode: string; sig: string | null }) {
  const [profile, setProfile] = useState<PlayerProfile>(() => loadProfile());
  const [code, setCode] = useState(CODE_RE.test(initialCode) ? initialCode : '');
  const [stage, setStage] = useState<'code' | 'profile' | 'game'>(() => {
    if (!CODE_RE.test(initialCode)) return 'code';
    const p = loadProfile();
    return p.name && p.sessions[initialCode]?.token ? 'game' : 'profile';
  });
  const [view, setView] = useState<PlayerView | null>(null);
  const [netState, setNetState] = useState<PlayerNetState>('connecting');
  const [joinError, setJoinError] = useState('');
  const [toast, setToast] = useState<{ text: string; kind: 'hint' | 'error' } | null>(null);
  // El juego es en 3D: el alumno está en Marte desde el principio (el panel de misión se abre encima).
  const [show3d, setShow3d] = useState(SUPPORTS_3D);
  const [card, setCard] = useState(true);
  const netRef = useRef<PlayerNet | null>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const signaling = useMemo(() => loadSig(sig), [sig]);
  const install = useInstall();
  useWakeLock(stage === 'game');

  const updateProfile = (p: PlayerProfile) => {
    saveProfile(p);
    setProfile({ ...p });
  };

  // Conexión con la colonia
  useEffect(() => {
    if (stage !== 'game' || !code) return;
    const net = new PlayerNet(
      code,
      signaling,
      () => {
        const p = profileRef.current;
        return { name: p.name, avatar: p.avatar, xp: p.xp, token: p.sessions[code]?.token };
      },
      {
        onState: setNetState,
        onView: (v) => {
          syncClock(v.now);
          setView(v);
        },
        onJoined: (info) => {
          const p = profileRef.current;
          p.sessions[code] = { token: info.token, at: Date.now(), credited: p.sessions[code]?.credited ?? [] };
          updateProfile(p);
          sfx.join();
          vibrate(40);
        },
        onError: (msg) => {
          setJoinError(msg);
          const p = profileRef.current;
          delete p.sessions[code];
          updateProfile(p);
          setStage('profile');
        },
      },
    );
    netRef.current = net;
    net.start();
    return () => {
      net.stop();
      netRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, code]);

  useEffect(() => {
    if (SUPPORTS_3D && (view?.phase === 'discovery' || view?.phase === 'event')) setShow3d(true);
  }, [view?.phase]);

  // Retroalimentación al cambiar de fase
  const lastPhase = useRef<string | null>(null);
  const lastHint = useRef<string | null>(null);
  useEffect(() => {
    if (!view) return;
    if (lastPhase.current !== view.phase) {
      window.scrollTo({ top: 0 });
      if (lastPhase.current) {
        vibrate(view.phase === 'event' ? [220, 90, 220, 90, 220] : 35);
        if (view.phase === 'event') sfx.alarm();
        else if (view.phase === 'crews' || view.phase === 'briefing') sfx.unlock();
        else sfx.whoosh();
      }
      lastPhase.current = view.phase;
    }
    if (view.hint && view.hint.id !== lastHint.current) {
      lastHint.current = view.hint.id;
      setToast({ text: view.hint.text, kind: 'hint' });
      vibrate([30, 60, 30]);
      sfx.pop();
    }
  }, [view]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.kind === 'hint' ? 7000 : 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Guardar XP e insignias en el dispositivo (una vez por misión)
  useEffect(() => {
    if (!view?.outcome || !view.mission) return;
    const key = `${view.mission.id}:${view.me.sessionXp}`;
    const p = profileRef.current;
    const s = p.sessions[code];
    if (!s || s.credited.includes(key)) return;
    s.credited.push(key);
    p.xp += view.outcome.xpGained;
    p.missions += 1;
    p.badges = [...new Set([...p.badges, ...view.me.badges])];
    updateProfile(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.outcome, view?.mission, code]);

  const act: Act = async (a) => {
    const net = netRef.current;
    if (!net) return false;
    const r = await net.act(a);
    if (!r.ok && r.error) setToast({ text: r.error, kind: 'error' });
    return r.ok;
  };

  /* ---------- pantallas previas ---------- */

  if (stage === 'code') {
    const panel = (
        <div className="play play-intro space-bg">
          <div className="starfield" />
          <header className="play-intro-top">
            <a href="#/" className="plain-link">
              <Logo size="sm" />
            </a>
            {install.canInstall && (
              <button className="btn small cream" onClick={install.install}>
                <Icon name="install" size={16} /> Instalar
              </button>
            )}
          </header>
          <main className="intro-card card">
            <IXOrb size={92} mood="talk" />
            <h1>Únete a la misión</h1>
            <p className="muted">Escribe el código de 4 letras que aparece en el proyector.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (CODE_RE.test(code)) {
                  primeAudio();
                  setStage('profile');
                }
              }}
            >
              <input
                className="code-input"
                value={code}
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                autoFocus
                maxLength={4}
                placeholder="ABCD"
                aria-label="Código de la misión"
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
              />
              <button className="btn big block food" disabled={!CODE_RE.test(code)}>
                Continuar <Icon name="arrow" />
              </button>
            </form>
            <div className="nocode">
              <p className="nocode-title">¿No tienes código?</p>
              <p className="muted">Explora Marte en modo libre: recolecta recursos y construye tu propia base.</p>
              <div className="nocode-actions">
                <a className="btn block mars" href="#/libre?modo=solo">
                  🚀 Jugar solo
                </a>
                <a className="btn block ix" href="#/libre?modo=amigos">
                  👥 Invitar amigos
                </a>
              </div>
            </div>
          </main>
        </div>
    );
    if (!SUPPORTS_3D) return panel;
    return (
      <Suspense fallback={panel}>
        <IntroWorld name={profile.name} avatar={profile.avatar}>
          {card ? (
            <div className="intro-float">
              <button className="btn small cream intro-hide" onClick={() => setCard(false)}>
                🌍 Explorar Marte
              </button>
              {panel}
            </div>
          ) : (
            <button className="btn mars intro-show" onClick={() => setCard(true)}>
              🚀 Unirme a una misión
            </button>
          )}
        </IntroWorld>
      </Suspense>
    );
  }

  if (stage === 'profile') {
    const panel = (
        <div className="play play-intro space-bg">
          <div className="starfield" />
          <header className="play-intro-top">
            <button className="icon-btn" onClick={() => setStage('code')} aria-label="Cambiar código">
              <Icon name="back" />
            </button>
            <span className="chip mono">Misión {code}</span>
          </header>
          <main className="intro-card card profile-card">
            <h1>Crea tu astronauta</h1>
            <AvatarBuilder value={profile.avatar} onChange={(avatar) => updateProfile({ ...profile, avatar })} />
            <div className="field">
              <label htmlFor="pname">Tu nombre de astronauta</label>
              <input
                id="pname"
                className="input big-input"
                maxLength={16}
                placeholder="Ej. Itzel"
                value={profile.name}
                autoComplete="nickname"
                onChange={(e) => {
                  setJoinError('');
                  updateProfile({ ...profile, name: e.target.value });
                }}
              />
            </div>
            {joinError && <p className="error-text">{joinError}</p>}
            <button
              className="btn huge block mars"
              disabled={!profile.name.trim()}
              onClick={() => {
                primeAudio();
                setJoinError('');
                setView(null);
                setStage('game');
              }}
            >
              🚀 ¡Abordar!
            </button>
            <p className="fine center">Sin cuentas: tu astronauta, tu XP y tus insignias se guardan solo en este dispositivo.</p>
          </main>
        </div>
    );
    if (!SUPPORTS_3D) return panel;
    return (
      <Suspense fallback={panel}>
        <IntroWorld name={profile.name} avatar={profile.avatar}>
          {card ? (
            <div className="intro-float">
              <button className="btn small cream intro-hide" onClick={() => setCard(false)}>
                🌍 Explorar Marte
              </button>
              {panel}
            </div>
          ) : (
            <button className="btn mars intro-show" onClick={() => setCard(true)}>
              🧑‍🚀 Crear mi astronauta
            </button>
          )}
        </IntroWorld>
      </Suspense>
    );
  }

  /* ---------- en la misión ---------- */

  const role = view?.me.roles[0];
  const theme = role ? ROLES[role] : null;
  const timed = view && (view.phase === 'discovery' || view.phase === 'challenge' || (view.phase === 'event' && view.event?.stage !== 'done'));
  const pace = PACES[view?.pace ?? 'class'];
  const total = view
    ? view.phase === 'discovery'
      ? pace.discovery
      : view.phase === 'challenge'
        ? pace.challenge
        : view.event?.stage === 'alert'
          ? 6
          : view.event?.stage === 'share'
            ? pace.share
            : pace.action
    : 60;

  return (
    <div className={`play play-game phase-${view?.phase ?? 'connecting'}`} style={theme ? ({ '--rc': theme.color, '--rcd': theme.dark, '--rcs': theme.soft } as CSSProperties) : undefined}>
      <div className="starfield" />
      <header className="play-top">
        <div className="play-me">
          {view && <Astronaut avatar={view.me.avatar} role={role} size={34} pose="still" />}
          <div>
            <b>{view?.me.name ?? profile.name}</b>
            <small>{view?.crew ? `${view.crew.name}${theme ? ` · ${theme.name}` : ''}` : `Misión ${code}`}</small>
          </div>
        </div>
        <div className="play-top-right">
          {timed && view && <Countdown deadline={view.deadline} paused={view.paused} pausedRemaining={view.pausedRemaining} total={total} size={46} />}
          {view && (
            <button className="btn small cream world-btn" onClick={() => setShow3d(true)} aria-label="Explorar la colonia en 3D">
              🌍 3D
            </button>
          )}
          <span className={`net-dot ${netState}`} title={netState} />
        </div>
      </header>

      {netState !== 'connected' && (
        <div className={`net-banner ${netState}`}>
          {netState === 'notfound'
            ? `No encontramos la misión ${code}. ¿El código es correcto y el proyector sigue abierto?`
            : netState === 'kicked'
              ? 'El profesor te quitó de esta misión.'
              : netState === 'error'
                ? 'No se pudo conectar.'
                : view
                  ? 'Reconectando con la colonia…'
                  : 'Conectando con la colonia…'}
          {(netState === 'notfound' || netState === 'kicked' || netState === 'error') && (
            <button className="btn small cream" onClick={() => setStage('code')}>
              Cambiar código
            </button>
          )}
        </div>
      )}

      <main className="play-main" key={view?.phase ?? 'none'}>
        {view ? (
          <PhaseScreen view={view} act={act} net={netRef.current} open3d={() => setShow3d(true)} />
        ) : (
          <div className="play-center">
            <IXOrb size={110} mood="talk" />
            <h2>Abriendo compuertas…</h2>
            <p className="muted-light">Conectando tu celular con la colonia {code}</p>
          </div>
        )}
      </main>

      {toast && (
        <div className={`toast card ${toast.kind}`} role="status" onClick={() => setToast(null)}>
          <IXOrb size={34} mood={toast.kind === 'hint' ? 'talk' : 'alert'} />
          <span>{toast.text}</span>
        </div>
      )}

      {show3d && view && (
        <Suspense fallback={WORLD_LOADING}>
          <PlayWorld view={view} net={netRef.current} onClose={() => setShow3d(false)} />
        </Suspense>
      )}
      {show3d && !view && SUPPORTS_3D && (
        <Suspense fallback={WORLD_LOADING}>
          <IntroWorld name={profile.name} avatar={profile.avatar}>
            <div className="wp-banner">
              <span>{netState === 'notfound' ? `No encontramos la misión ${code}.` : `Conectando con la colonia ${code}…`}</span>
              {netState === 'notfound' && (
                <button className="wp-btn" onClick={() => setStage('code')}>
                  Cambiar código
                </button>
              )}
            </div>
          </IntroWorld>
        </Suspense>
      )}
    </div>
  );
}
