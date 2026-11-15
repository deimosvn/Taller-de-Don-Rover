// Capa de IA del Taller de Don Rover con Claude, ejecutada directamente desde el navegador del profesor.
//
// Principio de diseño: "la IA narra, el motor decide". Claude clasifica la foto del escáner,
// personaliza la narrativa, evalúa las bitácoras y redacta el debrief, siempre con salidas
// estructuradas (JSON Schema). Recursos, consecuencias y puntajes los calcula el motor.
// La clave de API la escribe el profesor y se guarda solo en su navegador; sin clave,
// el juego usa visión local (TensorFlow.js) y plantillas.

import type Anthropic from '@anthropic-ai/sdk';
import type { CategoryId, ScanResult } from '../../shared/types';
import { loadSettings } from './settings';

type Sdk = typeof import('@anthropic-ai/sdk');

const CATEGORIES: CategoryId[] = ['plant', 'water', 'light', 'signal', 'material', 'mystery'];

let sdkPromise: Promise<Sdk> | null = null;
let client: Anthropic | null = null;
let clientKey = '';
let disabledKey = '';
let useServerFallbacks = true;

const loadSdk = () => (sdkPromise ??= import('@anthropic-ai/sdk'));

export function aiStatus() {
  const s = loadSettings();
  return { enabled: Boolean(s.apiKey) && s.apiKey !== disabledKey, model: s.model || 'claude-opus-5-5' };
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

async function structured<T>(system: string, content: Content, schema: Record<string, unknown>, validate: (x: unknown) => T | null): Promise<T | null> {
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

const SCAN_SYSTEM = `Eres IX, la inteligencia artificial del Taller de Don Rover, un juego educativo de misiones espaciales para salones de clase (niñas y niños de 7 a 14 años).
Tu tarea: identificar el objeto principal de la foto y clasificarlo en UNA categoría:
- plant: plantas, flores, hojas, árboles, frutas, verduras, semillas
- water: botellas, vasos, tazas, termos, agua, recipientes para líquidos, llaves o lavabos
- light: lámparas, focos, linternas, ventanas, luz del sol, velas
- signal: celulares, radios, bocinas, audífonos, antenas, controles remotos, computadoras, tabletas
- material: cartón, papel, plástico, latas, cajas, bloques, telas, materiales reciclables, útiles escolares
- mystery: cualquier otra cosa
Reglas:
- Si aparecen personas, ignóralas: no las describas ni menciones sus rasgos.
- "label": nombre corto del objeto en español (2 a 4 palabras).
- "discovery": una frase emocionante (máximo 25 palabras) que conecte el objeto con una misión en Marte, sin inventar propiedades científicas del objeto.
- "fun_fact": un dato real y verificable, apto para niños, sobre el espacio o la NASA relacionado con la categoría (máximo 30 palabras).
- "confidence": número entre 0 y 1.`;

const SCAN_SCHEMA = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: CATEGORIES },
    label: { type: 'string' },
    confidence: { type: 'number' },
    discovery: { type: 'string' },
    fun_fact: { type: 'string' },
  },
  required: ['category', 'label', 'confidence', 'discovery', 'fun_fact'],
  additionalProperties: false,
};

export async function classifyImage(dataUrl: string): Promise<ScanResult | null> {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const mediaType = m[1] as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  return structured(
    SCAN_SYSTEM,
    [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: m[2] } },
      { type: 'text', text: 'Clasifica el objeto principal de esta foto tomada en un salón de clases.' },
    ],
    SCAN_SCHEMA,
    (x) => {
      const o = obj(x);
      const category = CATEGORIES.includes(o.category as CategoryId) ? (o.category as CategoryId) : 'mystery';
      const label = str(o.label, 60);
      if (!label) return null;
      const confidence = typeof o.confidence === 'number' ? Math.max(0, Math.min(1, o.confidence)) : 0.6;
      return { category, label, confidence, discovery: str(o.discovery, 220), funFact: str(o.fun_fact, 260), source: 'ai' as const };
    },
  );
}

/* ------------------------------------------------------------------ */
/* 2 · Narrativa de la misión (dentro de plantillas)                    */
/* ------------------------------------------------------------------ */

export interface NarrativeInput {
  ageGroup: string;
  className: string;
  objectLabel: string;
  mission: { title: string; titleEs: string; hook: string; story: string; objective: string; twist: string; twists: string[] };
  crews: { id: string; name: string; sector: string }[];
}

export interface Narrative {
  briefing: string;
  crewLines: Record<string, string>;
  twists: string[];
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
  },
  required: ['briefing', 'crew_lines', 'twists'],
  additionalProperties: false,
};

export async function generateNarrative(input: NarrativeInput): Promise<Narrative | null> {
  const system = `Eres IX, la IA narradora del Taller de Don Rover, un videojuego cooperativo de misiones espaciales para el salón de clases.
Escribe en español de México, con tono de videojuego: urgente, emocionante y amable, para niñas y niños de ${input.ageGroup}.
Reglas estrictas:
- No inventes números, porcentajes, datos científicos nuevos ni reglas: el motor del juego controla recursos y consecuencias.
- Mantente dentro de la historia y el giro de la plantilla.
- "briefing": máximo 60 palabras, en segunda persona del plural; menciona el objeto descubierto en el salón.
- "crew_lines": una línea por tripulación (máximo 18 palabras) que explique qué parte del problema le toca a su sector.
- "twists": exactamente 3 avances breves (máximo 12 palabras cada uno) de los acontecimientos inesperados, en este orden: datos nuevos, emergencia global, descubrimiento.`;
  return structured(system, JSON.stringify(input), NARRATIVE_SCHEMA, (x) => {
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
    return { briefing, crewLines, twists: twists.length === 3 ? twists : input.mission.twists };
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
  return structured(system, JSON.stringify({ logs }), LOG_SCHEMA, (x) => {
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
  return structured(system, JSON.stringify(input), DEBRIEF_SCHEMA, (x) => {
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
