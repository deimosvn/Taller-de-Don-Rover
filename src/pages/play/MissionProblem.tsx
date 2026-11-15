// Problema de la historia de cada misión (el invernadero sin energía, la reserva de agua
// vacía, la colonia a oscuras…): la tripulación lo resuelve con un minijuego en su estación
// del mundo 3D o desde esta tarjeta. Cada acierto se manda al motor como "reparación".

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { MISSIONS, SYSTEMS } from '../../../shared/content';
import { MISSION_PROBLEMS } from '../../../shared/minigames';
import type { PlayerView } from '../../../shared/types';
import type { PlayerNet } from '../../net/playerNet';
import { Minigame } from './minigames';
import { GoToStation } from './RoleTask';

/** Junta los puntos del minijuego y los manda al proyector cada poco. */
function useFixSender(net: PlayerNet | null) {
  const pending = useRef(0);
  useEffect(() => {
    const id = setInterval(() => {
      if (pending.current > 0 && net) {
        net.sendFix(pending.current);
        pending.current = 0;
      }
    }, 450);
    return () => {
      clearInterval(id);
      if (pending.current > 0 && net) net.sendFix(pending.current);
      pending.current = 0;
    };
  }, [net]);
  return (n: number) => {
    pending.current += n;
  };
}

/** ¿Hay un problema de la historia por resolver en esta fase? */
export function problemOpen(view: PlayerView): boolean {
  return Boolean(view.mission && view.problem?.open);
}

export function ProblemProgress({ view }: { view: PlayerView }) {
  const p = view.problem;
  if (!p || !view.mission) return null;
  const def = MISSIONS[view.mission.id];
  const sys = SYSTEMS[def.focus];
  const crew = Math.round(p.crew * 100);
  return (
    <div className="problem-progress" style={{ '--pc': def.color } as CSSProperties}>
      <div className="problem-bar" role="progressbar" aria-label="Avance de tu tripulación" aria-valuenow={crew} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${crew}%` }} />
      </div>
      <small>
        {crew >= 100 ? (
          <>
            ✅ ¡Tu tripulación lo resolvió! {sys.emoji} {sys.short} mejorará en los resultados.
          </>
        ) : (
          <>
            Tripulación: <b className="mono">{crew}%</b> · tus puntos: <b className="mono">{p.mine}</b>
          </>
        )}
      </small>
    </div>
  );
}

/** El problema con su minijuego (en el mundo 3D o en la pantalla de la misión). */
export function StoryProblem({ view, net }: { view: PlayerView; net: PlayerNet | null }) {
  const send = useFixSender(net);
  if (!view.mission) return null;
  const def = MISSIONS[view.mission.id];
  const prob = MISSION_PROBLEMS[view.mission.id];
  const open = problemOpen(view);
  return (
    <div className="problem">
      <div className="problem-head" style={{ '--pc': def.color } as CSSProperties}>
        <span className="problem-emoji">{prob.emoji}</span>
        <div>
          <p className="problem-kicker">Problema de la misión</p>
          <h3>{prob.title}</h3>
        </div>
      </div>
      <p className="problem-text">{prob.text}</p>
      <ProblemProgress view={view} />
      {open ? (
        <Minigame key={view.mission.id} spec={prob.spec} color={def.color} dark={def.deep} onPoints={send} />
      ) : (
        <p className="problem-closed">La investigación terminó: lo que resolvió tu tripulación ya cuenta para los resultados.</p>
      )}
    </div>
  );
}

/** Tarjeta para la pantalla de la misión: resumen y el minijuego al tocar. */
export function ProblemCard({ view, net, open3d }: { view: PlayerView; net: PlayerNet | null; open3d?: () => void }) {
  const [play, setPlay] = useState(false);
  if (!view.mission || !problemOpen(view)) return null;
  // Con mundo 3D el problema se resuelve en su estación: aquí solo se guía hasta ella.
  const prob = MISSION_PROBLEMS[view.mission.id];
  const def = MISSIONS[view.mission.id];
  if (play) {
    return (
      <div className="problem-card card is-open">
        <StoryProblem view={view} net={net} />
        <button className="btn block cream" onClick={() => setPlay(false)}>
          Listo, volver a la misión
        </button>
      </div>
    );
  }
  return (
    <div className="problem-card card" style={{ '--pc': def.color } as CSSProperties}>
      <div className="problem-head">
        <span className="problem-emoji">{prob.emoji}</span>
        <div>
          <p className="problem-kicker">Problema de la misión</p>
          <h3>{prob.title}</h3>
        </div>
      </div>
      <ProblemProgress view={view} />
      {open3d ? (
        <GoToStation place={prob.place} onGo={open3d} />
      ) : (
        <div className="problem-actions">
          <button className="btn mars" onClick={() => setPlay(true)}>
            🔧 Resolver aquí
          </button>
        </div>
      )}
    </div>
  );
}
