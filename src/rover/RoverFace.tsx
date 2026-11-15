// La cara de Don Rover en SVG: la misma personalidad que muestra la placa
// (firmware/donrover-knomi/src/face.cpp), con más detalle para la pantalla: casco metálico color
// Marte con tornillos y luces, visor de cristal con reflejo, ojos y boca que brillan.
// Así el proyector (y el asistente flotante) tienen a Don Rover aunque no haya placa conectada.

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

const IRIS: Partial<Record<RoverExpr, string>> = { alert: '#FF8A5B', listen: '#C3ADFF', sad: '#8FB8FF', star: '#FFD86B' };
const GLOW = '#7FDBFF';

function starPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
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
      setTimeout(() => alive && setBlink(false), 140);
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

  const gaze = expr === 'think' ? { x: 0.6, y: -0.65 } : expr === 'listen' ? { x: 0, y: -0.25 } : look;
  const iris = IRIS[expr] ?? GLOW;
  const wow = expr === 'wow';
  const R = wow ? 36 : 32;
  const ey = 106;
  const sleepy = expr === 'sleep';

  const eye = (cx: number, left: boolean) => {
    if (expr === 'happy')
      return (
        <path d={`M${cx - 24} ${ey + 6} Q${cx} ${ey - 26} ${cx + 24} ${ey + 6}`} fill="none" stroke={iris} strokeWidth="9" strokeLinecap="round" filter={url('glow')} />
      );
    if (expr === 'star') return <path d={starPath(cx, ey, 30)} fill="#FFD86B" filter={url('glow')} />;
    if (sleepy || blink)
      return <path d={`M${cx - 21} ${ey} Q${cx} ${ey + 12} ${cx + 21} ${ey}`} fill="none" stroke={sleepy ? '#6B6590' : iris} strokeWidth="6" strokeLinecap="round" opacity={sleepy ? 1 : 0.9} />;
    const ix = cx + gaze.x * 8;
    const iy = ey + gaze.y * 8;
    const ir = wow ? 20 : 17;
    const lid = expr === 'think' && left ? 0.4 : 0;
    return (
      <g>
        {/* cuenca del ojo: pantalla redonda dentro del visor */}
        <circle cx={cx} cy={ey} r={R} fill="#0B0820" stroke="#3B3170" strokeWidth="3" />
        <circle cx={ix} cy={iy} r={ir + 7} fill={iris} opacity="0.18" />
        <circle cx={ix} cy={iy} r={ir} fill={`url(#${id(left ? 'irisL' : 'irisR')})`} filter={url('glow')} />
        <circle cx={ix} cy={iy} r={wow ? 5 : 7} fill="#06202C" />
        <circle cx={ix - 6} cy={iy - 7} r="4.5" fill="#FFF8EC" />
        <circle cx={ix + 6} cy={iy + 6} r="2" fill="#FFF8EC" opacity="0.85" />
        {lid > 0 && <rect x={cx - R - 3} y={ey - R - 3} width={2 * R + 6} height={2 * R * lid + 3} rx="6" fill="#1B1540" />}
        {expr === 'sad' && <polygon points={`${cx - R - 4},${ey - R - 4} ${cx + R + 4},${ey - R - 4} ${left ? cx - R - 4 : cx + R + 4},${ey - R / 6}`} fill="#1B1540" />}
        {expr === 'alert' && <polygon points={`${cx - R - 4},${ey - R - 4} ${cx + R + 4},${ey - R - 4} ${left ? cx + R + 4 : cx - R - 4},${ey - R / 3}`} fill="#1B1540" />}
      </g>
    );
  };

  const mx = 120;
  const my = 170;
  let mouthEl;
  if (mouth < 0.07) {
    if (wow) mouthEl = <circle cx={mx} cy={my} r="10" fill="#0B0820" stroke={GLOW} strokeWidth="4.5" filter={url('glow')} />;
    else if (expr === 'happy' || expr === 'star')
      mouthEl = <path d={`M${mx - 26} ${my - 6} Q${mx} ${my + 22} ${mx + 26} ${my - 6}`} fill="none" stroke={GLOW} strokeWidth="6.5" strokeLinecap="round" filter={url('glow')} />;
    else if (expr === 'sad') mouthEl = <path d={`M${mx - 22} ${my + 8} Q${mx} ${my - 12} ${mx + 22} ${my + 8}`} fill="none" stroke={GLOW} strokeWidth="5.5" strokeLinecap="round" filter={url('glow')} />;
    else if (sleepy) mouthEl = <rect x={mx - 12} y={my - 2} width="24" height="5" rx="2.5" fill="#6B6590" />;
    else mouthEl = <rect x={expr === 'think' ? mx - 4 : mx - 22} y={my - 3} width={expr === 'think' ? 28 : 44} height="6.5" rx="3.25" fill={GLOW} filter={url('glow')} />;
  } else {
    const h = 8 + 36 * mouth;
    const w = wow ? h + 6 : 54 - 12 * mouth;
    const r = Math.min(w, h) / 2;
    mouthEl = (
      <g>
        <rect x={mx - w / 2} y={my - h / 2} width={w} height={h} rx={r} fill={GLOW} filter={url('glow')} />
        <rect x={mx - w / 2 + 3.5} y={my - h / 2 + 3.5} width={w - 7} height={h - 7} rx={Math.max(1, r - 3.5)} fill="#0B0820" />
        {h > 24 && <rect x={mx - w / 4} y={my + h / 2 - 12} width={w / 2} height="8" rx="4" fill="#F08A57" />}
      </g>
    );
  }

  const circ = 2 * Math.PI * 115.5;
  const blush = expr === 'happy' || expr === 'star' ? 0.6 : expr === 'wow' ? 0.35 : 0.16;
  const led = linked ? '#55DB7A' : '#8A80C0';
  return (
    <svg className={`rover-face expr-${expr}`} width={size} height={size} viewBox="0 0 240 240" role="img" aria-label={`${title}: ${EXPR_LABEL[expr]}`}>
      <defs>
        {/* casco: metal cobrizo con luz desde arriba */}
        <linearGradient id={id('shell')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFB48A" />
          <stop offset="0.45" stopColor="#E0703F" />
          <stop offset="1" stopColor="#8E3A1E" />
        </linearGradient>
        <linearGradient id={id('rim')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5A2414" />
          <stop offset="1" stopColor="#2A0F08" />
        </linearGradient>
        {/* visor: cristal oscuro con un poco de profundidad */}
        <radialGradient id={id('visor')} cx="0.5" cy="0.38" r="0.7">
          <stop offset="0" stopColor="#2E2566" />
          <stop offset="0.7" stopColor="#161034" />
          <stop offset="1" stopColor="#0B0820" />
        </radialGradient>
        <radialGradient id={id('irisL')} cx="0.38" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.9" />
          <stop offset="0.25" stopColor={iris} />
          <stop offset="1" stopColor={iris} stopOpacity="0.75" />
        </radialGradient>
        <radialGradient id={id('irisR')} cx="0.38" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.9" />
          <stop offset="0.25" stopColor={iris} />
          <stop offset="1" stopColor={iris} stopOpacity="0.75" />
        </radialGradient>
        <linearGradient id={id('shine')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.28" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <filter id={id('glow')} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* casco */}
      <circle cx="120" cy="120" r="119" fill={url('rim')} />
      <circle cx="120" cy="120" r="115" fill={url('shell')} />
      <path d="M38 62 A100 100 0 0 1 202 62" fill="none" stroke="#FFE2CC" strokeOpacity="0.55" strokeWidth="3" strokeLinecap="round" />
      {/* tornillos */}
      {[
        [120, 13],
        [27, 120],
        [213, 120],
        [120, 227],
      ].map(([x, y], i) =>
        i === 0 ? null : (
          <g key={i}>
            <circle cx={x} cy={y} r="4.5" fill="#6E2C16" />
            <circle cx={x - 1} cy={y - 1} r="3" fill="#F2A57E" />
          </g>
        ),
      )}
      {/* luces laterales (orejas) */}
      <rect x="9" y="104" width="9" height="32" rx="4.5" fill="#3A160C" />
      <rect x="11" y="108" width="5" height="24" rx="2.5" fill={iris} opacity={sleepy ? 0.25 : 0.85} filter={url('glow')} />
      <rect x="222" y="104" width="9" height="32" rx="4.5" fill="#3A160C" />
      <rect x="224" y="108" width="5" height="24" rx="2.5" fill={iris} opacity={sleepy ? 0.25 : 0.85} filter={url('glow')} />

      {/* visor */}
      <circle cx="120" cy="122" r="98" fill="#2A0F08" />
      <circle cx="120" cy="122" r="95" fill={url('visor')} />
      <circle cx="120" cy="122" r="95" fill="none" stroke="#7FDBFF" strokeOpacity="0.12" strokeWidth="2" />

      {eye(80, true)}
      {eye(160, false)}
      <g fill="#FF7FA3" opacity={blush}>
        <ellipse cx="58" cy={ey + 40} rx="13" ry="7.5" />
        <ellipse cx="182" cy={ey + 40} rx="13" ry="7.5" />
      </g>
      {mouthEl}

      {/* reflejo del cristal */}
      <path d="M52 92 A72 72 0 0 1 108 40" fill="none" stroke={url('shine')} strokeWidth="10" strokeLinecap="round" />
      <circle cx="66" cy="62" r="4" fill="#FFFFFF" opacity="0.25" />

      {expr === 'think' && (
        <g className="rf-dots" fill={GLOW} filter={url('glow')}>
          <circle cx="176" cy="58" r="3" />
          <circle cx="188" cy="49" r="4" />
          <circle cx="200" cy="40" r="5" />
        </g>
      )}
      {sleepy && (
        <text x="168" y="68" fill="#8A80C0" fontSize="22" fontWeight="700" className="rf-z">
          z
        </text>
      )}
      {pulse ? (
        <circle cx="120" cy="120" r="115.5" fill="none" stroke={pulse} strokeWidth="7" className="rf-pulse" />
      ) : ring && ring.p >= 0 ? (
        <g>
          <circle cx="120" cy="120" r="115.5" fill="none" stroke={ring.color} strokeOpacity="0.22" strokeWidth="6" />
          <circle cx="120" cy="120" r="115.5" fill="none" stroke={ring.color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${circ * Math.min(1, ring.p)} ${circ}`} transform="rotate(-90 120 120)" />
        </g>
      ) : null}
      {/* luz de estado en la frente: verde = placa conectada */}
      <circle cx="120" cy="13" r="6.5" fill="#3A160C" />
      <circle cx="120" cy="13" r="4" fill={led} filter={linked ? url('glow') : undefined} />
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
