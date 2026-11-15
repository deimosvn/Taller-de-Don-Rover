// Sesión del anfitrión (motor + red) que vive fuera de React: si el profesor navega a la
// portada y regresa, o si el código se recarga en desarrollo, la sala sigue abierta y los
// celulares no pierden la conexión. Solo se cierra con "Cerrar sala" o al cerrar la pestaña.

import { HostNet, type NetStatus } from '../net/hostNet';
import type { HostEngine } from './room';
import { loadSettings } from './settings';

export interface HostSession {
  engine: HostEngine;
  net: HostNet;
  status: NetStatus;
  subscribe(fn: () => void): () => void;
}

type SessionWindow = Window & { __ixchelHostSession?: HostSession };

export function currentSession(): HostSession | null {
  return (window as SessionWindow).__ixchelHostSession ?? null;
}

export function startSession(engine: HostEngine): HostSession {
  endSession();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((fn) => fn());
  const session = {
    engine,
    status: { state: 'starting', detail: 'Abriendo la colonia…', peers: 0 } as NetStatus,
    subscribe(fn: () => void) {
      listeners.add(fn);
      const off = engine.subscribe(fn);
      return () => {
        listeners.delete(fn);
        off();
      };
    },
  } as HostSession;
  engine.start();
  session.net = new HostNet(
    engine,
    loadSettings().signaling,
    (s) => {
      session.status = { ...s };
      notify();
    },
    () => {
      session.status = { state: 'offline', detail: 'Ese código de sala está ocupado. Cierra la sala y crea una nueva.', peers: 0 };
      notify();
    },
  );
  session.net.start();
  (window as SessionWindow).__ixchelHostSession = session;
  return session;
}

export function endSession() {
  const s = currentSession();
  if (!s) return;
  s.net.stop();
  s.engine.stop();
  delete (window as SessionWindow).__ixchelHostSession;
}
