// Torneo marciano: retos de todos contra todos. Cada ronda, una ruleta elige un minijuego que
// todos juegan a la vez en su celular; según el lugar en que quedan ganan celdas de energía y
// avanzan por la pista que rodea la colonia MARS-01, donde cada casilla trae una sorpresa:
// cristales de hielo, meteoritos, tormentas de polvo, señales de satélite o tubos de lava.
// Gana quien junta más cristales (y, si empatan, más energía).
//
// Las reglas viven aquí, sin estado: el motor del proyector las usa para decidir y los
// celulares y el proyector, para explicar lo que pasó.

import type { MinigameSpec } from './minigames';
import type { AvatarConfig } from './types';

/* ---------------- minijuegos ---------------- */

export type PartyGameId = 'mine' | 'land' | 'scrub' | 'leaks' | 'sun' | 'signal' | 'wires' | 'tune';

export interface PartyGame {
  id: PartyGameId;
  name: string;
  emoji: string;
  /** Qué hacer, en una frase (se lee en el proyector y en el celular). */
  how: string;
  /** Duración de la ronda en segundos. */
  seconds: number;
  /** Puntos por segundo de alguien muy rápido: más que eso no se acepta (contra trampas). */
  rate: number;
  /** Puntos por segundo de alguien que juega bien: los bots de práctica juegan cerca de eso. */
  bot: number;
  /** Puntaje máximo posible en la ronda. */
  max: number;
  /** Minijuego que ya existe y se reutiliza; null = juego propio del torneo. */
  spec: MinigameSpec | null;
  /** Dato real que aparece al final de la ronda. */
  fact: string;
}

const spec = (s: Omit<MinigameSpec, 'science' | 'source'> & { science?: string; source?: string }): MinigameSpec => ({ science: '', source: 'NASA', ...s });

export const PARTY_GAMES: Record<PartyGameId, PartyGame> = {
  mine: {
    id: 'mine',
    name: 'Minería exprés',
    emoji: '⛏️',
    how: 'Toca las rocas para minarlas. La hematita vale más y el basalto necesita dos golpes.',
    seconds: 25,
    rate: 16,
    bot: 4.6,
    max: 400,
    spec: null,
    fact: 'El rover Opportunity encontró bolitas de hematita (los “arándanos de Marte”): se forman cuando hay agua.',
  },
  land: {
    id: 'land',
    name: 'Aterrizaje perfecto',
    emoji: '🚀',
    how: 'Mantén presionado para encender el motor y toca el suelo despacito. Gana el aterrizaje más suave.',
    seconds: 30,
    rate: 100,
    bot: 0,
    max: 100,
    spec: null,
    fact: 'En Marte el aire es tan delgado que el paracaídas no basta: las naves frenan con motores en los últimos segundos.',
  },
  scrub: {
    id: 'scrub',
    name: 'Paneles sin polvo',
    emoji: '🧹',
    how: 'Frota la pantalla para limpiar el polvo de los paneles lo más rápido que puedas.',
    seconds: 22,
    rate: 9,
    bot: 3.4,
    max: 220,
    spec: spec({ kind: 'scrub', how: 'Frota la pantalla para quitar el polvo de cada panel solar.' }),
    fact: 'Ráfagas de viento limpiaron los paneles de los rovers Spirit y Opportunity y les dieron años más de vida.',
  },
  leaks: {
    id: 'leaks',
    name: 'Caza fugas',
    emoji: '💧',
    how: 'Toca cada fuga de aire en cuanto aparezca. Si tardas, se escapa.',
    seconds: 22,
    rate: 9,
    bot: 2.4,
    max: 220,
    spec: spec({ kind: 'targets', targets: 'leak', how: 'Toca las fugas para sellarlas antes de que se escape el aire.' }),
    fact: 'La Estación Espacial busca fugas de aire con sensores que escuchan el silbido del aire que se escapa.',
  },
  sun: {
    id: 'sun',
    name: 'Sigue al Sol',
    emoji: '☀️',
    how: 'Gira el panel para que siempre apunte al Sol. Mientras lo sigas, sumas puntos.',
    seconds: 22,
    rate: 9,
    bot: 1.7,
    max: 220,
    spec: spec({ kind: 'aim', aim: 'sun', how: 'Gira el panel para seguir al Sol en el cielo.' }),
    fact: 'A Marte llega menos de la mitad de la luz del Sol que a la Tierra: cada rayo cuenta.',
  },
  signal: {
    id: 'signal',
    name: 'Repite la señal',
    emoji: '📡',
    how: 'Mira la secuencia de luces y repítela. Cada vez es más larga.',
    seconds: 30,
    rate: 9,
    bot: 2.3,
    max: 280,
    spec: spec({ kind: 'pattern', pattern: 'signal', how: 'Observa la señal y repítela en el mismo orden.' }),
    fact: 'Un mensaje de Marte tarda entre 3 y 22 minutos en llegar a la Tierra, según dónde estén los planetas.',
  },
  wires: {
    id: 'wires',
    name: 'Conecta los cables',
    emoji: '🔌',
    how: 'Une cada cable con el de su mismo color lo más rápido posible.',
    seconds: 25,
    rate: 9,
    bot: 3,
    max: 240,
    spec: spec({ kind: 'wires', wires: 'power', how: 'Une cada cable con su conector del mismo color.' }),
    fact: 'Los rovers de la NASA llevan kilómetros de cables: cada uno se revisa a mano antes del despegue.',
  },
  tune: {
    id: 'tune',
    name: 'Sintoniza la radio',
    emoji: '📻',
    how: 'Mueve la perilla hasta que tu onda coincida con la de la Tierra.',
    seconds: 25,
    rate: 9,
    bot: 1.5,
    max: 240,
    spec: spec({ kind: 'tune', how: 'Ajusta la frecuencia hasta que las dos ondas coincidan.' }),
    fact: 'La Red de Espacio Profundo de la NASA usa antenas de 70 metros para escuchar a las naves en Marte.',
  },
};

export const PARTY_ORDER: PartyGameId[] = ['mine', 'land', 'scrub', 'leaks', 'sun', 'signal', 'wires', 'tune'];

export const isPartyGame = (x: unknown): x is PartyGameId => typeof x === 'string' && x in PARTY_GAMES;

/* ---------------- la pista ---------------- */

export type SpaceKind = 'base' | 'energy' | 'crystal' | 'meteor' | 'storm' | 'satellite' | 'tube';

export const SPACES: Record<SpaceKind, { emoji: string; name: string; text: string; energy: number; crystals: number; move: number; color: string }> = {
  base: { emoji: '🏠', name: 'Base MARS-01', text: 'Descanso en la base.', energy: 0, crystals: 0, move: 0, color: '#F08A57' },
  energy: { emoji: '⚡', name: 'Celda de energía', text: '+3 de energía.', energy: 3, crystals: 0, move: 0, color: '#FFC93C' },
  crystal: { emoji: '💎', name: 'Cristal de hielo', text: '¡Un cristal de hielo!', energy: 0, crystals: 1, move: 0, color: '#7FDBFF' },
  meteor: { emoji: '☄️', name: 'Lluvia de meteoritos', text: '−4 de energía para reparar daños.', energy: -4, crystals: 0, move: 0, color: '#FF6B5B' },
  storm: { emoji: '🌪️', name: 'Tormenta de polvo', text: 'El polvo tapa los paneles: −2 de energía.', energy: -2, crystals: 0, move: 0, color: '#C9A27A' },
  satellite: { emoji: '🛰️', name: 'Señal de satélite', text: 'Datos del satélite: +5 de energía.', energy: 5, crystals: 0, move: 0, color: '#B69CFF' },
  tube: { emoji: '🕳️', name: 'Tubo de lava', text: 'Atajo por un tubo de lava: avanza 3 casillas.', energy: 0, crystals: 0, move: 3, color: '#8A5A44' },
};

/** La pista que rodea la colonia (la casilla 0 es la base). */
export const BOARD: SpaceKind[] = [
  'base', 'energy', 'energy', 'meteor', 'crystal',
  'energy', 'storm', 'satellite', 'energy', 'tube',
  'crystal', 'energy', 'meteor', 'energy', 'storm',
  'crystal', 'energy', 'satellite', 'tube', 'energy',
];

/** Pasar por la base recarga energía. */
export const LAP_BONUS = 5;
/** Energía y casillas que se ganan según el lugar en la ronda (1.º, 2.º, 3.º, 4.º…). */
export const PLACE_ENERGY = [10, 6, 4, 2];
export const PLACE_MOVE = [5, 4, 3, 2];
/** XP que se lleva cada quien al terminar el torneo, según su lugar final. */
export const PLACE_XP = [60, 40, 30, 20];

export const at = <T,>(arr: readonly T[], place: number): T => arr[Math.min(arr.length - 1, Math.max(0, place - 1))];

export interface PartyToken {
  pos: number;
  energy: number;
  crystals: number;
}

/** Lo que le pasó a cada quien en una ronda. */
export interface PartyRoundLine {
  id: string;
  score: number;
  place: number;
  /** Energía por el lugar en el minijuego. */
  prize: number;
  /** Ganó la ronda: cristal extra. */
  winner: boolean;
  from: number;
  to: number;
  steps: number;
  space: SpaceKind;
  lap: boolean;
  /** Energía y cristales con el premio de la ronda, antes de la sorpresa de la casilla. */
  energy: number;
  crystals: number;
}

/** Lugar de cada puntaje (los empates comparten lugar: 1, 1, 3, 4). */
export function places(scores: { id: string; score: number }[]): Map<string, number> {
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const out = new Map<string, number>();
  sorted.forEach((s, i) => {
    const prev = sorted[i - 1];
    out.set(s.id, prev && prev.score === s.score ? out.get(prev.id)! : i + 1);
  });
  return out;
}

/** Resuelve una ronda: premios por lugar, avance por la pista y la sorpresa de cada casilla. */
export function resolveRound(scores: Record<string, number>, tokens: Record<string, PartyToken>): PartyRoundLine[] {
  const ids = Object.keys(tokens);
  const placeOf = places(ids.map((id) => ({ id, score: scores[id] ?? 0 })));
  const lines: PartyRoundLine[] = [];
  for (const id of ids) {
    const t = tokens[id];
    const score = scores[id] ?? 0;
    const place = placeOf.get(id) ?? ids.length;
    const winner = place === 1 && score > 0;
    const prize = score > 0 ? at(PLACE_ENERGY, place) : 0;
    const steps = at(PLACE_MOVE, place);
    const from = t.pos;
    let to = from + steps;
    let lap = to >= BOARD.length;
    to %= BOARD.length;
    const space = BOARD[to];
    const def = SPACES[space];
    if (def.move) {
      const next = to + def.move;
      if (next >= BOARD.length) lap = true;
      to = next % BOARD.length;
    }
    const energy = t.energy + prize;
    const crystals = t.crystals + (winner ? 1 : 0);
    t.pos = to;
    t.energy = Math.max(0, energy + def.energy + (lap ? LAP_BONUS : 0));
    t.crystals = crystals + def.crystals;
    lines.push({ id, score, place, prize, winner, from, to, steps, space, lap, energy, crystals });
  }
  return lines.sort((a, b) => a.place - b.place);
}

/** Orden del torneo: más cristales primero y, si empatan, más energía. */
export function standingOrder(tokens: Record<string, PartyToken>): string[] {
  return Object.keys(tokens).sort((a, b) => tokens[b].crystals - tokens[a].crystals || tokens[b].energy - tokens[a].energy);
}

/* ---------------- lo que ven el proyector y los celulares ---------------- */

export type PartyStageId = 'spin' | 'intro' | 'play' | 'score' | 'move' | 'final';

export const PARTY_STAGE_SECONDS: Record<Exclude<PartyStageId, 'play' | 'final'>, number> = {
  spin: 4.2,
  intro: 6,
  score: 7,
  move: 6,
};

export interface PartyPlayer {
  id: string;
  name: string;
  avatar: AvatarConfig;
  isBot: boolean;
  connected: boolean;
  pos: number;
  energy: number;
  crystals: number;
  /** Puntos en la ronda actual. */
  score: number;
  /** Lugar en el torneo ahora mismo. */
  standing: number;
  /** XP ganada (solo al final). */
  xp: number;
}

export interface PartyView {
  /** Identifica el torneo (para no repartir la XP dos veces). */
  id: string;
  stage: PartyStageId;
  round: number;
  rounds: number;
  game: PartyGameId;
  /** Juegos que tocaron en cada ronda (para la ruleta). */
  played: PartyGameId[];
  endsAt: number | null;
  paused: boolean;
  pausedLeft: number | null;
  /** Ordenados por su lugar en el torneo. */
  players: PartyPlayer[];
  last: PartyRoundLine[] | null;
}
