// Traduce ratón, pantalla táctil, lápiz y teclado a órdenes de la cámara.
//
//   Ratón ............ arrastrar = viajar · botón derecho / Ctrl / Alt + arrastrar = orbitar e inclinar
//                      Mayús o botón central + arrastrar = desplazar la mira · rueda = zoom hacia el cursor
//   Táctil ........... un dedo = viajar · pellizco = zoom · torsión = girar
//                      dos dedos en vertical = inclinar · dos dedos en horizontal = desplazar
//   Teclado .......... WASD / flechas = viajar · Q/E = girar · R/F = inclinar · +/− = zoom
//                      Inicio / H = volver a la colonia · Esc = soltar el objeto enfocado
//
// Solo escucha sobre el lienzo del mundo (y el teclado solo cuando se le indica), así que no
// interfiere con botones, formularios ni diálogos de la aplicación.

import type { Vector3 } from 'three';
import { angleDelta, clamp } from '../core/math';
import type { CameraRig } from './CameraRig';

export interface InputHost {
  rig: CameraRig;
  element: HTMLElement;
  /** Punto del planeta bajo una posición de pantalla (o null si es cielo). */
  groundAt(clientX: number, clientY: number): Vector3 | null;
  onTap(clientX: number, clientY: number): void;
  onDoubleTap(clientX: number, clientY: number): void;
  onHover(clientX: number, clientY: number): void;
  onHome(): void;
  onEscape(): void;
  /** Se llama con cualquier gesto real del jugador. */
  onActivity(): void;
}

interface Pointer {
  x: number;
  y: number;
  type: string;
}

type DragMode = 'travel' | 'orbit' | 'pan';

const KEY_AXES: Record<string, [keyof CameraRig['axes'], number]> = {
  KeyW: ['forward', 1],
  ArrowUp: ['forward', 1],
  KeyS: ['forward', -1],
  ArrowDown: ['forward', -1],
  KeyD: ['right', 1],
  ArrowRight: ['right', 1],
  KeyA: ['right', -1],
  ArrowLeft: ['right', -1],
  KeyE: ['orbit', 1],
  KeyQ: ['orbit', -1],
  KeyR: ['tilt', 1],
  KeyF: ['tilt', -1],
  Equal: ['zoom', -1],
  NumpadAdd: ['zoom', -1],
  PageUp: ['zoom', -1],
  Minus: ['zoom', 1],
  NumpadSubtract: ['zoom', 1],
  PageDown: ['zoom', 1],
};

export class InputController {
  enabled = true;
  keyboard = false;

  private readonly pointers = new Map<number, Pointer>();
  private mode: DragMode = 'travel';
  private moved = 0;
  private downAt = 0;
  private downX = 0;
  private downY = 0;
  private lastMove = 0;
  private lastTapAt = 0;
  private lastTapX = 0;
  private lastTapY = 0;
  private lastHover = 0;
  private multi = false;
  private readonly held = new Set<string>();
  private readonly off: (() => void)[] = [];

  constructor(private readonly host: InputHost) {
    const el = host.element;
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.off.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };
    on('pointerdown', this.onDown);
    on('pointermove', this.onMove);
    on('pointerup', this.onUp);
    on('pointercancel', this.onUp);
    on('lostpointercapture', this.onLost);
    on('wheel', this.onWheel, { passive: false });
    on('contextmenu', (e) => {
      if (this.enabled) e.preventDefault();
    });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clearKeys);
    this.off.push(() => {
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('keyup', this.onKeyUp);
      window.removeEventListener('blur', this.clearKeys);
    });
  }

  dispose(): void {
    for (const fn of this.off) fn();
    this.off.length = 0;
    this.clearKeys();
  }

  /* ---------------- punteros ---------------- */

  private onDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    const el = this.host.element;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* el puntero ya no existe */
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    this.host.rig.stopInertia();
    this.host.onActivity();
    if (this.pointers.size === 1) {
      this.mode = e.button === 2 || e.ctrlKey || e.altKey ? 'orbit' : e.button === 1 || e.shiftKey ? 'pan' : 'travel';
      this.moved = 0;
      this.multi = false;
      this.downAt = performance.now();
      this.downX = e.clientX;
      this.downY = e.clientY;
      this.lastMove = this.downAt;
    } else {
      this.multi = true;
    }
    if (e.pointerType === 'mouse' && e.button === 1) e.preventDefault();
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.enabled) return;
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      // Sin botones pulsados: solo resaltar lo que hay bajo el cursor.
      if (e.pointerType === 'mouse') {
        const now = performance.now();
        if (now - this.lastHover > 50) {
          this.lastHover = now;
          this.host.onHover(e.clientX, e.clientY);
        }
      }
      return;
    }
    const rig = this.host.rig;
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0.001, (now - this.lastMove) / 1000));

    if (this.pointers.size === 1) {
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      this.moved += Math.abs(dx) + Math.abs(dy);
      this.lastMove = now;
      if (this.moved < 4) return;
      if (this.mode === 'orbit') rig.orbitPixels(dx, dy);
      else if (this.mode === 'pan') rig.panPixels(dx, dy);
      else rig.travelPixels(dx, dy, dt);
      return;
    }

    // Dos dedos: zoom + giro + inclinación/desplazamiento, todo a la vez como en un mapa.
    const ids = [...this.pointers.keys()];
    const a = this.pointers.get(ids[0])!;
    const b = this.pointers.get(ids[1])!;
    const prevDist = Math.hypot(a.x - b.x, a.y - b.y);
    const prevAngle = Math.atan2(b.y - a.y, b.x - a.x);
    const prevCx = (a.x + b.x) / 2;
    const prevCy = (a.y + b.y) / 2;
    const dyOwn = e.clientY - p.y;
    const dxOwn = e.clientX - p.x;
    p.x = e.clientX;
    p.y = e.clientY;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    this.moved += Math.abs(dxOwn) + Math.abs(dyOwn);
    this.lastMove = now;

    if (prevDist > 8 && dist > 8) {
      const factor = Math.pow(prevDist / dist, rig.tuning.pinchZoom);
      if (Math.abs(factor - 1) > 0.0005) rig.zoomBy(clamp(factor, 0.8, 1.25), this.host.groundAt(cx, cy));
      const twist = angleDelta(prevAngle, angle);
      if (Math.abs(twist) > 0.0015) rig.rotateBy(-twist);
    }
    const mx = cx - prevCx;
    const my = cy - prevCy;
    const spread = Math.abs(dist - prevDist);
    if (Math.abs(my) > Math.abs(mx) * 1.4 && Math.abs(my) > spread) rig.addTilt(my * rig.tuning.tiltSensitivity * 1.6);
    else if (Math.abs(mx) + Math.abs(my) > 0.2) rig.travelPixels(mx, my, 0);
  };

  private onUp = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    try {
      this.host.element.releasePointerCapture(e.pointerId);
    } catch {
      /* ya liberado */
    }
    if (!this.enabled) return;
    if (this.pointers.size > 0) {
      // Queda un dedo: sigue viajando desde donde está, sin saltos.
      this.mode = 'travel';
      return;
    }
    const now = performance.now();
    const isTap = !this.multi && e.type === 'pointerup' && this.moved < 8 && now - this.downAt < 380 && Math.hypot(e.clientX - this.downX, e.clientY - this.downY) < 10;
    if (isTap) {
      const double = now - this.lastTapAt < 340 && Math.hypot(e.clientX - this.lastTapX, e.clientY - this.lastTapY) < 28;
      this.lastTapAt = double ? 0 : now;
      this.lastTapX = e.clientX;
      this.lastTapY = e.clientY;
      if (double) this.host.onDoubleTap(e.clientX, e.clientY);
      else this.host.onTap(e.clientX, e.clientY);
      return;
    }
    if (this.mode === 'travel' && !this.multi) {
      // Si el dedo se detuvo antes de soltar, no hay inercia.
      if (now - this.lastMove > 90) this.host.rig.stopInertia();
      else this.host.rig.releaseTravel();
    }
  };

  private onLost = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
  };

  private onWheel = (e: WheelEvent): void => {
    if (!this.enabled) return;
    e.preventDefault();
    this.host.onActivity();
    const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 300 : 1;
    const rig = this.host.rig;
    // Ctrl + rueda es el pellizco del trackpad: deltas pequeños y continuos.
    const k = e.ctrlKey ? 0.011 : 0.00113 * (rig.tuning.wheelZoom / 0.12);
    const factor = Math.exp(clamp(e.deltaY * unit, -400, 400) * k);
    rig.zoomBy(factor, this.host.groundAt(e.clientX, e.clientY));
  };

  /* ---------------- teclado ---------------- */

  private typing(e: KeyboardEvent): boolean {
    const el = e.target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.enabled || !this.keyboard || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || this.typing(e)) return;
    if (e.code === 'Escape') {
      this.host.onEscape();
      return;
    }
    if (e.code === 'Home' || e.code === 'KeyH') {
      this.host.onHome();
      e.preventDefault();
      return;
    }
    if (!(e.code in KEY_AXES)) return;
    e.preventDefault();
    if (!this.held.has(e.code)) {
      this.held.add(e.code);
      this.host.onActivity();
      this.applyKeys();
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (this.held.delete(e.code)) this.applyKeys();
  };

  private clearKeys = (): void => {
    this.held.clear();
    this.applyKeys();
  };

  private applyKeys(): void {
    const axes = this.host.rig.axes;
    axes.right = axes.forward = axes.orbit = axes.tilt = axes.zoom = 0;
    for (const code of this.held) {
      const [axis, value] = KEY_AXES[code];
      axes[axis] = clamp(axes[axis] + value, -1, 1);
    }
  }
}
