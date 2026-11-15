// Datos reales de la NASA dentro del juego:
//   · Estudios científicos (NTRS + OSDR) → la IA arma la misión a partir de investigación real.
//   · Clima espacial (DONKI) → el evento global se endurece si el Sol está activo de verdad.
//   · Salud de la tripulación (OSDR + DONKI) → una condición real (radiación, huesos,
//     músculos, defensas o sueño) afecta a los tripulantes; cooperar los protege.
//
// Los valores de juego (dosis, penalizaciones) son simplificaciones para el salón basadas
// en esos datos; los textos dicen siempre de dónde salió la información.

import type { MissionId } from './types';

export interface NasaStudy {
  id: string;
  source: 'NTRS' | 'OSDR';
  title: string;
  summary: string;
  year: number | null;
  url: string;
  organism?: string;
  platform?: string;
  factors?: string[];
}

export interface SpaceWeather {
  level: 0 | 1 | 2 | 3;
  label: string;
  headline: string;
  lines: string[];
  from: string;
  to: string;
  cmes: number;
  fastestCme: number;
  maxKp: number;
  sep: number;
  flares: number;
  strongestFlare: string | null;
  updatedAt: string;
}

/** Lo que la IA (o la plantilla) cuenta del estudio en el que se basa la misión. */
export interface ScienceHighlight {
  studyId: string;
  source: 'NTRS' | 'OSDR';
  title: string;
  summary: string;
  connection: string;
  year: number | null;
  url: string;
}

export interface MissionScience {
  studies: NasaStudy[];
  highlight: ScienceHighlight | null;
  /** La IA leyó los estudios y escribió la misión a partir de ellos. */
  ai: boolean;
}

export type HealthKind = 'radiation' | 'bone' | 'muscle' | 'immune' | 'sleep';

export interface CrewHealth {
  kind: HealthKind;
  emoji: string;
  label: string;
  /** Qué le pasa al cuerpo (basado en el estudio). */
  effect: string;
  /** Cómo se protege la tripulación dentro del juego. */
  advice: string;
  /** Dato real para leer en voz alta. */
  fact: string;
  /** Cuánto baja la eficacia de las acciones sin protección (0–0.3). */
  penalty: number;
  /** Nivel de clima espacial con el que se calculó. */
  level: 0 | 1 | 2 | 3;
  study: NasaStudy | null;
}

/** Temas de búsqueda (en inglés: así están los estudios) de cada misión. */
export const MISSION_TOPICS: Record<MissionId, { ntrs: string; osdr: string }> = {
  greenhouse: { ntrs: 'plant growth spaceflight', osdr: 'plant spaceflight' },
  water: { ntrs: 'water recovery life support spacecraft', osdr: 'spaceflight microbial water' },
  darkness: { ntrs: 'Mars dust storm solar power', osdr: 'circadian rhythm spaceflight' },
  signal: { ntrs: 'Mars communication deep space network', osdr: '' },
  habitat: { ntrs: 'Mars habitat radiation shielding', osdr: 'ionizing radiation' },
  final: { ntrs: 'human Mars mission life support', osdr: 'astronaut spaceflight' },
};

export const HEALTH: Record<HealthKind, Omit<CrewHealth, 'penalty' | 'level' | 'study'> & { ntrs: string; osdr: string }> = {
  radiation: {
    kind: 'radiation',
    emoji: '☢️',
    label: 'Radiación espacial',
    effect: 'Las partículas del Sol y del espacio dañan las células y cansan al cuerpo.',
    advice: 'Compartan energía con la colonia: alimenta el escudo de radiación y baja su dosis.',
    fact: 'El rover Curiosity midió en la superficie de Marte unos 0.64 mSv de radiación al día: casi 100 veces la radiación natural que recibimos en la Tierra.',
    ntrs: 'astronaut radiation exposure Mars',
    osdr: 'ionizing radiation',
  },
  bone: {
    kind: 'bone',
    emoji: '🦴',
    label: 'Pérdida de hueso',
    effect: 'Con poca gravedad los huesos pierden minerales y se vuelven más frágiles.',
    advice: 'Compartan recursos: así funciona el equipo de ejercicio que protege sus huesos.',
    fact: 'En el espacio los astronautas pueden perder alrededor de 1 % de su masa ósea cada mes si no hacen ejercicio.',
    ntrs: 'bone loss spaceflight countermeasures',
    osdr: 'bone loss',
  },
  muscle: {
    kind: 'muscle',
    emoji: '💪',
    label: 'Músculos más débiles',
    effect: 'Sin el peso de la Tierra los músculos trabajan menos y se debilitan.',
    advice: 'Compartan recursos: alimentan el equipo de ejercicio de la colonia.',
    fact: 'Los astronautas de la Estación Espacial hacen unas 2 horas de ejercicio al día para cuidar sus músculos y huesos.',
    ntrs: 'muscle atrophy spaceflight exercise',
    osdr: 'muscle atrophy',
  },
  immune: {
    kind: 'immune',
    emoji: '🛡️',
    label: 'Defensas bajas',
    effect: 'El estrés del viaje espacial puede debilitar el sistema inmune.',
    advice: 'Compartan recursos: la comida fresca del invernadero refuerza las defensas de todos.',
    fact: 'Comer verduras frescas cultivadas en el espacio ayuda a la salud y al ánimo de la tripulación.',
    ntrs: 'immune system spaceflight',
    osdr: 'immune spaceflight',
  },
  sleep: {
    kind: 'sleep',
    emoji: '😴',
    label: 'Sueño alterado',
    effect: 'Sin el ciclo normal de día y noche, el reloj interno del cuerpo se desajusta.',
    advice: 'Compartan energía: mantiene las luces que imitan el día y la noche.',
    fact: 'La Estación Espacial usa luces LED que cambian de color para ayudar a los astronautas a dormir mejor.',
    ntrs: 'sleep circadian lighting astronauts',
    osdr: 'circadian rhythm spaceflight',
  },
};

/** Qué condición afecta a la tripulación: con el Sol muy activo siempre es la radiación. */
export function healthKindFor(mission: MissionId, level: number): HealthKind {
  if (level >= 2) return 'radiation';
  const byMission: Record<MissionId, HealthKind> = {
    greenhouse: 'immune',
    water: 'muscle',
    darkness: 'sleep',
    signal: 'bone',
    habitat: 'radiation',
    final: 'radiation',
  };
  return byMission[mission];
}

export function buildHealth(kind: HealthKind, level: 0 | 1 | 2 | 3, study: NasaStudy | null): CrewHealth {
  const h = HEALTH[kind];
  const penalty = kind === 'radiation' ? [0.08, 0.12, 0.2, 0.3][level] : 0.1;
  return { kind, emoji: h.emoji, label: h.label, effect: h.effect, advice: h.advice, fact: h.fact, penalty, level, study };
}

/**
 * Dosis diaria de juego (mSv) en la superficie según el clima espacial real. Parte de lo que
 * midió Curiosity (≈ 0.64 mSv/día) y sube con la actividad del Sol.
 */
export const DOSE_BY_LEVEL = [0.64, 0.8, 1.6, 4.2];

/**
 * Protección de una tripulación (0–0.75): compartir recursos con la colonia y vivir en un
 * sector blindado ayudan. Factor de eficacia = 1 − penalización × (1 − protección).
 */
export function protectionFor(share: number, sector: string): number {
  return Math.min(0.75, Math.max(0, share) * 0.25 + (sector === 'shield' || sector === 'habitat' ? 0.25 : 0));
}

export function healthFactor(h: CrewHealth | null, protection: number): number {
  if (!h) return 1;
  return 1 - h.penalty * (1 - protection);
}

export function doseFor(h: CrewHealth | null, protection: number): number | null {
  if (!h || h.kind !== 'radiation') return null;
  return Math.round(DOSE_BY_LEVEL[h.level] * (1 - protection) * 100) / 100;
}

/** Texto de respaldo si la IA no está disponible: el estudio más relevante, tal cual. */
export function plainHighlight(s: NasaStudy): ScienceHighlight {
  return {
    studyId: s.id,
    source: s.source,
    title: s.title,
    summary: s.summary.slice(0, 260),
    connection: 'IX eligió esta investigación de la NASA como base científica de la misión.',
    year: s.year,
    url: s.url,
  };
}
