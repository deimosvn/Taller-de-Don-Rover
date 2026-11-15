// Visión artificial local (TensorFlow.js + COCO-SSD). Corre en el navegador del profesor:
// la foto nunca sale del dispositivo. Se descarga solo cuando se abre el escáner y la PWA
// la guarda para poder escanear sin internet.

import type { CategoryId } from '../../shared/types';

export interface Prediction {
  bbox: [number, number, number, number];
  class: string;
  score: number;
}

interface Detector {
  detect(img: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement, maxNumBoxes?: number, minScore?: number): Promise<Prediction[]>;
}

let loading: Promise<Detector> | null = null;

export function loadDetector(): Promise<Detector> {
  if (!loading) {
    loading = (async () => {
      const tf = await import('@tensorflow/tfjs');
      await tf.ready();
      const coco = await import('@tensorflow-models/coco-ssd');
      return (await coco.load({ base: 'lite_mobilenet_v2' })) as unknown as Detector;
    })().catch((e) => {
      loading = null;
      throw e;
    });
  }
  return loading;
}

/** Objetos de COCO que el juego sabe convertir en misiones. */
export const COCO_MAP: Record<string, [CategoryId, string]> = {
  'potted plant': ['plant', 'Planta en maceta'],
  broccoli: ['plant', 'Brócoli'],
  carrot: ['plant', 'Zanahoria'],
  apple: ['plant', 'Manzana'],
  orange: ['plant', 'Naranja'],
  banana: ['plant', 'Plátano'],
  bottle: ['water', 'Botella'],
  cup: ['water', 'Vaso'],
  'wine glass': ['water', 'Copa'],
  bowl: ['water', 'Recipiente'],
  vase: ['water', 'Florero'],
  sink: ['water', 'Lavabo'],
  'cell phone': ['signal', 'Celular'],
  laptop: ['signal', 'Laptop'],
  tv: ['signal', 'Pantalla'],
  remote: ['signal', 'Control remoto'],
  keyboard: ['signal', 'Teclado'],
  mouse: ['signal', 'Mouse'],
  book: ['material', 'Libro'],
  backpack: ['material', 'Mochila'],
  scissors: ['material', 'Tijeras'],
  handbag: ['material', 'Bolsa'],
  suitcase: ['material', 'Maleta'],
  umbrella: ['material', 'Paraguas'],
  'teddy bear': ['material', 'Peluche'],
  'sports ball': ['material', 'Pelota'],
  clock: ['material', 'Reloj'],
  chair: ['material', 'Silla'],
};

export function labelFor(cls: string): string {
  return COCO_MAP[cls]?.[1] ?? (cls === 'person' ? 'Tripulante' : cls);
}

/** Fracción de píxeles muy brillantes: una lámpara o ventana satura la cámara. */
export function brightFraction(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0;
  const w = 96;
  const h = Math.max(1, Math.round((canvas.height / canvas.width) * w));
  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  const t = tmp.getContext('2d')!;
  t.drawImage(canvas, 0, 0, w, h);
  const data = t.getImageData(0, 0, w, h).data;
  let bright = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    if (lum > 242) bright++;
  }
  return bright / (w * h);
}

export function categorize(preds: Prediction[], bright: number): { category: CategoryId; label: string; confidence: number } | null {
  const useful = preds.filter((p) => COCO_MAP[p.class]).sort((a, b) => b.score - a.score);
  const top = useful[0];
  if (top && top.score >= 0.45) {
    const [category, label] = COCO_MAP[top.class];
    return { category, label, confidence: top.score };
  }
  if (bright > 0.07) return { category: 'light', label: 'Fuente de luz', confidence: Math.min(0.9, 0.5 + bright * 2) };
  if (top) {
    const [category, label] = COCO_MAP[top.class];
    return { category, label, confidence: top.score };
  }
  return null;
}
