// Datos compartidos entre la portada y la consola para mostrar las misiones en el planeta.

import type { AvatarConfig, MissionId, RoleId } from '../../../shared/types';

/** Lugar del planeta (registro de zonas) que se muestra para cada misión. */
export const MISSION_ZONE: Record<MissionId, string> = {
  greenhouse: 'sector.greenhouse',
  water: 'landmark.icefield',
  darkness: 'sector.solar',
  signal: 'landmark.canyon',
  habitat: 'sector.habitat',
  final: 'colony.mars01',
};

/** Astronauta de muestra para cada especialidad. */
export const ROLE_AVATARS: Record<RoleId, AvatarConfig> = {
  power: { suit: 2, helmet: 1, visor: 1, accessory: 1 },
  life: { suit: 4, helmet: 2, visor: 2, accessory: 4 },
  bio: { suit: 3, helmet: 0, visor: 2, accessory: 2 },
  habitat: { suit: 0, helmet: 4, visor: 0, accessory: 0 },
};
