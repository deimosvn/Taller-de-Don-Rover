// Malla del planeta: una esfera-cubo dividida en parcelas con tres niveles de detalle.
//
//   · Cada cara del cubo se divide en PATCHES×PATCHES parcelas; cada parcela puede dibujarse
//     con 40, 20 o 10 divisiones por lado según lo cerca que esté la cámara.
//   · El nivel más bajo de todo el planeta se genera al arrancar (decenas de milisegundos);
//     los niveles finos se generan poco a poco, con un presupuesto de tiempo por cuadro,
//     conforme la cámara se acerca (carga progresiva).
//   · Las parcelas ocultas por el horizonte no se dibujan y las "faldas" tapan las uniones
//     entre parcelas de distinto nivel.
//   · Los datos generados se guardan a nivel de módulo: si otra vista 3D se monta después
//     (por ejemplo al cambiar de etapa en la consola del profesor) reutiliza el terreno ya
//     calculado en lugar de volver a generarlo.

import { BufferAttribute, BufferGeometry, Group, Material, Mesh, Sphere, Vector3 } from 'three';
import { PLANET_RADIUS } from '../core/config';
import { newSample, sampleTerrain } from './heightfield';

const PATCHES = 5;
const LOD_SIZES = [40, 20, 10] as const;
const SKIRT = [0.55, 1.0, 1.9] as const;
/** Distancias (u) hasta las que se usa cada nivel, antes de aplicar el sesgo de calidad. */
const LOD_RANGE = [46, 118] as const;
/** Radio de la esfera que con seguridad tapa lo que hay detrás del horizonte. */
const OCCLUDER = PLANET_RADIUS - 5.5;
const MAX_RADIUS = PLANET_RADIUS + 10;

interface Face {
  n: [number, number, number];
  r: [number, number, number];
  u: [number, number, number];
}

const FACES: Face[] = [
  { n: [1, 0, 0], r: [0, 0, -1], u: [0, 1, 0] },
  { n: [-1, 0, 0], r: [0, 0, 1], u: [0, 1, 0] },
  { n: [0, 1, 0], r: [1, 0, 0], u: [0, 0, -1] },
  { n: [0, -1, 0], r: [1, 0, 0], u: [0, 0, 1] },
  { n: [0, 0, 1], r: [1, 0, 0], u: [0, 1, 0] },
  { n: [0, 0, -1], r: [-1, 0, 0], u: [0, 1, 0] },
];

interface PatchData {
  position: Float32Array;
  normal: Float32Array;
  mask: Uint8Array;
  info: Float32Array;
  center: [number, number, number];
  radius: number;
}

/* ---------------- generación de datos (independiente del renderizador) ---------------- */

const dataCache = new Map<string, PatchData>();
const indexCache = new Map<number, Uint16Array>();
const sample = newSample();

function faceDir(face: Face, a: number, b: number, out: Float64Array, o: number): void {
  // La tangente reparte las celdas de forma casi uniforme sobre la esfera.
  const ta = Math.tan(a * (Math.PI / 4));
  const tb = Math.tan(b * (Math.PI / 4));
  const x = face.n[0] + face.r[0] * ta + face.u[0] * tb;
  const y = face.n[1] + face.r[1] * ta + face.u[1] * tb;
  const z = face.n[2] + face.r[2] * ta + face.u[2] * tb;
  const l = 1 / Math.sqrt(x * x + y * y + z * z);
  out[o] = x * l;
  out[o + 1] = y * l;
  out[o + 2] = z * l;
}

function buildIndex(n: number): Uint16Array {
  const cached = indexCache.get(n);
  if (cached) return cached;
  const row = n + 1;
  const grid = row * row;
  const idx: number[] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * row + i;
      const b = a + 1;
      const d = a + row;
      const c = d + 1;
      idx.push(a, b, d, b, c, d);
    }
  }
  // Faldas: el borde recorre el perímetro en orden; cada vértice de falda va tras la malla.
  const border = borderOrder(n);
  for (let k = 0; k < border.length; k++) {
    const a = border[k];
    const b = border[(k + 1) % border.length];
    const sa = grid + k;
    const sb = grid + ((k + 1) % border.length);
    idx.push(a, b, sa, b, sb, sa, a, sa, b, b, sa, sb);
  }
  const out = new Uint16Array(idx);
  indexCache.set(n, out);
  return out;
}

function borderOrder(n: number): number[] {
  const row = n + 1;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(i);
  for (let j = 0; j < n; j++) out.push(j * row + n);
  for (let i = n; i > 0; i--) out.push(n * row + i);
  for (let j = n; j > 0; j--) out.push(j * row);
  return out;
}

function buildPatchData(faceIndex: number, pi: number, pj: number, lod: number): PatchData {
  const key = `${faceIndex}:${pi}:${pj}:${lod}`;
  const cached = dataCache.get(key);
  if (cached) return cached;

  const face = FACES[faceIndex];
  const n = LOD_SIZES[lod];
  const row = n + 1;
  const ext = n + 3;
  const u0 = -1 + (2 * pi) / PATCHES;
  const v0 = -1 + (2 * pj) / PATCHES;
  const step = 2 / PATCHES / n;

  // Rejilla extendida una celda hacia fuera: las normales salen de las alturas vecinas y por
  // eso coinciden entre parcelas contiguas.
  const dirs = new Float64Array(ext * ext * 3);
  const pos = new Float64Array(ext * ext * 3);
  const mat = new Float32Array(ext * ext * 7);
  for (let j = 0; j < ext; j++) {
    for (let i = 0; i < ext; i++) {
      const e = j * ext + i;
      faceDir(face, u0 + (i - 1) * step, v0 + (j - 1) * step, dirs, e * 3);
      const dx = dirs[e * 3];
      const dy = dirs[e * 3 + 1];
      const dz = dirs[e * 3 + 2];
      const s = sampleTerrain(dx, dy, dz, sample);
      const r = PLANET_RADIUS + s.h;
      pos[e * 3] = dx * r;
      pos[e * 3 + 1] = dy * r;
      pos[e * 3 + 2] = dz * r;
      const m = e * 7;
      mat[m] = s.ice;
      mat[m + 1] = s.basalt;
      mat[m + 2] = s.dune;
      mat[m + 3] = s.rock;
      mat[m + 4] = s.h;
      mat[m + 5] = s.ao;
      mat[m + 6] = s.colony;
    }
  }

  const border = borderOrder(n);
  const count = row * row + border.length;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const mask = new Uint8Array(count * 4);
  const info = new Float32Array(count * 3);

  for (let j = 0; j < row; j++) {
    for (let i = 0; i < row; i++) {
      const v = j * row + i;
      const e = (j + 1) * ext + (i + 1);
      const px = pos[e * 3];
      const py = pos[e * 3 + 1];
      const pz = pos[e * 3 + 2];
      position[v * 3] = px;
      position[v * 3 + 1] = py;
      position[v * 3 + 2] = pz;
      // Normal = (este − oeste) × (norte − sur) sobre la rejilla.
      const ex = pos[(e + 1) * 3] - pos[(e - 1) * 3];
      const ey = pos[(e + 1) * 3 + 1] - pos[(e - 1) * 3 + 1];
      const ez = pos[(e + 1) * 3 + 2] - pos[(e - 1) * 3 + 2];
      const nx0 = pos[(e + ext) * 3] - pos[(e - ext) * 3];
      const ny0 = pos[(e + ext) * 3 + 1] - pos[(e - ext) * 3 + 1];
      const nz0 = pos[(e + ext) * 3 + 2] - pos[(e - ext) * 3 + 2];
      let nx = ey * nz0 - ez * ny0;
      let ny = ez * nx0 - ex * nz0;
      let nz = ex * ny0 - ey * nx0;
      const nl = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz || 1);
      nx *= nl;
      ny *= nl;
      nz *= nl;
      normal[v * 3] = nx;
      normal[v * 3 + 1] = ny;
      normal[v * 3 + 2] = nz;
      const m = e * 7;
      mask[v * 4] = Math.round(Math.min(1, Math.max(0, mat[m])) * 255);
      mask[v * 4 + 1] = Math.round(Math.min(1, Math.max(0, mat[m + 1])) * 255);
      mask[v * 4 + 2] = Math.round(Math.min(1, Math.max(0, mat[m + 2])) * 255);
      mask[v * 4 + 3] = Math.round(Math.min(1, Math.max(0, mat[m + 3])) * 255);
      info[v * 3] = mat[m + 4];
      info[v * 3 + 1] = mat[m + 5];
      info[v * 3 + 2] = mat[m + 6];
    }
  }

  // Faldas: copia del borde hundida hacia el centro del planeta.
  const grid = row * row;
  for (let k = 0; k < border.length; k++) {
    const src = border[k];
    const dst = grid + k;
    const px = position[src * 3];
    const py = position[src * 3 + 1];
    const pz = position[src * 3 + 2];
    const l = Math.sqrt(px * px + py * py + pz * pz);
    const f = (l - SKIRT[lod]) / l;
    position[dst * 3] = px * f;
    position[dst * 3 + 1] = py * f;
    position[dst * 3 + 2] = pz * f;
    normal[dst * 3] = normal[src * 3];
    normal[dst * 3 + 1] = normal[src * 3 + 1];
    normal[dst * 3 + 2] = normal[src * 3 + 2];
    mask.copyWithin(dst * 4, src * 4, src * 4 + 4);
    info.copyWithin(dst * 3, src * 3, src * 3 + 3);
  }

  // Esfera envolvente (para el descarte por frustum).
  const mid = ((n >> 1) + 1) * ext + (n >> 1) + 1;
  const cx = pos[mid * 3];
  const cy = pos[mid * 3 + 1];
  const cz = pos[mid * 3 + 2];
  let radius = 0;
  for (let v = 0; v < count; v++) {
    const d = Math.hypot(position[v * 3] - cx, position[v * 3 + 1] - cy, position[v * 3 + 2] - cz);
    if (d > radius) radius = d;
  }

  const data: PatchData = { position, normal, mask, info, center: [cx, cy, cz], radius };
  dataCache.set(key, data);
  return data;
}

/* ---------------- parcelas en escena ---------------- */

interface Patch {
  face: number;
  pi: number;
  pj: number;
  /** Dirección y punto del centro de la parcela. */
  dir: Vector3;
  center: Vector3;
  /** Radio angular aproximado. */
  angle: number;
  radius: number;
  meshes: (Mesh | null)[];
  shown: number;
  lastUsed: number;
}

interface Job {
  patch: Patch;
  lod: number;
  priority: number;
}

export class PlanetTerrain {
  readonly group = new Group();
  private readonly patches: Patch[] = [];
  private readonly jobs: Job[] = [];
  private readonly queued = new Set<string>();
  private frame = 0;
  private fineCount = 0;
  private readonly camDir = new Vector3();

  constructor(
    private readonly material: Material,
    /** Máximo de parcelas en detalle fino que se conservan en memoria de GPU. */
    private readonly fineBudget = 56,
  ) {
    this.group.name = 'planet:terrain';
    this.group.matrixAutoUpdate = false;
    const tmp = new Float64Array(3);
    for (let f = 0; f < FACES.length; f++) {
      for (let pj = 0; pj < PATCHES; pj++) {
        for (let pi = 0; pi < PATCHES; pi++) {
          const data = buildPatchData(f, pi, pj, 2);
          faceDir(FACES[f], -1 + (2 * pi + 1) / PATCHES, -1 + (2 * pj + 1) / PATCHES, tmp, 0);
          const patch: Patch = {
            face: f,
            pi,
            pj,
            dir: new Vector3(tmp[0], tmp[1], tmp[2]),
            center: new Vector3(...data.center),
            angle: Math.asin(Math.min(1, data.radius / PLANET_RADIUS)),
            radius: data.radius,
            meshes: [null, null, null],
            shown: -1,
            lastUsed: 0,
          };
          patch.meshes[2] = this.makeMesh(patch, 2, data);
          this.patches.push(patch);
        }
      }
    }
  }

  private makeMesh(patch: Patch, lod: number, data: PatchData): Mesh {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(data.position, 3));
    geo.setAttribute('normal', new BufferAttribute(data.normal, 3));
    geo.setAttribute('aMask', new BufferAttribute(data.mask, 4, true));
    geo.setAttribute('aInfo', new BufferAttribute(data.info, 3));
    geo.setIndex(new BufferAttribute(buildIndex(LOD_SIZES[lod]), 1));
    geo.boundingSphere = new Sphere(new Vector3(...data.center), data.radius);
    const mesh = new Mesh(geo, this.material);
    mesh.name = `planet:patch:${patch.face}.${patch.pi}.${patch.pj}:lod${lod}`;
    mesh.matrixAutoUpdate = false;
    mesh.receiveShadow = true;
    mesh.visible = false;
    this.group.add(mesh);
    return mesh;
  }

  /**
   * Elige el nivel de detalle de cada parcela y genera, dentro del presupuesto de tiempo,
   * los niveles que falten. Devuelve cuántas parcelas quedan por refinar.
   */
  update(cameraPos: Vector3, lodBias: number, budgetMs: number): number {
    this.frame++;
    const camDist = cameraPos.length();
    this.camDir.copy(cameraPos).divideScalar(camDist || 1);
    const horizon =
      camDist > OCCLUDER ? Math.acos(Math.min(1, OCCLUDER / camDist)) + Math.acos(OCCLUDER / MAX_RADIUS) : Math.PI;
    const r0 = LOD_RANGE[0] * lodBias;
    const r1 = LOD_RANGE[1] * lodBias;

    this.jobs.length = 0;
    this.queued.clear();
    for (const p of this.patches) {
      const cos = p.dir.dot(this.camDir);
      const visible = cos > Math.cos(Math.min(Math.PI, horizon + p.angle));
      if (!visible) {
        this.show(p, -1);
        continue;
      }
      const d = Math.max(0, p.center.distanceTo(cameraPos) - p.radius);
      const want = d < r0 ? 0 : d < r1 ? 1 : 2;
      let use = want;
      while (use < 2 && !p.meshes[use]) use++;
      this.show(p, use);
      p.lastUsed = this.frame;
      if (use !== want) {
        // Primero el nivel intermedio (barato), después el fino.
        const next = want === 0 && !p.meshes[1] ? 1 : want;
        this.jobs.push({ patch: p, lod: next, priority: d + next * 4 });
      }
    }

    if (this.jobs.length) {
      this.jobs.sort((a, b) => a.priority - b.priority);
      const start = performance.now();
      let done = 0;
      for (const job of this.jobs) {
        if (done > 0 && performance.now() - start > budgetMs) break;
        const data = buildPatchData(job.patch.face, job.patch.pi, job.patch.pj, job.lod);
        job.patch.meshes[job.lod] = this.makeMesh(job.patch, job.lod, data);
        if (job.lod === 0) this.fineCount++;
        done++;
      }
      if (this.fineCount > this.fineBudget) this.trim();
      return this.jobs.length - done;
    }
    return 0;
  }

  private show(p: Patch, lod: number): void {
    if (p.shown === lod) return;
    if (p.shown >= 0) p.meshes[p.shown]!.visible = false;
    if (lod >= 0) p.meshes[lod]!.visible = true;
    p.shown = lod;
  }

  /** Libera de la GPU las parcelas finas que llevan más tiempo sin usarse. */
  private trim(): void {
    const fine = this.patches.filter((p) => p.meshes[0] && p.shown !== 0).sort((a, b) => a.lastUsed - b.lastUsed);
    for (const p of fine) {
      if (this.fineCount <= this.fineBudget * 0.8) break;
      const mesh = p.meshes[0]!;
      this.group.remove(mesh);
      mesh.geometry.dispose();
      p.meshes[0] = null;
      this.fineCount--;
    }
  }

  /** Genera de inmediato el detalle alrededor de un punto (para que una vista arranque nítida). */
  warm(cameraPos: Vector3, lodBias: number, maxMs = 120): void {
    const start = performance.now();
    while (this.update(cameraPos, lodBias, 30) > 0 && performance.now() - start < maxMs) {
      /* sigue refinando */
    }
  }

  get stats() {
    let visible = 0;
    let triangles = 0;
    for (const p of this.patches) {
      if (p.shown < 0) continue;
      visible++;
      triangles += LOD_SIZES[p.shown] * LOD_SIZES[p.shown] * 2;
    }
    return { patches: this.patches.length, visible, triangles, fine: this.fineCount };
  }

  dispose(): void {
    for (const p of this.patches) {
      for (const m of p.meshes) m?.geometry.dispose();
    }
    this.group.clear();
  }
}
