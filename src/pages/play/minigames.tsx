// Minijuegos realistas de la emergencia global. Cada especialidad hace una tarea concreta de
// su sistema; lo bien que la haga se convierte en "acciones" para el motor del juego.
//
//   scrub ..... frotar el polvo de los paneles solares
//   gauge ..... mantener un indicador (presión, CO₂, temperatura…) en la zona segura
//   targets ... encontrar y sellar fugas, puntos de calor, grietas…
//   aim ....... orientar paneles o la antena hacia el Sol o la Tierra
//   dose ...... dar a cada planta la cantidad justa de agua o de luz
//   wires ..... conectar cada pieza con su pareja
//   pattern ... repetir el patrón de una señal o el orden de encendido

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent, type ReactElement } from 'react';
import type { AimTheme, DoseTheme, GaugeSpec, MinigameSpec, PatternTheme, TargetTheme, WiresTheme } from '../../../shared/minigames';
import { vibrate } from '../../lib/pwa';
import { sfx } from '../../lib/sound';

type Award = (points: number, at?: { x: number; y: number }) => void;

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

/** "1 módulo completo" / "3 módulos completos". */
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Captura el puntero si se puede (algunos navegadores lo rechazan y no debe romper el juego). */
function capture(e: RPointerEvent<Element>) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    /* sin captura: el juego sigue funcionando */
  }
}

/** Bucle de animación con dt en segundos. */
function useLoop(cb: (dt: number, t: number) => void) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const t0 = last;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      ref.current(dt, (now - t0) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}

/** Acumula puntos por segundo y los entrega enteros. */
function useRate(award: Award) {
  const acc = useRef(0);
  return (perSecond: number, dt: number, at?: { x: number; y: number }) => {
    acc.current += perSecond * dt;
    if (acc.current >= 1) {
      const n = Math.floor(acc.current);
      acc.current -= n;
      award(n, at);
    }
  };
}

export function Minigame({ spec, color, dark, onPoints }: { spec: MinigameSpec; color: string; dark: string; onPoints: (n: number) => void }) {
  const [floats, setFloats] = useState<{ id: number; n: number; x: number; y: number }[]>([]);
  const nextId = useRef(0);
  const award: Award = (n, at) => {
    if (n <= 0) return;
    onPoints(n);
    const id = nextId.current++;
    setFloats((f) => [...f.slice(-6), { id, n, x: at?.x ?? 50, y: at?.y ?? 30 }]);
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 850);
  };
  let game: ReactElement;
  switch (spec.kind) {
    case 'gauge':
      game = <Gauge g={spec.gauge!} award={award} />;
      break;
    case 'targets':
      game = <Targets theme={spec.targets ?? 'leak'} award={award} />;
      break;
    case 'aim':
      game = <Aim theme={spec.aim ?? 'sun'} award={award} />;
      break;
    case 'dose':
      game = <Dose theme={spec.dose ?? 'drip'} award={award} />;
      break;
    case 'wires':
      game = <Wires theme={spec.wires ?? 'power'} award={award} />;
      break;
    case 'pattern':
      game = <Pattern theme={spec.pattern ?? 'signal'} award={award} />;
      break;
    default:
      game = <Scrub award={award} />;
  }
  return (
    <div className="mg" style={{ '--c': color, '--cd': dark } as CSSProperties}>
      <p className="mg-how">{spec.how}</p>
      <div className={`mg-stage kind-${spec.kind}`}>
        {game}
        {floats.map((f) => (
          <i key={f.id} className="mg-float" style={{ left: `${f.x}%`, top: `${f.y}%` }}>
            +{f.n}
          </i>
        ))}
      </div>
      <details className="mg-science">
        <summary>🔬 Dato real · {spec.source}</summary>
        <p>{spec.science}</p>
      </details>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Limpiar paneles                                                      */
/* ------------------------------------------------------------------ */

const GRID_X = 24;
const GRID_Y = 15;

function Scrub({ award }: { award: Award }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const grid = useRef<Uint8Array>(new Uint8Array(GRID_X * GRID_Y));
  const last = useRef<{ x: number; y: number } | null>(null);
  const paid = useRef(0);
  const swapping = useRef(false);
  const [pct, setPct] = useState(0);
  const [panels, setPanels] = useState(0);

  const dust = () => {
    const c = canvas.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.max(1, Math.round(r.width * dpr));
    c.height = Math.max(1, Math.round(r.height * dpr));
    const g = c.getContext('2d')!;
    g.globalCompositeOperation = 'source-over';
    const grad = g.createLinearGradient(0, 0, c.width, c.height);
    grad.addColorStop(0, '#c98a5b');
    grad.addColorStop(1, '#a8603d');
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = Math.random() < 0.5 ? 'rgba(90,40,20,0.25)' : 'rgba(255,220,180,0.18)';
      const s = (2 + Math.random() * 7) * dpr;
      g.beginPath();
      g.arc(Math.random() * c.width, Math.random() * c.height, s, 0, Math.PI * 2);
      g.fill();
    }
    grid.current.fill(0);
    paid.current = 0;
    swapping.current = false;
    setPct(0);
  };

  useEffect(() => {
    dust();
    const onResize = () => dust();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrub = (clientX: number, clientY: number) => {
    const c = canvas.current;
    if (!c || swapping.current) return;
    const r = c.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    const sx = c.width / r.width;
    const g = c.getContext('2d')!;
    g.globalCompositeOperation = 'destination-out';
    g.lineCap = 'round';
    g.lineWidth = 52 * sx;
    g.beginPath();
    const from = last.current ?? { x, y };
    g.moveTo(from.x * sx, from.y * sx);
    g.lineTo(x * sx, y * sx);
    g.stroke();
    last.current = { x, y };
    // Celdas limpiadas a lo largo de todo el trazo (para medir sin leer pixeles).
    const rad = 28;
    const steps = Math.max(1, Math.ceil(Math.hypot(x - from.x, y - from.y) / 10));
    for (let k = 0; k <= steps; k++) {
      const px = from.x + ((x - from.x) * k) / steps;
      const py = from.y + ((y - from.y) * k) / steps;
      for (let gy = 0; gy < GRID_Y; gy++) {
        for (let gx = 0; gx < GRID_X; gx++) {
          const cx = ((gx + 0.5) / GRID_X) * r.width;
          const cy = ((gy + 0.5) / GRID_Y) * r.height;
          if (Math.hypot(cx - px, cy - py) < rad) grid.current[gy * GRID_X + gx] = 1;
        }
      }
    }
    const done = grid.current.reduce((a, b) => a + b, 0) / grid.current.length;
    const p = Math.round(done * 100);
    setPct(p);
    const tens = Math.floor(p / 10);
    if (tens > paid.current) {
      award(tens - paid.current, { x: (x / r.width) * 100, y: (y / r.height) * 100 });
      paid.current = tens;
      sfx.tap();
    }
    if (p >= 90) {
      swapping.current = true;
      award(4, { x: 50, y: 40 });
      sfx.success();
      vibrate([20, 30, 20]);
      setPanels((n) => n + 1);
      setTimeout(dust, 420);
    }
  };

  return (
    <div className="scrub">
      <div className="scrub-panel" aria-hidden>
        {Array.from({ length: 18 }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <canvas
        ref={canvas}
        className="scrub-dust"
        onPointerDown={(e) => {
          last.current = null;
          scrub(e.clientX, e.clientY);
          capture(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons || e.pointerType === 'touch') scrub(e.clientX, e.clientY);
        }}
        onPointerUp={() => (last.current = null)}
        aria-label="Panel solar cubierto de polvo: frota para limpiarlo"
      />
      <div className="mg-hud">
        <span>⚡ Energía del panel: <b className="mono">{Math.round(20 + pct * 0.8)}%</b></span>
        <span>🧽 Paneles limpios: <b className="mono">{panels}</b></span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Indicador con zona segura                                            */
/* ------------------------------------------------------------------ */

function Gauge({ g, award }: { g: GaugeSpec; award: Award }) {
  const value = useRef(g.start);
  const hold = useRef(false);
  const wasIn = useRef(false);
  const [, render] = useState(0);
  const rate = useRate(award);
  const span = g.max - g.min;

  useLoop((dt, t) => {
    const dir = g.push === 'up' ? 1 : -1;
    const wobble = (Math.sin(t * 1.7) * 0.6 + Math.sin(t * 4.1 + 1.3) * 0.4) * g.drift * 0.35;
    value.current = clamp(value.current + (hold.current ? dir * g.rate : -dir * g.drift) * dt + wobble * dt, g.min, g.max);
    const inZone = value.current >= g.low && value.current <= g.high;
    if (inZone) rate(2.4, dt, { x: 50, y: 20 });
    if (inZone && !wasIn.current) {
      vibrate(12);
      sfx.select();
    }
    wasIn.current = inZone;
    render((n) => (n + 1) % 1000);
  });

  const ang = (v: number) => -120 + (240 * (v - g.min)) / span;
  const polar = (deg: number, r: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return [150 + Math.cos(a) * r, 150 + Math.sin(a) * r];
  };
  const arc = (a0: number, a1: number, r: number) => {
    const [x0, y0] = polar(a0, r);
    const [x1, y1] = polar(a1, r);
    return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  const v = value.current;
  const inZone = v >= g.low && v <= g.high;
  const [nx, ny] = polar(ang(v), 92);
  const status = inZone ? '✅ En zona segura' : v < g.low ? '⬆️ Muy bajo' : '⬇️ Muy alto';
  const dec = g.decimals ?? 0;

  const press = (on: boolean) => (e: RPointerEvent<HTMLButtonElement>) => {
    hold.current = on;
    if (on) capture(e);
  };

  return (
    <div className="gauge-game">
      <svg viewBox="0 0 300 220" className="gauge-svg" role="img" aria-label={`${g.label}: ${v.toFixed(dec)} ${g.unit}`}>
        <path d={arc(-120, 120, 110)} className="gauge-track" />
        <path d={arc(ang(g.low), ang(g.high), 110)} className="gauge-safe" />
        {Array.from({ length: 13 }, (_, i) => {
          const a = -120 + i * 20;
          const [x0, y0] = polar(a, 98);
          const [x1, y1] = polar(a, 122);
          return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} className="gauge-tick" />;
        })}
        <line x1={150} y1={150} x2={nx} y2={ny} className={`gauge-needle ${inZone ? 'ok' : ''}`} />
        <circle cx={150} cy={150} r={12} className="gauge-hub" />
        <text x={150} y={196} className="gauge-value">
          {v.toFixed(dec)} {g.unit}
        </text>
      </svg>
      <div className="mg-hud">
        <span>{g.label}</span>
        <span>
          Zona segura: {g.low}–{g.high} {g.unit}
        </span>
      </div>
      <p className={`gauge-status ${inZone ? 'ok' : 'bad'}`}>{status}</p>
      <button className="hold-btn" onPointerDown={press(true)} onPointerUp={press(false)} onPointerCancel={press(false)} onLostPointerCapture={() => (hold.current = false)}>
        {g.push === 'up' ? '⬆️' : '⬇️'} {g.button} <small>(mantén presionado)</small>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Encontrar y sellar                                                   */
/* ------------------------------------------------------------------ */

const TARGET_LOOK: Record<TargetTheme, { live: string; done: string; miss: string; hint: string }> = {
  leak: { live: '💨', done: '🩹', miss: '💧', hint: 'fugas selladas' },
  hatch: { live: '🌀', done: '🔒', miss: '💨', hint: 'compuertas selladas' },
  sprout: { live: '🌱', done: '🛡️', miss: '🍂', hint: 'brotes protegidos' },
  heat: { live: '🔥', done: '🧊', miss: '♨️', hint: 'puntos aislados' },
  pot: { live: '🪴', done: '✅', miss: '💥', hint: 'macetas mudadas' },
  crack: { live: '💥', done: '🧱', miss: '☢️', hint: 'grietas reforzadas' },
};

interface Target {
  id: number;
  x: number;
  y: number;
  born: number;
  life: number;
  state: 'live' | 'done' | 'miss';
  ended: number;
}

function Targets({ theme, award }: { theme: TargetTheme; award: Award }) {
  const itemsRef = useRef<Target[]>([]);
  const [items, setItems] = useState<Target[]>([]);
  const timer = useRef(0.4);
  const clock = useRef(0);
  const nextId = useRef(0);
  const [score, setScore] = useState({ done: 0, miss: 0 });
  const look = TARGET_LOOK[theme];

  const commit = (list: Target[]) => {
    itemsRef.current = list;
    setItems(list);
  };

  useLoop((dt, t) => {
    clock.current = t;
    timer.current -= dt;
    let changed = false;
    let misses = 0;
    let out = itemsRef.current.map((i) => {
      if (i.state === 'live' && t - i.born > i.life) {
        changed = true;
        misses++;
        return { ...i, state: 'miss' as const, ended: t };
      }
      return i;
    });
    const before = out.length;
    out = out.filter((i) => i.state === 'live' || t - i.ended < 0.6);
    if (out.length !== before) changed = true;
    const live = out.filter((i) => i.state === 'live').length;
    if (timer.current <= 0 && live < 4) {
      timer.current = 0.75 + Math.random() * 0.55;
      let x = 0;
      let y = 0;
      for (let k = 0; k < 8; k++) {
        x = 12 + Math.random() * 76;
        y = 14 + Math.random() * 70;
        if (out.every((o) => Math.hypot(o.x - x, o.y - y) > 20)) break;
      }
      out = [...out, { id: nextId.current++, x, y, born: t, life: 2.6 + Math.random() * 0.8, state: 'live', ended: 0 }];
      if (theme === 'leak' || theme === 'hatch') sfx.hiss();
      changed = true;
    }
    if (changed) commit(out);
    if (misses) setScore((s) => ({ ...s, miss: s.miss + misses }));
  });

  const hit = (id: number) => {
    const target = itemsRef.current.find((i) => i.id === id && i.state === 'live');
    if (!target) return;
    commit(itemsRef.current.map((i) => (i.id === id ? { ...i, state: 'done' as const, ended: clock.current } : i)));
    award(3, { x: target.x, y: target.y - 8 });
    sfx.pop();
    vibrate(15);
    setScore((s) => ({ ...s, done: s.done + 1 }));
  };

  return (
    <div className={`targets theme-${theme}`}>
      {items.map((i) => (
        <button
          key={i.id}
          className={`target ${i.state}`}
          style={{ left: `${i.x}%`, top: `${i.y}%`, ['--life' as string]: `${i.life}s` }}
          onPointerDown={() => hit(i.id)}
          aria-label="Sellar"
        >
          <svg viewBox="0 0 64 64" className="target-ring" aria-hidden>
            <circle cx="32" cy="32" r="28" />
          </svg>
          <span>{i.state === 'live' ? look.live : i.state === 'done' ? look.done : look.miss}</span>
        </button>
      ))}
      <div className="mg-hud floating">
        <span>
          ✅ {score.done} {look.hint}
        </span>
        <span>❌ {plural(score.miss, 'se escapó', 'se escaparon')}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Orientar paneles o antena                                            */
/* ------------------------------------------------------------------ */

function Aim({ theme, award }: { theme: AimTheme; award: Award }) {
  const aim = useRef(-35);
  const target = useRef(0);
  const drag = useRef<{ x: number; aim: number } | null>(null);
  const phase = useRef(Math.random() * 6);
  const [, render] = useState(0);
  const rate = useRate(award);

  useLoop((dt, t) => {
    target.current = 52 * Math.sin(t * 0.33 + phase.current) + 12 * Math.sin(t * 1.1 + 2);
    const diff = Math.abs(aim.current - target.current);
    if (diff < 9) rate(2.4, dt, { x: 50, y: 18 });
    else if (diff < 18) rate(0.9, dt, { x: 50, y: 18 });
    render((n) => (n + 1) % 1000);
  });

  const diff = Math.abs(aim.current - target.current);
  const bars = diff < 5 ? 5 : diff < 9 ? 4 : diff < 14 ? 3 : diff < 20 ? 2 : diff < 30 ? 1 : 0;
  const rad = (d: number) => ((d - 90) * Math.PI) / 180;
  const tx = 150 + Math.cos(rad(target.current)) * 120;
  const ty = 200 + Math.sin(rad(target.current)) * 120;
  const bx = 150 + Math.cos(rad(aim.current)) * 200;
  const by = 200 + Math.sin(rad(aim.current)) * 200;
  const sun = theme === 'sun';

  return (
    <div
      className={`aim theme-${theme}`}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, aim: aim.current };
        capture(e);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        aim.current = clamp(drag.current.aim + (e.clientX - drag.current.x) * 0.45, -75, 75);
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      <svg viewBox="0 0 300 220" className="aim-svg" role="img" aria-label={sun ? 'Sigue al Sol con los paneles' : 'Apunta la antena a la Tierra'}>
        <path d="M 30 200 A 120 120 0 0 1 270 200" className="aim-track" />
        <line x1={150} y1={200} x2={bx} y2={by} className={`aim-beam ${bars >= 4 ? 'locked' : ''}`} />
        <text x={tx} y={ty + 9} className="aim-target">
          {sun ? '☀️' : '🌍'}
        </text>
        <g transform={`rotate(${aim.current} 150 200)`}>
          {sun ? (
            <>
              <rect x={150 - 46} y={168} width={92} height={14} rx={3} className="aim-panel" />
              <line x1={150} y1={182} x2={150} y2={210} className="aim-post" />
            </>
          ) : (
            <>
              <path d="M 112 176 Q 150 214 188 176" className="aim-dish" />
              <line x1={150} y1={196} x2={150} y2={168} className="aim-post" />
              <circle cx={150} cy={166} r={5} className="aim-feed" />
            </>
          )}
        </g>
      </svg>
      {sun && <div className="aim-dust" aria-hidden />}
      <div className="mg-hud">
        <span>
          {sun ? '☀️ Luz captada' : '📶 Señal'}: <b className="signal-bars">{'▮'.repeat(bars) + '▯'.repeat(5 - bars)}</b>
        </span>
        <span>↔️ Desliza para girar</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dosificar agua o luz                                                 */
/* ------------------------------------------------------------------ */

function newBand() {
  const lo = 0.45 + Math.random() * 0.3;
  return { lo, hi: lo + 0.14 };
}

function Dose({ theme, award }: { theme: DoseTheme; award: Award }) {
  const level = useRef(0);
  const hold = useRef(false);
  const [band, setBand] = useState(newBand);
  const [slot, setSlot] = useState(0);
  const [result, setResult] = useState<'ok' | 'over' | null>(null);
  const [stats, setStats] = useState({ ok: 0, over: 0 });
  const busy = useRef(false);
  const [, render] = useState(0);

  useLoop((dt) => {
    if (hold.current && !busy.current) level.current = Math.min(1.05, level.current + dt * 0.42);
    render((n) => (n + 1) % 1000);
  });

  const next = () => {
    level.current = 0;
    busy.current = false;
    setResult(null);
    setBand(newBand());
    setSlot((s) => (s + 1) % 3);
  };

  const release = () => {
    if (!hold.current) return;
    hold.current = false;
    if (busy.current) return;
    const l = level.current;
    if (l >= band.lo && l <= band.hi) {
      busy.current = true;
      setResult('ok');
      award(5, { x: 20 + slot * 30, y: 30 });
      sfx.success();
      vibrate([15, 25, 15]);
      setStats((s) => ({ ...s, ok: s.ok + 1 }));
      setTimeout(next, 650);
    } else if (l > band.hi) {
      busy.current = true;
      setResult('over');
      sfx.fail();
      vibrate(40);
      setStats((s) => ({ ...s, over: s.over + 1 }));
      setTimeout(next, 900);
    }
  };

  const led = theme === 'led';
  const l = level.current;
  return (
    <div className={`dose theme-${theme}`}>
      <div className="dose-row">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`dose-plant ${i === slot ? 'active' : ''} ${i === slot && result ? result : ''}`}>
            <div className="dose-meter">
              {i === slot && <i className="dose-band" style={{ bottom: `${band.lo * 100}%`, height: `${(band.hi - band.lo) * 100}%` }} />}
              <em style={{ height: `${(i === slot ? Math.min(1, l) : 0) * 100}%` }} />
            </div>
            <span className="dose-emoji" style={led && i === slot ? { filter: `drop-shadow(0 0 ${6 + l * 18}px rgba(255,80,160,${0.3 + l * 0.6}))` } : undefined}>
              {led ? '🥬' : '🌾'}
            </span>
            {i === slot && hold.current && !led && <span className="dose-drops" aria-hidden>💧</span>}
          </div>
        ))}
      </div>
      <p className={`gauge-status ${result === 'over' ? 'bad' : result === 'ok' ? 'ok' : ''}`}>
        {result === 'ok' ? '✅ ¡Justo lo necesario!' : result === 'over' ? (led ? '⚠️ Demasiada luz: se desperdició energía' : '⚠️ Demasiada agua: se desperdició') : 'Suelta dentro de la franja verde'}
      </p>
      <button
        className="hold-btn"
        onPointerDown={(e) => {
          hold.current = true;
          capture(e);
        }}
        onPointerUp={release}
        onPointerCancel={release}
      >
        {led ? '💡 Encender luces' : '💧 Regar'} <small>(mantén presionado)</small>
      </button>
      <div className="mg-hud">
        <span>✅ {plural(stats.ok, 'planta atendida', 'plantas atendidas')}</span>
        <span>⚠️ {plural(stats.over, 'desperdicio', 'desperdicios')}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Conectar piezas                                                      */
/* ------------------------------------------------------------------ */

const WIRE_COLORS = ['#ff6b5b', '#ffc93c', '#3cc8ff', '#55db7a'];
const WIRE_LABELS: Record<WiresTheme, { left: string[]; right: string[] }> = {
  power: { left: ['⚡', '⚡', '⚡', '⚡'], right: ['🔌', '🔌', '🔌', '🔌'] },
  assembly: { left: ['▲', '●', '■', '★'], right: ['▲', '●', '■', '★'] },
  grid: { left: ['☀️', '🔋', '⚛️', '💨'], right: ['🌿', '💧', '🏠', '🛡️'] },
};

function shuffled(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function Wires({ theme, award }: { theme: WiresTheme; award: Award }) {
  const [right, setRight] = useState(() => shuffled(4));
  const [done, setDone] = useState<number[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [wrong, setWrong] = useState<number | null>(null);
  const [sets, setSets] = useState(0);
  const labels = WIRE_LABELS[theme];
  const ly = (i: number) => 34 + i * 52;

  const pickRight = (pos: number) => {
    if (sel === null) return;
    const color = right[pos];
    if (color === sel) {
      const nextDone = [...done, sel];
      setDone(nextDone);
      setSel(null);
      award(3, { x: 50, y: (ly(pos) / 240) * 100 });
      sfx.lock();
      vibrate(15);
      if (nextDone.length === 4) {
        award(3, { x: 50, y: 50 });
        setSets((s) => s + 1);
        sfx.success();
        setTimeout(() => {
          setDone([]);
          setRight(shuffled(4));
        }, 550);
      }
    } else {
      setWrong(pos);
      vibrate(40);
      sfx.fail();
      setTimeout(() => setWrong(null), 350);
    }
  };

  return (
    <div className={`wires theme-${theme}`}>
      <svg viewBox="0 0 300 240" className="wires-svg" aria-hidden>
        {done.map((c) => {
          const pos = right.indexOf(c);
          return <path key={c} d={`M 62 ${ly(c)} C 150 ${ly(c)}, 150 ${ly(pos)}, 238 ${ly(pos)}`} stroke={WIRE_COLORS[c]} className="wire" />;
        })}
      </svg>
      <div className="wires-col left">
        {[0, 1, 2, 3].map((i) => (
          <button
            key={i}
            className={`wire-end ${sel === i ? 'sel' : ''} ${done.includes(i) ? 'done' : ''}`}
            style={{ top: `${(ly(i) / 240) * 100}%`, ['--w' as string]: WIRE_COLORS[i] }}
            disabled={done.includes(i)}
            onPointerDown={() => {
              setSel(i);
              sfx.select();
            }}
          >
            {labels.left[i]}
          </button>
        ))}
      </div>
      <div className="wires-col right">
        {right.map((c, pos) => (
          <button
            key={pos}
            className={`wire-end ${done.includes(c) ? 'done' : ''} ${wrong === pos ? 'wrong' : ''}`}
            style={{ top: `${(ly(pos) / 240) * 100}%`, ['--w' as string]: WIRE_COLORS[c] }}
            disabled={done.includes(c)}
            onPointerDown={() => pickRight(pos)}
          >
            {labels.right[c]}
          </button>
        ))}
      </div>
      <div className="mg-hud floating">
        <span>{sel === null ? '1️⃣ Toca un conector de la izquierda' : '2️⃣ Ahora su pareja del mismo color'}</span>
        <span>🔗 {plural(sets, 'módulo completo', 'módulos completos')}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Repetir el patrón                                                    */
/* ------------------------------------------------------------------ */

const PADS: Record<PatternTheme, { label: string; color: string }[]> = {
  signal: [
    { label: '∿', color: '#3cc8ff' },
    { label: '⊓', color: '#ffc93c' },
    { label: '△', color: '#ff6b5b' },
    { label: '⋯', color: '#55db7a' },
  ],
  pumps: [
    { label: '⚙️ 1', color: '#3cc8ff' },
    { label: '⚙️ 2', color: '#ffc93c' },
    { label: '⚙️ 3', color: '#ff6b5b' },
    { label: '⚙️ 4', color: '#55db7a' },
  ],
};

/** Secuencia sin el mismo botón dos veces seguidas (más clara para leer). */
function newSequence(len: number): number[] {
  const out: number[] = [];
  while (out.length < len) {
    const n = Math.floor(Math.random() * 4);
    if (n !== out[out.length - 1]) out.push(n);
  }
  return out;
}

function Pattern({ theme, award }: { theme: PatternTheme; award: Award }) {
  const [seq, setSeq] = useState<number[]>(() => newSequence(3));
  const [lit, setLit] = useState<number | null>(null);
  const [mode, setMode] = useState<'show' | 'input'>('show');
  const [pos, setPos] = useState(0);
  const [rounds, setRounds] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pads = PADS[theme];

  const play = (s: number[]) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setMode('show');
    setPos(0);
    s.forEach((p, i) => {
      timers.current.push(
        setTimeout(() => {
          setLit(p);
          sfx.note(p);
        }, 500 + i * 560),
      );
      timers.current.push(setTimeout(() => setLit(null), 500 + i * 560 + 380));
    });
    timers.current.push(setTimeout(() => setMode('input'), 500 + s.length * 560));
  };

  useEffect(() => {
    play(seq);
    return () => timers.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq]);

  const press = (p: number) => {
    if (mode !== 'input') return;
    setLit(p);
    sfx.note(p);
    setTimeout(() => setLit((x) => (x === p ? null : x)), 200);
    if (seq[pos] !== p) {
      vibrate(50);
      sfx.fail();
      setTimeout(() => play(seq), 500);
      return;
    }
    if (pos + 1 === seq.length) {
      award(seq.length * 3, { x: 50, y: 40 });
      vibrate([15, 30, 15]);
      setRounds((r) => r + 1);
      const len = Math.min(6, seq.length + 1);
      setMode('show');
      setTimeout(() => setSeq(newSequence(len)), 450);
    } else {
      setPos(pos + 1);
    }
  };

  return (
    <div className={`pattern theme-${theme}`}>
      <div className="pattern-grid">
        {pads.map((p, i) => (
          <button key={i} className={`pad ${lit === i ? 'lit' : ''}`} style={{ ['--p' as string]: p.color }} disabled={mode !== 'input'} onPointerDown={() => press(i)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="mg-hud">
        <span>{mode === 'show' ? (theme === 'signal' ? '📡 Escucha la señal…' : '👀 Mira el orden…') : `👉 Tu turno: ${pos + 1} de ${seq.length}`}</span>
        <span>✅ {theme === 'signal' ? plural(rounds, 'señal descifrada', 'señales descifradas') : plural(rounds, 'arranque correcto', 'arranques correctos')}</span>
      </div>
    </div>
  );
}
