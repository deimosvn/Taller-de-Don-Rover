// Utilidades compartidas por los modelos 3D: tonos, cúpulas geodésicas, etiquetas con nombre
// y piezas de "estado" (baliza de salud, humo) que reaccionan a la salud de cada sector.

import {
  CanvasTexture,
  Group,
  IcosahedronGeometry,
  Mesh,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Material,
} from 'three';
import { Sculpt, type MaterialKit, type Vec3 } from './sculpt';

export const INK = '#211A4A';
export const WHITE = '#F4F5FB';
export const PANEL = '#E7E9F4';
export const STEEL = '#C9CCE0';
export const DARK = '#2B2552';
export const CONCRETE = '#EBD9C7';

/** Aclara (amt > 0) u oscurece (amt < 0) un color hexadecimal. */
export function shade(hex: string, amt: number): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  const ch = (v: number) => Math.round((t - v) * p + v);
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Color de la baliza según la salud del sector. */
export function healthColor(health: number): string {
  return health >= 60 ? '#55DB7A' : health >= 35 ? '#FFC93C' : '#FF6B5B';
}

/**
 * Armazón geodésico: barras finas sobre las aristas de un icosaedro, solo en el hemisferio
 * superior. Da a las cúpulas el aspecto de las cúpulas del mapa 2D y de la portada.
 */
export function geodesicStruts(s: Sculpt, radius: number, color: string, opts: { at?: Vec3; thickness?: number; detail?: number; squash?: number } = {}): void {
  const at = opts.at ?? [0, 0, 0];
  const squash = opts.squash ?? 1;
  const geo = new IcosahedronGeometry(radius, s.detail ? (opts.detail ?? 1) : 0);
  const pos = geo.getAttribute('position');
  const seen = new Set<string>();
  const a = new Vector3();
  const b = new Vector3();
  const key = (v: Vector3) => `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
  for (let i = 0; i < pos.count; i += 3) {
    for (let e = 0; e < 3; e++) {
      a.fromBufferAttribute(pos, i + e);
      b.fromBufferAttribute(pos, i + ((e + 1) % 3));
      if (a.y < -0.02 * radius && b.y < -0.02 * radius) continue;
      const ka = key(a);
      const kb = key(b);
      const k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const p0: Vec3 = [at[0] + a.x, at[1] + Math.max(0, a.y) * squash, at[2] + a.z];
      const p1: Vec3 = [at[0] + b.x, at[1] + Math.max(0, b.y) * squash, at[2] + b.z];
      s.tube([p0, p1], opts.thickness ?? radius * 0.016, color, { rough: 0.45, metal: 0.25 });
    }
  }
  geo.dispose();
}

/* ------------------------------------------------------------------ */
/* Etiquetas con nombre (sprites que siempre miran a la cámara)         */
/* ------------------------------------------------------------------ */

const labelCache = new Map<string, CanvasTexture>();

export interface LabelOptions {
  bg?: string;
  fg?: string;
  border?: string;
  /** Altura del sprite en unidades de mundo. */
  height?: number;
}

export function labelSprite(text: string, o: LabelOptions = {}): Sprite {
  const bg = o.bg ?? '#FFF8EC';
  const fg = o.fg ?? INK;
  const border = o.border ?? INK;
  const key = `${text}|${bg}|${fg}|${border}`;
  let tex = labelCache.get(key);
  const font = '700 54px "Fredoka Variable", "Fredoka", "Nunito Variable", system-ui, sans-serif';
  let aspect = 3;
  if (!tex) {
    const measure = document.createElement('canvas').getContext('2d')!;
    measure.font = font;
    const w = Math.ceil(Math.min(900, measure.measureText(text).width + 70));
    const h = 92;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d')!;
    const r = 40;
    g.beginPath();
    g.moveTo(r + 4, 4);
    g.arcTo(w - 4, 4, w - 4, h - 4, r);
    g.arcTo(w - 4, h - 4, 4, h - 4, r);
    g.arcTo(4, h - 4, 4, 4, r);
    g.arcTo(4, 4, w - 4, 4, r);
    g.closePath();
    g.fillStyle = bg;
    g.fill();
    g.lineWidth = 7;
    g.strokeStyle = border;
    g.stroke();
    g.font = font;
    g.fillStyle = fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 3);
    tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    tex.userData.aspect = w / h;
    labelCache.set(key, tex);
  }
  aspect = (tex.userData.aspect as number) ?? aspect;
  const mat = new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, fog: false });
  const sprite = new Sprite(mat);
  const hgt = o.height ?? 0.42;
  sprite.scale.set(hgt * aspect, hgt, 1);
  sprite.renderOrder = 10;
  sprite.name = `label:${text}`;
  return sprite;
}

/* ------------------------------------------------------------------ */
/* Humo y chispas para los sectores dañados                             */
/* ------------------------------------------------------------------ */

export class SmokeColumn {
  readonly group = new Group();
  private readonly puffs: Mesh[] = [];

  constructor(kit: MaterialKit, at: Vec3, count = 5) {
    this.group.name = 'fx:smoke';
    this.group.position.set(...at);
    const mat: Material = kit.light('#5B5470', 0.42);
    for (let i = 0; i < count; i++) {
      const s = new Sculpt(1);
      s.sphere(0.32, '#5B5470');
      const m = s.mesh(mat, `smoke:${i}`, false)!;
      m.userData.offset = i / count;
      this.puffs.push(m);
      this.group.add(m);
    }
    this.group.visible = false;
  }

  update(time: number): void {
    if (!this.group.visible) return;
    for (const p of this.puffs) {
      const k = (time * 0.32 + (p.userData.offset as number)) % 1;
      p.position.set(Math.sin(k * 6 + (p.userData.offset as number) * 9) * 0.35 * k, k * 3.2, Math.cos(k * 5) * 0.25 * k);
      p.scale.setScalar(0.5 + k * 1.6);
      (p.material as { opacity: number }).opacity = 0.42;
      p.visible = k < 0.96;
    }
  }
}
