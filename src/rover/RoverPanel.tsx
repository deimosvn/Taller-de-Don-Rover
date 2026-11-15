// Don Rover en la consola del profe: su cara, el estado de la placa y los botones para
// preguntarle algo (micrófono o teclado), repetir lo último y activar la narración.
// También dibuja los subtítulos grandes de lo que dice y la ventana de conexión.

import { useEffect, useState, type FormEvent } from 'react';
import { ask, listenAndAnswer } from './assistant';
import { rover, transportLabel, usbSupported, type RoverStatus } from './link';
import { RoverFace } from './RoverFace';
import { onVoice, repeat, setVoiceSettings, spanishVoices, sttSupported, stop, stopListening, voiceSettings, say, type VoiceState } from './voice';

export function useRoverStatus(): RoverStatus {
  const [s, setS] = useState(rover.status);
  useEffect(() => rover.onStatus(setS), []);
  return s;
}

export function useVoice(): VoiceState {
  const [s, setS] = useState<VoiceState>(() => ({ speaking: false, listening: false, thinking: false, caption: '', heard: '', face: 'neutral', mouth: 0, error: '' }));
  useEffect(() => onVoice(setS), []);
  return s;
}

export function RoverPanel({ compact = false }: { compact?: boolean }) {
  const status = useRoverStatus();
  const voice = useVoice();
  const [settings, setSettings] = useState(voiceSettings);
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [question, setQuestion] = useState('');
  const [last, setLast] = useState<{ q: string; a: string } | null>(null);

  const linked = status.state === 'on';
  const talk = async () => {
    if (voice.listening) {
      stopListening();
      return;
    }
    const r = await listenAndAnswer();
    if (r.question && r.answer) setLast({ q: r.question, a: r.answer.text });
  };
  const send = async (e: FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setQuestion('');
    const a = await ask(q);
    if (a) setLast({ q, a: a.text });
  };

  return (
    <section className={`rp panel ${compact ? "compact" : ""}`} aria-label="Don Rover, asistente de voz">
      <div className="rp-head">
        <button className="rp-face" onClick={() => setOpen(true)} aria-label="Conexión y voz de Don Rover">
          <RoverFace expr={voice.face} mouth={voice.mouth} size={compact ? 58 : 72} linked={linked} pulse={voice.listening ? '#B69CFF' : null} />
        </button>
        <div className="rp-title">
          <b>Don Rover</b>
          <small className={linked ? 'ok' : status.state === 'connecting' ? 'warn' : ''}>
            <i />
            {linked ? `Placa por ${transportLabel(status.via)}` : status.state === 'connecting' ? 'Conectando…' : 'Solo en pantalla'}
          </small>
        </div>
        <button className="rp-icon" onClick={() => setOpen(true)} aria-label="Ajustes de Don Rover" title="Conexión y voz">
          ⚙
        </button>
      </div>

      <div className="rp-actions">
        <button className={`rp-btn main ${voice.listening ? 'on' : ''}`} onClick={() => void talk()} disabled={voice.thinking} aria-pressed={voice.listening}>
          {voice.listening ? '⏹ Listo' : voice.thinking ? '… Pensando' : '🎙️ Preguntar'}
        </button>
        <button className="rp-btn" onClick={() => (voice.speaking ? stop() : void repeat())} aria-label={voice.speaking ? 'Callar a Don Rover' : 'Repetir lo último'} title={voice.speaking ? 'Callar' : 'Repetir'}>
          {voice.speaking ? '🤫' : '🔁'}
        </button>
        <button className="rp-btn" onClick={() => setTyping((v) => !v)} aria-label="Escribir una pregunta" aria-pressed={typing} title="Escribir">
          ⌨️
        </button>
        <button
          className={`rp-btn ${settings.narrate ? 'on' : ''}`}
          onClick={() => setSettings(setVoiceSettings({ narrate: !settings.narrate }))}
          aria-pressed={settings.narrate}
          title={settings.narrate ? 'Narración automática activada' : 'Narración automática apagada'}
          aria-label="Narración automática"
        >
          {settings.narrate ? '🔊' : '🔈'}
        </button>
      </div>

      {typing && (
        <form className="rp-ask" onSubmit={(e) => void send(e)}>
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="¿Por qué Marte es rojo?" maxLength={300} aria-label="Pregunta para Don Rover" autoFocus />
          <button className="rp-btn main" disabled={!question.trim() || voice.thinking}>
            Enviar
          </button>
        </form>
      )}
      {voice.listening && <p className="rp-heard">🎙️ {voice.heard || 'Te escucho… haz tu pregunta.'}</p>}
      {voice.error && <p className="rp-error">{voice.error}</p>}
      {!voice.listening && last && !compact && (
        <p className="rp-last">
          <b>{last.q}</b>
          {last.a}
        </p>
      )}

      {open && <RoverSettings status={status} onClose={() => setOpen(false)} onChange={setSettings} />}
    </section>
  );
}

/** Subtítulos grandes de lo que dice Don Rover (accesibilidad), encima de todo. */
export function RoverCaptions() {
  const voice = useVoice();
  const [on, setOn] = useState(voiceSettings().captions);
  useEffect(() => onVoice(() => setOn(voiceSettings().captions)), []);
  if (!on || !voice.caption) return null;
  return (
    <div className={`rp-captions ${voice.speaking ? 'live' : ''}`} role="status" aria-live="polite">
      <span className="rp-cap-who">Don Rover</span>
      {voice.caption}
    </div>
  );
}

function RoverSettings({ status, onClose, onChange }: { status: RoverStatus; onClose(): void; onChange(s: ReturnType<typeof voiceSettings>): void }) {
  const [s, setS] = useState(voiceSettings);
  const [target, setTarget] = useState(() => rover.saved.ip || rover.saved.id || '');
  const [busy, setBusy] = useState(false);
  const voices = spanishVoices();
  const update = (p: Partial<ReturnType<typeof voiceSettings>>) => {
    const next = setVoiceSettings(p);
    setS(next);
    onChange(next);
  };
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };
  const info = status.info;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="rp-modal" role="dialog" aria-modal="true" aria-label="Don Rover: conexión y voz" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rp-sheet">
        <header>
          <h2>🤖 Don Rover</h2>
          <button className="rp-icon" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>

        <h3>Placa con pantalla</h3>
        <p className={`rp-status ${status.state}`}>{status.detail}</p>
        {info && (
          <p className="rp-info">
            Placa <b>{info.id}</b> · firmware {info.fw} · Wi-Fi {info.wifi === 'ok' ? `${info.ssid} (${info.ip})` : info.wifi === 'portal' ? `sin configurar (red ${info.ap})` : info.wifi}
            {info.cloud === 'on' ? ' · nube ✓' : ''}
          </p>
        )}
        <div className="rp-row">
          <button className="rp-btn main" disabled={busy || !usbSupported()} onClick={() => void run(() => rover.connectUsb({ ask: true }))}>
            🔌 Conectar por USB
          </button>
          {status.state !== 'off' && (
            <button className="rp-btn" onClick={() => void rover.disconnect()}>
              Desconectar
            </button>
          )}
        </div>
        {!usbSupported() && <p className="rp-note">Para USB abre la plataforma en Chrome o Edge en la computadora del profe.</p>}
        <form
          className="rp-row"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => rover.connectWifi(target));
          }}
        >
          <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="IP (192.168.1.40) o código (A1B2C3)" aria-label="IP o código de la placa" />
          <button className="rp-btn" disabled={busy || !target.trim()}>
            📶 Wi-Fi
          </button>
        </form>
        <p className="rp-note">
          ¿Primera vez? En <a href="#/donrover">Don Rover físico</a> instalas el firmware y le das tu Wi-Fi.
        </p>

        <h3>Voz</h3>
        {voices.length ? (
          <label className="rp-field">
            <span>Voz (español)</span>
            <select value={s.voiceURI || voices[0]?.voiceURI} onChange={(e) => update({ voiceURI: e.target.value })}>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="rp-note">Este navegador no tiene voces en español instaladas.</p>
        )}
        <label className="rp-field">
          <span>Velocidad: {s.rate < 0.9 ? 'lenta' : s.rate > 1.1 ? 'rápida' : 'normal'}</span>
          <input type="range" min="0.7" max="1.3" step="0.05" value={s.rate} onChange={(e) => update({ rate: Number(e.target.value) })} />
        </label>
        <label className="rp-field">
          <span>Volumen</span>
          <input type="range" min="0.2" max="1" step="0.05" value={s.volume} onChange={(e) => update({ volume: Number(e.target.value) })} />
        </label>
        <label className="rp-check">
          <input type="checkbox" checked={s.narrate} onChange={(e) => update({ narrate: e.target.checked })} /> Narrar la misión en voz alta (fases, pistas y emergencias)
        </label>
        <label className="rp-check">
          <input type="checkbox" checked={s.captions} onChange={(e) => update({ captions: e.target.checked })} /> Subtítulos grandes en el proyector
        </label>
        {!sttSupported() && <p className="rp-note">Para hablarle con el micrófono usa Chrome o Edge. Mientras, puedes escribirle con ⌨️.</p>}
        <div className="rp-row">
          <button className="rp-btn" onClick={() => void say('¡Hola, tripulación! Así sueno. Pregúntenme lo que quieran sobre Marte.', { face: 'happy', noRepeat: true })}>
            ▶ Probar la voz
          </button>
        </div>
      </div>
    </div>
  );
}
