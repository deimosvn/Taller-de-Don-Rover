// Utilidades matemáticas del mundo 3D: escalares, geometría sobre la esfera y ruido.
// El planeta vive en el origen; "dir" siempre es un vector unitario desde el centro.

import { Matrix4, Quaternion, Vector3 } from 'three';

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const saturate = (x: number) => clamp(x, 0, 1);

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Aproximación exponencial independiente del framerate (lambda ≈ rapidez por segundo). */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

/** Diferencia angular más corta en radianes (−π, π]. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/* ------------------------------------------------------------------ */
/* Geometría sobre la esfera                                            */
/* ------------------------------------------------------------------ */

const Y_AXIS = new Vector3(0, 1, 0);
const X_AXIS = new Vector3(1, 0, 0);
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _q = new Quaternion();

/** Latitud/longitud en grados → dirección unitaria. Longitud 0 mira a +Z y crece hacia +X (este). */
export function dirFromLatLon(latDeg: number, lonDeg: number, out = new Vector3()): Vector3 {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const c = Math.cos(lat);
  return out.set(c * Math.sin(lon), Math.sin(lat), c * Math.cos(lon));
}

export function latLonFromDir(dir: Vector3): { lat: number; lon: number } {
  return { lat: Math.asin(clamp(dir.y, -1, 1)) / DEG, lon: Math.atan2(dir.x, dir.z) / DEG };
}

/** Base tangente local (este, norte) para una dirección "arriba". Estable también en los polos. */
export function tangentFrame(up: Vector3, outEast: Vector3, outNorth: Vector3): void {
  outEast.crossVectors(Y_AXIS, up);
  if (outEast.lengthSq() < 1e-8) outEast.crossVectors(X_AXIS, up);
  outEast.normalize();
  outNorth.crossVectors(up, outEast).normalize();
}

/** Ángulo entre dos direcciones unitarias. */
export function angleBetween(a: Vector3, b: Vector3): number {
  return Math.acos(clamp(a.dot(b), -1, 1));
}

/** Interpolación esférica entre direcciones unitarias. */
export function slerpDir(a: Vector3, b: Vector3, t: number, out = new Vector3()): Vector3 {
  const ang = angleBetween(a, b);
  if (ang < 1e-5) return out.copy(a);
  const s = Math.sin(ang);
  const wa = Math.sin((1 - t) * ang) / s;
  const wb = Math.sin(t * ang) / s;
  return out.set(a.x * wa + b.x * wb, a.y * wa + b.y * wb, a.z * wa + b.z * wb).normalize();
}

/**
 * Avanza `angle` radianes desde `dir` siguiendo el círculo máximo que sale hacia `tangent`.
 * Devuelve la nueva dirección (y no modifica las entradas).
 */
export function travel(dir: Vector3, tangent: Vector3, angle: number, out = new Vector3()): Vector3 {
  _a.copy(tangent).addScaledVector(dir, -tangent.dot(dir));
  if (_a.lengthSq() < 1e-10) return out.copy(dir);
  _a.normalize();
  return out.copy(dir).multiplyScalar(Math.cos(angle)).addScaledVector(_a, Math.sin(angle)).normalize();
}

/**
 * Punto a (este, norte) unidades de distancia sobre la superficie medidas desde `origin`
 * (mapa exponencial): así se traduce el plano de la colonia a la esfera.
 */
export function offsetOnSphere(origin: Vector3, east: number, north: number, radius: number, out = new Vector3()): Vector3 {
  const d = Math.hypot(east, north);
  if (d < 1e-6) return out.copy(origin);
  tangentFrame(origin, _b, _c);
  _a.copy(_b).multiplyScalar(east / d).addScaledVector(_c, north / d);
  return travel(origin, _a, d / radius, out);
}

/**
 * Matriz de orientación para apoyar un objeto en la superficie: Y local = arriba,
 * Z local = frente. `heading` gira en sentido horario desde el norte (0 = mira al norte).
 */
export function surfaceBasis(up: Vector3, heading: number, out = new Matrix4()): Matrix4 {
  tangentFrame(up, _b, _c);
  const fwd = _a.copy(_c).multiplyScalar(Math.cos(heading)).addScaledVector(_b, Math.sin(heading)).normalize();
  const right = _b.crossVectors(up, fwd).normalize();
  return out.makeBasis(right, up, fwd);
}

/** Rumbo (rad, horario desde el norte) con el que desde `from` se mira hacia `to`. */
export function headingTo(from: Vector3, to: Vector3): number {
  tangentFrame(from, _b, _c);
  _a.copy(to).addScaledVector(from, -to.dot(from));
  return Math.atan2(_a.dot(_b), _a.dot(_c));
}

/** Rota `v` alrededor de `axis` (unitario). */
export function rotateAround(v: Vector3, axis: Vector3, angle: number): Vector3 {
  return v.applyQuaternion(_q.setFromAxisAngle(axis, angle));
}

/* ------------------------------------------------------------------ */
/* Ruido determinista                                                   */
/* ------------------------------------------------------------------ */

/** Generador pseudoaleatorio con semilla (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ruido de gradiente 3D (Perlin mejorado) con tabla de permutación sembrada. */
export class Noise3 {
  private readonly p = new Uint8Array(512);

  constructor(seed = 1337) {
    const rnd = seeded(seed);
    const base = new Uint8Array(256);
    for (let i = 0; i < 256; i++) base[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = base[i];
      base[i] = base[j];
      base[j] = t;
    }
    for (let i = 0; i < 512; i++) this.p[i] = base[i & 255];
  }

  /** Valor en aproximadamente [−1, 1]. */
  noise(x: number, y: number, z: number): number {
    const p = this.p;
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const fz = Math.floor(z);
    const X = fx & 255;
    const Y = fy & 255;
    const Z = fz & 255;
    x -= fx;
    y -= fy;
    z -= fz;
    const u = x * x * x * (x * (x * 6 - 15) + 10);
    const v = y * y * y * (y * (y * 6 - 15) + 10);
    const w = z * z * z * (z * (z * 6 - 15) + 10);
    const A = p[X] + Y;
    const AA = p[A] + Z;
    const AB = p[A + 1] + Z;
    const B = p[X + 1] + Y;
    const BA = p[B] + Z;
    const BB = p[B + 1] + Z;
    const g = grad;
    const x1 = lerp(g(p[AA], x, y, z), g(p[BA], x - 1, y, z), u);
    const x2 = lerp(g(p[AB], x, y - 1, z), g(p[BB], x - 1, y - 1, z), u);
    const x3 = lerp(g(p[AA + 1], x, y, z - 1), g(p[BA + 1], x - 1, y, z - 1), u);
    const x4 = lerp(g(p[AB + 1], x, y - 1, z - 1), g(p[BB + 1], x - 1, y - 1, z - 1), u);
    return lerp(lerp(x1, x2, v), lerp(x3, x4, v), w);
  }

  /** Ruido fractal (suma de octavas). Resultado ≈ [−1, 1]. */
  fbm(x: number, y: number, z: number, octaves = 4, lacunarity = 2.03, gain = 0.5): number {
    let amp = 0.5;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise(x, y, z);
      norm += amp;
      amp *= gain;
      x = x * lacunarity + 17.13;
      y = y * lacunarity - 9.71;
      z = z * lacunarity + 4.37;
    }
    return sum / norm;
  }
}

function grad(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}
