// Plano de la colonia MARS-01 sobre el planeta. Traduce la distribución del mapa SVG
// (hub al centro, ocho sectores en anillo, edificios desbloqueables alrededor) a posiciones
// reales sobre la esfera. Todo se mide en unidades de superficie desde el hub.

import { Vector3 } from 'three';
import { ROLE_ORDER, SECTORS, SECTOR_ORDER } from '../../../shared/content';
import type { BuildingId, RoleId, SectorId, SystemId } from '../../../shared/types';
import { COLONY, PLANET_RADIUS } from '../core/config';
import { DEG, headingTo, offsetOnSphere } from '../core/math';
import { HUB_DIR } from './features';

export { HUB_DIR };

export interface Spot {
  dir: Vector3;
  /** Rumbo con el que el objeto mira (rad, horario desde el norte). */
  heading: number;
  /** Coordenadas en el plano de la colonia. */
  east: number;
  north: number;
}

/** Punto del plano de la colonia en coordenadas polares; el ángulo es el del mapa SVG (0° = este, 90° = sur). */
export function colonyPoint(radius: number, svgAngleDeg: number): { east: number; north: number } {
  const a = svgAngleDeg * DEG;
  return { east: Math.cos(a) * radius, north: -Math.sin(a) * radius };
}

export function colonyDir(east: number, north: number, out = new Vector3()): Vector3 {
  return offsetOnSphere(HUB_DIR, east, north, PLANET_RADIUS, out);
}

/** Posición de la colonia; por defecto el objeto queda mirando hacia el hub. */
export function colonySpot(radius: number, svgAngleDeg: number, face: 'hub' | 'out' = 'hub'): Spot {
  const { east, north } = colonyPoint(radius, svgAngleDeg);
  const dir = colonyDir(east, north);
  const toHub = headingTo(dir, HUB_DIR);
  return { dir, heading: face === 'hub' ? toHub : toHub + Math.PI, east, north };
}

/** Ángulo (del mapa SVG) de cada sector: los mismos 45° de separación que en ColonyMap. */
export const SECTOR_ANGLE = Object.fromEntries(SECTOR_ORDER.map((s, i) => [s, -112.5 + i * 45])) as Record<SectorId, number>;

export const SECTOR_SPOTS = Object.fromEntries(SECTOR_ORDER.map((s) => [s, colonySpot(COLONY.sectorRing, SECTOR_ANGLE[s])])) as Record<SectorId, Spot>;

/** Ángulo de cada edificio desbloqueable en el anillo exterior. */
export const BUILDING_ANGLE: Record<Exclude<BuildingId, 'city'>, number> = {
  antenna: -90,
  recycler: -45,
  reactor: 45,
  module: 135,
  hydroponics: -135,
};

export const BUILDING_SPOTS = Object.fromEntries(
  (Object.keys(BUILDING_ANGLE) as Exclude<BuildingId, 'city'>[]).map((b) => [b, colonySpot(COLONY.outerRing, BUILDING_ANGLE[b])]),
) as Record<Exclude<BuildingId, 'city'>, Spot>;

/** Plataforma de abordaje: donde aparecen los astronautas al unirse (el "landing pad" del lobby). */
export const LANDING_PAD = colonySpot(COLONY.outerRing, 90);

/** Las cuatro especialidades, alineadas en la plaza sur del hub como en la portada. */
export const ROLE_SPOTS = Object.fromEntries(ROLE_ORDER.map((r, i) => [r, colonySpot(10.6, 123 - i * 22, 'out')])) as Record<RoleId, Spot>;

/** Lugares de la tripulación frente a su sector (hasta cinco tripulantes). */
export function crewSpots(sector: SectorId, count: number): Spot[] {
  const angle = SECTOR_ANGLE[sector] * DEG;
  const radial = { east: Math.cos(angle), north: -Math.sin(angle) };
  const side = { east: -radial.north, north: radial.east };
  const r = COLONY.sectorRing - 6.4;
  const out: Spot[] = [];
  for (let i = 0; i < count; i++) {
    const k = (i - (count - 1) / 2) * 1.45;
    const back = Math.abs(k) * 0.12;
    const east = radial.east * (r - back) + side.east * k;
    const north = radial.north * (r - back) + side.north * k;
    const dir = colonyDir(east, north);
    out.push({ dir, heading: headingTo(dir, HUB_DIR), east, north });
  }
  return out;
}

/** Lugares sobre la plataforma de abordaje (anillos concéntricos). */
export function boardingSpots(count: number): Spot[] {
  const base = colonyPoint(COLONY.outerRing, 90);
  const out: Spot[] = [];
  let ring = 0;
  let placed = 0;
  while (placed < count) {
    const n = ring === 0 ? 1 : Math.min(count - placed, ring * 6);
    const rad = ring * 1.5;
    for (let i = 0; i < n; i++) {
      const a = (i / Math.max(1, ring * 6)) * Math.PI * 2 + ring * 0.4;
      const east = base.east + Math.cos(a) * rad;
      const north = base.north + Math.sin(a) * rad;
      const dir = colonyDir(east, north);
      out.push({ dir, heading: headingTo(dir, HUB_DIR), east, north });
    }
    placed += n;
    ring++;
  }
  return out;
}

/** Recorrido cerrado del rover alrededor de la colonia (puntos sobre la superficie). */
export const ROVER_ROUTE: Vector3[] = Array.from({ length: 48 }, (_, i) => {
  const a = (i / 48) * 360;
  const wobble = Math.sin((i / 48) * Math.PI * 6) * 0.7;
  const { east, north } = colonyPoint(COLONY.roverLoop + wobble, a);
  return colonyDir(east, north);
});

/** Tubos que unen el hub con cada sector: puntos sobre la superficie, del hub hacia fuera. */
export function tubePath(sector: SectorId, steps = 8): Vector3[] {
  const from = 6.3;
  const to = COLONY.sectorRing - 4.4;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const { east, north } = colonyPoint(from + ((to - from) * i) / steps, SECTOR_ANGLE[sector]);
    return colonyDir(east, north);
  });
}

export const SECTOR_SYSTEM = Object.fromEntries(SECTOR_ORDER.map((s) => [s, SECTORS[s].system])) as Record<SectorId, SystemId>;
