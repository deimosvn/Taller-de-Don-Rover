// Traduce el estado del juego (vista del profesor) al estado que refleja el mundo 3D.
// No importa three.js: lo usan el anfitrión y la red para mandar la colonia a los celulares.

import { MYSTERY_POOL } from '../../../shared/content';
import type { HostView, PlayerPublic } from '../../../shared/types';
import type { WorldCrewMember, WorldSnapshot } from './snapshot';

const MYSTERY_LABELS = new Set(MYSTERY_POOL.map((m) => m.label));

function member(p: PlayerPublic): WorldCrewMember {
  return { id: p.id, name: p.name, avatar: p.avatar, role: p.roles[0] ?? null };
}

export function snapshotFromHost(v: HostView): WorldSnapshot {
  const byId = new Map(v.players.map((p) => [p.id, p]));
  const showMood = v.phase === 'results' || v.phase === 'debrief';
  const crews = v.crews.map((c) => ({
    sectorId: c.sectorId,
    name: c.name,
    members: c.memberIds.map((id) => byId.get(id)).filter((p): p is PlayerPublic => Boolean(p)).map(member),
    mood: showMood && c.outcome ? (c.outcome.tier === 'best' || c.outcome.tier === 'ok' ? ('cheer' as const) : ('sad' as const)) : null,
  }));
  const boarding = v.players.filter((p) => !p.crewId || !v.crews.some((c) => c.id === p.crewId)).map(member);
  const missionId = v.mission?.id ?? null;
  const event = v.phase === 'event';
  return {
    sectors: { ...v.colony.sectors },
    buildings: v.colony.buildings.map((b) => ({ id: b.id, level: b.level })),
    crews,
    boarding,
    missionsDone: v.colony.missions.map((m) => m.id),
    discoveries: [...new Set(v.colony.discoveries.map((d) => d.label).filter((l) => MYSTERY_LABELS.has(l)))],
    newBuilding: v.phase === 'debrief' ? (v.debrief?.unlocked ?? null) : null,
    highlight: null,
    storm: event && (missionId === 'greenhouse' || missionId === 'final'),
    dark: event && missionId === 'darkness',
    phase: v.phase,
    saved: v.results?.saved ?? null,
  };
}
