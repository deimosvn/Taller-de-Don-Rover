import { useEffect, useRef, useState } from 'react';
import { DIFFICULTIES, MISSIONS, PACES, PHASE_LABELS } from '../../../shared/content';
import type { Difficulty, Pace } from '../../../shared/types';
import { aiStatus } from '../../engine/ai';
import type { RoomSnapshot } from '../../engine/room';
import { deleteColony, exportColony, importColony, listColonies, storeColony } from '../../engine/store';
import { IXOrb } from '../../components/art';
import { Icon, Logo } from '../../components/ui';
import { cloudRef, formatCode, openFromCode, probeServer, serverStatus, subscribeCloud, syncColony, syncState } from '../../lib/cloud';
import { useInstall } from '../../lib/pwa';
import { SettingsModal } from './SettingsModal';

/** Estado de la base de datos (Supabase en Vercel) y código de cada colonia. */
function useCloud() {
  const [, bump] = useState(0);
  useEffect(() => {
    const off = subscribeCloud(() => bump((n) => n + 1));
    void probeServer();
    return off;
  }, []);
  return serverStatus();
}

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
  const server = useCloud();
  const ai = aiStatus();
  const dbOn = Boolean(server.db?.connected);
  const [code, setCode] = useState('');
  const [opening, setOpening] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Con la base de datos conectada, las colonias de este navegador se suben a la nube.
  useEffect(() => {
    if (!dbOn) return;
    for (const c of listColonies()) if (!syncState(c.id)) syncColony(c);
  }, [dbOn]);

  const openCloud = async () => {
    setOpening(true);
    setError('');
    try {
      const c = await openFromCode(code);
      storeColony(c);
      setColonies(listColonies());
      setColonyId(c.id);
      setClassName(c.name);
      setCode('');
    } catch (err) {
      setError((err as Error).message);
    }
    setOpening(false);
  };

  const copyCode = (id: string, text: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1600);
    });
  };

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
                      {dbOn && <CloudLine colonyId={c.id} copied={copied === c.id} onCopy={copyCode} />}
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
            {dbOn && (
              <form
                className="cloud-open"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!opening) void openCloud();
                }}
              >
                <input
                  className="input"
                  value={code}
                  placeholder="Código de colonia: XXXX-XXXX-XXXX-XXXX"
                  aria-label="Código de colonia guardada en la nube"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={24}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
                <button className="btn small water" disabled={opening || code.replace(/[^A-Z0-9]/gi, '').length !== 16}>
                  {opening ? 'Abriendo…' : '☁️ Abrir'}
                </button>
              </form>
            )}
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
              <b>{ai.server ? `IA del servidor activa · ${ai.model}` : ai.enabled ? `IA en la nube activa · ${ai.model}` : 'IA local (sin clave)'}</b>
              <small>
                {ai.server
                  ? 'Claude Opus 5.5 corre en Vercel: no hace falta escribir ninguna clave'
                  : ai.enabled
                    ? 'Claude reconoce objetos y personaliza la historia'
                    : 'Agrega ANTHROPIC_API_KEY en Vercel o una clave de Claude en Ajustes'}
              </small>
            </span>
            <Icon name="arrow" size={18} />
          </button>

          <div className="ai-row db-row" role="status">
            <span className="dot" style={{ ['--c' as string]: dbOn ? 'var(--food)' : server.db?.configured ? 'var(--habitat)' : 'var(--ix)' }} />
            <span>
              <b>
                {dbOn
                  ? 'Base de datos conectada · Supabase'
                  : server.db?.configured
                    ? 'La base de datos no respondió'
                    : server.db
                      ? 'Base de datos sin configurar'
                      : 'Colonias guardadas en este navegador'}
              </b>
              <small>
                {dbOn
                  ? 'Cada colonia se guarda en la nube con su código para abrirla en otra computadora'
                  : server.db?.configured
                    ? (server.db.error ?? 'Revisa la conexión de Supabase en Vercel')
                    : server.db
                      ? 'Conecta Supabase al proyecto en Vercel para guardar en la nube'
                      : 'Sin servidor: exporta la colonia (.json) para moverla de computadora'}
              </small>
            </span>
          </div>

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

function CloudLine({ colonyId, copied, onCopy }: { colonyId: string; copied: boolean; onCopy: (id: string, text: string) => void }) {
  const ref = cloudRef(colonyId);
  const st = syncState(colonyId);
  if (!ref) return <small className="cloud-line">{st?.pending ? '☁️ Guardando en la nube…' : '☁️ Se guardará en la nube'}</small>;
  const text = formatCode(ref);
  const copy = (e: { stopPropagation(): void; preventDefault(): void }) => {
    e.preventDefault();
    e.stopPropagation();
    onCopy(colonyId, text);
  };
  return (
    <small className={`cloud-line ${st?.error ? 'err' : ''}`}>
      {st?.pending ? '☁️ Guardando…' : st?.error ? `⚠️ ${st.error}` : '☁️ En la nube ·'}{' '}
      <span
        role="button"
        tabIndex={0}
        className="cloud-code"
        title="Copiar el código para abrir esta colonia en otra computadora"
        onClick={copy}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') copy(e);
        }}
      >
        {copied ? '¡Código copiado!' : text}
      </span>
    </small>
  );
}