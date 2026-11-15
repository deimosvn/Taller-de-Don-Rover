// Registro vivo de las entidades colocadas en el planeta. Cada instancia tiene un
// identificador único (`uid`) con el que la interfaz, la cámara y las futuras misiones
// pueden encontrarla, enfocarla, moverla, cambiar su estado o consultar sus anclajes.

import { Group, LOD, Matrix4, Ray, Sphere, Vector3 } from 'three';
import type { RigCollider, RigTarget } from '../camera/CameraRig';
import { surfaceBasis } from '../core/math';
import { terrainRadius } from '../planet/heightfield';
import type { MaterialKit } from '../models/sculpt';
import type { BuiltModel, EntityDef, EntityInfo, EntityKind, EntityState, InteractionDef, Placement, UpdateContext } from './types';

const _m = new Matrix4();
const _v = new Vector3();
const _sphere = new Sphere();

export class Entity {
  /** Nodo raíz apoyado sobre el planeta. Su nombre es el `uid`. */
  readonly root = new Group();
  readonly dir = new Vector3();
  heading = 0;
  lift = 0;
  state: EntityState;
  /** Interacciones propias de la instancia (copia editable de las de la definición). */
  readonly interactions: InteractionDef[];
  readonly colliders: RigCollider[] = [];
  /** Modelo completo y, si la definición lo pide, su versión ligera. */
  readonly model: BuiltModel;
  readonly low: BuiltModel | null = null;
  private readonly lod: LOD | null = null;
  /** Radio y altura del volumen con el que se selecciona con el puntero. */
  readonly pickRadius: number;
  readonly pickHeight: number;

  constructor(
    readonly uid: string,
    readonly def: EntityDef,
    kit: MaterialKit,
    placement: Placement,
    readonly params: Record<string, unknown>,
    state?: EntityState,
  ) {
    this.root.name = uid;
    this.root.userData.uid = uid;
    this.root.userData.defId = def.id;
    this.state = { ...def.initialState, ...state };
    this.interactions = def.interactions.map((i) => ({ ...i }));
    this.model = def.build({ kit, detail: 1 }, params);
    this.model.object.name = `${uid}:model`;
    if (def.lodDistance > 0) {
      this.low = def.build({ kit, detail: 0 }, params);
      this.low.object.name = `${uid}:model-lod`;
      this.lod = new LOD();
      this.lod.name = `${uid}:lod`;
      this.lod.addLevel(this.model.object, 0);
      this.lod.addLevel(this.low.object, def.lodDistance);
      this.root.add(this.lod);
    } else {
      this.root.add(this.model.object);
    }
    const c = def.collider;
    this.pickRadius = Math.max(0.85, c ? c.radius * 1.05 : def.focus.distance * 0.2);
    this.pickHeight = c ? Math.max(c.radius * 0.7, c.height * 0.5) : def.focus.lift;
    this.place(placement);
    this.model.applyState?.(this.state);
    this.low?.applyState?.(this.state);
  }

  /** Coloca (o recoloca) la entidad sobre el terreno. */
  place(p: Placement): void {
    this.dir.copy(p.dir).normalize();
    this.heading = p.heading;
    this.lift = p.lift ?? this.lift;
    const r = terrainRadius(this.dir) + this.lift;
    this.root.position.copy(this.dir).multiplyScalar(r);
    this.root.quaternion.setFromRotationMatrix(surfaceBasis(this.dir, this.heading, _m));
    if (p.scale !== undefined) this.root.scale.setScalar(p.scale);
    this.root.updateMatrixWorld(true);
    this.rebuildColliders();
  }

  private rebuildColliders(): void {
    this.colliders.length = 0;
    const c = this.def.collider;
    if (!c) return;
    const s = this.root.scale.x;
    const r = c.radius * s;
    const h = Math.max(r, c.height * s);
    const n = Math.max(1, Math.ceil((h - r) / (r * 1.1)) + (h > r ? 1 : 0));
    for (let i = 0; i < n; i++) {
      const y = n === 1 ? Math.min(r * 0.6, h * 0.5) : r * 0.6 + ((h - r * 1.2) * i) / (n - 1);
      _v.copy(this.dir).multiplyScalar(y).add(this.root.position);
      this.colliders.push({ uid: this.uid, x: _v.x, y: _v.y, z: _v.z, r });
    }
  }

  setState(patch: EntityState): void {
    let changed = false;
    for (const k of Object.keys(patch)) {
      if (this.state[k] !== patch[k]) {
        this.state[k] = patch[k];
        changed = true;
      }
    }
    if (!changed) return;
    this.model.applyState?.(this.state);
    this.low?.applyState?.(this.state);
  }

  get visible(): boolean {
    return this.root.visible;
  }

  set visible(v: boolean) {
    this.root.visible = v;
  }

  /** Posición en el mundo de un anclaje con nombre (o del origen si no existe). */
  anchorWorld(name: string, out = new Vector3()): Vector3 {
    const a = this.model.anchors[name];
    if (a) out.copy(a);
    else out.set(0, 0, 0);
    return this.root.localToWorld(out);
  }

  /** Articulación con nombre (para animaciones futuras). */
  joint(name: string) {
    return this.model.rig?.[name] ?? null;
  }

  update(ctx: UpdateContext): void {
    if (!this.root.visible || !this.model.update) return;
    if (this.lod && this.lod.getCurrentLevel() !== 0) return;
    this.model.update(this.state, ctx);
  }

  /** Objetivo de cámara para enfocar o seguir a esta entidad. */
  cameraTarget(heading?: number): RigTarget {
    const f = this.def.focus;
    const s = this.root.scale.x;
    return {
      uid: this.uid,
      dir: (out) => out.copy(this.dir),
      lift: f.lift * s,
      distance: f.distance * s,
      minDistance: f.minDistance * s,
      maxDistance: f.maxDistance,
      pitch: f.pitch,
      heading,
    };
  }

  get info(): EntityInfo {
    return {
      uid: this.uid,
      defId: this.def.id,
      kind: this.def.kind,
      name: this.def.name,
      description: this.def.description,
      tags: this.def.tags,
      state: { ...this.state },
      visible: this.root.visible,
    };
  }

  dispose(): void {
    this.root.traverse((o) => {
      const mesh = o as { geometry?: { dispose(): void } };
      mesh.geometry?.dispose();
    });
    this.root.removeFromParent();
  }
}

export class EntityManager {
  readonly root = new Group();
  private readonly entities = new Map<string, Entity>();
  private colliderCache: RigCollider[] = [];
  private collidersDirty = true;

  constructor(
    private readonly kit: MaterialKit,
    private readonly catalog: ReadonlyMap<string, EntityDef>,
  ) {
    this.root.name = 'world:entities';
  }

  /** Crea una instancia de una definición del catálogo y la coloca en el planeta. */
  spawn(defId: string, uid: string, placement: Placement, params: Record<string, unknown> = {}, state?: EntityState): Entity {
    const def = this.catalog.get(defId);
    if (!def) throw new Error(`Entidad desconocida en el catálogo: ${defId}`);
    this.remove(uid);
    const e = new Entity(uid, def, this.kit, placement, params, state);
    this.entities.set(uid, e);
    this.root.add(e.root);
    this.collidersDirty = true;
    return e;
  }

  remove(uid: string): void {
    const e = this.entities.get(uid);
    if (!e) return;
    e.dispose();
    this.entities.delete(uid);
    this.collidersDirty = true;
  }

  get(uid: string): Entity | null {
    return this.entities.get(uid) ?? null;
  }

  has(uid: string): boolean {
    return this.entities.has(uid);
  }

  all(): Entity[] {
    return [...this.entities.values()];
  }

  byKind(kind: EntityKind): Entity[] {
    return this.all().filter((e) => e.def.kind === kind);
  }

  byTag(tag: string): Entity[] {
    return this.all().filter((e) => e.def.tags.includes(tag));
  }

  byDef(defId: string): Entity[] {
    return this.all().filter((e) => e.def.id === defId);
  }

  /** Elimina todas las instancias cuyo uid empieza por el prefijo dado. */
  removePrefix(prefix: string): void {
    for (const uid of [...this.entities.keys()]) if (uid.startsWith(prefix)) this.remove(uid);
  }

  move(uid: string, placement: Placement): void {
    const e = this.entities.get(uid);
    if (!e) return;
    e.place(placement);
    this.collidersDirty = true;
  }

  setVisible(uid: string, visible: boolean): void {
    const e = this.entities.get(uid);
    if (!e || e.visible === visible) return;
    e.visible = visible;
    this.collidersDirty = true;
  }

  update(ctx: UpdateContext): void {
    for (const e of this.entities.values()) e.update(ctx);
  }

  /** Esferas de colisión de todas las entidades visibles (para la cámara). */
  colliders(): readonly RigCollider[] {
    if (this.collidersDirty) {
      this.colliderCache = [];
      for (const e of this.entities.values()) if (e.visible) this.colliderCache.push(...e.colliders);
      this.collidersDirty = false;
    }
    return this.colliderCache;
  }

  markCollidersDirty(): void {
    this.collidersDirty = true;
  }

  /** Entidad seleccionable más cercana que atraviesa el rayo. */
  pick(ray: Ray, maxDistance = Infinity): Entity | null {
    let best: Entity | null = null;
    let bestT = maxDistance;
    for (const e of this.entities.values()) {
      if (!e.visible || !e.def.selectable) continue;
      const s = e.root.scale.x;
      _sphere.center.copy(e.dir).multiplyScalar(e.pickHeight * s).add(e.root.position);
      _sphere.radius = e.pickRadius * s;
      const hit = ray.intersectSphere(_sphere, _v);
      if (!hit) continue;
      const t = hit.distanceTo(ray.origin);
      if (t < bestT) {
        bestT = t;
        best = e;
      }
    }
    return best;
  }

  /** Interacciones activas al alcance de un punto del mundo. */
  interactionsNear(point: Vector3): { entity: Entity; interaction: InteractionDef; distance: number }[] {
    const out: { entity: Entity; interaction: InteractionDef; distance: number }[] = [];
    for (const e of this.entities.values()) {
      if (!e.visible) continue;
      for (const i of e.interactions) {
        if (!i.enabled) continue;
        const d = e.anchorWorld(i.anchor, _v).distanceTo(point);
        if (d <= i.radius) out.push({ entity: e, interaction: i, distance: d });
      }
    }
    return out.sort((a, b) => a.distance - b.distance);
  }

  dispose(): void {
    for (const e of this.entities.values()) e.dispose();
    this.entities.clear();
    this.colliderCache = [];
  }
}
