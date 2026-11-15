// Mundo de bloques del modo libre: guarda qué celdas están ocupadas, las dibuja con mallas
// instanciadas (una por tipo de bloque), responde a las preguntas de la física del jugador
// (¿hay suelo?, ¿hay pared?) y al rayo con el que se mina y se construye.
//
// Los depósitos naturales (basalto, hielo, hematita y cristal) se generan con una semilla
// fija: todos los jugadores ven el mismo planeta sin tener que enviarlo por la red. Solo
// viajan los cambios (bloques puestos o quitados), con marca de tiempo: gana el más reciente.

import {
  BoxGeometry,
  Color,
  DynamicDrawUsage,
  EdgesGeometry,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { PLANET_RADIUS } from '../core/config';
import { TAU, offsetOnSphere, seeded, tangentFrame } from '../core/math';
import { COLONY_FADE_ANGLE, HUB_DIR } from '../planet/features';
import { newSample, sampleTerrain, terrainRadius } from '../planet/heightfield';
import { BLOCK, LAYERS, R_BASE, bottomOf, cellCenter, cellMatrix, columnAt, columnDir, columnOf, keyAt, layerOf } from './grid';
import { BLOCKS, BLOCK_ORDER, blockTexture, isBlockId, type BlockId } from './types';

/** Cambio de una celda: [celda, bloque (0 = vacío), marca de tiempo]. */
export type BlockEdit = [number, number, number];

export interface BlockHit {
  kind: 'block' | 'ground';
  /** Celda tocada (o la celda del suelo). */
  key: number;
  /** Celda vacía donde se pondría un bloque nuevo. */
  placeKey: number | null;
  point: Vector3;
  /** Bloque tocado, o el material que da el suelo. */
  block: BlockId;
}

interface Bit {
  pos: Vector3;
  vel: Vector3;
  life: number;
}

const _p = new Vector3();
const _d = new Vector3();
const _e = new Vector3();
const _n = new Vector3();
const _m = new Matrix4();
const _color = new Color();
const sample = newSample();
const BITS = 72;

export class BlockWorld {
  readonly group = new Group();
  /** Celdas ocupadas → tipo de bloque. */
  private readonly cells = new Map<number, BlockId>();
  /** Bloques por columna (para descartar rápido las columnas vacías). */
  private readonly columns = new Map<number, number>();
  /** Cambios hechos por los jugadores (lo único que se guarda y se comparte). */
  private readonly edited = new Map<number, { b: number; ts: number }>();
  /** Celdas de los depósitos naturales (para la brújula del explorador). */
  private readonly natural = new Set<number>();
  private readonly matrices = new Map<number, Matrix4>();
  private readonly lifted = new Map<number, boolean>();
  private readonly meshes = new Map<BlockId, InstancedMesh>();
  private readonly materials = new Map<BlockId, MeshStandardMaterial>();
  private readonly box = new BoxGeometry(1, 1, 1);
  private readonly outline: LineSegments;
  private readonly fill: Mesh;
  private readonly bits: InstancedMesh;
  private readonly bitState: Bit[] = [];
  private bitNext = 0;
  private bitsAlive = 0;
  private dirty = true;
  /** Brillo de lámparas y cristales (sube de noche). */
  private glow = 1;

  /** Avisa de cada cambio local para guardarlo y mandarlo a los amigos. */
  onEdit: ((edit: BlockEdit) => void) | null = null;

  constructor() {
    this.group.name = 'world:blocks';
    for (const id of BLOCK_ORDER) {
      const def = BLOCKS[id];
      const map = blockTexture(id);
      this.materials.set(
        id,
        new MeshStandardMaterial({
          map,
          roughness: def.roughness,
          metalness: def.metalness,
          transparent: Boolean(def.transparent),
          depthWrite: !def.transparent,
          emissive: def.glow > 0 ? new Color(def.color) : new Color(0x000000),
          emissiveMap: def.glow > 0 ? map : null,
          emissiveIntensity: def.glow,
        }),
      );
    }
    const edges = new EdgesGeometry(this.box);
    this.outline = new LineSegments(edges, new LineBasicMaterial({ color: '#FFF8EC', transparent: true, opacity: 0.95, fog: false, toneMapped: false }));
    this.fill = new Mesh(this.box, new MeshBasicMaterial({ color: '#FFF8EC', transparent: true, opacity: 0.12, depthWrite: false, fog: false, toneMapped: false }));
    for (const o of [this.outline, this.fill]) {
      o.matrixAutoUpdate = false;
      o.visible = false;
      o.renderOrder = 6;
      o.frustumCulled = false;
      this.group.add(o);
    }
    this.bits = new InstancedMesh(new BoxGeometry(0.16, 0.16, 0.16), new MeshBasicMaterial({ toneMapped: false }), BITS);
    this.bits.instanceMatrix.setUsage(DynamicDrawUsage);
    this.bits.frustumCulled = false;
    this.bits.count = BITS;
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < BITS; i++) {
      this.bitState.push({ pos: new Vector3(), vel: new Vector3(), life: 0 });
      this.bits.setMatrixAt(i, _m);
      this.bits.setColorAt(i, _color.set('#ffffff'));
    }
    this.group.add(this.bits);
    this.generate();
  }

  /* ---------------- datos ---------------- */

  get(key: number): BlockId | 0 {
    return this.cells.get(key) ?? 0;
  }

  get size(): number {
    return this.cells.size;
  }

  private put(key: number, block: BlockId): void {
    if (!this.cells.has(key)) this.columns.set(columnOf(key), (this.columns.get(columnOf(key)) ?? 0) + 1);
    this.cells.set(key, block);
    this.dirty = true;
  }

  private del(key: number): void {
    if (!this.cells.delete(key)) return;
    const col = columnOf(key);
    const n = (this.columns.get(col) ?? 1) - 1;
    if (n <= 0) this.columns.delete(col);
    else this.columns.set(col, n);
    this.dirty = true;
  }

  /** Aplica un cambio si es más reciente que el que ya había en esa celda. */
  apply(key: number, block: number, ts: number): boolean {
    if (!Number.isInteger(key) || key < 0 || (block !== 0 && !isBlockId(block)) || !Number.isFinite(ts)) return false;
    const prev = this.edited.get(key);
    if (prev && prev.ts > ts) return false;
    if (prev && prev.ts === ts && prev.b === block) return false;
    this.edited.set(key, { b: block, ts });
    if (block) this.put(key, block as BlockId);
    else this.del(key);
    return true;
  }

  /** Cambio hecho en este dispositivo (se guarda y se comparte). */
  set(key: number, block: BlockId | 0): void {
    const ts = Date.now();
    if (this.apply(key, block, ts)) this.onEdit?.([key, block, ts]);
  }

  /** Todos los cambios (para guardar la partida o mandarla a un amigo que acaba de entrar). */
  edits(): BlockEdit[] {
    const out: BlockEdit[] = [];
    for (const [key, e] of this.edited) out.push([key, e.b, e.ts]);
    return out;
  }

  load(edits: readonly BlockEdit[]): void {
    for (const e of edits) if (Array.isArray(e)) this.apply(e[0], e[1], e[2]);
  }

  /* ---------------- depósitos naturales ---------------- */

  private generate(): void {
    const rnd = seeded(20260);
    const dir = new Vector3();
    const hubCos = Math.cos(COLONY_FADE_ANGLE + 0.04);
    const cluster = (d: Vector3, type: BlockId, size: number) => {
      tangentFrame(d, _e, _n);
      let east = 0;
      let north = 0;
      let up = 0;
      for (let n = 0; n < size; n++) {
        _p.copy(d).addScaledVector(_e, east / PLANET_RADIUS).addScaledVector(_n, north / PLANET_RADIUS).normalize();
        if (_p.dot(HUB_DIR) > hubCos) break;
        _p.multiplyScalar(terrainRadius(_p) + 0.45 + up);
        const key = keyAt(_p);
        this.natural.add(key);
        this.put(key, type);
        if (rnd() < 0.34 && up < 2) up += 1;
        else {
          up = 0;
          east += Math.round(rnd() * 2 - 1);
          north += Math.round(rnd() * 2 - 1);
        }
      }
    };
    for (let n = 0; n < 420; n++) {
      const y = rnd() * 2 - 1;
      const a = rnd() * TAU;
      const s = Math.sqrt(1 - y * y);
      dir.set(s * Math.cos(a), y, s * Math.sin(a));
      const r = rnd();
      const size = 2 + Math.floor(rnd() * 7);
      if (dir.dot(HUB_DIR) > hubCos) continue;
      sampleTerrain(dir.x, dir.y, dir.z, sample);
      const type: BlockId = sample.ice > 0.35 ? 3 : sample.basalt > 0.5 ? (r < 0.6 ? 2 : 4) : r < 0.36 ? 2 : r < 0.6 ? 4 : r < 0.82 ? 3 : 5;
      cluster(dir, type, size);
    }
    // Un anillo de depósitos justo fuera de la colonia: siempre hay algo que minar cerca.
    const ring: BlockId[] = [2, 3, 4, 5, 2, 4, 3];
    for (let n = 0; n < 42; n++) {
      const ang = (n / 42) * TAU + rnd() * 0.08;
      const dist = 55 + rnd() * 9;
      offsetOnSphere(HUB_DIR, Math.cos(ang) * dist, Math.sin(ang) * dist, PLANET_RADIUS, dir);
      cluster(dir.normalize(), ring[n % ring.length], 3 + Math.floor(rnd() * 5));
    }
  }

  /** Bloque de depósito natural (sin minar) más cercano a un punto; null si no queda ninguno. */
  nearestDeposit(from: Vector3, out: Vector3): BlockId | null {
    let best = Infinity;
    let found: BlockId | null = null;
    for (const key of this.natural) {
      const b = this.cells.get(key);
      if (!b) continue;
      const d = cellCenter(key, _p).distanceToSquared(from);
      if (d < best) {
        best = d;
        found = b;
        out.copy(_p);
      }
    }
    return found;
  }

  /* ---------------- física del jugador ---------------- */

  /**
   * Radio de la cara superior del bloque más alto de la columna de `p` que no supera
   * `maxTop` (0 si no hay ninguno).
   */
  top(p: Vector3, maxTop: number): number {
    const col = columnAt(p);
    if (!this.columns.has(col)) return 0;
    const base = col * LAYERS;
    const from = Math.min(LAYERS - 1, Math.floor(maxTop - R_BASE + 1e-4) - 1);
    const to = Math.max(0, from - 48);
    for (let l = from; l >= to; l--) if (this.cells.has(base + l)) return R_BASE + (l + 1) * BLOCK;
    return 0;
  }

  /** ¿Hay algún bloque en la columna de `p` entre los radios r0 y r1? */
  blocked(p: Vector3, r0: number, r1: number): boolean {
    const col = columnAt(p);
    if (!this.columns.has(col)) return false;
    const base = col * LAYERS;
    const from = Math.max(0, Math.floor(r0 - R_BASE));
    const to = Math.min(LAYERS - 1, Math.ceil(r1 - R_BASE) - 1);
    for (let l = from; l <= to; l++) if (this.cells.has(base + l)) return true;
    return false;
  }

  /* ---------------- rayo ---------------- */

  /** Material que da el suelo en un punto. */
  groundBlock(point: Vector3): BlockId {
    _d.copy(point).normalize();
    sampleTerrain(_d.x, _d.y, _d.z, sample);
    return sample.ice > 0.4 ? 3 : sample.basalt > 0.55 || sample.rock > 0.6 ? 2 : 1;
  }

  /** Primer bloque (o el suelo) que toca el rayo entre t0 y t1. */
  raycast(origin: Vector3, dir: Vector3, t0: number, t1: number): BlockHit | null {
    let last = -1;
    let empty: number | null = null;
    for (let t = t0; t <= t1; t += 0.07) {
      _p.copy(origin).addScaledVector(dir, t);
      const r = _p.length();
      const key = keyAt(_p);
      if (key !== last) {
        last = key;
        const b = this.cells.get(key);
        if (b) return { kind: 'block', key, placeKey: empty, point: _p.clone(), block: b };
      }
      _d.copy(_p).divideScalar(r);
      const ground = terrainRadius(_d);
      if (r < ground) {
        const place = keyAt(_d.multiplyScalar(ground + 0.45));
        return { kind: 'ground', key, placeKey: this.cells.has(place) ? null : place, point: _p.clone(), block: this.groundBlock(_p) };
      }
      empty = key;
    }
    return null;
  }

  /* ---------------- dibujo ---------------- */

  private matrixOf(key: number): Matrix4 {
    let m = this.matrices.get(key);
    if (!m) {
      m = cellMatrix(key, new Matrix4(), 1.004);
      this.matrices.set(key, m);
    }
    return m;
  }

  /** ¿La base del bloque queda por encima del terreno? (se le dibuja un cimiento debajo). */
  private floats(key: number): boolean {
    let v = this.lifted.get(key);
    if (v === undefined) {
      v = bottomOf(key) > terrainRadius(columnDir(columnOf(key), _d)) - 0.3;
      this.lifted.set(key, v);
    }
    return v;
  }

  private rebuild(): void {
    this.dirty = false;
    const lists = new Map<BlockId, number[]>();
    for (const [key, b] of this.cells) {
      let list = lists.get(b);
      if (!list) lists.set(b, (list = []));
      list.push(key);
      if (key % LAYERS > 0 && !this.cells.has(key - 1) && this.floats(key)) list.push(key - 1);
    }
    for (const id of BLOCK_ORDER) {
      const list = lists.get(id) ?? [];
      let mesh = this.meshes.get(id);
      if (!mesh || mesh.instanceMatrix.count < list.length) {
        if (mesh) {
          this.group.remove(mesh);
          mesh.dispose();
        }
        let cap = 64;
        while (cap < list.length) cap *= 2;
        mesh = new InstancedMesh(this.box, this.materials.get(id)!, cap);
        mesh.name = `blocks:${BLOCKS[id].key}`;
        mesh.frustumCulled = false;
        mesh.castShadow = !BLOCKS[id].transparent;
        mesh.receiveShadow = true;
        if (BLOCKS[id].transparent) mesh.renderOrder = 3;
        this.meshes.set(id, mesh);
        this.group.add(mesh);
      }
      for (let i = 0; i < list.length; i++) mesh.setMatrixAt(i, this.matrixOf(list[i]));
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** Resalta una celda (null la oculta). `progress` 0–1 es el avance del minado. */
  highlight(key: number | null, progress = 0, placing = false): void {
    const on = key !== null;
    this.outline.visible = on;
    this.fill.visible = on;
    if (!on) return;
    cellMatrix(key, this.outline.matrix, 1.02);
    this.fill.matrix.copy(this.outline.matrix);
    (this.outline.material as LineBasicMaterial).opacity = placing ? 0.55 : 0.95;
    (this.fill.material as MeshBasicMaterial).opacity = placing ? 0.1 : 0.1 + progress * 0.5;
  }

  /** Trocitos que saltan al minar o colocar un bloque. */
  burst(point: Vector3, block: BlockId, amount = 10): void {
    const up = _d.copy(point).normalize();
    tangentFrame(up, _e, _n);
    _color.set(BLOCKS[block].color);
    for (let i = 0; i < amount; i++) {
      const idx = this.bitNext;
      this.bitNext = (this.bitNext + 1) % BITS;
      const bit = this.bitState[idx];
      const a = Math.random() * TAU;
      const s = 0.6 + Math.random() * 1.6;
      bit.pos.copy(point).addScaledVector(_e, (Math.random() - 0.5) * 0.6).addScaledVector(_n, (Math.random() - 0.5) * 0.6);
      bit.vel.copy(up).multiplyScalar(1.4 + Math.random() * 1.8).addScaledVector(_e, Math.cos(a) * s).addScaledVector(_n, Math.sin(a) * s);
      bit.life = 0.5 + Math.random() * 0.35;
      this.bits.setColorAt(idx, _color.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.16));
    }
    if (this.bits.instanceColor) this.bits.instanceColor.needsUpdate = true;
    this.bitsAlive = BITS;
  }

  setGlow(glow: number): void {
    if (Math.abs(glow - this.glow) < 0.02) return;
    this.glow = glow;
    for (const id of BLOCK_ORDER) {
      const def = BLOCKS[id];
      if (def.glow > 0) this.materials.get(id)!.emissiveIntensity = def.glow * glow;
    }
  }

  update(dt: number): void {
    if (this.dirty) this.rebuild();
    if (this.bitsAlive <= 0) return;
    let alive = 0;
    for (let i = 0; i < BITS; i++) {
      const bit = this.bitState[i];
      if (bit.life <= 0) continue;
      bit.life -= dt;
      _d.copy(bit.pos).normalize();
      bit.vel.addScaledVector(_d, -3.72 * dt);
      bit.pos.addScaledVector(bit.vel, dt);
      const s = bit.life > 0 ? Math.min(1, bit.life * 3) : 0;
      _m.makeScale(s, s, s).setPosition(bit.pos);
      this.bits.setMatrixAt(i, _m);
      if (bit.life > 0) alive++;
    }
    this.bits.instanceMatrix.needsUpdate = true;
    this.bitsAlive = alive;
  }

  /** Centro de una celda (para efectos y distancias). */
  center(key: number, out = new Vector3()): Vector3 {
    return cellCenter(key, out);
  }

  /** Capa del terreno en una dirección (para saber si un bloque quedaría enterrado). */
  groundLayer(p: Vector3): number {
    return layerOf(terrainRadius(_d.copy(p).normalize()));
  }

  dispose(): void {
    for (const mesh of this.meshes.values()) mesh.dispose();
    for (const mat of this.materials.values()) {
      mat.map?.dispose();
      mat.dispose();
    }
    this.box.dispose();
    this.outline.geometry.dispose();
    (this.outline.material as LineBasicMaterial).dispose();
    (this.fill.material as MeshBasicMaterial).dispose();
    this.bits.geometry.dispose();
    (this.bits.material as MeshBasicMaterial).dispose();
    this.bits.dispose();
    this.group.removeFromParent();
  }
}
