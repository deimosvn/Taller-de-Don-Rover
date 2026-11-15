// Piezas de interfaz reutilizables: íconos, logo, medidores, cronómetro, QR y más.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { PHASE_FLOW, PHASE_LABELS, ROLES, SYSTEMS } from '../../shared/content';
import type { Phase, RoleId, SystemId } from '../../shared/types';
import { fmtTime, remaining, useTicker } from '../lib/clock';
import { DonRover } from './art';

/* ---------------- íconos ---------------- */

const PATHS: Record<string, string> = {
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  drop: 'M12 3c3.6 4.4 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 2.4-6.6 6-11z',
  leaf: 'M5 20c0-9 6-15 15-15 0 9-6 15-15 15zM5 20l8.5-8.5',
  shield: 'M12 2.8 4.5 6v5.6c0 4.8 3.2 8.4 7.5 9.6 4.3-1.2 7.5-4.8 7.5-9.6V6z',
  play: 'M7 4.5v15l12.5-7.5z',
  pause: 'M7.5 5v14M16.5 5v14',
  plus: 'M12 5v14M5 12h14',
  check: 'M4.5 12.5l5 5 10-11',
  x: 'M6 6l12 12M18 6 6 18',
  arrow: 'M4 12h15M13 6l6 6-6 6',
  back: 'M20 12H5M11 6l-6 6 6 6',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  upload: 'M12 16V4M7 9l5-5 5 5M4 16v4h16v-4',
  vote: 'M4 14h16v6H4zM8 14l6-9 3.5 2.3L13.5 14',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  bot: 'M5 9h14v10H5zM12 5v4M9 13v1M15 13v1M9 16.5h6',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.5-3.6 3.2-6 6.5-6s6 2.4 6.5 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14c2 .7 3.3 2.8 3.5 6',
  sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 4v6M10 14v6',
  volume: 'M4 9.5h4l5-4v13l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  mute: 'M4 9.5h4l5-4v13l-5-4H4zM17 9.5l5 5M22 9.5l-5 5',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  home: 'M4 11 12 4l8 7v9h-5v-6H9v6H4z',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
  refresh: 'M20 11a8 8 0 0 0-14.3-4.3L4 9M4 4v5h5M4 13a8 8 0 0 0 14.3 4.3L20 15M20 20v-5h-5',
  download: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5v.5',
  alert: 'M12 3 2.5 20h19zM12 10v4.5M12 17.5v.5',
  wifi: 'M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0M12 19.5v.5',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8.5 20h7M10 17h4',
  scan: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M4 12h16',
  dice: 'M5 5h14v14H5zM9 9h.01M15 9h.01M12 12h.01M9 15h.01M15 15h.01',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  install: 'M12 3v11M7 9l5 5 5-5M5 15v4h14v-4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  key: 'M14.5 9.5a4 4 0 1 0-1.4 3.1L20 19.5M17 16.5l2-2',
  moon: 'M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z',
};

export function Icon({ name, size = 22, stroke = 2.4, className = '', style }: { name: keyof typeof PATHS | string; size?: number; stroke?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`icon ${className}`}
      style={style}
      aria-hidden="true"
    >
      <path d={PATHS[name] ?? PATHS.info} />
    </svg>
  );
}

/* ---------------- logo ---------------- */

export function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <span className="logo-mark" style={{ width: size, height: size }} aria-hidden="true">
      <DonRover size={size * 1.08} />
    </span>
  );
}

export function Logo({ size = 'md', sub = true }: { size?: 'sm' | 'md' | 'lg' | 'xl'; sub?: boolean }) {
  const mark = { sm: 40, md: 52, lg: 74, xl: 110 }[size];
  return (
    <div className={`logo logo-${size}`}>
      <LogoMark size={mark} />
      <div className="logo-text">
        <span className="logo-pre">Taller de</span>
        <span className="logo-word">
          Don <span className="logo-x">Rover</span>
        </span>
        {sub && <span className="logo-sub">Misiones en Marte para tu salón</span>}
      </div>
    </div>
  );
}

/* ---------------- contador animado ---------------- */

export function useCountUp(value: number, ms = 900) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(a + (value - a) * e));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

/* ---------------- medidores de la colonia ---------------- */

export function SystemMeter({ system, value, delta, size = 'md' }: { system: SystemId; value: number; delta?: number | null; size?: 'sm' | 'md' | 'lg' }) {
  const s = SYSTEMS[system];
  const shown = useCountUp(value);
  const low = value < 35;
  return (
    <div className={`meter meter-${size} ${low ? 'is-low' : ''}`} style={{ '--c': s.color, '--cd': s.dark } as CSSProperties}>
      <div className="meter-icon">{s.emoji}</div>
      <div className="meter-body">
        <div className="meter-top">
          <span className="meter-name">{s.name}</span>
          <span className="meter-val mono">
            {shown}%
            {delta ? <i className={delta > 0 ? 'up' : 'down'}>{delta > 0 ? `+${delta}` : delta}</i> : null}
          </span>
        </div>
        <div className="meter-track">
          <div className="meter-fill" style={{ width: `${Math.max(2, value)}%` }} />
        </div>
      </div>
    </div>
  );
}

/* ---------------- cronómetro ---------------- */

export function Countdown({
  deadline,
  paused,
  pausedRemaining,
  total,
  size = 76,
  label,
}: {
  deadline: number | null;
  paused: boolean;
  pausedRemaining: number | null;
  total: number;
  size?: number;
  label?: string;
}) {
  useTicker(250);
  const ms = remaining(deadline, paused, pausedRemaining);
  if (ms === null) return null;
  const frac = Math.max(0, Math.min(1, ms / Math.max(1, total * 1000)));
  const r = 42;
  const c = 2 * Math.PI * r;
  const urgent = !paused && ms < 10_000;
  return (
    <div className={`countdown ${urgent ? 'is-urgent' : ''} ${paused ? 'is-paused' : ''}`} style={{ width: size, height: size }} role="timer" aria-label={`Quedan ${fmtTime(ms)}`}>
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <circle cx="50" cy="50" r={r} fill="rgba(43, 16, 11,.75)" stroke="rgba(255,255,255,.12)" strokeWidth="9" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={urgent ? '#FF6B5B' : paused ? '#B69CFF' : '#FFC93C'}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset .25s linear' }}
        />
      </svg>
      <div className="countdown-text">
        <b className="mono">{paused ? 'II' : fmtTime(ms)}</b>
        {label && <span>{paused ? 'pausa' : label}</span>}
      </div>
    </div>
  );
}

/* ---------------- QR ---------------- */

export function QR({ value, size = 220 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#2a120d', light: '#FFFFFF' } })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(''));
    return () => {
      alive = false;
    };
  }, [value]);
  return <div className="qr" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} aria-label="Código QR para unirse" />;
}

/* ---------------- chips y etiquetas ---------------- */

export function RoleChip({ role, short = false }: { role: RoleId; short?: boolean }) {
  const r = ROLES[role];
  return (
    <span className="role-chip" style={{ '--c': r.color } as CSSProperties}>
      <span aria-hidden="true">{r.emoji}</span> {short ? r.specialty : r.name}
    </span>
  );
}

export function PhaseStepper({ phase }: { phase: Phase }) {
  const idx = PHASE_FLOW.indexOf(phase);
  return (
    <ol className="stepper" aria-label="Etapas de la misión">
      {PHASE_FLOW.map((p, i) => (
        <li key={p} className={i < idx ? 'done' : i === idx ? 'now' : ''}>
          <span className="stepper-dot" />
          <span className="stepper-label">{PHASE_LABELS[p]}</span>
        </li>
      ))}
    </ol>
  );
}

export function Modal({ open, onClose, children, title, wide = false }: { open: boolean; onClose: () => void; children: ReactNode; title?: string; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-back" onClick={onClose} role="presentation">
      <div className={`modal card ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="modal-head">
            <h2>{title}</h2>
            <button className="icon-btn dark" onClick={onClose} aria-label="Cerrar">
              <Icon name="x" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Stars({ value, max = 3 }: { value: number; max?: number }) {
  return (
    <span className="stars" aria-label={`${value} de ${max} estrellas`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < value ? 'on' : ''}>
          ★
        </span>
      ))}
    </span>
  );
}

export function Typewriter({ text, speed = 18 }: { text: string; speed?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = setInterval(() => setN((v) => (v >= text.length ? (clearInterval(id), v) : v + 2)), speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return (
    <span className="typewriter">
      {text.slice(0, n)}
      {n < text.length && <span className="caret">▍</span>}
    </span>
  );
}

export function Confetti({ count = 60 }: { count?: number }) {
  const colors = ['#FFC93C', '#3CC8FF', '#55DB7A', '#FF6B5B', '#B69CFF', '#FFF4DC'];
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: colors[i % colors.length],
            animationDelay: `${(i % 12) * 0.12}s`,
            animationDuration: `${2.4 + (i % 5) * 0.4}s`,
            transform: `rotate(${i * 29}deg)`,
          }}
        />
      ))}
    </div>
  );
}
