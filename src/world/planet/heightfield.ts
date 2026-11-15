// Campo de alturas de Marte. Una sola función determinista responde, para cualquier dirección
// del planeta, qué altura tiene el terreno y qué material lo cubre. La usan por igual la malla
// (geometría y colores), la colocación de objetos y las colisiones de la cámara, de modo que
// todo lo que se apoya en el suelo coincide exactamente con lo que se ve.

import { Vector3 } from 'three';
import { PLANET_RADIUS } from '../core/config';
import { Noise3, lerp, smoothstep } from '../core/math';
import {
  CANYON,
  CANYON_BOUND,
  CANYON_SEGMENTS,
  COLONY_FADE_ANGLE,
  COLONY_FLAT_ANGLE,
  CRATERS,
  HUB_DIR,
  ICE_PATCHES,
  LAVA_TUBE,
  MESAS,
  PADS,
  VOLCANO,
} from './features';

export interface TerrainSample {
  /** Altura sobre el radio base del planeta (u). */
  h: number;
  /** Máscaras de material (0–1). */
  ice: number;
  basalt: number;
  dune: number;
  rock: number;
  /** Oclusión: fondos de cráter, cañón y caldera. */
  ao: number;
  /** Suelo nivelado de la colonia. */
  colony: number;
}

export const newSample = (): TerrainSample => ({ h: 0, ice: 0, basalt: 0, dune: 0, rock: 0, ao: 0, colony: 0 });

const noise = new Noise3(4217);

const HUB_COS_FADE = Math.cos(COLONY_FADE_ANGLE);
const V = VOLCANO.dir;
const V_COS = Math.cos(Math.min(1.5, VOLCANO.radius * 1.3));
const LT = LAVA_TUBE.dir;
const LT_COS = Math.cos(LAVA_TUBE.r * 1.8);

const MESA_COS = MESAS.map((m) => Math.cos(m.r * 1.25));
const ICE_COS = ICE_PATCHES.map((p) => Math.cos(p.r * 1.35));
const PAD_COS = PADS.map((p) => Math.cos(p.r * 1.1));
const ICE_LEVEL = new Float32Array(ICE_PATCHES.length);
const PAD_LEVEL = new Float32Array(PADS.length);
let levelsReady = false;

/**
 * Evalúa el terreno en la dirección unitaria (x, y, z).
 * No reserva memoria: escribe el resultado en `o` y lo devuelve.
 */
export function sampleTerrain(x: number, y: number, z: number, o: TerrainSample): TerrainSample {
  if (!levelsReady) prepareLevels();
  return evaluate(x, y, z, o, true);
}

function evaluate(x: number, y: number, z: number, o: TerrainSample, withLevels: boolean): TerrainSample {
  // ---- relieve amplio y regiones de material -------------------------------------------
  const n0 = noise.fbm(x * 1.3 + 11.3, y * 1.3 - 4.2, z * 1.3 + 7.7, 4);
  const n1 = noise.fbm(x * 3.3 - 2.1, y * 3.3 + 9.4, z * 3.3 + 1.3, 3);
  let h = n0 * 3.0 + n1 * 0.7;

  const b0 = noise.fbm(x * 1.05 + 31.7, y * 1.05 + 3.1, z * 1.05 - 12.9, 3);
  let basalt = smoothstep(0.08, 0.3, b0 + 0.2 * n1);
  h -= basalt * 0.45;

  const d0 = noise.fbm(x * 1.6 - 17.3, y * 1.6 + 22.1, z * 1.6 + 5.5, 3);
  let dune = smoothstep(0.1, 0.34, d0) * (1 - basalt);
  if (dune > 0.01) {
    const r = 1 - Math.abs(noise.noise(x * 15 + 3.1, y * 15, z * 15 - 8.2));
    h += dune * (r * r * 0.55 - 0.2);
  }

  let rock = 0;
  let ao = 0;

  // ---- casquetes polares ---------------------------------------------------------------
  const pn = noise.noise(x * 4.3 + 1.7, y * 4.3, z * 4.3 - 5.1) * 0.035;
  let ice = Math.max(smoothstep(0.905 + pn, 0.95 + pn, y), smoothstep(0.935 + pn, 0.972 + pn, -y));
  h += ice * 0.6;
  dune *= 1 - ice;
  basalt *= 1 - ice;

  // ---- Monte Olimpo --------------------------------------------------------------------
  const vd = x * V.x + y * V.y + z * V.z;
  if (vd > V_COS) {
    const t = Math.sqrt(Math.max(0, 2 - 2 * vd)) / VOLCANO.radius;
    if (t < 1.25) {
      const inside = smoothstep(1.22, 0.98, t);
      const s = Math.max(0, 1 - t);
      let vh = VOLCANO.height * Math.pow(s, 1.25) + 0.9 * smoothstep(1.02, 0.94, t);
      const flow = noise.noise(x * 8.5 + 2.2, y * 8.5 - 6.1, z * 8.5 + 9.4);
      vh += flow * 0.45 * s * (1 - s) * 4 * 0.5;
      const tc = t / VOLCANO.calderaFraction;
      if (tc < 1.7) {
        vh -= VOLCANO.calderaDepth * smoothstep(1.0, 0.6, tc);
        vh += 0.42 * Math.exp(-((tc - 1.08) * (tc - 1.08)) / 0.02);
        ao = Math.max(ao, smoothstep(1.0, 0.45, tc) * 0.6);
      }
      h = h * (1 - inside * 0.85) + vh;
      rock = Math.max(rock, inside * (0.3 + 0.45 * smoothstep(0.15, 0.95, t)));
      basalt = lerp(basalt, smoothstep(0.05, 0.4, flow) * 0.75 * smoothstep(0.08, 0.3, t), inside);
      dune *= 1 - inside;
    }
  }

  // ---- gran cañón ----------------------------------------------------------------------
  if (x * CANYON_BOUND.x + y * CANYON_BOUND.y + z * CANYON_BOUND.z > CANYON_BOUND.cos) {
    let best = 9;
    let cutV = 0;
    for (let i = 0; i < CANYON_SEGMENTS.length; i++) {
      const s = CANYON_SEGMENTS[i];
      let t = ((x - s.ax) * s.dx + (y - s.ay) * s.dy + (z - s.az) * s.dz) / s.len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = s.ax + s.dx * t;
      const qy = s.ay + s.dy * t;
      const qz = s.az + s.dz * t;
      const ql = 1 / Math.sqrt(qx * qx + qy * qy + qz * qz);
      const ex = x - qx * ql;
      const ey = y - qy * ql;
      const ez = z - qz * ql;
      const nt = Math.sqrt(ex * ex + ey * ey + ez * ez) / (s.w0 + (s.w1 - s.w0) * t);
      if (nt < best) best = nt;
      if (nt < 1.1) {
        const v = s.k * smoothstep(1.0, 0.3, nt);
        if (v > cutV) cutV = v;
      }
    }
    if (best < 1.7) {
      const wob = noise.noise(x * 21 + 4.4, y * 21, z * 21 - 3.3) * 0.1;
      const t = best + wob;
      // Paredes en terrazas: el corte baja por escalones como los estratos reales.
      const v = lerp(cutV, Math.round(cutV * 3) / 3, 0.6);
      h -= CANYON.depth * v;
      h += 0.3 * Math.exp(-((t - 1.12) * (t - 1.12)) / 0.03);
      rock = Math.max(rock, smoothstep(1.14, 0.96, t) * smoothstep(0.2, 0.42, t));
      ao = Math.max(ao, v * 0.5);
      const inner = smoothstep(1.3, 0.9, t);
      basalt *= 1 - inner * 0.8;
      dune *= 1 - inner;
    }
  }

  // ---- mesetas con capas ---------------------------------------------------------------
  for (let i = 0; i < MESAS.length; i++) {
    const m = MESAS[i];
    const dd = x * m.dir.x + y * m.dir.y + z * m.dir.z;
    if (dd < MESA_COS[i]) continue;
    const t = Math.sqrt(Math.max(0, 2 - 2 * dd)) / m.r + noise.noise(x * 17 + i * 5.3, y * 17, z * 17) * 0.09;
    const p = smoothstep(1.0, 0.7, t);
    h += m.height * p;
    rock = Math.max(rock, smoothstep(1.07, 0.99, t) * smoothstep(0.58, 0.7, t), p * 0.34);
    dune *= 1 - p;
    basalt *= 1 - p;
  }

  // ---- cráteres ------------------------------------------------------------------------
  for (let i = 0; i < CRATERS.length; i++) {
    const c = CRATERS[i];
    const dd = x * c.x + y * c.y + z * c.z;
    if (dd < c.cosLimit) continue;
    const t = Math.sqrt(Math.max(0, 2 - 2 * dd)) / c.r;
    if (t < 1) {
      const bowl = 1 - Math.pow(t, 2.6);
      h -= c.depth * bowl;
      if (c.peak) h += c.depth * 0.42 * Math.exp(-(t * t) / 0.02);
      ao = Math.max(ao, bowl * 0.55);
      if (c.ice) ice = Math.max(ice, smoothstep(0.68, 0.42, t));
      dune *= 1 - bowl * 0.7;
    }
    const rr = t - 1;
    h += c.rim * Math.exp(-(rr * rr) / (t < 1 ? 0.012 : 0.05));
    rock = Math.max(rock, Math.exp(-((t - 0.9) * (t - 0.9)) / 0.012) * 0.8);
  }

  // ---- claraboya del tubo de lava ------------------------------------------------------
  const ld = x * LT.x + y * LT.y + z * LT.z;
  if (ld > LT_COS) {
    const t = Math.sqrt(Math.max(0, 2 - 2 * ld)) / LAVA_TUBE.r;
    if (t < 1.7) {
      const pit = smoothstep(1.0, 0.55, t);
      h -= LAVA_TUBE.depth * pit;
      h += 0.35 * Math.exp(-((t - 1.1) * (t - 1.1)) / 0.03);
      rock = Math.max(rock, smoothstep(1.3, 1.0, t));
      ao = Math.max(ao, pit * 0.92);
      dune *= 1 - smoothstep(1.6, 1.0, t);
    }
  }

  if (withLevels) {
    // ---- placas de hielo: superficies planas de orilla difuminada ----------------------
    for (let i = 0; i < ICE_PATCHES.length; i++) {
      const p = ICE_PATCHES[i];
      const dd = x * p.dir.x + y * p.dir.y + z * p.dir.z;
      if (dd < ICE_COS[i]) continue;
      const t = Math.sqrt(Math.max(0, 2 - 2 * dd)) / p.r + noise.noise(x * 8 + i * 3.1, y * 8 - 2.2, z * 8) * 0.22;
      const m = smoothstep(1.0, 0.68, t);
      if (m <= 0) continue;
      h = lerp(h, ICE_LEVEL[i], m * 0.93);
      ice = Math.max(ice, m);
      dune *= 1 - m;
      basalt *= 1 - m;
      rock *= 1 - m;
      ao *= 1 - m;
    }
    // ---- explanadas --------------------------------------------------------------------
    for (let i = 0; i < PADS.length; i++) {
      const p = PADS[i];
      const dd = x * p.dir.x + y * p.dir.y + z * p.dir.z;
      if (dd < PAD_COS[i]) continue;
      const m = smoothstep(1.0, 0.5, Math.sqrt(Math.max(0, 2 - 2 * dd)) / p.r);
      h = lerp(h, PAD_LEVEL[i], m);
      dune *= 1 - m * 0.7;
    }
  }

  // ---- suelo nivelado de la colonia ----------------------------------------------------
  let colony = 0;
  const hd = x * HUB_DIR.x + y * HUB_DIR.y + z * HUB_DIR.z;
  if (hd > HUB_COS_FADE) {
    colony = smoothstep(COLONY_FADE_ANGLE, COLONY_FLAT_ANGLE, Math.acos(Math.min(1, hd)));
    h = lerp(h, 0.3 + n1 * 0.1, colony);
    const keep = 1 - colony;
    basalt *= keep;
    dune *= 1 - colony * 0.85;
    ice *= keep;
    rock *= keep;
    ao *= keep;
  }

  // ---- ondulación fina -----------------------------------------------------------------
  h += noise.noise(x * 26 + 0.5, y * 26 - 1.5, z * 26 + 2.5) * 0.09 * (1 - colony * 0.75) * (1 - ice * 0.8);

  o.h = h;
  o.ice = ice;
  o.basalt = basalt;
  o.dune = dune;
  o.rock = rock;
  o.ao = ao;
  o.colony = colony;
  return o;
}

function prepareLevels(): void {
  const s = newSample();
  ICE_PATCHES.forEach((p, i) => {
    ICE_LEVEL[i] = evaluate(p.dir.x, p.dir.y, p.dir.z, s, false).h - 0.35;
  });
  PADS.forEach((p, i) => {
    PAD_LEVEL[i] = evaluate(p.dir.x, p.dir.y, p.dir.z, s, false).h;
  });
  levelsReady = true;
}

const scratch = newSample();

/** Radio del terreno (desde el centro del planeta) en una dirección unitaria. */
export function terrainRadius(dir: Vector3): number {
  return PLANET_RADIUS + sampleTerrain(dir.x, dir.y, dir.z, scratch).h;
}

/** Punto del terreno, elevado `lift` unidades, en la dirección indicada. */
export function surfacePoint(dir: Vector3, lift = 0, out = new Vector3()): Vector3 {
  return out.copy(dir).multiplyScalar(terrainRadius(dir) + lift);
}
