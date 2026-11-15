// Ventana al planeta 3D para las páginas (portada, consola, selección de misión).
// Puede girar sola, viajar a un lugar del mapa y dejarse explorar con ratón o dedo.

import { useEffect, useState, type ReactNode } from 'react';
import type { WorldSnapshot } from '../colony/snapshot';
import type { WorldEngine } from '../WorldEngine';
import { WorldCanvas } from './WorldCanvas';

export interface PlanetViewProps {
  snapshot: WorldSnapshot;
  /** Lugar del registro de zonas al que viaja la cámara (p. ej. `sector.greenhouse`). */
  focus?: string | null;
  /** Gira el planeta mientras nadie lo toca. */
  autoRotate?: boolean;
  interactive?: boolean;
  /** Distancia inicial de la cámara (más grande = planeta entero). */
  distance?: number;
  className?: string;
  children?: ReactNode;
}

export function PlanetView({ snapshot, focus = null, autoRotate = true, interactive = true, distance, className = '', children }: PlanetViewProps) {
  const [engine, setEngine] = useState<WorldEngine | null>(null);

  useEffect(() => {
    if (!engine) return;
    if (focus) engine.focusZone(focus);
    else if (autoRotate) engine.rig.startAuto();
  }, [engine, focus, autoRotate]);

  return (
    <WorldCanvas
      snapshot={snapshot}
      interactive={interactive}
      options={{ autoRotate: autoRotate && !focus, distance }}
      onEngine={setEngine}
      className={`planet-view ${className}`}
    >
      {children}
    </WorldCanvas>
  );
}
