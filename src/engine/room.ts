// Motor del juego del Taller de Don Rover. Corre en el navegador del profesor (la pantalla del proyector)
// y es la única fuente de verdad: los celulares solo envían acciones y reciben su vista.
//
// "La IA narra, el motor decide": recursos, consecuencias y puntajes son deterministas.

import {
  ACCESSORIES,
  BOT_LOGS,
  BOT_NAMES,
  BUILDINGS,
  CATEGORIES,
  CATEGORY_LINES,
  CREWS,
  DIFFICULTIES,
  HELMETS,
  MISSIONS,
  MISSION_ORDER,
  MYSTERY_POOL,
  PACES,
  PHASE_FLOW,
  ROLE_ORDER,
  SECTORS,
  SECTOR_ORDER,
  SUIT_COLORS,
  SYSTEMS,
  SYSTEM_ORDER,
  VISORS,
  missionForCategory,
} from '../../shared/content';
import { generatePuzzle } from '../../shared/puzzles';
import { hashString, pick, shuffle } from '../../shared/rng';
import type {
  Ack,
  AvatarConfig,
  BadgeId,
  CategoryId,
  ColonyState,
  CrewHealthStatus,
  CrewOutcome,
  CrewStatus,
  DebriefPublic,
  Difficulty,
  HostAction,
  HostView,
  IxMessage,
  Meters,
  MissionId,
  MissionNasa,
  MissionPublic,
  Pace,
  Phase,
  PlayerAction,
  PlayerPublic,
  PlayerView,
  Puzzle,
  QuizView,
  ResultsPublic,
  RoleId,
  ScanResult,
  SectorId,
  Tier,
} from '../../shared/types';
import * as ai from './ai';
import { saveColony } from './store';
import { logMission } from '../lib/cloud';
import { nasaStudies, spaceWeather } from '../lib/nasa';
import { HEALTH, MISSION_TOPICS, buildHealth, doseFor, healthFactor, healthKindFor, plainHighlight, protectionFor } from '../../shared/nasa';

/* ------------------------------------------------------------------ */
/* Utilidades                                                           */
/* ------------------------------------------------------------------ */

const R = Math.random;
const now = () => Date.now();
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const err = (error: string): Ack => ({ ok: false, error });
const OK: Ack = { ok: true };

export function rid(len = 10) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  const abc = 'abcdefghijkmnopqrstuvwxyz23456789';
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
}

const CODE_LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
export function makeRoomCode() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_LETTERS[b % CODE_LETTERS.length]).join('');
}

const TIER_SCORE: Record<Tier, number> = { best: 100, ok: 60, bad: 25, critical: 0 };
const TIER_HEALTH: Record<Tier, number> = { best: 12, ok: 4, bad: -10, critical: -16 };

const BAD_WORDS = ['idiota', 'estupid', 'pendej', 'mierda', 'puta', 'puto', 'verga', 'chinga', 'cabron', 'culero', 'pinche', 'imbecil', 'tarad', 'mamon'];
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const looksInappropriate = (text: string) => BAD_WORDS.some((w) => normalize(text).includes(w));

function heuristicStars(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  if (t.length >= 55 && /\d|porque|ya que|entonces|por eso|así que|para que/i.test(t)) return 3;
  if (t.length >= 22) return 2;
  return 1;
}

function cleanName(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
}

export function sanitizeAvatar(a?: Partial<AvatarConfig>): AvatarConfig {
  const n = (v: unknown, max: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < max ? (v as number) : 0);
  return {
    suit: n(a?.suit, SUIT_COLORS.length),
    helmet: n(a?.helmet, HELMETS.length),
    visor: n(a?.visor, VISORS.length),
    accessory: n(a?.accessory, ACCESSORIES.length),
  };
}

export function randomAvatar(): AvatarConfig {
  const r = (max: number) => Math.floor(R() * max);
  return { suit: r(SUIT_COLORS.length), helmet: r(HELMETS.length), visor: r(VISORS.length), accessory: r(ACCESSORIES.length) };
}

const listNames = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;

/* ------------------------------------------------------------------ */
/* Estado interno                                                       */
/* ------------------------------------------------------------------ */

interface Player {
  id: string;
  token: string;
  name: string;
  avatar: AvatarConfig;
  isBot: boolean;
  connected: boolean;
  joinedAt: number;
  lastSeen: number;
  crewId: string | null;
  roles: RoleId[];
  xp: number;
  sessionXp: number;
  badges: BadgeId[];
  quizChoice: number | null;
  quizCorrect: boolean | null;
  vote: string | null;
  shareVote: number | null;
  taps: number;
  bonusChoice: number | null;
  bonusCorrect: boolean | null;
  objectVote: CategoryId | null;
  xpGained: number;
  newBadges: BadgeId[];
  tapAllowance: number;
  tapStamp: number;
}

interface Crew {
  id: string;
  name: string;
  sectorId: SectorId;
  memberIds: string[];
  puzzle: Puzzle | null;
  locked: boolean;
  decision: string | null;
  lockIn: number | null;
  lockCandidate: string | null;
  tie: boolean;
  log: { text: string; by: string; byId: string } | null;
  logStars: number | null;
  logComment: string | null;
  logHidden: boolean;
  share: number | null;
  hintLevel: number;
  protocol: boolean;
  outcome: CrewOutcome | null;
}

interface MissionRun {
  id: MissionId;
  scan: ScanResult;
  startedAt: number;
  briefing: string;
  crewLines: Record<string, string>;
  twists: string[];
  twistsRevealed: number;
  aiNarrative: boolean;
  event: { stage: 'alert' | 'share' | 'action' | 'done'; stageEndsAt: number | null; progress: number; goal: number; saved: boolean | null };
  bonusActive: boolean;
  flags: { discoveryHint: boolean; challengeHint1: boolean; challengeHint2: boolean; bonusChecked: boolean };
  results: ResultsPublic | null;
  debrief: DebriefPublic | null;
  metersBefore: Meters;
  hints: IxMessage[];
  /** Estudios, clima espacial y salud de la tripulación con datos reales de la NASA. */
  nasa?: MissionNasa;
}

export interface RoomSnapshot {
  v: 1;
  savedAt: number;
  code: string;
  className: string;
  difficulty: Difficulty;
  pace: Pace;
  colony: ColonyState;
  phase: Phase;
  phaseStartedAt: number;
  deadline: number | null;
  paused: boolean;
  pausedRemaining: number | null;
  players: Player[];
  crews: Crew[];
  mission: MissionRun | null;
  objectVote: { options: CategoryId[]; open: boolean } | null;
  ix: IxMessage[];
  missionsPlayed: MissionId[];
  firstHumanAwarded: boolean;
}

const SNAPSHOT_KEY = 'ixchel.room';

export function loadSnapshot(): RoomSnapshot | null {
  try {
    const s = JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || 'null') as RoomSnapshot | null;
    if (!s || s.v !== 1) return null;
    if (now() - s.savedAt > 6 * 3600_000) return null;
    return s;
  } catch {
    return null;
  }
}

export function clearSnapshot() {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch {
    /* nada */
  }
}

/* ------------------------------------------------------------------ */
/* Motor                                                                */
/* ------------------------------------------------------------------ */

export class HostEngine {
  code: string;
  className: string;
  difficulty: Difficulty;
  pace: Pace;
  colony: ColonyState;
  phase: Phase = 'lobby';
  phaseStartedAt = now();
  deadline: number | null = null;
  paused = false;
  pausedRemaining: number | null = null;
  players = new Map<string, Player>();
  crews: Crew[] = [];
  mission: MissionRun | null = null;
  objectVote: { options: CategoryId[]; open: boolean } | null = null;
  ix: IxMessage[] = [];
  missionsPlayed: MissionId[] = [];
  private firstHumanAwarded = false;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private notifyTimer: ReturnType<typeof setTimeout> | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(init: { code: string; className: string; difficulty: Difficulty; pace: Pace; colony: ColonyState }) {
    this.code = init.code;
    this.className = init.className;
    this.difficulty = init.difficulty;
    this.pace = init.pace;
    this.colony = init.colony;
    this.pushIx('info', `Colonia ${this.colony.name} en línea. Sol ${this.colony.sol}. Esperando tripulantes…`);
  }

  static restore(s: RoomSnapshot): HostEngine {
    const e = new HostEngine({ code: s.code, className: s.className, difficulty: s.difficulty, pace: s.pace, colony: s.colony });
    e.phase = s.phase;
    e.phaseStartedAt = s.phaseStartedAt;
    e.deadline = s.deadline;
    e.paused = s.paused;
    e.pausedRemaining = s.pausedRemaining;
    for (const p of s.players) e.players.set(p.id, { ...p, connected: p.isBot });
    e.crews = s.crews;
    e.mission = s.mission;
    e.objectVote = s.objectVote;
    e.ix = s.ix;
    e.missionsPlayed = s.missionsPlayed;
    e.firstHumanAwarded = s.firstHumanAwarded;
    // Si la página se recargó a mitad de un cronómetro, lo pausamos para que nadie pierda tiempo.
    const active = e.activeDeadline();
    if (active && !e.paused) {
      e.paused = true;
      e.pausedRemaining = Math.max(5000, active - s.savedAt);
      e.pushIx('info', 'Sala restaurada. El cronómetro quedó en pausa: reanúdalo cuando todos estén conectados.');
    } else {
      e.pushIx('info', 'Sala restaurada: los celulares se reconectan solos.');
    }
    return e;
  }

  snapshot(): RoomSnapshot {
    return {
      v: 1,
      savedAt: now(),
      code: this.code,
      className: this.className,
      difficulty: this.difficulty,
      pace: this.pace,
      colony: this.colony,
      phase: this.phase,
      phaseStartedAt: this.phaseStartedAt,
      deadline: this.deadline,
      paused: this.paused,
      pausedRemaining: this.pausedRemaining,
      players: [...this.players.values()],
      crews: this.crews,
      mission: this.mission,
      objectVote: this.objectVote,
      ix: this.ix,
      missionsPlayed: this.missionsPlayed,
      firstHumanAwarded: this.firstHumanAwarded,
    };
  }

  start() {
    if (!this.timer) this.timer = setInterval(() => this.tick(), 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private changed(persist = true) {
    if (!this.notifyTimer) {
      this.notifyTimer = setTimeout(() => {
        this.notifyTimer = null;
        this.listeners.forEach((fn) => fn());
      }, 60);
    }
    if (persist && !this.persistTimer) {
      this.persistTimer = setTimeout(() => {
        this.persistTimer = null;
        try {
          localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(this.snapshot()));
        } catch {
          /* sin almacenamiento */
        }
      }, 800);
    }
  }

  /* ---------------- utilidades de consulta ---------------- */

  private members(c: Crew): Player[] {
    return c.memberIds.map((id) => this.players.get(id)).filter((p): p is Player => Boolean(p));
  }

  private activeMembers(c: Crew): Player[] {
    return this.members(c).filter((p) => p.connected || p.isBot);
  }

  private crewOf(p: Player): Crew | undefined {
    return p.crewId ? this.crews.find((c) => c.id === p.crewId) : undefined;
  }

  private crewPlayers(): Player[] {
    return [...this.players.values()].filter((p) => p.crewId);
  }

  private activeDeadline(): number | null {
    if (this.phase === 'event' && this.mission) return this.mission.event.stageEndsAt;
    return this.deadline;
  }

  private tapTarget() {
    return Math.round(PACES[this.pace].action * 1.6);
  }

  get finalUnlocked() {
    const done = new Set(this.colony.missions.map((m) => m.id).filter((id) => id !== 'final'));
    return done.size >= (MISSIONS.final.requires ?? 3) || this.pace === 'demo';
  }

  private pushIx(kind: IxMessage['kind'], text: string, crewId?: string) {
    this.ix.push({ id: rid(6), at: now(), kind, text, crewId });
    if (this.ix.length > 40) this.ix.splice(0, this.ix.length - 40);
  }

  private pushHint(text: string, crewId?: string) {
    if (!this.mission) return;
    const msg: IxMessage = { id: rid(6), at: now(), kind: 'hint', text, crewId };
    this.mission.hints.push(msg);
    const crew = crewId ? this.crews.find((c) => c.id === crewId) : null;
    this.pushIx('hint', crew ? `IX envió una pista a ${crew.name}.` : text);
  }

  /* ---------------- jugadores ---------------- */

  private createPlayer(name: string, avatar: AvatarConfig, isBot: boolean, xp = 0): Player {
    const t = now();
    return {
      id: rid(8),
      token: rid(18),
      name,
      avatar,
      isBot,
      connected: true,
      joinedAt: t,
      lastSeen: t,
      crewId: null,
      roles: [],
      xp,
      sessionXp: 0,
      badges: [],
      quizChoice: null,
      quizCorrect: null,
      vote: null,
      shareVote: null,
      taps: 0,
      bonusChoice: null,
      bonusCorrect: null,
      objectVote: null,
      xpGained: 0,
      newBadges: [],
      tapAllowance: 40,
      tapStamp: t,
    };
  }

  private uniqueName(name: string) {
    const taken = new Set([...this.players.values()].map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 99; i++) {
      const candidate = `${name.slice(0, 13)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${name.slice(0, 10)} ${rid(3)}`;
  }

  join(msg: { name?: string; avatar?: Partial<AvatarConfig>; xp?: number; token?: string }): Ack<{ playerId: string; token: string; name: string }> {
    if (msg.token) {
      const existing = [...this.players.values()].find((p) => p.token === msg.token);
      if (existing) {
        existing.connected = true;
        existing.lastSeen = now();
        if (msg.avatar) existing.avatar = sanitizeAvatar(msg.avatar);
        this.changed();
        return { ok: true, data: { playerId: existing.id, token: existing.token, name: existing.name } };
      }
    }
    const name = cleanName(msg.name);
    if (!name) return { ok: false, error: 'Escribe tu nombre de astronauta.' };
    if (looksInappropriate(name)) return { ok: false, error: 'Elige otro nombre, por favor.' };
    if (this.players.size >= 48) return { ok: false, error: 'La colonia está llena (48 astronautas).' };
    const p = this.createPlayer(this.uniqueName(name), sanitizeAvatar(msg.avatar), false, clamp(Number(msg.xp) || 0, 0, 1e7));
    if (!this.firstHumanAwarded) {
      p.badges.push('first');
      this.firstHumanAwarded = true;
    }
    this.players.set(p.id, p);
    if (this.crews.length) this.placeLateJoiner(p);
    this.changed();
    return { ok: true, data: { playerId: p.id, token: p.token, name: p.name } };
  }

  setConnected(playerId: string, connected: boolean) {
    const p = this.players.get(playerId);
    if (!p || p.isBot || p.connected === connected) return;
    p.connected = connected;
    if (connected) p.lastSeen = now();
    const crew = this.crewOf(p);
    if (crew && this.phase === 'challenge') this.evaluateLock(crew);
    this.changed(false);
  }

  private placeLateJoiner(p: Player) {
    const crew = [...this.crews].sort((a, b) => a.memberIds.length - b.memberIds.length)[0];
    if (!crew) return;
    const counts: Record<RoleId, number> = { power: 0, life: 0, bio: 0, habitat: 0 };
    for (const m of this.members(crew)) for (const r of m.roles) counts[r]++;
    const role = [...ROLE_ORDER].sort((a, b) => counts[a] - counts[b])[0];
    p.crewId = crew.id;
    p.roles = [role];
    crew.memberIds.push(p.id);
    this.pushIx('info', `${p.name} se unió tarde y reforzó a ${crew.name}.`);
  }

  private addBots(count: number): Ack {
    const used = new Set([...this.players.values()].map((p) => p.name));
    const free = shuffle(R, BOT_NAMES.filter((n) => !used.has(n)));
    const n = clamp(Math.floor(count), 1, 48 - this.players.size);
    if (n <= 0) return err('La colonia está llena.');
    for (let i = 0; i < n; i++) {
      const p = this.createPlayer(free[i] ?? `Bot ${rid(3)}`, randomAvatar(), true);
      this.players.set(p.id, p);
      if (this.crews.length) this.placeLateJoiner(p);
    }
    this.pushIx('info', `${n} astronautas de práctica (bots) abordaron la colonia.`);
    return OK;
  }

  private kick(playerId: string): Ack {
    const p = this.players.get(playerId);
    if (!p) return err('No existe ese astronauta.');
    this.players.delete(playerId);
    for (const c of this.crews) c.memberIds = c.memberIds.filter((id) => id !== playerId);
    if (this.phase !== 'results' && this.phase !== 'debrief') this.crews = this.crews.filter((c) => c.memberIds.length > 0);
    return OK;
  }

  /* ---------------- tripulaciones ---------------- */

  private newCrew(def: (typeof CREWS)[number]): Crew {
    return {
      id: def.id,
      name: def.name,
      sectorId: def.sector,
      memberIds: [],
      puzzle: null,
      locked: false,
      decision: null,
      lockIn: null,
      lockCandidate: null,
      tie: false,
      log: null,
      logStars: null,
      logComment: null,
      logHidden: false,
      share: null,
      hintLevel: 0,
      protocol: false,
      outcome: null,
    };
  }

  private formCrews(): Ack {
    const all = [...this.players.values()];
    if (!all.length) return err('Aún no hay astronautas a bordo. Comparte el QR o agrega bots de práctica.');
    const nCrews = clamp(Math.ceil(all.length / 4), 1, CREWS.length);
    const ordered = [...shuffle(R, all.filter((p) => !p.isBot)), ...shuffle(R, all.filter((p) => p.isBot))];
    const crews = CREWS.slice(0, nCrews).map((d) => this.newCrew(d));
    ordered.forEach((p, i) => crews[i % nCrews].memberIds.push(p.id));
    for (const crew of crews) {
      const roles = shuffle(R, ROLE_ORDER);
      const ms = this.members(crew);
      ms.forEach((m) => {
        m.roles = [];
        m.crewId = crew.id;
      });
      if (ms.length >= 4) ms.forEach((m, i) => (m.roles = [roles[i % 4]]));
      else roles.forEach((r, i) => ms[i % ms.length].roles.push(r));
    }
    this.crews = crews;
    this.mission = null;
    this.pushIx('info', `IX formó ${nCrews} tripulación${nCrews > 1 ? 'es' : ''}: ${listNames(crews.map((c) => c.name))}.`);
    this.setPhase('crews');
    return OK;
  }

  /* ---------------- fases ---------------- */

  private setPhase(phase: Phase, seconds?: number) {
    this.phase = phase;
    this.phaseStartedAt = now();
    this.deadline = seconds ? now() + seconds * 1000 : null;
    this.paused = false;
    this.pausedRemaining = null;
    this.changed();
  }

  hostAction(a: HostAction): Ack {
    let res: Ack = OK;
    switch (a.type) {
      case 'addBots':
        res = this.addBots(a.count);
        break;
      case 'formCrews':
      case 'shuffleCrews':
        if (this.phase !== 'lobby' && this.phase !== 'crews') return err('Las tripulaciones solo se forman antes de la misión.');
        res = this.formCrews();
        break;
      case 'toScan':
        if (!this.crews.length) return err('Primero forma las tripulaciones.');
        this.mission = null;
        this.objectVote = null;
        this.setPhase('scan');
        break;
      case 'objectVoteStart':
        if (this.phase !== 'scan') return err('La votación de objetos es parte del escáner.');
        this.objectVote = { options: a.options.filter((c) => CATEGORIES[c]).slice(0, 5), open: true };
        for (const p of this.players.values()) p.objectVote = null;
        this.pushIx('info', 'Votación abierta: ¿qué objeto del salón explorará la colonia?');
        break;
      case 'objectVoteClose':
        return this.closeObjectVote();
      case 'chooseScan':
        res = this.chooseScan(a.scan);
        break;
      case 'chooseMission':
        res = this.chooseMission(a.missionId);
        break;
      case 'next':
        res = this.next();
        break;
      case 'pause':
        this.pause();
        break;
      case 'resume':
        this.resume();
        break;
      case 'addTime':
        this.addTime(a.seconds);
        break;
      case 'hint':
        res = this.manualHint();
        break;
      case 'kick':
        res = this.kick(a.playerId);
        break;
      case 'newMission':
        this.mission = null;
        this.objectVote = null;
        this.setPhase('scan');
        break;
      case 'toLobby':
        this.mission = null;
        this.objectVote = null;
        this.crews = [];
        for (const p of this.players.values()) {
          p.crewId = null;
          p.roles = [];
        }
        this.setPhase('lobby');
        break;
      case 'setDifficulty':
        if (DIFFICULTIES[a.difficulty]) this.difficulty = a.difficulty;
        break;
    }
    this.changed();
    return res;
  }

  private next(): Ack {
    switch (this.phase) {
      case 'lobby':
        return this.formCrews();
      case 'crews':
        this.setPhase('scan');
        return OK;
      case 'scan':
        return err('Primero escanea un objeto o elige una misión.');
      case 'briefing':
        this.setPhase('discovery', PACES[this.pace].discovery);
        this.pushIx('info', 'Transmisiones enviadas: cada especialidad debe descifrar la suya.');
        return OK;
      case 'discovery':
        this.startChallenge();
        return OK;
      case 'challenge':
        this.startEvent();
        return OK;
      case 'event': {
        const ev = this.mission?.event;
        if (ev && ev.stage !== 'done') {
          this.advanceEventStage();
          return OK;
        }
        this.computeResults();
        return OK;
      }
      case 'results':
        this.setPhase('debrief');
        return OK;
      case 'debrief':
        this.mission = null;
        this.objectVote = null;
        this.setPhase('scan');
        return OK;
    }
  }

  private pause() {
    const active = this.activeDeadline();
    if (this.paused || !active) return;
    this.paused = true;
    this.pausedRemaining = Math.max(0, active - now());
  }

  private resume() {
    if (!this.paused) return;
    const end = now() + (this.pausedRemaining ?? 0);
    if (this.phase === 'event' && this.mission) this.mission.event.stageEndsAt = end;
    else this.deadline = end;
    this.paused = false;
    this.pausedRemaining = null;
  }

  private addTime(seconds: number) {
    const ms = clamp(seconds, -600, 600) * 1000;
    if (this.paused && this.pausedRemaining !== null) {
      this.pausedRemaining = Math.max(5000, this.pausedRemaining + ms);
      return;
    }
    if (this.phase === 'event' && this.mission?.event.stageEndsAt) this.mission.event.stageEndsAt += ms;
    else if (this.deadline) this.deadline += ms;
  }

  /* ---------------- escáner y misión ---------------- */

  private closeObjectVote(): Ack<{ category: CategoryId; counts: Partial<Record<CategoryId, number>> }> {
    if (!this.objectVote) return err('No hay votación abierta.') as Ack<never>;
    const counts: Partial<Record<CategoryId, number>> = {};
    for (const p of this.players.values()) if (p.objectVote) counts[p.objectVote] = (counts[p.objectVote] ?? 0) + 1;
    const max = Math.max(0, ...this.objectVote.options.map((o) => counts[o] ?? 0));
    const top = this.objectVote.options.filter((o) => (counts[o] ?? 0) === max);
    const category = pick(R, top);
    this.objectVote.open = false;
    this.pushIx('info', `La clase votó: ${CATEGORIES[category].emoji} ${CATEGORIES[category].label}.`);
    this.changed();
    return { ok: true, data: { category, counts } };
  }

  private chooseScan(scan: ScanResult): Ack {
    if (this.phase !== 'scan') return err('El escáner no está activo.');
    const category: CategoryId = CATEGORIES[scan.category] ? scan.category : 'mystery';
    let missionId = missionForCategory(category);
    if (category === 'mystery') {
      const fresh = MISSION_ORDER.filter((m) => m !== 'final' && !this.colony.missions.some((x) => x.id === m));
      missionId = fresh.length ? pick(R, fresh) : pick(R, MISSION_ORDER.filter((m) => m !== 'final'));
    }
    const clean: ScanResult = {
      category,
      label: cleanName(scan.label).slice(0, 40) || CATEGORIES[category].label,
      confidence: clamp(Number(scan.confidence) || 0.7, 0, 1),
      discovery: String(scan.discovery || CATEGORY_LINES[category].discovery).slice(0, 240),
      funFact: String(scan.funFact || CATEGORY_LINES[category].funFact).slice(0, 280),
      source: scan.source,
    };
    return this.startMission(missionId, clean);
  }

  private chooseMission(missionId: MissionId): Ack {
    if (this.phase !== 'scan') return err('Elige la misión desde el escáner.');
    if (!MISSIONS[missionId]) return err('Misión desconocida.');
    if (missionId === 'final' && !this.finalUnlocked) return err('THE FINAL COLONY se desbloquea al completar 3 misiones distintas.');
    const category = (Object.keys(CATEGORIES) as CategoryId[]).find((c) => CATEGORIES[c].missionId === missionId && c !== 'mystery') ?? 'mystery';
    return this.startMission(missionId, {
      category,
      label: 'Misión elegida por el profesor',
      confidence: 1,
      discovery: CATEGORY_LINES[category].discovery,
      funFact: CATEGORY_LINES[category].funFact,
      source: 'teacher',
    });
  }

  private startMission(id: MissionId, scan: ScanResult): Ack {
    if (!this.crews.length) return err('Primero forma las tripulaciones.');
    const def = MISSIONS[id];
    for (const p of this.players.values()) {
      p.quizChoice = null;
      p.quizCorrect = null;
      p.vote = null;
      p.shareVote = null;
      p.taps = 0;
      p.bonusChoice = null;
      p.bonusCorrect = null;
      p.objectVote = null;
      p.xpGained = 0;
      p.newBadges = [];
      p.tapAllowance = 40;
      p.tapStamp = now();
    }
    const stamp = now();
    for (const c of this.crews) {
      Object.assign(c, {
        locked: false,
        decision: null,
        lockIn: null,
        lockCandidate: null,
        tie: false,
        log: null,
        logStars: null,
        logComment: null,
        logHidden: false,
        share: null,
        hintLevel: 0,
        protocol: false,
        outcome: null,
      });
      c.puzzle = generatePuzzle(id, this.difficulty, hashString(`${this.code}:${id}:${c.id}:${stamp}`));
    }
    const crewLines: Record<string, string> = {};
    for (const c of this.crews) {
      const s = SECTORS[c.sectorId];
      crewLines[c.id] = `${s.emoji} ${s.name}: su decisión cuidará ${SYSTEMS[s.system].short.toLowerCase()} de toda la colonia.`;
    }
    const briefing =
      scan.source === 'teacher' ? `${def.hook} ${def.story}` : `${def.hook} El escáner de IX encontró: ${scan.label}. ${def.story}`;
    this.mission = {
      id,
      scan,
      startedAt: stamp,
      briefing,
      crewLines,
      twists: [...def.twists],
      twistsRevealed: 0,
      aiNarrative: false,
      event: { stage: 'alert', stageEndsAt: null, progress: 0, goal: 60, saved: null },
      bonusActive: false,
      flags: { discoveryHint: false, challengeHint1: false, challengeHint2: false, bonusChecked: false },
      results: null,
      debrief: null,
      metersBefore: { ...this.colony.meters },
      hints: [],
      nasa: { science: null, weather: null, health: null },
    };
    this.objectVote = null;
    if (scan.source !== 'teacher' && !this.colony.discoveries.some((d) => d.label.toLowerCase() === scan.label.toLowerCase())) {
      this.colony.discoveries.push({ category: scan.category, label: scan.label, emoji: CATEGORIES[scan.category].emoji, at: stamp });
      saveColony(this.colony);
    }
    this.missionsPlayed.push(id);
    this.pushIx('info', `NEW MISSION UNLOCKED · ${def.code} ${def.title}`);
    this.setPhase('briefing');
    void this.enrichMission(this.mission, scan);
    return OK;
  }

  /**
   * Datos reales de la NASA para la misión: estudios científicos (NTRS + OSDR), clima
   * espacial (DONKI) y la condición de salud que afectará a los tripulantes. Después, la IA
   * escribe la misión a partir de esos estudios. Todo es opcional: sin servidor o sin
   * conexión, la misión sigue con su contenido propio.
   */
  private async enrichMission(m: MissionRun, scan: ScanResult) {
    const def = MISSIONS[m.id];
    const within = <T>(p: Promise<T>, ms: number, fallback: T) => Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
    const topic = MISSION_TOPICS[m.id];
    const [studies, weather] = await Promise.all([within(nasaStudies(topic.ntrs, topic.osdr, 6), 9000, []), within(spaceWeather(14), 9000, null)]);
    if (this.mission !== m) return;
    if (studies.length || weather) {
      const level = weather?.level ?? 0;
      const kind = healthKindFor(m.id, level);
      const healthStudies = await within(nasaStudies(HEALTH[kind].ntrs, HEALTH[kind].osdr, 2), 7000, []);
      if (this.mission !== m) return;
      m.nasa = {
        science: studies.length ? { studies, highlight: plainHighlight(studies[0]), ai: false } : null,
        weather,
        health: buildHealth(kind, level, healthStudies[0] ?? null),
      };
      if (studies.length) this.pushIx('info', `📚 IX encontró ${studies.length} investigaciones reales de la NASA para esta misión.`);
      if (weather) this.pushIx(weather.level >= 2 ? 'alert' : 'info', `☀️ Clima espacial real (NASA DONKI): ${weather.headline}.`);
      this.changed();
    }

    if (!ai.aiStatus().enabled) return;
    const n = await ai.generateNarrative({
      ageGroup: DIFFICULTIES[this.difficulty].age,
      className: this.className,
      objectLabel: scan.label,
      mission: { title: def.title, titleEs: def.titleEs, hook: def.hook, story: def.story, objective: def.objective, twist: def.twist, twists: def.twists },
      crews: this.crews.map((c) => ({ id: c.id, name: c.name, sector: SECTORS[c.sectorId].name })),
      studies: studies.slice(0, 4).map((s) => ({ id: s.id, source: s.source, title: s.title, summary: s.summary, year: s.year })),
    });
    if (!n || this.mission !== m) return;
    m.briefing = n.briefing;
    m.crewLines = { ...m.crewLines, ...n.crewLines };
    m.twists = n.twists;
    m.aiNarrative = true;
    const sci = m.nasa?.science;
    const chosen = n.science && sci ? sci.studies.find((s) => s.id === n.science!.studyId) : null;
    if (sci && chosen && n.science) {
      sci.highlight = { studyId: chosen.id, source: chosen.source, title: n.science.title, summary: n.science.summary, connection: n.science.connection, year: chosen.year, url: chosen.url };
      sci.ai = true;
      this.pushIx('adapt', `IX escribió la misión a partir de una investigación real de la NASA (${chosen.id}).`);
    } else {
      this.pushIx('adapt', 'IX personalizó la historia de la misión para esta clase.');
    }
    this.changed();
  }

  /** Protección y eficacia de una tripulación ante la condición de salud de la misión. */
  private crewHealth(c: Crew): CrewHealthStatus | null {
    const h = this.mission?.nasa?.health ?? null;
    if (!h) return null;
    const share = this.phase === 'event' || this.phase === 'results' || this.phase === 'debrief' ? this.liveShare(c) : 0;
    const protection = protectionFor(share, c.sectorId);
    return { protection, factor: Math.round(healthFactor(h, protection) * 100) / 100, dose: doseFor(h, protection) };
  }

  /* ---------------- reto de tripulación ---------------- */

  private startChallenge() {
    const m = this.mission;
    if (!m) return;
    m.twistsRevealed = Math.max(m.twistsRevealed, 1);
    this.pushIx('info', m.twists[0]);
    this.setPhase('challenge', PACES[this.pace].challenge);
  }

  private plurality(votes: string[]): string[] {
    const tally = new Map<string, number>();
    for (const v of votes) tally.set(v, (tally.get(v) ?? 0) + 1);
    const max = Math.max(0, ...tally.values());
    return [...tally.entries()].filter(([, n]) => n === max).map(([id]) => id);
  }

  private evaluateLock(c: Crew) {
    if (c.locked) return;
    const ms = this.activeMembers(c);
    const votes = ms.map((m) => m.vote);
    if (!ms.length || votes.some((v) => !v)) {
      c.lockIn = null;
      c.lockCandidate = null;
      c.tie = false;
      return;
    }
    const top = this.plurality(votes as string[]);
    if (top.length > 1) {
      c.tie = true;
      c.lockIn = null;
      c.lockCandidate = null;
      return;
    }
    c.tie = false;
    if (c.lockCandidate !== top[0] || c.lockIn === null) {
      c.lockCandidate = top[0];
      c.lockIn = now() + 3000;
    }
  }

  private tryLock(c: Crew) {
    const candidate = c.lockCandidate;
    this.evaluateLock(c);
    if (c.lockCandidate && c.lockCandidate === candidate && c.lockIn !== null && now() >= c.lockIn - 50) this.lock(c, candidate);
  }

  private lock(c: Crew, decision: string | null) {
    c.locked = true;
    c.decision = decision;
    c.lockIn = null;
    c.lockCandidate = null;
    c.tie = false;
    const opt = c.puzzle?.options.find((o) => o.id === decision);
    this.pushIx('info', `🔒 ${c.name} bloqueó su decisión${opt ? '' : ' (sin votos)'}.`);
  }

  private forceLockAll() {
    for (const c of this.crews) {
      if (c.locked) continue;
      const votes = this.members(c)
        .map((m) => m.vote)
        .filter((v): v is string => Boolean(v));
      const top = this.plurality(votes);
      this.lock(c, top.length ? pick(R, top) : null);
    }
  }

  /* ---------------- evento global ---------------- */

  private startEvent() {
    const m = this.mission;
    if (!m) return;
    this.forceLockAll();
    const def = MISSIONS[m.id];
    m.twistsRevealed = Math.max(m.twistsRevealed, 2);
    m.bonusActive = false;
    const flagged: string[] = [];
    for (const c of this.crews) {
      const ms = this.members(c);
      c.protocol = ms.length > 1 && ms.some((p) => p.quizChoice === null || p.vote === null);
      if (c.protocol) flagged.push(c.name);
    }
    this.pushIx('alert', `🚨 ${def.event.title}: ${m.twists[1]}`);
    if (flagged.length) {
      this.pushIx('adapt', `IX activó el Protocolo de Tripulación en ${listNames(flagged.slice(0, 4))}: cada especialidad será imprescindible.`);
    }
    this.setPhase('event');
    m.event = { stage: 'alert', stageEndsAt: now() + 6000, progress: 0, goal: 60, saved: null };

    // Clima espacial real: si el Sol está activo de verdad, la emergencia es más difícil y el
    // escudo de radiación de la colonia resiente el golpe.
    const w = m.nasa?.weather;
    if (w && w.level >= 1) {
      m.event.goal = 60 + 4 * w.level;
      this.colony.sectors.shield = Math.max(5, this.colony.sectors.shield - 5 * w.level);
      this.pushIx('alert', `☀️ Clima espacial real (NASA DONKI): ${w.headline}. La meta de la emergencia sube a ${m.event.goal} %.`);
    }
    const h = m.nasa?.health;
    if (h) this.pushIx('info', `${h.emoji} ${h.label}: ${h.advice}`);
  }

  private advanceEventStage() {
    const m = this.mission;
    if (!m) return;
    const ev = m.event;
    const pace = PACES[this.pace];
    if (ev.stage === 'alert') {
      ev.stage = 'share';
      ev.stageEndsAt = now() + pace.share * 1000;
    } else if (ev.stage === 'share') {
      this.settleShares();
      ev.stage = 'action';
      ev.stageEndsAt = now() + pace.action * 1000;
      this.pushIx('alert', '¡ACCIÓN! Todas las especialidades deben trabajar al mismo tiempo.');
    } else if (ev.stage === 'action') {
      this.finishEvent();
    }
    this.paused = false;
    this.pausedRemaining = null;
  }

  private liveShare(c: Crew): number {
    if (c.share !== null) return c.share;
    const votes = this.members(c)
      .map((p) => p.shareVote)
      .filter((v): v is number => v !== null);
    return votes.length ? Math.round(votes.reduce((a, b) => a + b, 0) / votes.length) : 0;
  }

  private settleShares() {
    for (const c of this.crews) c.share = this.liveShare(c);
  }

  private rolesPresent(c: Crew): RoleId[] {
    const set = new Set<RoleId>();
    for (const p of this.activeMembers(c)) p.roles.forEach((r) => set.add(r));
    return ROLE_ORDER.filter((r) => set.has(r));
  }

  private tapsByRole(c: Crew): Record<RoleId, number> {
    const t: Record<RoleId, number> = { power: 0, life: 0, bio: 0, habitat: 0 };
    for (const p of this.members(c)) for (const r of p.roles) t[r] += p.taps;
    return t;
  }

  private crewAction(c: Crew): number {
    const present = this.rolesPresent(c);
    if (!present.length) return 0;
    const taps = this.tapsByRole(c);
    const target = this.tapTarget();
    // La condición de salud real (radiación, huesos…) resta eficacia; cooperar protege.
    const factor = this.crewHealth(c)?.factor ?? 1;
    const scores = present.map((r) => Math.min(1, (taps[r] * factor) / target));
    let a = scores.reduce((s, x) => s + x, 0) / scores.length;
    if (scores.some((x) => x < 0.25)) a *= 0.6; // cada especialidad es imprescindible
    return a;
  }

  private updateProgress() {
    const m = this.mission;
    if (!m) return;
    const n = Math.max(1, this.crews.length);
    const shares = this.crews.reduce((s, c) => s + this.liveShare(c), 0);
    const shareFrac = shares / (2 * n);
    const actionFrac = this.crews.reduce((s, c) => s + this.crewAction(c), 0) / n;
    m.event.progress = Math.round(100 * (0.45 * shareFrac + 0.55 * actionFrac));
  }

  private finishEvent() {
    const m = this.mission;
    if (!m) return;
    const def = MISSIONS[m.id];
    this.updateProgress();
    m.event.stage = 'done';
    m.event.stageEndsAt = null;
    m.event.saved = m.event.progress >= m.event.goal;
    this.pushIx(m.event.saved ? 'info' : 'alert', m.event.saved ? `✅ ${def.event.savedText}` : `⚠️ ${def.event.failText}`);
  }

  /* ---------------- resultados ---------------- */

  private scoreCrew(c: Crew, tier: Tier) {
    const ms = this.members(c);
    // La calidad de la decisión pesa más: una buena decisión nunca debe quedar por debajo
    // de una mala solo por la bitácora o por la velocidad en la emergencia.
    const efficiency = Math.round(TIER_SCORE[tier] * 0.8 + this.crewAction(c) * 20);
    const participation = ms.length
      ? ms.reduce((s, p) => s + ((p.quizChoice !== null ? 1 : 0) + (p.vote ? 1 : 0) + (p.taps >= 5 ? 1 : 0)) / 3, 0) / ms.length
      : 0;
    const votes = ms.map((p) => p.vote).filter(Boolean);
    const agree = votes.filter((v) => v === c.decision).length;
    const consensus = votes.length && agree === votes.length ? 15 : agree > votes.length / 2 ? 8 : 0;
    const shareBonus = [0, 18, 35][c.share ?? 0] ?? 0;
    const cooperation = Math.min(100, Math.round(participation * 50 + consensus + shareBonus));
    const stars = c.log ? (c.logStars ?? heuristicStars(c.log.text)) : 0;
    const creativity = stars ? Math.min(100, stars * 33 + 1) : 0;
    const total = Math.round(0.5 * efficiency + 0.3 * cooperation + 0.2 * creativity);
    return { efficiency, cooperation, creativity, total };
  }

  private rankAndAward(): Pick<ResultsPublic, 'ranking' | 'awards'> {
    const scored = this.crews.filter((c) => c.outcome);
    const ranking = scored
      .map((c) => ({ crewId: c.id, total: c.outcome!.scores.total }))
      .sort((a, b) => b.total - a.total);
    const best = (key: 'efficiency' | 'cooperation' | 'creativity') =>
      scored.reduce<Crew | null>((acc, c) => (!acc || c.outcome!.scores[key] > acc.outcome!.scores[key] ? c : acc), null);
    const awards: ResultsPublic['awards'] = [];
    const e = best('efficiency');
    if (e) awards.push({ title: 'Tripulación más eficiente', crewId: e.id, emoji: '⚙️' });
    const co = best('cooperation');
    if (co) awards.push({ title: 'Tripulación más cooperativa', crewId: co.id, emoji: '🤝' });
    const cr = best('creativity');
    if (cr && cr.outcome!.scores.creativity > 0) awards.push({ title: 'Tripulación más creativa', crewId: cr.id, emoji: '💡' });
    return { ranking, awards };
  }

  private computeResults() {
    const m = this.mission;
    if (!m) return;
    const def = MISSIONS[m.id];
    if (m.event.stage !== 'done') this.finishEvent();
    const before = { ...this.colony.meters };
    const n = Math.max(1, this.crews.length);
    const agg: Meters = { energy: 0, water: 0, food: 0, habitat: 0 };

    for (const c of this.crews) {
      const res = c.decision && c.puzzle ? c.puzzle.results[c.decision] : null;
      const opt = c.decision && c.puzzle ? c.puzzle.options.find((o) => o.id === c.decision) : null;
      const tier: Tier = res?.tier ?? 'critical';
      const effects: Partial<Meters> = res?.effects ?? { [def.focus]: -8 };
      for (const k of SYSTEM_ORDER) agg[k] += effects[k] ?? 0;
      c.outcome = {
        tier,
        optionId: c.decision,
        optionLabel: opt?.label ?? 'Sin decisión',
        optionEmoji: opt?.emoji ?? '⏳',
        why: res?.why ?? 'La tripulación no tomó una decisión a tiempo.',
        solution: c.puzzle?.solution ?? '',
        scores: this.scoreCrew(c, tier),
        effects,
      };
    }

    const saved = Boolean(m.event.saved);
    const after: Meters = { ...before };
    // Cada misión pasan varios sols: la colonia consume recursos (−5 por sistema), así que
    // los sistemas que nadie atiende se desgastan y la colonia siempre necesita cuidados.
    const UPKEEP = 5;
    for (const k of SYSTEM_ORDER) after[k] = clamp(Math.round(before[k] - UPKEEP + agg[k] / n + (saved ? 4 : -6)), 0, 100);

    // Reacciones en cadena: las decisiones de un sector afectan a los demás.
    const chain: string[] = [];
    const foodCrew = this.crews.find((c) => SECTORS[c.sectorId].system === 'food');
    const hurt = (c: Crew, sys: 'energy' | 'water') => c !== foodCrew && c.outcome && c.outcome.tier !== 'best' && (c.outcome.effects[sys] ?? 0) < 0;
    const energyHit = this.crews.find((c) => hurt(c, 'energy'));
    if (energyHit && foodCrew) {
      chain.push(`⚡ La decisión de ${energyHit.name} gastó energía extra y dejó con menos luz a los cultivos de ${foodCrew.name}.`);
    }
    const waterHit = this.crews.find((c) => hurt(c, 'water'));
    if (waterHit && foodCrew) {
      chain.push(`💧 ${waterHit.name} usó agua de la reserva y los cultivos de ${foodCrew.name} recibieron menos riego.`);
    }
    if (after.energy < 40) {
      after.food -= Math.round((40 - after.energy) * 0.3);
      after.water -= Math.round((40 - after.energy) * 0.2);
      chain.push('⚡→🌱 Con poca energía, los invernaderos y las recicladoras trabajaron a medias.');
    }
    if (after.water < 40) {
      after.food -= Math.round((40 - after.water) * 0.3);
      chain.push('💧→🌱 Sin suficiente agua, los cultivos crecieron menos.');
    }
    if (after.habitat < 35) {
      after.energy -= 3;
      after.water -= 3;
      chain.push('🛡️→⚡ Refugios débiles: hubo que gastar recursos en reparaciones.');
    }
    if (after.energy >= 80) {
      after.food += 2;
      chain.push('⚡→🌱 Energía de sobra: las luces de cultivo trabajaron al máximo.');
    }
    chain.push(saved ? `🤝 ${def.event.savedText}` : `⚠️ ${def.event.failText}`);
    for (const k of SYSTEM_ORDER) after[k] = clamp(Math.round(after[k]), 0, 100);

    // Salud de cada sector en el mapa.
    const active = new Set(this.crews.map((c) => c.sectorId));
    for (const c of this.crews) {
      const tier = c.outcome!.tier;
      this.colony.sectors[c.sectorId] = clamp(
        (this.colony.sectors[c.sectorId] ?? 65) + TIER_HEALTH[tier] + (saved ? 6 : -6) - (c.share ?? 0) * 3,
        5,
        100,
      );
    }
    for (const s of SECTOR_ORDER) if (!active.has(s)) this.colony.sectors[s] = clamp((this.colony.sectors[s] ?? 65) + (saved ? 2 : -3), 5, 100);

    // XP e insignias.
    for (const c of this.crews) {
      const ms = this.members(c);
      const topTaps = Math.max(0, ...ms.map((p) => p.taps));
      for (const p of ms) {
        let xp = 0;
        const earned: BadgeId[] = [];
        if (p.quizChoice !== null) {
          xp += 20;
          if (p.quizCorrect) {
            xp += 30;
            earned.push('decoder');
          }
        }
        if (p.vote) {
          xp += 20;
          earned.push('voice');
        }
        if (c.outcome!.tier === 'best') {
          xp += 60;
          earned.push('brain');
        } else if (c.outcome!.tier === 'ok') xp += 30;
        xp += Math.min(40, p.taps);
        if (p.taps > 0 && p.taps === topTaps) earned.push('hands');
        if (saved) {
          xp += 40;
          earned.push('hero');
        }
        if (c.log?.byId === p.id) {
          xp += 25;
          earned.push('writer');
        }
        if (p.bonusCorrect) {
          xp += 40;
          earned.push('expert');
        }
        p.xpGained = xp;
        p.sessionXp += xp;
        p.newBadges = earned.filter((b) => !p.badges.includes(b));
        p.badges.push(...p.newBadges);
      }
    }

    // Descubrimiento misterioso (tercer acontecimiento inesperado).
    const known = new Set(this.colony.discoveries.map((d) => d.label));
    const pool = MYSTERY_POOL.filter((d) => !known.has(d.label));
    const found = pool.length ? pick(R, pool) : pick(R, MYSTERY_POOL);
    if (!known.has(found.label)) this.colony.discoveries.push({ category: 'mystery', label: found.label, emoji: found.emoji, at: now() });
    m.twistsRevealed = 3;

    // Progresión de la colonia.
    const building = this.colony.buildings.find((b) => b.id === def.unlock);
    if (building) building.level = Math.min(3, building.level + 1);
    else this.colony.buildings.push({ id: def.unlock, level: 1, at: now() });
    const ranking0 = this.crews.map((c) => c.outcome!.scores.total);
    this.colony.missions.push({ id: m.id, at: now(), saved, score: Math.round(ranking0.reduce((a, b) => a + b, 0) / Math.max(1, ranking0.length)) });
    this.colony.meters = after;
    this.colony.sol += 7 + Math.floor(R() * 6);
    saveColony(this.colony);

    m.results = {
      metersBefore: before,
      metersAfter: after,
      chain: chain.slice(0, 5),
      saved,
      ...this.rankAndAward(),
      discovery: found,
      aiScored: false,
    };
    m.debrief = this.templateDebrief(m);
    this.pushIx('info', `Resultados listos. Nuevo en la colonia: ${BUILDINGS[def.unlock].emoji} ${BUILDINGS[def.unlock].name}.`);
    this.setPhase('results');
    this.enrichWithAi(m);

    // Historial de la colonia en la base de datos (si el despliegue la tiene).
    const players = [...this.players.values()];
    logMission(this.colony, {
      mission: m.id,
      saved,
      score: this.colony.missions[this.colony.missions.length - 1]?.score ?? 0,
      players: players.filter((p) => !p.isBot).length,
      crews: this.crews.length,
      difficulty: this.difficulty,
      summary: {
        className: this.className,
        bots: players.filter((p) => p.isBot).length,
        unlocked: def.unlock,
        crews: this.crews.map((c) => ({ name: c.name, sector: c.sectorId, tier: c.outcome?.tier ?? null, total: c.outcome?.scores.total ?? 0 })),
      },
    });
  }

  private templateDebrief(m: MissionRun): DebriefPublic {
    const def = MISSIONS[m.id];
    const saved = Boolean(m.event.saved);
    return {
      headline: saved ? '¡Misión cumplida: la colonia sigue en pie!' : 'La colonia resistió… y aprendimos mucho',
      learnings: def.debrief.learnings,
      shoutouts: (m.results?.awards ?? []).map((a) => ({ crewId: a.crewId, text: `${a.emoji} ${a.title}` })),
      reflection: def.debrief.reflection,
      nasaFact: def.debrief.nasaFact,
      unlocked: def.unlock,
      nextTeaser: def.debrief.teaser,
      aiGenerated: false,
    };
  }

  private enrichWithAi(m: MissionRun) {
    if (!ai.aiStatus().enabled) return;
    const def = MISSIONS[m.id];
    const age = DIFFICULTIES[this.difficulty].age;
    const logs = this.crews
      .filter((c) => c.log)
      .map((c) => ({ crew_id: c.id, decision: c.outcome?.optionLabel ?? '', was_best: c.outcome?.tier === 'best', text: c.log!.text }));
    ai.scoreLogs(def.title, age, logs).then((scores) => {
      if (!scores || this.mission !== m || !m.results) return;
      for (const c of this.crews) {
        const s = scores[c.id];
        if (!s || !c.outcome) continue;
        c.logStars = s.stars;
        c.logComment = s.comment;
        c.logHidden = c.logHidden || !s.appropriate;
        c.outcome.scores = this.scoreCrew(c, c.outcome.tier);
      }
      Object.assign(m.results, this.rankAndAward(), { aiScored: true });
      if (m.debrief && !m.debrief.aiGenerated) m.debrief.shoutouts = m.results.awards.map((a) => ({ crewId: a.crewId, text: `${a.emoji} ${a.title}` }));
      this.pushIx('adapt', 'IX evaluó la creatividad de las bitácoras.');
      this.changed();
    });
    const answered = this.crewPlayers().filter((p) => p.quizChoice !== null);
    ai.generateDebrief({
      ageGroup: age,
      mission: `${def.title} (${def.titleEs})`,
      learningGoals: def.debrief.learnings,
      saved: Boolean(m.event.saved),
      quizAccuracy: answered.length ? Math.round((answered.filter((p) => p.quizCorrect).length / answered.length) * 100) : 0,
      crews: this.crews.map((c) => ({ crew_id: c.id, name: c.name, result: `${c.outcome?.optionLabel} (${c.outcome?.tier})`, total: c.outcome?.scores.total ?? 0 })),
      colonyChanges: Object.fromEntries(SYSTEM_ORDER.map((k) => [k, (m.results?.metersAfter[k] ?? 0) - (m.results?.metersBefore[k] ?? 0)])),
      chain: m.results?.chain ?? [],
    }).then((d) => {
      if (!d || this.mission !== m || !m.debrief) return;
      m.debrief = {
        ...m.debrief,
        headline: d.headline,
        learnings: d.learnings,
        shoutouts: d.shoutouts.length ? d.shoutouts : m.debrief.shoutouts,
        reflection: d.reflection || m.debrief.reflection,
        aiGenerated: true,
      };
      this.changed();
    });
  }

  /* ---------------- pistas y adaptación (Classroom Event Generator) ---------------- */

  private manualHint(): Ack {
    const m = this.mission;
    if (!m) return err('No hay misión activa.');
    const def = MISSIONS[m.id];
    if (this.phase === 'discovery' || this.phase === 'briefing') {
      this.pushHint(def.conceptHint);
    } else if (this.phase === 'challenge') {
      const pending = this.crews.filter((c) => !c.locked && c.puzzle);
      if (!pending.length) return err('Todas las tripulaciones ya decidieron.');
      for (const c of pending) {
        c.hintLevel = Math.min(2, c.hintLevel + 1);
        this.pushHint(c.puzzle!.hints[c.hintLevel - 1], c.id);
      }
    } else if (this.phase === 'event') {
      this.pushHint('Si cada tripulación comparte un poco y todas las especialidades trabajan, la colonia se salva.');
    } else {
      return err('Las pistas se envían durante la misión.');
    }
    return OK;
  }

  private adaptive(t: number): boolean {
    const m = this.mission;
    if (!m || this.paused) return false;
    const def = MISSIONS[m.id];
    const pace = PACES[this.pace];
    let acted = false;

    if (this.phase === 'discovery' && !m.flags.discoveryHint) {
      const players = this.crewPlayers();
      const answered = players.filter((p) => p.quizChoice !== null);
      const elapsed = (t - this.phaseStartedAt) / (pace.discovery * 1000);
      if (answered.length >= Math.max(2, players.length * 0.6) || elapsed > 0.6) {
        const acc = answered.filter((p) => p.quizCorrect).length / Math.max(1, answered.length);
        if (answered.length && acc < 0.5) {
          m.flags.discoveryHint = true;
          this.pushHint(def.conceptHint);
          this.pushIx('adapt', 'IX detectó que muchas transmisiones fallaron y envió una pista del concepto a toda la clase.');
          acted = true;
        } else if (elapsed > 0.6) {
          m.flags.discoveryHint = true;
        }
      }
    }

    if (this.phase === 'challenge') {
      const elapsed = (t - this.phaseStartedAt) / (pace.challenge * 1000);
      const locked = this.crews.filter((c) => c.locked).length;
      if (!m.flags.challengeHint1 && elapsed >= 0.5 && locked < this.crews.length / 2) {
        m.flags.challengeHint1 = true;
        for (const c of this.crews) if (!c.locked && c.puzzle) c.hintLevel = Math.max(c.hintLevel, 1);
        this.pushHint(this.crews.find((c) => c.puzzle)?.puzzle?.hints[0] ?? def.conceptHint);
        this.pushIx('adapt', 'IX notó que la mayoría sigue sin decidir y envió una pista general.');
        acted = true;
      }
      if (!m.flags.challengeHint2 && elapsed >= 0.75) {
        m.flags.challengeHint2 = true;
        const pending = this.crews.filter((c) => !c.locked && c.puzzle);
        for (const c of pending) {
          c.hintLevel = 2;
          this.pushHint(c.puzzle!.hints[1], c.id);
        }
        if (pending.length) this.pushIx('adapt', `IX envió pistas específicas a ${pending.length} tripulación${pending.length > 1 ? 'es' : ''}.`);
        acted = acted || pending.length > 0;
      }
      if (!m.flags.bonusChecked && this.crews.length && locked === this.crews.length) {
        m.flags.bonusChecked = true;
        const bestRate = this.crews.filter((c) => c.puzzle && c.decision === c.puzzle.bestId).length / this.crews.length;
        if (elapsed < 0.6 && bestRate >= 0.75) {
          m.bonusActive = true;
          this.pushIx('adapt', '¡Todas las tripulaciones resolvieron rápido! IX desbloqueó una EMERGENCIA BONUS.');
          this.pushHint('¡EMERGENCIA BONUS! Respondan la pregunta experta en su pantalla.');
        } else {
          this.pushIx('info', 'Todas las tripulaciones tomaron su decisión.');
        }
        acted = true;
      }
    }
    return acted;
  }

  /* ---------------- reloj ---------------- */

  private tick() {
    const t = now();
    let dirty = this.runBots();
    if (!this.paused) {
      if (this.phase === 'challenge') {
        for (const c of this.crews) {
          if (!c.locked && c.lockIn !== null && t >= c.lockIn) {
            this.tryLock(c);
            dirty = true;
          }
        }
      }
      if (this.phase === 'event' && this.mission) {
        const ev = this.mission.event;
        if (ev.stageEndsAt && t >= ev.stageEndsAt) {
          this.advanceEventStage();
          dirty = true;
        }
      } else if (this.deadline && t >= this.deadline) {
        this.deadline = null;
        if (this.phase === 'discovery') this.startChallenge();
        else if (this.phase === 'challenge') this.startEvent();
        dirty = true;
      }
    }
    if (this.adaptive(t)) dirty = true;
    if (dirty) this.changed(this.phase !== 'event');
  }

  private botChoice(c: Crew): string {
    const puzzle = c.puzzle!;
    const humanVotes = this.members(c)
      .filter((p) => !p.isBot && p.vote)
      .map((p) => p.vote as string);
    if (humanVotes.length && R() < 0.7) return pick(R, this.plurality(humanVotes));
    if (R() < 0.6) return puzzle.bestId;
    return pick(R, puzzle.options).id;
  }

  private runBots(): boolean {
    const m = this.mission;
    let acted = false;
    for (const p of this.players.values()) {
      if (!p.isBot) continue;
      const crew = this.crewOf(p);
      if (this.phase === 'scan') {
        if (this.objectVote?.open && !p.objectVote && R() < 0.3) {
          p.objectVote = pick(R, this.objectVote.options);
          acted = true;
        }
        continue;
      }
      if (!m) continue;
      if ((this.phase === 'discovery' || this.phase === 'challenge') && p.quizChoice === null && p.roles[0]) {
        if (R() < (this.phase === 'challenge' ? 0.5 : 0.12)) {
          const quiz = MISSIONS[m.id].quiz[p.roles[0]];
          const correct = R() < 0.78;
          p.quizChoice = correct ? quiz.answer : pick(R, quiz.options.map((_, i) => i).filter((i) => i !== quiz.answer));
          p.quizCorrect = correct;
          acted = true;
        }
      }
      if (this.phase === 'challenge' && crew?.puzzle) {
        if (!crew.locked) {
          if (!p.vote && R() < 0.09) {
            p.vote = this.botChoice(crew);
            this.evaluateLock(crew);
            acted = true;
          } else if (p.vote && crew.tie && R() < 0.3) {
            const humans = this.members(crew).filter((x) => !x.isBot && x.vote);
            const top = this.plurality(this.members(crew).map((x) => x.vote).filter(Boolean) as string[]);
            p.vote = humans.find((h) => top.includes(h.vote!))?.vote ?? top[0];
            this.evaluateLock(crew);
            acted = true;
          }
        } else {
          if (m.bonusActive && p.bonusChoice === null && R() < 0.2) {
            const bq = MISSIONS[m.id].bonus;
            const correct = R() < 0.7;
            p.bonusChoice = correct ? bq.answer : (bq.answer + 1) % bq.options.length;
            p.bonusCorrect = correct;
            acted = true;
          }
          if (!crew.log && this.members(crew).every((x) => x.isBot) && R() < 0.06) {
            crew.log = { text: pick(R, BOT_LOGS), by: p.name, byId: p.id };
            crew.logStars = heuristicStars(crew.log.text);
            acted = true;
          }
        }
      }
      if (this.phase === 'event') {
        if (m.event.stage === 'share' && p.shareVote === null && R() < 0.3) {
          const r = R();
          p.shareVote = r < 0.15 ? 0 : r < 0.6 ? 1 : 2;
          acted = true;
        }
        if (m.event.stage === 'action' && R() < 0.9) {
          p.taps += 1 + Math.floor(R() * 3);
          acted = true;
        }
      }
    }
    if (acted && this.phase === 'event') this.updateProgress();
    return acted;
  }

  /* ---------------- acciones de jugadores ---------------- */

  playerAction(playerId: string, a: PlayerAction): Ack {
    const p = this.players.get(playerId);
    if (!p) return err('No encontramos a tu astronauta. Vuelve a unirte.');
    p.lastSeen = now();
    p.connected = true;
    const crew = this.crewOf(p);
    const m = this.mission;
    switch (a.type) {
      case 'avatar':
        p.avatar = sanitizeAvatar(a.avatar);
        break;
      case 'objectVote':
        if (!this.objectVote?.open || !this.objectVote.options.includes(a.category)) return err('La votación no está abierta.');
        p.objectVote = a.category;
        break;
      case 'quiz': {
        if (!m || (this.phase !== 'discovery' && this.phase !== 'challenge')) return err('Ahora no hay transmisión que descifrar.');
        if (p.quizChoice !== null) return err('Ya descifraste tu transmisión.');
        const role = p.roles[0];
        if (!role) return err('Aún no tienes especialidad.');
        const quiz = MISSIONS[m.id].quiz[role];
        if (!Number.isInteger(a.choice) || a.choice < 0 || a.choice >= quiz.options.length) return err('Respuesta no válida.');
        p.quizChoice = a.choice;
        p.quizCorrect = a.choice === quiz.answer;
        break;
      }
      case 'vote':
        if (this.phase !== 'challenge' || !crew?.puzzle) return err('La votación no está abierta.');
        if (crew.locked) return err('Su tripulación ya bloqueó la decisión.');
        if (!crew.puzzle.options.some((o) => o.id === a.optionId)) return err('Opción no válida.');
        p.vote = a.optionId;
        this.evaluateLock(crew);
        break;
      case 'log': {
        if (!crew || !crew.locked || !m || (this.phase !== 'challenge' && this.phase !== 'event')) return err('La bitácora se escribe después de bloquear la decisión.');
        if (crew.log) return err('Su tripulación ya escribió la bitácora.');
        const text = String(a.text ?? '')
          .replace(/[\u0000-\u001f<>]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 220);
        if (text.length < 3) return err('Escribe al menos una frase.');
        crew.log = { text, by: p.name, byId: p.id };
        crew.logHidden = looksInappropriate(text);
        crew.logStars = crew.logHidden ? 1 : heuristicStars(text);
        break;
      }
      case 'bonus': {
        if (!m?.bonusActive) return err('No hay pregunta bonus activa.');
        if (p.bonusChoice !== null) return err('Ya respondiste.');
        const bq = MISSIONS[m.id].bonus;
        if (!Number.isInteger(a.choice) || a.choice < 0 || a.choice >= bq.options.length) return err('Respuesta no válida.');
        p.bonusChoice = a.choice;
        p.bonusCorrect = a.choice === bq.answer;
        break;
      }
      case 'share':
        if (this.phase !== 'event' || m?.event.stage !== 'share') return err('Ahora no se decide cuánto compartir.');
        if (![0, 1, 2].includes(a.amount)) return err('Cantidad no válida.');
        p.shareVote = a.amount;
        this.updateProgress();
        break;
      case 'taps': {
        if (this.phase !== 'event' || m?.event.stage !== 'action') return OK;
        const t = now();
        p.tapAllowance = Math.min(40, p.tapAllowance + ((t - p.tapStamp) / 1000) * 12);
        p.tapStamp = t;
        const n = Math.max(0, Math.min(Math.floor(Number(a.count) || 0), Math.floor(p.tapAllowance)));
        p.tapAllowance -= n;
        p.taps += n;
        this.updateProgress();
        this.changed(false);
        return OK;
      }
      default:
        return err('Acción desconocida.');
    }
    this.changed();
    return OK;
  }

  /* ---------------- vistas ---------------- */

  private pub(p: Player): PlayerPublic {
    return { id: p.id, name: p.name, avatar: p.avatar, isBot: p.isBot, connected: p.connected || p.isBot, crewId: p.crewId, roles: p.roles, xp: p.xp + p.sessionXp };
  }

  private crewStatus(c: Crew): CrewStatus {
    const ms = this.members(c);
    return {
      members: ms.length,
      connected: ms.filter((p) => p.connected || p.isBot).length,
      decoded: ms.filter((p) => p.quizChoice !== null).length,
      voted: ms.filter((p) => p.vote).length,
      locked: c.locked,
      lockIn: c.lockIn,
      tie: c.tie,
      decision: c.decision,
      share: c.share,
      shareVotes: ms.filter((p) => p.shareVote !== null).length,
      taps: this.tapsByRole(c),
      rolesPresent: this.rolesPresent(c),
      action: Math.round(this.crewAction(c) * 100) / 100,
      protocol: c.protocol,
      log: c.log ? (c.logHidden ? 'Bitácora oculta por IX' : c.log.text) : null,
      logBy: c.log?.by ?? null,
      logStars: c.log ? c.logStars : null,
      logComment: c.logComment,
      logHidden: c.logHidden,
      bonusCorrect: ms.filter((p) => p.bonusCorrect).length,
    };
  }

  private missionPublic(): MissionPublic | null {
    const m = this.mission;
    if (!m) return null;
    return {
      id: m.id,
      category: m.scan.category,
      objectLabel: m.scan.label,
      discovery: m.scan.discovery,
      funFact: m.scan.funFact,
      briefing: m.briefing,
      crewLines: m.crewLines,
      twists: m.twists,
      twistsRevealed: m.twistsRevealed,
      aiNarrative: m.aiNarrative,
      source: m.scan.source,
      puzzleTitle: this.crews.find((c) => c.puzzle)?.puzzle?.title ?? '',
      puzzleQuestion: this.crews.find((c) => c.puzzle)?.puzzle?.question ?? '',
    };
  }

  hostView(): HostView {
    const crewPlayers = this.crewPlayers();
    const answered = crewPlayers.filter((p) => p.quizChoice !== null);
    const all = [...this.players.values()];
    const m = this.mission;
    const counts: Partial<Record<CategoryId, number>> = {};
    for (const p of all) if (p.objectVote) counts[p.objectVote] = (counts[p.objectVote] ?? 0) + 1;
    return {
      role: 'host',
      now: now(),
      code: this.code,
      className: this.className,
      difficulty: this.difficulty,
      pace: this.pace,
      phase: this.phase,
      deadline: this.activeDeadline(),
      paused: this.paused,
      pausedRemaining: this.pausedRemaining,
      players: all.map((p) => this.pub(p)),
      progress: Object.fromEntries(
        all.map((p) => [
          p.id,
          {
            decoded: p.quizChoice !== null,
            correct: p.quizCorrect,
            voted: Boolean(p.vote),
            share: p.shareVote,
            taps: p.taps,
            bonus: p.bonusCorrect,
            sessionXp: p.sessionXp,
            badges: p.badges,
          },
        ]),
      ),
      crews: this.crews.map((c) => ({ id: c.id, name: c.name, sectorId: c.sectorId, memberIds: c.memberIds, status: this.crewStatus(c), outcome: c.outcome, health: this.crewHealth(c) })),
      colony: this.colony,
      mission: this.missionPublic(),
      event: m && this.phase === 'event' ? { ...m.event } : m && (this.phase === 'results' || this.phase === 'debrief') ? { ...m.event } : null,
      results: m?.results ?? null,
      debrief: m?.debrief ?? null,
      objectVote: this.objectVote ? { options: this.objectVote.options, counts, total: all.filter((p) => p.objectVote).length, open: this.objectVote.open } : null,
      ix: this.ix.slice(-14),
      ai: ai.aiStatus(),
      stats: {
        players: all.length,
        connected: all.filter((p) => p.connected || p.isBot).length,
        quizAnswered: answered.length,
        quizCorrect: answered.filter((p) => p.quizCorrect).length,
        votes: crewPlayers.filter((p) => p.vote).length,
        bonusAnswered: crewPlayers.filter((p) => p.bonusChoice !== null).length,
        bonusCorrect: crewPlayers.filter((p) => p.bonusCorrect).length,
      },
      bonusActive: Boolean(m?.bonusActive),
      finalUnlocked: this.finalUnlocked,
      missionsPlayed: this.missionsPlayed,
      nasa: m?.nasa ?? null,
    };
  }

  playerView(playerId: string): PlayerView | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    const crew = this.crewOf(p);
    const m = this.mission;
    const def = m ? MISSIONS[m.id] : null;
    const idx = PHASE_FLOW.indexOf(this.phase);
    const at = (ph: Phase) => idx >= PHASE_FLOW.indexOf(ph);
    const inMission = Boolean(m && crew && at('briefing'));

    let quiz: QuizView | null = null;
    if (inMission && def && p.roles[0] && at('discovery')) {
      const q = def.quiz[p.roles[0]];
      const answered = p.quizChoice !== null;
      quiz = {
        q: q.q,
        options: q.options,
        answered,
        correct: answered ? Boolean(p.quizCorrect) : null,
        choice: p.quizChoice,
        explain: answered ? q.explain : null,
        answer: answered ? q.answer : null,
      };
    }
    const intel =
      inMission && crew?.puzzle && at('discovery') && (p.quizChoice !== null || at('challenge'))
        ? p.roles.map((r) => crew.puzzle!.intel[r])
        : null;

    const members = crew ? this.members(crew) : [];
    const challenge =
      inMission && crew?.puzzle && at('challenge')
        ? {
            title: crew.puzzle.title,
            question: crew.puzzle.question,
            options: crew.puzzle.options,
            votes: Object.fromEntries(members.filter((x) => x.vote).map((x) => [x.id, x.vote as string])),
            myVote: p.vote,
            locked: crew.locked,
            lockIn: crew.lockIn,
            tie: crew.tie,
            decision: crew.decision,
            log: crew.log && !crew.logHidden ? { text: crew.log.text, by: crew.log.by } : crew.log ? { text: 'Bitácora enviada.', by: crew.log.by } : null,
          }
        : null;

    let bonus: QuizView | null = null;
    if (m?.bonusActive && def && crew?.locked) {
      const answered = p.bonusChoice !== null;
      bonus = {
        q: def.bonus.q,
        options: def.bonus.options,
        answered,
        correct: answered ? Boolean(p.bonusCorrect) : null,
        choice: p.bonusChoice,
        explain: answered ? def.bonus.explain : null,
        answer: answered ? def.bonus.answer : null,
      };
    }

    const event =
      inMission && def && crew && at('event')
        ? {
            ...m!.event,
            title: def.event.title,
            narrative: def.event.narrative,
            shareLabel: def.event.shareLabel,
            shareUnit: def.event.shareUnit,
            action: def.event.actions[p.roles[0] ?? 'power'],
            myShareVote: p.shareVote,
            shareVotes: Object.fromEntries(members.filter((x) => x.shareVote !== null).map((x) => [x.id, x.shareVote as number])),
            crewShare: crew.share,
            myTaps: p.taps,
            crewTaps: this.tapsByRole(crew),
            rolesPresent: this.rolesPresent(crew),
            target: this.tapTarget(),
            protocol: crew.protocol,
          }
        : null;

    const outcome =
      inMission && crew?.outcome && at('results') && m?.results
        ? {
            ...crew.outcome,
            saved: m.results.saved,
            xpGained: p.xpGained,
            newBadges: p.newBadges,
            rank: Math.max(1, m.results.ranking.findIndex((r) => r.crewId === crew.id) + 1),
            crews: this.crews.length,
          }
        : null;

    const hints = m?.hints.filter((h) => (!h.crewId || h.crewId === p.crewId) && h.at >= this.phaseStartedAt - 1500) ?? [];

    return {
      role: 'player',
      now: now(),
      code: this.code,
      phase: this.phase,
      deadline: this.activeDeadline(),
      paused: this.paused,
      pausedRemaining: this.pausedRemaining,
      difficulty: this.difficulty,
      pace: this.pace,
      me: { ...this.pub(p), sessionXp: p.sessionXp, badges: p.badges },
      crew: crew ? { id: crew.id, name: crew.name, sectorId: crew.sectorId, memberIds: crew.memberIds, members: members.map((x) => this.pub(x)) } : null,
      mission: inMission ? this.missionPublic() : null,
      quiz,
      intel,
      challenge,
      bonus,
      event,
      outcome,
      debrief: inMission && this.phase === 'debrief' ? (m?.debrief ?? null) : null,
      objectVote: this.objectVote ? { options: this.objectVote.options, myVote: p.objectVote, open: this.objectVote.open } : null,
      hint: hints[hints.length - 1] ?? null,
      nasa:
        inMission && m?.nasa
          ? {
              science: m.nasa.science?.highlight ?? null,
              weather: m.nasa.weather,
              health: m.nasa.health && crew ? { ...m.nasa.health, ...this.crewHealth(crew)! } : null,
            }
          : null,
    };
  }

  playerIds(): string[] {
    return [...this.players.values()].filter((p) => !p.isBot).map((p) => p.id);
  }
}
