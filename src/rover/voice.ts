// Voz de Don Rover en la computadora del profe: habla por las bocinas (síntesis de voz del
// navegador), escucha con el micrófono (reconocimiento de voz) y le dice a la placa cuándo
// mover la boca. También guarda el subtítulo de lo que dice, para quien no escucha bien.
//
// La boca se mueve sola en la placa mientras habla ("talk": sílabas propias) y además recibe
// un golpe por cada palabra cuando el navegador avisa de ellas (evento "boundary").

import { rover, type RoverExpr } from './link';

export interface VoiceSettings {
  voiceURI: string;
  rate: number;
  pitch: number;
  volume: number;
  /** Narrar solo las fases y pistas del juego. */
  narrate: boolean;
  /** Subtítulos grandes en el proyector. */
  captions: boolean;
}

export interface VoiceState {
  speaking: boolean;
  listening: boolean;
  thinking: boolean;
  /** Lo que Don Rover está diciendo (o dijo hace poco). */
  caption: string;
  /** Lo que se está escuchando del micrófono. */
  heard: string;
  face: RoverExpr;
  /** 0–1: apertura de la boca para la cara en pantalla. */
  mouth: number;
  error: string;
}

const KEY = 'donrover.voz';

export function loadVoiceSettings(): VoiceSettings {
  const base: VoiceSettings = { voiceURI: '', rate: 1, pitch: 1.05, volume: 1, narrate: true, captions: true };
  try {
    return { ...base, ...(JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<VoiceSettings>) };
  } catch {
    return base;
  }
}

let settings = loadVoiceSettings();

export function setVoiceSettings(patch: Partial<VoiceSettings>): VoiceSettings {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* nada */
  }
  emit();
  return settings;
}

export const voiceSettings = () => settings;

/* ---------------- estado compartido con la interfaz ---------------- */

let state: VoiceState = { speaking: false, listening: false, thinking: false, caption: '', heard: '', face: 'neutral', mouth: 0, error: '' };
const listeners = new Set<(s: VoiceState) => void>();

function emit(): void {
  for (const fn of listeners) fn(state);
}

function patch(p: Partial<VoiceState>): void {
  state = { ...state, ...p };
  emit();
}

export function onVoice(fn: (s: VoiceState) => void): () => void {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export const voiceState = () => state;

/** Cambia la cara en la placa y en la pantalla. */
export function setFace(e: RoverExpr, ms = 0): void {
  patch({ face: e });
  rover.send({ t: 'face', e, ...(ms ? { ms } : {}) });
  if (ms) {
    const mine = e;
    setTimeout(() => {
      if (state.face === mine && !state.listening && !state.thinking) patch({ face: 'neutral' });
    }, ms);
  }
}

/* ---------------- hablar ---------------- */

export const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Voces en español, primero las de México y las "naturales" (mejor calidad). */
export function spanishVoices(): SpeechSynthesisVoice[] {
  if (!ttsSupported()) return [];
  const all = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('es'));
  const score = (v: SpeechSynthesisVoice) =>
    (v.lang === 'es-MX' ? 40 : v.lang === 'es-US' || v.lang === 'es-419' ? 30 : 10) + (/natural|online|google/i.test(v.name) ? 8 : 0) + (v.localService ? 1 : 0);
  return all.sort((a, b) => score(b) - score(a));
}

function pickVoice(): SpeechSynthesisVoice | null {
  const list = spanishVoices();
  return list.find((v) => v.voiceURI === settings.voiceURI) ?? list[0] ?? null;
}

/** El navegador corta los textos largos: se dicen por frases. */
function sentences(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').replace(/[*_#>`]/g, '').trim();
  const parts = clean.match(/[^.!?¿¡]*[¡¿]?[^.!?]*[.!?…]+|[^.!?]+$/g) ?? [clean];
  const out: string[] = [];
  for (const p of parts.map((s) => s.trim()).filter(Boolean)) {
    if (out.length && (out[out.length - 1] + ' ' + p).length < 160) out[out.length - 1] += ' ' + p;
    else out.push(p);
  }
  return out;
}

let token = 0;
let mouthTimer: ReturnType<typeof setInterval> | null = null;
let lastSaid = '';
let lastFace: RoverExpr = 'neutral';

/** Boca en pantalla: sílabas aproximadas mientras habla (y golpes de cada palabra). */
function startMouth(): void {
  if (mouthTimer) return;
  let phase = 0;
  let rate = 4.3;
  let pause = false;
  let last = performance.now();
  let pulse = 0;
  mouthTimer = setInterval(() => {
    const now = performance.now();
    const dt = (now - last) / 1000;
    last = now;
    phase += dt * rate * Math.PI;
    if (phase > Math.PI) {
      phase -= Math.PI;
      rate = 3.4 + Math.random() * 1.8;
      pause = Math.random() < 0.12;
    }
    pulse = Math.max(0, pulse - dt * 5);
    const syl = pause ? 0.05 : 0.2 + 0.65 * Math.pow(Math.abs(Math.sin(phase)), 0.7);
    patch({ mouth: Math.max(syl, pulse) });
  }, 50);
  wordPulse = (v: number) => {
    pulse = Math.max(pulse, v);
  };
}

let wordPulse: (v: number) => void = () => {};

function stopMouth(): void {
  if (mouthTimer) clearInterval(mouthTimer);
  mouthTimer = null;
  wordPulse = () => {};
  patch({ mouth: 0 });
}

export interface SayOptions {
  face?: RoverExpr;
  /** Interrumpe lo que esté diciendo (por defecto, sí). */
  interrupt?: boolean;
  /** No guardarlo como "lo último que dijo" (para repetir). */
  noRepeat?: boolean;
}

/** Don Rover dice algo en voz alta: bocinas de la computadora + boca en la placa y en pantalla. */
export async function say(text: string, opts: SayOptions = {}): Promise<void> {
  const clean = text.trim();
  if (!clean) return;
  if (!opts.noRepeat) {
    lastSaid = clean;
    lastFace = opts.face ?? 'neutral';
  }
  if (opts.interrupt !== false) stop();
  const my = ++token;
  if (opts.face) setFace(opts.face);
  patch({ caption: clean, speaking: true, error: '' });
  rover.send({ t: 'talk', on: 1 });
  startMouth();
  if (!ttsSupported()) {
    // Sin voz: la boca se mueve el tiempo que tomaría leerlo.
    await new Promise((r) => setTimeout(r, Math.min(15000, 380 * clean.split(/\s+/).length)));
  } else {
    for (const part of sentences(clean)) {
      if (my !== token) return;
      await new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(part);
        const v = pickVoice();
        if (v) u.voice = v;
        u.lang = v?.lang ?? 'es-MX';
        u.rate = settings.rate;
        u.pitch = settings.pitch;
        u.volume = settings.volume;
        u.onboundary = (e) => {
          if (e.name && e.name !== 'word') return;
          wordPulse(0.85);
          rover.mouth(0.85);
        };
        const done = () => resolve();
        u.onend = done;
        u.onerror = done;
        // Seguro: algunos navegadores no avisan el final.
        setTimeout(done, 2500 + part.length * 110);
        speechSynthesis.speak(u);
      });
    }
  }
  if (my !== token) return;
  finishSpeaking();
}

function finishSpeaking(): void {
  stopMouth();
  rover.send({ t: 'talk', on: 0 });
  patch({ speaking: false });
  if (state.face !== 'listen' && state.face !== 'think') {
    // Después de hablar vuelve a la cara normal en un momento.
    const face = state.face;
    setTimeout(() => {
      if (!state.speaking && state.face === face && face !== 'neutral' && face !== 'sleep') setFace('neutral');
    }, 1800);
  }
  setTimeout(() => {
    if (!state.speaking) patch({ caption: '' });
  }, 6000);
}

/** Calla a Don Rover. */
export function stop(): void {
  token++;
  if (ttsSupported()) speechSynthesis.cancel();
  if (state.speaking) finishSpeaking();
}

/** Repite lo último que dijo (botón de la placa o de la consola). */
export function repeat(): Promise<void> {
  if (!lastSaid) return say('Todavía no he dicho nada. Presiona mi botón largo para hacerme una pregunta.', { face: 'happy', noRepeat: true });
  return say(lastSaid, { face: lastFace });
}

/* ---------------- escuchar ---------------- */

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

const Recognition = (): (new () => RecognitionLike) | null => {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const sttSupported = () => Recognition() !== null;

let active: RecognitionLike | null = null;

const MIC_ERRORS: Record<string, string> = {
  'not-allowed': 'El navegador no tiene permiso para usar el micrófono. Actívalo en el candado de la barra de direcciones.',
  'service-not-allowed': 'El navegador no permite el reconocimiento de voz en esta página.',
  'audio-capture': 'No se encontró un micrófono conectado a la computadora.',
  network: 'El reconocimiento de voz necesita internet.',
  'no-speech': 'No escuché nada. Intenta de nuevo y habla cerca del micrófono.',
};

/** Escucha una pregunta por el micrófono. Devuelve el texto (vacío si no se entendió). */
export function listen(): Promise<string> {
  const R = Recognition();
  if (!R) {
    patch({ error: 'Este navegador no puede escuchar. Usa Chrome o Edge, o escribe la pregunta.' });
    return Promise.resolve('');
  }
  stop();
  active?.abort();
  return new Promise((resolve) => {
    const rec = new R();
    active = rec;
    rec.lang = 'es-MX';
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let text = '';
    patch({ listening: true, heard: '', error: '' });
    setFace('listen');
    rover.send({ t: 'pulse', c: '#B69CFF' });
    rec.onresult = (e) => {
      let all = '';
      for (let i = 0; i < e.results.length; i++) all += e.results[i][0].transcript;
      text = all.trim();
      patch({ heard: text });
      rover.send({ t: 'look', x: Math.round(Math.random() * 40 - 20), y: -20 });
    };
    rec.onerror = (e) => {
      if (e.error !== 'aborted') patch({ error: MIC_ERRORS[e.error] ?? `El micrófono falló (${e.error}).` });
    };
    rec.onend = () => {
      if (active === rec) active = null;
      rover.send({ t: 'pulse', c: '' });
      patch({ listening: false });
      if (!text) setFace('neutral');
      resolve(text);
    };
    try {
      rec.start();
    } catch {
      patch({ listening: false, error: 'No se pudo encender el micrófono.' });
      resolve('');
    }
  });
}

/** Deja de escuchar ya (se queda con lo que oyó hasta ahora). */
export function stopListening(): void {
  active?.stop();
}

export function setThinking(on: boolean): void {
  patch({ thinking: on });
  if (on) setFace('think');
}

// Las voces cargan después de abrir la página.
if (ttsSupported()) speechSynthesis.onvoiceschanged = () => emit();
