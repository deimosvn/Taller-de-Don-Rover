// Función de Vercel: IA del Taller de Don Rover con Claude Opus 5.5, del lado del servidor.
//
// Espacio listo para la IA: basta con agregar ANTHROPIC_API_KEY en las variables de entorno
// del proyecto de Vercel y volver a desplegar. Sin la clave, el juego sigue con las reglas
// del motor y plantillas, o con la clave que el profesor escriba en Ajustes.
//
// "La IA narra, el motor decide": aquí solo se generan misiones y se redactan textos con
// salidas estructuradas (JSON Schema). Los puntajes y consecuencias los calcula el motor.
// Las instrucciones viven en el servidor (el navegador solo manda los datos de la tarea),
// así que nadie puede usar la clave para otra cosa que no sea el juego.
//
//   GET  /api/ai                      → { enabled, model }
//   POST /api/ai { task, input }      → { ok, data } (data se valida en el navegador)
//
// Mantener los textos en sintonía con src/engine/ai.ts (modo con clave en el navegador).

import Anthropic from '@anthropic-ai/sdk';

interface Req {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
}
interface Res {
  status(code: number): Res;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic({ timeout: 50_000, maxRetries: 1 }) : null;
let useServerFallbacks = true;

const MISSION_IDS = ['greenhouse', 'water', 'darkness', 'signal', 'habitat', 'final'];

/** Texto corto y de una línea para insertar en las instrucciones. */
const clean = (x: unknown, max: number) =>
  typeof x === 'string'
    ? x
        .replace(/[\r\n"`]+/g, ' ')
        .trim()
        .slice(0, max)
    : '';

type Content = string | Anthropic.Beta.BetaContentBlockParam[];

interface Task {
  system: string;
  content: Content;
  schema: Record<string, unknown>;
}

const SCHEMAS: Record<string, Record<string, unknown>> = {
  plan: {
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
  },
  narrative: {
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
  },
  logs: {
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
  },
  debrief: {
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
  },
};

/** Arma la tarea a partir de los datos que manda el navegador (nunca de instrucciones suyas). */
function buildTask(task: string, input: Record<string, unknown>): Task | string {
  switch (task) {
    case 'plan': {
      const age = clean(input.ageGroup, 40) || '8 a 14 años';
      const candidates = Array.isArray(input.candidates) ? input.candidates.filter((c) => MISSION_IDS.includes(String((c as { id?: unknown })?.id))).slice(0, 6) : [];
      if (!candidates.length) return 'No hay misiones candidatas.';
      return {
        system: `Eres IX, la IA de la colonia en el Taller de Don Rover, un videojuego cooperativo de misiones en Marte para el salón de clases.
Una partida es UNA tripulación de máximo 4 alumnos, uno por especialidad: power (Energía), life (Soporte vital), bio (Astrobiología) y habitat (Hábitat).
Tu trabajo: generar la siguiente misión a partir de condiciones reales.
1. "mission_id": elige UNA de "candidates" (usa su id exacto). Elige la que mejor responda a los problemas reales de "conditions" (clima espacial de la NASA DONKI y estado de la colonia). "suggested" es la sugerencia de las reglas del motor: úsala si no hay una razón mejor.
2. "reason_es": por qué IX generó esta misión, en una o dos frases (máximo 35 palabras), citando un dato real de "conditions".
3. "tasks": exactamente 4, una por especialidad (power, life, bio, habitat). Cada una con "title_es" (máximo 8 palabras) y "text_es" (máximo 40 palabras), en segunda persona del singular.
   Las tareas deben estar conectadas como dice "link" de cada especialidad: Hábitat protege los paneles de Energía, Energía alimenta las bombas de Soporte vital, el agua de Soporte vital llega a los cultivos de Astrobiología y la comida fresca da fuerza a Hábitat. Cada texto debe decir de quién depende o a quién ayuda.
Reglas estrictas:
- Español de México, para niñas y niños de ${age}, con tono de videojuego: claro, urgente y amable.
- Usa solo los números que aparecen en "conditions" y en "base"; no inventes datos científicos, porcentajes ni reglas: el motor del juego controla recursos y puntajes.
- No menciones marcas, personas reales ni nada fuera de la misión.`,
        content: JSON.stringify({ ...input, candidates }),
        schema: SCHEMAS.plan,
      };
    }
    case 'narrative': {
      const age = clean(input.ageGroup, 40) || '8 a 14 años';
      return {
        system: `Eres IX, la IA narradora del Taller de Don Rover, un videojuego cooperativo de misiones espaciales para el salón de clases.
Escribe en español de México, con tono de videojuego: urgente, emocionante y amable, para niñas y niños de ${age}.
Reglas estrictas:
- No inventes números, porcentajes, datos científicos nuevos ni reglas: el motor del juego controla recursos y consecuencias.
- Mantente dentro de la historia y el giro de la plantilla.
- "briefing": máximo 60 palabras, en segunda persona del plural; cuenta por qué IX generó esta misión ("reason": condiciones reales de la NASA).
- "crew_lines": una línea por tripulación (máximo 18 palabras) que explique qué parte del problema le toca a su sector.
- "twists": exactamente 3 avances breves (máximo 12 palabras cada uno) de los acontecimientos inesperados, en este orden: datos nuevos, emergencia global, descubrimiento.
Investigación real:
- "studies" trae investigaciones reales de la NASA (NTRS y OSDR, en inglés). Elige la más relevante para esta misión y úsala como base científica: el briefing debe contar en una frase lo que investigó ese estudio, sin inventar resultados que no estén en su resumen.
- "science": study_id (exactamente el id del estudio elegido), title_es (título traducido y claro, máximo 14 palabras), summary_es (qué investigaron y qué encontraron, para niñas y niños, máximo 45 palabras, solo con información del resumen), connection_es (cómo se conecta con la misión de la colonia, máximo 25 palabras). Si "studies" viene vacío, deja los cuatro campos vacíos.`,
        content: JSON.stringify({ ...input, studies: Array.isArray(input.studies) ? input.studies.slice(0, 4) : [] }),
        schema: SCHEMAS.narrative,
      };
    }
    case 'logs': {
      const age = clean(input.ageGroup, 40) || '8 a 14 años';
      const title = clean(input.missionTitle, 80) || 'la misión';
      const logs = Array.isArray(input.logs) ? input.logs.slice(0, 40) : [];
      return {
        system: `Eres IX, la IA del Taller de Don Rover. Evalúas bitácoras breves escritas por tripulaciones de niñas y niños (${age}) que explican su decisión en la misión "${title}".
Califica de 1 a 3 estrellas el razonamiento y la creatividad: 3 = explica con datos de su tripulación o propone una idea original; 2 = explica algo con sentido; 1 = muy breve o sin relación.
Si el texto es ofensivo, inapropiado o contiene datos personales, marca appropriate=false y da 1 estrella.
"comment": retroalimentación amable y específica en español, máximo 18 palabras, dirigida a la tripulación. No reveles cuál era la respuesta correcta.`,
        content: JSON.stringify({ logs }),
        schema: SCHEMAS.logs,
      };
    }
    case 'debrief': {
      const age = clean(input.ageGroup, 40) || '8 a 14 años';
      return {
        system: `Eres IX, la IA del Taller de Don Rover. Escribe el debrief final de la misión para proyectarlo en el salón.
Español claro y cálido para niñas y niños de ${age}. Usa SOLO la información proporcionada: no inventes cifras ni datos científicos nuevos.
- "headline": máximo 10 palabras.
- "learnings": exactamente 3 ideas clave (máximo 28 palabras cada una), basadas en los objetivos de aprendizaje y en lo que pasó en la colonia.
- "shoutouts": hasta 3 reconocimientos específicos y positivos (máximo 20 palabras) usando crew_id; reconoce la cooperación, no solo los aciertos.
- "reflection": una pregunta abierta para conversar en clase (máximo 20 palabras).`,
        content: JSON.stringify(input),
        schema: SCHEMAS.debrief,
      };
    }
    default:
      return 'Tarea desconocida.';
  }
}

function sameOrigin(req: Req): boolean {
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  if (typeof origin !== 'string' || typeof host !== 'string') return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function callClaude(c: Anthropic, t: Task): Promise<Anthropic.Beta.BetaMessage> {
  const base = {
    model: MODEL,
    max_tokens: 16000,
    system: t.system,
    // Opus 5.5 piensa de forma adaptativa siempre; "low" mantiene la respuesta rápida para el salón.
    output_config: { effort: 'low' as const, format: { type: 'json_schema' as const, schema: t.schema } },
    messages: [{ role: 'user' as const, content: t.content }],
  };
  if (!useServerFallbacks) return c.beta.messages.create(base);
  try {
    // Si un filtro de seguridad rechaza la petición, la API la reintenta sola con otro modelo.
    return await c.beta.messages.create({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  } catch (err) {
    if (err instanceof Anthropic.BadRequestError) {
      console.warn('[ai] reintentando sin fallbacks del servidor:', err.message);
      useServerFallbacks = false;
      return c.beta.messages.create(base);
    }
    throw err;
  }
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    res.status(200).json({ ok: true, enabled: Boolean(client), model: MODEL });
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Método no permitido.' });
    return;
  }
  if (!sameOrigin(req)) {
    res.status(403).json({ ok: false, error: 'Origen no permitido.' });
    return;
  }
  if (!client) {
    res.status(503).json({ ok: false, error: 'La IA del servidor no está configurada (falta ANTHROPIC_API_KEY).' });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as Record<string, unknown>;
  } catch {
    res.status(400).json({ ok: false, error: 'Cuerpo inválido.' });
    return;
  }
  const input = body && typeof body.input === 'object' && body.input ? (body.input as Record<string, unknown>) : null;
  if (!input || JSON.stringify(input).length > 5_000_000) {
    res.status(400).json({ ok: false, error: 'Datos de la tarea inválidos.' });
    return;
  }
  const task = buildTask(String(body.task ?? ''), input);
  if (typeof task === 'string') {
    res.status(400).json({ ok: false, error: task });
    return;
  }

  try {
    const msg = await callClaude(client, task);
    if (msg.stop_reason === 'refusal' || msg.stop_reason === 'max_tokens') {
      res.status(200).json({ ok: false, error: `Respuesta incompleta (${msg.stop_reason}).` });
      return;
    }
    const text = msg.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    res.status(200).json({ ok: true, data: JSON.parse(text), model: msg.model });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      console.error('[ai] la clave ANTHROPIC_API_KEY no es válida');
      res.status(502).json({ ok: false, error: 'La clave de la IA no es válida.' });
    } else if (err instanceof Anthropic.RateLimitError) {
      res.status(429).json({ ok: false, error: 'Límite de uso de la IA alcanzado.' });
    } else if (err instanceof Anthropic.APIError) {
      console.error(`[ai] error de la API (${err.status}):`, err.message);
      res.status(502).json({ ok: false, error: 'La IA no respondió.' });
    } else {
      console.error('[ai] error:', err);
      res.status(500).json({ ok: false, error: 'Error al procesar la respuesta de la IA.' });
    }
  }
}
