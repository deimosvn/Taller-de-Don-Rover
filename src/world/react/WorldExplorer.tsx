// Exploración libre de MARS-01 a pantalla completa (versión de prueba del planeta).

import { DEMO_SNAPSHOT } from '../colony/snapshot';
import { WorldCanvas } from './WorldCanvas';

export function WorldExplorer() {
  return (
    <div className="world-explorer">
      <WorldCanvas
        snapshot={DEMO_SNAPSHOT}
        keyboard
        onEngine={(engine) => {
          (window as unknown as { __world?: unknown }).__world = engine;
        }}
      />
    </div>
  );
}
