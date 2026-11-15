// Parámetros globales del mundo 3D de MARS-01. Todo lo ajustable vive aquí para que las
// futuras misiones y pantallas no tengan números mágicos repartidos por el código.

/** Radio del planeta en unidades de mundo (1 u ≈ 1 m a escala de juguete: un astronauta mide 1.7 u). */
export const PLANET_RADIUS = 60;

/** Ubicación del centro de mando (hub) de la colonia sobre el planeta. */
export const HUB_LATLON = { lat: 14, lon: 0 };

/** Distribución de la colonia medida en unidades sobre la superficie desde el hub. */
export const COLONY = {
  /** Anillo de los ocho sectores. */
  sectorRing: 22,
  /** Anillo exterior de los edificios que se desbloquean. */
  outerRing: 35,
  /** Recorrido del rover alrededor de la colonia. */
  roverLoop: 28.5,
  /** Hasta aquí el terreno está nivelado para apoyar edificios. */
  flatRadius: 42,
  /** A partir de aquí el terreno vuelve a ser completamente natural. */
  fadeRadius: 51,
} as const;

/* ------------------------------------------------------------------ */
/* Cámara                                                               */
/* ------------------------------------------------------------------ */

export interface CameraTuning {
  /** Campo de visión vertical en horizontal (grados). */
  fov: number;
  /** Campo de visión vertical en pantallas verticales (grados). */
  fovPortrait: number;
  /** Distancia mínima al objetivo en exploración libre. */
  minDistance: number;
  /** Distancia a la que la cámara ya ve el planeta entero (se recalcula según la pantalla). */
  maxDistance: number;
  /** Distancia inicial de la vista general de la colonia. */
  homeDistance: number;
  /** Sensibilidad del arrastre para viajar (1 = el suelo sigue al dedo). */
  travelSensitivity: number;
  /** Radianes de giro por pixel al orbitar. */
  orbitSensitivity: number;
  /** Radianes de inclinación por pixel. */
  tiltSensitivity: number;
  /** Factor de zoom por "clic" de rueda (0.1 = 10 %). */
  wheelZoom: number;
  /** Multiplicador del gesto de pellizco. */
  pinchZoom: number;
  /** Velocidad de viaje con teclado (fracción de la distancia de cámara por segundo). */
  keyTravel: number;
  /** Velocidad de giro con teclado (rad/s). */
  keyOrbit: number;
  /** Velocidad de zoom con teclado (factor por segundo). */
  keyZoom: number;
  /** Suavizado (mayor = responde más rápido). */
  damping: number;
  /** Fricción de la inercia tras soltar (mayor = se detiene antes). */
  inertiaFriction: number;
  /** Altura mínima de la cámara sobre el terreno. */
  groundClearance: number;
  /** Margen con el que la cámara rodea los colisionadores. */
  colliderMargin: number;
  /** Límites de inclinación (grados sobre el horizonte local). */
  minPitch: number;
  maxPitch: number;
  /** Cuánto puede corregir el usuario la inclinación automática (grados). */
  tiltRange: number;
  /** Velocidad angular de la rotación continua en modo automático (grados/s). */
  autoSpin: number;
}

export const CAMERA: CameraTuning = {
  fov: 46,
  fovPortrait: 62,
  minDistance: 3.2,
  maxDistance: 230,
  homeDistance: 78,
  travelSensitivity: 1,
  orbitSensitivity: 0.0052,
  tiltSensitivity: 0.0042,
  wheelZoom: 0.12,
  pinchZoom: 1,
  keyTravel: 0.85,
  keyOrbit: 1.25,
  keyZoom: 1.6,
  damping: 9,
  inertiaFriction: 2.6,
  groundClearance: 0.75,
  colliderMargin: 0.45,
  minPitch: 5,
  maxPitch: 89.5,
  tiltRange: 30,
  autoSpin: 3.2,
};

/* ------------------------------------------------------------------ */
/* Calidad y rendimiento                                                */
/* ------------------------------------------------------------------ */

export type QualityTier = 'low' | 'medium' | 'high';

export interface QualityPreset {
  /** Límite de densidad de pixeles. */
  maxPixelRatio: number;
  /** Escala mínima de resolución que puede aplicar el ajuste dinámico. */
  minScale: number;
  /** Tamaño del mapa de sombras (0 = sin sombras). */
  shadowMap: number;
  /** Desenfoque tilt-shift y antialias por postproceso. */
  postFx: boolean;
  /** Muestras MSAA del postproceso. */
  msaa: number;
  /** Multiplicador de las distancias de nivel de detalle del terreno. */
  lodBias: number;
  /** Fracción de rocas/montículos instanciados. */
  scatter: number;
  /** Partículas ambientales. */
  particles: number;
  /** Milisegundos por cuadro reservados para generar terreno nuevo. */
  buildBudgetMs: number;
}

export const QUALITY: Record<QualityTier, QualityPreset> = {
  low: { maxPixelRatio: 1.25, minScale: 0.6, shadowMap: 0, postFx: false, msaa: 0, lodBias: 0.62, scatter: 0.4, particles: 60, buildBudgetMs: 5 },
  medium: { maxPixelRatio: 1.5, minScale: 0.7, shadowMap: 1024, postFx: false, msaa: 0, lodBias: 0.85, scatter: 0.7, particles: 120, buildBudgetMs: 6 },
  high: { maxPixelRatio: 2, minScale: 0.75, shadowMap: 2048, postFx: true, msaa: 4, lodBias: 1, scatter: 1, particles: 200, buildBudgetMs: 7 },
};

/** Estimación inicial de la calidad según el dispositivo; el motor la corrige midiendo el framerate. */
export function detectQuality(): QualityTier {
  if (typeof navigator === 'undefined') return 'medium';
  const nav = navigator as Navigator & { deviceMemory?: number };
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const cores = nav.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 4;
  if (coarse) return cores >= 8 && mem >= 6 ? 'medium' : 'low';
  if (cores <= 4 || mem <= 2) return 'medium';
  return 'high';
}
