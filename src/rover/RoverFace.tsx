// La cara de Don Rover en SVG, en colores claros y amables: casco blanco con orejas naranjas
// (el color de Marte), visor celeste, ojos grandes que miran y parpadean, cachetes rosados y una
// sonrisa que se mueve al hablar. Tiene las mismas expresiones que la placa
// (firmware/donrover-knomi/src/face.cpp), así que la pantalla y el robot físico dicen lo mismo.

import { useEffect, useId, useState } from 'react';
import type { RoverExpr } from './link';

interface Props {
  expr: RoverExpr;
  /** Apertura de la boca (0–1). */
  mouth: number;
  size?: number;
  /** Anillo de tiempo (0–1) y su color. */
  ring?: { p: number; color: string } | null;
  /** Anillo que late (escuchando). */
  pulse?: string | null;
  /** Punto de estado: conectado a la placa. */
  linked?: boolean;
  title?: string;
}

/** Color de los ojos según el ánimo (azul marino por defecto). */
const EYE: Partial<Record<RoverExpr, string>> = { listen: '#6B4FD6', alert: '#D2462F', sad: '#3F66B0' };
const INK = '#2B3A67';

function starPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.48 : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
}

export function RoverFace({ expr, mouth, size = 120, ring = null, pulse = null, linked = false, title = 'Don Rover' }: Props) {
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [blink, setBlink] = useState(false);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const id = (n: string) => `rf-${uid}-${n}`;
  const url = (n: string) => `url(#${id(n)})`;

  // Vistazos y parpadeos, como en la placa.
  useEffect(() => {
    let alive = true;
    let t1: ReturnType<typeof setTimeout>;
    let t2: ReturnType<typeof setTimeout>;
    const saccade = () => {
      if (!alive) return;
      setLook({ x: (Math.random() - 0.5) * 1.1, y: (Math.random() - 0.5) * 0.7 });
      t1 = setTimeout(saccade, 1200 + Math.random() * 2600);
    };
    const doBlink = () => {
      if (!alive) return;
      setBlink(true);
      setTimeout(() => alive && setBlink(false), 130);
      t2 = setTimeout(doBlink, 2500 + Math.random() * 3500);
    };
    t1 = setTimeout(saccade, 1500);
    t2 = setTimeout(doBlink, 2200);
    return () => {
      alive = false;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const gaze = expr === 'think' ? { x: 0.6, y: -0.7 } : expr === 'listen' ? { x: 0, y: -0.3 } : look;
  const ink = EYE[expr] ?? INK;
  const wow = expr === 'wow';
  const sleepy = expr === 'sleep';
  const ey = 110;

  const eye = (cx: number, left: boolean) => {
    if (expr === 'happy') return <path d={`M${cx - 18} ${ey + 4} Q${cx} ${ey - 20} ${cx + 18} ${ey + 4}`} fill="none" stroke={ink} strokeWidth="8" strokeLinecap="round" />;
    if (expr === 'star') return <path d={starPath(cx, ey, 23)} fill="#FFC23C" stroke="#E89A1A" strokeWidth="2" strokeLinejoin="round" />;
    if (sleepy || blink) return <path d={`M${cx - 16} ${ey} Q${cx} ${ey + 10} ${cx + 16} ${ey}`} fill="none" stroke={ink} strokeWidth="6" strokeLinecap="round" opacity={sleepy ? 0.7 : 1} />;
    const ix = cx + gaze.x * 5;
    const iy = ey + gaze.y * 5;
    const rx = wow ? 17 : 14;
    const ry = wow ? 19 : 18;
    return (
      <g>
        <ellipse cx={ix} cy={iy} rx={rx} ry={ry} fill={ink} />
        <ellipse cx={ix - 5} cy={iy - 7} rx="5.5" ry="6.5" fill="#FFFFFF" />
        <circle cx={ix + 5} cy={iy + 6} r="2.6" fill="#FFFFFF" opacity="0.9" />
        {/* cejas: solo cuando ayudan a leer el ánimo */}
        {expr === 'sad' && <path d={`M${cx - 16} ${ey - (left ? 24 : 32)} L${cx + 14} ${ey - (left ? 32 : 24)}`} stroke={ink} strokeWidth="5" strokeLinecap="round" />}
        {expr === 'alert' && <path d={`M${cx - 16} ${ey - (left ? 32 : 24)} L${cx + 14} ${ey - (left ? 24 : 32)}`} stroke={ink} strokeWidth="5" strokeLinecap="round" />}
        {expr === 'listen' && <path d={`M${cx - 14} ${ey - 30} Q${cx} ${ey - 36} ${cx + 14} ${ey - 30}`} fill="none" stroke={ink} strokeWidth="4.5" strokeLinecap="round" />}
        {expr === 'think' && left && <path d={`M${cx - 15} ${ey - 30} Q${cx} ${ey - 38} ${cx + 15} ${ey - 30}`} fill="none" stroke={ink} strokeWidth="5" strokeLinecap="round" />}
      </g>
    );
  };

  const mx = 120;
  const my = 162;
  let mouthEl;
  if (mouth < 0.07) {
    if (wow) mouthEl = <ellipse cx={mx} cy={my + 2} rx="9" ry="11" fill={INK} />;
    else if (expr === 'happy' || expr === 'star')
      mouthEl = (
        <g>
          <path d={`M${mx - 22} ${my - 6} Q${mx} ${my + 24} ${mx + 22} ${my - 6} Z`} fill={INK} />
          <path d={`M${mx - 11} ${my + 7} Q${mx} ${my + 1} ${mx + 11} ${my + 7} Q${mx} ${my + 14} ${mx - 11} ${my + 7} Z`} fill="#FF8FA3" />
        </g>
      );
    else if (expr === 'sad') mouthEl = <path d={`M${mx - 16} ${my + 8} Q${mx} ${my - 6} ${mx + 16} ${my + 8}`} fill="none" stroke={INK} strokeWidth="5.5" strokeLinecap="round" />;
    else if (sleepy) mouthEl = <ellipse cx={mx} cy={my + 2} rx="6" ry="4" fill={INK} opacity="0.7" />;
    else if (expr === 'think') mouthEl = <path d={`M${mx - 4} ${my + 4} Q${mx + 8} ${my + 8} ${mx + 18} ${my}`} fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" />;
    else if (expr === 'alert') mouthEl = <path d={`M${mx - 14} ${my + 4} L${mx + 14} ${my + 4}`} stroke={INK} strokeWidth="5.5" strokeLinecap="round" />;
    else mouthEl = <path d={`M${mx - 16} ${my - 1} Q${mx} ${my + 13} ${mx + 16} ${my - 1}`} fill="none" stroke={INK} strokeWidth="5.5" strokeLinecap="round" />;
  } else {
    // Hablando: boca redonda que se abre con las sílabas y lengüita rosa.
    const h = 9 + 26 * mouth;
    const w = wow ? h + 4 : 34 - 6 * mouth;
    mouthEl = (
      <g>
        <rect x={mx - w / 2} y={my - h / 2 + 2} width={w} height={h} rx={Math.min(w, h) / 2} fill={INK} />
        {h > 16 && <ellipse cx={mx} cy={my + h / 2 - 4} rx={w / 3.2} ry={Math.min(6, h / 4)} fill="#FF8FA3" />}
      </g>
    );
  }

  const circ = 2 * Math.PI * 115.5;
  const blush = expr === 'happy' || expr === 'star' ? 0.75 : expr === 'sad' || sleepy ? 0.3 : 0.5;
  const led = linked ? '#3FCB6A' : '#FF9F6B';
  return (
    <svg className={`rover-face expr-${expr}`} width={size} height={size} viewBox="0 0 240 240" role="img" aria-label={`${title}: ${EXPR_LABEL[expr]}`}>
      <defs>
        <radialGradient id={id('shell')} cx="0.42" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.7" stopColor="#EEF2F8" />
          <stop offset="1" stopColor="#D3DCEA" />
        </radialGradient>
        <radialGradient id={id('visor')} cx="0.45" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#F3F9FF" />
          <stop offset="0.65" stopColor="#DCEBFC" />
          <stop offset="1" stopColor="#BFD5F2" />
        </radialGradient>
        <linearGradient id={id('ear')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFB98C" />
          <stop offset="1" stopColor="#F07A45" />
        </linearGradient>
      </defs>

      {/* orejas */}
      <rect x="2" y="92" width="26" height="56" rx="12" fill={url('ear')} />
      <rect x="212" y="92" width="26" height="56" rx="12" fill={url('ear')} />
      <rect x="8" y="104" width="6" height="32" rx="3" fill="#FFFFFF" opacity="0.55" />
      <rect x="226" y="104" width="6" height="32" rx="3" fill="#FFFFFF" opacity="0.55" />

      {/* antena */}
      <rect x="117" y="6" width="6" height="22" rx="3" fill="#C9D3E3" />
      <circle cx="120" cy="8" r="8" fill={led} />
      <circle cx="117" cy="5" r="2.6" fill="#FFFFFF" opacity="0.8" />

      {/* casco */}
      <circle cx="120" cy="124" r="104" fill="#C9D3E3" />
      <circle cx="120" cy="122" r="102" fill={url('shell')} />
      {/* visor */}
      <rect x="40" y="62" width="160" height="128" rx="58" fill="#B7C7DE" />
      <rect x="42" y="64" width="156" height="124" rx="56" fill={url('visor')} />
      <path d="M64 92 Q74 72 100 68" fill="none" stroke="#FFFFFF" strokeWidth="7" strokeLinecap="round" opacity="0.85" />

      {eye(90, true)}
      {eye(150, false)}
      <g fill="#FF9FB2" opacity={blush}>
        <ellipse cx="66" cy={ey + 34} rx="12" ry="7" />
        <ellipse cx="174" cy={ey + 34} rx="12" ry="7" />
      </g>
      {mouthEl}

      {expr === 'think' && (
        <g className="rf-dots" fill="#8FA6C9">
          <circle cx="182" cy="52" r="4" />
          <circle cx="196" cy="40" r="5.5" />
          <circle cx="212" cy="26" r="7" />
        </g>
      )}
      {sleepy && (
        <text x="172" y="58" fill="#8FA6C9" fontSize="24" fontWeight="800" className="rf-z">
          z
        </text>
      )}
      {pulse ? (
        <circle cx="120" cy="122" r="112" fill="none" stroke={pulse} strokeWidth="7" className="rf-pulse" />
      ) : ring && ring.p >= 0 ? (
        <g>
          <circle cx="120" cy="122" r="112" fill="none" stroke={ring.color} strokeOpacity="0.25" strokeWidth="6" />
          <circle
            cx="120"
            cy="122"
            r="112"
            fill="none"
            stroke={ring.color}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={`${(circ * 112) / 115.5 * Math.min(1, ring.p)} ${circ}`}
            transform="rotate(-90 120 122)"
          />
        </g>
      ) : null}
    </svg>
  );
}

export const EXPR_LABEL: Record<RoverExpr, string> = {
  neutral: 'atento',
  happy: 'contento',
  sad: 'triste',
  alert: 'en alerta',
  think: 'pensando',
  wow: 'sorprendido',
  sleep: 'dormido',
  listen: 'escuchando',
  star: '¡feliz!',
};
