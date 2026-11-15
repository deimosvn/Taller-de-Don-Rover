// Laboratorio de minijuegos (#/minijuegos): prueba cualquier tarea de la emergencia sin
// jugar una misión completa. Útil para el equipo y para mostrar el juego.

import { useState } from 'react';
import { MISSIONS, MISSION_ORDER, ROLES, ROLE_ORDER } from '../../../shared/content';
import { MINIGAMES } from '../../../shared/minigames';
import type { MissionId, RoleId } from '../../../shared/types';
import { Minigame } from './minigames';

export function MinigameLab() {
  const [mission, setMission] = useState<MissionId>('greenhouse');
  const [role, setRole] = useState<RoleId>('power');
  const [points, setPoints] = useState(0);
  const spec = MINIGAMES[mission][role];
  const action = MISSIONS[mission].event.actions[role];
  const r = ROLES[role];
  return (
    <div className="play play-game mg-lab">
      <div className="starfield" />
      <header className="play-top">
        <a href="#/" className="plain-link">
          ← Inicio
        </a>
        <b>Laboratorio de minijuegos</b>
        <span className="mono">{points} acciones</span>
      </header>
      <main className="play-main">
        <div className="mg-lab-pick">
          <select value={mission} onChange={(e) => (setMission(e.target.value as MissionId), setPoints(0))} aria-label="Misión">
            {MISSION_ORDER.map((m) => (
              <option key={m} value={m}>
                {MISSIONS[m].code} · {MISSIONS[m].titleEs}
              </option>
            ))}
          </select>
          <div className="mg-lab-roles">
            {ROLE_ORDER.map((x) => (
              <button key={x} className={`chip ${x === role ? 'on' : ''}`} onClick={() => (setRole(x), setPoints(0))}>
                {ROLES[x].emoji} {ROLES[x].specialty}
              </button>
            ))}
          </div>
        </div>
        <div className="tapgame">
          <p className="eyebrow center">
            ¡ACCIÓN! · {action.emoji} {action.verb}
          </p>
          <Minigame key={`${mission}:${role}`} spec={spec} color={r.color} dark={r.dark} onPoints={(n) => setPoints((p) => p + n)} />
        </div>
      </main>
    </div>
  );
}
