// Física del astronauta que controla el alumno: caminar, correr y saltar sobre un planeta
// diminuto con la gravedad de Marte (3.72 m/s², el 38 % de la terrestre: los saltos son
// altos y lentos). El movimiento es relativo a la cámara y la velocidad se "transporta"
// sobre la esfera, así que se puede dar la vuelta al planeta sin tropezar con los polos.

import { Quaternion, Vector3 } from 'three';
import type { RigCollider } from '../camera/CameraRig';
import { PLANET_RADIUS } from '../core/config';
import { angleDelta, clamp, tangentFrame, travel } from '../core/math';
import type { AnimName } from '../models/astronaut';
import { terrainRadius } from '../planet/heightfield';

export const PLAYER = {
  walk: 3.1,
  run: 6.0,
  accel: 11,
  airControl: 0.3,
  /** Gravedad de Marte (m/s²). */
  gravity: 3.72,
  /** Velocidad inicial del salto: ≈ 1.8 m de altura y casi 2 s en el aire. */
  jump: 3.7,
  radius: 0.4,
  height: 1.75,
  turn: 11,
} as const;

export interface MoveInput {
  /** Lateral (−1 izquierda … 1 derecha). */
  x: number;
  /** Adelante (−1 atrás … 1 adelante). */
  y: number;
  run: boolean;
}

export interface Sphere {
  x: number;
  y: number;
  z: number;
  r: number;
}

const _q = new Quaternion();
const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _d = new Vector3();
const _east = new Vector3();
const _north = new Vector3();

export class PlayerController {
  /** Dirección unitaria del punto del planeta donde está el jugador. */
  readonly dir = new Vector3();
  /** Velocidad tangente (unidades/s, en el mundo). */
  readonly vel = new Vector3();
  /** Hacia dónde mira el cuerpo (tangente unitaria). */
  readonly face = new Vector3();
  /** Pies del jugador en el mundo. */
  readonly feet = new Vector3();
  /** Altura sobre el terreno y velocidad vertical. */
  alt = 0;
  vy = 0;
  grounded = true;
  anim: AnimName = 'idle';
  /** Rapidez del paso para la animación (1 = caminar). */
  stride = 1;
  /** Gesto en curso (saludar, festejar…) y cuánto le queda. */
  private emote: AnimName | null = null;
  private emoteTime = 0;
  private jumpQueued = false;
  private lastGround = 0;
  /** Distancia recorrida (para estadísticas y sonidos de pasos). */
  travelled = 0;

  constructor(start: Vector3, heading: number) {
    this.dir.copy(start).normalize();
    tangentFrame(this.dir, _east, _north);
    this.face.copy(_north).multiplyScalar(Math.cos(heading)).addScaledVector(_east, Math.sin(heading)).normalize();
    this.lastGround = terrainRadius(this.dir);
    this.feet.copy(this.dir).multiplyScalar(this.lastGround);
  }

  /** Rumbo del cuerpo (rad, horario desde el norte local) para colocar el modelo. */
  get heading(): number {
    tangentFrame(this.dir, _east, _north);
    return Math.atan2(this.face.dot(_east), this.face.dot(_north));
  }

  get speed(): number {
    return this.vel.length();
  }

  jump(): void {
    this.jumpQueued = true;
  }

  playEmote(anim: AnimName, seconds = 2.6): void {
    this.emote = anim;
    this.emoteTime = seconds;
  }

  /** Mira hacia un punto del planeta (al interactuar con algo). */
  faceTowards(world: Vector3): void {
    _a.copy(world).addScaledVector(this.dir, -world.dot(this.dir));
    if (_a.lengthSq() > 1e-6) this.face.copy(_a.normalize());
  }

  /**
   * Un paso de simulación. `camForward`/`camRight` son tangentes del plano de la cámara.
   * En primera persona el cuerpo mira siempre hacia donde mira la cámara.
   */
  update(dt: number, input: MoveInput, camForward: Vector3, camRight: Vector3, firstPerson: boolean, colliders: readonly RigCollider[], characters: readonly Sphere[]): void {
    const up = this.dir;

    // 1) Velocidad deseada relativa a la cámara.
    const wish = _a.copy(camForward).multiplyScalar(input.y).addScaledVector(camRight, input.x);
    wish.addScaledVector(up, -wish.dot(up));
    let amount = Math.min(1, wish.length());
    if (amount < 0.08) amount = 0;
    if (amount > 0) wish.normalize();
    const top = input.run ? PLAYER.run : PLAYER.walk;
    const target = _b.copy(wish).multiplyScalar(top * amount);
    const k = 1 - Math.exp(-(this.grounded ? PLAYER.accel : PLAYER.accel * PLAYER.airControl) * dt);
    this.vel.lerp(target, k);
    this.vel.addScaledVector(up, -this.vel.dot(up));
    if (amount === 0 && this.grounded && this.vel.lengthSq() < 0.01) this.vel.set(0, 0, 0);

    // 2) Avanzar sobre la esfera y transportar los vectores tangentes.
    const speed = this.vel.length();
    if (speed > 1e-5) {
      const before = _c.copy(up);
      const r = this.lastGround + this.alt;
      travel(up, _d.copy(this.vel).divideScalar(speed), (speed * dt) / r, this.dir);
      _q.setFromUnitVectors(before, this.dir);
      this.vel.applyQuaternion(_q);
      this.face.applyQuaternion(_q);
      this.travelled += speed * dt;
    }

    // 3) Choques con edificios, máquinas y otros astronautas.
    this.collide(colliders, characters);

    // 4) Salto y gravedad marciana.
    const ground = terrainRadius(this.dir);
    if (this.grounded) {
      // Si el suelo baja de golpe (borde de una meseta o un cráter) se cae en vez de pegarse.
      const drop = this.lastGround - ground;
      if (drop > 0.35) {
        this.grounded = false;
        this.alt = drop;
        this.vy = 0;
      } else {
        this.alt = 0;
      }
    }
    if (this.jumpQueued) {
      this.jumpQueued = false;
      if (this.grounded) {
        this.grounded = false;
        this.vy = PLAYER.jump;
        this.emote = null;
      }
    }
    if (!this.grounded) {
      this.vy -= PLAYER.gravity * dt;
      this.alt += this.vy * dt;
      if (this.alt <= 0) {
        this.alt = 0;
        this.vy = 0;
        this.grounded = true;
      }
    }
    this.lastGround = ground;
    this.feet.copy(this.dir).multiplyScalar(ground + this.alt);

    // 5) Hacia dónde mira el cuerpo.
    this.face.addScaledVector(this.dir, -this.face.dot(this.dir)).normalize();
    if (firstPerson) {
      _a.copy(camForward).addScaledVector(this.dir, -camForward.dot(this.dir));
      if (_a.lengthSq() > 1e-6) this.face.copy(_a.normalize());
    } else if (speed > 0.4 && amount > 0) {
      const now = this.heading;
      tangentFrame(this.dir, _east, _north);
      const want = Math.atan2(this.vel.dot(_east), this.vel.dot(_north));
      const h = now + angleDelta(now, want) * (1 - Math.exp(-PLAYER.turn * dt));
      this.face.copy(_north).multiplyScalar(Math.cos(h)).addScaledVector(_east, Math.sin(h)).normalize();
    }

    // 6) Animación.
    if (this.emote) {
      this.emoteTime -= dt;
      if (this.emoteTime <= 0 || speed > 0.6 || !this.grounded) this.emote = null;
    }
    if (!this.grounded) {
      this.anim = 'jump';
      this.stride = 1;
    } else if (speed > PLAYER.walk + 0.6) {
      this.anim = 'run';
      this.stride = clamp(speed / PLAYER.run, 0.6, 1.3);
    } else if (speed > 0.3) {
      this.anim = 'walk';
      this.stride = clamp(speed / PLAYER.walk, 0.45, 1.4);
    } else {
      this.anim = this.emote ?? 'idle';
      this.stride = 1;
    }
  }

  /** Empuja al jugador fuera de los colisionadores (solo en horizontal, sin trepar). */
  private collide(colliders: readonly RigCollider[], characters: readonly Sphere[]): void {
    const up = this.dir;
    const g = terrainRadius(up);
    const bottom = PLAYER.radius + this.alt;
    const top = PLAYER.height - PLAYER.radius + this.alt;
    const push = _d.set(0, 0, 0);
    const center = _c;
    for (const s of colliders) {
      center.set(s.x, s.y, s.z);
      // Punto del eje del jugador más cercano al centro de la esfera.
      const h = clamp(center.dot(up) - g, bottom, top);
      _a.copy(up).multiplyScalar(g + h);
      _b.copy(_a).sub(center);
      const dist = _b.length();
      const reach = s.r + PLAYER.radius;
      if (dist >= reach || dist < 1e-6) continue;
      // Solo la parte horizontal del empuje.
      _b.addScaledVector(up, -_b.dot(up));
      const hl = _b.length();
      if (hl < 1e-5) continue;
      const vertical = Math.abs(center.dot(up) - (g + h));
      const need = Math.sqrt(Math.max(0, reach * reach - vertical * vertical)) - hl;
      if (need <= 0) continue;
      _b.divideScalar(hl);
      push.addScaledVector(_b, need);
      const into = this.vel.dot(_b);
      if (into < 0) this.vel.addScaledVector(_b, -into);
    }
    for (const s of characters) {
      _b.set(this.feet.x - s.x, this.feet.y - s.y, this.feet.z - s.z);
      _b.addScaledVector(up, -_b.dot(up));
      const hl = _b.length();
      const reach = s.r + PLAYER.radius;
      if (hl >= reach || hl < 1e-5) continue;
      // Empujón suave entre astronautas.
      push.addScaledVector(_b.divideScalar(hl), (reach - hl) * 0.5);
    }
    const len = push.length();
    if (len > 1e-5) travel(up, push.divideScalar(len), Math.min(len, 1.5) / PLANET_RADIUS, this.dir);
  }
}
