// Ventana a un modelo 3D del mundo (astronauta, IX, Don Rover, edificios…). El motor 3D se
// carga bajo demanda, así que la página aparece de inmediato y los modelos llegan después.

import { useEffect, useRef, type CSSProperties } from 'react';
import type { StudioSubject, StudioView, ViewOptions } from '../world/studio/ModelStudio';

type StudioModule = typeof import('../world/studio/ModelStudio');
let studioModule: Promise<StudioModule> | null = null;
const loadStudio = () => (studioModule ??= import('../world/studio/ModelStudio'));

export interface Model3DProps extends Partial<ViewOptions> {
  subject: StudioSubject;
  width: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

export function Model3D({ subject, width, height = width, className = '', style, title, animate = false, turntable, draggable, yaw, pitch, padding, shadow }: Model3DProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<StudioView | null>(null);
  const latest = useRef({ subject, options: { animate, turntable, draggable, yaw, pitch, padding, shadow } });
  latest.current = { subject, options: { animate, turntable, draggable, yaw, pitch, padding, shadow } };

  useEffect(() => {
    let alive = true;
    loadStudio().then((m) => {
      const studio = m.getStudio();
      if (!alive || !studio || !ref.current) return;
      const { subject: s, options: o } = latest.current;
      viewRef.current = studio.attach(ref.current, s, { ...o, animate: Boolean(o.animate) });
    });
    return () => {
      alive = false;
      viewRef.current?.dispose();
      viewRef.current = null;
    };
    // El draggable se fija al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const key = JSON.stringify(subject);
  useEffect(() => {
    viewRef.current?.setSubject(subject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    viewRef.current?.setOptions({ animate, turntable, yaw, pitch, padding, shadow });
  }, [animate, turntable, yaw, pitch, padding, shadow]);

  return (
    <canvas
      ref={ref}
      className={`model3d ${draggable ? 'is-draggable' : ''} ${className}`}
      style={{ width, height, ...style }}
      role="img"
      aria-label={title ?? 'Modelo 3D'}
    />
  );
}
