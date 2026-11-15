// Laboratorio de minijuegos (#/minijuegos): prueba el problema de la historia de cada misión
// y cada tarea de la emergencia sin jugar una misión completa. Útil para el equipo y para
// mostrar el juego.

import { useState } from 'react';
import { MISSIONS, MISSION_ORDER, ROLES, ROLE_ORDER } from '../../../shared/content';
import { FIX_GOAL, MINIGAMES, MISSION_PROBLEMS } from '../../../shared/minigames';
import type { MissionId, RoleId } from '../../../shared/types';
import { Minigame } from './minigames';

type Pick = RoleId | 'story';

export function MinigameLab() {
  const [mission, setMission] = useState<MissionId>('greenhouse');
  const [pick, setPick] = useState<Pick>('story');
  const [points, setPoints] = useState(0);
  const def = MISSIONS[mission];
  const prob = MISSION_PROBLEMS[mission];
  const story = pick === 'story';
  const spec = story ? prob.spec : MINIGAMES[mission][pick];
  const action = story ? null : def.event.actions[pick];
  const color = story ? def.color : ROLES[pick].color;
  const dark = story ? def.deep : ROLES[pick].dark;
  return (
    <div className="play play-game mg-lab">
      <div className="starfield" />
      <header className="play-top">
        <a href="#/" className="plain-link">
          ← Inicio
        </a>
        <b>Laboratorio de minijuegos</b>
        <span className="mono">{story ? `${Math.min(100, Math.round((points / FIX_GOAL) * 100))}% reparado` : `${points} acciones`}</span>
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
            <button className={`chip ${story ? 'on' : ''}`} onClick={() => (setPick('story'), setPoints(0))}>
              {prob.emoji} Problema de la historia
            </button>
            {ROLE_ORDER.map((x) => (
              <button key={x} className={`chip ${x === pick ? 'on' : ''}`} onClick={() => (setPick(x), setPoints(0))}>
                {ROLES[x].emoji} {ROLES[x].specialty}
              </button>
            ))}
          </div>
        </div>
        <div className="tapgame">
          <p className="eyebrow center">{story ? `${prob.emoji} ${prob.title}` : `¡EMERGENCIA! · ${action!.emoji} ${action!.verb}`}</p>
          <Minigame key={`${mission}:${pick}`} spec={spec} color={color} dark={dark} onPoints={(n) => setPoints((p) => p + n)} />
        </div>
      </main>
    </div>
  );
}
