// Cámara del mundo. Modelo: la cámara mira siempre a un punto de la superficie (foco) y se
// coloca a cierta distancia, rumbo e inclinación respecto de él.
//
//   foco ......... dirección unitaria sobre el planeta (viajar = mover el foco)
//   rumbo ........ giro alrededor de la vertical local (orbitar)
//   inclinación .. ángulo sobre el horizonte local (90° = cenital, ~10° = a ras de suelo)
//   distancia .... zoom real: la cámara se acerca o se aleja en el espacio 3D
//
// En exploración libre la inclinación acompaña al zoom: de lejos la vista es cenital y el
// planeta se ve entero; al acercarse la cámara baja hasta quedar a ras de suelo, igual que la
// "zambullida" del video de referencia. El marco de referencia se transporta en paralelo
// sobre la esfera, así que no hay singularidades en los polos.
//
// Modos: 'free' (exploración), 'focus' (inspeccionar un objeto), 'follow' (seguir a un
// personaje), 'mission' (planos guiados para futuras misiones) y 'auto' (rotación continua).

import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { CAMERA, PLANET_RADIUS, type CameraTuning } from '../core/config';
import { DEG, angleBetween, angleDelta, clamp, damp, easeInOut, lerp, tangentFrame } from '../core/math';

export type CameraMode = 'free' | 'focus' | 'follow' | 'mission' | 'auto';

/** Esfera que la cámara no puede atravesar. */
export interface RigCollider {
  uid: string;
  x: number;
  y: number;
  z: number;
  r: number;
}

export interface RigEnvironment {
  terrainRadius(dir: Vector3): number;
  colliders(): readonly RigCollider[];
}

/** Algo que la cámara puede enfocar o seguir (una entidad, un lugar). */
export interface RigTarget {
  uid: string;
  /** Dirección actual del objetivo sobre el planeta. */
  dir(out: Vector3): Vector3;
  /** Altura del punto de mira sobre el suelo. */
  lift: number;
  /** Distancia inicial y límites del zoom mientras está enfocado. */
  distance: number;
  minDistance: number;
  maxDistance: number;
  /** Inclinación inicial (grados). */
  pitch: number;
  /** Rumbo inicial (rad). Si falta, se conserva el actual. */
  heading?: number;
}

export interface FlyOptions {
  dir: Vector3;
  distance?: number;
  heading?: number;
  /** Corrección de inclinación (grados) sobre la automática. */
  tilt?: number;
  lift?: number;
  duration?: number;
}

/** Un plano de cámara para secuencias de misión. */
export interface CameraShot extends FlyOptions {
  /** Segundos que se mantiene el plano al llegar. */
  hold?: number;
}

/** Inclinación automática (grados) según la distancia, interpolada en escala logarítmica. */
const AUTO_PITCH: [number, number][] = [
  [3, 9],
  [8, 13],
  [20, 30],
  [45, 49],
  [78, 58],
  [130, 73],
  [190, 89],
];

export function autoPitch(dist: number): number {
  if (dist <= AUTO_PITCH[0][0]) return AUTO_PITCH[0][1];
  for (let i = 1; i < AUTO_PITCH.length; i++) {
    const [d1, p1] = AUTO_PITCH[i];
    if (dist <= d1) {
      const [d0, p0] = AUTO_PITCH[i - 1];
      const k = (Math.log(dist) - Math.log(d0)) / (Math.log(d1) - Math.log(d0));
      return lerp(p0, p1, k * k * (3 - 2 * k));
    }
  }
  return AUTO_PITCH[AUTO_PITCH.length - 1][1];
}

interface Flight {
  fromFocus: Vector3;
  fromRef: Vector3;
  axis: Vector3;
  angle: number;
  fromDist: number;
  toDist: number;
  fromHeading: number;
  toHeading: number;
  fromPitch: number;
  toPitch: number | null;
  fromTilt: number;
  toTilt: number;
  fromLift: number;
  toLift: number;
  hop: number;
  t: number;
  duration: number;
  locked: boolean;
  onArrive?: () => void;
}

const _v1 = new Vector3();
const _v2 = new Vector3();
const _v3 = new Vector3();
const _q = new Quaternion();

export class CameraRig {
  mode: CameraMode = 'free';
  onModeChange?: (mode: CameraMode) => void;

  /** Estado actual (suavizado). */
  readonly focus = new Vector3(0, 0, 1);
  readonly ref = new Vector3(0, 1, 0);
  heading = 0;
  pitch = 58 * DEG;
  dist = CAMERA.homeDistance;
  lift = 0;

  /** Objetivos hacia los que converge el estado. */
  readonly goalFocus = new Vector3(0, 0, 1);
  goalHeading = 0;
  goalDist = CAMERA.homeDistance;
  goalLift = 0;
  /** Corrección manual de la inclinación en modo libre (rad). */
  tilt = 0;
  /** Inclinación pedida en modos de enfoque/seguimiento (rad). */
  goalPitch = 58 * DEG;

  /** Ejes continuos (teclado): −1…1. */
  readonly axes = { right: 0, forward: 0, orbit: 0, tilt: 0, zoom: 0 };

  /** Vectores derivados que otros sistemas consultan (sol, HUD, sonido…). */
  readonly forward = new Vector3();
  readonly right = new Vector3();
  readonly target = new Vector3();

  private target0: RigTarget | null = null;
  private flight: Flight | null = null;
  private shots: CameraShot[] = [];
  private shotHold = 0;
  private shotsDone?: () => void;
  private readonly velocity = { right: 0, forward: 0, active: false };
  private autoHeadingDrift = 0;
  private groundR = PLANET_RADIUS;
  private groundReady = false;
  private armLimit = Infinity;
  private avoidPitch = 0;
  private viewportH = 800;
  private aspect = 1.6;
  private maxDist = CAMERA.maxDistance;
  private minDist = CAMERA.minDistance;
  private lastNear = 0;

  constructor(
    readonly camera: PerspectiveCamera,
    private readonly env: RigEnvironment,
    readonly tuning: CameraTuning = CAMERA,
  ) {}

  /* ---------------- configuración ---------------- */

  setViewport(width: number, height: number): void {
    this.viewportH = Math.max(1, height);
    this.aspect = width / Math.max(1, height);
    const t = this.tuning;
    const k = clamp((1.25 - this.aspect) / 0.65, 0, 1);
    this.camera.fov = lerp(t.fov, t.fovPortrait, k);
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
    // Distancia a la que el planeta entero cabe en pantalla con margen.
    const vfov = this.camera.fov * DEG;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.aspect);
    const half = Math.min(vfov, hfov) / 2;
    this.maxDist = Math.min(t.maxDistance * 2.2, (PLANET_RADIUS + 9) / Math.sin(half * 0.84) - PLANET_RADIUS);
    this.goalDist = Math.min(this.goalDist, this.maxDist);
  }

  /** Coloca la cámara de golpe (sin transición). */
  jumpTo(dir: Vector3, distance: number, heading = 0, tiltDeg = 0): void {
    this.flight = null;
    this.focus.copy(dir).normalize();
    this.goalFocus.copy(this.focus);
    tangentFrame(this.focus, _v1, this.ref);
    this.heading = this.goalHeading = heading;
    this.dist = this.goalDist = clamp(distance, this.minDist, this.maxDist);
    this.tilt = tiltDeg * DEG;
    this.pitch = this.freePitch(this.dist);
    this.goalPitch = this.pitch;
    this.lift = this.goalLift = 0;
    this.groundReady = false;
    this.armLimit = Infinity;
    this.avoidPitch = 0;
    this.velocity.active = false;
  }

  get distanceLimits(): { min: number; max: number } {
    return { min: this.minDist, max: this.maxDist };
  }

  get isTransitioning(): boolean {
    return this.flight !== null;
  }

  get focusedUid(): string | null {
    return this.target0?.uid ?? null;
  }

  /* ---------------- entrada directa del jugador ---------------- */

  /** Cualquier gesto del jugador pasa por aquí: cancela vuelos libres y la rotación automática. */
  userInput(): boolean {
    if (this.mode === 'mission') return false;
    // Los vuelos de misión y los de enfoque no se interrumpen: son cortos y deben llegar.
    if (this.flight && (this.flight.locked || this.target0)) return false;
    if (this.flight) this.finishFlight(false);
    if (this.mode === 'auto') this.setMode('free');
    return true;
  }

  /** Arrastre para viajar: el suelo sigue al puntero. */
  travelPixels(dx: number, dy: number, dt: number): void {
    if (!this.userInput()) return;
    if (this.mode === 'focus' || this.mode === 'follow') {
      this.orbitPixels(dx, dy);
      return;
    }
    const upp = this.unitsPerPixel() * this.tuning.travelSensitivity;
    const fwdScale = 1 / Math.max(0.42, Math.sin(this.pitch));
    const r = -dx * upp;
    const f = dy * upp * fwdScale;
    this.shift(r, f);
    if (dt > 0) {
      const k = 0.55;
      this.velocity.right = lerp(this.velocity.right, r / dt, k);
      this.velocity.forward = lerp(this.velocity.forward, f / dt, k);
    }
    this.velocity.active = false;
  }

  /** Al soltar el arrastre, el planeta sigue girando con inercia. */
  releaseTravel(): void {
    if (this.mode !== 'free') return;
    const speed = Math.hypot(this.velocity.right, this.velocity.forward);
    this.velocity.active = speed > this.unitsPerPixel() * 40;
  }

  stopInertia(): void {
    this.velocity.active = false;
    this.velocity.right = this.velocity.forward = 0;
  }

  /** Orbitar: girar el rumbo y cambiar la inclinación. */
  orbitPixels(dx: number, dy: number): void {
    if (!this.userInput()) return;
    this.goalHeading -= dx * this.tuning.orbitSensitivity;
    this.addTilt(dy * this.tuning.tiltSensitivity);
  }

  /** Giro directo del rumbo (gesto de torsión con dos dedos). */
  rotateBy(angle: number): void {
    if (!this.userInput()) return;
    this.goalHeading += angle;
  }

  addTilt(delta: number): void {
    if (!this.userInput()) return;
    const t = this.tuning;
    if (this.mode === 'focus' || this.mode === 'follow') {
      this.goalPitch = clamp(this.goalPitch + delta, t.minPitch * DEG, 84 * DEG);
    } else {
      this.tilt = clamp(this.tilt + delta, -t.tiltRange * DEG, t.tiltRange * DEG);
    }
  }

  /** Desplazamiento en el plano de pantalla: lateral = viajar, vertical = subir/bajar la mira. */
  panPixels(dx: number, dy: number): void {
    if (!this.userInput()) return;
    const upp = this.unitsPerPixel();
    if (this.mode === 'free') this.shift(-dx * upp, 0);
    else this.goalHeading -= dx * this.tuning.orbitSensitivity * 0.5;
    const maxLift = this.target0 ? this.target0.lift + 6 : Math.max(2, this.dist * 0.35);
    this.goalLift = clamp(this.goalLift + dy * upp, 0, maxLift);
  }

  /**
   * Zoom progresivo. `factor` < 1 acerca, > 1 aleja. Si se indica `anchor` (el punto del
   * suelo bajo el cursor), al acercar la vista se desliza hacia él.
   */
  zoomBy(factor: number, anchor?: Vector3 | null): void {
    if (!this.userInput()) return;
    const before = this.goalDist;
    this.goalDist = clamp(this.goalDist * factor, this.minDist, this.maxDist);
    if (anchor && this.mode === 'free' && this.goalDist < before) {
      const k = (1 - this.goalDist / before) * 0.85;
      const ang = angleBetween(this.goalFocus, anchor);
      if (ang > 1e-4 && ang < 1.2) {
        _v1.crossVectors(this.goalFocus, anchor).normalize();
        this.goalFocus.applyQuaternion(_q.setFromAxisAngle(_v1, ang * k)).normalize();
      }
    }
  }

  /* ---------------- órdenes de alto nivel ---------------- */

  /** Vuela con suavidad hasta un punto del planeta (exploración libre). */
  flyTo(opts: FlyOptions, onArrive?: () => void): void {
    this.target0 = null;
    this.minDist = this.tuning.minDistance;
    if (this.mode !== 'mission') this.setMode('free');
    this.startFlight(opts, null, false, onArrive);
  }

  /** Enfoca un objeto: la cámara viaja hasta él y queda orbitándolo. */
  focusOn(target: RigTarget, follow = false): void {
    this.target0 = target;
    this.minDist = target.minDistance;
    this.setMode(follow ? 'follow' : 'focus');
    const dir = target.dir(new Vector3());
    this.startFlight(
      { dir, distance: clamp(target.distance, target.minDistance, target.maxDistance), heading: target.heading, lift: target.lift },
      target.pitch * DEG,
      false,
    );
  }

  /** Suelta el objeto enfocado y vuelve a la exploración libre sin moverse del sitio. */
  release(): void {
    if (this.mode === 'mission') return;
    this.target0 = null;
    this.minDist = this.tuning.minDistance;
    this.tilt = clamp(this.pitch - autoPitch(this.dist) * DEG, -this.tuning.tiltRange * DEG, this.tuning.tiltRange * DEG);
    this.goalLift = 0;
    this.setMode('free');
  }

  /** Rotación continua del planeta (vistas de fondo y portada). */
  startAuto(): void {
    this.target0 = null;
    this.flight = null;
    this.velocity.active = false;
    this.setMode('auto');
  }

  /** Reproduce una secuencia de planos. Preparado para las cámaras de misión. */
  playShots(shots: CameraShot[], onDone?: () => void): void {
    if (!shots.length) return;
    this.target0 = null;
    this.shots = shots.slice();
    this.shotsDone = onDone;
    this.shotHold = 0;
    this.setMode('mission');
    this.nextShot();
  }

  stopShots(): void {
    this.shots = [];
    this.flight = null;
    if (this.mode === 'mission') this.setMode('free');
  }

  private nextShot(): void {
    const shot = this.shots.shift();
    if (!shot) {
      const done = this.shotsDone;
      this.shotsDone = undefined;
      this.setMode('free');
      done?.();
      return;
    }
    this.startFlight(shot, null, true, () => {
      this.shotHold = shot.hold ?? 0;
      if (this.shotHold <= 0) this.nextShot();
    });
  }

  private setMode(mode: CameraMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.onModeChange?.(mode);
  }

  /* ---------------- vuelos ---------------- */

  private startFlight(opts: FlyOptions, toPitch: number | null, locked: boolean, onArrive?: () => void): void {
    const to = _v1.copy(opts.dir).normalize();
    const angle = angleBetween(this.focus, to);
    const axis = new Vector3().crossVectors(this.focus, to);
    if (axis.lengthSq() < 1e-10) {
      // Mismo punto o antípoda: cualquier eje perpendicular sirve.
      axis.crossVectors(this.focus, this.ref);
    }
    axis.normalize();
    const arc = angle * PLANET_RADIUS;
    const toDist = clamp(opts.distance ?? this.goalDist, this.minDist, this.maxDist);
    const far = Math.max(this.dist, toDist);
    const hop = arc > 24 ? clamp(arc * 0.75 - far * 0.5, 0, 110) : 0;
    const toHeading = opts.heading ?? this.goalHeading;
    this.flight = {
      fromFocus: this.focus.clone(),
      fromRef: this.ref.clone(),
      axis,
      angle,
      fromDist: this.dist,
      toDist,
      fromHeading: this.heading,
      toHeading: this.heading + angleDelta(this.heading, toHeading),
      fromPitch: this.pitch,
      toPitch,
      fromTilt: this.tilt,
      toTilt: opts.tilt !== undefined ? opts.tilt * DEG : toPitch === null ? this.tilt : 0,
      fromLift: this.lift,
      toLift: opts.lift ?? 0,
      hop,
      t: 0,
      duration: opts.duration ?? clamp(0.9 + arc / 55 + Math.abs(Math.log(toDist / this.dist)) * 0.35, 0.9, 3.4),
      locked,
      onArrive,
    };
    this.velocity.active = false;
  }

  private stepFlight(dt: number): void {
    const f = this.flight!;
    f.t = Math.min(1, f.t + dt / f.duration);
    const s = easeInOut(f.t);
    _q.setFromAxisAngle(f.axis, f.angle * s);
    this.focus.copy(f.fromFocus).applyQuaternion(_q).normalize();
    this.ref.copy(f.fromRef).applyQuaternion(_q);
    this.orthonormalize();
    const bump = Math.sin(Math.PI * s);
    this.dist = Math.exp(lerp(Math.log(f.fromDist), Math.log(f.toDist), s)) + f.hop * bump;
    this.heading = lerp(f.fromHeading, f.toHeading, s);
    this.tilt = lerp(f.fromTilt, f.toTilt, s);
    this.lift = lerp(f.fromLift, f.toLift, s);
    if (f.toPitch === null) {
      // Destino libre: la inclinación sigue al zoom (y a la parábola del salto).
      const want = this.freePitch(this.dist);
      this.pitch = lerp(f.fromPitch, want, Math.min(1, s * 2.2));
    } else {
      const high = f.hop > 0 ? autoPitch(this.dist) * DEG : f.toPitch;
      this.pitch = lerp(lerp(f.fromPitch, f.toPitch, s), high, f.hop > 0 ? bump * 0.8 : 0);
    }
    if (f.t >= 1) this.finishFlight(true);
  }

  private finishFlight(arrived: boolean): void {
    const f = this.flight;
    if (!f) return;
    this.flight = null;
    this.goalFocus.copy(this.focus);
    this.goalHeading = this.heading;
    this.goalDist = arrived ? f.toDist : this.dist;
    this.goalLift = arrived ? f.toLift : this.lift;
    if (f.toPitch !== null) this.goalPitch = arrived ? f.toPitch : this.pitch;
    if (arrived) f.onArrive?.();
  }

  /* ---------------- actualización por cuadro ---------------- */

  update(dt: number): void {
    const t = this.tuning;
    if (this.flight) {
      this.stepFlight(dt);
    } else {
      if (this.mode === 'mission' && this.shotHold > 0) {
        this.shotHold -= dt;
        if (this.shotHold <= 0) this.nextShot();
      }

      if ((this.mode === 'focus' || this.mode === 'follow') && this.target0) {
        this.target0.dir(this.goalFocus).normalize();
        this.goalDist = clamp(this.goalDist, this.target0.minDistance, this.target0.maxDistance);
      } else if (this.mode === 'auto') {
        const speed = t.autoSpin * DEG * PLANET_RADIUS;
        this.shift(speed * dt, 0);
        this.autoHeadingDrift += dt;
        this.goalHeading += Math.sin(this.autoHeadingDrift * 0.11) * 0.02 * dt;
      } else if (this.mode === 'free') {
        if (this.velocity.active) {
          this.shift(this.velocity.right * dt, this.velocity.forward * dt);
          const decay = Math.exp(-t.inertiaFriction * dt);
          this.velocity.right *= decay;
          this.velocity.forward *= decay;
          if (Math.hypot(this.velocity.right, this.velocity.forward) < this.unitsPerPixel() * 6) this.velocity.active = false;
        }
      }

      // Ejes continuos del teclado.
      const a = this.axes;
      if (a.right || a.forward || a.orbit || a.tilt || a.zoom) {
        if (this.userInput()) {
          if (this.mode === 'free' && (a.right || a.forward)) {
            const speed = Math.max(5, this.dist * t.keyTravel);
            this.shift(a.right * speed * dt, a.forward * speed * dt);
            this.velocity.active = false;
          } else if (a.right) {
            this.goalHeading += a.right * t.keyOrbit * dt;
          }
          if (a.orbit) this.goalHeading += a.orbit * t.keyOrbit * dt;
          if (a.tilt) this.addTilt(a.tilt * 0.9 * dt);
          if (a.zoom) this.goalDist = clamp(this.goalDist * Math.exp(a.zoom * t.keyZoom * dt), this.minDist, this.maxDist);
        }
      }

      // Convergencia suave hacia los objetivos.
      const k = 1 - Math.exp(-t.damping * dt);
      const ang = angleBetween(this.focus, this.goalFocus);
      if (ang > 1e-6) {
        _v1.crossVectors(this.focus, this.goalFocus);
        if (_v1.lengthSq() > 1e-12) {
          _q.setFromAxisAngle(_v1.normalize(), ang * (this.mode === 'free' || this.mode === 'auto' ? Math.min(1, k * 2.2) : k));
          this.focus.applyQuaternion(_q).normalize();
          this.ref.applyQuaternion(_q);
          this.orthonormalize();
        }
      }
      this.dist = Math.exp(damp(Math.log(this.dist), Math.log(this.goalDist), t.damping * 0.8, dt));
      this.heading += angleDelta(this.heading, this.goalHeading) * k;
      this.lift = damp(this.lift, this.goalLift, t.damping, dt);
      const wantPitch = this.mode === 'focus' || this.mode === 'follow' ? this.goalPitch : this.freePitch(this.dist);
      this.pitch = damp(this.pitch, wantPitch, t.damping * 1.3, dt);
    }
    this.place(dt);
  }

  private freePitch(dist: number): number {
    const t = this.tuning;
    // Lejos del planeta la corrección manual se desvanece para que quede centrado.
    const fade = 1 - clamp((dist - 110) / 70, 0, 1);
    return clamp(autoPitch(dist) * DEG + this.tilt * fade, t.minPitch * DEG, t.maxPitch * DEG);
  }

  private place(dt: number): void {
    const t = this.tuning;
    const up = this.focus;
    const ground = this.env.terrainRadius(up);
    if (!this.groundReady) {
      this.groundR = ground;
      this.groundReady = true;
    } else {
      this.groundR = damp(this.groundR, ground, 10, dt);
    }
    this.target.copy(up).multiplyScalar(this.groundR + this.lift);

    // Ejes locales: frente (rumbo) y derecha.
    const east = _v1.crossVectors(this.ref, up).normalize();
    this.forward.copy(this.ref).multiplyScalar(Math.cos(this.heading)).addScaledVector(east, Math.sin(this.heading)).normalize();
    this.right.crossVectors(this.forward, up).normalize();

    const pitch = clamp(this.pitch + this.avoidPitch, t.minPitch * DEG, t.maxPitch * DEG);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    // Dirección unitaria del "brazo" que va del objetivo a la cámara.
    const boom = _v2.copy(up).multiplyScalar(sp).addScaledVector(this.forward, -cp);
    const colliders = this.env.colliders();
    const focused = this.target0?.uid ?? null;

    // 1) Si un objeto tapa al objetivo, el brazo se acorta (se prueba el brazo completo para
    //    que la corrección no oscile).
    let limit = Infinity;
    for (const c of colliders) {
      if (c.uid === focused) continue;
      const ox = this.target.x - c.x;
      const oy = this.target.y - c.y;
      const oz = this.target.z - c.z;
      const cc = ox * ox + oy * oy + oz * oz - c.r * c.r;
      if (cc < 0) continue;
      const b = ox * boom.x + oy * boom.y + oz * boom.z;
      const disc = b * b - cc;
      if (disc <= 0) continue;
      const hit = -b - Math.sqrt(disc);
      if (hit > 0 && hit < this.dist) limit = Math.min(limit, Math.max(this.minDist * 0.6, hit - t.colliderMargin));
    }
    if (limit === Infinity) {
      this.armLimit = this.relaxArm(dt);
    } else {
      const current = this.armLimit === Infinity ? this.dist : this.armLimit;
      this.armLimit = damp(current, limit, limit < current ? 22 : 3.5, dt);
    }

    const arm = Math.min(this.dist, this.armLimit);
    const cam = this.camera.position;
    cam.copy(this.target).addScaledVector(boom, arm);

    // 2) Nunca por debajo del terreno.
    const camR = cam.length();
    _v3.copy(cam).divideScalar(camR || 1);
    const floor = this.env.terrainRadius(_v3) + t.groundClearance;
    if (camR < floor) cam.copy(_v3).multiplyScalar(floor);

    // 3) Nunca dentro de un objeto.
    for (const c of colliders) {
      const dx = cam.x - c.x;
      const dy = cam.y - c.y;
      const dz = cam.z - c.z;
      const reach = c.r + t.colliderMargin;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < reach * reach) {
        const d = Math.sqrt(d2) || 1e-4;
        const push = reach / d;
        cam.set(c.x + dx * push, c.y + dy * push, c.z + dz * push);
      }
    }

    // 4) Si el terreno tapa la línea de visión, la cámara se eleva.
    let blocked = false;
    let clear = true;
    for (let i = 1; i <= 5; i++) {
      const s = i / 6;
      _v3.copy(this.target).lerp(cam, s);
      const r = _v3.length();
      const g = this.env.terrainRadius(_v3.divideScalar(r || 1));
      if (r < g + 0.3) blocked = true;
      if (r < g + 1.3) clear = false;
    }
    if (blocked) this.avoidPitch = Math.min(46 * DEG, this.avoidPitch + 1.6 * dt);
    else if (clear) this.avoidPitch = Math.max(0, this.avoidPitch - 0.5 * dt);

    this.camera.up.copy(up).multiplyScalar(cp).addScaledVector(this.forward, sp).normalize();
    this.camera.lookAt(this.target);

    const near = clamp(arm * 0.03, 0.08, 4);
    if (Math.abs(near - this.lastNear) > this.lastNear * 0.2) {
      this.lastNear = near;
      this.camera.near = near;
      this.camera.far = 2200;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();
  }

  private relaxArm(dt: number): number {
    if (this.armLimit === Infinity) return Infinity;
    const next = damp(this.armLimit, this.dist * 1.02, 3.5, dt);
    return next >= this.dist ? Infinity : next;
  }

  /* ---------------- utilidades ---------------- */

  /** Mueve el foco objetivo sobre la superficie (derecha, frente) en unidades de mundo. */
  private shift(rightUnits: number, forwardUnits: number): void {
    const len = Math.hypot(rightUnits, forwardUnits);
    if (len < 1e-7) return;
    // Proyecta la dirección de viaje sobre el plano tangente del objetivo.
    _v1.copy(this.right).multiplyScalar(rightUnits / len).addScaledVector(this.forward, forwardUnits / len);
    _v1.addScaledVector(this.goalFocus, -_v1.dot(this.goalFocus));
    if (_v1.lengthSq() < 1e-10) return;
    _v2.crossVectors(this.goalFocus, _v1.normalize()).normalize();
    this.goalFocus.applyQuaternion(_q.setFromAxisAngle(_v2, len / this.groundR)).normalize();
  }

  private orthonormalize(): void {
    this.ref.addScaledVector(this.focus, -this.ref.dot(this.focus));
    if (this.ref.lengthSq() < 1e-10) tangentFrame(this.focus, _v3, this.ref);
    this.ref.normalize();
  }

  /** Unidades de mundo que abarca un pixel a la distancia del objetivo. */
  unitsPerPixel(): number {
    return (2 * Math.min(this.dist, this.armLimit) * Math.tan((this.camera.fov * DEG) / 2)) / this.viewportH;
  }

  /** Rumbo geográfico hacia el que mira la cámara (rad, horario desde el norte). */
  compass(): number {
    tangentFrame(this.focus, _v1, _v2);
    return Math.atan2(this.forward.dot(_v1), this.forward.dot(_v2));
  }

  /** Dirección tangente fija en el marco transportado (la usa el sol). */
  frameDirection(azimuth: number, out: Vector3): Vector3 {
    const east = _v1.crossVectors(this.ref, this.focus).normalize();
    return out.copy(this.ref).multiplyScalar(Math.cos(azimuth)).addScaledVector(east, Math.sin(azimuth)).normalize();
  }

  /** 0 = a ras de suelo, 1 = planeta entero. */
  zoomLevel(): number {
    return clamp(Math.log(this.dist / this.tuning.minDistance) / Math.log(this.maxDist / this.tuning.minDistance), 0, 1);
  }
}
