// Entrenador de misión: guarda el historial del astronauta en el dispositivo y arma cada reto.
//
//   1. El motor prepara un escenario por simulador recomendado (números reales, con semilla).
//   2. Se piden datos reales a la NASA: clima espacial (DONKI) y estudios (NTRS + OSDR).
//   3. La IA (Claude) elige el reto que más le sirve a este astronauta y lo narra.
//   4. Sin IA o sin conexión, el mismo motor arma el reto con plantillas: siempre se puede jugar.

import type { NasaStudy, SpaceWeather } from '../../shared/nasa';
import {
  SIMS,
  SIM_ORDER,
  isSimId,
  localChallenge,
  makeScenario,
  nextLevel,
  recommend,
  type Challenge,
  type Scenario,
  type SimId,
  type SimResult,
  type Skills,
} from '../../shared/trainer';
import type { RoleId } from '../../shared/types';
import { ROLES } from '../../shared/content';
import { nasaStudies, spaceWeather } from '../lib/nasa';
import { coachFeedback, pickTrainerChallenge, type CoachNote } from './ai';

const KEY = 'donrover.entrenador.v1';

export interface TrainerSave {
  skills: Skills;
  /** Últimos retos jugados (para no repetir y para el resumen). */
  history: { sim: SimId; level: number; stars: number; at: number }[];
}

export function loadTrainer(): TrainerSave {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<TrainerSave> | null;
    const skills: Skills = {};
    for (const id of SIM_ORDER) {
      const k = raw?.skills?.[id];
      if (k && Number.isFinite(k.plays)) skills[id] = { plays: k.plays | 0, wins: k.wins | 0, best: Math.min(100, Math.max(0, Number(k.best) || 0)), level: Math.min(3, Math.max(0, k.level | 0)) as 0 | 1 | 2 | 3, last: Number(k.last) || 0 };
    }
    const history = Array.isArray(raw?.history) ? raw!.history.filter((h) => isSimId(h?.sim)).slice(-30) : [];
    return { skills, history };
  } catch {
    return { skills: {}, history: [] };
  }
}

export function saveTrainer(save: TrainerSave): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* almacenamiento no disponible */
  }
}

/** Qué le falta a la base del jugador (modo libre), para que la IA lo tenga en cuenta. */
export interface BaseBrief {
  modules: number;
  missing: string[];
}

export interface ChallengeContext {
  name: string;
  role: RoleId | null;
  xp: number;
  skills: Skills;
  last: SimId | null;
  base: BaseBrief | null;
  /** Fuerza un simulador y un nivel concretos (práctica libre). */
  sim?: SimId;
  level?: 1 | 2 | 3;
}

export interface BuiltChallenge {
  challenge: Challenge;
  weather: SpaceWeather | null;
}

const newSeed = () => (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;

/** Arma el siguiente reto: motor + NASA + IA (con plantillas de respaldo). */
export async function buildChallenge(ctx: ChallengeContext): Promise<BuiltChallenge> {
  const weather = await spaceWeather().catch(() => null);
  const activity = weather?.level ?? 0;

  // Candidatos: los simuladores que más conviene entrenar ahora (o el elegido a mano).
  const picks: SimId[] = [];
  if (ctx.sim) picks.push(ctx.sim);
  else {
    let avoid: SimId | null = ctx.last;
    const pool: Skills = { ...ctx.skills };
    for (let i = 0; i < 3; i++) {
      const id = recommend(pool, { role: ctx.role, solarActivity: activity, avoid });
      if (picks.includes(id)) break;
      picks.push(id);
      // Para el siguiente candidato se finge que este ya está dominado.
      pool[id] = { plays: 9, wins: 9, best: 100, level: 3, last: 100 };
      avoid = null;
    }
  }
  const scenarios = new Map<SimId, Scenario>();
  for (const id of picks) {
    const level = ctx.sim && ctx.level ? ctx.level : nextLevel(ctx.skills[id]);
    scenarios.set(id, makeScenario(id, level, newSeed(), { spe: id === 'shield' && activity >= 2 ? Math.min(3, level + 1) : undefined }));
  }

  // Estudios reales de la NASA para cada candidato (en paralelo, con caché en el servidor).
  const found = await Promise.all(picks.map((id) => nasaStudies(SIMS[id].topics.ntrs, SIMS[id].topics.osdr, 2).catch(() => [] as NasaStudy[])));
  const studies = picks.flatMap((id, i) => found[i].map((s) => ({ ...s, sim: id })));

  const options = picks.map((id) => {
    const s = scenarios.get(id)!;
    return { sim: id, name: SIMS[id].name, need: SIMS[id].need, level: s.level, objective: SIMS[id].objective(s), events: s.events.map((e) => `Sol ${e.sol}: ${e.text}`) };
  });
  const ai = await pickTrainerChallenge({
    astronaut: { name: ctx.name, specialty: ctx.role ? ROLES[ctx.role].specialty : '', xp: ctx.xp },
    skills: SIM_ORDER.map((id) => ({ sim: id, name: SIMS[id].name, ...(ctx.skills[id] ?? { plays: 0, wins: 0, best: 0, level: 0, last: 0 }) })),
    base: ctx.base,
    weather: weather ? { level: weather.level, label: weather.label, headline: weather.headline, flares: weather.flares, strongestFlare: weather.strongestFlare, cmes: weather.cmes } : null,
    last: ctx.last ?? '',
    options,
    studies: studies.map((s) => ({ id: s.id, sim: s.sim, source: s.source, title: s.title, summary: s.summary.slice(0, 600) })),
  }).catch(() => null);

  const chosen: SimId = ai && isSimId(ai.sim) && scenarios.has(ai.sim) ? ai.sim : picks[0];
  const scenario = scenarios.get(chosen)!;
  const base = localChallenge(ctx.skills, { name: ctx.name, role: ctx.role, solarActivity: activity, sim: chosen, seed: scenario.seed });
  const study = (ai?.studyId ? studies.find((s) => s.id === ai.studyId && s.sim === chosen) : null) ?? studies.find((s) => s.sim === chosen) ?? null;
  const challenge: Challenge = {
    ...base,
    scenario,
    title: ai?.title || base.title,
    briefing: ai?.briefing || base.briefing,
    why: ai?.why || (activity >= 2 && chosen === 'shield' ? `El Sol está activo de verdad (NASA DONKI: ${weather!.label.toLowerCase()}). Es el momento de entrenar el blindaje.` : base.why),
    tip: ai?.tip || base.tip,
    study: study ? { title: ai?.studyTitle || study.title, summary: ai?.studySummary || study.summary.slice(0, 260), url: study.url, source: study.source } : null,
    ai: Boolean(ai),
  };
  return { challenge, weather };
}

/** Retroalimentación personal después de una corrida (IA si hay; si no, la lección del motor). */
export async function coach(name: string, c: Challenge, input: Record<string, number>, r: SimResult): Promise<CoachNote | null> {
  const def = SIMS[c.scenario.sim];
  const controls = def.controls(c.scenario).map((k) => ({ control: k.label, value: k.options ? k.options[Math.round(input[k.id] ?? 0)] : `${input[k.id]} ${k.unit}`.trim() }));
  return coachFeedback({
    astronaut: name,
    simulator: def.name,
    need: def.need,
    level: c.scenario.level,
    objective: def.objective(c.scenario),
    decisions: controls,
    result: { success: r.ok, stars: r.stars, failed_sol: r.failedSol, verdict: r.verdict },
    measures: r.metrics.map((m) => ({ measure: m.label, value: `${m.value} ${m.unit}`, needed: m.need ?? null, ok: m.ok })),
    physics: r.math,
  }).catch(() => null);
}
