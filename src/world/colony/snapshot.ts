// Estado del juego que el mundo 3D refleja. Lo arma la capa de React a partir de lo que ya
// existe (colonia guardada, vista del profesor) y el mundo solo lo lee: el motor del juego
// sigue siendo el único que decide.

import { BOT_NAMES, CREWS, ROLE_ORDER } from '../../../shared/content';
import type { AvatarConfig, BuildingId, MissionId, Phase, RoleId, SectorId, SystemId } from '../../../shared/types';

export interface WorldCrewMember {
  id: string;
  name: string;
  avatar: AvatarConfig;
  role: RoleId | null;
}

export type CrewMood = 'cheer' | 'sad' | null;

export interface WorldCrew {
  sectorId: SectorId;
  name: string;
  members: WorldCrewMember[];
  /** Cómo le fue a la tripulación (resultados): festeja o se lamenta. */
  mood?: CrewMood;
}

export interface WorldSnapshot {
  /** Salud de cada sector (0–100). */
  sectors: Record<SectorId, number>;
  /** Edificios desbloqueados. */
  buildings: { id: BuildingId; level: number }[];
  /** Tripulaciones con sus astronautas (si hay una sesión en curso). */
  crews?: WorldCrew[];
  /** Astronautas que abordaron y todavía no tienen tripulación. */
  boarding?: WorldCrewMember[];
  /** Misiones que la colonia ya completó (habilitan hallazgos como la sonda perdida). */
  missionsDone?: MissionId[];
  /** Etiquetas de los descubrimientos misteriosos encontrados. */
  discoveries?: string[];
  /** Edificio recién desbloqueado (se resalta). */
  newBuilding?: BuildingId | null;
  /** Sistema a resaltar. */
  highlight?: SystemId | null;
  /** Tormenta de polvo (evento global). */
  storm?: boolean;
  /** Protocolo Oscuridad. */
  dark?: boolean;
  /** Fase de la misión: decide qué hacen las tripulaciones en el mundo. */
  phase?: Phase;
  /** Resultado de la emergencia (null mientras no termina). */
  saved?: boolean | null;
}

/**
 * Pose compacta que viaja por la red: [dirX, dirY, dirZ, rumbo, animación, rapidez].
 * La dirección es el punto del planeta; el rumbo se mide desde el norte local.
 */
export type PresencePose = [number, number, number, number, number, number];
export type PresenceMap = Record<string, PresencePose>;

/** Colonia de muestra para explorar el mundo sin una sesión abierta. */
export const DEMO_SNAPSHOT: WorldSnapshot = {
  sectors: { greenhouse: 88, solar: 74, waterplant: 66, habitat: 81, oxygen: 70, battery: 58, algae: 77, shield: 69 },
  buildings: [],
};

/** Colonia de muestra con tripulaciones (para el explorador del mundo). */
export function demoSnapshot(): WorldSnapshot {
  let n = 0;
  const member = (role: RoleId, i: number): WorldCrewMember => {
    const k = n++;
    return {
      id: `demo-${k}`,
      name: BOT_NAMES[k % BOT_NAMES.length],
      avatar: { suit: (k * 3 + i) % 8, helmet: (k * 7 + 1) % 5, visor: k % 4, accessory: (k * 5) % 6 },
      role,
    };
  };
  const crews: WorldCrew[] = CREWS.slice(0, 6).map((c, ci) => ({
    sectorId: c.sector,
    name: c.name,
    members: ROLE_ORDER.slice(0, ci % 2 ? 4 : 3).map((r, i) => member(r, i)),
  }));
  return {
    sectors: { greenhouse: 88, solar: 74, waterplant: 41, habitat: 81, oxygen: 70, battery: 28, algae: 77, shield: 69 },
    buildings: [
      { id: 'hydroponics', level: 1 },
      { id: 'antenna', level: 1 },
    ],
    crews,
    boarding: [member('power', 0), member('bio', 1)],
    discoveries: ['Meteorito de hierro', 'Arándanos marcianos'],
    phase: 'challenge',
    saved: null,
  };
}
