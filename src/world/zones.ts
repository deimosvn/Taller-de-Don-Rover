// Registro de lugares del mundo: zonas, puntos de interés y accesos. Cada lugar tiene un
// identificador estable, un área sobre el planeta y un encuadre sugerido para la cámara.
// Las futuras misiones pueden referirse a ellos ("ir a…", "explorar…") sin conocer coordenadas.

import { Vector3 } from 'three';
import { BUILDINGS, MYSTERY_POOL, SECTORS, SECTOR_ORDER } from '../../shared/content';
import type { BuildingId } from '../../shared/types';
import { COLONY, PLANET_RADIUS } from './core/config';
import { angleBetween, dirFromLatLon } from './core/math';
import { CANYON, HUB_DIR, ICE_PATCHES, LAVA_TUBE, MESAS, PADS, VOLCANO } from './planet/features';
import { BUILDING_SPOTS, LANDING_PAD, SECTOR_SPOTS, tubePath } from './planet/layout';

export type ZoneKind = 'colony' | 'sector' | 'site' | 'landmark' | 'region';

export interface AccessPoint {
  id: string;
  label: string;
  dir: Vector3;
}

export interface ZoneDef {
  id: string;
  name: string;
  kind: ZoneKind;
  description: string;
  /** De qué parte del juego sale este lugar. */
  source: string;
  /** Centro y radio (unidades de superficie). */
  dir: Vector3;
  radius: number;
  /** Entidad principal del lugar, si la hay. */
  entityUid?: string;
  /** Encuadre sugerido al viajar aquí. */
  view: { distance: number; tilt?: number };
  /** Puntos de acceso (entradas, uniones de tubos, miradores). */
  access: AccessPoint[];
  tags: string[];
  /** Si aparece en la lista de lugares de la interfaz. */
  listed: boolean;
}

const mystery = (label: string) => MYSTERY_POOL.find((m) => m.label === label)?.text ?? '';

export class ZoneRegistry {
  private readonly zones = new Map<string, ZoneDef>();

  add(zone: ZoneDef): void {
    this.zones.set(zone.id, zone);
  }

  get(id: string): ZoneDef | null {
    return this.zones.get(id) ?? null;
  }

  all(): ZoneDef[] {
    return [...this.zones.values()];
  }

  byKind(kind: ZoneKind): ZoneDef[] {
    return this.all().filter((z) => z.kind === kind);
  }

  byTag(tag: string): ZoneDef[] {
    return this.all().filter((z) => z.tags.includes(tag));
  }

  /** Zonas que contienen el punto, de la más pequeña (más específica) a la más amplia. */
  at(dir: Vector3): ZoneDef[] {
    return this.all()
      .filter((z) => angleBetween(dir, z.dir) * PLANET_RADIUS <= z.radius)
      .sort((a, b) => a.radius - b.radius);
  }

  /** Zona listada más cercana al punto. */
  nearest(dir: Vector3): ZoneDef | null {
    let best: ZoneDef | null = null;
    let bestD = Infinity;
    for (const z of this.zones.values()) {
      const d = angleBetween(dir, z.dir) * PLANET_RADIUS - z.radius;
      if (d < bestD) {
        bestD = d;
        best = z;
      }
    }
    return best;
  }
}

export function createZones(): ZoneRegistry {
  const reg = new ZoneRegistry();

  reg.add({
    id: 'colony.mars01',
    name: 'MARS-01',
    kind: 'colony',
    description: 'La colonia que comparte toda la clase: un centro de mando y ocho sectores.',
    source: 'Mapa de la colonia (ColonyMap) y consola del profesor',
    dir: HUB_DIR.clone(),
    radius: COLONY.flatRadius,
    entityUid: 'structure:hub',
    view: { distance: 78 },
    access: [],
    tags: ['colony'],
    listed: true,
  });

  reg.add({
    id: 'colony.hub',
    name: 'Centro de mando',
    kind: 'site',
    description: 'El domo central de la colonia, desde donde IX coordina a las tripulaciones.',
    source: 'Hub del mapa de la colonia',
    dir: HUB_DIR.clone(),
    radius: 7.5,
    entityUid: 'structure:hub',
    view: { distance: 30 },
    access: SECTOR_ORDER.map((s) => ({ id: `tube.${s}`, label: `Tubo hacia ${SECTORS[s].name}`, dir: tubePath(s, 1)[0] })),
    tags: ['colony', 'hub'],
    listed: true,
  });

  for (const s of SECTOR_ORDER) {
    const spot = SECTOR_SPOTS[s];
    const tube = tubePath(s, 1);
    reg.add({
      id: `sector.${s}`,
      name: SECTORS[s].name,
      kind: 'sector',
      description: SECTORS[s].desc,
      source: 'SECTORS (shared/content.ts)',
      dir: spot.dir.clone(),
      radius: 6.5,
      entityUid: `sector:${s}`,
      view: { distance: 26 },
      access: [{ id: 'tube', label: 'Unión con el tubo del hub', dir: tube[1] }],
      tags: ['colony', 'sector', SECTORS[s].system],
      listed: true,
    });
  }

  for (const b of Object.keys(BUILDING_SPOTS) as Exclude<BuildingId, 'city'>[]) {
    reg.add({
      id: `site.${b}`,
      name: BUILDINGS[b].name,
      kind: 'site',
      description: BUILDINGS[b].desc,
      source: 'BUILDINGS (shared/content.ts)',
      dir: BUILDING_SPOTS[b].dir.clone(),
      radius: 5.5,
      entityUid: `building:${b}`,
      view: { distance: 24 },
      access: [],
      tags: ['colony', 'building'],
      // Solo se lista cuando la colonia ya construyó el edificio (lo decide el motor).
      listed: false,
    });
  }

  reg.add({
    id: 'site.landingpad',
    name: 'Plataforma de abordaje',
    kind: 'site',
    description: 'Aquí aparecen los astronautas cuando se unen a la misión.',
    source: 'Etapa de abordaje (landing pad del lobby)',
    dir: LANDING_PAD.dir.clone(),
    radius: 7,
    entityUid: 'prop:landingpad',
    view: { distance: 26 },
    access: [],
    tags: ['colony'],
    listed: true,
  });

  const landmark = (id: string, name: string, description: string, source: string, dir: Vector3, radius: number, distance: number, entityUid?: string, tags: string[] = []) =>
    reg.add({ id, name, kind: 'landmark', description, source, dir: dir.clone(), radius, entityUid, view: { distance }, access: [], tags: ['landmark', ...tags], listed: true });

  landmark('landmark.olympus', 'Monte Olimpo', 'El volcán más grande del sistema solar.', 'Dato curioso del escáner (categoría misterio)', VOLCANO.dir, VOLCANO.radius * PLANET_RADIUS, 74, undefined, ['volcano']);
  landmark('landmark.canyon', 'Gran cañón', 'Un cañón cercano a la colonia. De aquí llega la señal que investiga la misión The Unknown Signal.', 'Misión M-04', CANYON.center, 16, 62, undefined, ['canyon']);
  landmark('landmark.northcap', 'Casquete polar norte', 'Hielo en el polo norte de Marte.', 'Misión M-02 (hielo en los polos)', dirFromLatLon(88, 0), 22, 95, undefined, ['ice']);
  landmark('landmark.southcap', 'Casquete polar sur', 'Hielo en el polo sur de Marte.', 'Misión M-02 (hielo en los polos)', dirFromLatLon(-88, 0), 15, 85, undefined, ['ice']);
  landmark('landmark.icefield', 'Hielo bajo el suelo', mystery('Hielo bajo el suelo'), 'Misión M-02 y descubrimientos misteriosos', ICE_PATCHES[0].dir, ICE_PATCHES[0].r * PLANET_RADIUS * 1.3, 44, undefined, ['ice', 'discovery']);
  landmark('landmark.icecave', 'Cueva de hielo', 'El radar de la colonia la detectó bajo el hielo.', 'Misión M-02 (tercer acontecimiento)', PADS.find((p) => p.id === 'icecave')!.dir, 4, 24, 'landmark:icecave', ['ice']);
  landmark('landmark.lavatube', 'Tubo de lava', mystery('Tubo de lava'), 'Misión M-05 y descubrimientos misteriosos', LAVA_TUBE.dir, 5, 30, undefined, ['discovery']);
  landmark('landmark.layeredrock', 'Roca con capas', mystery('Roca con capas'), 'Descubrimientos misteriosos', MESAS[0].dir, 7, 38, undefined, ['discovery']);
  landmark('landmark.blueberries', 'Arándanos marcianos', mystery('Arándanos marcianos'), 'Descubrimientos misteriosos', PADS.find((p) => p.id === 'blueberries')!.dir, 5.5, 22, 'landmark:blueberries', ['discovery']);
  landmark('landmark.meteorite', 'Meteorito de hierro', mystery('Meteorito de hierro'), 'Descubrimientos misteriosos', PADS.find((p) => p.id === 'meteorite')!.dir, 3.5, 16, 'landmark:meteorite', ['discovery']);

  return reg;
}
