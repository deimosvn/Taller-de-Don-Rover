// Pantalla del proyector: barra superior, escenario de la etapa, estado global del planeta,
// bitácora de IX, tripulaciones y el panel de control del profesor.

import { Suspense, lazy, useEffect, useRef, useState, type CSSProperties } from 'react';
import { MISSIONS, PACES, ROLES, ROLE_ORDER, SECTORS, SYSTEM_ORDER } from '../../../shared/content';
import type { Ack, HostAction, HostView } from '../../../shared/types';
import { Astronaut, IXOrb, MissionPatch } from '../../components/art';
import { Countdown, Icon, Logo, PhaseStepper, SystemMeter } from '../../components/ui';
import { isMuted, setMuted, sfx } from '../../lib/sound';
import { toggleFullscreen, useWakeLock } from '../../lib/pwa';
import type { NetStatus } from '../../net/hostNet';
import { Report } from './Report';
import { Scanner } from './Scanner';
import { SettingsModal } from './SettingsModal';
import { useRoverNarrator } from '../../rover/narrator';
import { RoverCaptions, RoverPanel } from '../../rover/RoverPanel';

/** La colonia en 3D en el proyector (three.js se descarga solo al abrirla). */
const HostWorld = lazy(() => import('./HostWorld'));
import { BriefingStage, ChallengeStage, CrewsStage, DebriefStage, DiscoveryStage, EventStage, LobbyStage, ResultsStage } from './stages';

export type Run = (a: HostAction) => Ack;

function phaseTotal(v: HostView): number {
  const p = PACES[v.pace];
  if (v.phase === 'discovery') return p.discovery;
  if (v.phase === 'challenge') return p.challenge;
  if (v.phase === 'event' && v.event) return v.event.stage === 'alert' ? 6 : v.event.stage === 'share' ? p.share : p.action;
  return 60;
}

function usePhaseSounds(v: HostView) {
  const prev = useRef({ phase: v.phase, stage: v.event?.stage, players: v.players.length, locked: 0 });
  useEffect(() => {
    const p = prev.current;
    const locked = v.crews.filter((c) => c.status.locked).length;
    if (p.phase !== v.phase) {
      if (v.phase === 'briefing') sfx.unlock();
      else if (v.phase === 'discovery' || v.phase === 'challenge') sfx.whoosh();
      else if (v.phase === 'results') (v.results?.saved ? sfx.success : sfx.fail)();
      else if (v.phase === 'crews') sfx.join();
    }
    if (v.phase === 'event' && p.stage !== v.event?.stage) {
      if (v.event?.stage === 'alert') sfx.alarm();
      else if (v.event?.stage === 'action') sfx.pop();
      else if (v.event?.stage === 'done') (v.event.saved ? sfx.success : sfx.fail)();
    }
    if (v.players.length > p.players) sfx.pop();
    if (locked > p.locked) sfx.lock();
    prev.current = { phase: v.phase, stage: v.event?.stage, players: v.players.length, locked };
  }, [v]);
}

function NetBadge({ net, view }: { net: NetStatus; view: HostView }) {
  const color = net.state === 'online' ? 'var(--food)' : net.state === 'offline' ? 'var(--habitat)' : 'var(--energy)';
  const humans = view.players.filter((p) => !p.isBot);
  return (
    <div className="net-badge" title={net.detail}>
      <span className="dot" style={{ '--c': color } as CSSProperties} />
      <span>
        <b>{humans.filter((p) => p.connected).length}</b>
        <small>{net.state === 'online' ? 'en línea' : net.state === 'offline' ? 'sin red' : 'conectando'}</small>
      </span>
    </div>
  );
}

function StatusPanel({ view }: { view: HostView }) {
  const m = view.colony.meters;
  const showDelta = (view.phase === 'results' || view.phase === 'debrief') && view.results;
  const min = Math.min(...SYSTEM_ORDER.map((s) => m[s]));
  const status = min >= 50 ? ['ok', 'Colonia operativa'] : min >= 30 ? ['warn', 'Colonia en alerta'] : ['bad', 'Colonia en riesgo'];
  return (
    <div className="status panel">
      <div className="status-head">
        <div>
          <p className="eyebrow">Estado del planeta</p>
          <h3>MARS-01</h3>
        </div>
        <span className="chip">Sol {view.colony.sol}</span>
      </div>
      <div className="status-meters">
        {SYSTEM_ORDER.map((s) => (
          <SystemMeter key={s} system={s} value={m[s]} delta={showDelta ? view.results!.metersAfter[s] - view.results!.metersBefore[s] : null} />
        ))}
      </div>
      <div className={`status-line ${status[0]}`}>
        <span className="dot" /> {status[1]}
      </div>
    </div>
  );
}

const IX_ICON: Record<string, string> = { hint: '💡', adapt: '🧠', info: '🛰️', alert: '🚨' };

function IxFeed({ view }: { view: HostView }) {
  const items = view.ix.slice(-6).reverse();
  return (
    <div className="ixfeed panel">
      <div className="ixfeed-head">
        <IXOrb size={44} mood={view.phase === 'event' ? 'alert' : 'idle'} />
        <div>
          <p className="eyebrow">Bitácora de IX</p>
          <small className={`chip ${view.ai.enabled ? 'ok' : 'ix'}`}>{view.ai.enabled ? `Claude · ${view.ai.model}` : 'IA local + plantillas'}</small>
        </div>
      </div>
      <ul>
        {items.map((m) => (
          <li key={m.id} className={`ix-${m.kind}`}>
            <span aria-hidden="true">{IX_ICON[m.kind]}</span>
            <p>{m.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CrewStrip({ view }: { view: HostView }) {
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const target = Math.round(PACES[view.pace].action * 1.6);
  return (
    <div className="crewstrip" aria-label="Tripulación">
      {view.crews.map((c) => {
        const s = c.status;
        let status = '';
        if (view.phase === 'discovery') status = `${s.decoded}/${s.members} tareas listas`;
        else if (view.phase === 'challenge') status = s.locked ? '🔒 Decisión tomada' : s.tie ? '⚖️ Empate' : `${s.voted}/${s.members} votos`;
        else if (view.phase === 'event') status = view.event?.stage === 'share' ? `${s.shareVotes}/${s.members} votaron` : `${Math.round(s.action * 100)}% de acción`;
        else if (c.outcome) status = `${c.outcome.scores.total} pts`;
        return (
          <div key={c.id} className={`crew-mini ${s.locked && view.phase === 'challenge' ? 'is-locked' : ''} ${c.outcome ? `tier-${c.outcome.tier}` : ''}`}>
            <div className="crew-mini-head">
              <b>{c.name}</b>
              <span>{SECTORS[c.sectorId].emoji}</span>
            </div>
            <div className="crew-mini-avatars">
              {c.memberIds.slice(0, 5).map((id) => {
                const p = byId.get(id);
                if (!p) return null;
                const pr = view.progress[id];
                const lit =
                  view.phase === 'discovery' ? pr?.decoded : view.phase === 'challenge' ? pr?.voted : view.phase === 'event' ? (pr?.taps ?? 0) > 0 || pr?.share !== null : true;
                return (
                  <span key={id} className={`mini-av ${lit ? 'lit' : ''} ${p.connected ? '' : 'off'}`} title={p.name}>
                    <Astronaut avatar={p.avatar} role={p.roles[0]} size={30} pose="still" />
                    <small>{p.name}</small>
                  </span>
                );
              })}
            </div>
            {view.phase === 'event' && view.event?.stage !== 'share' ? (
              <div className="mini-bars">
                {ROLE_ORDER.filter((r) => s.rolesPresent.includes(r)).map((r) => (
                  <i key={r} style={{ '--c': ROLES[r].color, '--w': `${Math.min(100, (s.taps[r] / target) * 100)}%` } as CSSProperties} />
                ))}
              </div>
            ) : (
              <small className="crew-mini-status">{status || `${s.members} tripulantes`}</small>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Console({ view, net, act, onExit }: { view: HostView; net: NetStatus; act: Run; onExit: () => void }) {
  const [toast, setToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [worldOpen, setWorldOpen] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useWakeLock(true);
  usePhaseSounds(view);
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

  const mission = view.mission ? MISSIONS[view.mission.id] : null;
  const timed = view.phase === 'discovery' || view.phase === 'challenge' || (view.phase === 'event' && view.event?.stage !== 'done');
  const humans = view.players.filter((p) => !p.isBot).length;

  let stage = null;
  switch (view.phase) {
    case 'lobby':
      stage = <LobbyStage view={view} run={run} />;
      break;
    case 'crews':
      stage = <CrewsStage view={view} />;
      break;
    case 'scan':
      stage = <Scanner view={view} run={run} flash={flash} />;
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

  let primary: { label: string; icon?: string; action: HostAction; cls?: string } | null = null;
  switch (view.phase) {
    case 'lobby':
      primary = { label: 'Formar la tripulación', icon: 'users', action: { type: 'formCrews' } };
      break;
    case 'crews':
      primary = { label: 'Generar la misión', icon: 'spark', action: { type: 'toScan' } };
      break;
    case 'briefing':
      primary = { label: 'Empezar exploración', icon: 'arrow', action: { type: 'next' } };
      break;
    case 'discovery':
      primary = { label: 'Ir al reto', icon: 'arrow', action: { type: 'next' } };
      break;
    case 'challenge':
      primary = { label: 'Lanzar evento global', icon: 'alert', action: { type: 'next' }, cls: 'coral' };
      break;
    case 'event':
      primary =
        view.event?.stage === 'done'
          ? { label: 'Ver resultados', icon: 'chart', action: { type: 'next' } }
          : view.event?.stage === 'share'
            ? { label: '¡Iniciar acción!', icon: 'bolt', action: { type: 'next' }, cls: 'coral' }
            : view.event?.stage === 'action'
              ? { label: 'Terminar evento', icon: 'check', action: { type: 'next' } }
              : { label: 'Siguiente', icon: 'arrow', action: { type: 'next' } };
      break;
    case 'results':
      primary = { label: 'Debrief de IX', icon: 'spark', action: { type: 'next' }, cls: 'ix' };
      break;
    case 'debrief':
      primary = { label: 'Nueva misión', icon: 'refresh', action: { type: 'newMission' } };
      break;
  }

  return (
    <div className={`console space-bg phase-${view.phase}`}>
      <div className="starfield" />
      <header className="console-top">
        <Logo size="sm" sub={false} />
        {mission ? (
          <div className="mission-chip">
            <MissionPatch id={mission.id} size={46} />
            <div>
              <span className="eyebrow">{mission.code}</span>
              <b>{mission.title}</b>
            </div>
          </div>
        ) : (
          <div className="mission-chip">
            <div>
              <span className="eyebrow">Colonia</span>
              <b>{view.className}</b>
            </div>
          </div>
        )}
        <div className="top-stepper">
          <PhaseStepper phase={view.phase} />
        </div>
        <div className="top-right">
          {timed && <Countdown deadline={view.deadline} paused={view.paused} pausedRemaining={view.pausedRemaining} total={phaseTotal(view)} size={68} />}
          <div className="room-code">
            <span className="eyebrow">Código</span>
            <b className="mono">{view.code}</b>
          </div>
          <NetBadge net={net} view={view} />
        </div>
      </header>

      <main className="console-main">
        <section className="stage" key={view.phase}>
          {stage}
        </section>
        <aside className="rail">
          <RoverPanel />
          <StatusPanel view={view} />
          {view.crews.length > 0 && view.phase !== 'lobby' && <CrewStrip view={view} />}
          <IxFeed view={view} />
        </aside>
      </main>

      <RoverCaptions />
      <footer className="dock">
        <div className="dock-left">
          {view.phase === 'lobby' && (
            <>
              <button className="btn small ghost" disabled={view.players.length >= view.maxPlayers} onClick={() => run({ type: 'addBots', count: view.maxPlayers - view.players.length })}>
                <Icon name="bot" size={18} /> Completar con bots
              </button>
              <span className="dock-note">
                {view.players.length}/{view.maxPlayers} tripulantes · {humans ? `${humans} alumno${humans > 1 ? 's' : ''}` : 'si entra un alumno, un bot le cede su lugar'}
              </span>
            </>
          )}
          {view.phase === 'crews' && (
            <button className="btn small ghost" onClick={() => run({ type: 'shuffleCrews' })}>
              <Icon name="refresh" size={18} /> Re-mezclar
            </button>
          )}
          {timed && (
            <>
              <button className="btn small ghost" onClick={() => run({ type: view.paused ? 'resume' : 'pause' })}>
                <Icon name={view.paused ? 'play' : 'pause'} size={18} /> {view.paused ? 'Reanudar' : 'Pausa'}
              </button>
              <button className="btn small ghost" onClick={() => run({ type: 'addTime', seconds: 30 })}>
                <Icon name="plus" size={18} /> 30 s
              </button>
            </>
          )}
          {(view.phase === 'discovery' || view.phase === 'challenge' || view.phase === 'event') && (
            <button
              className="btn small ghost"
              onClick={() => {
                const r = run({ type: 'hint' });
                if (r.ok) flash('IX envió una pista a los celulares.');
              }}
            >
              <Icon name="bulb" size={18} /> Pista de IX
            </button>
          )}
          {view.phase === 'debrief' && (
            <button className="btn small ghost" onClick={() => run({ type: 'toLobby' })}>
              <Icon name="users" size={18} /> Nuevas tripulaciones
            </button>
          )}
        </div>
        <div className="dock-right">
          <button className="btn small cream world-open" onClick={() => setWorldOpen(true)} title="Ver la colonia en 3D con toda la clase">
            🌍 Colonia 3D
          </button>
          {(view.phase === 'results' || view.phase === 'debrief' || view.crews.length > 0) && (
            <button className="icon-btn" onClick={() => setReportOpen(true)} aria-label="Reporte del profesor" title="Reporte del profesor">
              <Icon name="chart" />
            </button>
          )}
          <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Ajustes" title="Ajustes">
            <Icon name="sliders" />
          </button>
          <button
            className="icon-btn"
            onClick={() => {
              setMuted(!muted);
              setMutedState(!muted);
            }}
            aria-label={muted ? 'Activar sonido' : 'Silenciar'}
            title={muted ? 'Activar sonido' : 'Silenciar'}
          >
            <Icon name={muted ? 'mute' : 'volume'} />
          </button>
          <button className="icon-btn" onClick={toggleFullscreen} aria-label="Pantalla completa" title="Pantalla completa">
            <Icon name="expand" />
          </button>
          <button
            className="icon-btn"
            onClick={() => confirm('¿Cerrar la sala? La colonia queda guardada en este navegador.') && onExit()}
            aria-label="Cerrar sala"
            title="Cerrar sala"
          >
            <Icon name="logout" />
          </button>
          {primary && (
            <button className={`btn big ${primary.cls ?? 'food'}`} onClick={() => run(primary!.action)} disabled={view.phase === 'lobby' && view.players.length === 0}>
              {primary.label} {primary.icon && <Icon name={primary.icon} />}
            </button>
          )}
        </div>
      </footer>

      {toast && (
        <div className="toast card" role="status">
          <IXOrb size={36} mood="talk" />
          <span>{toast}</span>
        </div>
      )}
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
