// Pantalla del proyector, minimalista: el planeta 3D vive de fondo y viaja a donde pasa la
// misión; encima hay una sola tarjeta con lo importante de la etapa, unos medidores discretos
// a la derecha y una barra flotante con las herramientas del profe. Lo demás (bitácora de IX,
// reporte, ajustes) se abre solo cuando se necesita.

import { Suspense, lazy, useEffect, useRef, useState, type CSSProperties } from 'react';
import { MISSIONS, PACES, PHASE_FLOW, PHASE_LABELS, ROLES, SYSTEMS, SYSTEM_ORDER } from '../../../shared/content';
import type { Ack, HostAction, HostView } from '../../../shared/types';
import { Astronaut, IXOrb } from '../../components/art';
import { Countdown, Icon, LogoMark } from '../../components/ui';
import { isMuted, setMuted, sfx } from '../../lib/sound';
import { toggleFullscreen, useWakeLock } from '../../lib/pwa';
import type { NetStatus } from '../../net/hostNet';
import { listenAndAnswer } from '../../rover/assistant';
import { useRoverNarrator } from '../../rover/narrator';
import { RoverFace } from '../../rover/RoverFace';
import { RoverCaptions, RoverPanel, useRoverStatus, useVoice } from '../../rover/RoverPanel';
import { stopListening } from '../../rover/voice';
import { MISSION_ZONE } from '../../world/react/missionZones';
import { PlanetView } from '../../world/react/PlanetView';
import { useHostSnapshot } from '../../world/react/useHostSnapshot';
import { PartyStage, partyPrimary } from './PartyStage';
import { Report } from './Report';
import { SettingsModal } from './SettingsModal';
import { BriefingStage, ChallengeStage, CrewsStage, DebriefStage, DiscoveryStage, EventStage, LobbyStage, MissionGenStage, ResultsStage } from './stages';

/** La colonia en 3D a pantalla completa (three.js se descarga solo al abrirla). */
const HostWorld = lazy(() => import('./HostWorld'));

export type Run = (a: HostAction) => Ack;

function phaseTotal(v: HostView): number {
  const p = PACES[v.pace];
  if (v.phase === 'discovery') return p.discovery;
  if (v.phase === 'challenge') return p.challenge;
  if (v.phase === 'event' && v.event) return v.event.stage === 'alert' ? 6 : v.event.stage === 'share' ? p.share : p.action;
  return 60;
}

/** Sonidos de la clase: cada etapa, cada astronauta que llega, cada decisión y los últimos segundos. */
function useConsoleSounds(v: HostView) {
  const prev = useRef({ phase: v.phase, stage: v.event?.stage, players: v.players.length, locked: 0, decoded: 0 });
  useEffect(() => {
    const p = prev.current;
    const locked = v.crews.filter((c) => c.status.locked).length;
    const decoded = v.crews.reduce((n, c) => n + c.status.decoded, 0);
    if (p.phase !== v.phase && !v.party) {
      if (v.phase === 'results') {
        sfx.drumroll(1.3);
        setTimeout(() => (v.results?.saved ? sfx.fanfare : sfx.fail)(), 1400);
      } else if (v.phase === 'crews') sfx.join();
      else if (v.phase === 'event') sfx.alarm();
      else sfx.phase();
    }
    if (v.phase === 'event' && p.stage !== v.event?.stage) {
      if (v.event?.stage === 'action') sfx.go();
      else if (v.event?.stage === 'done') (v.event.saved ? sfx.fanfare : sfx.fail)();
    }
    if (v.players.length > p.players) sfx.join();
    if (locked > p.locked) sfx.lock();
    if (decoded > p.decoded) sfx.crafted();
    prev.current = { phase: v.phase, stage: v.event?.stage, players: v.players.length, locked, decoded };
  }, [v]);

  // Últimos 5 segundos del cronómetro: un pitido por segundo y silbato al final.
  const timed = !v.party && (v.phase === 'discovery' || v.phase === 'challenge' || (v.phase === 'event' && v.event?.stage !== 'done'));
  const deadline = timed && !v.paused ? v.deadline : null;
  useEffect(() => {
    if (!deadline) return;
    let last = -1;
    const id = setInterval(() => {
      const s = Math.ceil((deadline - Date.now()) / 1000);
      if (s === last) return;
      last = s;
      if (s > 0 && s <= 5) sfx.count();
      else if (s === 0) sfx.whistle();
    }, 200);
    return () => clearInterval(id);
  }, [deadline]);
}

/**
 * En pantallas grandes (proyectores Full HD o más) la interfaz crece para leerse desde el fondo
 * del salón. El diseño base es de 1440×900; el planeta 3D de fondo no se escala.
 */
function useConsoleZoom(): number {
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const fit = () => setZoom(Math.round(Math.max(1, Math.min(2.2, window.innerWidth / 1440, window.innerHeight / 900)) * 100) / 100);
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return zoom;
}

/* ---------------- fondo 3D ---------------- */

/** Un solo planeta para toda la clase: la cámara viaja al lugar de cada etapa. */
function Backdrop({ view }: { view: HostView }) {
  const m = view.mission ? MISSIONS[view.mission.id] : null;
  const patch =
    view.phase === 'event' && m ? (m.id === 'darkness' ? { dark: true, storm: false } : { storm: true }) : view.phase === 'results' && m ? { newBuilding: m.unlock } : undefined;
  const snapshot = useHostSnapshot(view, patch);
  let focus: string | null = null;
  if (view.party) focus = 'colony.mars01';
  else if (m && ['briefing', 'discovery', 'challenge', 'event'].includes(view.phase)) focus = MISSION_ZONE[m.id];
  else if (m && view.phase === 'results') focus = m.unlock === 'city' ? 'colony.hub' : `site.${m.unlock}`;
  else if (view.phase === 'crews' || view.phase === 'debrief') focus = 'colony.mars01';
  return (
    <div className="hc-world" aria-hidden="true">
      <PlanetView snapshot={snapshot} focus={focus} autoRotate={!focus} />
    </div>
  );
}

/* ---------------- medidores y tripulación ---------------- */

function Ring({ value, color, emoji, label, delta }: { value: number; color: string; emoji: string; label: string; delta: number | null }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={`hc-ring ${v < 30 ? 'is-low' : ''}`} title={`${label}: ${v}%`}>
      <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true">
        <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(43,23,18,.1)" strokeWidth="5" />
        <circle cx="24" cy="24" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} transform="rotate(-90 24 24)" />
      </svg>
      <span className="hc-ring-emoji" aria-hidden="true">
        {emoji}
      </span>
      <b>{v}%</b>
      {delta ? <i className={delta > 0 ? 'up' : 'down'}>{delta > 0 ? `+${delta}` : delta}</i> : null}
      <span className="hc-sr">{label}</span>
    </div>
  );
}

function Hud({ view }: { view: HostView }) {
  const m = view.colony.meters;
  const showDelta = (view.phase === 'results' || view.phase === 'debrief') && view.results;
  const crew = view.crews[0];
  const ids = crew ? crew.memberIds : view.players.map((p) => p.id);
  const byId = new Map(view.players.map((p) => [p.id, p]));
  return (
    <aside className="hc-hud" aria-label="Estado de la colonia">
      <div className="hc-hud-card">
        <p className="hc-hud-sol">
          MARS-01 · <b>Sol {view.colony.sol}</b>
        </p>
        {SYSTEM_ORDER.map((s) => (
          <Ring key={s} value={m[s]} color={SYSTEMS[s].color} emoji={SYSTEMS[s].emoji} label={SYSTEMS[s].name} delta={showDelta ? view.results!.metersAfter[s] - view.results!.metersBefore[s] : null} />
        ))}
      </div>
      {ids.length > 0 && (
        <div className="hc-hud-card hc-hud-crew">
          {ids.map((id) => {
            const p = byId.get(id);
            if (!p) return null;
            const pr = view.progress[id];
            const role = p.roles[0];
            const lit = view.phase === 'discovery' ? pr?.decoded : view.phase === 'challenge' ? pr?.voted : view.phase === 'event' ? (pr?.taps ?? 0) > 0 || pr?.share !== null : false;
            return (
              <span key={id} className={`hc-mate ${lit ? 'is-lit' : ''} ${p.connected || p.isBot ? '' : 'is-off'}`} style={role ? ({ '--c': ROLES[role].color } as CSSProperties) : undefined} title={p.name}>
                <Astronaut avatar={p.avatar} role={role ?? null} size={34} pose="still" />
                <small>{p.name}</small>
              </span>
            );
          })}
        </div>
      )}
    </aside>
  );
}

/* ---------------- IX y Don Rover ---------------- */

const IX_ICON: Record<string, string> = { hint: '💡', adapt: '🧠', info: '🛰️', alert: '🚨' };

function IxLine({ view, onOpen }: { view: HostView; onOpen: () => void }) {
  const last = view.ix[view.ix.length - 1];
  if (!last) return null;
  return (
    <button className={`hc-ix ix-${last.kind}`} onClick={onOpen} title="Ver la bitácora de IX">
      <IXOrb size={30} mood={last.kind === 'alert' ? 'alert' : 'talk'} />
      <span key={last.id}>
        {IX_ICON[last.kind]} {last.text}
      </span>
    </button>
  );
}

function IxDrawer({ view, onClose }: { view: HostView; onClose: () => void }) {
  return (
    <div className="hc-drawer-back" onClick={onClose}>
      <aside className="hc-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Bitácora de IX">
        <header>
          <IXOrb size={46} mood="talk" />
          <div>
            <h3>Bitácora de IX</h3>
            <small>{view.ai.enabled ? `IA: Claude · ${view.ai.model}` : 'IA local con plantillas'}</small>
          </div>
          <button className="hc-icon" onClick={onClose} aria-label="Cerrar">
            <Icon name="x" size={18} />
          </button>
        </header>
        <ul>
          {[...view.ix].reverse().map((m) => (
            <li key={m.id} className={`ix-${m.kind}`}>
              <span aria-hidden="true">{IX_ICON[m.kind]}</span>
              <p>{m.text}</p>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

/** Don Rover en pequeño: su cara y el micrófono. Al tocar la cara se abren todos sus controles. */
function RoverBubble() {
  const voice = useVoice();
  const status = useRoverStatus();
  const [open, setOpen] = useState(false);
  const talk = () => {
    if (voice.listening) stopListening();
    else void listenAndAnswer();
  };
  return (
    <div className={`hc-rover ${voice.speaking ? 'is-speaking' : ''}`}>
      <button className="hc-rover-face" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Don Rover: voz, conexión y preguntas">
        <RoverFace expr={voice.face} mouth={voice.mouth} size={54} linked={status.state === 'on'} pulse={voice.listening ? '#B69CFF' : null} />
      </button>
      <button className={`hc-rover-mic ${voice.listening ? 'is-on' : ''}`} onClick={talk} disabled={voice.thinking} aria-pressed={voice.listening} title="Hazle una pregunta a Don Rover">
        {voice.listening ? '⏹' : voice.thinking ? '…' : '🎙️'}
      </button>
      {open && (
        <div className="hc-rover-pop">
          <RoverPanel compact />
        </div>
      )}
    </div>
  );
}

/* ---------------- consola ---------------- */

export function Console({ view, net, act, onExit }: { view: HostView; net: NetStatus; act: Run; onExit: () => void }) {
  const [toast, setToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [worldOpen, setWorldOpen] = useState(false);
  const [ixOpen, setIxOpen] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoom = useConsoleZoom();
  useWakeLock(true);
  useConsoleSounds(view);
  // Don Rover: narra la misión, responde preguntas y mueve la cara de la placa.
  useRoverNarrator(view);

  const flash = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3600);
  };
  const run: Run = (a) => {
    const r = act(a);
    if (!r.ok && r.error) flash(r.error);
    return r;
  };

  const party = view.party;
  const mission = view.mission ? MISSIONS[view.mission.id] : null;
  const timed = !party && (view.phase === 'discovery' || view.phase === 'challenge' || (view.phase === 'event' && view.event?.stage !== 'done'));
  const paused = party ? party.paused : view.paused;
  const phaseIdx = PHASE_FLOW.indexOf(view.phase);

  let stage = null;
  if (party) stage = <PartyStage party={party} run={run} />;
  else {
    switch (view.phase) {
      case 'lobby':
        stage = <LobbyStage view={view} run={run} />;
        break;
      case 'crews':
        stage = <CrewsStage view={view} />;
        break;
      case 'scan':
        stage = <MissionGenStage view={view} run={run} />;
        break;
      case 'briefing':
        stage = <BriefingStage view={view} />;
        break;
      case 'discovery':
        stage = <DiscoveryStage view={view} />;
        break;
      case 'challenge':
        stage = <ChallengeStage view={view} />;
        break;
      case 'event':
        stage = <EventStage view={view} />;
        break;
      case 'results':
        stage = <ResultsStage view={view} />;
        break;
      case 'debrief':
        stage = <DebriefStage view={view} />;
        break;
    }
  }

  let primary: { label: string; icon?: string; action: HostAction; tone?: 'alert' | 'ix' } | null = null;
  if (party) primary = partyPrimary(party);
  else
    switch (view.phase) {
      case 'lobby':
        primary = { label: 'Formar la tripulación', icon: 'users', action: { type: 'formCrews' } };
        break;
      case 'crews':
        primary = { label: 'Generar la misión', icon: 'spark', action: { type: 'toScan' } };
        break;
      case 'briefing':
        primary = { label: 'Salir a minar', icon: 'arrow', action: { type: 'next' } };
        break;
      case 'discovery':
        primary = { label: 'Ir al reto', icon: 'arrow', action: { type: 'next' } };
        break;
      case 'challenge':
        primary = { label: 'Lanzar la emergencia', icon: 'alert', action: { type: 'next' }, tone: 'alert' };
        break;
      case 'event':
        primary =
          view.event?.stage === 'done'
            ? { label: 'Ver resultados', icon: 'chart', action: { type: 'next' } }
            : view.event?.stage === 'share'
              ? { label: '¡Iniciar acción!', icon: 'bolt', action: { type: 'next' }, tone: 'alert' }
              : view.event?.stage === 'action'
                ? { label: 'Terminar emergencia', icon: 'check', action: { type: 'next' } }
                : { label: 'Siguiente', icon: 'arrow', action: { type: 'next' } };
        break;
      case 'results':
        primary = { label: 'Debrief de IX', icon: 'spark', action: { type: 'next' }, tone: 'ix' };
        break;
      case 'debrief':
        primary = { label: 'Nueva misión', icon: 'refresh', action: { type: 'newMission' } };
        break;
    }

  const humans = view.players.filter((p) => !p.isBot);
  const online = humans.filter((p) => p.connected).length;

  return (
    <div className={`hc phase-${view.phase} ${party ? 'is-party' : ''}`} style={{ '--hc-zoom': zoom } as CSSProperties}>
      <Backdrop view={view} />
      <div className="hc-veil" aria-hidden="true" />

      <header className="hc-top">
        <div className="hc-brand">
          <LogoMark size={38} />
          <div>
            <small>{party ? 'Torneo marciano' : mission ? `Misión ${mission.code}` : view.className}</small>
            <b>{party ? `Ronda ${party.round} de ${party.rounds}` : mission ? mission.titleEs : 'Taller de Don Rover'}</b>
          </div>
        </div>
        {!party && (
          <ol className="hc-phases" aria-label={`Etapa: ${PHASE_LABELS[view.phase]}`}>
            {PHASE_FLOW.map((p, i) => (
              <li key={p} className={i < phaseIdx ? 'is-done' : i === phaseIdx ? 'is-now' : ''}>
                <i />
                {i === phaseIdx && <span>{PHASE_LABELS[p]}</span>}
              </li>
            ))}
          </ol>
        )}
        <div className="hc-top-right">
          {timed && <Countdown deadline={view.deadline} paused={view.paused} pausedRemaining={view.pausedRemaining} total={phaseTotal(view)} size={60} />}
          <div className="hc-code" title={net.detail}>
            <small>Código</small>
            <b className="mono">{view.code}</b>
            <i className={`hc-net is-${net.state}`} aria-label={net.state === 'online' ? 'En línea' : net.state === 'offline' ? 'Sin red' : 'Conectando'} />
          </div>
          {humans.length > 0 && (
            <span className="hc-online" title="Celulares conectados">
              📱 {online}
            </span>
          )}
        </div>
      </header>

      <main className="hc-main">
        <section className="hc-stage" key={party ? `party-${party.stage}` : view.phase}>
          {stage}
        </section>
        {!party && <IxLine view={view} onOpen={() => setIxOpen(true)} />}
        {!party && <Hud view={view} />}
      </main>

      <RoverCaptions />

      <footer className="hc-dock">
        <RoverBubble />
        <div className="hc-tools" role="toolbar" aria-label="Herramientas del profe">
          {view.phase === 'lobby' && !party && (
            <button className="hc-tool" disabled={view.players.length >= view.maxPlayers} onClick={() => run({ type: 'addBots', count: view.maxPlayers - view.players.length })} title="Completar con bots de práctica">
              <Icon name="bot" size={20} />
              <span>Bots</span>
            </button>
          )}
          {view.phase === 'crews' && (
            <button className="hc-tool" onClick={() => run({ type: 'shuffleCrews' })} title="Volver a repartir las especialidades">
              <Icon name="refresh" size={20} />
              <span>Mezclar</span>
            </button>
          )}
          {(timed || (party && party.stage !== 'final')) && (
            <>
              <button className="hc-tool" onClick={() => run({ type: paused ? 'resume' : 'pause' })} title={paused ? 'Reanudar' : 'Pausa'}>
                <Icon name={paused ? 'play' : 'pause'} size={20} />
                <span>{paused ? 'Seguir' : 'Pausa'}</span>
              </button>
              {timed && (
                <button className="hc-tool" onClick={() => run({ type: 'addTime', seconds: 30 })} title="Dar 30 segundos más">
                  <Icon name="plus" size={20} />
                  <span>30 s</span>
                </button>
              )}
            </>
          )}
          {!party && (view.phase === 'discovery' || view.phase === 'challenge' || view.phase === 'event') && (
            <button
              className="hc-tool"
              onClick={() => {
                const r = run({ type: 'hint' });
                if (r.ok) flash('IX envió una pista a los celulares.');
              }}
              title="Pedir una pista a IX"
            >
              <Icon name="bulb" size={20} />
              <span>Pista</span>
            </button>
          )}
          {party && (
            <button className="hc-tool" onClick={() => confirm('¿Terminar el torneo y volver al abordaje?') && run({ type: 'partyEnd' })} title="Terminar el torneo">
              <Icon name="x" size={20} />
              <span>Salir</span>
            </button>
          )}
          {view.phase === 'debrief' && (
            <button className="hc-tool" onClick={() => run({ type: 'toLobby' })} title="Volver al abordaje">
              <Icon name="users" size={20} />
              <span>Abordaje</span>
            </button>
          )}
          <span className="hc-tools-sep" aria-hidden="true" />
          <button className="hc-tool" onClick={() => setWorldOpen(true)} title="Explorar la colonia en 3D con toda la clase">
            <Icon name="map" size={20} />
            <span>3D</span>
          </button>
          {view.crews.length > 0 && (
            <button className="hc-tool" onClick={() => setReportOpen(true)} title="Reporte del profe">
              <Icon name="chart" size={20} />
              <span>Reporte</span>
            </button>
          )}
          <button className="hc-tool" onClick={() => setSettingsOpen(true)} title="Ajustes">
            <Icon name="sliders" size={20} />
          </button>
          <button
            className="hc-tool"
            onClick={() => {
              setMuted(!muted);
              setMutedState(!muted);
              if (muted) setTimeout(() => sfx.pop(), 30);
            }}
            title={muted ? 'Activar sonido' : 'Silenciar'}
            aria-label={muted ? 'Activar sonido' : 'Silenciar'}
          >
            <Icon name={muted ? 'mute' : 'volume'} size={20} />
          </button>
          <button className="hc-tool" onClick={toggleFullscreen} title="Pantalla completa" aria-label="Pantalla completa">
            <Icon name="expand" size={20} />
          </button>
          <button className="hc-tool" onClick={() => confirm('¿Cerrar la sala? La colonia queda guardada en este navegador.') && onExit()} title="Cerrar la sala" aria-label="Cerrar la sala">
            <Icon name="logout" size={20} />
          </button>
        </div>
        {primary && (
          <button
            className={`hc-cta ${primary.tone ? `is-${primary.tone}` : ''}`}
            onClick={() => {
              sfx.select();
              run(primary!.action);
            }}
            disabled={view.phase === 'lobby' && !party && view.players.length === 0}
          >
            {primary.label} {primary.icon && <Icon name={primary.icon} size={20} />}
          </button>
        )}
      </footer>

      {toast && (
        <div className="hc-toast" role="status">
          <IXOrb size={30} mood="talk" />
          <span>{toast}</span>
        </div>
      )}
      {ixOpen && <IxDrawer view={view} onClose={() => setIxOpen(false)} />}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Report open={reportOpen} onClose={() => setReportOpen(false)} view={view} />
      {worldOpen && (
        <Suspense fallback={null}>
          <HostWorld view={view} onClose={() => setWorldOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
