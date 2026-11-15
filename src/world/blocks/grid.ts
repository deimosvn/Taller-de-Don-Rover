// Rejilla de bloques sobre el planeta. Marte es una esfera, así que los bloques viven en una
// "esfera-cubo": seis caras de N × N columnas (con mapeo equiangular para que las celdas sean
// casi cuadradas) y capas radiales de 1 u. Cada celda se identifica con un solo número.
//
// El cubo está girado para que el centro de mando caiga en el centro de una cara: dentro y
// alrededor de la colonia las celdas son prácticamente cubos perfectos.

import { Matrix4, Quaternion, Vector3 } from 'three';
import { PLANET_RADIUS } from '../core/config';
import { HUB_DIR } from '../planet/features';

/** Columnas por lado de cada cara (≈ 1 u por celda en el centro de la cara). */
export const GRID_N = 90;
/** Altura de un bloque (u). */
export const BLOCK = 1;
/** Capas radiales disponibles. */
export const LAYERS = 128;
/** Radio de la base de la capa 0. */
export const R_BASE = PLANET_RADIUS - 24;

const HALF = Math.PI / 4;
const STEP = Math.PI / 2 / GRID_N;

const Q = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), HUB_DIR);
const QI = Q.clone().invert();

// Caras: normal, eje U y eje V (en el marco del cubo).
const FACES: [Vector3, Vector3, Vector3][] = [
  [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)],
  [new Vector3(-1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)],
  [new Vector3(0, 1, 0), new Vector3(1, 0, 0), new Vector3(0, 0, 1)],
  [new Vector3(0, -1, 0), new Vector3(1, 0, 0), new Vector3(0, 0, 1)],
  [new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(0, 1, 0)],
  [new Vector3(0, 0, -1), new Vector3(1, 0, 0), new Vector3(0, 1, 0)],
];

const _l = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _c = new Vector3();
const _t = new Vector3();

const clampInt = (v: number, max: number) => (v < 0 ? 0 : v > max ? max : v);

/** Cara y coordenadas (u, v) de un punto, en el marco del cubo. */
function faceOf(p: Vector3): { f: number; u: number; v: number } {
  _l.copy(p).applyQuaternion(QI);
  const ax = Math.abs(_l.x);
  const ay = Math.abs(_l.y);
  const az = Math.abs(_l.z);
  if (ax >= ay && ax >= az) return { f: _l.x > 0 ? 0 : 1, u: _l.y / ax, v: _l.z / ax };
  if (ay >= az) return { f: _l.y > 0 ? 2 : 3, u: _l.x / ay, v: _l.z / ay };
  return { f: _l.z > 0 ? 4 : 5, u: _l.x / az, v: _l.y / az };
}

/** Columna (cara, i, j) empaquetada de un punto del mundo. */
export function columnAt(p: Vector3): number {
  const { f, u, v } = faceOf(p);
  const i = clampInt(Math.floor((Math.atan(u) + HALF) / STEP), GRID_N - 1);
  const j = clampInt(Math.floor((Math.atan(v) + HALF) / STEP), GRID_N - 1);
  return (f * GRID_N + i) * GRID_N + j;
}

export const layerOf = (radius: number) => clampInt(Math.floor((radius - R_BASE) / BLOCK), LAYERS - 1);

/** Celda que contiene un punto del mundo. */
export function keyAt(p: Vector3): number {
  return columnAt(p) * LAYERS + layerOf(p.length());
}

export const columnOf = (key: number) => Math.floor(key / LAYERS);
export const layerOfKey = (key: number) => key % LAYERS;
/** Radio de la base de una celda. */
export const bottomOf = (key: number) => R_BASE + (key % LAYERS) * BLOCK;

/** Dirección unitaria (mundo) de un punto (a, b) de una cara. */
function faceDir(f: number, a: number, b: number, out: Vector3): Vector3 {
  const [n, U, V] = FACES[f];
  return out.copy(n).addScaledVector(U, Math.tan(a)).addScaledVector(V, Math.tan(b)).normalize().applyQuaternion(Q);
}

/** Dirección unitaria del centro de una columna. */
export function columnDir(column: number, out = new Vector3()): Vector3 {
  const j = column % GRID_N;
  const rest = Math.floor(column / GRID_N);
  const i = rest % GRID_N;
  const f = Math.floor(rest / GRID_N);
  return faceDir(f, -HALF + (i + 0.5) * STEP, -HALF + (j + 0.5) * STEP, out);
}

/** Centro de una celda en el mundo. */
export function cellCenter(key: number, out = new Vector3()): Vector3 {
  return columnDir(columnOf(key), out).multiplyScalar(bottomOf(key) + BLOCK / 2);
}

/**
 * Matriz que lleva un cubo unitario centrado en el origen a la celda. Las celdas no son
 * cubos exactos (la esfera-cubo las deforma un poco); la matriz usa los ejes reales de la
 * celda para que los bloques vecinos encajen sin huecos.
 */
export function cellMatrix(key: number, out = new Matrix4(), grow = 1): Matrix4 {
  const column = columnOf(key);
  const j = column % GRID_N;
  const rest = Math.floor(column / GRID_N);
  const i = rest % GRID_N;
  const f = Math.floor(rest / GRID_N);
  const a0 = -HALF + i * STEP;
  const b0 = -HALF + j * STEP;
  const rc = bottomOf(key) + BLOCK / 2;
  faceDir(f, a0 + STEP / 2, b0 + STEP / 2, _c);
  faceDir(f, a0 + STEP, b0 + STEP / 2, _x).sub(faceDir(f, a0, b0 + STEP / 2, _t)).multiplyScalar(rc * grow);
  faceDir(f, a0 + STEP / 2, b0 + STEP, _z).sub(faceDir(f, a0 + STEP / 2, b0, _t)).multiplyScalar(rc * grow);
  _y.copy(_c).multiplyScalar(BLOCK * grow);
  // Determinante positivo para que las caras no queden del revés.
  if (_t.crossVectors(_y, _z).dot(_x) < 0) out.makeBasis(_z, _y, _x);
  else out.makeBasis(_x, _y, _z);
  return out.setPosition(_c.multiplyScalar(rc));
}

/** Ejes de la rejilla (tangentes unitarias) en un punto: para deslizarse junto a las paredes. */
export function gridAxes(p: Vector3, outA: Vector3, outB: Vector3): void {
  const { f } = faceOf(p);
  const [, U, V] = FACES[f];
  _c.copy(p).normalize();
  outA.copy(U).applyQuaternion(Q);
  outA.addScaledVector(_c, -outA.dot(_c)).normalize();
  outB.copy(V).applyQuaternion(Q);
  outB.addScaledVector(_c, -outB.dot(_c)).normalize();
}
