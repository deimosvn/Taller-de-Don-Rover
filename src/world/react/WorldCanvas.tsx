// Lienzo del mundo 3D para React. Carga el motor bajo demanda (three.js queda fuera del
// paquete inicial de la app), lo conecta con el estado del juego y lo destruye al desmontar.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { WorldSnapshot } from '../colony/snapshot';
import type { LightingId } from '../core/palette';
import type { WorldEngine, WorldOptions } from '../WorldEngine';

export interface WorldCanvasProps {
  snapshot: WorldSnapshot;
  /** Opciones iniciales del motor (no se vuelven a leer tras montar). */
  options?: WorldOptions;
  interactive?: boolean;
  keyboard?: boolean;
  paused?: boolean;
  lighting?: LightingId;
  className?: string;
  /** Recibe el motor cuando está listo (y null al destruirse). */
  onEngine?: (engine: WorldEngine | null) => void;
  /** El dispositivo no puede mostrar el mundo 3D (sin WebGL2 o error al iniciar). */
  onFail?: () => void;
  children?: ReactNode;
}

export function WorldCanvas({ snapshot, options, interactive = true, keyboard = false, paused = false, lighting, className = '', onEngine, onFail, children }: WorldCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<WorldEngine | null>(null);
  const [ready, setReady] = useState(false);
  const latest = useRef({ snapshot, interactive, keyboard, paused, lighting, onEngine, onFail });
  latest.current = { snapshot, interactive, keyboard, paused, lighting, onEngine, onFail };

  useEffect(() => {
    let cancelled = false;
    let engine: WorldEngine | null = null;
    const host = hostRef.current;
    if (!host) return;
    import('../WorldEngine')
      .then(({ WorldEngine }) => {
        if (cancelled) return;
        if (!WorldEngine.isSupported()) throw new Error('WebGL2 no disponible');
        const now = latest.current;
        engine = new WorldEngine(host, { ...options, interactive: now.interactive, keyboard: now.keyboard, lighting: now.lighting ?? options?.lighting });
        engine.setSnapshot(now.snapshot);
        engine.setPaused(now.paused);
        engine.events.on('ready', () => !cancelled && setReady(true));
        engineRef.current = engine;
        now.onEngine?.(engine);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[IXCHEL] El mundo 3D no pudo iniciarse:', err);
        latest.current.onFail?.();
      });
    return () => {
      cancelled = true;
      engineRef.current = null;
      latest.current.onEngine?.(null);
      engine?.dispose();
      setReady(false);
    };
    // El motor se crea una sola vez por montaje.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.setSnapshot(snapshot);
  }, [snapshot]);
  useEffect(() => {
    engineRef.current?.setInteractive(interactive);
  }, [interactive]);
  useEffect(() => {
    engineRef.current?.setKeyboard(keyboard);
  }, [keyboard]);
  useEffect(() => {
    engineRef.current?.setPaused(paused);
  }, [paused]);
  useEffect(() => {
    if (lighting) engineRef.current?.setLighting(lighting);
  }, [lighting]);

  return (
    <div className={`world-view ${ready ? 'is-ready' : 'is-loading'} ${className}`}>
      <div className="world-host" ref={hostRef} />
      {children}
    </div>
  );
}
