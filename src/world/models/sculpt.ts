// Taller de modelado procedural. Todos los modelos del mundo (personajes, edificios,
// vehículos, objetos) se construyen con estas piezas redondeadas y se fusionan en muy pocas
// mallas, de modo que cada entidad cuesta una o dos llamadas de dibujo.
//
// El color, la rugosidad, el metal y el brillo propio viajan por vértice, así que un único
// material PBR compartido ("pintura") sirve para todo lo opaco del juego.

import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  IcosahedronGeometry,
  LatheGeometry,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Texture,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Vec3 = [number, number, number];

export interface PartOptions {
  /** Posición del centro de la pieza. */
  at?: Vec3;
  /** Rotación en radianes (orden XYZ). */
  rot?: Vec3;
  scale?: number | Vec3;
  /** Rugosidad PBR (1 = mate). */
  rough?: number;
  /** Metal PBR (0–1). */
  metal?: number;
  /** Brillo propio (ventanas, balizas, pantallas). */
  glow?: number;
}

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _e = new Euler();
const _c = new Color();

/** Acumulador de piezas de color que termina fusionado en una sola geometría. */
export class Sculpt {
  private readonly parts: BufferGeometry[] = [];

  /** `detail` 1 = modelo completo, 0 = versión ligera para verse de lejos. */
  constructor(readonly detail: 0 | 1 = 1) {}

  get empty(): boolean {
    return this.parts.length === 0;
  }

  /** Número de segmentos según el nivel de detalle. */
  seg(full: number): number {
    return this.detail ? full : Math.max(6, Math.round(full * 0.5));
  }

  add(geometry: BufferGeometry, color: string, o: PartOptions = {}): this {
    const g = geometry;
    const sc = o.scale ?? 1;
    _p.set(...(o.at ?? [0, 0, 0]));
    _q.setFromEuler(_e.set(...(o.rot ?? [0, 0, 0])));
    if (typeof sc === 'number') _s.set(sc, sc, sc);
    else _s.set(...sc);
    g.applyMatrix4(_m.compose(_p, _q, _s));
    g.deleteAttribute('uv');
    g.deleteAttribute('uv1');
    const n = g.getAttribute('position').count;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    _c.set(color);
    const col = new Float32Array(n * 3);
    const pbr = new Float32Array(n * 3);
    const rough = o.rough ?? 0.9;
    const metal = o.metal ?? 0;
    const glow = o.glow ?? 0;
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r;
      col[i * 3 + 1] = _c.g;
      col[i * 3 + 2] = _c.b;
      pbr[i * 3] = rough;
      pbr[i * 3 + 1] = metal;
      pbr[i * 3 + 2] = glow;
    }
    g.setAttribute('color', new BufferAttribute(col, 3));
    g.setAttribute('aPbr', new BufferAttribute(pbr, 3));
    if (!g.index) {
      const idx = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      g.setIndex(new BufferAttribute(idx, 1));
    }
    g.morphAttributes = {};
    this.parts.push(g);
    return this;
  }

  box(w: number, h: number, d: number, color: string, o: PartOptions & { radius?: number } = {}): this {
    const r = Math.min(o.radius ?? Math.min(w, h, d) * 0.22, Math.min(w, h, d) * 0.5);
    const geo = r > 0.001 && this.detail ? new RoundedBoxGeometry(w, h, d, 3, r) : new BoxGeometry(w, h, d);
    return this.add(geo, color, o);
  }

  sphere(r: number, color: string, o: PartOptions = {}): this {
    return this.add(new SphereGeometry(r, this.seg(22), this.seg(16)), color, o);
  }

  /** Esfera de pocas caras para rocas (el sombreado suave la deja como un guijarro). */
  blob(r: number, color: string, o: PartOptions = {}, subdivisions = 1): this {
    return this.add(new IcosahedronGeometry(r, this.detail ? subdivisions : 0), color, o);
  }

  /** Cúpula: media esfera apoyada en su base. */
  dome(r: number, color: string, o: PartOptions & { squash?: number } = {}): this {
    const geo = new SphereGeometry(r, this.seg(28), this.seg(12), 0, Math.PI * 2, 0, Math.PI / 2);
    if (o.squash) geo.scale(1, o.squash, 1);
    return this.add(geo, color, o);
  }

  cylinder(rTop: number, rBottom: number, h: number, color: string, o: PartOptions & { open?: boolean; sides?: number } = {}): this {
    return this.add(new CylinderGeometry(rTop, rBottom, h, this.seg(o.sides ?? 20), 1, o.open ?? false), color, o);
  }

  cone(r: number, h: number, color: string, o: PartOptions & { sides?: number } = {}): this {
    return this.add(new ConeGeometry(r, h, this.seg(o.sides ?? 18)), color, o);
  }

  /** Cápsula vertical: `length` es el tramo recto entre las dos semiesferas. */
  capsule(r: number, length: number, color: string, o: PartOptions = {}): this {
    return this.add(new CapsuleGeometry(r, length, this.detail ? 6 : 3, this.seg(16)), color, o);
  }

  torus(radius: number, tube: number, color: string, o: PartOptions & { arc?: number } = {}): this {
    return this.add(new TorusGeometry(radius, tube, this.detail ? 10 : 6, this.seg(36), o.arc ?? Math.PI * 2), color, o);
  }

  /** Disco plano mirando hacia arriba. */
  disc(r: number, color: string, o: PartOptions = {}): this {
    const geo = new CircleGeometry(r, this.seg(28));
    geo.rotateX(-Math.PI / 2);
    return this.add(geo, color, o);
  }

  /** Sólido de revolución a partir de un perfil [radio, altura]. */
  lathe(profile: [number, number][], color: string, o: PartOptions = {}): this {
    return this.add(new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), this.seg(24)), color, o);
  }

  /** Tubo que sigue una curva suave por los puntos dados. */
  tube(points: Vec3[], radius: number, color: string, o: PartOptions & { closed?: boolean } = {}): this {
    const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)), o.closed ?? false);
    return this.add(new TubeGeometry(curve, Math.max(8, points.length * (this.detail ? 6 : 3)), radius, this.seg(10), o.closed ?? false), color, o);
  }

  /** Fusiona todas las piezas. Devuelve null si no se añadió ninguna. */
  build(): BufferGeometry | null {
    if (!this.parts.length) return null;
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    if (!merged) return null;
    merged.computeBoundingSphere();
    return merged;
  }

  /** Fusiona y devuelve una malla lista para la escena (o null si no hay piezas). */
  mesh(material: Material, name: string, shadows = true): Mesh | null {
    const geo = this.build();
    if (!geo) return null;
    const mesh = new Mesh(geo, material);
    mesh.name = name;
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    return mesh;
  }
}

/* ------------------------------------------------------------------ */
/* Materiales compartidos                                               */
/* ------------------------------------------------------------------ */

/** Juego de materiales de una vista del mundo. Se crean una vez y se reutilizan en todo. */
export class MaterialKit {
  /** Material PBR opaco con color/rugosidad/metal/brillo por vértice. */
  readonly paint: MeshStandardMaterial;
  /** Igual que `paint` pero visible por ambas caras (láminas y discos). */
  readonly paintDouble: MeshStandardMaterial;
  /** Multiplicador global del brillo propio (sube al atardecer y en la oscuridad). */
  readonly glow = { value: 1 };
  private readonly glasses = new Map<string, MeshStandardMaterial>();
  private readonly lights = new Map<string, MeshBasicMaterial>();
  private env: Texture | null = null;

  constructor() {
    this.paint = this.makePaint(false);
    this.paintDouble = this.makePaint(true);
  }

  private makePaint(double: boolean): MeshStandardMaterial {
    const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: double ? DoubleSide : undefined });
    mat.name = double ? 'mat:paint-double' : 'mat:paint';
    const glow = this.glow;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uGlow = glow;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aPbr;\nvarying vec3 vPbr;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPbr = aPbr;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPbr;\nuniform float uGlow;')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vPbr.x;')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vPbr.y;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vPbr.z * uGlow;');
    };
    mat.customProgramCacheKey = () => 'ix-paint';
    return mat;
  }

  /** Vidrio translúcido teñido (cúpulas, visores, tubos de cultivo). */
  glass(tint: string, opacity = 0.34): MeshStandardMaterial {
    const key = `${tint}:${opacity}`;
    let mat = this.glasses.get(key);
    if (!mat) {
      mat = new MeshStandardMaterial({ color: tint, transparent: true, opacity, roughness: 0.12, metalness: 0, depthWrite: false, envMap: this.env, envMapIntensity: 0.9 });
      mat.name = `mat:glass:${tint}`;
      this.glasses.set(key, mat);
    }
    return mat;
  }

  /** Luz pura sin sombreado (balizas, flujo de los tubos, halos). */
  light(color: string, opacity = 1): MeshBasicMaterial {
    const key = `${color}:${opacity}`;
    let mat = this.lights.get(key);
    if (!mat) {
      mat = new MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false });
      mat.name = `mat:light:${color}`;
      this.lights.set(key, mat);
    }
    return mat;
  }

  /**
   * Entorno para los reflejos del vidrio (se regenera al cambiar la iluminación). La pintura
   * opaca no lo usa: su luz ambiente la fija la dirección de arte, igual que la del terreno.
   */
  setEnvironment(env: Texture | null): void {
    this.env = env;
    for (const g of this.glasses.values()) {
      g.envMap = env;
      g.needsUpdate = true;
    }
  }

  dispose(): void {
    this.paint.dispose();
    this.paintDouble.dispose();
    for (const g of this.glasses.values()) g.dispose();
    for (const l of this.lights.values()) l.dispose();
    this.glasses.clear();
    this.lights.clear();
  }
}
