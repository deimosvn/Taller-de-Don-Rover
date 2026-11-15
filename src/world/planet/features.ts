// Geografía de Marte: los rasgos naturales que dan relieve al planeta. Son datos puros
// (sin geometría); `heightfield.ts` los convierte en alturas y máscaras de material.
//
// Cada rasgo existe porque el contenido del juego lo menciona:
//   · Monte Olimpo ............ dato curioso del escáner ("el volcán más grande del sistema solar")
//   · Gran cañón .............. misión M-04 ("una señal… desde un cañón cercano")
//   · Casquetes polares ....... misión M-02 ("hielo en los polos y enterrado bajo el suelo")
//   · Hielo enterrado ......... misión M-02 ("el radar encontró hielo enterrado cerca de la colonia")
//   · Tubo de lava ............ misión M-05 y descubrimientos misteriosos
//   · Roca con capas, etc. .... descubrimientos misteriosos (MYSTERY_POOL)

import { Vector3 } from 'three';
import { COLONY, HUB_LATLON, PLANET_RADIUS } from '../core/config';
import { angleBetween, dirFromLatLon, seeded } from '../core/math';

export const HUB_DIR = dirFromLatLon(HUB_LATLON.lat, HUB_LATLON.lon);

/** Radios angulares de la colonia (radianes). */
export const COLONY_FLAT_ANGLE = COLONY.flatRadius / PLANET_RADIUS;
export const COLONY_FADE_ANGLE = COLONY.fadeRadius / PLANET_RADIUS;

/* ---------------- volcán ---------------- */

export const VOLCANO = {
  latlon: { lat: 24, lon: -118 },
  dir: dirFromLatLon(24, -118),
  /** Radio de la base (radianes ≈ cuerda). */
  radius: 0.33,
  /** Altura de la cima sobre el terreno (u). */
  height: 8.6,
  /** Caldera: fracción del radio y profundidad. */
  calderaFraction: 0.2,
  calderaDepth: 2.1,
};

/* ---------------- cañón ---------------- */

export interface CanyonNode {
  dir: Vector3;
  /** Semianchura en radianes. */
  w: number;
}

function path(points: [number, number, number][]): CanyonNode[] {
  return points.map(([lat, lon, w]) => ({ dir: dirFromLatLon(lat, lon), w }));
}

export const CANYON = {
  depth: 4.4,
  main: path([
    [-1, 56, 0.03],
    [-4, 68, 0.05],
    [-8, 80, 0.064],
    [-6, 92, 0.072],
    [-9, 104, 0.062],
    [-13, 116, 0.05],
    [-11, 128, 0.028],
  ]),
  branches: [
    path([
      [-8, 80, 0.034],
      [-16, 76, 0.026],
      [-22, 71, 0.014],
    ]),
    path([
      [-9, 104, 0.032],
      [-1, 108, 0.024],
      [5, 113, 0.013],
    ]),
  ],
  /** Centro aproximado, para enfocar la cámara. */
  center: dirFromLatLon(-6.5, 92),
};

/** Segmentos del cañón precalculados (A, B−A, anchuras) para medir distancias rápido. */
export interface CanyonSegment {
  ax: number;
  ay: number;
  az: number;
  dx: number;
  dy: number;
  dz: number;
  len2: number;
  w0: number;
  w1: number;
  /** Profundidad relativa (los ramales son menos profundos). */
  k: number;
}

function segments(nodes: CanyonNode[], k: number): CanyonSegment[] {
  const out: CanyonSegment[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i].dir;
    const b = nodes[i + 1].dir;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    out.push({ ax: a.x, ay: a.y, az: a.z, dx, dy, dz, len2: dx * dx + dy * dy + dz * dz, w0: nodes[i].w, w1: nodes[i + 1].w, k });
  }
  return out;
}

export const CANYON_SEGMENTS: CanyonSegment[] = [...segments(CANYON.main, 1), ...CANYON.branches.flatMap((b) => segments(b, 0.62))];

/** Esfera envolvente del cañón (para descartar pronto los puntos lejanos). */
export const CANYON_BOUND = (() => {
  const all = [...CANYON.main, ...CANYON.branches.flat()];
  const c = new Vector3();
  for (const n of all) c.add(n.dir);
  c.normalize();
  let minDot = 1;
  for (const n of all) minDot = Math.min(minDot, c.dot(n.dir));
  return { x: c.x, y: c.y, z: c.z, cos: Math.cos(Math.acos(minDot) + 0.16) };
})();

/* ---------------- mesetas con capas ---------------- */

export interface MesaDef {
  dir: Vector3;
  r: number;
  height: number;
}

export const MESAS: MesaDef[] = [
  { dir: dirFromLatLon(-24, 44), r: 0.075, height: 2.7 },
  { dir: dirFromLatLon(-28, 51), r: 0.046, height: 2.0 },
  { dir: dirFromLatLon(-20.5, 38.5), r: 0.036, height: 1.5 },
  { dir: dirFromLatLon(34, -168), r: 0.06, height: 2.2 },
];

/* ---------------- placas de hielo ---------------- */

export interface IcePatchDef {
  dir: Vector3;
  r: number;
}

export const ICE_PATCHES: IcePatchDef[] = [
  // Hielo enterrado cerca de la colonia (tres lóbulos que se funden en una mancha orgánica).
  { dir: dirFromLatLon(48, 44), r: 0.125 },
  { dir: dirFromLatLon(52.5, 31), r: 0.07 },
  { dir: dirFromLatLon(41.5, 53), r: 0.058 },
  // Otras placas en latitudes altas.
  { dir: dirFromLatLon(62, -38), r: 0.12 },
  { dir: dirFromLatLon(57, -52), r: 0.06 },
  { dir: dirFromLatLon(-57, 72), r: 0.11 },
  { dir: dirFromLatLon(-62, -150), r: 0.095 },
  { dir: dirFromLatLon(56, 152), r: 0.1 },
  { dir: dirFromLatLon(-50, -20), r: 0.07 },
];

/* ---------------- pozos y explanadas ---------------- */

/** Claraboya del tubo de lava: un pozo estrecho y profundo al pie del volcán. */
export const LAVA_TUBE = { dir: dirFromLatLon(6, -93), r: 0.04, depth: 3.4 };

/** Zonas pequeñas que se nivelan para apoyar objetos o marcar un lugar. */
export interface PadDef {
  id: string;
  dir: Vector3;
  r: number;
}

export const PADS: PadDef[] = [
  { id: 'meteorite', dir: dirFromLatLon(40, -42), r: 0.05 },
  { id: 'blueberries', dir: dirFromLatLon(-30, -18), r: 0.085 },
  { id: 'icecave', dir: dirFromLatLon(55, 60), r: 0.05 },
];

/* ---------------- cráteres ---------------- */

export interface CraterDef {
  x: number;
  y: number;
  z: number;
  /** Radio (radianes ≈ cuerda). */
  r: number;
  depth: number;
  rim: number;
  peak: boolean;
  ice: boolean;
  /** Coseno a partir del cual el punto está lo bastante cerca para evaluarlo. */
  cosLimit: number;
}

function crater(dir: Vector3, r: number, opts: Partial<Pick<CraterDef, 'peak' | 'ice' | 'depth'>> = {}): CraterDef {
  const depth = opts.depth ?? r * PLANET_RADIUS * (0.2 + 0.08 * Math.min(1, r / 0.12));
  return { x: dir.x, y: dir.y, z: dir.z, r, depth, rim: depth * 0.34, peak: opts.peak ?? r > 0.13, ice: opts.ice ?? false, cosLimit: Math.cos(Math.min(1.5, r * 1.75)) };
}

function distToCanyon(d: Vector3): number {
  let best = 9;
  for (const s of CANYON_SEGMENTS) {
    const t = Math.max(0, Math.min(1, ((d.x - s.ax) * s.dx + (d.y - s.ay) * s.dy + (d.z - s.az) * s.dz) / s.len2));
    const qx = s.ax + s.dx * t;
    const qy = s.ay + s.dy * t;
    const qz = s.az + s.dz * t;
    best = Math.min(best, Math.hypot(d.x - qx, d.y - qy, d.z - qz));
  }
  return best;
}

export const CRATERS: CraterDef[] = (() => {
  const list: CraterDef[] = [
    // Cráteres con nombre propio dentro del mundo (puntos de interés).
    crater(dirFromLatLon(-47, -108), 0.2, { peak: true }),
    crater(dirFromLatLon(60, -112), 0.13, { ice: true, peak: false }),
    crater(dirFromLatLon(-34, 172), 0.15, { peak: true }),
    crater(dirFromLatLon(8, 158), 0.11),
  ];
  const rnd = seeded(20260114);
  const keepOut: { dir: Vector3; r: number }[] = [
    { dir: HUB_DIR, r: COLONY_FADE_ANGLE + 0.03 },
    { dir: VOLCANO.dir, r: VOLCANO.radius + 0.05 },
    { dir: LAVA_TUBE.dir, r: 0.1 },
    ...MESAS.map((m) => ({ dir: m.dir, r: m.r + 0.03 })),
    ...ICE_PATCHES.map((p) => ({ dir: p.dir, r: p.r * 0.8 })),
    ...PADS.map((p) => ({ dir: p.dir, r: p.r + 0.03 })),
  ];
  const d = new Vector3();
  const prev = new Vector3();
  let tries = 0;
  while (list.length < 78 && tries++ < 4000) {
    // Dirección uniforme sobre la esfera.
    const u = rnd() * 2 - 1;
    const a = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    d.set(s * Math.cos(a), u, s * Math.sin(a));
    const k = rnd();
    const r = k < 0.62 ? 0.03 + rnd() * 0.03 : k < 0.93 ? 0.06 + rnd() * 0.045 : 0.11 + rnd() * 0.05;
    if (Math.abs(d.y) > 0.95) continue;
    if (keepOut.some((z) => angleBetween(d, z.dir) < z.r + r)) continue;
    if (distToCanyon(d) < 0.12 + r) continue;
    if (list.some((c) => angleBetween(d, prev.set(c.x, c.y, c.z)) < (c.r + r) * 0.92)) continue;
    list.push(crater(d, r, { ice: Math.abs(d.y) > 0.8 && rnd() < 0.6 }));
  }
  return list;
})();
