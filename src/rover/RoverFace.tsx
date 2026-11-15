// La misma cara que muestra la placa (firmware/donrover-knomi/src/face.cpp), en SVG para la
// pantalla: así el proyector también tiene a Don Rover aunque no haya placa conectada.

import { useEffect, useState } from 'react';
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

const IRIS: Partial<Record<RoverExpr, string>> = { alert: '#FF8A5B', listen: '#B69CFF', sad: '#8FB8FF', star: '#FFD86B' };

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
      setTimeout(() => alive && setBlink(false), 150);
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
  const iris = IRIS[expr] ?? '#7FDBFF';
  const wow = expr === 'wow';
  const R = wow ? 39 : 34;
  const ey = 102;

  const eye = (cx: number, left: boolean) => {
    if (expr === 'happy') return <path d={`M${cx - 24} ${ey + 4} Q${cx} ${ey - 26} ${cx + 24} ${ey + 4}`} fill="none" stroke={iris} strokeWidth="8" strokeLinecap="round" />;
    if (expr === 'star') return <path d={starPath(cx, ey, 30)} fill="#FFD86B" />;
    if (expr === 'sleep' || blink) return <path d={`M${cx - 20} ${ey} Q${cx} ${ey + 12} ${cx + 20} ${ey}`} fill="none" stroke={expr === 'sleep' ? '#6B6590' : '#5A4F9A'} strokeWidth="5" strokeLinecap="round" />;
    const ix = cx + gaze.x * 9;
    const iy = ey + gaze.y * 9;
    const ir = wow ? 21 : 19;
    const lid = expr === 'think' && left ? 0.38 : 0;
    return (
      <g>
        <circle cx={cx} cy={ey} r={R} fill="#5A4F9A" />
        <circle cx={cx} cy={ey} r={R - 5} fill="#0E0A24" />
        <circle cx={ix} cy={iy} r={ir + 4} fill={iris} opacity="0.35" />
        <circle cx={ix} cy={iy} r={ir} fill={iris} />
        <circle cx={ix} cy={iy} r={wow ? 5 : 8} fill="#0B2F40" />
        <circle cx={ix - 7} cy={iy - 8} r="4" fill="#FFF8EC" />
        <circle cx={ix + 6} cy={iy + 6} r="2" fill="#FFF8EC" />
        {lid > 0 && <rect x={cx - R - 3} y={ey - R - 3} width={2 * R + 6} height={2 * R * lid + 3} fill="#241C4E" />}
        {expr === 'sad' && <polygon points={`${cx - R - 4},${ey - R - 4} ${cx + R + 4},${ey - R - 4} ${left ? cx - R - 4 : cx + R + 4},${ey - R / 6}`} fill="#241C4E" />}
        {expr === 'alert' && <polygon points={`${cx - R - 4},${ey - R - 4} ${cx + R + 4},${ey - R - 4} ${left ? cx + R + 4 : cx - R - 4},${ey - R / 3}`} fill="#241C4E" />}
      </g>
    );
  };

  const mx = 120;
  const my = 172;
  let mouthEl;
  if (mouth < 0.07) {
    if (wow) mouthEl = <circle cx={mx} cy={my} r="10" fill="#0E0A24" stroke="#7FDBFF" strokeWidth="4" />;
    else if (expr === 'happy' || expr === 'star') mouthEl = <path d={`M${mx - 26} ${my - 6} Q${mx} ${my + 20} ${mx + 26} ${my - 6}`} fill="none" stroke="#7FDBFF" strokeWidth="6" strokeLinecap="round" />;
    else if (expr === 'sad') mouthEl = <path d={`M${mx - 22} ${my + 8} Q${mx} ${my - 12} ${mx + 22} ${my + 8}`} fill="none" stroke="#7FDBFF" strokeWidth="5" strokeLinecap="round" />;
    else if (expr === 'sleep') mouthEl = <rect x={mx - 12} y={my - 2} width="24" height="5" rx="2.5" fill="#6B6590" />;
    else mouthEl = <rect x={expr === 'think' ? mx - 6 : mx - 22} y={my - 3} width={expr === 'think' ? 30 : 44} height="6" rx="3" fill="#7FDBFF" />;
  } else {
    const h = 8 + 38 * mouth;
    const w = wow ? h + 6 : 56 - 12 * mouth;
    const r = Math.min(w, h) / 2;
    mouthEl = (
      <g>
        <rect x={mx - w / 2} y={my - h / 2} width={w} height={h} rx={r} fill="#7FDBFF" />
        <rect x={mx - w / 2 + 3} y={my - h / 2 + 3} width={w - 6} height={h - 6} rx={Math.max(1, r - 3)} fill="#0E0A24" />
        {h > 24 && <rect x={mx - w / 4} y={my + h / 2 - 12} width={w / 2} height="9" rx="4" fill="#F08A57" />}
      </g>
    );
  }

  const circ = 2 * Math.PI * 115.5;
  return (
    <svg className={`rover-face expr-${expr}`} width={size} height={size} viewBox="0 0 240 240" role="img" aria-label={`${title}: ${EXPR_LABEL[expr]}`}>
      <circle cx="120" cy="120" r="120" fill="#15102F" />
      <circle cx="120" cy="120" r="111" fill="#241C4E" />
      <rect x="70" y="18" width="100" height="10" rx="5" fill="#FFF8EC" opacity="0.08" />
      {eye(78, true)}
      {eye(162, false)}
      {(expr === 'happy' || expr === 'star') && (
        <g fill="#FF7FA3" opacity="0.55">
          <ellipse cx="56" cy={ey + 42} rx="12" ry="7" />
          <ellipse cx="184" cy={ey + 42} rx="12" ry="7" />
        </g>
      )}
      {mouthEl}
      {expr === 'think' && (
        <g className="rf-dots" fill="#7FDBFF">
          <circle cx="178" cy="54" r="3" />
          <circle cx="190" cy="45" r="4" />
          <circle cx="202" cy="36" r="5" />
        </g>
      )}
      {expr === 'sleep' && (
        <text x="170" y="66" fill="#6B6590" fontSize="22" fontWeight="700" className="rf-z">
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
      <circle cx="120" cy="10" r="3.5" fill={linked ? '#55DB7A' : '#6B6590'} />
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
