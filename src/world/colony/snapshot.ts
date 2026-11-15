// Estado del juego que el mundo 3D refleja. Lo arma la capa de React a partir de lo que ya
// existe (colonia guardada, vista del profesor) y el mundo solo lo lee: el motor del juego
// sigue siendo el único que decide.

import type { AvatarConfig, BuildingId, MissionId, RoleId, SectorId, SystemId } from '../../../shared/types';

export interface WorldCrewMember {
  id: string;
  name: string;
  avatar: AvatarConfig;
  role: RoleId | null;
}

export interface WorldCrew {
  sectorId: SectorId;
  name: string;
  members: WorldCrewMember[];
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
}

/** Colonia de muestra para explorar el mundo sin una sesión abierta. */
export const DEMO_SNAPSHOT: WorldSnapshot = {
  sectors: { greenhouse: 88, solar: 74, waterplant: 66, habitat: 81, oxygen: 70, battery: 58, algae: 77, shield: 69 },
  buildings: [],
};
