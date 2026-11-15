// Director de la colonia (versión inicial): se completa junto con el catálogo de modelos.

import type { Object3D } from 'three';
import type { EntityManager } from '../entities/EntityManager';
import type { UpdateContext } from '../entities/types';
import type { MaterialKit } from '../models/sculpt';
import type { WorldSnapshot } from './snapshot';

export class ColonyDirector {
  constructor(
    protected readonly entities: EntityManager,
    protected readonly kit: MaterialKit,
    protected readonly scene: Object3D,
  ) {}

  build(): void {}

  apply(_snapshot: WorldSnapshot): void {}

  update(_ctx: UpdateContext): void {}

  dispose(): void {}
}
