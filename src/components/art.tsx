// Personajes y emblemas del Taller de Don Rover, dibujados con los modelos 3D del mundo:
// el astronauta de cada alumno, IX (la IA de la colonia), Don Rover y las insignias de misión.

import type { CSSProperties } from 'react';
import { MISSIONS } from '../../shared/content';
import type { AvatarConfig, MissionId, RoleId } from '../../shared/types';
import { Model3D } from './Model3D';

export function shade(hex: string, amt: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  r = Math.round((t - r) * p + r);
  g = Math.round((t - g) * p + g);
  b = Math.round((t - b) * p + b);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/* ------------------------------------------------------------------ */
/* Astronauta                                                           */
/* ------------------------------------------------------------------ */

export function Astronaut({
  avatar,
  role,
  size = 120,
  pose = 'idle',
  className = '',
  title,
  draggable = false,
}: {
  avatar: AvatarConfig;
  role?: RoleId | null;
  size?: number;
  pose?: 'idle' | 'cheer' | 'wave' | 'still';
  className?: string;
  title?: string;
  draggable?: boolean;
}) {
  const anim = pose === 'cheer' ? 'cheer' : pose === 'wave' ? 'wave' : 'idle';
  // Los retratos grandes se mueven; los pequeños (listas, insignias) son imágenes fijas.
  const live = pose !== 'still' && size >= 80;
  return (
    <Model3D
      subject={{ type: 'astronaut', avatar, role: role ?? null, anim }}
      width={size}
      height={Math.round((size * 164) / 120)}
      animate={live}
      draggable={draggable}
      className={`astro ${className}`}
      title={title ?? 'Astronauta'}
    />
  );
}

/* ------------------------------------------------------------------ */
/* IX · la IA de la colonia                                             */
/* ------------------------------------------------------------------ */

export function IXOrb({ size = 96, mood = 'idle', className = '' }: { size?: number; mood?: 'idle' | 'talk' | 'alert' | 'happy'; className?: string }) {
  const mode = mood === 'talk' ? 'talk' : mood === 'alert' ? 'scan' : 'idle';
  return (
    <Model3D
      subject={{ type: 'ix', mode }}
      width={size}
      animate={size >= 60}
      className={`ix-orb ix-${mood} ${className}`}
      title="IX, la IA de la colonia"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Don Rover                                                            */
/* ------------------------------------------------------------------ */

export function DonRover({ size = 120, animate = false, turntable = false, draggable = false, className = '' }: { size?: number; animate?: boolean; turntable?: boolean; draggable?: boolean; className?: string }) {
  return (
    <Model3D
      subject={{ type: 'rover' }}
      width={size}
      height={Math.round(size * 0.78)}
      animate={animate}
      turntable={turntable}
      draggable={draggable}
      className={`don-rover ${className}`}
      title="Don Rover"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Insignia de misión: el edificio que la misión desbloquea, en 3D      */
/* ------------------------------------------------------------------ */

export function MissionPatch({ id, size = 160, locked = false, live = false, className = '' }: { id: MissionId; size?: number; locked?: boolean; live?: boolean; className?: string }) {
  const m = MISSIONS[id];
  return (
    <div
      className={`patch ${locked ? 'patch-locked' : ''} ${className}`}
      style={{ '--mc': m.color, '--md': m.deep, width: size, height: size } as CSSProperties}
      role="img"
      aria-label={`Insignia de ${m.title}`}
    >
      <Model3D subject={{ type: 'mission', id }} width={size * 0.86} turntable={live} padding={1.02} className="patch-model" />
      {size >= 70 && <span className="patch-code">{m.code}</span>}
      {locked && <span className="patch-lock">🔒</span>}
    </div>
  );
}
