// Base del modo libre: puntos de recursos repartidos por Marte y módulos de la colonia que los
// jugadores construyen con ellos. El motor solo coloca y muestra; el inventario lo lleva la
// interfaz (FreePlay) a través de `OutpostHost`.
//
// Los módulos se guardan como cambios con marca de tiempo (`ModuleEdit`): el más reciente gana,
// así que da igual en qué orden lleguen por la red o si llegan dos veces.

import { Group, Matrix4, Mesh, MeshBasicMaterial, TorusGeometry, Vector3, type Object3D } from 'three';
import { PLANET_RADIUS } from '../core/config';
import { TAU, offsetOnSphere, seeded, surfaceBasis } from '../core/math';
import type { EntityManager } from '../entities/EntityManager';
import type { MaterialKit } from '../models/sculpt';
import { COLONY_FADE_ANGLE, HUB_DIR } from '../planet/features';
import { newSample, sampleTerrain, terrainRadius } from '../planet/heightfield';
import { colonyPoint } from '../planet/layout';
import { MODULES, RESOURCES, type ModuleEdit, type ModuleKind, type ResourceId } from './types';

/** Por qué no se puede construir donde apunta el jugador. */
export type PlaceProblem = 'blocked' | 'cost' | null;

export interface PlacingState {
  kind: ModuleKind;
  valid: boolean;
  problem: PlaceProblem;
}

export interface OutpostHost {
  /** ¿Alcanzan los recursos para este módulo? */
  afford(kind: ModuleKind): boolean;
  /** Se construyó un módulo en este dispositivo: descontar los recursos. */
  built(kind: ModuleKind): void;
  /** Cambió la vista previa de construcción (null = ya no se construye). */
  placing(state: PlacingState | null): void;
}

/** Lo mínimo que el motor sabe del astronauta para colocar la vista previa. */
export interface OutpostPlayer {
  feet: Vector3;
  dir: Vector3;
  face: Vector3;
  heading: number;
}

const NODE_PREFIX = 'res:';
const MODULE_PREFIX = 'mod:';
/** Recolecciones que aguanta un punto antes de agotarse. */
const CHARGES = 3;
/** Segundos que tarda en volver a crecer. */
const REGROW = 50;

interface Node {
  uid: string;
  res: ResourceId;
  left: number;
  regrowAt: number;
}

interface Ghost {
  kind: ModuleKind;
  root: Group;
  ring: Mesh;
  turn: number;
  dir: Vector3;
  heading: number;
  valid: boolean;
  problem: PlaceProblem;
  key: string;
}

const _p = new Vector3();
const _v = new Vector3();
const _m = new Matrix4();
const sample = newSample();

export class Outpost {
  /** Se construyó o desmontó algo en este dispositivo (para guardarlo y mandarlo a los amigos). */
  onEdit: ((edit: ModuleEdit) => void) | null = null;
  private readonly nodes = new Map<string, Node>();
  private readonly modules = new Map<string, ModuleEdit>();
  private ghost: Ghost | null = null;
  private readonly okMat = new MeshBasicMaterial({ color: '#7CF29C', transparent: true, opacity: 0.42, depthWrite: false, toneMapped: false });
  private readonly badMat = new MeshBasicMaterial({ color: '#FF6B5B', transparent: true, opacity: 0.42, depthWrite: false, toneMapped: false });
  private time = 0;

  constructor(
    private readonly entities: EntityManager,
    private readonly parent: Object3D,
    private readonly kit: MaterialKit,
    private readonly host: OutpostHost,
  ) {
    this.spawnNodes();
  }

  /* ---------------- recursos ---------------- */

  private spawnNodes(): void {
    const rnd = seeded(73019);
    const dir = new Vector3();
    const hubCos = Math.cos(COLONY_FADE_ANGLE + 0.02);
    let n = 0;
    const add = (d: Vector3, res: ResourceId) => {
      const uid = `${NODE_PREFIX}${n++}`;
      this.entities.spawn(`resource.${res}`, uid, { dir: d.clone(), heading: rnd() * TAU, lift: 0 }, { seed: n * 13 + 1 }, { amount: 1 });
      this.nodes.set(uid, { uid, res, left: CHARGES, regrowAt: 0 });
    };
    // Cerca de la plaza: unos cuantos entre los edificios para empezar sin caminar mucho.
    const near: [number, number, ResourceId][] = [
      [44, 12, 'regolith'],
      [46, 64, 'metal'],
      [45, 116, 'ice'],
      [44, 168, 'regolith'],
      [46, -12, 'ice'],
      [45, -168, 'metal'],
    ];
    for (const [r, a, res] of near) {
      const { east, north } = colonyPoint(r, a);
      offsetOnSphere(HUB_DIR, east, north, PLANET_RADIUS, dir);
      add(dir.normalize(), res);
    }
    // Un anillo justo fuera de la colonia.
    const ring: ResourceId[] = ['regolith', 'metal', 'ice'];
    for (let i = 0; i < 18; i++) {
      const ang = (i / 18) * TAU + rnd() * 0.1;
      const dist = 58 + rnd() * 10;
      offsetOnSphere(HUB_DIR, Math.cos(ang) * dist, Math.sin(ang) * dist, PLANET_RADIUS, dir);
      add(dir.normalize(), ring[i % 3]);
    }
    // El resto del planeta: lo que hay depende del terreno (hielo en las zonas heladas,
    // hematita en las rocas oscuras, regolito en todas partes).
    for (let i = 0; i < 160 && n < 90; i++) {
      const y = rnd() * 2 - 1;
      const a = rnd() * TAU;
      const s = Math.sqrt(1 - y * y);
      dir.set(s * Math.cos(a), y, s * Math.sin(a));
      if (dir.dot(HUB_DIR) > hubCos) continue;
      sampleTerrain(dir.x, dir.y, dir.z, sample);
      const r = rnd();
      const res: ResourceId = sample.ice > 0.35 ? 'ice' : sample.basalt > 0.5 ? (r < 0.6 ? 'metal' : 'regolith') : r < 0.45 ? 'regolith' : r < 0.72 ? 'metal' : 'ice';
      add(dir, res);
    }
  }

  /** Recolecta en un punto: devuelve qué y cuánto, o null si está agotado. */
  collect(uid: string): { res: ResourceId; amount: number } | null {
    const node = this.nodes.get(uid);
    if (!node || node.left <= 0) return null;
    node.left -= 1;
    const e = this.entities.get(uid);
    e?.setState({ amount: node.left / CHARGES });
    if (node.left <= 0) {
      node.regrowAt = this.time + REGROW;
      if (e) e.interactions.forEach((i) => (i.enabled = false));
    }
    return { res: node.res, amount: RESOURCES[node.res].yield };
  }

  /** Punto de recursos con algo que recolectar más cercano (de un tipo, si se pide). */
  nearest(from: Vector3, out: Vector3, only?: ResourceId | null): ResourceId | null {
    let best = Infinity;
    let found: ResourceId | null = null;
    for (const node of this.nodes.values()) {
      if (node.left <= 0 || (only && node.res !== only)) continue;
      const e = this.entities.get(node.uid);
      if (!e) continue;
      const d = e.root.position.distanceToSquared(from);
      if (d < best) {
        best = d;
        found = node.res;
        out.copy(e.root.position);
      }
    }
    return found;
  }

  /* ---------------- módulos ---------------- */

  /** Aplica cambios (guardados o de un amigo). Gana el más reciente de cada módulo. */
  apply(edits: readonly ModuleEdit[]): void {
    for (const e of edits) {
      const prev = this.modules.get(e.id);
      if (prev && (prev.ts > e.ts || (prev.ts === e.ts && (prev.k ?? '') >= (e.k ?? '')))) continue;
      this.modules.set(e.id, e);
      const uid = MODULE_PREFIX + e.id;
      if (!e.k) {
        this.entities.remove(uid);
        continue;
      }
      const m = MODULES[e.k];
      _p.set(e.d[0], e.d[1], e.d[2]).normalize();
      this.entities.spawn(`module.${e.k}`, uid, { dir: _p.clone(), heading: e.h, lift: 0, scale: m.scale });
    }
    if (this.ghost) this.ghost.key = '';
  }

  /** Todos los cambios, también los desmontados (para guardar o mandar a quien llega). */
  edits(): ModuleEdit[] {
    return [...this.modules.values()];
  }

  /** Módulos en pie. */
  kinds(): ModuleKind[] {
    const out: ModuleKind[] = [];
    for (const m of this.modules.values()) if (m.k) out.push(m.k);
    return out;
  }

  /** Módulo a partir del uid de su entidad. */
  moduleAt(uid: string): ModuleEdit | null {
    if (!uid.startsWith(MODULE_PREFIX)) return null;
    const m = this.modules.get(uid.slice(MODULE_PREFIX.length));
    return m?.k ? m : null;
  }

  /** Desmonta un módulo. */
  dismantle(id: string): void {
    const m = this.modules.get(id);
    if (!m?.k) return;
    const edit: ModuleEdit = { ...m, k: null, ts: Math.max(Date.now(), m.ts + 1) };
    this.apply([edit]);
    this.onEdit?.(edit);
  }

  /* ---------------- construir ---------------- */

  get placing(): ModuleKind | null {
    return this.ghost?.kind ?? null;
  }

  startPlacing(kind: ModuleKind): void {
    this.cancel();
    const def = this.entities.definition(`module.${kind}`);
    if (!def) return;
    const m = MODULES[kind];
    const root = new Group();
    root.name = 'outpost:ghost';
    const model = def.build({ kit: this.kit, detail: 1 }, {});
    const holder = new Group();
    holder.add(model.object);
    holder.scale.setScalar(m.scale);
    holder.position.y = 0.15;
    root.add(holder);
    const ring = new Mesh(new TorusGeometry(m.radius * m.scale, 0.08, 6, 48), this.okMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.2;
    root.add(ring);
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh && mesh !== ring) {
        mesh.material = this.okMat;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    });
    root.visible = false;
    this.parent.add(root);
    this.ghost = { kind, root, ring, turn: 0, dir: new Vector3(), heading: 0, valid: false, problem: null, key: '' };
  }

  /** Gira la vista previa un cuarto de vuelta. */
  rotate(): void {
    if (this.ghost) this.ghost.turn = (this.ghost.turn + Math.PI / 2) % TAU;
  }

  cancel(): void {
    const g = this.ghost;
    if (!g) return;
    this.ghost = null;
    this.parent.remove(g.root);
    g.root.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    this.host.placing(null);
  }

  /** Construye donde está la vista previa. Devuelve si se pudo. */
  confirm(): boolean {
    const g = this.ghost;
    if (!g || !g.root.visible) return false;
    if (!g.valid) {
      this.host.placing({ kind: g.kind, valid: false, problem: g.problem });
      return false;
    }
    const edit: ModuleEdit = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      k: g.kind,
      d: [round(g.dir.x), round(g.dir.y), round(g.dir.z)],
      h: Math.round(g.heading * 1000) / 1000,
      ts: Date.now(),
    };
    this.host.built(g.kind);
    this.apply([edit]);
    this.onEdit?.(edit);
    // Se puede seguir construyendo otro igual si alcanza; si no, se sale del modo.
    if (!this.host.afford(g.kind)) this.cancel();
    else g.key = '';
    return true;
  }

  /* ---------------- cuadro a cuadro ---------------- */

  update(dt: number, player: OutpostPlayer | null): void {
    this.time += dt;
    for (const node of this.nodes.values()) {
      if (node.left > 0 || this.time < node.regrowAt) continue;
      node.left = CHARGES;
      const e = this.entities.get(node.uid);
      if (e) {
        e.setState({ amount: 1 });
        e.interactions.forEach((i) => (i.enabled = true));
      }
    }
    const g = this.ghost;
    if (!g) return;
    if (!player) {
      g.root.visible = false;
      return;
    }
    const m = MODULES[g.kind];
    const r = m.radius * m.scale;
    // Frente al astronauta, a una distancia que no lo encierre.
    _p.copy(player.feet).addScaledVector(player.face, r + 1.6);
    g.dir.copy(_p).normalize();
    g.heading = player.heading + Math.PI + g.turn;
    const pos = _v.copy(g.dir).multiplyScalar(terrainRadius(g.dir));
    g.root.position.copy(pos);
    g.root.quaternion.setFromRotationMatrix(surfaceBasis(g.dir, g.heading, _m));
    g.root.visible = true;

    // ¿Choca con algo? Se compara en horizontal con los colisionadores del mundo.
    let blocked = false;
    for (const c of this.entities.colliders()) {
      _p.set(c.x - pos.x, c.y - pos.y, c.z - pos.z);
      _p.addScaledVector(g.dir, -_p.dot(g.dir));
      if (_p.length() < r * 0.92 + c.r * 0.85) {
        blocked = true;
        break;
      }
    }
    const afford = this.host.afford(g.kind);
    g.valid = !blocked && afford;
    g.problem = blocked ? 'blocked' : afford ? null : 'cost';
    const mat = g.valid ? this.okMat : this.badMat;
    if (g.ring.material !== mat) {
      g.root.traverse((o) => {
        const mesh = o as Mesh;
        if (mesh.isMesh) mesh.material = mat;
      });
    }
    g.ring.scale.setScalar(1 + Math.sin(this.time * 5) * 0.03);
    const key = `${g.kind}|${g.valid}|${g.problem}`;
    if (key !== g.key) {
      g.key = key;
      this.host.placing({ kind: g.kind, valid: g.valid, problem: g.problem });
    }
  }

  dispose(): void {
    this.cancel();
    this.entities.removePrefix(NODE_PREFIX);
    this.entities.removePrefix(MODULE_PREFIX);
    this.nodes.clear();
    this.modules.clear();
    this.okMat.dispose();
    this.badMat.dispose();
  }
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;
