// Modelos de la colonia MARS-01: el centro de mando, los ocho sectores (cada uno con su
// propio diseño), la plataforma de abordaje con su nave, los edificios que la clase
// desbloquea, las torres de la Ciudad Don Rover y los hallazgos del terreno.
//
// Todos los modelos miran hacia +Z (el hub, en el caso de los sectores) y apoyan en y = 0.
// Las piezas grandes llevan un "faldón" bajo el suelo porque el planeta es diminuto y el
// terreno se curva bajo los bordes.

import { CylinderGeometry, Group, Mesh, Object3D, Vector3 } from 'three';
import { BUILDINGS, SECTORS, SYSTEMS } from '../../../shared/content';
import type { BuildingId, SectorId } from '../../../shared/types';
import { IX_PURPLE, PROPS } from '../core/palette';
import { damp, seeded } from '../core/math';
import type { BuildContext, BuiltModel, EntityState, UpdateContext } from '../entities/types';
import { Sculpt, type MaterialKit } from './sculpt';
import { CONCRETE, DARK, INK, PANEL, STEEL, SmokeColumn, WHITE, geodesicStruts, healthColor, labelSprite, shade } from './util';

const GREENS = ['#3FBF6A', '#55DB7A', '#2F9E52', '#7BE896'];
const WARM_WINDOW = '#FFE7A8';

/* ------------------------------------------------------------------ */
/* Piezas comunes                                                       */
/* ------------------------------------------------------------------ */

function plants(s: Sculpt, cx: number, cz: number, radius: number, count: number, seed: number, y = 0.12): void {
  const rnd = seeded(seed);
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * radius;
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    const size = 0.16 + rnd() * 0.16;
    s.sphere(size, GREENS[Math.floor(rnd() * GREENS.length)], { at: [x, y + size * 0.8, z], scale: [1, 0.85 + rnd() * 0.4, 1], rough: 0.85 });
    if (rnd() < 0.3) s.sphere(0.06, rnd() < 0.5 ? '#FF6B5B' : '#FFC93C', { at: [x + size * 0.5, y + size * 1.1, z], rough: 0.5 });
  }
}

function glassDome(kit: MaterialKit, r: number, tint: string, at: [number, number, number], opacity = 0.26, squash = 1): Mesh {
  const g = new Sculpt(1);
  g.dome(r, tint, { at, squash });
  return g.mesh(kit.glass(tint, opacity), 'glass:dome', false)!;
}

/** Losa circular de concreto con faldón (la curvatura del planeta no deja huecos). */
function pad(s: Sculpt, r: number, color = CONCRETE, stripe?: string): void {
  s.cylinder(r, r * 1.02, 0.7, shade(color, -0.08), { at: [0, -0.3, 0], sides: 40, rough: 0.95 });
  s.cylinder(r, r, 0.08, color, { at: [0, 0.04, 0], sides: 40, rough: 0.9 });
  if (stripe) s.torus(r - 0.18, 0.06, stripe, { at: [0, 0.085, 0], rot: [Math.PI / 2, 0, 0], glow: 0.35, rough: 0.6 });
}

/** Poste con farol (la luz sube al anochecer gracias al brillo propio). */
export function lampPost(s: Sculpt, x: number, z: number, h = 2.4, color = '#FFE7A8'): void {
  s.cylinder(0.05, 0.07, h, STEEL, { at: [x, h / 2, z], metal: 0.4, rough: 0.4, sides: 10 });
  s.cylinder(0.16, 0.12, 0.12, DARK, { at: [x, h + 0.02, z], sides: 12 });
  s.sphere(0.12, color, { at: [x, h - 0.08, z], glow: 1.8 });
}

interface SectorParts {
  /** Piezas del diseño propio del sector. */
  s: Sculpt;
  /** Piezas luminosas que parpadean cuando el sector está dañado. */
  lights: Sculpt;
  /** Grupo con piezas animadas propias. */
  extra: Group;
  /** Animación propia (recibe la salud 0–1). */
  animate?: (t: number, dt: number, health: number) => void;
  /** Altura de la columna de humo. */
  smokeAt: [number, number, number];
  collider: number;
}

/* ------------------------------------------------------------------ */
/* Diseños de los ocho sectores                                         */
/* ------------------------------------------------------------------ */

function greenhouse(kit: MaterialKit, d: 0 | 1): SectorParts {
  const s = new Sculpt(d);
  const lights = new Sculpt(d);
  const extra = new Group();
  const domes: [number, number, number][] = [
    [0, -0.7, 2.6],
    [2.95, 0.7, 1.55],
    [-2.95, 0.7, 1.55],
  ];
  for (const [x, z, r] of domes) {
    s.cylinder(r + 0.1, r + 0.12, 0.2, WHITE, { at: [x, 0.1, z], sides: 32, rough: 0.6 });
    s.cylinder(r - 0.1, r - 0.1, 0.06, '#7A4A35', { at: [x, 0.22, z], sides: 28 });
    plants(s, x, z, r * 0.7, d ? Math.round(r * 9) : 4, Math.round(r * 97 + x * 13), 0.22);
    geodesicStruts(s, r, WHITE, { at: [x, 0.2, z], thickness: 0.035, detail: r > 2 ? 2 : 1 });
    extra.add(glassDome(kit, r * 0.985, '#C8F7D6', [x, 0.2, z], 0.24));
    lights.torus(r * 0.45, 0.04, '#FF8FC8', { at: [x, 0.2 + r * 0.8, z], rot: [Math.PI / 2, 0, 0], glow: 1.6 });
  }
  // Puerta del domo grande
  s.box(1.0, 1.5, 0.9, WHITE, { at: [0, 0.75, 1.8], radius: 0.25, rough: 0.5 });
  s.box(0.6, 1.1, 0.05, '#2E3C8F', { at: [0, 0.65, 2.26], radius: 0.12, rough: 0.3 });
  return { s, lights, extra, smokeAt: [0, 2.7, -0.7], collider: 3.6 };
}

function solar(kit: MaterialKit, d: 0 | 1): SectorParts {
  const s = new Sculpt(d);
  const lights = new Sculpt(d);
  const extra = new Group();
  const panels: Group[] = [];
  for (let row = 0; row < 2; row++) {
    for (let col = -1; col <= 1; col++) {
      const x = col * 2.35;
      const z = -1.6 + row * 2.4;
      s.cylinder(0.08, 0.1, 1.15, STEEL, { at: [x, 0.58, z], metal: 0.4, rough: 0.4, sides: 10 });
      s.box(0.5, 0.12, 0.5, CONCRETE, { at: [x, 0.06, z], radius: 0.05 });
      const p = new Sculpt(d);
      p.box(2.1, 0.07, 1.3, '#2B3A8C', { radius: 0.02, rough: 0.22, metal: 0.4 });
      p.box(2.16, 0.05, 1.36, WHITE, { at: [0, -0.04, 0], radius: 0.02 });
      if (d) {
        for (let i = -3; i <= 3; i++) p.box(0.012, 0.08, 1.26, '#7E93FF', { at: [i * 0.29, 0.005, 0], radius: 0.003, glow: 0.22 });
        p.box(2.06, 0.08, 0.012, '#7E93FF', { at: [0, 0.005, 0], radius: 0.003, glow: 0.22 });
      }
      const g = new Group();
      g.position.set(x, 1.2, z);
      g.add(p.mesh(kit.paint, 'solar:panel')!);
      g.rotation.x = -0.55;
      extra.add(g);
      panels.push(g);
    }
  }
  // Inversor
  s.box(1.2, 1.3, 0.8, WHITE, { at: [3.4, 0.65, 1.6], radius: 0.12, rough: 0.5 });
  s.box(1.22, 0.12, 0.82, SYSTEMS.energy.color, { at: [3.4, 1.1, 1.6], radius: 0.04 });
  lights.box(0.3, 0.12, 0.04, SYSTEMS.energy.color, { at: [3.4, 0.7, 2.02], radius: 0.02, glow: 1.4 });
  if (d) s.tube([[3.4, 0.08, 1.2], [1.5, 0.08, 0.4], [0, 0.08, -0.4]], 0.05, DARK);
  const animate = (t: number, dt: number, health: number) => {
    // Los paneles siguen al Sol; si el sector está dañado se quedan caídos.
    const track = -0.55 + Math.sin(t * 0.08) * 0.18;
    for (const [i, g] of panels.entries()) g.rotation.x = damp(g.rotation.x, health > 0.35 ? track + i * 0.01 : -0.12, 0.8, dt);
  };
  return { s, lights, extra, animate, smokeAt: [3.4, 1.4, 1.6], collider: 3.9 };
}

function waterplant(kit: MaterialKit, d: 0 | 1): SectorParts {
  const s = new Sculpt(d);
  const lights = new Sculpt(d);
  const extra = new Group();
  for (const x of [-1.5, 1.5]) {
    s.cylinder(1.05, 1.1, 2.4, WHITE, { at: [x, 1.2, 0.2], sides: 32, rough: 0.45 });
    s.dome(1.05, PANEL, { at: [x, 2.4, 0.2], squash: 0.45 });
    s.cylinder(1.12, 1.12, 0.14, SYSTEMS.water.dark, { at: [x, 0.07, 0.2], sides: 32 });
    for (const y of [0.7, 1.3, 1.9]) lights.torus(1.075, 0.035, SYSTEMS.water.color, { at: [x, y, 0.2], rot: [Math.PI / 2, 0, 0], glow: 1.1 });
    s.box(0.2, 1.6, 0.06, '#BDEBFF', { at: [x, 1.2, 1.28], radius: 0.03, glow: 0.4 });
  }
  // Tubería entre tanques
  s.tube([[-0.5, 1.6, 0.2], [0, 1.9, 0.4], [0.5, 1.6, 0.2]], 0.12, STEEL, { metal: 0.5, rough: 0.35 });
  // Torre de perforación con taladro giratorio
  s.cylinder(0.12, 0.2, 3.6, STEEL, { at: [0, 1.8, -1.9], metal: 0.5, rough: 0.35, sides: 8 });
  for (const sx of [-1, 1]) s.tube([[sx * 0.9, 0, -2.5], [sx * 0.15, 3.4, -1.9]], 0.06, STEEL, { metal: 0.5 });
  s.box(1.2, 0.5, 0.9, SYSTEMS.water.dark, { at: [0, 3.5, -1.9], radius: 0.1 });
  const drill = new Group();
  const dr = new Sculpt(d);
  dr.cylinder(0.08, 0.08, 1.1, '#9AA0C2', { at: [0, -0.55, 0], metal: 0.7, rough: 0.25 });
  dr.cone(0.22, 0.5, '#FFC93C', { at: [0, -1.25, 0], rot: [Math.PI, 0, 0], metal: 0.3 });
  drill.add(dr.mesh(kit.paint, 'water:drill')!);
  drill.position.set(0, 1.3, -1.9);
  extra.add(drill);
  // Bloques de hielo extraídos
  const ice = new Sculpt(d);
  for (const [x, z, r] of [
    [1.9, -1.9, 0.38],
    [2.4, -1.4, 0.28],
    [-2.1, -1.7, 0.33],
  ] as const)
    ice.blob(r, '#D6F4F8', { at: [x, r * 0.7, z], rough: 0.25 });
  extra.add(ice.mesh(kit.paint, 'water:ice')!);
  const animate = (t: number, dt: number, health: number) => {
    drill.rotation.y += dt * 6 * health;
    drill.position.y = 1.3 + Math.sin(t * 2.4) * 0.12 * health;
  };
  return { s, lights, extra, animate, smokeAt: [0, 3.8, -1.9], collider: 3.4 };
}

function habitat(kit: MaterialKit, d: 0 | 1): SectorParts {
  const s = new Sculpt(d);
  const lights = new Sculpt(d);
  const extra = new Group();
  const body = SYSTEMS.habitat.color;
  // Módulo inferior (a lo largo de X) sobre patas
  for (const x of [-1.6, 1.6]) s.box(0.3, 0.6, 1.6, STEEL, { at: [x, 0.3, -0.4], radius: 0.08 });
  s.capsule(1.05, 3.0, WHITE, { at: [0, 1.6, -0.4], rot: [0, 0, Math.PI / 2], rough: 0.45 });
  s.torus(1.07, 0.06, body, { at: [-0.9, 1.6, -0.4], rot: [0, Math.PI / 2, 0], rough: 0.5 });
  s.torus(1.07, 0.06, body, { at: [0.9, 1.6, -0.4], rot: [0, Math.PI / 2, 0], rough: 0.5 });
  // Módulo superior cruzado
  s.capsule(0.8, 1.6, PANEL, { at: [0, 3.05, -0.4], rot: [Math.PI / 2, 0, 0], rough: 0.45 });
  s.box(0.5, 0.4, 0.5, STEEL, { at: [0, 2.55, -0.4], radius: 0.1 });
  // Ventanas redondas
  for (const x of [-1.5, -0.5, 0.5, 1.5]) {
    s.torus(0.22, 0.05, DARK, { at: [x, 1.75, 0.6], rough: 0.5 });
    lights.disc(0.2, WARM_WINDOW, { at: [x, 1.75, 0.62], rot: [Math.PI / 2, 0, 0], glow: 1.3 });
  }
  for (const z of [-1.2, 0.4]) lights.disc(0.16, WARM_WINDOW, { at: [0.8, 3.1, z - 0.4], rot: [0, 0, -Math.PI / 2], glow: 1.3 });
  // Puerta, rampa y escalera
  s.box(1.0, 1.4, 0.5, PANEL, { at: [0, 0.95, 0.75], radius: 0.18 });
  s.box(0.66, 1.05, 0.06, body, { at: [0, 0.9, 1.0], radius: 0.12 });
  s.box(1.0, 0.08, 1.2, STEEL, { at: [0, 0.3, 1.55], rot: [0.33, 0, 0], radius: 0.03 });
  for (const x of [-2.05, -1.75]) s.cylinder(0.03, 0.03, 2.8, STEEL, { at: [x, 1.4, 0.3], metal: 0.5 });
  for (let i = 0; i < 7; i++) s.cylinder(0.025, 0.025, 0.3, STEEL, { at: [-1.9, 0.35 + i * 0.38, 0.3], rot: [0, 0, Math.PI / 2], metal: 0.5 });
  // Pequeño jardín y banca
  plants(s, 2.6, 1.6, 0.6, 5, 41);
  s.box(1.0, 0.12, 0.35, '#C98A5B', { at: [-2.6, 0.45, 1.8], radius: 0.04 });
  return { s, lights, extra, smokeAt: [0, 3.9, -0.4], collider: 3.2 };
}

function oxygen(kit: MaterialKit, d: 0 | 1): SectorParts {
  const s = new Sculpt(d);
  const lights = new Sculpt(d);
  const extra = new Group();
  const cyan = '#62E6FF';
  s.cylinder(1.15, 1.25, 0.5, STEEL, { at: [0, 0.25, -0.3], sides: 32, metal: 0.3, rough: 0.4 });
  s.cylinder(1.0, 1.0, 3.0, WHITE, { at: [0, 2.0, -0.3], sides: 32, rough: 0.45, open: false });
  s.dome(1.0, PANEL, { at: [0, 3.5, -0.3], squash: 0.35 });
  // Ventana con el núcleo luminoso
  lights.cylinder(0.55, 0.55, 1.5, cyan, { at: [0, 2.0, -0.3], sides: 24, glow: 1.5 });
  extra.add(
    (() => {
      const g = new Sculpt(d);
      g.cylinder(1.02, 1.02, 1.1, '#BFF4FF', { at: [0, 2.0, -0.3], sides: 32, open: true });
      return g.mesh(kit.glass('#BFF4FF', 0.32), 'oxygen:window', false)!;
    })(),
  );
  // Espiral de tubería
  if (d) {
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 5;
      pts.push([Math.cos(a) * 1.12, 0.6 + (i / 40) * 2.6, -0.3 + Math.sin(a) * 1.12]);
    }
    s.tube(pts, 0.06, SYSTEMS.water.dark, { metal: 0.3, rough: 0.4 });
  }
  // Botellas de O₂
  for (const [x, z] of [
    [2.0, 0.6],
    [2.4, 0.0],
    [-2.1, 0.5],
  ] as const) {
    s.capsule(0.28, 0.9, '#E9F6FF', { at: [x, 0.75, z], rough: 0.4 });
    s.cylinder(0.29, 0.29, 0.12, SYSTEMS.water.color, { at: [x, 0.9, z], sides: 16 });
  }
  // Ventiladores
  const fans: Group[] = [];
  for (const [x, z] of [
    [0.45, -0.3],
    [-0.45, -0.3],
  ] as const) {
    const f = new Sculpt(d);
    f.cylinder(0.05, 0.05, 0.1, DARK, {});
    for (let i = 0; i < 3; i++) f.box(0.5, 0.025, 0.12, STEEL, { at: [Math.cos((i / 3) * Math.PI * 2) * 0.22, 0, Math.sin((i / 3) * Math.PI * 2) * 0.22], rot: [0.3, -(i / 3) * Math.PI * 2, 0], radius: 0.01 });
    const g = new Group();
    g.position.set(x, 3.9, z);
    g.add(f.mesh(kit.paint, 'oxygen:fan')!);
    extra.add(g);
    fans.push(g);
    s.cylinder(0.32, 0.32, 0.25, PANEL, { at: [x, 3.72, z], sides: 20, open: true });
  }
  const animate = (_t: number, dt: number, health: number) => {
    for (const f of fans) f.rotation.y += dt * 9 * health;
  };
  return { s, lights, extra, animate, smokeAt: [0, 4.1, -0.3], collider: 2.6 };
}

function battery(kit: MaterialKit, d: 0 | 1): SectorParts {
  const s = new Sculpt(d);
  const lights = new Sculpt(d);
  const extra = new Group();
  const y = SYSTEMS.energy.color;
  const bars: Group[] = [];
  for (let row = 0; row < 2; row++) {
    for (let col = -1; col <= 1; col++) {
      const x = col * 1.55;
      const z = -1.2 + row * 1.9;
      s.box(1.1, 1.8, 1.0, WHITE, { at: [x, 0.95, z], radius: 0.2, rough: 0.5 });
      s.box(1.12, 0.22, 1.02, DARK, { at: [x, 0.11, z], radius: 0.06 });
      s.cylinder(0.24, 0.24, 0.16, y, { at: [x, 1.92, z], sides: 18, metal: 0.3 });
      s.box(0.36, 1.2, 0.05, '#2B2552', { at: [x, 0.95, z + 0.51], radius: 0.05 });
      // Barra de carga (escala con la salud)
      const bar = new Sculpt(d);
      bar.box(0.26, 1.1, 0.04, y, { at: [0, 0.55, 0], radius: 0.04, glow: 1.4 });
      const g = new Group();
      g.position.set(x, 0.4, z + 0.54);
      g.add(bar.mesh(kit.paint, 'battery:bar', false)!);
      extra.add(g);
      bars.push(g);
    }
  }
  s.tube([[-1.55, 2.05, -1.2], [0, 2.3, -1.2], [1.55, 2.05, -1.2]], 0.07, DARK);
  s.tube([[-1.55, 2.05, 0.7], [0, 2.3, 0.7], [1.55, 2.05, 0.7]], 0.07, DARK);
  lights.sphere(0.09, y, { at: [2.6, 2.2, 0], glow: 2 });
  s.cylinder(0.05, 0.05, 2.2, STEEL, { at: [2.6, 1.1, 0], metal: 0.4 });
  const animate = (_t: number, dt: number, health: number) => {
    for (const b of bars) b.scale.y = damp(b.scale.y, Math.max(0.06, health), 2, dt);
  };
  return { s, lights, extra, animate, smokeAt: [0, 2.4, -0.2], collider: 3.2 };
}

function algae(kit: MaterialKit, d: 0 | 1): SectorParts {
  const s = new Sculpt(d);
  const lights = new Sculpt(d);
  const extra = new Group();
  const green = '#7CF29C';
  // Laboratorio
  s.box(3.0, 1.7, 1.8, WHITE, { at: [0, 0.85, -1.4], radius: 0.35, rough: 0.45 });
  s.box(3.02, 0.14, 1.82, SYSTEMS.food.color, { at: [0, 1.5, -1.4], radius: 0.05 });
  for (const x of [-0.9, 0, 0.9]) lights.box(0.55, 0.42, 0.04, '#D8FFE3', { at: [x, 0.95, -0.49], radius: 0.08, glow: 1.0 });
  s.dome(0.45, PANEL, { at: [0.9, 1.7, -1.4] });
  // Fotobiorreactores: tubos de vidrio con algas luminosas
  const tubes: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = -0.9 + (i / 5) * 1.8;
    tubes.push([Math.sin(a) * 2.6, 0.9 + Math.cos(a) * 0.9]);
  }
  const glass = new Sculpt(d);
  for (const [x, z] of tubes) {
    s.cylinder(0.36, 0.38, 0.2, STEEL, { at: [x, 0.1, z], sides: 16, metal: 0.4 });
    s.cylinder(0.36, 0.36, 0.14, STEEL, { at: [x, 2.55, z], sides: 16, metal: 0.4 });
    lights.cylinder(0.24, 0.24, 2.2, green, { at: [x, 1.32, z], sides: 14, glow: 0.9 });
    glass.cylinder(0.3, 0.3, 2.3, '#D8FFE3', { at: [x, 1.35, z], sides: 18, open: true });
  }
  extra.add(glass.mesh(kit.glass('#D8FFE3', 0.3), 'algae:glass', false)!);
  if (d) s.tube(tubes.map(([x, z]) => [x, 2.68, z] as [number, number, number]), 0.07, STEEL, { metal: 0.4 });
  // Burbujas que suben
  const bubbles = new Group();
  const bs = new Sculpt(d);
  bs.sphere(0.06, '#F0FFF4', { glow: 0.8 });
  const bubbleGeo = bs.build()!;
  const rnd = seeded(77);
  for (let i = 0; i < (d ? 18 : 0); i++) {
    const [x, z] = tubes[i % tubes.length];
    const m = new Mesh(bubbleGeo, kit.paint);
    m.position.set(x + (rnd() - 0.5) * 0.2, 0.3, z + (rnd() - 0.5) * 0.2);
    m.userData.offset = rnd();
    bubbles.add(m);
  }
  extra.add(bubbles);
  const animate = (t: number, _dt: number, health: number) => {
    for (const b of bubbles.children) {
      const k = (t * 0.25 * (0.3 + health) + (b.userData.offset as number)) % 1;
      b.position.y = 0.35 + k * 2.0;
      b.visible = health > 0.2;
    }
  };
  return { s, lights, extra, animate, smokeAt: [0, 2.0, -1.4], collider: 3.2 };
}

function shield(kit: MaterialKit, d: 0 | 1): SectorParts {
  const s = new Sculpt(d);
  const lights = new Sculpt(d);
  const extra = new Group();
  const rust = '#C66B47';
  // Domo blindado con capas de regolito
  s.dome(2.9, rust, { squash: 0.72, rough: 1 });
  if (d) {
    const rnd = seeded(13);
    for (let ring = 0; ring < 5; ring++) {
      const el = (ring / 5) * Math.PI * 0.45;
      const rr = Math.cos(el) * 2.92;
      const yy = Math.sin(el) * 2.92 * 0.72;
      const n = Math.max(6, Math.round(rr * 4.2));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ring * 0.3;
        const shadeK = (rnd() - 0.5) * 0.18;
        s.box(0.8, 0.42, 0.5, shade(rust, shadeK), { at: [Math.cos(a) * rr, yy + 0.18, Math.sin(a) * rr], rot: [0, -a + Math.PI / 2, -el], radius: 0.16, rough: 1 });
      }
    }
  }
  // Túnel de entrada blindado
  s.box(1.5, 1.6, 2.2, shade(rust, -0.05), { at: [0, 0.8, 2.3], radius: 0.45, rough: 1 });
  s.box(1.0, 1.25, 0.1, STEEL, { at: [0, 0.7, 3.38], radius: 0.18, metal: 0.4, rough: 0.35 });
  s.box(0.5, 0.08, 0.04, SYSTEMS.habitat.color, { at: [0, 1.15, 3.44], radius: 0.02, glow: 1.3 });
  // Emisor del escudo
  s.cylinder(0.12, 0.2, 1.0, STEEL, { at: [0, 2.5, 0], metal: 0.5 });
  const ring = new Group();
  const rs = new Sculpt(d);
  rs.torus(0.8, 0.06, SYSTEMS.habitat.color, { rot: [Math.PI / 2, 0, 0], glow: 1.6 });
  rs.torus(0.5, 0.04, '#FFD0C8', { rot: [Math.PI / 2, 0, 0], glow: 1.2 });
  ring.add(rs.mesh(kit.paint, 'shield:ring', false)!);
  ring.position.set(0, 3.1, 0);
  extra.add(ring);
  lights.sphere(0.14, '#FFD0C8', { at: [0, 3.15, 0], glow: 2 });
  const animate = (t: number, dt: number, health: number) => {
    ring.rotation.y += dt * 1.5 * health;
    ring.position.y = 3.1 + Math.sin(t * 1.8) * 0.12;
    ring.scale.setScalar(0.9 + Math.sin(t * 3) * 0.06 * health + 0.1 * health);
  };
  return { s, lights, extra, animate, smokeAt: [0, 2.6, 0], collider: 3.3 };
}

const SECTOR_DESIGNS: Record<SectorId, (kit: MaterialKit, d: 0 | 1) => SectorParts> = {
  greenhouse,
  solar,
  waterplant,
  habitat,
  oxygen,
  battery,
  algae,
  shield,
};

export const SECTOR_COLLIDER: Record<SectorId, number> = {
  greenhouse: 3.6,
  solar: 3.9,
  waterplant: 3.4,
  habitat: 3.2,
  oxygen: 2.6,
  battery: 3.2,
  algae: 3.2,
  shield: 3.3,
};

/** Construye el sector con su base, su baliza de salud, su consola y su letrero. */
export function buildSector(id: SectorId) {
  return (ctx: BuildContext): BuiltModel => {
    const kit = ctx.kit;
    const d = ctx.detail;
    const sys = SYSTEMS[SECTORS[id].system];
    const root = new Group();
    root.name = `sector:${id}`;
    const parts = SECTOR_DESIGNS[id](kit, d);

    // Losa con el color del sistema
    const base = new Sculpt(d);
    pad(base, 4.9, CONCRETE, sys.color);
    // Muelle del tubo elevado que llega del hub
    base.cylinder(0.14, 0.18, 2.0, STEEL, { at: [0, 1.0, 4.15], metal: 0.4, sides: 10 });
    base.box(0.95, 0.9, 0.8, WHITE, { at: [0, 2.2, 4.1], radius: 0.25, rough: 0.5 });
    base.torus(0.38, 0.07, sys.color, { at: [0, 2.2, 4.52], rough: 0.5 });
    // Consola de la tripulación
    base.box(0.7, 0.9, 0.45, PANEL, { at: [1.9, 0.45, 3.5], radius: 0.12, rough: 0.5 });
    base.box(0.8, 0.08, 0.55, DARK, { at: [1.9, 0.95, 3.55], rot: [0.45, 0, 0], radius: 0.03 });
    parts.lights.box(0.62, 0.02, 0.4, sys.color, { at: [1.9, 1.0, 3.58], rot: [0.45, 0, 0], radius: 0.01, glow: 1.1 });
    // Poste de la baliza
    base.cylinder(0.07, 0.1, 3.0, STEEL, { at: [-2.7, 1.5, 3.1], metal: 0.4, sides: 10 });
    base.cylinder(0.24, 0.2, 0.12, DARK, { at: [-2.7, 3.02, 3.1], sides: 14 });
    // Faroles de la losa
    lampPost(base, 3.6, -3.0, 2.2);
    lampPost(base, -3.6, -3.0, 2.2);
    root.add(base.mesh(kit.paint, 'sector:base')!);

    const main = parts.s.mesh(kit.paint, `sector:${id}`);
    if (main) root.add(main);
    const lights = parts.lights.mesh(kit.paint, 'sector:lights', false);
    if (lights) root.add(lights);
    root.add(parts.extra);

    // Baliza de salud (material de luz que cambia de color)
    const beaconSculpt = new Sculpt(d);
    beaconSculpt.sphere(0.24, '#FFFFFF');
    const beacon = beaconSculpt.mesh(kit.light(healthColor(100)), 'sector:beacon', false)!;
    beacon.position.set(-2.7, 3.3, 3.1);
    root.add(beacon);
    const haloSculpt = new Sculpt(d);
    haloSculpt.torus(0.42, 0.03, '#FFFFFF', { rot: [Math.PI / 2, 0, 0] });
    const halo = haloSculpt.mesh(kit.light(healthColor(100), 0.6), 'sector:beacon-halo', false)!;
    halo.position.copy(beacon.position);
    root.add(halo);

    // Anillo que se ilumina cuando IX resalta este sistema
    const hlSculpt = new Sculpt(d);
    hlSculpt.torus(5.3, 0.09, '#FFFFFF', { rot: [Math.PI / 2, 0, 0] });
    const highlight = hlSculpt.mesh(kit.light(sys.color, 0.85), 'sector:highlight', false)!;
    highlight.position.y = 0.15;
    highlight.visible = false;
    root.add(highlight);

    const smoke = new SmokeColumn(kit, parts.smokeAt, d ? 6 : 3);
    root.add(smoke.group);

    let label: Object3D | null = null;
    if (d) {
      label = labelSprite(`${SECTORS[id].emoji} ${SECTORS[id].name}`, { height: 0.62 });
      label.position.set(0, 5.4, 0);
      root.add(label);
    }

    let health = 1;
    let shownHealth = 1;
    let flicker = 0;
    const applyState = (state: EntityState) => {
      const h = Number(state.health ?? 100);
      health = h / 100;
      const color = healthColor(h);
      beacon.material = kit.light(color);
      halo.material = kit.light(color, 0.6);
      smoke.group.visible = h < 35;
      highlight.visible = Boolean(state.highlight);
    };
    const update = (_state: EntityState, uc: UpdateContext) => {
      const t = uc.time;
      shownHealth = damp(shownHealth, health, 1.5, uc.dt);
      parts.animate?.(t, uc.dt, shownHealth);
      smoke.update(t);
      const crit = health < 0.35;
      const warn = health < 0.6;
      const pulse = crit ? (Math.sin(t * 9) > 0 ? 1 : 0.25) : warn ? 0.65 + Math.sin(t * 3) * 0.35 : 1;
      beacon.scale.setScalar(0.85 + pulse * 0.25);
      halo.scale.setScalar(1 + ((t * (crit ? 1.6 : 0.7)) % 1) * 0.8);
      if (lights) {
        if (crit) {
          flicker -= uc.dt;
          if (flicker <= 0) {
            lights.visible = !lights.visible || Math.random() < 0.4;
            flicker = 0.05 + Math.random() * 0.35;
          }
        } else lights.visible = true;
      }
      if (highlight.visible) highlight.scale.setScalar(1 + Math.sin(t * 4) * 0.025);
    };

    return {
      object: root,
      anchors: {
        console: new Vector3(1.9, 1.0, 3.9),
        beacon: new Vector3(-2.7, 3.3, 3.1),
        label: new Vector3(0, 5.4, 0),
        door: new Vector3(0, 0.8, 4.6),
        crew: new Vector3(0, 0, 6.4),
      },
      rig: { beacon, highlight, extra: parts.extra },
      update,
      applyState,
    };
  };
}

/* ------------------------------------------------------------------ */
/* Centro de mando                                                      */
/* ------------------------------------------------------------------ */

export const HUB_DOME = 5.0;

export function buildHub(ctx: BuildContext): BuiltModel {
  const kit = ctx.kit;
  const d = ctx.detail;
  const root = new Group();
  root.name = 'hub';
  const s = new Sculpt(d);
  // Basamento escalonado con faldón
  s.lathe(
    [
      [0, -0.9],
      [6.6, -0.9],
      [6.6, 0.12],
      [6.0, 0.14],
      [6.0, 0.32],
      [5.3, 0.34],
      [5.3, 0.5],
      [0, 0.5],
    ],
    CONCRETE,
    { rough: 0.9 },
  );
  s.torus(5.12, 0.14, WHITE, { at: [0, 0.52, 0], rot: [Math.PI / 2, 0, 0], rough: 0.5 });
  // Interior: columna central con el núcleo de IX y plataformas
  s.cylinder(0.55, 0.75, 4.3, WHITE, { at: [0, 2.6, 0], sides: 24, rough: 0.45 });
  s.cylinder(2.9, 2.9, 0.16, PANEL, { at: [0, 1.75, 0], sides: 40, rough: 0.6 });
  s.torus(2.9, 0.06, IX_PURPLE, { at: [0, 1.84, 0], rot: [Math.PI / 2, 0, 0], glow: 0.8 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    s.box(0.5, 0.8, 0.35, DARK, { at: [Math.cos(a) * 3.6, 0.9, Math.sin(a) * 3.6], rot: [0, -a + Math.PI / 2, 0], radius: 0.08 });
  }
  plants(s, 2.6, -2.4, 0.9, d ? 9 : 3, 5, 0.5);
  plants(s, -2.6, -2.4, 0.9, d ? 9 : 3, 6, 0.5);
  geodesicStruts(s, HUB_DOME, WHITE, { at: [0, 0.5, 0], thickness: 0.06, detail: 2 });
  // Pórtico de entrada (sur = −Z local está hacia la plataforma; la puerta mira al sur)
  s.box(2.2, 2.4, 1.6, WHITE, { at: [0, 1.4, -5.2], radius: 0.5, rough: 0.45 });
  s.box(1.4, 1.9, 0.08, '#2E3C8F', { at: [0, 1.25, -6.0], radius: 0.25, rough: 0.25 });
  s.box(1.5, 0.12, 0.06, IX_PURPLE, { at: [0, 2.35, -6.02], radius: 0.03, glow: 1.4 });
  // Aguja de comunicaciones
  s.cylinder(0.12, 0.22, 2.6, STEEL, { at: [0, HUB_DOME + 1.6, 0], metal: 0.5, rough: 0.35 });
  s.torus(0.4, 0.05, STEEL, { at: [0, HUB_DOME + 1.9, 0], rot: [Math.PI / 2, 0, 0], metal: 0.5 });
  s.sphere(0.2, '#FF6B5B', { at: [0, HUB_DOME + 2.95, 0], glow: 2.2 });
  // Faroles entre los tubos (sin tapar la puerta, que mira al sur = −Z).
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    if (Math.abs(a - Math.PI * 1.5) < 0.1) continue;
    lampPost(s, Math.cos(a) * 6.25, Math.sin(a) * 6.25, 1.6, '#E8DDFF');
  }
  root.add(s.mesh(kit.paint, 'hub:structure')!);
  root.add(glassDome(kit, HUB_DOME * 0.99, '#D6F0FF', [0, 0.5, 0], 0.22));

  // Núcleo de IX (gira y late)
  const core = new Group();
  const cs = new Sculpt(d);
  cs.sphere(0.62, IX_PURPLE, { glow: 1.6, rough: 0.3 });
  cs.torus(0.95, 0.05, '#E9DEFF', { rot: [Math.PI / 2, 0, 0], glow: 1.4 });
  cs.torus(1.15, 0.04, IX_PURPLE, { rot: [0.5, 0, 0], glow: 1.2 });
  core.add(cs.mesh(kit.paint, 'hub:core', false)!);
  core.position.set(0, 3.2, 0);
  root.add(core);

  let label: Object3D | null = null;
  if (d) {
    label = labelSprite('🛰️ Centro de mando', { height: 0.72 });
    label.position.set(0, HUB_DOME + 4.0, 0);
    root.add(label);
  }

  const update = (_state: EntityState, uc: UpdateContext) => {
    core.rotation.y += uc.dt * 0.6;
    core.position.y = 3.2 + Math.sin(uc.time * 1.3) * 0.1;
    const k = 1 + Math.sin(uc.time * 2.2) * 0.04;
    core.scale.setScalar(k);
  };

  return {
    object: root,
    anchors: {
      door: new Vector3(0, 1.0, -6.4),
      core: new Vector3(0, 3.2, 0),
      top: new Vector3(0, HUB_DOME + 3, 0),
      label: new Vector3(0, HUB_DOME + 4, 0),
    },
    rig: { core },
    update,
  };
}

/* ------------------------------------------------------------------ */
/* Plataforma de abordaje y nave                                        */
/* ------------------------------------------------------------------ */

export function buildLandingPad(ctx: BuildContext): BuiltModel {
  const kit = ctx.kit;
  const d = ctx.detail;
  const root = new Group();
  root.name = 'landing-pad';
  const s = new Sculpt(d);
  s.cylinder(5.6, 5.8, 0.8, shade(CONCRETE, -0.1), { at: [0, -0.35, 0], sides: 8, rough: 0.95 });
  s.cylinder(5.6, 5.6, 0.14, '#E9E3F0', { at: [0, 0.07, 0], sides: 8, rough: 0.85 });
  // Franja de seguridad
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    s.box(0.9, 0.03, 0.34, i % 2 ? INK : '#FFC93C', { at: [Math.cos(a) * 4.9, 0.15, Math.sin(a) * 4.9], rot: [0, -a, 0], radius: 0.01 });
  }
  // Logo de IX en el centro
  const lights = new Sculpt(d);
  lights.torus(2.0, 0.09, IX_PURPLE, { at: [0, 0.16, 0], rot: [Math.PI / 2, 0, 0], glow: 1.2 });
  lights.box(2.6, 0.03, 0.28, IX_PURPLE, { at: [0, 0.16, 0], rot: [0, Math.PI / 4, 0], radius: 0.01, glow: 1.2 });
  lights.box(2.6, 0.03, 0.28, IX_PURPLE, { at: [0, 0.16, 0], rot: [0, -Math.PI / 4, 0], radius: 0.01, glow: 1.2 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    lights.sphere(0.12, '#B6FFCB', { at: [Math.cos(a) * 5.45, 0.2, Math.sin(a) * 5.45], glow: 2 });
  }
  root.add(s.mesh(kit.paint, 'pad:base')!);
  const lightMesh = lights.mesh(kit.paint, 'pad:lights', false)!;
  root.add(lightMesh);
  let label: Object3D | null = null;
  if (d) {
    label = labelSprite('🚀 Plataforma de abordaje', { height: 0.62 });
    label.position.set(0, 3.6, 0);
    root.add(label);
  }
  const update = (_s: EntityState, uc: UpdateContext) => {
    lightMesh.visible = Math.sin(uc.time * 2.4) > -0.6;
  };
  return { object: root, anchors: { center: new Vector3(0, 0.2, 0), label: new Vector3(0, 3.6, 0) }, update };
}

export function buildLander(ctx: BuildContext): BuiltModel {
  const kit = ctx.kit;
  const d = ctx.detail;
  const root = new Group();
  root.name = 'lander';
  const s = new Sculpt(d);
  s.lathe(
    [
      [0, 0.9],
      [1.45, 0.95],
      [1.55, 1.4],
      [1.25, 2.6],
      [0.8, 3.4],
      [0.3, 3.85],
      [0, 3.92],
    ],
    WHITE,
    { rough: 0.4 },
  );
  s.torus(1.5, 0.08, '#FF9A3C', { at: [0, 1.25, 0], rot: [Math.PI / 2, 0, 0] });
  s.torus(1.0, 0.06, '#FF9A3C', { at: [0, 3.1, 0], rot: [Math.PI / 2, 0, 0] });
  s.cylinder(0.9, 1.15, 0.6, DARK, { at: [0, 0.65, 0], sides: 24 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a);
    const z = Math.sin(a);
    s.tube([[x * 1.2, 1.2, z * 1.2], [x * 1.9, 0.45, z * 1.9], [x * 2.05, 0.1, z * 2.05]], 0.07, STEEL, { metal: 0.5 });
    s.cylinder(0.26, 0.3, 0.1, STEEL, { at: [x * 2.05, 0.05, z * 2.05], metal: 0.5 });
  }
  // Ventanas y escotilla
  s.torus(0.34, 0.06, DARK, { at: [0, 2.35, 1.13], rot: [-0.32, 0, 0] });
  s.sphere(0.3, '#7FDBFF', { at: [0, 2.35, 1.1], scale: [1, 1, 0.4], glow: 0.6, rough: 0.2 });
  s.box(0.9, 1.1, 0.12, PANEL, { at: [0, 1.6, 1.4], rot: [-0.12, 0, 0], radius: 0.12 });
  s.box(0.8, 0.08, 1.4, STEEL, { at: [0, 0.6, 2.0], rot: [0.62, 0, 0], radius: 0.03 });
  s.sphere(0.12, '#FF6B5B', { at: [0, 3.95, 0], glow: 2 });
  root.add(s.mesh(kit.paint, 'lander')!);
  return { object: root, anchors: { door: new Vector3(0, 1.0, 2.4), label: new Vector3(0, 4.6, 0) } };
}

/* ------------------------------------------------------------------ */
/* Edificios desbloqueables                                             */
/* ------------------------------------------------------------------ */

function hydroponics(s: Sculpt, lights: Sculpt, extra: Group, kit: MaterialKit, d: 0 | 1): void {
  s.box(5.0, 0.25, 3.6, CONCRETE, { at: [0, 0.12, 0], radius: 0.08 });
  for (const x of [-2.35, 2.35]) s.box(0.3, 2.7, 3.4, WHITE, { at: [x, 1.35, 0], radius: 0.14 });
  for (const z of [-0.8, 0.8]) {
    s.box(4.2, 0.5, 0.7, PANEL, { at: [0, 0.5, z], radius: 0.1 });
    const n = d ? 9 : 4;
    for (let i = 0; i < n; i++) s.sphere(0.2, GREENS[i % GREENS.length], { at: [-1.8 + (i * 3.6) / (n - 1), 0.92, z], scale: [1, 1.2, 1] });
    lights.box(4.0, 0.04, 0.12, '#FF8FC8', { at: [0, 2.3, z], radius: 0.02, glow: 1.6 });
  }
  for (const x of [-1.5, 0, 1.5]) s.torus(1.66, 0.05, WHITE, { at: [x, 0.3, 0], rot: [0, Math.PI / 2, 0], arc: Math.PI });
  const glass = new Sculpt(d);
  glass.add(halfTunnel(1.64, 4.6), '#C8F7D6', { at: [0, 0.3, 0] });
  extra.add(glass.mesh(kit.glass('#C8F7D6', 0.24), 'hydro:glass', false)!);
  s.cylinder(0.7, 0.7, 1.6, SYSTEMS.water.color, { at: [3.3, 0.8, 1.4], sides: 20 });
}

/** Medio cilindro (techo de un túnel) acostado a lo largo de X. */
function halfTunnel(r: number, length: number): CylinderGeometry {
  const g = new CylinderGeometry(r, r, length, 24, 1, true, 0, Math.PI);
  g.rotateZ(Math.PI / 2);
  g.rotateX(Math.PI / 2);
  return g;
}

function recycler(s: Sculpt, lights: Sculpt, extra: Group, kit: MaterialKit, d: 0 | 1): Group {
  s.cylinder(2.0, 2.1, 2.2, WHITE, { at: [0, 1.1, 0], sides: 36, rough: 0.45 });
  s.dome(2.0, PANEL, { at: [0, 2.2, 0], squash: 0.45 });
  s.torus(2.02, 0.08, SYSTEMS.water.color, { at: [0, 1.6, 0], rot: [Math.PI / 2, 0, 0], glow: 0.6 });
  for (const a of [0.6, 2.2, 3.8, 5.2]) lights.box(0.6, 0.6, 0.05, '#BDEBFF', { at: [Math.cos(a) * 2.03, 1.0, Math.sin(a) * 2.03], rot: [0, -a + Math.PI / 2, 0], radius: 0.1, glow: 0.9 });
  // Gota de agua luminosa
  lights.sphere(0.45, SYSTEMS.water.color, { at: [0, 3.5, 0], glow: 1.1 });
  lights.cone(0.42, 0.7, SYSTEMS.water.color, { at: [0, 4.05, 0], glow: 1.1 });
  // Tambor de filtrado giratorio
  const drum = new Group();
  const ds = new Sculpt(d);
  ds.cylinder(0.75, 0.75, 1.0, STEEL, { rot: [0, 0, Math.PI / 2], metal: 0.5, rough: 0.3, sides: 20 });
  for (let i = 0; i < 6; i++) ds.box(1.05, 0.08, 0.1, SYSTEMS.water.dark, { at: [0, Math.cos((i / 6) * Math.PI * 2) * 0.76, Math.sin((i / 6) * Math.PI * 2) * 0.76], rot: [(i / 6) * Math.PI * 2, 0, 0], radius: 0.02 });
  drum.add(ds.mesh(kit.paint, 'recycler:drum')!);
  drum.position.set(2.7, 0.9, 0.6);
  extra.add(drum);
  s.tube([[2.0, 1.4, 0.3], [2.4, 1.6, 0.5], [2.7, 1.4, 0.6]], 0.1, SYSTEMS.water.dark);
  return drum;
}

function reactor(s: Sculpt, lights: Sculpt): void {
  const teal = '#5BFFE0';
  s.cylinder(1.9, 2.0, 0.5, CONCRETE, { at: [0, 0.25, 0], sides: 8 });
  s.cylinder(1.5, 1.6, 2.6, WHITE, { at: [0, 1.8, 0], sides: 28, rough: 0.4 });
  s.dome(1.5, PANEL, { at: [0, 3.1, 0], squash: 0.4 });
  lights.cylinder(1.52, 1.52, 0.5, teal, { at: [0, 2.0, 0], sides: 28, glow: 1.4 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    s.box(0.12, 2.0, 0.7, STEEL, { at: [Math.cos(a) * 1.7, 1.7, Math.sin(a) * 1.7], rot: [0, -a, 0], radius: 0.03, metal: 0.45 });
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    s.box(0.5, 0.14, 0.12, i % 2 ? INK : '#FFC93C', { at: [Math.cos(a) * 1.95, 0.52, Math.sin(a) * 1.95], rot: [0, -a + Math.PI / 2, 0], radius: 0.02 });
  }
  s.cylinder(0.18, 0.18, 1.0, STEEL, { at: [0, 3.9, 0], metal: 0.5 });
  lights.sphere(0.18, teal, { at: [0, 4.45, 0], glow: 2 });
}

function antenna(s: Sculpt, lights: Sculpt, extra: Group, kit: MaterialKit, d: 0 | 1): Group {
  s.cylinder(1.4, 1.6, 0.4, CONCRETE, { at: [0, 0.2, 0], sides: 8 });
  s.cylinder(0.35, 0.6, 3.6, WHITE, { at: [0, 2.2, 0], sides: 16, rough: 0.45 });
  s.box(1.2, 0.8, 1.2, PANEL, { at: [0, 0.8, 0], radius: 0.18 });
  const dish = new Group();
  const ds = new Sculpt(d);
  ds.lathe(
    [
      [0.05, 0],
      [0.8, 0.12],
      [1.6, 0.48],
      [2.2, 0.95],
      [2.15, 1.0],
      [1.55, 0.55],
      [0.75, 0.2],
      [0.05, 0.08],
    ],
    WHITE,
    { rot: [Math.PI / 2, 0, 0], rough: 0.35 },
  );
  ds.cylinder(0.04, 0.04, 1.3, STEEL, { at: [0, 0, 0.65], rot: [Math.PI / 2, 0, 0], metal: 0.5 });
  ds.cylinder(0.12, 0.08, 0.3, DARK, { at: [0, 0, 1.35], rot: [Math.PI / 2, 0, 0] });
  dish.add(ds.mesh(kit.paint, 'antenna:dish')!);
  const tip = new Sculpt(d);
  tip.sphere(0.1, '#FF6B5B', { glow: 2 });
  const tipMesh = tip.mesh(kit.paint, 'antenna:tip', false)!;
  tipMesh.position.set(0, 0, 1.55);
  dish.add(tipMesh);
  dish.position.set(0, 4.1, 0);
  dish.rotation.x = -0.7;
  extra.add(dish);
  lights.box(0.8, 0.1, 0.04, SYSTEMS.energy.color, { at: [0, 1.0, 0.62], radius: 0.02, glow: 1.4 });
  return dish;
}

function module3d(s: Sculpt, lights: Sculpt, extra: Group, kit: MaterialKit, d: 0 | 1): Group {
  const regolith = '#D98A5F';
  const layers = d ? 11 : 5;
  for (let i = 0; i < layers; i++) {
    const t = i / layers;
    const r = 2.6 * Math.cos(t * Math.PI * 0.47);
    const y = 0.18 + t * 2.9;
    s.torus(Math.max(0.2, r), 0.17, shade(regolith, (i % 2) * 0.06), { at: [0, y, 0], rot: [Math.PI / 2, 0, 0], rough: 1 });
  }
  s.cylinder(2.5, 2.5, 0.2, shade(regolith, -0.1), { at: [0, 0.1, 0], sides: 32 });
  s.sphere(0.5, regolith, { at: [0, 3.05, 0], rough: 1 });
  s.box(1.1, 1.5, 1.0, shade(regolith, 0.05), { at: [0, 0.75, 2.3], radius: 0.4, rough: 1 });
  s.box(0.7, 1.15, 0.06, '#2E3C8F', { at: [0, 0.68, 2.8], radius: 0.16 });
  for (const a of [0.9, 2.2, -0.9, -2.2]) lights.disc(0.24, WARM_WINDOW, { at: [Math.sin(a) * 2.35, 1.4, Math.cos(a) * 2.35], rot: [Math.PI / 2, 0, -a], glow: 1.2 });
  // Pórtico de la impresora 3D
  const gantry = new Group();
  const g = new Sculpt(d);
  for (const x of [-0.9, 0.9]) g.cylinder(0.07, 0.07, 3.6, '#FFC93C', { at: [x, 1.8, 0], metal: 0.3 });
  g.box(2.0, 0.18, 0.18, '#FFC93C', { at: [0, 3.6, 0], radius: 0.04 });
  g.box(0.3, 0.4, 0.3, DARK, { at: [0, 3.3, 0], radius: 0.06 });
  g.cone(0.08, 0.25, STEEL, { at: [0, 2.98, 0], rot: [Math.PI, 0, 0] });
  gantry.add(g.mesh(kit.paint, 'module:gantry')!);
  gantry.position.set(-3.4, 0, -0.4);
  extra.add(gantry);
  return gantry;
}

/** Edificio desbloqueable de la colonia. */
export function buildBuilding(id: Exclude<BuildingId, 'city'>) {
  return (ctx: BuildContext): BuiltModel => {
    const kit = ctx.kit;
    const d = ctx.detail;
    const root = new Group();
    root.name = `building:${id}`;
    const s = new Sculpt(d);
    const lights = new Sculpt(d);
    const extra = new Group();
    pad(s, 4.2, CONCRETE, SYSTEMS[id === 'hydroponics' ? 'food' : id === 'recycler' ? 'water' : id === 'module' ? 'habitat' : 'energy'].color);
    let animated: Group | null = null;
    switch (id) {
      case 'hydroponics':
        hydroponics(s, lights, extra, kit, d);
        break;
      case 'recycler':
        animated = recycler(s, lights, extra, kit, d);
        break;
      case 'reactor':
        reactor(s, lights);
        break;
      case 'antenna':
        animated = antenna(s, lights, extra, kit, d);
        break;
      case 'module':
        animated = module3d(s, lights, extra, kit, d);
        break;
    }
    root.add(s.mesh(kit.paint, `building:${id}`)!);
    const lightMesh = lights.mesh(kit.paint, 'building:lights', false);
    if (lightMesh) root.add(lightMesh);
    root.add(extra);

    // Anillo de "recién construido"
    const ringSculpt = new Sculpt(d);
    ringSculpt.torus(4.6, 0.1, '#FFFFFF', { rot: [Math.PI / 2, 0, 0] });
    const ring = ringSculpt.mesh(kit.light('#FFF4C2', 0.9), 'building:new', false)!;
    ring.position.y = 0.2;
    ring.visible = false;
    root.add(ring);

    if (d) {
      const label = labelSprite(`${BUILDINGS[id].emoji} ${BUILDINGS[id].name}`, { height: 0.56 });
      label.position.set(0, 5.3, 0);
      root.add(label);
    }

    let fresh = 0;
    const applyState = (state: EntityState) => {
      if (state.fresh) fresh = 8;
    };
    const update = (_s: EntityState, uc: UpdateContext) => {
      const t = uc.time;
      if (animated) {
        if (id === 'antenna') {
          animated.rotation.y = Math.sin(t * 0.25) * 1.2;
          animated.rotation.x = -0.7 + Math.sin(t * 0.17) * 0.15;
        } else if (id === 'recycler') {
          animated.rotation.x += uc.dt * 1.4;
        } else if (id === 'module') {
          animated.position.x = -3.4 + Math.sin(t * 0.6) * 0.5;
        }
      }
      if (fresh > 0) {
        fresh -= uc.dt;
        ring.visible = true;
        const k = (t * 0.8) % 1;
        ring.scale.setScalar(0.6 + k * 0.6);
      } else ring.visible = false;
    };

    return {
      object: root,
      anchors: { door: new Vector3(0, 1.0, 3.6), label: new Vector3(0, 5.3, 0) },
      rig: { extra },
      update,
      applyState,
    };
  };
}

/* ------------------------------------------------------------------ */
/* Ciudad Don Rover                                                        */
/* ------------------------------------------------------------------ */

export function buildCityTower(ctx: BuildContext, params: Record<string, unknown>): BuiltModel {
  const kit = ctx.kit;
  const d = ctx.detail;
  const variant = Number(params.variant ?? 0);
  const h = 6.5 + (variant % 3) * 1.6;
  const color = [IX_PURPLE, '#3CC8FF', '#55DB7A', '#FFC93C'][variant % 4];
  const root = new Group();
  root.name = 'city-tower';
  const s = new Sculpt(d);
  const lights = new Sculpt(d);
  s.cylinder(1.5, 1.7, 0.6, CONCRETE, { at: [0, 0.0, 0], sides: 24 });
  s.cylinder(0.9, 1.25, h, WHITE, { at: [0, h / 2, 0], sides: 24, rough: 0.4 });
  const floors = Math.round(h / 0.9);
  for (let i = 1; i < floors; i++) {
    const y = i * 0.9;
    const r = 1.25 - (0.35 * y) / h;
    s.torus(r + 0.02, 0.05, color, { at: [0, y, 0], rot: [Math.PI / 2, 0, 0], glow: 0.4 });
    if (d) {
      for (let j = 0; j < 6; j++) {
        const a = (j / 6) * Math.PI * 2 + i * 0.4;
        lights.box(0.32, 0.36, 0.04, WARM_WINDOW, { at: [Math.cos(a) * (r + 0.01), y + 0.45, Math.sin(a) * (r + 0.01)], rot: [0, -a + Math.PI / 2, 0], radius: 0.05, glow: 1.2 });
      }
    }
  }
  s.cone(0.95, 1.6, color, { at: [0, h + 0.8, 0], rough: 0.4, glow: 0.2 });
  s.cylinder(0.04, 0.04, 1.2, STEEL, { at: [0, h + 2.1, 0], metal: 0.5 });
  lights.sphere(0.13, '#FF6B5B', { at: [0, h + 2.75, 0], glow: 2 });
  root.add(s.mesh(kit.paint, 'city:tower')!);
  const lm = lights.mesh(kit.paint, 'city:lights', false);
  if (lm) root.add(lm);
  return { object: root, anchors: { top: new Vector3(0, h + 2.7, 0), label: new Vector3(0, h + 3.2, 0) } };
}

/* ------------------------------------------------------------------ */
/* Hallazgos del terreno                                                */
/* ------------------------------------------------------------------ */

export function buildMeteorite(ctx: BuildContext): BuiltModel {
  const kit = ctx.kit;
  const d = ctx.detail;
  const root = new Group();
  const s = new Sculpt(d);
  const rnd = seeded(404);
  s.blob(1.35, PROPS.meteorite, { at: [0, 0.95, 0], scale: [1.2, 0.85, 1], metal: 0.65, rough: 0.35 }, 2);
  for (let i = 0; i < (d ? 14 : 4); i++) {
    const a = rnd() * Math.PI * 2;
    const el = rnd() * 1.1;
    s.sphere(0.12 + rnd() * 0.14, '#2A2440', { at: [Math.cos(a) * Math.cos(el) * 1.55, 0.95 + Math.sin(el) * 1.1, Math.sin(a) * Math.cos(el) * 1.3], scale: [1, 0.5, 1], metal: 0.5 });
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    s.blob(0.25 + rnd() * 0.2, PROPS.boulder, { at: [Math.cos(a) * 2.4, 0.1, Math.sin(a) * 2.4] });
  }
  s.cylinder(0.05, 0.05, 1.2, STEEL, { at: [2.3, 0.6, 1.2], metal: 0.4 });
  s.box(0.7, 0.45, 0.05, '#FFF8EC', { at: [2.3, 1.2, 1.22], radius: 0.05 });
  root.add(s.mesh(kit.paint, 'meteorite')!);
  return { object: root, anchors: { center: new Vector3(0, 1.0, 0), label: new Vector3(0, 3.0, 0) } };
}

export function buildBlueberries(ctx: BuildContext): BuiltModel {
  const kit = ctx.kit;
  const d = ctx.detail;
  const root = new Group();
  const s = new Sculpt(d);
  const rnd = seeded(2004);
  s.blob(1.1, PROPS.boulder, { at: [0, 0.4, 0], scale: [1.6, 0.6, 1.1] }, 1);
  s.blob(0.7, PROPS.boulderDark, { at: [1.3, 0.3, -0.6], scale: [1.2, 0.7, 1] }, 1);
  for (let i = 0; i < (d ? 70 : 16); i++) {
    const a = rnd() * Math.PI * 2;
    const r = 0.6 + rnd() * 2.6;
    s.sphere(0.06 + rnd() * 0.05, PROPS.hematite, { at: [Math.cos(a) * r, 0.06, Math.sin(a) * r], metal: 0.4, rough: 0.35 });
  }
  root.add(s.mesh(kit.paint, 'blueberries')!);
  return { object: root, anchors: { center: new Vector3(0, 0.6, 0), label: new Vector3(0, 2.4, 0) } };
}

export function buildIceCave(ctx: BuildContext): BuiltModel {
  const kit = ctx.kit;
  const d = ctx.detail;
  const root = new Group();
  const s = new Sculpt(d);
  const rnd = seeded(2008);
  // Arco de hielo
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI;
    const r = 0.55 + rnd() * 0.25;
    s.blob(r, i % 2 ? '#D6F4F8' : '#BCEBF5', { at: [Math.cos(a) * 2.0, Math.sin(a) * 2.0, 0], rough: 0.2 }, 1);
  }
  s.blob(2.4, '#E6F8FB', { at: [0, 0.3, -1.6], scale: [1.4, 0.9, 1], rough: 0.25 }, 2);
  // Carámbanos
  for (let i = 0; i < (d ? 9 : 3); i++) {
    const x = -1.4 + (i / 8) * 2.8;
    s.cone(0.09, 0.4 + rnd() * 0.4, '#E9FBFF', { at: [x, 1.55 - rnd() * 0.2, 0.15], rot: [Math.PI, 0, 0], rough: 0.15 });
  }
  const glow = new Sculpt(d);
  glow.disc(1.45, '#7FE7FF', { at: [0, 0.02, -0.05], glow: 1.5 });
  glow.sphere(0.9, '#9FF0FF', { at: [0, 0.8, -0.9], scale: [1.4, 1, 0.5], glow: 1.4 });
  root.add(s.mesh(kit.paint, 'icecave')!);
  root.add(glow.mesh(kit.paint, 'icecave:glow', false)!);
  return { object: root, anchors: { center: new Vector3(0, 1.0, 1.0), label: new Vector3(0, 3.6, 0) } };
}

/** Holograma de un descubrimiento (aparece cuando la clase lo encuentra). */
export function buildDiscovery(ctx: BuildContext, params: Record<string, unknown>): BuiltModel {
  const kit = ctx.kit;
  const d = ctx.detail;
  const root = new Group();
  const color = String(params.color ?? '#B69CFF');
  const base = new Sculpt(d);
  base.cylinder(0.7, 0.85, 0.25, PANEL, { at: [0, 0.12, 0], sides: 18 });
  base.torus(0.62, 0.05, color, { at: [0, 0.26, 0], rot: [Math.PI / 2, 0, 0], glow: 1.4 });
  root.add(base.mesh(kit.paint, 'discovery:base')!);
  const crystal = new Group();
  const c = new Sculpt(0);
  c.blob(0.36, color, { glow: 1.3, rough: 0.2 }, 0);
  crystal.add(c.mesh(kit.paint, 'discovery:crystal', false)!);
  crystal.position.y = 1.4;
  root.add(crystal);
  const beam = new Sculpt(d);
  beam.cylinder(0.5, 0.62, 1.2, '#FFFFFF', { at: [0, 0.85, 0], open: true, sides: 18 });
  root.add(beam.mesh(kit.light(color, 0.18), 'discovery:beam', false)!);
  if (d && params.label) {
    const label = labelSprite(String(params.label), { height: 0.4 });
    label.position.set(0, 2.25, 0);
    root.add(label);
  }
  const update = (_s: EntityState, uc: UpdateContext) => {
    crystal.rotation.y += uc.dt * 1.2;
    crystal.position.y = 1.4 + Math.sin(uc.time * 2) * 0.12;
  };
  return { object: root, anchors: { center: new Vector3(0, 1.2, 0), label: new Vector3(0, 2.25, 0) }, update };
}
