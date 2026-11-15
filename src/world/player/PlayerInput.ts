// Controles del astronauta del jugador.
//
//   Teclado ........ WASD / flechas = caminar · Mayús = correr · Espacio = saltar
//                    V = cambiar primera/tercera persona · E = interactuar · 1–4 = gestos
//   Ratón .......... arrastrar = mirar · rueda = acercar/alejar (y entrar al casco)
//                    en primera persona, un clic captura el ratón para mirar libremente
//   Táctil ......... arrastrar en el lienzo = mirar · pellizco = acercar/alejar
//                    (el joystick y los botones los dibuja la interfaz y escriben en `stick`)

import { clamp } from '../core/math';
import type { AnimName } from '../models/astronaut';
import type { MoveInput } from './PlayerController';

export interface PlayerInputHost {
  element: HTMLElement;
  look(yaw: number, pitch: number): void;
  zoom(factor: number): void;
  jump(): void;
  toggleView(): void;
  interact(): void;
  emote(anim: AnimName): void;
  firstPerson(): boolean;
  /** Avisa de actividad real del jugador. */
  activity(): void;
  /** ¿Está activo el modo de minar y construir? */
  building?(): boolean;
  /** Acción sobre el mundo: primaria = minar, secundaria = construir. */
  action?(kind: 'primary' | 'secondary', phase: 'down' | 'up' | 'tap', x: number, y: number): void;
  /** El ratón pasa por encima (para resaltar el bloque apuntado). */
  hover?(x: number, y: number): void;
  /** Elegir una casilla de la barra de bloques (0–9). */
  slot?(index: number): void;
}

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
};

const EMOTE_KEYS: Record<string, AnimName> = {
  Digit1: 'wave',
  Digit2: 'cheer',
  Digit3: 'scan',
  Digit4: 'point',
};

interface Drag {
  x: number;
  y: number;
  moved: number;
  button: number;
  at: number;
}

export class PlayerInput {
  enabled = false;
  keyboard = true;
  /** Joystick táctil (lo escribe la interfaz): −1…1. */
  readonly stick = { x: 0, y: 0 };
  /** Botón de correr de la interfaz táctil. */
  runHeld = false;
  /** Segundos desde que el jugador movió la cámara por última vez. */
  sinceLook = 99;

  private readonly keys = new Set<string>();
  private readonly drags = new Map<number, Drag>();
  private pinch = 0;
  private readonly off: (() => void)[] = [];
  private readonly out: MoveInput = { x: 0, y: 0, run: false };

  constructor(private readonly host: PlayerInputHost) {
    const el = host.element;
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.off.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };
    on('pointerdown', this.onDown);
    on('pointermove', this.onMove);
    on('pointerup', this.onUp);
    on('pointercancel', this.onUp);
    on('lostpointercapture', (e) => this.drags.delete(e.pointerId));
    on('wheel', this.onWheel, { passive: false });
    on('contextmenu', (e) => {
      if (this.enabled) e.preventDefault();
    });
    const win = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void) => {
      window.addEventListener(type, fn as EventListener);
      this.off.push(() => window.removeEventListener(type, fn as EventListener));
    };
    win('keydown', this.onKeyDown);
    win('keyup', this.onKeyUp);
    win('blur', this.clear);
    const doc = (fn: () => void) => {
      document.addEventListener('pointerlockchange', fn);
      this.off.push(() => document.removeEventListener('pointerlockchange', fn));
    };
    doc(() => {
      if (document.pointerLockElement !== el) this.locked = false;
    });
    on('mousemove', (e) => {
      if (!this.enabled || !this.locked) return;
      this.look(e.movementX * 0.0024, -e.movementY * 0.0024);
    });
  }

  private locked = false;

  dispose(): void {
    for (const fn of this.off) fn();
    this.off.length = 0;
    this.clear();
    this.releaseLock();
  }

  /** Lectura del movimiento combinado (teclado + joystick). */
  read(dt: number): MoveInput {
    this.sinceLook += dt;
    let x = this.stick.x;
    let y = this.stick.y;
    if (this.keyboard) {
      for (const code of this.keys) {
        const k = MOVE_KEYS[code];
        if (k) {
          x += k[0];
          y += k[1];
        }
      }
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    const stickLen = Math.hypot(this.stick.x, this.stick.y);
    this.out.x = x;
    this.out.y = y;
    this.out.run = this.runHeld || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || stickLen > 0.95;
    return this.out;
  }

  releaseLock(): void {
    if (this.locked && document.pointerLockElement) document.exitPointerLock?.();
    this.locked = false;
  }

  private look(yaw: number, pitch: number): void {
    this.sinceLook = 0;
    this.host.look(yaw, pitch);
  }

  /* ---------------- punteros ---------------- */

  private onDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    this.host.activity();
    try {
      this.host.element.setPointerCapture(e.pointerId);
    } catch {
      /* el puntero ya no existe */
    }
    this.drags.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: 0, button: e.button, at: performance.now() });
    // Con el ratón capturado, los botones minan (izq.) y construyen (der.) al instante.
    if (this.locked && this.host.building?.()) this.host.action?.(e.button === 2 ? 'secondary' : 'primary', 'down', e.clientX, e.clientY);
    if (this.drags.size === 2) {
      const [a, b] = [...this.drags.values()];
      this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
    }
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.enabled) return;
    const d = this.drags.get(e.pointerId);
    if (!d) {
      if (e.pointerType === 'mouse' && !this.locked) this.host.hover?.(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    d.moved += Math.abs(dx) + Math.abs(dy);
    if (this.drags.size >= 2) {
      const [a, b] = [...this.drags.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinch > 8 && dist > 8) this.host.zoom(clamp(this.pinch / dist, 0.85, 1.18));
      this.pinch = dist;
      return;
    }
    if (this.locked) return;
    const sens = e.pointerType === 'touch' ? 0.0062 : 0.0046;
    this.look(dx * sens, -dy * sens);
  };

  private onUp = (e: PointerEvent): void => {
    const d = this.drags.get(e.pointerId);
    if (!d) return;
    this.drags.delete(e.pointerId);
    try {
      this.host.element.releasePointerCapture(e.pointerId);
    } catch {
      /* ya liberado */
    }
    const building = this.enabled && e.type === 'pointerup' && Boolean(this.host.building?.());
    if (building && this.locked) {
      this.host.action?.(d.button === 2 ? 'secondary' : 'primary', 'up', e.clientX, e.clientY);
      return;
    }
    const tap = d.moved < (e.pointerType === 'touch' ? 14 : 6) && performance.now() - d.at < 450 && this.drags.size === 0;
    const lockable = e.pointerType === 'mouse' && this.host.firstPerson() && !this.locked;
    if (building && tap && !lockable) {
      this.host.action?.(d.button === 2 ? 'secondary' : 'primary', 'tap', e.clientX, e.clientY);
      return;
    }
    // Un clic de ratón sin arrastrar, en primera persona, captura el ratón para mirar.
    if (this.enabled && e.type === 'pointerup' && e.pointerType === 'mouse' && d.moved < 4 && this.host.firstPerson() && !this.locked) {
      const el = this.host.element as HTMLElement & { requestPointerLock?: () => Promise<void> | void };
      try {
        const r = el.requestPointerLock?.();
        if (r && typeof (r as Promise<void>).then === 'function') (r as Promise<void>).then(() => (this.locked = true)).catch(() => (this.locked = false));
        else this.locked = true;
      } catch {
        this.locked = false;
      }
    }
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.enabled) return;
    e.preventDefault();
    this.host.activity();
    const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 300 : 1;
    this.host.zoom(Math.exp(clamp(e.deltaY * unit, -300, 300) * 0.0016));
  };

  /* ---------------- teclado ---------------- */

  private typing(e: KeyboardEvent): boolean {
    const el = e.target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.enabled || !this.keyboard || e.ctrlKey || e.metaKey || e.altKey || this.typing(e)) return;
    const code = e.code;
    if (code in MOVE_KEYS || code === 'ShiftLeft' || code === 'ShiftRight') {
      e.preventDefault();
      if (!this.keys.has(code)) this.host.activity();
      this.keys.add(code);
      return;
    }
    if (e.repeat) return;
    if (code === 'Space') {
      e.preventDefault();
      this.host.jump();
    } else if (code === 'KeyV' || (code === 'KeyC' && !this.host.building?.())) {
      this.host.toggleView();
    } else if (this.host.building?.() && /^Digit\d$/.test(code)) {
      this.host.slot?.((Number(code.slice(5)) + 9) % 10);
    } else if (code === 'KeyE' || code === 'Enter') {
      e.preventDefault();
      this.host.interact();
    } else if (code in EMOTE_KEYS) {
      this.host.emote(EMOTE_KEYS[code]);
    } else return;
    this.host.activity();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private clear = (): void => {
    this.keys.clear();
    this.drags.clear();
    this.stick.x = this.stick.y = 0;
    this.runHeld = false;
  };
}
