// Efectos de sonido sintetizados con Web Audio (sin archivos: todo funciona sin conexión).
// Todo pasa por un compresor suave para que ningún efecto suene más fuerte que otro, y el
// botón de silencio (guardado en el navegador) apaga todo de golpe.

let ctx: AudioContext | null = null;
let out: AudioNode | null = null;
let noise: AudioBuffer | null = null;
let muted = (() => {
  try {
    return localStorage.getItem('ixchel.mute') === '1';
  } catch {
    return false;
  }
})();

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      const master = ctx.createGain();
      master.gain.value = 0.9;
      comp.connect(master).connect(ctx.destination);
      out = comp;
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.12, when = 0, slideTo?: number) {
  const a = ac();
  if (!a || !out) return;
  const t0 = a.currentTime + when;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** Ruido filtrado: viento, golpes, polvo, el soplido de una puerta de esclusa. */
function hissNoise(dur: number, { freq = 1200, q = 0.8, gain = 0.1, when = 0, type = 'bandpass' as BiquadFilterType, sweepTo }: { freq?: number; q?: number; gain?: number; when?: number; type?: BiquadFilterType; sweepTo?: number } = {}) {
  const a = ac();
  if (!a || !out) return;
  if (!noise) {
    noise = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t0 = a.currentTime + when;
  const src = a.createBufferSource();
  src.buffer = noise;
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t0);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.03, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t0, Math.random());
  src.stop(t0 + dur + 0.05);
}

const arp = (notes: number[], step = 0.08, type: OscillatorType = 'triangle', gain = 0.1, when = 0) =>
  notes.forEach((n, i) => tone(n, step * 1.8, type, gain, when + i * step));

/** Acorde suave (las notas suenan juntas y se apagan despacio). */
const chord = (notes: number[], dur = 0.9, gain = 0.05, when = 0, type: OscillatorType = 'sine') => notes.forEach((n) => tone(n, dur, type, gain, when));

export const sfx = {
  pop: () => {
    tone(620, 0.09, 'triangle', 0.12);
    tone(930, 0.07, 'sine', 0.06, 0.04);
  },
  join: () => arp([523, 659, 784], 0.07),
  select: () => tone(880, 0.06, 'square', 0.04),
  lock: () => {
    tone(440, 0.08, 'square', 0.06);
    tone(660, 0.12, 'square', 0.06, 0.08);
  },
  success: () => arp([523, 659, 784, 1046], 0.09, 'triangle', 0.12),
  fail: () => {
    tone(392, 0.2, 'sawtooth', 0.06);
    tone(294, 0.3, 'sawtooth', 0.06, 0.18);
  },
  alarm: () => {
    for (let i = 0; i < 3; i++) tone(620, 0.32, 'sawtooth', 0.05, i * 0.38, 920);
  },
  unlock: () => arp([784, 988, 1175, 1568], 0.06, 'sine', 0.1),
  tick: () => tone(1300, 0.03, 'square', 0.025),
  scan: () => tone(280, 0.9, 'sine', 0.06, 0, 1400),
  tap: () => tone(480 + Math.random() * 260, 0.045, 'triangle', 0.05),
  whoosh: () => hissNoise(0.45, { freq: 300, sweepTo: 2600, q: 1.2, gain: 0.08 }),
  /** Nota de una escala (minijuego de patrones). */
  note: (i: number) => tone([392, 494, 587, 698, 784, 988][i % 6], 0.32, 'triangle', 0.1),
  /** Siseo corto (fugas). */
  hiss: () => tone(1800, 0.12, 'sawtooth', 0.015, 0, 900),

  /* ---------------- consola ---------------- */

  /** Cambio de etapa: un soplido y un acorde que sube. */
  phase: () => {
    hissNoise(0.5, { freq: 400, sweepTo: 3000, q: 1, gain: 0.05 });
    chord([392, 523, 659], 0.8, 0.035, 0.12);
    tone(1046, 0.35, 'sine', 0.03, 0.3);
  },
  /** Aparece una tarjeta o se abre un panel. */
  card: () => hissNoise(0.18, { freq: 2400, q: 0.7, gain: 0.03 }),
  /** Cuenta regresiva (3, 2, 1) y salida. */
  count: () => tone(660, 0.12, 'square', 0.05),
  go: () => {
    tone(990, 0.35, 'square', 0.06);
    chord([523, 659, 784, 1046], 0.6, 0.04, 0.05, 'triangle');
  },
  /** Silbato de fin de ronda. */
  whistle: () => {
    tone(2100, 0.18, 'sine', 0.06, 0, 2300);
    tone(2100, 0.45, 'sine', 0.06, 0.2, 2250);
  },
  /** Redoble antes de mostrar resultados. */
  drumroll: (seconds = 1.2) => {
    const n = Math.floor(seconds / 0.055);
    for (let i = 0; i < n; i++) hissNoise(0.05, { freq: 180 + (i % 2) * 40, q: 0.6, gain: 0.05 + (i / n) * 0.05, when: i * 0.055, type: 'lowpass' });
  },
  /** Fanfarria de victoria. */
  fanfare: () => {
    arp([523, 523, 523, 659], 0.11, 'square', 0.05);
    chord([523, 659, 784], 0.9, 0.05, 0.5, 'triangle');
    chord([698, 880, 1046], 1.2, 0.05, 0.95, 'triangle');
  },

  /* ---------------- torneo ---------------- */

  /** Clic de la ruleta (más agudo cuanto más rápido gira). */
  spin: (speed = 1) => tone(900 + speed * 500, 0.03, 'square', 0.03),
  /** Gana celdas de energía. */
  coin: () => {
    tone(1320, 0.07, 'square', 0.04);
    tone(1760, 0.18, 'square', 0.04, 0.06);
  },
  /** Cristal de hielo: un destello que sube. */
  crystal: () => {
    arp([1046, 1318, 1568, 2093, 2637], 0.05, 'sine', 0.06);
    hissNoise(0.4, { freq: 6000, q: 2, gain: 0.02, when: 0.1 });
  },
  /** Lluvia de meteoritos: golpe grave con polvo. */
  meteor: () => {
    tone(140, 0.5, 'sawtooth', 0.08, 0, 50);
    hissNoise(0.7, { freq: 500, sweepTo: 120, q: 0.5, gain: 0.12, type: 'lowpass' });
  },
  /** Tormenta de polvo: viento que pasa. */
  storm: () => hissNoise(1.4, { freq: 300, sweepTo: 900, q: 0.4, gain: 0.09 }),
  /** Avanza una casilla en el tablero. */
  step: (i = 0) => tone(520 + (i % 5) * 70, 0.06, 'triangle', 0.06),
  /** Lugar en el podio (1 = primero). */
  place: (n: number) => (n === 1 ? sfx.fanfare() : arp(n === 2 ? [523, 659, 784] : [440, 523, 659], 0.09, 'triangle', 0.08)),

  /* ---------------- minar y fabricar ---------------- */

  /** Golpe de pico contra la roca. */
  mine: () => {
    tone(1500 + Math.random() * 400, 0.05, 'square', 0.05);
    hissNoise(0.12, { freq: 2600, q: 1.5, gain: 0.06 });
  },
  /** Recurso a la mochila. */
  pickup: () => arp([660, 990], 0.05, 'sine', 0.07),
  /** Impresora 3D trabajando (llamar varias veces) y ding al terminar. */
  print: () => tone(180 + Math.random() * 90, 0.09, 'sawtooth', 0.025),
  crafted: () => {
    chord([523, 784, 1046], 0.7, 0.05, 0, 'triangle');
    arp([1318, 1568], 0.08, 'sine', 0.06, 0.2);
  },
};

export function isMuted() {
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem('ixchel.mute', m ? '1' : '0');
  } catch {
    /* nada */
  }
}

/** Desbloquea el audio en móviles (requiere un gesto del usuario). */
export function primeAudio() {
  ac();
}
