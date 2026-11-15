// Tarea de la especialidad del alumno durante la exploración: la hace en su estación del
// mundo 3D (o desde esta tarjeta). Está conectada con las de sus compañeros —el escudo
// protege los paneles, la energía mueve las bombas, el agua llega a los cultivos y la comida
// da fuerza al escudo— y al terminarla recibe su transmisión secreta.

import { useEffect, useRef, type CSSProperties } from 'react';
import { ROLES } from '../../../shared/content';
import { taskSpec } from '../../../shared/roleTasks';
import type { PlayerView } from '../../../shared/types';
import type { PlayerNet } from '../../net/playerNet';
import { Minigame } from './minigames';

/** Junta los puntos del minijuego y los manda al proyector cada poco. */
function useTaskSender(net: PlayerNet | null) {
  const pending = useRef(0);
  useEffect(() => {
    const id = setInterval(() => {
      if (pending.current > 0 && net) {
        net.sendTask(pending.current);
        pending.current = 0;
      }
    }, 450);
    return () => {
      clearInterval(id);
      if (pending.current > 0 && net) net.sendTask(pending.current);
      pending.current = 0;
    };
  }, [net]);
  return (n: number) => {
    pending.current += n;
  };
}

/** Avance de las cuatro tareas, en el orden en que dependen unas de otras. */
export function TaskChain({ view }: { view: PlayerView }) {
  const t = view.task;
  if (!t) return null;
  const order = ['habitat', 'power', 'life', 'bio'] as const;
  return (
    <ol className="task-chain-m" aria-label="Tareas de la tripulación">
      {order
        .map((r) => t.crew.find((c) => c.role === r))
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .map((c) => {
          const v = Math.round(c.progress * 100);
          return (
            <li key={c.role} className={c.role === t.role ? 'mine' : ''} style={{ '--c': ROLES[c.role].color } as CSSProperties}>
              <span>
                {ROLES[c.role].emoji} {c.role === t.role ? 'Tú' : c.name}
              </span>
              <i>
                <b style={{ width: `${v}%` }} />
              </i>
              <small className="mono">{v >= 100 ? '✓' : `${v}%`}</small>
            </li>
          );
        })}
    </ol>
  );
}

/** Botón que lleva al mundo 3D con la flecha hacia la estación (no abre el minijuego). */
export function GoToStation({ place, onGo }: { place: string; onGo: () => void }) {
  return (
    <div className="go-station">
      <p>
        📍 El minijuego está en la estación de <b>{place}</b>. Camina hasta ella en Marte e interactúa para empezar.
      </p>
      <button className="btn mars block" onClick={onGo}>
        🧭 Ir a la misión
      </button>
    </div>
  );
}

/**
 * La tarea con su minijuego. El minijuego solo se juega en la estación del mundo 3D
 * (`playable`); en el panel de misión aparece el botón que guía hasta ella. Si el
 * dispositivo no puede mostrar 3D (`onGo` ausente), se juega aquí mismo.
 */
export function RoleTask({ view, net, playable = false, onGo }: { view: PlayerView; net: PlayerNet | null; playable?: boolean; onGo?: () => void }) {
  const send = useTaskSender(net);
  const t = view.task;
  if (!t || !view.mission) return null;
  const r = ROLES[t.role];
  const pct = Math.round(t.progress * 100);
  const capped = t.link?.kind === 'limit' && t.points >= t.goal * (t.link.progress + 0.25) && !t.done;
  return (
    <div className="role-task" style={{ '--c': r.color, '--cd': r.dark } as CSSProperties}>
      <div className="role-task-head">
        <span className="role-task-emoji">{r.emoji}</span>
        <div>
          <p className="role-task-kicker">Tu tarea · {r.es}</p>
          <h3>{t.title}</h3>
        </div>
      </div>
      <p className="role-task-text">{t.text}</p>
      {t.facts.length > 0 && (
        <ul className="role-task-facts">
          {t.facts.map((f) => (
            <li key={f}>🛰️ {f}</li>
          ))}
        </ul>
      )}
      {t.link && (
        <p className={`role-task-link ${capped ? 'waiting' : ''}`}>
          🔗 {t.link.text} <b>{ROLES[t.link.from].emoji} {t.link.name}: {Math.round(t.link.progress * 100)}%</b>
          {capped && <em> Espera a que avance para seguir sumando.</em>}
        </p>
      )}
      {t.feeds.length > 0 && <p className="role-task-feeds">➡️ Tu avance ayuda a {t.feeds.map((f) => `${ROLES[f.role].emoji} ${f.name}`).join(' y ')}.</p>}
      <div className="problem-bar" role="progressbar" aria-label="Avance de tu tarea" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${pct}%` }} />
      </div>
      <TaskChain view={view} />
      {t.done ? (
        <p className="role-task-done">✅ ¡Tarea completa! Ya tienes tu transmisión secreta: compártela con tu tripulación.</p>
      ) : t.open && !playable && onGo ? (
        <GoToStation place={t.place} onGo={onGo} />
      ) : t.open ? (
        <Minigame key={`${view.mission.id}:${t.role}`} spec={taskSpec(view.mission.id, t.role)} color={r.color} dark={r.dark} onPoints={send} />
      ) : (
        <p className="problem-closed">La exploración terminó: lo que avanzó tu tripulación ya cuenta.</p>
      )}
    </div>
  );
}
