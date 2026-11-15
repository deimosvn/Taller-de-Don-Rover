// El alumno entra a MARS-01 en 3D con su propio astronauta: camina, corre y salta por la
// colonia en primera o tercera persona y ve a sus compañeros moverse en tiempo real.
// Su pose viaja al proyector (unas 6 veces por segundo) y el proyector la reparte a los demás.
//
// Durante la misión aparece una estación junto al lugar del problema: ahí la tripulación lo
// resuelve con un minijuego (y en la emergencia, con el minijuego de su especialidad).

import { useEffect, useMemo, useState } from 'react';
import { MISSIONS } from '../../../shared/content';
import { MISSION_PROBLEMS } from '../../../shared/minigames';
import type { PlayerView } from '../../../shared/types';
import type { PlayerNet } from '../../net/playerNet';
import { DEMO_SNAPSHOT, type WorldSnapshot } from '../../world/colony/snapshot';
import { WorldCanvas } from '../../world/react/WorldCanvas';
import { WorldPlay, type WorldBanner } from '../../world/react/WorldPlay';
import type { Bearing, InteractEvent, WorldEngine } from '../../world/WorldEngine';
import { StoryProblem, problemOpen } from './MissionProblem';
import { TapGame } from './screens';

interface Props {
  view: PlayerView;
  net: PlayerNet | null;
  onClose: () => void;
}

/** ¿El juego necesita al alumno en su pantalla de misión? */
function needsYou(v: PlayerView): { text: string; tone: 'alert' | 'info' } | null {
  if (v.objectVote?.open && !v.objectVote.myVote) return { text: '🗳️ IX pregunta qué objeto escanear: ¡vota!', tone: 'info' };
  switch (v.phase) {
    case 'discovery':
      return v.quiz && !v.quiz.answered ? { text: '🔐 Llegó tu transmisión secreta: descífrala.', tone: 'info' } : null;
    case 'challenge':
      if (v.quiz && !v.quiz.answered) return { text: '🔐 Descifra tu transmisión antes de votar.', tone: 'info' };
      if (v.bonus && !v.bonus.answered) return { text: '🛰️ ¡Pregunta bonus de la NASA!', tone: 'info' };
      return v.challenge && !v.challenge.myVote && !v.challenge.locked ? { text: '🗳️ Tu tripulación necesita tu voto.', tone: 'info' } : null;
    case 'event':
      return { text: '🚨 ¡Emergencia en la colonia! Tu tripulación te necesita.', tone: 'alert' };
    case 'results':
      return { text: '📊 Ya están los resultados de tu tripulación.', tone: 'info' };
    default:
      return null;
  }
}

export default function PlayWorld({ view, net, onClose }: Props) {
  const [engine, setEngine] = useState<WorldEngine | null>(null);
  const [world, setWorld] = useState<WorldSnapshot | null>(() => net?.world ?? null);
  const snapshot = world ?? DEMO_SNAPSHOT;

  // Estado de la colonia y poses de los compañeros que llegan del proyector.
  useEffect(() => {
    if (!net) return;
    net.onWorld = (w) => setWorld(w);
    if (net.world) setWorld(net.world);
    return () => {
      net.onWorld = null;
    };
  }, [net]);
  useEffect(() => {
    if (!net || !engine) return;
    net.onPeers = (p) => engine.setPresence(p);
    return () => {
      net.onPeers = null;
    };
  }, [net, engine]);

  // El astronauta entra al mundo en cuanto el motor está listo.
  const me = view.me;
  useEffect(() => {
    if (!engine) return;
    engine.enterPlayer({ id: me.id, name: me.name, avatar: me.avatar, role: me.roles[0] ?? null }, 'third');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  // Mandar la pose (solo cuando cambia; y cada 3 s para seguir "presente").
  useEffect(() => {
    if (!net || !engine) return;
    let last = '';
    const send = (force: boolean) => {
      const pose = engine.playerPose();
      if (!pose) return;
      const key = pose.join(',');
      if (!force && key === last) return;
      last = key;
      net.sendPose(pose);
    };
    const fast = setInterval(() => send(false), 160);
    const keep = setInterval(() => send(true), 3000);
    return () => {
      clearInterval(fast);
      clearInterval(keep);
      net.sendPose(null);
    };
  }, [net, engine]);

  /* ---------------- problema de la misión ---------------- */

  const [panel, setPanel] = useState<'story' | 'twist' | null>(null);
  const [bearing, setBearing] = useState<Bearing | null>(null);
  const missionId = view.mission?.id ?? null;
  const prob = missionId ? MISSION_PROBLEMS[missionId] : null;
  const def = missionId ? MISSIONS[missionId] : null;
  const storyOpen = problemOpen(view);
  const action = view.phase === 'event' && view.event?.stage === 'action';
  const solved = (view.problem?.crew ?? 0) >= 1;
  const active = Boolean(prob && (storyOpen || action));
  const evTitle = view.event?.title ?? 'Emergencia';
  const evVerb = view.event?.action.verb ?? 'Ayuda a la colonia';
  const evEmoji = view.event?.action.emoji ?? '🚨';

  // La estación aparece junto al lugar del problema mientras haya algo que resolver.
  useEffect(() => {
    if (!engine) return;
    if (!prob || !def || !active) {
      engine.setMissionStation(null);
      return;
    }
    engine.setMissionStation(
      action
        ? { anchor: prob.station, color: '#FF6B5B', label: `🚨 ${evTitle}`, prompt: `¡Emergencia! ${evVerb}`, solved: false }
        : { anchor: prob.station, color: def.color, label: `${prob.emoji} ${prob.title}`, prompt: `Resolver: ${prob.title}`, solved },
    );
  }, [engine, prob, def, active, action, solved, evTitle, evVerb]);

  // Brújula hacia la estación.
  useEffect(() => {
    if (!engine || !active) {
      setBearing(null);
      return;
    }
    const id = setInterval(() => setBearing(engine.stationBearing()), 400);
    return () => clearInterval(id);
  }, [engine, active]);

  // Al empezar la emergencia, la estación abierta pasa a su minijuego; se cierra sola al terminar.
  useEffect(() => {
    if (panel === 'story' && action) setPanel('twist');
    else if (panel === 'twist' && !action) setPanel(null);
  }, [panel, action]);

  const onInteract = (ev: InteractEvent) => {
    if (ev.defId !== 'prop.station') return false;
    setPanel(action ? 'twist' : storyOpen ? 'story' : null);
    return true;
  };

  const need = needsYou(view);
  const bannerKey = action ? 'twist' : need ? `need:${need.text}` : storyOpen && !solved && prob ? `story:${prob.title}` : '';
  const banner: WorldBanner | null = useMemo(
    () =>
      action
        ? { text: `🚨 ${evTitle}: ${evEmoji} ${evVerb}`, tone: 'alert', action: 'Resolver', onAction: () => setPanel('twist') }
        : need
          ? { text: need.text, tone: need.tone, action: 'Ir a la misión', onAction: onClose }
          : storyOpen && !solved && prob
            ? { text: `${prob.emoji} ${prob.title}: ve a la estación (${prob.place}) o resuélvelo desde aquí.`, tone: 'info', action: 'Resolver', onAction: () => setPanel('story') }
            : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bannerKey],
  );

  const objective =
    active && prob ? (
      <>
        <button className="wp-quest" onClick={() => setPanel(action ? 'twist' : 'story')}>
          <span>{action ? `${evEmoji} ${evVerb}` : `${prob.emoji} ${prob.title}`}</span>
          {!action && <b>{solved ? '✅' : `${Math.round((view.problem?.crew ?? 0) * 100)}%`}</b>}
        </button>
        {bearing && (
          <p className="wp-compass" title="Estación del problema">
            {bearing.distance > 5 ? (
              <>
                <i style={{ transform: `rotate(${bearing.angle}rad)` }}>↑</i>
                Estación en {prob.place} · {Math.round(bearing.distance)} m
              </>
            ) : (
              <>📍 Llegaste a la estación</>
            )}
          </p>
        )}
      </>
    ) : null;

  return (
    <div className="world-overlay">
      <WorldCanvas
        snapshot={snapshot}
        keyboard
        onEngine={(e) => {
          setEngine(e);
          // Solo en desarrollo: acceso al motor desde la consola para depurar.
          if (import.meta.env.DEV) (window as unknown as { __world?: unknown }).__world = e;
        }}
      >
        <WorldPlay engine={engine} snapshot={world} onExit={onClose} exitLabel="Volver" banner={banner} objective={objective} onInteract={onInteract}>
          {panel && (panel === 'story' || action) && (
            <section className="wp-panel wp-problem" role="dialog" aria-label={panel === 'story' ? 'Problema de la misión' : 'Emergencia'}>
              <header>
                <h3>{panel === 'story' ? `${prob?.emoji ?? '🔧'} Estación de la misión` : `🚨 ${evTitle}`}</h3>
                <button className="wp-close" onClick={() => setPanel(null)} aria-label="Cerrar">
                  ✕
                </button>
              </header>
              {panel === 'story' ? <StoryProblem view={view} net={net} /> : <TapGame view={view} net={net} />}
            </section>
          )}
        </WorldPlay>
      </WorldCanvas>
    </div>
  );
}
