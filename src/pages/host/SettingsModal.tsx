import { useState } from 'react';
import { testConnection } from '../../engine/ai';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type HostSettings } from '../../engine/settings';
import { Icon, Modal } from '../../components/ui';

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [s, setS] = useState<HostSettings>(() => loadSettings());
  const [show, setShow] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const sig = s.signaling ?? { host: '', port: 443, path: '/', secure: true };

  const save = () => {
    saveSettings({ ...s, signaling: s.signaling?.host ? s.signaling : null });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Ajustes de la colonia">
      <div className="settings">
        <section>
          <h3>
            <Icon name="spark" /> IA de Claude <span className="chip dark">opcional</span>
          </h3>
          <p className="muted">
            Con una clave de API, IX usa Claude para reconocer cualquier objeto del escáner, personalizar la historia, evaluar las bitácoras y escribir el
            debrief. Sin clave, el taller funciona igual: visión local en este dispositivo y narrativas de plantilla.
          </p>
          <div className="field">
            <label htmlFor="apikey">Clave de API de Anthropic</label>
            <div className="row">
              <input
                id="apikey"
                className="input"
                type={show ? 'text' : 'password'}
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-ant-…"
                value={s.apiKey}
                onChange={(e) => {
                  setS({ ...s, apiKey: e.target.value.trim() });
                  setTest(null);
                }}
              />
              <button className="btn small cream" onClick={() => setShow((v) => !v)}>
                {show ? 'Ocultar' : 'Ver'}
              </button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="model">Modelo</label>
            <input id="model" className="input" value={s.model} onChange={(e) => setS({ ...s, model: e.target.value.trim() || DEFAULT_SETTINGS.model })} />
          </div>
          <div className="row">
            <button
              className="btn small ix"
              disabled={!s.apiKey || testing}
              onClick={async () => {
                saveSettings({ ...s });
                setTesting(true);
                setTest(await testConnection());
                setTesting(false);
              }}
            >
              <Icon name="wifi" size={18} /> {testing ? 'Probando…' : 'Probar conexión'}
            </button>
            {test && <span className={`chip ${test.ok ? 'ok' : 'bad'} dark`}>{test.message}</span>}
          </div>
          <p className="fine">
            🔒 La clave se guarda solo en este navegador y se usa directamente desde aquí. Usa una clave con límite de gasto. Las fotos solo se envían a Claude
            si hay clave; con la IA local nunca salen del dispositivo.
          </p>
        </section>

        <section>
          <h3>
            <Icon name="wifi" /> Conexión de los celulares
          </h3>
          <div className="field">
            <label htmlFor="joinbase">Dirección pública de la app (para el QR)</label>
            <input
              id="joinbase"
              className="input"
              placeholder={`${window.location.origin}${window.location.pathname}`}
              value={s.joinBase}
              onChange={(e) => setS({ ...s, joinBase: e.target.value })}
            />
            <p className="fine">Déjalo vacío para usar esta misma página. Si abriste el taller como “localhost”, escribe aquí la dirección publicada (HTTPS).</p>
          </div>
          <details>
            <summary>Servidor de señalización propio (avanzado)</summary>
            <p className="fine">
              Por defecto el taller usa el servidor público gratuito de PeerJS solo para presentar a los dispositivos; el juego viaja directo entre ellos. Si tu
              escuela tiene su propio PeerServer, configúralo aquí.
            </p>
            <div className="grid2">
              <input className="input" placeholder="host (ej. peer.miescuela.mx)" value={sig.host} onChange={(e) => setS({ ...s, signaling: { ...sig, host: e.target.value.trim() } })} />
              <input className="input" type="number" placeholder="puerto" value={sig.port} onChange={(e) => setS({ ...s, signaling: { ...sig, port: Number(e.target.value) || 443 } })} />
              <input className="input" placeholder="ruta (ej. /)" value={sig.path} onChange={(e) => setS({ ...s, signaling: { ...sig, path: e.target.value || '/' } })} />
              <label className="check">
                <input type="checkbox" checked={sig.secure} onChange={(e) => setS({ ...s, signaling: { ...sig, secure: e.target.checked } })} /> HTTPS / WSS
              </label>
            </div>
          </details>
        </section>

        <div className="row end">
          <button className="btn ghost dark-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn food" onClick={save}>
            <Icon name="check" /> Guardar
          </button>
        </div>
      </div>
    </Modal>
  );
}
