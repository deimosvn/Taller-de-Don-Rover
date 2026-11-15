// Colonias guardadas en el navegador del profesor. Después de varias clases el grupo
// puede mirar su planeta y decir: "nosotros construimos esto".

import { SECTOR_ORDER, START_METERS } from '../../shared/content';
import type { ColonyState, SectorId } from '../../shared/types';

const KEY = 'ixchel.colonies';

function readAll(): Record<string, ColonyState> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, ColonyState>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* almacenamiento lleno o bloqueado */
  }
}

export function listColonies(): ColonyState[] {
  return Object.values(readAll()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getColony(id: string): ColonyState | null {
  return readAll()[id] ?? null;
}

export function saveColony(colony: ColonyState) {
  const all = readAll();
  colony.updatedAt = Date.now();
  all[colony.id] = colony;
  writeAll(all);
}

export function deleteColony(id: string) {
  const all = readAll();
  delete all[id];
  writeAll(all);
}

function slug(s: string) {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24) || 'colonia'
  );
}

export function newColony(name: string): ColonyState {
  const sectors = {} as Record<SectorId, number>;
  for (const s of SECTOR_ORDER) sectors[s] = 62 + Math.floor(Math.random() * 14);
  const now = Date.now();
  return {
    id: `${slug(name)}-${Math.floor(1000 + Math.random() * 9000)}`,
    name: name.trim() || 'Mi salón',
    createdAt: now,
    updatedAt: now,
    sol: 1,
    meters: { ...START_METERS },
    sectors,
    buildings: [],
    missions: [],
    discoveries: [],
  };
}

export function exportColony(colony: ColonyState) {
  const blob = new Blob([JSON.stringify({ ixchel: 1, colony }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `colonia-${colony.id}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function importColony(file: File): Promise<ColonyState> {
  const data = JSON.parse(await file.text());
  const c = (data?.colony ?? data) as ColonyState;
  if (!c || typeof c.id !== 'string' || !c.meters || !c.sectors) throw new Error('El archivo no es una colonia del Taller de Don Rover.');
  saveColony(c);
  return c;
}
