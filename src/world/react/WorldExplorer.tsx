// Exploración de MARS-01 a pantalla completa (#/mundo): vista de mapa libre o jugar con
// tu astronauta en primera o tercera persona por una colonia de muestra.

import { useMemo, useState } from 'react';
import { loadProfile } from '../../lib/profile';
import { demoSnapshot } from '../colony/snapshot';
import type { PlayerView } from '../camera/CameraRig';
import type { WorldEngine } from '../WorldEngine';
import { WorldCanvas } from './WorldCanvas';
import { WorldPlay } from './WorldPlay';

export function WorldExplorer() {
  const snapshot = useMemo(() => demoSnapshot(), []);
  const profile = useMemo(() => loadProfile(), []);
  const [engine, setEngine] = useState<WorldEngine | null>(null);
  const [playing, setPlaying] = useState(false);

  const start = (view: PlayerView) => {
    if (!engine) return;
    engine.enterPlayer({ id: null, name: profile.name || 'Astronauta', avatar: profile.avatar, role: null }, view);
    setPlaying(true);
  };
  const exit = () => {
    engine?.exitPlayer();
    setPlaying(false);
  };

  return (
    <div className="world-explorer">
      <WorldCanvas
        snapshot={snapshot}
        keyboard
        onEngine={(e) => {
          (window as unknown as { __world?: unknown }).__world = e;
          setEngine(e);
        }}
      >
        {playing ? (
          <WorldPlay engine={engine} snapshot={snapshot} onExit={exit} exitLabel="Vista de mapa" />
        ) : (
          <div className="world-cta">
            <a className="btn cream" href="#/">
              ← Inicio
            </a>
            <button className="btn mars" disabled={!engine} onClick={() => start('third')}>
              🧑‍🚀 Jugar en tercera persona
            </button>
            <button className="btn ix" disabled={!engine} onClick={() => start('first')}>
              👁️ Primera persona
            </button>
          </div>
        )}
      </WorldCanvas>
    </div>
  );
}
