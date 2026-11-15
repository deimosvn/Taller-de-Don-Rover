// Estado de la colonia para el planeta 3D a partir de la vista del profesor. El objeto solo
// cambia cuando cambia su contenido, para no reconstruir la escena en cada tic del reloj.

import { useMemo } from 'react';
import type { HostView } from '../../../shared/types';
import { snapshotFromHost } from '../colony/fromGame';
import type { WorldSnapshot } from '../colony/snapshot';

export function useHostSnapshot(view: HostView, patch?: Partial<WorldSnapshot>): WorldSnapshot {
  const json = JSON.stringify({ ...snapshotFromHost(view), ...patch });
  return useMemo(() => JSON.parse(json) as WorldSnapshot, [json]);
}
