// Catálogo de entidades del mundo: cada definición dice qué es, de qué parte del juego sale,
// cómo se encuadra con la cámara, con qué choca, qué se puede hacer con ella y cómo se
// construye su modelo 3D.

import { BUILDINGS, SECTORS, SECTOR_ORDER } from '../../../shared/content';
import type { BuildingId } from '../../../shared/types';
import { buildAstronaut } from '../models/astronaut';
import {
  SECTOR_COLLIDER,
  buildBlueberries,
  buildBuilding,
  buildCityTower,
  buildDiscovery,
  buildHub,
  buildIceCave,
  buildLander,
  buildLandingPad,
  buildMeteorite,
  buildSector,
} from '../models/colony';
import { buildIx, buildRover } from '../models/machines';
import type { EntityDef, FocusPreset, InteractionDef } from './types';

const focus = (distance: number, minDistance: number, maxDistance: number, pitch: number, lift: number): FocusPreset => ({ distance, minDistance, maxDistance, pitch, lift });

const act = (id: string, kind: InteractionDef['kind'], anchor: string, radius: number, label: string): InteractionDef => ({ id, kind, anchor, radius, label, enabled: true });

export function createCatalog(): Map<string, EntityDef> {
  const defs: EntityDef[] = [];

  defs.push({
    id: 'character.astronaut',
    kind: 'character',
    name: 'Astronauta',
    description: 'Cada alumno de la clase, con el traje que diseñó en su celular.',
    source: 'Avatar del alumno (AvatarBuilder) y su rol en la tripulación',
    tags: ['crew'],
    collider: null,
    focus: focus(5.5, 2.2, 30, 16, 1.0),
    interactions: [act('greet', 'talk', 'head', 2.6, 'Saludar')],
    initialState: { anim: 'idle', speed: 1 },
    selectable: true,
    lodDistance: 32,
    build: buildAstronaut,
  });

  defs.push({
    id: 'character.ix',
    kind: 'character',
    name: 'IX',
    description: 'La inteligencia de la colonia. Narra la misión y da pistas a las tripulaciones.',
    source: 'IX, la IA narradora del juego',
    tags: ['ix'],
    collider: null,
    focus: focus(6, 2.6, 30, 12, 2.3),
    interactions: [act('talk', 'talk', 'head', 3.6, 'Hablar con IX')],
    initialState: { mode: 'idle' },
    selectable: true,
    lodDistance: 0,
    build: (ctx) => buildIx(ctx),
  });

  defs.push({
    id: 'vehicle.rover',
    kind: 'vehicle',
    name: 'Rover de exploración',
    description: 'Recorre el perímetro de la colonia midiendo el terreno, como los rovers de la NASA.',
    source: 'Ruta del rover del mapa de la colonia',
    tags: ['vehicle'],
    collider: { radius: 1.5, height: 2.2 },
    focus: focus(9, 4, 40, 20, 1),
    interactions: [act('inspect', 'inspect', 'door', 3.2, 'Ver el rover')],
    initialState: { speed: 0 },
    selectable: true,
    lodDistance: 48,
    build: (ctx) => buildRover(ctx),
  });

  defs.push({
    id: 'structure.hub',
    kind: 'structure',
    name: 'Centro de mando',
    description: 'El domo central de la colonia, desde donde IX coordina a las tripulaciones.',
    source: 'Hub del mapa de la colonia',
    tags: ['colony', 'hub'],
    collider: { radius: 6.2, height: 6 },
    focus: focus(30, 12, 80, 30, 2),
    interactions: [act('enter', 'enter', 'door', 3.6, 'Entrar al centro de mando')],
    initialState: {},
    selectable: true,
    lodDistance: 120,
    build: (ctx) => buildHub(ctx),
  });

  for (const s of SECTOR_ORDER) {
    defs.push({
      id: `sector.${s}`,
      kind: 'structure',
      name: SECTORS[s].name,
      description: SECTORS[s].desc,
      source: 'SECTORS (shared/content.ts)',
      tags: ['colony', 'sector', SECTORS[s].system],
      collider: { radius: SECTOR_COLLIDER[s], height: 3.6 },
      focus: focus(20, 8, 60, 28, 1.5),
      interactions: [act('console', 'inspect', 'console', 2.8, `Revisar ${SECTORS[s].name}`)],
      initialState: { health: 100, highlight: false },
      selectable: true,
      lodDistance: 70,
      build: buildSector(s),
    });
  }

  defs.push({
    id: 'prop.landingpad',
    kind: 'prop',
    name: 'Plataforma de abordaje',
    description: 'Aquí aparecen los astronautas cuando se unen a la misión.',
    source: 'Etapa de abordaje (landing pad del lobby)',
    tags: ['colony'],
    collider: null,
    focus: focus(22, 8, 60, 34, 0.5),
    interactions: [],
    initialState: {},
    selectable: true,
    lodDistance: 80,
    build: (ctx) => buildLandingPad(ctx),
  });

  defs.push({
    id: 'prop.lander',
    kind: 'prop',
    name: 'Nave de aterrizaje',
    description: 'La nave que trajo a la tripulación desde la Tierra: el viaje dura unos siete meses.',
    source: 'Etapa de abordaje',
    tags: ['colony'],
    collider: { radius: 1.8, height: 4 },
    focus: focus(12, 5, 40, 18, 2),
    interactions: [act('inspect', 'inspect', 'door', 3.2, 'Ver la nave')],
    initialState: {},
    selectable: true,
    lodDistance: 70,
    build: (ctx) => buildLander(ctx),
  });

  for (const b of ['hydroponics', 'recycler', 'reactor', 'antenna', 'module'] as Exclude<BuildingId, 'city'>[]) {
    defs.push({
      id: `building.${b}`,
      kind: 'building',
      name: BUILDINGS[b].name,
      description: BUILDINGS[b].desc,
      source: 'BUILDINGS (shared/content.ts)',
      tags: ['colony', 'building'],
      collider: { radius: 3.3, height: 4 },
      focus: focus(20, 8, 60, 26, 1.5),
      interactions: [act('inspect', 'inspect', 'door', 3.6, `Visitar: ${BUILDINGS[b].name}`)],
      initialState: { fresh: false },
      selectable: true,
      lodDistance: 70,
      build: buildBuilding(b),
    });
  }

  defs.push({
    id: 'building.cityTower',
    kind: 'building',
    name: 'Torre de la Ciudad Don Rover',
    description: BUILDINGS.city.desc,
    source: 'Edificio final (misión M-06)',
    tags: ['colony', 'building', 'city'],
    collider: { radius: 1.45, height: 8 },
    focus: focus(22, 8, 60, 24, 4),
    interactions: [],
    initialState: {},
    selectable: true,
    lodDistance: 90,
    build: buildCityTower,
  });

  defs.push({
    id: 'landmark.meteorite',
    kind: 'landmark',
    name: 'Meteorito de hierro',
    description: 'Un meteorito metálico, como el que encontró el rover Opportunity en 2005.',
    source: 'Descubrimientos misteriosos',
    tags: ['landmark', 'discovery'],
    collider: { radius: 1.7, height: 2 },
    focus: focus(9, 4, 30, 20, 1),
    interactions: [act('inspect', 'scan', 'center', 4, 'Escanear el meteorito')],
    initialState: {},
    selectable: true,
    lodDistance: 50,
    build: (ctx) => buildMeteorite(ctx),
  });

  defs.push({
    id: 'landmark.blueberries',
    kind: 'landmark',
    name: 'Arándanos marcianos',
    description: 'Esferitas de hematita como las que encontró Opportunity en 2004.',
    source: 'Descubrimientos misteriosos',
    tags: ['landmark', 'discovery'],
    collider: { radius: 1.4, height: 1 },
    focus: focus(8, 3, 30, 26, 0.5),
    interactions: [act('inspect', 'scan', 'center', 4, 'Escanear las esferitas')],
    initialState: {},
    selectable: true,
    lodDistance: 50,
    build: (ctx) => buildBlueberries(ctx),
  });

  defs.push({
    id: 'landmark.icecave',
    kind: 'landmark',
    name: 'Cueva de hielo',
    description: 'El radar de la colonia la detectó bajo el hielo.',
    source: 'Misión M-02 (tercer acontecimiento)',
    tags: ['landmark', 'ice'],
    collider: { radius: 2.0, height: 2.6 },
    focus: focus(10, 4, 30, 16, 1.2),
    interactions: [act('inspect', 'scan', 'center', 4.2, 'Escanear la cueva')],
    initialState: {},
    selectable: true,
    lodDistance: 50,
    build: (ctx) => buildIceCave(ctx),
  });

  defs.push({
    id: 'landmark.discovery',
    kind: 'landmark',
    name: 'Descubrimiento',
    description: 'Un hallazgo que la clase registró en la bitácora de descubrimientos.',
    source: 'Bitácora de descubrimientos de la colonia',
    tags: ['discovery'],
    collider: null,
    focus: focus(7, 3, 30, 18, 1.2),
    interactions: [act('inspect', 'inspect', 'center', 2.8, 'Ver el hallazgo')],
    initialState: {},
    selectable: true,
    lodDistance: 45,
    build: buildDiscovery,
  });

  return new Map(defs.map((d) => [d.id, d]));
}
