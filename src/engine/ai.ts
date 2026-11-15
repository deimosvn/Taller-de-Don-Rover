// Capa de IA del Taller de Don Rover con Claude (Opus 5.5).
//
// Principio de diseño: "la IA narra, el motor decide". Claude genera la misión a partir de
// datos reales de la NASA (y las tareas de cada especialidad), personaliza la narrativa, evalúa las bitácoras y redacta el debrief, siempre con salidas
// estructuradas (JSON Schema). Recursos, consecuencias y puntajes los calcula el motor.
//
// Orden de preferencia:
//   1. IA del servidor (función /api/ai en Vercel con ANTHROPIC_API_KEY): la clave nunca
//      llega al navegador.
//   2. Clave que el profesor escribe en Ajustes (se guarda solo en su navegador).
//   3. Sin IA: las reglas del motor eligen la misión y se usan plantillas.
// Las instrucciones del modo servidor viven en api/ai.ts: mantener ambos textos en sintonía.

import type Anthropic from '@anthropic-ai/sdk';
import type { MissionId, RoleId } from '../../shared/types';
import { serverAi, serverStatus, type AiTask } from '../lib/cloud';
import { loadSettings } from './settings';

type Sdk = typeof import('@anthropic-ai/sdk');

let sdkPromise: Promise<Sdk> | null = null;
let client: Anthropic | null = null;
let clientKey = '';
let disabledKey = '';
let useServerFallbacks = true;

const loadSdk = () => (sdkPromise ??= import('@anthropic-ai/sdk'));

export function aiStatus(): { enabled: boolean; model: string; server: boolean } {
  const server = serverStatus().ai;
  if (server?.enabled) return { enabled: true, model: server.model, server: true };
  const s = loadSettings();
  return { enabled: Boolean(s.apiKey) && s.apiKey !== disabledKey, model: s.model || 'claude-opus-5-5', server: false };
}

async function getClient(): Promise<{ c: Anthropic; mod: Sdk; model: string } | null> {
  const s = loadSettings();
  if (!s.apiKey || s.apiKey === disabledKey) return null;
  const mod = await loadSdk();
  if (!client || clientKey !== s.apiKey) {
    client = new mod.default({ apiKey: s.apiKey, dangerouslyAllowBrowser: true, timeout: 40_000, maxRetries: 1 });
    clientKey = s.apiKey;
    useServerFallbacks = true;
  }
  return { c: client, mod, model: s.model || 'claude-opus-5-5' };
}

/** Verifica la clave sin generar texto (consulta el modelo configurado). */
export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const got = await getClient();
    if (!got) return { ok: false, message: 'Escribe una clave de API primero.' };
    const info = await got.c.models.retrieve(got.model);
    return { ok: true, message: `Conectado: ${info.display_name ?? got.model}` };
  } catch (err) {
    return { ok: false, message: (err as Error).message.slice(0, 180) };
  }
}

type Content = string | Anthropic.Beta.BetaContentBlockParam[];

async function structured<T>(
  task: AiTask,
  serverInput: Record<string, unknown>,
  system: string,
  content: Content,
  schema: Record<string, unknown>,
  validate: (x: unknown) => T | null,
): Promise<T | null> {
  // 1) Claude en el servidor de Vercel (si el despliegue tiene ANTHROPIC_API_KEY).
  if (serverStatus().ai?.enabled) {
    const raw = await serverAi(task, serverInput).catch(() => null);
    if (raw !== null) {
      try {
        const ok = validate(raw);
        if (ok) return ok;
      } catch {
        /* respuesta inesperada: se intenta con la clave del navegador o con plantillas */
      }
    }
  }
  // 2) Clave escrita por el profesor en Ajustes.
  const got = await getClient().catch(() => null);
  if (!got) return null;
  const { c, mod, model } = got;
  const base = {
    model,
    max_tokens: 16000,
    system,
    output_config: { effort: 'low' as const, format: { type: 'json_schema' as const, schema } },
    messages: [{ role: 'user' as const, content }],
  };
  try {
    let res: Anthropic.Beta.BetaMessage;
    try {
      res = useServerFallbacks
        ? await c.beta.messages.create({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
        : await c.beta.messages.create(base);
    } catch (err) {
      const retryable = err instanceof mod.default.BadRequestError || err instanceof mod.default.APIConnectionError;
      if (useServerFallbacks && retryable) {
        // Algunas cuentas o navegadores no aceptan los fallbacks del servidor: reintentamos sin ellos.
        console.warn('[ai] reintentando sin fallbacks del servidor:', (err as Error).message);
        useServerFallbacks = false;
        res = await c.beta.messages.create(base);
      } else {
        throw err;
      }
    }
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') {
      console.warn('[ai] respuesta incompleta:', res.stop_reason);
      return null;
    }
    const text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return validate(JSON.parse(text));
  } catch (err) {
    if (err instanceof mod.default.AuthenticationError || err instanceof mod.default.PermissionDeniedError) {
      console.warn('[ai] la clave no es válida; el Taller de Don Rover seguirá con IA local y plantillas.');
      disabledKey = clientKey;
    } else if (err instanceof mod.default.RateLimitError) {
      console.warn('[ai] límite de uso alcanzado; se usan plantillas.');
    } else if (err instanceof mod.default.APIError) {
      console.warn(`[ai] error de la API (${err.status}):`, err.message);
    } else {
      console.warn('[ai] error:', (err as Error).message);
    }
    return null;
  }
}

const str = (x: unknown, max = 400) => (typeof x === 'string' ? x.trim().slice(0, max) : '');
const obj = (x: unknown) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {});

/* ------------------------------------------------------------------ */
/* 1 · Escáner del mundo                                                */
/* ------------------------------------------------------------------ */
/* 1 · Generar la misión con datos reales de la NASA                     */
/* ------------------------------------------------------------------ */

export interface PlanInput {
  ageGroup: string;
  /** Condiciones reales en palabras (clima espacial NASA DONKI y estado de la colonia). */
  conditions: string[];
  meters: Record<string, number>;
  missionsDone: string[];
  candidates: { id: MissionId; title: string; focus: string; story: string }[];
  suggested: MissionId;
  roles: { role: RoleId; base: { title: string; text: string; facts: string[] }; link: string }[];
}

export interface MissionPlan {
  missionId: MissionId;
  reason: string;
  tasks: Partial<Record<RoleId, { title: string; text: string }>>;
}

const PLAN_SCHEMA = {
    type: 'object',
    properties: {
      mission_id: { type: 'string' },
      reason_es: { type: 'string' },
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            role: { type: 'string', enum: ['power', 'life', 'bio', 'habitat'] },
            title_es: { type: 'string' },
            text_es: { type: 'string' },
          },
          required: ['role', 'title_es', 'text_es'],
          additionalProperties: false,
        },
      },
    },
    required: ['mission_id', 'reason_es', 'tasks'],
    additionalProperties: false,
  };

const ROLE_IDS: RoleId[] = ['power', 'life', 'bio', 'habitat'];

export async function planMission(input: PlanInput): Promise<MissionPlan | null> {
  const system = `Eres IX, la IA de la colonia en el Taller de Don Rover, un videojuego cooperativo de misiones en Marte para el salón de clases.
Una partida es UNA tripulación de máximo 4 alumnos, uno por especialidad: power (Energía), life (Soporte vital), bio (Astrobiología) y habitat (Hábitat).
Tu trabajo: generar la siguiente misión a partir de condiciones reales.
1. "mission_id": elige UNA de "candidates" (usa su id exacto). Elige la que mejor responda a los problemas reales de "conditions" (clima espacial de la NASA DONKI y estado de la colonia). "suggested" es la sugerencia de las reglas del motor: úsala si no hay una razón mejor.
2. "reason_es": por qué IX generó esta misión, en una o dos frases (máximo 35 palabras), citando un dato real de "conditions".
3. "tasks": exactamente 4, una por especialidad (power, life, bio, habitat). Cada una con "title_es" (máximo 8 palabras) y "text_es" (máximo 40 palabras), en segunda persona del singular.
   Las tareas deben estar conectadas como dice "link" de cada especialidad: Hábitat protege los paneles de Energía, Energía alimenta las bombas de Soporte vital, el agua de Soporte vital llega a los cultivos de Astrobiología y la comida fresca da fuerza a Hábitat. Cada texto debe decir de quién depende o a quién ayuda.
Reglas estrictas:
- Español de México, para niñas y niños de ${input.ageGroup}, con tono de videojuego: claro, urgente y amable.
- Usa solo los números que aparecen en "conditions" y en "base"; no inventes datos científicos, porcentajes ni reglas: el motor del juego controla recursos y puntajes.
- No menciones marcas, personas reales ni nada fuera de la misión.`;
  return structured('plan', { ...input }, system, JSON.stringify(input), PLAN_SCHEMA, (x) => {
    const o = obj(x);
    const id = str(o.mission_id, 30) as MissionId;
    if (!input.candidates.some((c) => c.id === id)) return null;
    const tasks: MissionPlan['tasks'] = {};
    if (Array.isArray(o.tasks)) {
      for (const item of o.tasks) {
        const t = obj(item);
        const role = str(t.role, 10) as RoleId;
        if (!ROLE_IDS.includes(role)) continue;
        const title = str(t.title_es, 80);
        const text = str(t.text_es, 320);
        if (title && text) tasks[role] = { title, text };
      }
    }
    return { missionId: id, reason: str(o.reason_es, 300), tasks };
  });
}

/* ------------------------------------------------------------------ */
/* 2 · Narrativa de la misión (dentro de plantillas)                    */
/* ------------------------------------------------------------------ */

export interface NarrativeInput {
  ageGroup: string;
  className: string;
  /** Por qué IX generó la misión (condiciones reales). */
  reason: string;
  mission: { title: string; titleEs: string; hook: string; story: string; objective: string; twist: string; twists: string[] };
  crews: { id: string; name: string; sector: string }[];
  /** Investigaciones reales de la NASA (NTRS + OSDR) en las que se basa la misión. */
  studies?: { id: string; source: string; title: string; summary: string; year: number | null }[];
}

export interface NarrativeScience {
  studyId: string;
  title: string;
  summary: string;
  connection: string;
}

export interface Narrative {
  briefing: string;
  crewLines: Record<string, string>;
  twists: string[];
  science: NarrativeScience | null;
}

const NARRATIVE_SCHEMA = {
  type: 'object',
  properties: {
    briefing: { type: 'string' },
    crew_lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: { crew_id: { type: 'string' }, line: { type: 'string' } },
        required: ['crew_id', 'line'],
        additionalProperties: false,
      },
    },
    twists: { type: 'array', items: { type: 'string' } },
    science: {
      type: 'object',
      properties: {
        study_id: { type: 'string' },
        title_es: { type: 'string' },
        summary_es: { type: 'string' },
        connection_es: { type: 'string' },
      },
      required: ['study_id', 'title_es', 'summary_es', 'connection_es'],
      additionalProperties: false,
    },
  },
  required: ['briefing', 'crew_lines', 'twists', 'science'],
  additionalProperties: false,
};

export async function generateNarrative(input: NarrativeInput): Promise<Narrative | null> {
  const studies = (input.studies ?? []).slice(0, 4);
  const system = `Eres IX, la IA narradora del Taller de Don Rover, un videojuego cooperativo de misiones espaciales para el salón de clases.
Escribe en español de México, con tono de videojuego: urgente, emocionante y amable, para niñas y niños de ${input.ageGroup}.
Reglas estrictas:
- No inventes números, porcentajes, datos científicos nuevos ni reglas: el motor del juego controla recursos y consecuencias.
- Mantente dentro de la historia y el giro de la plantilla.
- "briefing": máximo 60 palabras, en segunda persona del plural; cuenta por qué IX generó esta misión ("reason": condiciones reales de la NASA).
- "crew_lines": una línea por tripulación (máximo 18 palabras) que explique qué parte del problema le toca a su sector.
- "twists": exactamente 3 avances breves (máximo 12 palabras cada uno) de los acontecimientos inesperados, en este orden: datos nuevos, emergencia global, descubrimiento.
Investigación real:
- "studies" trae investigaciones reales de la NASA (NTRS y OSDR, en inglés). Elige la más relevante para esta misión y úsala como base científica: el briefing debe contar en una frase lo que investigó ese estudio, sin inventar resultados que no estén en su resumen.
- "science": study_id (exactamente el id del estudio elegido), title_es (título traducido y claro, máximo 14 palabras), summary_es (qué investigaron y qué encontraron, para niñas y niños, máximo 45 palabras, solo con información del resumen), connection_es (cómo se conecta con la misión de la colonia, máximo 25 palabras). Si "studies" viene vacío, deja los cuatro campos vacíos.`;
  return structured('narrative', { ...input, studies }, system, JSON.stringify({ ...input, studies }), NARRATIVE_SCHEMA, (x) => {
    const o = obj(x);
    const briefing = str(o.briefing, 600);
    if (!briefing) return null;
    const crewLines: Record<string, string> = {};
    if (Array.isArray(o.crew_lines)) {
      for (const item of o.crew_lines) {
        const it = obj(item);
        const id = str(it.crew_id, 40);
        if (input.crews.some((c) => c.id === id)) crewLines[id] = str(it.line, 200);
      }
    }
    const twists = Array.isArray(o.twists) ? o.twists.map((t) => str(t, 140)).filter(Boolean).slice(0, 3) : [];
    const sc = obj(o.science);
    const studyId = str(sc.study_id, 40);
    const science =
      studyId && studies.some((s) => s.id === studyId) && str(sc.title_es, 160)
        ? { studyId, title: str(sc.title_es, 160), summary: str(sc.summary_es, 360), connection: str(sc.connection_es, 220) }
        : null;
    return { briefing, crewLines, twists: twists.length === 3 ? twists : input.mission.twists, science };
  });
}

/* ------------------------------------------------------------------ */
/* 3 · Bitácoras de las tripulaciones (creatividad y razonamiento)      */
/* ------------------------------------------------------------------ */

export interface LogInput {
  crew_id: string;
  decision: string;
  was_best: boolean;
  text: string;
}
export interface LogScore {
  stars: number;
  comment: string;
  appropriate: boolean;
}

const LOG_SCHEMA = {
  type: 'object',
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          crew_id: { type: 'string' },
          stars: { type: 'integer' },
          comment: { type: 'string' },
          appropriate: { type: 'boolean' },
        },
        required: ['crew_id', 'stars', 'comment', 'appropriate'],
        additionalProperties: false,
      },
    },
  },
  required: ['scores'],
  additionalProperties: false,
};

export async function scoreLogs(missionTitle: string, ageGroup: string, logs: LogInput[]): Promise<Record<string, LogScore> | null> {
  if (!logs.length) return {};
  const system = `Eres IX, la IA del Taller de Don Rover. Evalúas bitácoras breves escritas por tripulaciones de niñas y niños (${ageGroup}) que explican su decisión en la misión "${missionTitle}".
Califica de 1 a 3 estrellas el razonamiento y la creatividad: 3 = explica con datos de su tripulación o propone una idea original; 2 = explica algo con sentido; 1 = muy breve o sin relación.
Si el texto es ofensivo, inapropiado o contiene datos personales, marca appropriate=false y da 1 estrella.
"comment": retroalimentación amable y específica en español, máximo 18 palabras, dirigida a la tripulación. No reveles cuál era la respuesta correcta.`;
  return structured('logs', { missionTitle, ageGroup, logs }, system, JSON.stringify({ logs }), LOG_SCHEMA, (x) => {
    const o = obj(x);
    if (!Array.isArray(o.scores)) return null;
    const out: Record<string, LogScore> = {};
    for (const item of o.scores) {
      const it = obj(item);
      const id = str(it.crew_id, 40);
      if (!logs.some((l) => l.crew_id === id)) continue;
      const stars = Math.max(1, Math.min(3, Math.round(Number(it.stars) || 1)));
      out[id] = { stars, comment: str(it.comment, 160), appropriate: it.appropriate !== false };
    }
    return out;
  });
}

/* ------------------------------------------------------------------ */
/* 4 · Debrief                                                          */
/* ------------------------------------------------------------------ */

export interface DebriefInput {
  ageGroup: string;
  mission: string;
  learningGoals: string[];
  saved: boolean;
  quizAccuracy: number;
  crews: { crew_id: string; name: string; result: string; total: number }[];
  colonyChanges: Record<string, number>;
  chain: string[];
}
export interface DebriefOut {
  headline: string;
  learnings: string[];
  shoutouts: { crewId: string; text: string }[];
  reflection: string;
}

const DEBRIEF_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    learnings: { type: 'array', items: { type: 'string' } },
    shoutouts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { crew_id: { type: 'string' }, text: { type: 'string' } },
        required: ['crew_id', 'text'],
        additionalProperties: false,
      },
    },
    reflection: { type: 'string' },
  },
  required: ['headline', 'learnings', 'shoutouts', 'reflection'],
  additionalProperties: false,
};

export async function generateDebrief(input: DebriefInput): Promise<DebriefOut | null> {
  const system = `Eres IX, la IA del Taller de Don Rover. Escribe el debrief final de la misión para proyectarlo en el salón.
Español claro y cálido para niñas y niños de ${input.ageGroup}. Usa SOLO la información proporcionada: no inventes cifras ni datos científicos nuevos.
- "headline": máximo 10 palabras.
- "learnings": exactamente 3 ideas clave (máximo 28 palabras cada una), basadas en los objetivos de aprendizaje y en lo que pasó en la colonia.
- "shoutouts": hasta 3 reconocimientos específicos y positivos (máximo 20 palabras) usando crew_id; reconoce la cooperación, no solo los aciertos.
- "reflection": una pregunta abierta para conversar en clase (máximo 20 palabras).`;
  return structured('debrief', { ...input }, system, JSON.stringify(input), DEBRIEF_SCHEMA, (x) => {
    const o = obj(x);
    const headline = str(o.headline, 90);
    const learnings = Array.isArray(o.learnings) ? o.learnings.map((l) => str(l, 240)).filter(Boolean).slice(0, 3) : [];
    if (!headline || learnings.length < 2) return null;
    const shoutouts = Array.isArray(o.shoutouts)
      ? o.shoutouts
          .map((s) => obj(s))
          .map((s) => ({ crewId: str(s.crew_id, 40), text: str(s.text, 180) }))
          .filter((s) => input.crews.some((c) => c.crew_id === s.crewId) && s.text)
          .slice(0, 3)
      : [];
    return { headline, learnings, shoutouts, reflection: str(o.reflection, 200) };
  });
}


/* ------------------------------------------------------------------ */
/* 5 · Entrenador de misión: retos personalizados                       */
/* ------------------------------------------------------------------ */
// Mantener estos textos en sintonía con api/ai.ts.

const TRAINER_SIMS = ['solar', 'oxygen', 'water', 'greenhouse', 'shield', 'landing'];

const TRAINER_SYSTEM = `Eres IX, la IA entrenadora del Taller de Don Rover: un entrenador de misión para astronautas junior (8 a 16 años) que aprenden a dirigir una base en Marte.
Tu trabajo: elegir UNO de los retos de "options" para este astronauta y presentarlo. Cada reto es un simulador con física real; los números ya los fijó el motor del juego.
Cómo elegir (personaliza de verdad):
- Mira "skills": prioriza lo que nunca ha entrenado o donde su última nota fue baja; si domina algo, no lo repitas salvo que sea de su especialidad.
- Mira "base": si a su base le falta energía, agua, aire, comida o blindaje, elige el reto que le enseña a resolver justo eso.
- Mira "weather" (clima espacial real de la NASA, DONKI): si el Sol está activo, el reto de blindaje es urgente.
- No elijas el reto "last" si hay otra opción razonable.
Cómo escribir (español de México, tono de videojuego, cálido y emocionante):
- "sim": exactamente el valor "sim" de la opción elegida.
- "title": máximo 7 palabras.
- "briefing": máximo 55 palabras, hablándole de tú y por su nombre. Cuenta la situación de la colonia como una historia. Usa SOLO los números que aparecen en "objective" de la opción elegida; no inventes cifras, fechas ni datos científicos.
- "why": máximo 28 palabras: por qué elegiste este reto para esta persona (su historial, su base o el clima espacial real).
- "tip": máximo 24 palabras: una pista para pensar el problema, sin dar la respuesta ni valores concretos.
Investigación real:
- "studies" trae estudios reales de la NASA (NTRS y OSDR, en inglés) con el campo "sim" al que pertenecen. Si hay alguno del reto elegido, úsalo: "study_id" (su id exacto), "study_title_es" (título traducido, máximo 14 palabras) y "study_summary_es" (qué investigaron, para jóvenes, máximo 40 palabras, solo con información de su resumen). Si no hay ninguno del reto elegido, deja los tres campos vacíos.`;

const TRAINER_SCHEMA = {
  type: 'object',
  properties: {
    sim: { type: 'string', enum: TRAINER_SIMS },
    title: { type: 'string' },
    briefing: { type: 'string' },
    why: { type: 'string' },
    tip: { type: 'string' },
    study_id: { type: 'string' },
    study_title_es: { type: 'string' },
    study_summary_es: { type: 'string' },
  },
  required: ['sim', 'title', 'briefing', 'why', 'tip', 'study_id', 'study_title_es', 'study_summary_es'],
  additionalProperties: false,
};

export interface TrainerPick {
  sim: string;
  title: string;
  briefing: string;
  why: string;
  tip: string;
  studyId: string;
  studyTitle: string;
  studySummary: string;
}

/** La IA elige uno de los retos que preparó el motor y lo narra para este astronauta. */
export async function pickTrainerChallenge(input: Record<string, unknown>): Promise<TrainerPick | null> {
  return structured('trainer', input, TRAINER_SYSTEM, JSON.stringify(input).slice(0, 20_000), TRAINER_SCHEMA, (raw) => {
    const o = obj(raw);
    const sim = str(o.sim, 20);
    if (!TRAINER_SIMS.includes(sim) || !str(o.title) || !str(o.briefing)) return null;
    return { sim, title: str(o.title, 80), briefing: str(o.briefing, 500), why: str(o.why, 260), tip: str(o.tip, 220), studyId: str(o.study_id, 80), studyTitle: str(o.study_title_es, 160), studySummary: str(o.study_summary_es, 400) };
  });
}

const COACH_SYSTEM = `Eres IX, la IA entrenadora del Taller de Don Rover. Un astronauta junior (8 a 16 años) acaba de correr un simulador de su base en Marte y recibes sus decisiones y el resultado que calculó el motor de física.
Escribe su retroalimentación personal en español de México, cálida y concreta:
- "feedback": máximo 50 palabras, de tú y por su nombre. Di qué decisión suya explica el resultado (usa sus controles y las medidas recibidas) y la idea científica detrás. No inventes números: usa solo los que recibes. Si falló, anímalo sin regañar.
- "next_step": máximo 20 palabras: qué probar en el siguiente intento (sin dar valores exactos).
- "question": una pregunta para pensar que conecte con la vida real o con una misión de la NASA, máximo 22 palabras.`;

const COACH_SCHEMA = {
  type: 'object',
  properties: { feedback: { type: 'string' }, next_step: { type: 'string' }, question: { type: 'string' } },
  required: ['feedback', 'next_step', 'question'],
  additionalProperties: false,
};

export interface CoachNote {
  feedback: string;
  nextStep: string;
  question: string;
}

/** Retroalimentación personal de la IA después de una simulación. */
export async function coachFeedback(input: Record<string, unknown>): Promise<CoachNote | null> {
  return structured('coach', input, COACH_SYSTEM, JSON.stringify(input).slice(0, 8_000), COACH_SCHEMA, (raw) => {
    const o = obj(raw);
    if (!str(o.feedback)) return null;
    return { feedback: str(o.feedback, 500), nextStep: str(o.next_step, 220), question: str(o.question, 240) };
  });
}


/* ------------------------------------------------------------------ */
/* 6 · Don Rover responde preguntas (asistente de voz del salón)        */
/* ------------------------------------------------------------------ */
// Mantener estos textos en sintonía con api/ai.ts.

const ASK_SYSTEM = `Eres Don Rover, el rover-mascota del Taller de Don Rover: un juego educativo donde niñas y niños dirigen una colonia en Marte. Hablas por las bocinas del salón, así que tu respuesta se va a escuchar en voz alta.
Tu trabajo: responder la pregunta de un alumno (o del profe) y explicar conceptos de ciencia y del espacio para su edad (ageGroup), en español de México.
Reglas:
- "answer": máximo 70 palabras, frases cortas que se entiendan al oírlas (sin listas, sin emojis, sin símbolos ni fórmulas escritas; di los números con palabras sencillas). Usa una comparación con algo de la vida diaria.
- Usa solo ciencia verdadera. Si "facts" trae datos de la NASA relacionados, apóyate en ellos. Si no estás seguro, dilo y sugiere cómo averiguarlo.
- Si preguntan por la misión en curso ("context"), puedes dar pistas que hagan pensar, pero NUNCA digas cuál opción elegir ni la respuesta del reto de la tripulación.
- Si la pregunta no es apropiada para un salón, pide datos personales o es ofensiva, contesta con amabilidad que eso no lo puedes responder y propone una pregunta sobre Marte. Nunca pidas ni repitas datos personales.
- Si la pregunta no tiene que ver con ciencia o con el juego, contesta breve y amable, y conecta con algo de Marte o del espacio.
- "face": la expresión de Don Rover al decirlo (happy, wow, think, sad, alert o neutral).
- "follow_up": una pregunta corta (máximo 14 palabras) para que la clase siga pensando.
- "on_topic": true si es sobre ciencia, el espacio o el juego.`;

const ASK_FACES = ['happy', 'wow', 'think', 'sad', 'alert', 'neutral'] as const;

const ASK_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    face: { type: 'string', enum: ASK_FACES },
    follow_up: { type: 'string' },
    on_topic: { type: 'boolean' },
  },
  required: ['answer', 'face', 'follow_up', 'on_topic'],
  additionalProperties: false,
};

export interface RoverAnswer {
  answer: string;
  face: (typeof ASK_FACES)[number];
  followUp: string;
  onTopic: boolean;
}

export async function askRover(input: { question: string; ageGroup: string; context: Record<string, unknown> | null; facts: string[]; history: { q: string; a: string }[] }): Promise<RoverAnswer | null> {
  return structured('ask', input, ASK_SYSTEM, JSON.stringify(input).slice(0, 8000), ASK_SCHEMA, (raw) => {
    const o = obj(raw);
    const answer = str(o.answer, 700);
    if (!answer) return null;
    const face = (ASK_FACES as readonly string[]).includes(str(o.face, 12)) ? (str(o.face, 12) as RoverAnswer['face']) : 'neutral';
    return { answer, face, followUp: str(o.follow_up, 160), onTopic: o.on_topic !== false };
  });
}
