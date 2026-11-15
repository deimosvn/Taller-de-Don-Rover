// Catálogo de bloques del modo libre. Cada bloque tiene una textura de 16 × 16 pixeles
// pintada por código (sin archivos): nítida de cerca y ligera para cualquier celular.

import { CanvasTexture, NearestFilter, SRGBColorSpace } from 'three';
import { seeded } from '../core/math';

export type BlockId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface BlockDef {
  id: BlockId;
  key: string;
  name: string;
  emoji: string;
  /** Color representativo (interfaz y partículas). */
  color: string;
  /** Segundos que tarda en minarse. */
  hardness: number;
  /** Brilla por sí mismo (0 = no). */
  glow: number;
  roughness: number;
  metalness: number;
  transparent?: boolean;
  /** Dónde se consigue. */
  source: string;
}

export const BLOCKS: Record<BlockId, BlockDef> = {
  1: { id: 1, key: 'regolito', name: 'Regolito', emoji: '🟧', color: '#DB6A3C', hardness: 0.45, glow: 0, roughness: 1, metalness: 0, source: 'Mina el suelo de Marte' },
  2: { id: 2, key: 'basalto', name: 'Basalto', emoji: '🪨', color: '#7A4A45', hardness: 0.9, glow: 0, roughness: 0.95, metalness: 0, source: 'Rocas oscuras de la superficie' },
  3: { id: 3, key: 'hielo', name: 'Hielo', emoji: '🧊', color: '#A9E4F2', hardness: 0.6, glow: 0.05, roughness: 0.25, metalness: 0, source: 'Depósitos celestes y polos' },
  4: { id: 4, key: 'hierro', name: 'Hematita', emoji: '🔩', color: '#5C6FA8', hardness: 1.1, glow: 0, roughness: 0.8, metalness: 0.2, source: 'Vetas azuladas entre las rocas' },
  5: { id: 5, key: 'cristal', name: 'Cristal', emoji: '💎', color: '#B69CFF', hardness: 1.0, glow: 0.9, roughness: 0.3, metalness: 0, source: 'Brilla de noche, lejos de la colonia' },
  6: { id: 6, key: 'ladrillo', name: 'Ladrillo', emoji: '🧱', color: '#E08A55', hardness: 0.7, glow: 0, roughness: 0.9, metalness: 0, source: 'Impresora 3D: regolito' },
  7: { id: 7, key: 'vidrio', name: 'Vidrio', emoji: '🪟', color: '#CFF3FA', hardness: 0.35, glow: 0, roughness: 0.08, metalness: 0, transparent: true, source: 'Impresora 3D: regolito + hielo' },
  8: { id: 8, key: 'metal', name: 'Panel', emoji: '⬜', color: '#DADDEA', hardness: 1.0, glow: 0, roughness: 0.4, metalness: 0.55, source: 'Impresora 3D: hematita + basalto' },
  9: { id: 9, key: 'lampara', name: 'Lámpara', emoji: '💡', color: '#FFD86B', hardness: 0.4, glow: 1.6, roughness: 0.5, metalness: 0, source: 'Impresora 3D: cristal + panel' },
  10: { id: 10, key: 'cultivo', name: 'Cultivo', emoji: '🌱', color: '#55DB7A', hardness: 0.35, glow: 0.08, roughness: 0.9, metalness: 0, source: 'Impresora 3D: regolito + hielo' },
};

export const BLOCK_ORDER: BlockId[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export const isBlockId = (n: unknown): n is BlockId => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 10;

export interface Recipe {
  out: BlockId;
  count: number;
  needs: [BlockId, number][];
}

/** Recetas de la impresora 3D (ISRU: fabricar con lo que hay en Marte). */
export const RECIPES: Recipe[] = [
  { out: 6, count: 2, needs: [[1, 2]] },
  { out: 7, count: 2, needs: [[1, 2], [3, 1]] },
  { out: 8, count: 2, needs: [[4, 2], [2, 1]] },
  { out: 9, count: 1, needs: [[5, 1], [8, 1]] },
  { out: 10, count: 1, needs: [[1, 1], [3, 1]] },
];

/* ---------------- texturas ---------------- */

type Px = (x: number, y: number, color: string) => void;

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * k)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function noisy(px: Px, rnd: () => number, base: string, spread: number, dots: [string, number][] = []) {
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      px(x, y, shade(base, 1 - spread / 2 + rnd() * spread));
      for (const [c, p] of dots) if (rnd() < p) px(x, y, c);
    }
}

const PAINTERS: Record<BlockId, (px: Px, rnd: () => number, ctx: CanvasRenderingContext2D) => void> = {
  1: (px, rnd) => noisy(px, rnd, '#DB6A3C', 0.22, [['#F3935C', 0.07], ['#BC5230', 0.06]]),
  2: (px, rnd) => noisy(px, rnd, '#7A4A45', 0.26, [['#5A3331', 0.1], ['#9A6464', 0.06]]),
  3: (px, rnd) => {
    noisy(px, rnd, '#A9E4F2', 0.1, [['#EAFBFF', 0.08]]);
    for (let i = 0; i < 16; i++) if (i % 5 !== 4) px(i, (i * 3 + 2) % 16, '#DDF7FC');
  },
  4: (px, rnd) => noisy(px, rnd, '#8A5A52', 0.2, [['#5C6FA8', 0.2], ['#8FA2DC', 0.06]]),
  5: (px, rnd) => {
    noisy(px, rnd, '#8E6FE6', 0.2, [['#D9CBFF', 0.1]]);
    for (let i = 2; i < 14; i++) {
      px(i, 15 - i, '#EDE5FF');
      if (i % 3 === 0) px(i, i, '#B69CFF');
    }
  },
  6: (px, rnd) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const row = Math.floor(y / 4);
        const mortar = y % 4 === 3 || (x + (row % 2) * 4) % 8 === 7;
        px(x, y, mortar ? '#F6D2B0' : shade('#D9773F', 0.9 + rnd() * 0.2));
      }
  },
  7: (px, _rnd, ctx) => {
    ctx.clearRect(0, 0, 16, 16);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const edge = x === 0 || y === 0 || x === 15 || y === 15;
        px(x, y, edge ? 'rgba(255,255,255,0.95)' : 'rgba(190,236,246,0.26)');
      }
    for (let i = 3; i < 8; i++) px(i, 10 - i, 'rgba(255,255,255,0.85)');
    px(10, 11, 'rgba(255,255,255,0.7)');
    px(11, 10, 'rgba(255,255,255,0.7)');
  },
  8: (px, rnd) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const edge = x === 0 || y === 0 || x === 15 || y === 15;
        px(x, y, edge ? '#A9AEC6' : shade('#DADDEA', 0.96 + rnd() * 0.06));
      }
    for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) px(x, y, '#8D93B0');
    for (let x = 4; x < 12; x++) px(x, 8, '#BFC4D8');
  },
  9: (px) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const edge = x === 0 || y === 0 || x === 15 || y === 15;
        const d = Math.hypot(x - 7.5, y - 7.5);
        px(x, y, edge ? '#8D93B0' : d < 3.5 ? '#FFFBE6' : d < 6 ? '#FFE48A' : '#FFC93C');
      }
  },
  10: (px, rnd) => {
    noisy(px, rnd, '#3FAE5F', 0.3, [['#7BEA98', 0.14], ['#2B8747', 0.1]]);
    for (const [x, y] of [[3, 4], [11, 3], [7, 9], [12, 12], [4, 12]]) px(x, y, '#FFE48A');
  },
};

/** Textura pixelada de un bloque. */
export function blockTexture(id: BlockId): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  const px: Px = (x, y, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 1, 1);
  };
  PAINTERS[id](px, seeded(id * 977 + 13), ctx);
  const tex = new CanvasTexture(canvas);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

const iconCache = new Map<BlockId, string>();

/** La misma textura como imagen para la interfaz (barra de bloques). */
export function blockIcon(id: BlockId): string {
  let url = iconCache.get(id);
  if (!url) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    const px: Px = (x, y, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    };
    PAINTERS[id](px, seeded(id * 977 + 13), ctx);
    url = canvas.toDataURL();
    iconCache.set(id, url);
  }
  return url;
}
