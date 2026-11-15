// Tipos compartidos entre el servidor (motor de juego) y los clientes (proyector y celulares).

import type { CrewHealth, MissionScience, ScienceHighlight, SpaceWeather } from './nasa';

/** Datos reales de la NASA de la misión en curso. */
export interface MissionNasa {
  science: MissionScience | null;
  weather: SpaceWeather | null;
  health: CrewHealth | null;
}

/** Cómo afecta la condición de salud a una tripulación. */
export interface CrewHealthStatus {
  /** 0–0.75: compartir y vivir en un sector blindado protegen. */
  protection: number;
  /** Eficacia de las acciones en la emergencia (1 = sin efecto). */
  factor: number;
  /** Dosis de radiación estimada (mSv, valor de juego) o null si la condición no es radiación. */
  dose: number | null;
}

export type SystemId = 'energy' | 'water' | 'food' | 'habitat';
export type RoleId = 'power' | 'life' | 'bio' | 'habitat';
export type Phase =
  | 'lobby'
  | 'crews'
  | 'scan'
  | 'briefing'
  | 'discovery'
  | 'challenge'
  | 'event'
  | 'results'
  | 'debrief';
export type Difficulty = 'explorer' | 'cadet' | 'commander';
export type Pace = 'class' | 'demo';
export type CategoryId = 'plant' | 'water' | 'light' | 'material' | 'signal' | 'mystery';
export type MissionId = 'greenhouse' | 'water' | 'darkness' | 'signal' | 'habitat' | 'final';
export type SectorId =
  | 'greenhouse'
  | 'solar'
  | 'waterplant'
  | 'habitat'
  | 'oxygen'
  | 'battery'
  | 'algae'
  | 'shield';
export type BuildingId = 'hydroponics' | 'recycler' | 'reactor' | 'antenna' | 'module' | 'city';
export type Tier = 'best' | 'ok' | 'bad' | 'critical';
export type BadgeId =
  | 'first'
  | 'decoder'
  | 'voice'
  | 'brain'
  | 'hands'
  | 'hero'
  | 'writer'
  | 'expert';
export type Meters = Record<SystemId, number>;

export interface AvatarConfig {
  suit: number;
  helmet: number;
  visor: number;
  accessory: number;
}

/* ---------- Rompecabezas cooperativo (información secreta por rol) ---------- */

export interface IntelLine {
  label: string;
  value: string;
  emoji?: string;
  strong?: boolean;
}
export interface IntelCard {
  role: RoleId;
  title: string;
  intro: string;
  lines: IntelLine[];
  tip: string;
}
export interface PuzzleOption {
  id: string;
  emoji: string;
  label: string;
  detail: string;
}
export interface PuzzleOptionResult {
  tier: Tier;
  effects: Partial<Meters>;
  why: string;
}
export interface Puzzle {
  kind: 'elimination' | 'budget' | 'route';
  title: string;
  question: string;
  intel: Record<RoleId, IntelCard>;
  options: PuzzleOption[];
  results: Record<string, PuzzleOptionResult>;
  bestId: string;
  hints: [string, string];
  solution: string;
}

/* ---------- Colonia persistente ---------- */

export interface ColonyState {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  sol: number;
  meters: Meters;
  sectors: Record<SectorId, number>;
  buildings: { id: BuildingId; level: number; at: number }[];
  missions: { id: MissionId; at: number; saved: boolean; score: number }[];
  discoveries: { category: CategoryId | 'mystery'; label: string; emoji: string; at: number }[];
}

/* ---------- Vistas que el servidor envía ---------- */

export interface PlayerPublic {
  id: string;
  name: string;
  avatar: AvatarConfig;
  isBot: boolean;
  connected: boolean;
  crewId: string | null;
  roles: RoleId[];
  xp: number;
}

export interface CrewSummary {
  id: string;
  name: string;
  sectorId: SectorId;
  memberIds: string[];
}

export interface CrewScores {
  efficiency: number;
  cooperation: number;
  creativity: number;
  total: number;
}

export interface CrewOutcome {
  tier: Tier;
  optionId: string | null;
  optionLabel: string;
  optionEmoji: string;
  why: string;
  solution: string;
  scores: CrewScores;
  effects: Partial<Meters>;
}

export interface CrewStatus {
  members: number;
  connected: number;
  /** Tripulantes que ya recuperaron su transmisión en el mundo 3D. */
  decoded: number;
  voted: number;
  locked: boolean;
  lockIn: number | null;
  tie: boolean;
  decision: string | null;
  share: number | null;
  shareVotes: number;
  taps: Record<RoleId, number>;
  rolesPresent: RoleId[];
  action: number;
  protocol: boolean;
  log: string | null;
  logBy: string | null;
  logStars: number | null;
  logComment: string | null;
  logHidden: boolean;
  /** Incidentes reparados por la tripulación en la emergencia. */
  repaired: number;
}

export interface HostCrew extends CrewSummary {
  status: CrewStatus;
  outcome: CrewOutcome | null;
  health: CrewHealthStatus | null;
}

export interface MissionPublic {
  id: MissionId;
  briefing: string;
  crewLines: Record<string, string>;
  twists: string[];
  twistsRevealed: number;
  aiNarrative: boolean;
  puzzleTitle: string;
  puzzleQuestion: string;
}

export interface PlayerProgress {
  /** Recuperó su transmisión secreta en el mundo 3D. */
  decoded: boolean;
  voted: boolean;
  share: number | null;
  taps: number;
  /** Incidentes que ayudó a reparar. */
  repairs: number;
  sessionXp: number;
  badges: BadgeId[];
}

/* ---------- Problemas en el mundo 3D (emergencia global) ---------- */

/** Tipo de problema que aparece en la colonia; cada uno lo repara una especialidad. */
export type IncidentKind = 'dust' | 'leak' | 'crack' | 'wilt' | 'overload' | 'cold' | 'static';

export interface Incident {
  id: string;
  kind: IncidentKind;
  /** Especialidad que sabe repararlo. */
  role: RoleId;
  /** Sector donde apareció y lugar alrededor de él (0–3). */
  sectorId: SectorId;
  slot: number;
  /** Avance de la reparación (0–1). */
  progress: number;
  /** Ya quedó reparado. */
  fixed: boolean;
  /** Quiénes están trabajando en él ahora mismo (ids de jugadores). */
  workers: string[];
}

export interface EventPublic {
  stage: 'alert' | 'share' | 'action' | 'done';
  stageEndsAt: number | null;
  progress: number;
  goal: number;
  saved: boolean | null;
  /** Problemas que hay que reparar en el mundo 3D durante la acción. */
  incidents: Incident[];
}

export interface ResultsPublic {
  metersBefore: Meters;
  metersAfter: Meters;
  chain: string[];
  saved: boolean;
  ranking: { crewId: string; total: number }[];
  awards: { title: string; crewId: string; emoji: string }[];
  discovery: { label: string; emoji: string; text: string } | null;
  aiScored: boolean;
}

export interface DebriefPublic {
  headline: string;
  learnings: string[];
  shoutouts: { crewId: string; text: string }[];
  reflection: string;
  nasaFact: string;
  unlocked: BuildingId;
  nextTeaser: string;
  aiGenerated: boolean;
}

export interface IxMessage {
  id: string;
  at: number;
  kind: 'hint' | 'adapt' | 'info' | 'alert';
  text: string;
  crewId?: string;
}

export interface ClassStats {
  players: number;
  connected: number;
  /** Transmisiones recuperadas en el mundo 3D. */
  decoded: number;
  votes: number;
  /** Incidentes reparados en la emergencia. */
  repaired: number;
}

export interface HostView {
  role: 'host';
  now: number;
  code: string;
  className: string;
  difficulty: Difficulty;
  pace: Pace;
  phase: Phase;
  deadline: number | null;
  paused: boolean;
  pausedRemaining: number | null;
  players: PlayerPublic[];
  progress: Record<string, PlayerProgress>;
  crews: HostCrew[];
  colony: ColonyState;
  mission: MissionPublic | null;
  event: EventPublic | null;
  results: ResultsPublic | null;
  debrief: DebriefPublic | null;
  ix: IxMessage[];
  ai: { enabled: boolean; model: string };
  stats: ClassStats;
  finalUnlocked: boolean;
  missionsPlayed: MissionId[];
  nasa: MissionNasa | null;
}

export interface PlayerChallengeView {
  title: string;
  question: string;
  options: PuzzleOption[];
  votes: Record<string, string>;
  myVote: string | null;
  locked: boolean;
  lockIn: number | null;
  tie: boolean;
  decision: string | null;
  log: { text: string; by: string } | null;
}

export interface PlayerEventView extends EventPublic {
  title: string;
  narrative: string;
  shareLabel: string;
  shareUnit: string;
  action: { verb: string; emoji: string; hint: string };
  myShareVote: number | null;
  shareVotes: Record<string, number>;
  crewShare: number | null;
  myTaps: number;
  /** Mis reparaciones terminadas. */
  myRepairs: number;
  crewTaps: Record<RoleId, number>;
  rolesPresent: RoleId[];
  target: number;
  protocol: boolean;
}

export interface PlayerOutcomeView extends CrewOutcome {
  saved: boolean;
  xpGained: number;
  newBadges: BadgeId[];
  rank: number;
  crews: number;
}

export interface PlayerView {
  role: 'player';
  now: number;
  code: string;
  phase: Phase;
  deadline: number | null;
  paused: boolean;
  pausedRemaining: number | null;
  difficulty: Difficulty;
  pace: Pace;
  me: PlayerPublic & { sessionXp: number; badges: BadgeId[] };
  crew: (CrewSummary & { members: PlayerPublic[] }) | null;
  mission: MissionPublic | null;
  /** Transmisión secreta: hay que encontrarla en el mundo 3D (baliza de su especialidad). */
  transmission: { found: boolean } | null;
  intel: IntelCard[] | null;
  challenge: PlayerChallengeView | null;
  event: PlayerEventView | null;
  outcome: PlayerOutcomeView | null;
  debrief: DebriefPublic | null;
  hint: IxMessage | null;
  nasa: {
    science: ScienceHighlight | null;
    weather: SpaceWeather | null;
    health: (CrewHealth & CrewHealthStatus) | null;
  } | null;
}

export type AnyView = HostView | PlayerView;

/* ---------- Mensajes cliente → servidor ---------- */

export type HostAction =
  | { type: 'addBots'; count: number }
  | { type: 'formCrews' }
  | { type: 'shuffleCrews' }
  | { type: 'toScan' }
  | { type: 'chooseMission'; missionId: MissionId }
  | { type: 'next' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'addTime'; seconds: number }
  | { type: 'hint' }
  | { type: 'kick'; playerId: string }
  | { type: 'newMission' }
  | { type: 'toLobby' }
  | { type: 'setDifficulty'; difficulty: Difficulty };

export type PlayerAction =
  /** Recuperó su transmisión en la baliza del mundo 3D (o con el radar si no hay 3D). */
  | { type: 'decode' }
  | { type: 'vote'; optionId: string }
  | { type: 'log'; text: string }
  | { type: 'share'; amount: number }
  | { type: 'taps'; count: number }
  /** Avance en la reparación de un problema del mundo 3D (puntos del minijuego). */
  | { type: 'repair'; incidentId: string; points: number }
  /** Empieza (o deja) de trabajar en un problema: los demás lo ven en el mundo. */
  | { type: 'work'; incidentId: string | null }
  | { type: 'avatar'; avatar: AvatarConfig };

export interface Ack<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}
