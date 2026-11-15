import { useRef, useState } from 'react';
import { DIFFICULTIES, MISSIONS, PACES, PHASE_LABELS } from '../../../shared/content';
import type { Difficulty, Pace } from '../../../shared/types';
import { aiStatus } from '../../engine/ai';
import type { RoomSnapshot } from '../../engine/room';
import { deleteColony, exportColony, importColony, listColonies } from '../../engine/store';
import { IXOrb } from '../../components/art';
import { Icon, Logo } from '../../components/ui';
import { useInstall } from '../../lib/pwa';
import { SettingsModal } from './SettingsModal';

export function Setup({
  snapshot,
  onCreate,
  onResume,
  onDiscard,
}: {
  snapshot: RoomSnapshot | null;
  onCreate: (o: { className: string; difficulty: Difficulty; pace: Pace; colonyId: string | null }) => void;
  onResume: () => void;
  onDiscard: () => void;
}) {
  const [colonies, setColonies] = useState(() => listColonies());
  const [className, setClassName] = useState(() => colonies[0]?.name ?? '');
  const [colonyId, setColonyId] = useState<string | null>(colonies[0]?.id ?? null);
  const [difficulty, setDifficulty] = useState<Difficulty>('cadet');
  const [pace, setPace] = useState<Pace>('class');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [, refresh] = useState(0);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const install = useInstall();
  const ai = aiStatus();

  return (
    <div className="setup space-bg">
      <div className="starfield" />
      <div className="starfield far" />
      <header className="setup-top">
        <a href="#/" className="plain-link" aria-label="Volver a la presentación">
          <Logo size="sm" />
        </a>
        <div className="row">
          {install.canInstall && (
            <button className="btn small cream" onClick={install.install}>
              <Icon name="install" size={18} /> Instalar app
            </button>
          )}
          <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Ajustes">
            <Icon name="sliders" />
          </button>
        </div>
      </header>

      <main className="setup-grid">
        <section className="setup-hero">
          <IXOrb size={150} mood="talk" />
          <p className="eyebrow">Consola del profesor</p>
          <h1 className="sticker setup-title">Prepara la misión de hoy</h1>
          <p className="setup-lead">
            Proyecta esta pantalla. Tus alumnos se unen escaneando un QR desde cualquier celular, tableta o computadora: sin cuentas, sin instalar nada y
            sin materiales.
          </p>
          <ul className="setup-checks">
            <li>
              <Icon name="check" size={18} /> El juego corre completo en este navegador
            </li>
            <li>
              <Icon name="check" size={18} /> Los celulares se conectan directo por WebRTC
            </li>
            <li>
              <Icon name="check" size={18} /> Sin internet funciona en modo demo con bots
            </li>
            <li>
              <Icon name="check" size={18} /> La colonia de tu grupo se guarda entre clases
            </li>
          </ul>

          {snapshot && (
            <div className="resume card">
              <div>
                <p className="eyebrow dark">Sala en curso</p>
                <h3>
                  {snapshot.code} · {snapshot.className}
                </h3>
                <p className="muted">
                  {PHASE_LABELS[snapshot.phase]}
                  {snapshot.mission ? ` · ${MISSIONS[snapshot.mission.id].title}` : ''} · {snapshot.players.length} astronautas
                </p>
              </div>
              <div className="row">
                <button className="btn small ghost dark-ghost" onClick={onDiscard}>
                  Descartar
                </button>
                <button className="btn small food" onClick={onResume}>
                  <Icon name="play" size={16} /> Reanudar
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="setup-card card">
          <div className="field">
            <label htmlFor="classname">Nombre del grupo</label>
            <input
              id="classname"
              className="input big-input"
              placeholder="Ej. 5° B · Escuela Marte"
              maxLength={32}
              value={className}
              onChange={(e) => setClassName(e.target.value)}
            />
          </div>

          <div className="field">
            <span className="label">Colonia</span>
            <div className="colony-list">
              <button className={`colony-opt ${colonyId === null ? 'on' : ''}`} onClick={() => setColonyId(null)}>
                <span className="colony-emoji">🪐</span>
                <span>
                  <b>Nueva colonia</b>
                  <small>Empieza en el Sol 1 de MARS-01</small>
                </span>
              </button>
              {colonies.map((c) => (
                <div key={c.id} className={`colony-opt ${colonyId === c.id ? 'on' : ''}`}>
                  <button
                    className="colony-pick"
                    onClick={() => {
                      setColonyId(c.id);
                      setClassName(c.name);
                    }}
                  >
                    <span className="colony-emoji">🏙️</span>
                    <span>
                      <b>{c.name}</b>
                      <small>
                        Sol {c.sol} · {c.missions.length} misiones · {c.buildings.length} edificios
                      </small>
                    </span>
                  </button>
                  <span className="colony-actions">
                    <button className="icon-btn dark sm" title="Exportar colonia" aria-label="Exportar colonia" onClick={() => exportColony(c)}>
                      <Icon name="download" size={16} />
                    </button>
                    <button
                      className="icon-btn dark sm"
                      title="Borrar colonia"
                      aria-label="Borrar colonia"
                      onClick={() => {
                        if (!confirm(`¿Borrar la colonia "${c.name}" de este navegador? No se puede deshacer.`)) return;
                        deleteColony(c.id);
                        const next = listColonies();
                        setColonies(next);
                        if (colonyId === c.id) setColonyId(null);
                      }}
                    >
                      <Icon name="x" size={16} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
            <button className="link-btn" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={16} /> Importar colonia (.json)
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const c = await importColony(f);
                  setColonies(listColonies());
                  setColonyId(c.id);
                  setClassName(c.name);
                  setError('');
                } catch (err) {
                  setError((err as Error).message);
                }
                e.target.value = '';
              }}
            />
          </div>

          <div className="field">
            <span className="label">Dificultad</span>
            <div className="opt-grid three">
              {(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => (
                <button key={d} className={`opt ${difficulty === d ? 'on' : ''}`} onClick={() => setDifficulty(d)}>
                  <b>{DIFFICULTIES[d].label}</b>
                  <small>{DIFFICULTIES[d].age}</small>
                </button>
              ))}
            </div>
            <p className="fine">{DIFFICULTIES[difficulty].desc}</p>
          </div>

          <div className="field">
            <span className="label">Ritmo</span>
            <div className="opt-grid two">
              {(Object.keys(PACES) as Pace[]).map((p) => (
                <button key={p} className={`opt ${pace === p ? 'on' : ''}`} onClick={() => setPace(p)}>
                  <b>{PACES[p].label}</b>
                  <small>{PACES[p].desc}</small>
                </button>
              ))}
            </div>
          </div>

          <button className="ai-row" onClick={() => setSettingsOpen(true)}>
            <span className={`dot`} style={{ ['--c' as string]: ai.enabled ? 'var(--food)' : 'var(--ix)' }} />
            <span>
              <b>{ai.enabled ? `IA en la nube activa · ${ai.model}` : 'IA local (sin clave)'}</b>
              <small>{ai.enabled ? 'Claude reconoce objetos y personaliza la historia' : 'Agrega una clave de Claude para el escáner avanzado'}</small>
            </span>
            <Icon name="arrow" size={18} />
          </button>

          {error && <p className="error-text">{error}</p>}

          <button className="btn huge food block launch" onClick={() => onCreate({ className, difficulty, pace, colonyId })}>
            🚀 Abrir la colonia
          </button>
        </section>
      </main>

      <SettingsModal
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          refresh((n) => n + 1);
        }}
      />
    </div>
  );
}
