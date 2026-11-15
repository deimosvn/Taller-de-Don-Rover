// Aplicación del profesor: crea la sala, arranca el motor del juego en este navegador y
// abre el canal WebRTC para que los celulares se unan. La sesión vive fuera de React
// (ver engine/session.ts), así que navegar por la app no cierra la sala.

import { useCallback, useEffect, useState } from 'react';
import { HostEngine, clearSnapshot, loadSnapshot, makeRoomCode } from '../../engine/room';
import { currentSession, endSession, startSession, type HostSession } from '../../engine/session';
import { getColony, newColony, saveColony } from '../../engine/store';
import type { NetStatus } from '../../net/hostNet';
import type { Ack, Difficulty, HostAction, HostView, Pace } from '../../../shared/types';
import { Console } from './Console';
import { Setup } from './Setup';

const STARTING: NetStatus = { state: 'starting', detail: 'Abriendo la colonia…', peers: 0 };

export function HostApp() {
  const [session, setSession] = useState<HostSession | null>(() => currentSession());
  const [view, setView] = useState<HostView | null>(() => currentSession()?.engine.hostView() ?? null);
  const [net, setNet] = useState<NetStatus>(() => currentSession()?.status ?? STARTING);
  const [snapshot, setSnapshot] = useState(() => loadSnapshot());

  useEffect(() => {
    if (!session) return;
    const update = () => {
      setView(session.engine.hostView());
      setNet(session.status);
    };
    update();
    return session.subscribe(update);
  }, [session]);

  const create = (opts: { className: string; difficulty: Difficulty; pace: Pace; colonyId: string | null }) => {
    const colony = (opts.colonyId && getColony(opts.colonyId)) || newColony(opts.className);
    saveColony(colony);
    const engine = new HostEngine({ code: makeRoomCode(), className: opts.className.trim() || colony.name, difficulty: opts.difficulty, pace: opts.pace, colony });
    setSession(startSession(engine));
  };

  const act = useCallback((a: HostAction): Ack => session?.engine.hostAction(a) ?? { ok: false, error: 'No hay una sala abierta.' }, [session]);

  const exit = () => {
    endSession();
    clearSnapshot();
    setSession(null);
    setView(null);
    setNet(STARTING);
    setSnapshot(null);
  };

  if (!session || !view) {
    return (
      <Setup
        snapshot={snapshot}
        onCreate={create}
        onResume={() => snapshot && setSession(startSession(HostEngine.restore(snapshot)))}
        onDiscard={() => {
          clearSnapshot();
          setSnapshot(null);
        }}
      />
    );
  }
  return <Console view={view} net={net} act={act} onExit={exit} />;
}
