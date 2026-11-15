// El alumno entra a MARS-01 en 3D con su propio astronauta: camina, corre y salta por la
// colonia en primera o tercera persona y ve a sus compañeros moverse en tiempo real.
// Su pose viaja al proyector (unas 6 veces por segundo) y el proyector la reparte a los demás.

import { useEffect, useMemo, useState } from 'react';
import type { PlayerView } from '../../../shared/types';
import type { PlayerNet } from '../../net/playerNet';
import { DEMO_SNAPSHOT, type WorldSnapshot } from '../../world/colony/snapshot';
import { WorldCanvas } from '../../world/react/WorldCanvas';
import { WorldPlay, type WorldBanner } from '../../world/react/WorldPlay';
import type { WorldEngine } from '../../world/WorldEngine';

interface Props {
  view: PlayerView;
  net: PlayerNet | null;
  onClose: () => void;
}

/** ¿El juego necesita al alumno en su pantalla de misión? */
function needsYou(v: PlayerView): { text: string; tone: 'alert' | 'info' } | null {
  if (v.objectVote?.open && !v.objectVote.myVote) return { text: '🗳️ IX pregunta qué objeto escanear: ¡vota!', tone: 'info' };
  switch (v.phase) {
    case 'discovery':
      return v.quiz && !v.quiz.answered ? { text: '🔐 Llegó tu transmisión secreta: descífrala.', tone: 'info' } : null;
    case 'challenge':
      if (v.quiz && !v.quiz.answered) return { text: '🔐 Descifra tu transmisión antes de votar.', tone: 'info' };
      if (v.bonus && !v.bonus.answered) return { text: '🛰️ ¡Pregunta bonus de la NASA!', tone: 'info' };
      return v.challenge && !v.challenge.myVote && !v.challenge.locked ? { text: '🗳️ Tu tripulación necesita tu voto.', tone: 'info' } : null;
    case 'event':
      return { text: '🚨 ¡Emergencia en la colonia! Tu tripulación te necesita.', tone: 'alert' };
    case 'results':
      return { text: '📊 Ya están los resultados de tu tripulación.', tone: 'info' };
    default:
      return null;
  }
}

export default function PlayWorld({ view, net, onClose }: Props) {
  const [engine, setEngine] = useState<WorldEngine | null>(null);
  const [world, setWorld] = useState<WorldSnapshot | null>(() => net?.world ?? null);
  const snapshot = world ?? DEMO_SNAPSHOT;

  // Estado de la colonia y poses de los compañeros que llegan del proyector.
  useEffect(() => {
    if (!net) return;
    net.onWorld = (w) => setWorld(w);
    if (net.world) setWorld(net.world);
    return () => {
      net.onWorld = null;
    };
  }, [net]);
  useEffect(() => {
    if (!net || !engine) return;
    net.onPeers = (p) => engine.setPresence(p);
    return () => {
      net.onPeers = null;
    };
  }, [net, engine]);

  // El astronauta entra al mundo en cuanto el motor está listo.
  const me = view.me;
  useEffect(() => {
    if (!engine) return;
    engine.enterPlayer({ id: me.id, name: me.name, avatar: me.avatar, role: me.roles[0] ?? null }, 'third');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  // Mandar la pose (solo cuando cambia; y cada 3 s para seguir "presente").
  useEffect(() => {
    if (!net || !engine) return;
    let last = '';
    const send = (force: boolean) => {
      const pose = engine.playerPose();
      if (!pose) return;
      const key = pose.join(',');
      if (!force && key === last) return;
      last = key;
      net.sendPose(pose);
    };
    const fast = setInterval(() => send(false), 160);
    const keep = setInterval(() => send(true), 3000);
    return () => {
      clearInterval(fast);
      clearInterval(keep);
      net.sendPose(null);
    };
  }, [net, engine]);

  const need = needsYou(view);
  const banner: WorldBanner | null = useMemo(
    () => (need ? { text: need.text, tone: need.tone, action: 'Ir a la misión', onAction: onClose } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [need?.text, need?.tone],
  );

  return (
    <div className="world-overlay">
      <WorldCanvas snapshot={snapshot} keyboard onEngine={setEngine}>
        <WorldPlay engine={engine} snapshot={world} onExit={onClose} exitLabel="Volver" banner={banner} />
      </WorldCanvas>
    </div>
  );
}
