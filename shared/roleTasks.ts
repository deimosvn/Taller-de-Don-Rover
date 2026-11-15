// Tareas de cada especialidad durante la exploración. Cada una de las 4 especialidades tiene
// una tarea propia en una estación del mundo 3D, y las cuatro están conectadas como los
// sistemas reales de una base en Marte:
//
//   🛡️ Hábitat ──protege──▶ ⚡ Energía ──alimenta──▶ 💧 Soporte vital ──riega──▶ 🌱 Astrobiología
//                                                                                   │
//   🛡️ Hábitat ◀────────────────── la comida fresca refuerza a la tripulación ────┘
//
//   · Energía rinde más cuando Hábitat ya protegió los paneles de la radiación.
//   · Soporte vital no puede ir más adelante que la energía que le llega.
//   · Astrobiología no puede ir más adelante que el agua que le llega.
//   · Hábitat rinde más cuando Astrobiología ya tiene cultivos (comida fresca).
//
// Los números de cada tarea salen de datos reales de la NASA: el clima espacial de la semana
// (DONKI), la radiación que midió Curiosity y los estudios de la misión (NTRS / OSDR).
// Terminar la tarea desbloquea la transmisión secreta de esa especialidad.

import { MINIGAMES, type MinigameSpec } from './minigames';
import { DOSE_BY_LEVEL, type SpaceWeather } from './nasa';
import type { MissionId, RoleId, SectorId } from './types';

/** Puntos de minijuego que vale una tarea completa. */
export const TASK_GOAL = 20;

/** Estación de cada especialidad (el sector que cuida su sistema). */
export const ROLE_STATION: Record<RoleId, SectorId> = {
  power: 'solar',
  life: 'waterplant',
  bio: 'greenhouse',
  habitat: 'shield',
};

export const ROLE_PLACE: Record<RoleId, string> = {
  power: 'Granja solar',
  life: 'Planta de agua',
  bio: 'Invernaderos',
  habitat: 'Escudo de radiación',
};

/** De qué especialidad depende cada tarea y cómo. */
export const TASK_LINKS: Record<RoleId, { from: RoleId; kind: 'limit' | 'boost'; text: string }> = {
  power: { from: 'habitat', kind: 'boost', text: 'El escudo de Hábitat protege tus paneles: cuanto más avance, más rinde tu energía.' },
  life: { from: 'power', kind: 'limit', text: 'Tus bombas usan la energía de Energía: no puedes ir más adelante que ella.' },
  bio: { from: 'life', kind: 'limit', text: 'Tus cultivos usan el agua de Soporte vital: no puedes ir más adelante que ella.' },
  habitat: { from: 'bio', kind: 'boost', text: 'La comida fresca de Astrobiología da fuerza a la tripulación: cuanto más avance, más rindes.' },
};

/** Ventaja con la que una tarea limitada puede adelantarse a la de la que depende. */
export const TASK_LEAD = 0.25;

/** Condiciones reales con las que se arma la misión (las calcula el motor). */
export interface MissionConditions {
  weather: SpaceWeather | null;
  /** Dosis de radiación diaria en la superficie (mSv), a partir de Curiosity y DONKI. */
  dose: number;
  /** Luz solar que llega a los paneles (% de la normal en Marte). */
  sun: number;
}

export function conditionsFrom(weather: SpaceWeather | null, mission: MissionId): MissionConditions {
  const level = weather?.level ?? 0;
  const storm = mission === 'darkness' || mission === 'greenhouse' ? 35 : 0;
  return {
    weather,
    dose: DOSE_BY_LEVEL[level],
    sun: Math.max(15, 100 - storm - level * 8),
  };
}

export interface RoleTaskText {
  title: string;
  text: string;
  /** Datos reales que aparecen en la tarjeta. */
  facts: string[];
}

/** Texto de la tarea con datos reales (la IA puede reemplazar título y texto). */
export function roleTaskText(mission: MissionId, role: RoleId, c: MissionConditions): RoleTaskText {
  const w = c.weather;
  const flares = w ? `${w.flares} fulguraciones solares${w.strongestFlare ? ` (la más fuerte, clase ${w.strongestFlare})` : ''}` : null;
  switch (role) {
    case 'power':
      return {
        title: 'Produce la energía de la colonia',
        text: `Los paneles reciben ${c.sun} % de la luz normal de Marte. Saca toda la energía que puedas: Soporte vital la necesita para sus bombas.`,
        facts: [
          'Marte recibe menos de la mitad de la luz solar que llega a la Tierra (NASA).',
          ...(flares ? [`Clima espacial real de la NASA (DONKI): ${flares} en los últimos 14 días.`] : []),
        ],
      };
    case 'life':
      return {
        title: 'Lleva agua y aire a la colonia',
        text: 'Con la energía que produce Energía, mueve el agua de la reserva y limpia el aire. Astrobiología espera tu agua para sus cultivos.',
        facts: ['La Estación Espacial Internacional recupera cerca del 98 % de su agua (NASA).'],
      };
    case 'bio':
      return {
        title: mission === 'darkness' ? 'Mantén vivos los cultivos sin luz' : 'Haz crecer la comida fresca',
        text: 'Con el agua de Soporte vital cuida los cultivos. La comida fresca le da fuerza a Hábitat para reforzar el escudo.',
        facts: ['El experimento Veggie de la NASA cultiva lechugas en la Estación Espacial con luces LED rojas y azules.'],
      };
    case 'habitat':
      return {
        title: 'Protege a la colonia de la radiación',
        text: `Hoy la radiación en la superficie es de unos ${c.dose} mSv al día. Refuerza el escudo: también protege los paneles de Energía.`,
        facts: [
          'El rover Curiosity midió en la superficie de Marte unos 0.64 mSv de radiación al día (NASA).',
          ...(w && (w.cmes || w.sep) ? [`Clima espacial real (DONKI): ${w.cmes} eyecciones de masa coronal y ${w.sep} eventos de partículas.`] : []),
        ],
      };
  }
}

/** Minijuego de cada tarea: el de la especialidad en una misión vecina (distinto al de la emergencia). */
export function taskSpec(mission: MissionId, role: RoleId): MinigameSpec {
  const order: MissionId[] = ['greenhouse', 'water', 'darkness', 'signal', 'habitat', 'final'];
  const own = MINIGAMES[mission][role];
  for (let i = 1; i < order.length; i++) {
    const m = order[(order.indexOf(mission) + i) % order.length];
    const s = MINIGAMES[m][role];
    if (s.kind !== own.kind) return s;
  }
  return own;
}

/**
 * Avance efectivo de cada tarea a partir de los puntos jugados y de cómo dependen unas de otras.
 * `raw` son los puntos de cada especialidad (0–TASK_GOAL o más).
 */
export function taskProgress(raw: Record<RoleId, number>, present: RoleId[]): Record<RoleId, number> {
  const base = (r: RoleId) => Math.min(1, (raw[r] ?? 0) / TASK_GOAL);
  const has = (r: RoleId) => present.includes(r);
  const out = { power: 0, life: 0, bio: 0, habitat: 0 } as Record<RoleId, number>;
  // Los "boost" multiplican; los "limit" topan. Se resuelve en el orden de la cadena.
  const boost = (r: RoleId, from: RoleId, sourceProgress: number) => (has(from) ? Math.min(1, base(r) * (0.7 + 0.45 * sourceProgress)) : base(r));
  out.habitat = has('habitat') ? base('habitat') : 0;
  out.power = has('power') ? boost('power', 'habitat', out.habitat) : 0;
  out.life = has('life') ? Math.min(base('life'), has('power') ? out.power + TASK_LEAD : 1) : 0;
  out.bio = has('bio') ? Math.min(base('bio'), has('life') ? out.life + TASK_LEAD : 1) : 0;
  // La comida fresca vuelve a impulsar al escudo (cierra el ciclo).
  if (has('habitat')) out.habitat = boost('habitat', 'bio', out.bio);
  for (const r of Object.keys(out) as RoleId[]) out[r] = Math.round(Math.max(0, Math.min(1, out[r])) * 100) / 100;
  return out;
}
