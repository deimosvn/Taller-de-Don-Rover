// Etapa de misión: IX la genera sola. Consulta el clima espacial real de la NASA (DONKI),
// revisa el estado de la colonia y, con la IA, elige la misión y escribe la tarea de cada
// especialidad. El profesor no elige nada: solo ve cómo se arma la misión sobre el planeta.

import { ROLES, ROLE_ORDER } from '../../../shared/content';
import type { HostView } from '../../../shared/types';
import { Astronaut, IXOrb } from '../../components/art';
import { Icon } from '../../components/ui';
import { aiStatus } from '../../engine/ai';
import { ROLE_AVATARS } from '../../world/react/missionZones';
import { PlanetView } from '../../world/react/PlanetView';
import { useHostSnapshot } from '../../world/react/useHostSnapshot';
import type { Run } from './Console';

const STEPS: { stage: 'nasa' | 'ai' | 'ready'; label: string }[] = [
  { stage: 'nasa', label: 'Clima espacial real (NASA DONKI)' },
  { stage: 'ai', label: 'Diseño de la misión y de las 4 tareas' },
  { stage: 'ready', label: 'Misión lista' },
];

export function Scanner({ view, run }: { view: HostView; run: Run; flash?: (m: string) => void }) {
  const snapshot = useHostSnapshot(view);
  const g = view.generator;
  const at = g ? STEPS.findIndex((s) => s.stage === g.stage) : 0;
  const ai = aiStatus();
  return (
    <div className="mission-gen">
      <div className="stage-head">
        <p className="eyebrow">Misión generada por IX</p>
        <h2 className="sticker">IX está preparando la misión</h2>
        <p>
          IX revisa las condiciones reales de la NASA y el estado de la colonia, y con eso arma la misión y una tarea para cada especialidad.{' '}
          {ai.enabled ? 'La IA (Claude) escribe la misión.' : 'Sin IA conectada, las reglas del motor deciden con los mismos datos.'}
        </p>
      </div>
      <div className="mission-gen-body">
        <div className="mission-gen-planet">
          <PlanetView snapshot={snapshot} className="stage-planet" />
          <div className="mission-gen-crew" aria-hidden="true">
            <IXOrb size={92} mood={g?.stage === 'error' ? 'alert' : 'talk'} />
            {ROLE_ORDER.map((r, i) => (
              <Astronaut key={r} avatar={ROLE_AVATARS[r]} role={r} size={78} pose={i % 2 ? 'wave' : 'idle'} />
            ))}
          </div>
        </div>
        <div className="mission-gen-side panel">
          <ol className="gen-steps">
            {STEPS.map((s, i) => (
              <li key={s.stage} className={i < at ? 'done' : i === at ? 'now' : ''}>
                <span className="gen-dot">{i < at ? '✓' : i + 1}</span>
                {s.label}
              </li>
            ))}
          </ol>
          <p className="gen-now">
            <span className="spinner-sm" aria-hidden="true" /> {g?.text ?? 'Conectando con IX…'}
          </p>
          {g?.conditions.length ? (
            <ul className="gen-conditions">
              {g.conditions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : null}
          <div className="gen-roles">
            {ROLE_ORDER.map((r) => (
              <span key={r} className="chip" style={{ borderColor: ROLES[r].color }}>
                {ROLES[r].emoji} {ROLES[r].specialty}
              </span>
            ))}
          </div>
          {g?.stage === 'error' && (
            <button className="btn food" onClick={() => run({ type: 'toScan' })}>
              <Icon name="refresh" size={18} /> Volver a intentar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
