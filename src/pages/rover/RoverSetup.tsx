// Don Rover físico (#/donrover): instalar el firmware en la placa BIGTREETECH KNOMI, conectarla
// a la plataforma (USB, Wi-Fi o nube), darle el Wi-Fi del salón y probar caras, voz y micrófono.

import { useEffect, useState, type CSSProperties } from 'react';
import { Logo } from '../../components/ui';
import { firmwareManifest, flashFirmware, type FirmwareManifest, type FlashProgress } from '../../rover/flasher';
import { rover, transportLabel, usbSupported, type RoverExpr } from '../../rover/link';
import { RoverFace, EXPR_LABEL } from '../../rover/RoverFace';
import { RoverCaptions, RoverPanel, useRoverStatus, useVoice } from '../../rover/RoverPanel';
import { say, setFace } from '../../rover/voice';
import { greet, listenAndAnswer } from '../../rover/assistant';

const FACES: RoverExpr[] = ['neutral', 'happy', 'wow', 'think', 'listen', 'alert', 'sad', 'star', 'sleep'];

export function RoverSetup() {
  const status = useRoverStatus();
  const voice = useVoice();
  const [manifest, setManifest] = useState<FirmwareManifest | null>(null);
  const [flash, setFlash] = useState<FlashProgress | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [ssid, setSsid] = useState('');
  const [pass, setPass] = useState('');
  const [target, setTarget] = useState(() => rover.saved.ip || rover.saved.id || '');
  const [bright, setBright] = useState(200);
  const [ring, setRing] = useState(-1);
  const info = status.info;
  const on = status.state === 'on';

  useEffect(() => {
    void firmwareManifest().then(setManifest);
    void rover.auto();
    const off = rover.onEvent((e) => {
      if (e.t === 'btn' && e.k === 'short') void say('¡Me presionaste! Un toque corto repite lo último que dije.', { face: 'happy', noRepeat: true });
      else if (e.t === 'btn' && e.k === 'long') void listenAndAnswer();
    });
    return off;
  }, []);

  const install = async () => {
    setLog([]);
    const ok = await flashFirmware(setFlash, (line) => setLog((l) => [...l.slice(-60), line.trim()].filter(Boolean)));
    if (ok) {
      // Al reiniciar, la placa saluda: se conecta sola por USB.
      setTimeout(() => void rover.connectUsb().then((c) => c && greet()), 2500);
    }
  };

  const outdated = info && manifest && info.fw && info.fw !== manifest.version;

  return (
    <div className="rs">
      <header className="rs-top">
        <a href="#/" aria-label="Inicio">
          <Logo size="sm" sub={false} />
        </a>
        <a className="btn small cream" href="#/profe">
          Ir a la consola del profe
        </a>
      </header>

      <main className="rs-main">
        <section className="rs-hero">
          <div className="rs-face">
            <RoverFace expr={voice.face} mouth={voice.mouth} size={210} linked={on} pulse={voice.listening ? '#B69CFF' : null} ring={ring >= 0 ? { p: ring / 1000, color: '#FFC93C' } : null} />
            <span className={`rs-badge ${status.state}`}>
              <i /> {on ? `Conectado por ${transportLabel(status.via)}` : status.state === 'connecting' ? 'Conectando…' : 'Sin placa'}
            </span>
          </div>
          <div>
            <p className="rs-kicker">Don Rover físico · placa con pantalla redonda</p>
            <h1>Un asistente de verdad para tu salón</h1>
            <p className="rs-lead">
              Conecta la placa <b>BIGTREETECH KNOMI</b> a la computadora del profe. La pantalla muestra la cara de Don Rover y mueve la boca mientras la
              computadora habla por sus bocinas: narra la misión, da las pistas de IX y responde lo que los alumnos le pregunten con el micrófono.
            </p>
            <ul className="rs-points">
              <li>🎙️ Preguntas por voz con IA, explicadas para su edad</li>
              <li>💬 Subtítulos grandes de todo lo que dice</li>
              <li>⏱️ Anillo con el tiempo que queda en la pantalla redonda</li>
              <li>🔘 Su botón: toque corto repite, sostenido para preguntar</li>
            </ul>
          </div>
        </section>

        <section className="rs-card">
          <h2>
            <span className="rs-num">1</span> Instalar el firmware
          </h2>
          <p>
            Conecta la placa con su cable USB-C a esta computadora y presiona instalar. Funciona en <b>Chrome</b> o <b>Edge</b>. Tarda menos de un minuto.
            {manifest && (
              <>
                {' '}
                Versión disponible: <b>{manifest.version}</b> ({(manifest.size / 1024 / 1024).toFixed(1)} MB).
              </>
            )}
          </p>
          {outdated && <p className="rs-warn">La placa tiene la versión {info!.fw}: instala la {manifest!.version} para tener todo lo nuevo.</p>}
          <div className="rs-row">
            <button className="btn mars" disabled={!usbSupported() || (flash !== null && !['done', 'error'].includes(flash.stage))} onClick={() => void install()}>
              ⬇️ Instalar en la placa
            </button>
          </div>
          {!usbSupported() && <p className="rs-warn">Este navegador no puede usar USB. Abre esta página en Chrome o Edge en una computadora.</p>}
          {flash && (
            <div className={`rs-flash ${flash.stage}`} role="status">
              <p>{flash.text}</p>
              {flash.stage === 'write' && (
                <div className="rs-bar">
                  <i style={{ width: `${Math.round(flash.progress * 100)}%` }} />
                </div>
              )}
            </div>
          )}
          {log.length > 0 && (
            <details className="rs-log">
              <summary>Detalles técnicos</summary>
              <pre>{log.join('\n')}</pre>
            </details>
          )}
          <p className="rs-note">
            ¿Prefieres la terminal? En la carpeta <code>firmware/donrover-knomi</code>: <code>pio run -t upload</code>.
          </p>
        </section>

        <section className="rs-card">
          <h2>
            <span className="rs-num">2</span> Conectar con la plataforma
          </h2>
          <p className={`rs-status ${status.state}`}>{status.detail}</p>
          {info && (
            <dl className="rs-info">
              <div>
                <dt>Código de la placa</dt>
                <dd className="mono">{info.id}</dd>
              </div>
              <div>
                <dt>Firmware</dt>
                <dd>{info.fw}</dd>
              </div>
              <div>
                <dt>Wi-Fi</dt>
                <dd>{info.wifi === 'ok' ? `${info.ssid} · ${info.ip}` : info.wifi === 'portal' ? `Sin configurar (red ${info.ap})` : info.wifi === 'connecting' ? 'Conectando…' : 'Apagado'}</dd>
              </div>
              <div>
                <dt>Nube</dt>
                <dd>{info.cloud === 'on' ? 'Conectada' : info.cloud === 'nocfg' ? 'La plataforma no tiene Supabase' : info.cloud === 'connecting' ? 'Conectando…' : 'Apagada'}</dd>
              </div>
            </dl>
          )}
          <div className="rs-row">
            <button className="btn mars" disabled={!usbSupported()} onClick={() => void rover.connectUsb({ ask: true }).then((c) => c && greet())}>
              🔌 Conectar por USB
            </button>
            {status.state !== 'off' && (
              <button className="btn ghost" onClick={() => void rover.disconnect()}>
                Desconectar
              </button>
            )}
          </div>
          <form
            className="rs-row"
            onSubmit={(e) => {
              e.preventDefault();
              void rover.connectWifi(target).then((c) => c && greet());
            }}
          >
            <input className="input" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="IP (192.168.1.40) o código de la placa (A1B2C3)" aria-label="IP o código de la placa" />
            <button className="btn cream" disabled={!target.trim()}>
              📶 Conectar por Wi-Fi
            </button>
          </form>
          <p className="rs-note">
            <b>USB</b> es lo más confiable. Por <b>Wi-Fi</b> la placa y la computadora deben estar en la misma red; si la plataforma está publicada en HTTPS, el
            navegador puede pedir permiso de «red local» o se usa el canal en la nube con el código de la placa (necesita internet).
          </p>
        </section>

        <section className="rs-card">
          <h2>
            <span className="rs-num">3</span> Darle el Wi-Fi del salón (opcional)
          </h2>
          <p>Con la placa conectada por USB, escribe la red de la computadora del profe. Se guarda en la placa.</p>
          <form
            className="rs-wifi"
            onSubmit={(e) => {
              e.preventDefault();
              rover.send({ t: 'wifi', ssid: ssid.trim(), pass });
              setPass('');
            }}
          >
            <input className="input" value={ssid} onChange={(e) => setSsid(e.target.value)} placeholder="Nombre de la red" maxLength={32} aria-label="Nombre de la red Wi-Fi" autoComplete="off" />
            <input className="input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Contraseña" maxLength={64} aria-label="Contraseña del Wi-Fi" autoComplete="new-password" />
            <button className="btn cream" disabled={!on || status.via !== 'usb' || !ssid.trim()}>
              Guardar en la placa
            </button>
          </form>
          <p className="rs-note">
            Sin USB: la placa sin Wi-Fi abre la red <b>DonRover-…</b>; conéctate desde un celular y elige la red en la página que aparece. Mantén presionado su botón 5
            segundos para ver su código e IP en la pantalla.
          </p>
          {on && status.via === 'usb' && info?.wifi === 'ok' && (
            <button className="btn ghost small" onClick={() => rover.send({ t: 'forget' })}>
              Olvidar el Wi-Fi guardado
            </button>
          )}
        </section>

        <section className="rs-card">
          <h2>
            <span className="rs-num">4</span> Probar a Don Rover
          </h2>
          <div className="rs-faces" role="group" aria-label="Expresiones">
            {FACES.map((f) => (
              <button key={f} className={voice.face === f ? 'on' : ''} onClick={() => setFace(f, f === 'sleep' ? 0 : 4000)}>
                {EXPR_LABEL[f]}
              </button>
            ))}
          </div>
          <div className="rs-row">
            <button className="btn cream" onClick={() => void say('Hola, soy Don Rover. Cuando hablo, mi boca se mueve en la pantalla de la placa. ¿Me ven?', { face: 'happy' })}>
              🗣️ Hablar
            </button>
            <button
              className="btn cream"
              onClick={() => {
                let p = 1000;
                setRing(p);
                const id = setInterval(() => {
                  p -= 50;
                  setRing(Math.max(-1, p));
                  rover.send({ t: 'ring', p: Math.max(-1, p), c: p > 500 ? '#55DB7A' : p > 200 ? '#FFC93C' : '#FF6B5B' });
                  if (p < 0) clearInterval(id);
                }, 150);
              }}
            >
              ⏱️ Anillo de tiempo
            </button>
            <button className="btn cream" onClick={() => rover.send({ t: 'card', title: 'ABCD', sub: 'Codigo para unirse a la mision', ms: 5000 })} disabled={!on}>
              🔤 Código en pantalla
            </button>
          </div>
          <label className="rs-range">
            <span>Brillo de la pantalla</span>
            <input
              type="range"
              min="20"
              max="255"
              value={bright}
              disabled={!on}
              onChange={(e) => {
                setBright(Number(e.target.value));
                rover.send({ t: 'bl', v: Number(e.target.value) });
              }}
              style={{ '--v': bright } as CSSProperties}
            />
          </label>
          <div className="rs-panel">
            <RoverPanel />
          </div>
        </section>
      </main>
      <RoverCaptions />
    </div>
  );
}
