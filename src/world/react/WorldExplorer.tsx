// Exploración libre de MARS-01 a pantalla completa (versión de prueba del planeta).

import { useMemo } from 'react';
import { demoSnapshot } from '../colony/snapshot';
import { WorldCanvas } from './WorldCanvas';

export function WorldExplorer() {
  const snapshot = useMemo(() => demoSnapshot(), []);
  return (
    <div className="world-explorer">
      <WorldCanvas
        snapshot={snapshot}
        keyboard
        onEngine={(engine) => {
          (window as unknown as { __world?: unknown }).__world = engine;
        }}
      />
    </div>
  );
}
