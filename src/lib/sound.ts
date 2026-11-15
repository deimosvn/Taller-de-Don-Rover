// Efectos de sonido sintetizados con Web Audio (sin archivos: todo funciona sin conexión).

let ctx: AudioContext | null = null;
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
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.12, when = 0, slideTo?: number) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + when;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

const arp = (notes: number[], step = 0.08, type: OscillatorType = 'triangle', gain = 0.1) =>
  notes.forEach((n, i) => tone(n, step * 1.8, type, gain, i * step));

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
  whoosh: () => tone(200, 0.35, 'sine', 0.05, 0, 900),
  /** Nota de una escala (minijuego de patrones). */
  note: (i: number) => tone([392, 494, 587, 698, 784, 988][i % 6], 0.32, 'triangle', 0.1),
  /** Siseo corto (fugas). */
  hiss: () => tone(1800, 0.12, 'sawtooth', 0.015, 0, 900),
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
