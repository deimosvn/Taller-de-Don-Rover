// Tarea de la especialidad del alumno durante la exploración: la hace en su estación del
// mundo 3D (o desde esta tarjeta). Está conectada con las de sus compañeros —el escudo
// protege los paneles, la energía mueve las bombas, el agua llega a los cultivos y la comida
// da fuerza al escudo— y al terminarla recibe su transmisión secreta.

import type { CSSProperties } from 'react';
import { ROLES } from '../../../shared/content';
import type { PlayerView } from '../../../shared/types';
import type { PlayerNet } from '../../net/playerNet';
import { CraftPanel } from './CraftTask';

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

/** Botón que lleva al mundo 3D, donde están las rocas para minar y la estación para fabricar. */
export function GoToStation({ place, onGo }: { place: string; onGo: () => void }) {
  return (
    <div className="go-station">
      <p>
        ⛏️ Las rocas para minar y tu estación (<b>{place}</b>) están en Marte. Camina hasta ellas e interactúa.
      </p>
      <button className="btn mars block" onClick={onGo}>
        🧭 Ir a Marte 3D
      </button>
    </div>
  );
}

/**
 * La tarea de la exploración: minar los minerales que pide la receta y fabricar la pieza en
 * la estación del mundo 3D (`playable`). Fuera de la estación se ve cuánto falta y el botón
 * que guía hasta Marte. Si el dispositivo no puede mostrar 3D (`onGo` ausente), se mina y se
 * fabrica aquí mismo.
 */
export function RoleTask({ view, net, playable = false, onGo }: { view: PlayerView; net: PlayerNet | null; playable?: boolean; onGo?: () => void }) {
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
          <p className="role-task-kicker">Tu misión · {r.es}</p>
          <h3>{t.title}</h3>
        </div>
      </div>
      <p className="role-task-text">{t.text}</p>
      {t.done ? (
        <p className="role-task-done">✅ ¡Tu pieza ya funciona! Recibiste tu transmisión secreta: compártela con tu tripulación.</p>
      ) : t.open ? (
        <>
          <CraftPanel view={view} net={net} atStation={playable || !onGo} mineHere={!onGo && !playable} />
          {!playable && onGo && <GoToStation place={t.place} onGo={onGo} />}
        </>
      ) : (
        <p className="problem-closed">La exploración terminó: lo que avanzó tu tripulación ya cuenta.</p>
      )}
      {t.link && !t.done && (
        <p className={`role-task-link ${capped ? 'waiting' : ''}`}>
          🔗 {t.link.text} <b>{ROLES[t.link.from].emoji} {t.link.name}: {Math.round(t.link.progress * 100)}%</b>
          {capped && <em> Tu pieza espera a la suya para funcionar al 100 %.</em>}
        </p>
      )}
      <div className="problem-bar" role="progressbar" aria-label="Avance de tu tarea" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${pct}%` }} />
      </div>
      <TaskChain view={view} />
      {t.facts[0] && <p className="role-task-fact">🛰️ {t.facts[0]}</p>}
    </div>
  );
}
