// La colonia en 3D en el proyector: el profesor ve a toda la clase dentro de MARS-01.
// Las tripulaciones actúan según la fase de la misión y los alumnos que juegan en 3D desde
// su celular aparecen caminando en tiempo real. Se puede seguir con la cámara a cualquiera.

import { useEffect, useMemo, useState } from 'react';
import { ROLES } from '../../../shared/content';
import type { HostView } from '../../../shared/types';
import { currentSession } from '../../engine/session';
import { snapshotFromHost } from '../../world/colony/fromGame';
import { WorldCanvas } from '../../world/react/WorldCanvas';
import type { WorldEngine } from '../../world/WorldEngine';

export default function HostWorld({ view, onClose }: { view: HostView; onClose: () => void }) {
  const [engine, setEngine] = useState<WorldEngine | null>(null);
  const [following, setFollowing] = useState<string | null>(null);
  const [live, setLive] = useState<string[]>([]);

  const json = JSON.stringify(snapshotFromHost(view));
  const snapshot = useMemo(() => JSON.parse(json), [json]);

  // Poses de los alumnos que juegan en 3D (las reparte el anfitrión).
  useEffect(() => {
    if (!engine) return;
    const tick = () => {
      const map = currentSession()?.net.presenceMap() ?? {};
      engine.setPresence(map);
      const ids = Object.keys(map).sort();
      setLive((prev) => (prev.join() === ids.join() ? prev : ids));
    };
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [engine]);

  useEffect(() => {
    if (!engine) return;
    return engine.events.on('mode', (m) => {
      if (m !== 'follow' && m !== 'focus') setFollowing(null);
    });
  }, [engine]);

  const follow = (id: string) => {
    if (!engine) return;
    if (engine.focusEntity(`astro:${id}`, true)) setFollowing(id);
  };

  const players = view.players.filter((p) => !p.isBot);
  const shown = [...players.filter((p) => live.includes(p.id)), ...players.filter((p) => !live.includes(p.id))].slice(0, 14);

  return (
    <div className="world-overlay host-world">
      <WorldCanvas snapshot={snapshot} keyboard options={{ autoRotate: true }} onEngine={setEngine}>
        <div className="hw-top">
          <button className="wp-btn" onClick={onClose}>
            ✕ <span>Volver a la consola</span>
          </button>
          <span className="wp-chip">
            🌍 MARS-01 · {live.length ? `${live.length} en 3D ahora` : 'Los alumnos pueden entrar con el botón 🌍 3D de su celular'}
          </span>
          <span className="wp-spacer" />
          <button
            className="wp-btn"
            onClick={() => {
              setFollowing(null);
              engine?.goHome();
            }}
          >
            🛰️ <span>Vista general</span>
          </button>
          <button
            className="wp-btn"
            onClick={() => {
              setFollowing(null);
              engine?.rig.startAuto();
            }}
          >
            🔄 <span>Recorrido</span>
          </button>
        </div>
        {shown.length > 0 && (
          <div className="hw-people">
            {shown.map((p) => {
              const role = p.roles[0];
              return (
                <button key={p.id} className={`hw-person ${following === p.id ? 'on' : ''} ${live.includes(p.id) ? 'live' : ''}`} style={role ? { borderColor: ROLES[role].color } : undefined} onClick={() => follow(p.id)}>
                  {live.includes(p.id) && <i className="hw-live" />}
                  {p.name}
                </button>
              );
            })}
          </div>
        )}
      </WorldCanvas>
    </div>
  );
}
