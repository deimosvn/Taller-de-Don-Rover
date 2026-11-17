// Don Rover flotante: vive en la raíz de la app, así que está en todas las secciones (portada,
// consola del profe, celular, entrenador, mundo 3D…) y no se pierde al navegar. La conversación
// se guarda en el navegador: sigue ahí al recargar y se sincroniza entre pestañas.
// Contesta con Claude y con datos reales de la NASA (clima espacial, asteroides, foto del día y
// estudios científicos); sin internet usa su propia base de conocimiento.

import { useEffect, useRef, useState, type FormEvent, type PointerEvent as RPointerEvent } from 'react';
import { useRoute } from '../lib/route';
import { ask, type NasaRef } from './assistant';
import { RoverFace } from './RoverFace';
import { rover } from './link';
import { useRoverStatus, useVoice } from './RoverPanel';
import { listen, repeat, stop, stopListening, sttSupported, voiceState } from './voice';

/** Texto corto para la pantalla redonda de la placa (2 renglones). */
function boardText(text: string): string {
  const first = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return first.length > 46 ? `${first.slice(0, 44).trimEnd()}...` : first;
}

interface Msg {
  id: number;
  who: 'me' | 'rover';
  text: string;
  followUp?: string;
  refs?: NasaRef[];
  ai?: boolean;
}

interface DockState {
  open: boolean;
  speak: boolean;
  side: 'right' | 'left';
  /** Distancia al borde inferior (px), para moverlo arriba o abajo. */
  y: number;
  msgs: Msg[];
}

const KEY = 'donrover.dock.v1';
const MAX_MSGS = 40;

const QUICK = [
  { label: '🌞 Clima espacial hoy', q: '¿Cómo está el clima espacial hoy? ¿Hay tormentas solares?' },
  { label: '☄️ Asteroides cerca', q: '¿Qué asteroides pasan cerca de la Tierra hoy?' },
  { label: '📸 Foto de la NASA', q: '¿Cuál es la foto del día de la NASA?' },
  { label: '🔴 ¿Por qué Marte es rojo?', q: '¿Por qué Marte es rojo?' },
  { label: '🦴 Huesos en el espacio', q: '¿Qué les pasa a los huesos de los astronautas en el espacio?' },
];

function load(): DockState {
  const base: DockState = { open: false, speak: true, side: 'right', y: 20, msgs: [] };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<DockState> | null;
    if (!raw) return base;
    return {
      open: Boolean(raw.open),
      speak: raw.speak !== false,
      side: raw.side === 'left' ? 'left' : 'right',
      y: typeof raw.y === 'number' && Number.isFinite(raw.y) ? raw.y : 20,
      msgs: Array.isArray(raw.msgs) ? raw.msgs.slice(-MAX_MSGS) : [],
    };
  } catch {
    return base;
  }
}

function save(s: DockState) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, msgs: s.msgs.slice(-MAX_MSGS) }));
  } catch {
    /* sin almacenamiento: la conversación vive solo en esta pestaña */
  }
}

const clampY = (y: number) => Math.max(8, Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 96));

export function RoverDock() {
  const route = useRoute();
  const voice = useVoice();
  const status = useRoverStatus();
  const [state, setState] = useState<DockState>(load);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ startY: number; baseY: number; moved: boolean } | null>(null);

  const update = (fn: (s: DockState) => DockState) =>
    setState((prev) => {
      const next = fn(prev);
      save(next);
      return next;
    });

  // La placa física: se reconecta sola (USB o Wi-Fi) en cualquier sección y su botón de la
  // cabeza maneja este asistente — corto = repetir, largo = preguntar con el micrófono.
  const stateRef = useRef(state);
  stateRef.current = state;
  const micRef = useRef<() => void>(() => {});
  useEffect(() => {
    void rover.auto().catch(() => false);
    return rover.onEvent((e) => {
      if (e.t !== 'btn') return;
      if (e.k === 'short') void repeat();
      else {
        if (!stateRef.current.open) update((s) => ({ ...s, open: true }));
        micRef.current();
      }
    });
  }, []);

  // Otras pestañas: misma conversación.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setState((prev) => ({ ...load(), open: prev.open }));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Siempre mostrar lo último.
  useEffect(() => {
    if (state.open) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [state.open, state.msgs.length, busy]);

  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && update((s) => ({ ...s, open: false }));
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.open]);

  const send = async (text: string) => {
    const q = text.trim().slice(0, 300);
    if (!q || busy) return;
    setQuestion('');
    setBusy(true);
    update((s) => ({ ...s, open: true, msgs: [...s.msgs, { id: Date.now(), who: 'me', text: q }] }));
    // En la pantalla redonda de la placa: que se note que está consultando a la NASA.
    rover.send({ t: 'card', title: 'Consultando', sub: 'datos de la NASA...', ms: 15000 });
    rover.send({ t: 'pulse', c: '#FFC93C' });
    const speak = stateRef.current.speak;
    const a = await ask(q, { speak }).catch(() => null);
    rover.send({ t: 'pulse', c: '' });
    rover.send({ t: 'card', title: '' });
    // Sin voz, la placa muestra el inicio de la respuesta (con voz, mueve la boca al hablar).
    if (a && !speak) rover.send({ t: 'card', title: a.refs[0]?.label ?? 'Don Rover', sub: boardText(a.text), ms: 10000 });
    setBusy(false);
    update((s) => ({
      ...s,
      msgs: [
        ...s.msgs,
        a
          ? { id: Date.now() + 1, who: 'rover', text: a.text, followUp: a.followUp, refs: a.refs, ai: a.ai }
          : { id: Date.now() + 1, who: 'rover', text: 'Se me cruzaron los cables y no pude contestar. ¿Lo intentas otra vez?' },
      ],
    }));
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(question);
  };

  const mic = async () => {
    if (voiceState().listening) {
      stopListening();
      return;
    }
    const heard = await listen();
    if (heard) void send(heard);
  };
  micRef.current = () => void mic();

  // En la consola del profe la burbuja ocupa su hueco a la izquierda de la barra de abajo (la
  // consola lo deja libre): ahí no se arrastra ni cambia de lado, y sin globito de subtítulo,
  // porque la consola ya muestra los subtítulos grandes.
  const docked = route.path === '/profe';

  // Arrastrar la burbuja hacia arriba o abajo (y tocarla sin arrastrar la abre).
  const onDown = (e: RPointerEvent<HTMLButtonElement>) => {
    drag.current = { startY: e.clientY, baseY: state.y, moved: false };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* nada */
    }
  };
  const onMove = (e: RPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || docked) return;
    const dy = d.startY - e.clientY;
    if (Math.abs(dy) > 6) d.moved = true;
    if (d.moved) setState((s) => ({ ...s, y: clampY(d.baseY + dy) }));
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) update((s) => ({ ...s }));
    else update((s) => ({ ...s, open: !s.open }));
  };

  // En el celular del alumno hay barras abajo: la burbuja sube un poco.
  const lift = route.path === '/jugar' ? 76 : 0;
  const bottom = docked ? 12 : clampY(state.y + lift);
  const side = docked ? 'left' : state.side;
  const linked = status.state === 'on';
  const thinking = busy || voice.thinking;

  return (
    <div className={`rdock ${side} ${state.open ? 'is-open' : ''} ${docked ? 'is-docked' : ''}`} style={{ bottom }}>
      {state.open && (
        <section className="rdock-panel" role="dialog" aria-label="Don Rover, asistente con datos de la NASA">
          <header className="rdock-head">
            <RoverFace expr={voice.face} mouth={voice.mouth} size={44} linked={linked} pulse={voice.listening ? '#B69CFF' : null} />
            <div className="rdock-title">
              <b>Don Rover</b>
              <small>{thinking ? 'Consultando a la NASA…' : voice.speaking ? 'Hablando…' : linked ? 'Con su placa conectada' : 'Pregúntame lo que quieras'}</small>
            </div>
            <button
              className="rdock-icon"
              onClick={() => {
                if (state.speak) stop();
                update((s) => ({ ...s, speak: !s.speak }));
              }}
              aria-pressed={state.speak}
              title={state.speak ? 'Contesta en voz alta' : 'Contesta solo por escrito'}
              aria-label={state.speak ? 'Silenciar a Don Rover' : 'Activar la voz de Don Rover'}
            >
              {state.speak ? '🔊' : '🔇'}
            </button>
            {!docked && (
              <button className="rdock-icon" onClick={() => update((s) => ({ ...s, side: s.side === 'right' ? 'left' : 'right' }))} title="Cambiar de lado" aria-label="Cambiar de lado">
                ⇆
              </button>
            )}
            <button className="rdock-icon" onClick={() => update((s) => ({ ...s, open: false }))} title="Minimizar" aria-label="Minimizar a Don Rover">
              ✕
            </button>
          </header>

          <div className="rdock-list" ref={listRef} aria-live="polite">
            {state.msgs.length === 0 && (
              <div className="rdock-hello">
                <p>
                  ¡Hola! Soy <b>Don Rover</b>. Pregúntame sobre Marte, el espacio o tu misión. Consulto datos reales de la <b>NASA</b>: clima espacial, asteroides, la foto del día y estudios científicos.
                </p>
              </div>
            )}
            {state.msgs.map((m) => (
              <div key={m.id} className={`rdock-msg ${m.who}`}>
                <p>{m.text}</p>
                {m.followUp && <p className="rdock-follow">🤔 {m.followUp}</p>}
                {m.refs && m.refs.length > 0 && (
                  <ul className="rdock-refs">
                    {m.refs.slice(0, 4).map((r, i) => (
                      <li key={i}>
                        {r.image && <img src={r.image} alt={r.title} loading="lazy" />}
                        <a href={r.url} target="_blank" rel="noreferrer">
                          <span>{r.label}</span> {r.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {thinking && (
              <div className="rdock-msg rover typing" aria-label="Don Rover está pensando">
                <i />
                <i />
                <i />
              </div>
            )}
          </div>

          <div className="rdock-quick">
            {QUICK.map((c) => (
              <button key={c.label} onClick={() => void send(c.q)} disabled={thinking}>
                {c.label}
              </button>
            ))}
          </div>

          <form className="rdock-ask" onSubmit={onSubmit}>
            {sttSupported() && (
              <button type="button" className={`rdock-mic ${voice.listening ? 'on' : ''}`} onClick={() => void mic()} disabled={busy} aria-pressed={voice.listening} aria-label={voice.listening ? 'Dejar de escuchar' : 'Preguntar con el micrófono'}>
                {voice.listening ? '⏹' : '🎙️'}
              </button>
            )}
            <input
              ref={inputRef}
              value={voice.listening ? voice.heard : question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={voice.listening ? 'Te escucho…' : '¿Qué quieres saber?'}
              maxLength={300}
              aria-label="Pregunta para Don Rover"
              readOnly={voice.listening}
            />
            <button className="rdock-send" disabled={!question.trim() || thinking} aria-label="Enviar pregunta">
              ➤
            </button>
          </form>
          {state.msgs.length > 0 && (
            <button className="rdock-clear" onClick={() => update((s) => ({ ...s, msgs: [] }))}>
              Borrar conversación
            </button>
          )}
        </section>
      )}

      <button
        className={`rdock-bubble ${thinking ? 'thinking' : ''} ${voice.speaking ? 'speaking' : ''}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => (drag.current = null)}
        aria-expanded={state.open}
        aria-label={state.open ? 'Minimizar a Don Rover' : 'Abrir a Don Rover, asistente con datos de la NASA'}
        title={docked ? 'Don Rover' : 'Don Rover · arrástralo para moverlo'}
      >
        <RoverFace expr={voice.face} mouth={voice.mouth} size={72} linked={linked} pulse={voice.listening ? '#B69CFF' : thinking ? '#FFC93C' : null} />
        {!docked && !state.open && voice.caption && voice.speaking && <span className="rdock-peek">{voice.caption}</span>}
      </button>
    </div>
  );
}
