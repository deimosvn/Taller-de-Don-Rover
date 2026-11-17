// El alumno entra a MARS-01 en 3D con su propio astronauta: camina, corre y salta por la
// colonia en primera o tercera persona y ve a sus compañeros moverse en tiempo real.
// Su pose viaja al proyector (unas 6 veces por segundo) y el proyector la reparte a los demás.
//
// Durante la misión aparece una estación con brújula: en la exploración, la de la tarea de su
// especialidad (conectada con las de sus compañeros); en el reto, la del problema de la historia;
// y en la emergencia, la del minijuego de su especialidad.
//
// Los minijuegos solo se abren en la estación: el alumno tiene que caminar hasta ella e
// interactuar. "Ir a la misión" no abre nada: solo enciende la flecha que lo guía.

import { useEffect, useMemo, useState } from 'react';
import { MISSIONS, ROLES } from '../../../shared/content';
import { MINERALS, RECIPES, canCraft, nextMineral } from '../../../shared/crafting';
import { MISSION_PROBLEMS } from '../../../shared/minigames';
import type { PlayerView } from '../../../shared/types';
import type { PlayerNet } from '../../net/playerNet';
import { DEMO_SNAPSHOT, type WorldSnapshot } from '../../world/colony/snapshot';
import { WorldCanvas } from '../../world/react/WorldCanvas';
import { WorldPlay, type WorldBanner } from '../../world/react/WorldPlay';
import type { Bearing, InteractEvent, WorldEngine } from '../../world/WorldEngine';
import { vibrate } from '../../lib/pwa';
import { sfx } from '../../lib/sound';
import { addMineral, bagKey, useBag } from './bag';
import { StoryProblem, problemOpen } from './MissionProblem';
import { TapGame } from './screens';
import { RoleTask } from './RoleTask';

interface Props {
  view: PlayerView;
  net: PlayerNet | null;
  onClose: () => void;
  /** Encender la flecha guía desde el inicio (viene del botón "Ir a la misión" del panel). */
  guide?: boolean;
}

/** A esta distancia (m) de la estación aparece su botón de interactuar (alcance 3.4 del catálogo + radio de la consola). */
const NEAR = 4.4;
/** Si se aleja más que esto con el minijuego abierto, se cierra: hay que estar en la estación. */
const FAR = 14;

/** ¿El juego necesita al alumno en su pantalla de misión? */
function needsYou(v: PlayerView): { text: string; tone: 'alert' | 'info' } | null {
  switch (v.phase) {
    case 'discovery':
      return null;
    case 'challenge':
      return v.challenge && !v.challenge.myVote && !v.challenge.locked ? { text: '🗳️ Tu tripulación necesita tu voto.', tone: 'info' } : null;
    case 'event':
      return { text: '🚨 ¡Emergencia en la colonia! Tu tripulación te necesita.', tone: 'alert' };
    case 'results':
      return { text: '📊 Ya están los resultados de tu tripulación.', tone: 'info' };
    default:
      return null;
  }
}

export default function PlayWorld({ view, net, onClose, guide: guideInit = false }: Props) {
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

  const [panel, setPanel] = useState<'story' | 'twist' | 'task' | null>(null);
  const [bearing, setBearing] = useState<Bearing | null>(null);
  const [guide, setGuide] = useState(guideInit);
  const missionId = view.mission?.id ?? null;
  const prob = missionId ? MISSION_PROBLEMS[missionId] : null;
  const def = missionId ? MISSIONS[missionId] : null;
  const storyOpen = problemOpen(view);
  const action = view.phase === 'event' && view.event?.stage === 'action';
  const solved = (view.problem?.crew ?? 0) >= 1;
  const task = view.phase === 'discovery' ? view.task : null;
  const taskOpen = Boolean(task?.open);
  const active = Boolean(prob && (storyOpen || action)) || taskOpen;
  const taskRole = task ? ROLES[task.role] : null;
  // Minar y fabricar: la receta de su pieza y lo que lleva en la mochila.
  const recipe = task && missionId ? RECIPES[missionId][task.role] : null;
  const key = task && missionId ? bagKey(missionId, task.role) : '';
  const bagState = useBag(key || 'none', task?.points ?? 0, recipe ?? RECIPES.greenhouse.power);
  const bag = key ? bagState.bag : null;
  const crafted = Boolean(key && bagState.crafted);
  const ready = Boolean(recipe && bag && canCraft(recipe, bag));
  const mining = Boolean(taskOpen && task && !task.done && recipe && bag && !crafted && !ready);
  const want = mining && recipe && bag ? nextMineral(recipe, bag) : null;
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 1800);
    return () => clearTimeout(t);
  }, [notice]);
  const [rock, setRock] = useState<Bearing | null>(null);

  // Los depósitos de regolito, hielo y hematita aparecen en el mundo (no se construye nada).
  useEffect(() => {
    engine?.enableOutpost({ afford: () => false, built: () => {}, placing: () => {} });
  }, [engine]);

  // Brújula hacia el depósito más cercano del mineral que falta.
  useEffect(() => {
    if (!engine || !mining || !want) {
      setRock(null);
      return;
    }
    const tick = () => setRock(engine.nearestResource(want));
    tick();
    const id = setInterval(tick, 450);
    return () => clearInterval(id);
  }, [engine, mining, want]);

  const evTitle = view.event?.title ?? 'Emergencia';
  const evVerb = view.event?.action.verb ?? 'Ayuda a la colonia';
  const evEmoji = view.event?.action.emoji ?? '🚨';

  // La estación aparece junto al lugar del problema mientras haya algo que resolver.
  useEffect(() => {
    if (!engine) return;
    if (task && taskRole && taskOpen) {
      engine.setMissionStation({
        anchor: `sector:${task.station}`,
        color: taskRole.color,
        label: `${taskRole.emoji} ${task.title}`,
        prompt: `Tu tarea: ${task.title}`,
        solved: task.done,
      });
      return;
    }
    if (!prob || !def || !active) {
      engine.setMissionStation(null);
      return;
    }
    engine.setMissionStation(
      action
        ? { anchor: prob.station, color: '#FF6B5B', label: `🚨 ${evTitle}`, prompt: `¡Emergencia! ${evVerb}`, solved: false }
        : { anchor: prob.station, color: def.color, label: `${prob.emoji} ${prob.title}`, prompt: `Resolver: ${prob.title}`, solved },
    );
  }, [engine, prob, def, active, action, solved, evTitle, evVerb, task?.station, task?.title, task?.done, taskOpen, taskRole]);

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
    else if (panel === 'task' && !taskOpen) setPanel(null);
  }, [panel, action, taskOpen]);

  // El minijuego es de la estación: si el alumno se aleja, se cierra.
  useEffect(() => {
    if (panel && bearing && bearing.distance > FAR) setPanel(null);
  }, [panel, bearing]);

  // Sin estación activa no hay a dónde guiar.
  useEffect(() => {
    if (!active) setGuide(false);
  }, [active]);

  const onInteract = (ev: InteractEvent) => {
    if (ev.defId.startsWith('resource.')) {
      if (!taskOpen || !recipe || !key) {
        setNotice('Los depósitos se minan durante la exploración de la misión.');
        return true;
      }
      const got = engine?.outpost?.collect(ev.uid);
      if (!got) {
        setNotice('Depósito agotado: vuelve a crecer en un rato. Busca otro.');
        return true;
      }
      sfx.mine();
      setTimeout(() => sfx.pickup(), 140);
      vibrate(18);
      const pts = addMineral(key, recipe, got.res, got.amount);
      if (pts) net?.sendTask(pts);
      const need = recipe.needs[got.res] ?? 0;
      const have = Math.min(need, (bag?.[got.res] ?? 0) + got.amount);
      setNotice(`+${got.amount} ${MINERALS[got.res].emoji} ${MINERALS[got.res].name}${need ? ` · ${have}/${need}` : ' (tu pieza no lo necesita)'}`);
      return true;
    }
    if (ev.defId !== 'prop.station') return false;
    setPanel(action ? 'twist' : taskOpen ? 'task' : storyOpen ? 'story' : null);
    setGuide(false);
    return true;
  };

  const need = needsYou(view);
  const go = () => setGuide(true);
  const bannerKey = action ? 'twist' : taskOpen && task && !task.done ? `task:${task.title}:${crafted}:${ready}` : need ? `need:${need.text}` : storyOpen && !solved && prob ? `story:${prob.title}` : '';
  const banner: WorldBanner | null = useMemo(
    () =>
      action
        ? { text: `🚨 ${evTitle}: ${evEmoji} ${evVerb}`, tone: 'alert', action: 'Ir a la misión', onAction: go }
        : taskOpen && task && !task.done && taskRole && recipe
          ? {
              text: crafted
                ? `${recipe.emoji} Fabricaste ${recipe.item}. Espera a que tu tripulación termine sus piezas.`
                : ready
                  ? `${recipe.emoji} ¡Tienes todo! Ve a tu estación (${task.place}) y fabrica ${recipe.item}.`
                  : `⛏️ Mina los minerales de tu pieza (${recipe.emoji} ${recipe.item}) y luego fabrícala en tu estación.`,
              tone: 'info',
              action: 'Ir a la misión',
              onAction: go,
            }
          : need
          ? { text: need.text, tone: need.tone, action: 'Abrir panel', onAction: onClose }
          : storyOpen && !solved && prob
            ? { text: `${prob.emoji} ${prob.title}: camina a la estación (${prob.place}) e interactúa con ella.`, tone: 'info', action: 'Ir a la misión', onAction: go }
            : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bannerKey],
  );

  const near = Boolean(bearing && bearing.distance <= NEAR);
  const target = taskOpen && task && taskRole
    ? { label: `${taskRole.emoji} ${task.title}`, place: task.place, badge: task.done ? '✅' : `${Math.round(task.progress * 100)}%` }
    : active && prob
      ? { label: action ? `${evEmoji} ${evVerb}` : `${prob.emoji} ${prob.title}`, place: prob.place, badge: action ? null : solved ? '✅' : `${Math.round((view.problem?.crew ?? 0) * 100)}%` }
      : null;

  const objective = target ? (
    <>
      <div className="wp-quest">
        <span>{mining && want && recipe && bag ? `⛏️ ${MINERALS[want].emoji} ${MINERALS[want].name} ${Math.min(bag[want], recipe.needs[want] ?? 0)}/${recipe.needs[want]}` : target.label}</span>
        {mining && rock ? <b>{Math.round(rock.distance)} m</b> : target.badge && <b>{target.badge}</b>}
      </div>
      <button className={`wp-go ${guide ? 'on' : ''}`} onClick={() => setGuide((g) => !g)} aria-pressed={guide}>
        🧭 {guide ? 'Ocultar flecha' : 'Ir a la misión'}
      </button>
    </>
  ) : null;

  // Flecha guía: mientras falten minerales apunta al depósito más cercano (también si el alumno
  // está junto a su estación: primero hay que minar); después, a la estación.
  const rockNear = Boolean(mining && rock && rock.distance <= 4.2);
  const arrow =
    mining && want && rock && (guide || rockNear || near) ? (
      <div className={`wp-guide ${rockNear ? 'arrived' : ''}`} role="status" aria-live="polite">
        {rockNear ? (
          <>
            <span className="wp-guide-pin" aria-hidden="true">
              ⛏️
            </span>
            <b>Llegaste al depósito</b>
            <small>Interactúa con la roca ({'E'} o toca el botón) para minar.</small>
          </>
        ) : (
          <>
            <span className="wp-guide-arrow" aria-hidden="true" style={{ transform: `rotate(${rock.angle - Math.PI / 2}rad)` }}>
              ➜
            </span>
            <b>{Math.round(rock.distance)} m</b>
            <small>
              {near ? 'Primero a minar: ' : ''}
              {MINERALS[want].emoji} {MINERALS[want].name} más cercano
            </small>
          </>
        )}
      </div>
    ) : target && bearing && (guide || near) ? (
      <div className={`wp-guide ${near ? 'arrived' : ''}`} role="status" aria-live="polite">
        {near ? (
          <>
            <span className="wp-guide-pin" aria-hidden="true">📍</span>
            <b>Llegaste a la estación</b>
            <small>Interactúa con ella ({'E'} o toca el botón) para empezar.</small>
          </>
        ) : (
          <>
            <span className="wp-guide-arrow" aria-hidden="true" style={{ transform: `rotate(${bearing.angle - Math.PI / 2}rad)` }}>
              ➜
            </span>
            <b>{Math.round(bearing.distance)} m</b>
            <small>Ve a {target.place}</small>
          </>
        )}
      </div>
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
        <WorldPlay engine={engine} snapshot={world} onExit={onClose} exitLabel="Panel de misión" banner={banner} objective={objective} onInteract={onInteract} notice={notice}>
          {!panel && arrow}
          {panel === 'task' && taskOpen && (
            <section className="wp-panel wp-problem" role="dialog" aria-label="Tu tarea">
              <header>
                <h3>{taskRole ? `${taskRole.emoji} Estación de ${taskRole.specialty}` : 'Tu tarea'}</h3>
                <button className="wp-close" onClick={() => setPanel(null)} aria-label="Cerrar">
                  ✕
                </button>
              </header>
              <RoleTask view={view} net={net} playable />
            </section>
          )}
          {panel && panel !== 'task' && (panel === 'story' || action) && (
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
