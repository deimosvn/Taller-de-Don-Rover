// Estudio de retratos 3D. Un único renderizador WebGL dibuja los modelos del mundo
// (astronautas, IX, Don Rover, edificios y sectores) en todos los lienzos pequeños de la
// página: avatares, tarjetas, insignias de misión, logotipo… Así la interfaz usa los mismos
// modelos 3D que el planeta sin abrir un contexto WebGL por cada imagen.
//
//   · Vistas animadas: se dibujan cada cuadro mientras están en pantalla.
//   · Vistas fijas: se dibujan una vez y el resultado se guarda en caché (mismo modelo,
//     mismo tamaño → se reutiliza la imagen).

import {
  Box3,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  NoToneMapping,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Sphere,
  Vector3,
  WebGLRenderer,
} from 'three';
import type { AvatarConfig, BuildingId, MissionId, RoleId, SectorId } from '../../../shared/types';
import { MISSIONS } from '../../../shared/content';
import { DEG } from '../core/math';
import type { BuiltModel, EntityState } from '../entities/types';
import { ASTRO_SCALE, buildAstronaut, type AnimName } from '../models/astronaut';
import { buildBuilding, buildCityTower, buildHub, buildSector } from '../models/colony';
import { IX_HOVER, buildIx, buildRover } from '../models/machines';
import { MaterialKit } from '../models/sculpt';

export type StudioSubject =
  | { type: 'astronaut'; avatar: AvatarConfig; role?: RoleId | null; anim?: AnimName }
  | { type: 'ix'; mode?: 'idle' | 'talk' | 'scan' }
  | { type: 'rover' }
  | { type: 'mission'; id: MissionId }
  | { type: 'building'; id: BuildingId }
  | { type: 'sector'; id: SectorId }
  | { type: 'hub' };

export interface ViewOptions {
  /** Dibujar cada cuadro (si no, una sola vez). */
  animate: boolean;
  /** Giro lento automático. */
  turntable?: boolean;
  /** Permite girar el modelo arrastrando. */
  draggable?: boolean;
  /** Rumbo inicial de la cámara (grados; 0 = de frente). */
  yaw?: number;
  /** Inclinación de la cámara (grados). */
  pitch?: number;
  /** Margen alrededor del modelo (1 = justo). */
  padding?: number;
  /** Sombra de contacto bajo el modelo. */
  shadow?: boolean;
}

export function subjectKey(s: StudioSubject): string {
  switch (s.type) {
    case 'astronaut':
      return `astro:${s.avatar.suit}.${s.avatar.helmet}.${s.avatar.visor}.${s.avatar.accessory}:${s.role ?? '-'}:${s.anim ?? 'idle'}`;
    case 'ix':
      return `ix:${s.mode ?? 'idle'}`;
    case 'mission':
    case 'building':
    case 'sector':
      return `${s.type}:${s.id}`;
    default:
      return s.type;
  }
}

/* ------------------------------------------------------------------ */
/* Construcción de modelos                                              */
/* ------------------------------------------------------------------ */

interface Built {
  root: Group;
  model: BuiltModel;
  state: EntityState;
  /** Esfera que hay que encuadrar. */
  frame: Sphere;
  defaults: { yaw: number; pitch: number };
}

const MISSION_BUILDING: Record<MissionId, BuildingId> = Object.fromEntries(
  (Object.keys(MISSIONS) as MissionId[]).map((id) => [id, MISSIONS[id].unlock]),
) as Record<MissionId, BuildingId>;

function frameOf(obj: Object3D): Sphere {
  obj.updateMatrixWorld(true);
  const box = new Box3();
  obj.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || !m.visible || !m.geometry) return;
    // Los haces de luz y los halos no cuentan para el encuadre.
    if ((m.material as MeshBasicMaterial).transparent && (m.material as MeshBasicMaterial).opacity < 0.5) return;
    m.geometry.computeBoundingBox();
    box.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld));
  });
  if (box.isEmpty()) return new Sphere(new Vector3(0, 1, 0), 1.5);
  const s = new Sphere();
  box.getBoundingSphere(s);
  // Esfera algo más ajustada que la del cubo (los modelos son redondeados).
  s.radius *= 0.86;
  return s;
}

function build(kit: MaterialKit, subject: StudioSubject): Built {
  const ctx = { kit, detail: 1 as const };
  let model: BuiltModel;
  let state: EntityState = {};
  let frame: Sphere | null = null;
  let defaults = { yaw: 24, pitch: 16 };
  switch (subject.type) {
    case 'astronaut':
      model = buildAstronaut(ctx, { avatar: subject.avatar, role: subject.role ?? null, seed: 7 });
      state = { anim: subject.anim ?? 'idle', speed: 1 };
      frame = new Sphere(new Vector3(0, 0.9 * (ASTRO_SCALE / 0.86), 0), 1.0);
      defaults = { yaw: 18, pitch: 8 };
      break;
    case 'ix':
      model = buildIx(ctx);
      state = { mode: subject.mode ?? 'idle' };
      frame = new Sphere(new Vector3(0, IX_HOVER, 0), 0.82);
      defaults = { yaw: 10, pitch: 6 };
      break;
    case 'rover':
      model = buildRover(ctx);
      state = { speed: 0 };
      defaults = { yaw: 38, pitch: 20 };
      break;
    case 'mission': {
      const b = MISSION_BUILDING[subject.id];
      model = b === 'city' ? buildCityTower(ctx, { variant: 0 }) : buildBuilding(b)(ctx);
      defaults = { yaw: 32, pitch: 26 };
      break;
    }
    case 'building':
      model = subject.id === 'city' ? buildCityTower(ctx, { variant: 0 }) : buildBuilding(subject.id)(ctx);
      defaults = { yaw: 32, pitch: 26 };
      break;
    case 'sector':
      model = buildSector(subject.id)(ctx);
      defaults = { yaw: 30, pitch: 28 };
      break;
    case 'hub':
      model = buildHub(ctx);
      defaults = { yaw: 20, pitch: 24 };
      break;
  }
  const root = new Group();
  root.add(model.object);
  model.applyState?.({ ...state, hideLabel: true });
  return { root, model, state, frame: frame ?? frameOf(root), defaults };
}

function disposeTree(obj: Object3D): void {
  obj.traverse((o) => {
    const m = o as Mesh;
    m.geometry?.dispose();
  });
}

/* ------------------------------------------------------------------ */
/* Estudio                                                              */
/* ------------------------------------------------------------------ */

export interface StudioView {
  setSubject(subject: StudioSubject): void;
  setOptions(options: Partial<ViewOptions>): void;
  dispose(): void;
}

interface View {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  subject: StudioSubject;
  key: string;
  options: ViewOptions;
  built: Built | null;
  visible: boolean;
  dirty: boolean;
  time: number;
  yawOffset: number;
  dragX: number | null;
  observer: IntersectionObserver;
  off: () => void;
}

const MAX_CACHE = 160;

class Studio {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(28, 1, 0.05, 200);
  private readonly kit = new MaterialKit();
  private readonly stage = new Group();
  private readonly shadow: Mesh;
  private readonly views = new Set<View>();
  private readonly cache = new Map<string, HTMLCanvasElement>();
  private raf = 0;
  private last = 0;
  private bufW = 0;
  private bufH = 0;

  constructor() {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(1);
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.setClearColor(0x000000, 0);

    const hemi = new HemisphereLight(new Color('#FFE7CF'), new Color('#9A4F62'), 1.7);
    const key = new DirectionalLight(new Color('#FFF3E0'), 2.5);
    key.position.set(-3, 6, 5);
    const rim = new DirectionalLight(new Color('#FFB27A'), 1.1);
    rim.position.set(4, 3, -5);
    this.scene.add(hemi, key, rim, this.stage);

    // Sombra de contacto: un degradado radial suave (las sombras de la referencia nunca son negras).
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(90,30,40,0.45)');
    grad.addColorStop(0.6, 'rgba(90,30,40,0.18)');
    grad.addColorStop(1, 'rgba(90,30,40,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    this.shadow = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: new CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.01;
    this.scene.add(this.shadow);
  }

  attach(canvas: HTMLCanvasElement, subject: StudioSubject, options: ViewOptions): StudioView {
    const ctx = canvas.getContext('2d')!;
    const view: View = {
      canvas,
      ctx,
      subject,
      key: subjectKey(subject),
      options,
      built: null,
      visible: false,
      dirty: true,
      time: Math.random() * 10,
      yawOffset: 0,
      dragX: null,
      observer: new IntersectionObserver((entries) => {
        view.visible = entries.some((e) => e.isIntersecting);
        if (view.visible) this.wake();
      }),
      off: () => {},
    };
    view.observer.observe(canvas);
    if (options.draggable) {
      const down = (e: PointerEvent) => {
        view.dragX = e.clientX;
        canvas.setPointerCapture(e.pointerId);
      };
      const move = (e: PointerEvent) => {
        if (view.dragX === null) return;
        view.yawOffset -= (e.clientX - view.dragX) * 0.6;
        view.dragX = e.clientX;
        view.dirty = true;
        this.wake();
      };
      const up = () => {
        view.dragX = null;
      };
      canvas.addEventListener('pointerdown', down);
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', up);
      view.off = () => {
        canvas.removeEventListener('pointerdown', down);
        canvas.removeEventListener('pointermove', move);
        canvas.removeEventListener('pointerup', up);
        canvas.removeEventListener('pointercancel', up);
      };
    }
    this.views.add(view);
    this.wake();
    return {
      setSubject: (s) => {
        const key = subjectKey(s);
        if (key === view.key) return;
        view.subject = s;
        view.key = key;
        this.release(view);
        view.dirty = true;
        this.wake();
      },
      setOptions: (o) => {
        view.options = { ...view.options, ...o };
        view.dirty = true;
        this.wake();
      },
      dispose: () => {
        view.observer.disconnect();
        view.off();
        this.release(view);
        this.views.delete(view);
      },
    };
  }

  private release(view: View): void {
    if (!view.built) return;
    disposeTree(view.built.root);
    view.built = null;
  }

  private wake(): void {
    if (!this.raf) this.raf = requestAnimationFrame(this.loop);
  }

  private loop = (now: number): void => {
    this.raf = 0;
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    let again = false;
    for (const view of this.views) {
      if (!view.visible || !view.canvas.isConnected) continue;
      const live = view.options.animate || view.options.turntable || view.dragX !== null;
      if (!live && !view.dirty) continue;
      this.draw(view, dt);
      if (live) again = true;
    }
    if (again) this.raf = requestAnimationFrame(this.loop);
    else this.last = 0;
  };

  private fitBuffer(w: number, h: number): void {
    if (w <= this.bufW && h <= this.bufH) return;
    this.bufW = Math.max(this.bufW, w, 256);
    this.bufH = Math.max(this.bufH, h, 256);
    this.renderer.setSize(this.bufW, this.bufH, false);
  }

  private draw(view: View, dt: number): void {
    const { canvas, ctx, options } = view;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const live = options.animate || options.turntable || view.dragX !== null;
    const cacheKey = `${view.key}|${w}x${h}|${options.yaw ?? ''}|${options.pitch ?? ''}`;
    if (!live) {
      const cached = this.cache.get(cacheKey);
      if (cached && view.yawOffset === 0) {
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(cached, 0, 0);
        view.dirty = false;
        return;
      }
    }

    if (!view.built) {
      view.built = build(this.kit, view.subject);
      // Las vistas fijas muestran la pose ya asentada (p. ej. el saludo con el brazo arriba).
      if (!options.animate) for (let i = 0; i < 40; i++) view.built.model.update?.(view.built.state, { dt: 1 / 30, time: i / 30, night: 0 });
    }
    const b = view.built;
    view.time += dt;
    if (options.animate) b.model.update?.(b.state, { dt, time: view.time, night: 0 });
    if (options.turntable && view.dragX === null) view.yawOffset += dt * 18;

    // Cámara: encuadra la esfera del modelo según el tamaño del lienzo.
    const yaw = ((options.yaw ?? b.defaults.yaw) + view.yawOffset) * DEG;
    const pitch = (options.pitch ?? b.defaults.pitch) * DEG;
    const aspect = w / h;
    this.camera.aspect = aspect;
    const vfov = this.camera.fov * DEG;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
    const half = Math.min(vfov, hfov) / 2;
    const r = b.frame.radius * (options.padding ?? 1.08);
    const dist = r / Math.sin(half);
    const c = b.frame.center;
    this.camera.position.set(c.x + Math.sin(yaw) * Math.cos(pitch) * dist, c.y + Math.sin(pitch) * dist, c.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    this.camera.near = Math.max(0.05, dist - r * 3);
    this.camera.far = dist + r * 4;
    this.camera.lookAt(c);
    this.camera.updateProjectionMatrix();

    this.shadow.visible = options.shadow !== false && view.subject.type !== 'ix';
    const sr = view.subject.type === 'astronaut' ? 1.15 : b.frame.radius * 1.6;
    this.shadow.scale.set(sr, sr, 1);

    this.stage.add(b.root);
    this.fitBuffer(w, h);
    this.renderer.setViewport(0, 0, w, h);
    this.renderer.setScissor(0, 0, w, h);
    this.renderer.setScissorTest(true);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.setScissorTest(false);
    this.stage.remove(b.root);

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.renderer.domElement, 0, this.bufH - h, w, h, 0, 0, w, h);
    view.dirty = false;

    if (!live && view.yawOffset === 0) {
      const copy = document.createElement('canvas');
      copy.width = w;
      copy.height = h;
      copy.getContext('2d')!.drawImage(canvas, 0, 0);
      this.cache.set(cacheKey, copy);
      if (this.cache.size > MAX_CACHE) this.cache.delete(this.cache.keys().next().value!);
      // Una vista fija ya no necesita su modelo en memoria.
      this.release(view);
    }
  }
}

let instance: Studio | null = null;
let failed = false;

/** Estudio compartido (o null si el navegador no tiene WebGL). */
export function getStudio(): Studio | null {
  if (instance || failed) return instance;
  try {
    instance = new Studio();
  } catch (err) {
    failed = true;
    console.warn('[Don Rover] Sin WebGL para los retratos 3D:', err);
  }
  return instance;
}
