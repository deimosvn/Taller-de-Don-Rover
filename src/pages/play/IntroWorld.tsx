// Marte desde el primer segundo: mientras el alumno escribe el código y arma su astronauta,
// ya está dentro del mundo 3D caminando por la colonia con ese mismo astronauta.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AvatarConfig } from '../../../shared/types';
import { demoSnapshot } from '../../world/colony/snapshot';
import { WorldCanvas } from '../../world/react/WorldCanvas';
import { WorldPlay } from '../../world/react/WorldPlay';
import type { WorldEngine } from '../../world/WorldEngine';

export default function IntroWorld({ name, avatar, children }: { name: string; avatar: AvatarConfig; children?: ReactNode }) {
  const snapshot = useMemo(() => demoSnapshot(), []);
  const [engine, setEngine] = useState<WorldEngine | null>(null);
  const look = `${avatar.suit}.${avatar.helmet}.${avatar.visor}.${avatar.accessory}`;

  // El astronauta entra al mundo y cambia en vivo si el alumno cambia su traje.
  useEffect(() => {
    if (!engine) return;
    engine.enterPlayer({ id: null, name: name || 'Astronauta', avatar, role: null }, 'third');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, look]);

  return (
    <div className="world-overlay intro-world">
      <WorldCanvas snapshot={snapshot} keyboard onEngine={setEngine}>
        <WorldPlay engine={engine} snapshot={snapshot}>
          {children}
        </WorldPlay>
      </WorldCanvas>
    </div>
  );
}
