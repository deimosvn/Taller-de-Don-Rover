// Dibujos de la portada hechos con código: un QR de muestra, marcos de celular y laptop
// para las capturas, y el ciclo de las cuatro especialidades de la colonia.

import type { CSSProperties, ReactNode } from 'react';
import { ROLES } from '../../../shared/content';
import type { RoleId } from '../../../shared/types';

/* ---------------- QR de muestra (decorativo) ---------------- */

function finder(x: number, y: number): string {
  return `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z`;
}

/** Un QR de adorno: tiene la forma de uno de verdad, pero no lleva a ningún lado. */
export function SampleQR({ size = 120 }: { size?: number }) {
  const n = 25;
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  let d = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const inFinder = (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
      if (!inFinder && rand() > 0.52) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return (
    <svg className="lp-qr" width={size} height={size} viewBox={`-1 -1 ${n + 2} ${n + 2}`} aria-hidden="true">
      <rect x="-1" y="-1" width={n + 2} height={n + 2} rx="2" fill="#fff" />
      <path d={finder(0, 0) + finder(n - 7, 0) + finder(0, n - 7)} fill="#2b1712" fillRule="evenodd" />
      <path d={d} fill="#2b1712" />
    </svg>
  );
}

/* ---------------- marcos para capturas ---------------- */

export function PhoneFrame({ src, alt, className = '', children }: { src?: string; alt?: string; className?: string; children?: ReactNode }) {
  return (
    <div className={`lp-phone ${className}`}>
      <span className="lp-phone-notch" aria-hidden="true" />
      <div className="lp-phone-screen">{src ? <img src={src} alt={alt ?? ''} loading="lazy" decoding="async" /> : children}</div>
    </div>
  );
}

export function LaptopFrame({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`lp-laptop ${className}`}>
      <div className="lp-laptop-screen">
        <img src={src} alt={alt} loading="lazy" decoding="async" />
      </div>
      <div className="lp-laptop-base" aria-hidden="true" />
    </div>
  );
}

/* ---------------- el ciclo de la colonia ---------------- */

// Hábitat protege a Energía, que alimenta a Soporte vital, que riega a Astrobiología,
// cuya comida fresca refuerza a la tripulación (y vuelve a Hábitat): todo está conectado.
const LOOP: { role: RoleId; x: number; y: number; verb: string }[] = [
  { role: 'habitat', x: 200, y: 52, verb: 'protege' },
  { role: 'power', x: 348, y: 200, verb: 'alimenta' },
  { role: 'life', x: 200, y: 348, verb: 'riega' },
  { role: 'bio', x: 52, y: 200, verb: 'refuerza' },
];

export function SystemsLoop({ active = true }: { active?: boolean }) {
  const r = 148;
  return (
    <svg className={`lp-loop ${active ? 'is-on' : ''}`} viewBox="0 0 400 400" role="img" aria-label="Las cuatro especialidades están conectadas: Hábitat protege a Energía, Energía alimenta a Soporte vital, Soporte vital riega a Astrobiología y la comida de Astrobiología refuerza a la tripulación.">
      <defs>
        <marker id="lp-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="#d4461b" />
        </marker>
      </defs>
      <circle cx="200" cy="200" r={r} fill="none" stroke="#f3dccd" strokeWidth="14" />
      {LOOP.map((n, i) => {
        // Arco de un nodo al siguiente (en el sentido del reloj), sin tocar los círculos.
        const a0 = (-90 + i * 90 + 22) * (Math.PI / 180);
        const a1 = (-90 + (i + 1) * 90 - 22) * (Math.PI / 180);
        const p0 = [200 + r * Math.cos(a0), 200 + r * Math.sin(a0)];
        const p1 = [200 + r * Math.cos(a1), 200 + r * Math.sin(a1)];
        // El verbo va por dentro del anillo, a la mitad del camino.
        const mid = (-45 + i * 90) * (Math.PI / 180);
        const vx = 200 + 104 * Math.cos(mid);
        const vy = 200 + 104 * Math.sin(mid) + 5;
        return (
          <g key={n.role}>
            <path className="lp-loop-flow" d={`M${p0[0].toFixed(1)} ${p0[1].toFixed(1)}A${r} ${r} 0 0 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}`} fill="none" stroke="#d4461b" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 12" markerEnd="url(#lp-arrow)" style={{ animationDelay: `${i * -0.4}s` } as CSSProperties} />
            <text x={vx.toFixed(1)} y={vy.toFixed(1)} textAnchor="middle" className="lp-loop-verb">
              {n.verb}
            </text>
          </g>
        );
      })}
      {LOOP.map((n, i) => {
        const role = ROLES[n.role];
        return (
          <g key={n.role} className="lp-loop-node" style={{ '--i': i, '--c': role.color } as CSSProperties}>
            <circle cx={n.x} cy={n.y} r="40" fill="#fff" stroke={role.color} strokeWidth="5" />
            <text x={n.x} y={n.y + 11} textAnchor="middle" fontSize="30">
              {role.emoji}
            </text>
          </g>
        );
      })}
      <text x="200" y="192" textAnchor="middle" className="lp-loop-center">
        La colonia
      </text>
      <text x="200" y="216" textAnchor="middle" className="lp-loop-sub">
        todo está conectado
      </text>
    </svg>
  );
}
