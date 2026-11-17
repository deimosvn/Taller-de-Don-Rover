// Preguntas a Don Rover: el alumno (o el profe) habla por el micrófono, Don Rover piensa y
// contesta en voz alta con la boca moviéndose en la placa.
//
// Con IA (Claude) la respuesta se escribe para la edad del grupo, con la misión en curso como
// contexto y datos reales de la NASA como apoyo. Sin IA o sin internet contesta con su propia
// base de conocimiento (los mismos datos del juego), así que siempre responde algo útil.

import { FACTS } from '../../shared/marsSim';
import { askRover } from '../engine/ai';
import { nasaApod, nasaNeo, nasaStudies, spaceWeather } from '../lib/nasa';
import { matchKnowledge, normalizeQuestion, UNKNOWN_ANSWER, type KnowledgeEntry } from './knowledge';
import { listen, say, setFace, setThinking } from './voice';

/** Lo que Don Rover sabe del momento de la clase (lo actualiza la consola del profe). */
export interface RoverContext {
  ageGroup: string;
  mission: { title: string; briefing: string; question: string } | null;
  phase: string;
  hint: string;
}

let context: RoverContext = { ageGroup: '8 a 14 años', mission: null, phase: '', hint: '' };
const history: { q: string; a: string }[] = [];

export function setRoverContext(c: Partial<RoverContext>): void {
  context = { ...context, ...c };
}

/* ---------------- base de conocimiento (sin IA) ---------------- */

function localAnswer(question: string): KnowledgeEntry | null {
  const q = normalizeQuestion(question);
  if (/(pista|ayuda|no se que hacer|atorad|que hacemos|que hago)/.test(q) && context.hint) {
    return { keys: [], answer: `Una pista de IX: ${context.hint}`, face: 'think' };
  }
  if (/(mision|que tenemos que hacer|de que se trata|cual es el reto)/.test(q) && context.mission) {
    return { keys: [], answer: `${context.mission.title}. ${context.mission.briefing}`, face: 'alert' as KnowledgeEntry['face'] };
  }
  return matchKnowledge(question);
}

/** Datos reales del juego que la IA puede usar para no inventar. */
const factList = () => Object.values(FACTS).map((f) => `${f.text} (${f.source})`);

/* ---------------- datos reales de la NASA ---------------- */

/** Una fuente de la NASA que Don Rover consultó para contestar. */
export interface NasaRef {
  label: string;
  title: string;
  url: string;
  image?: string;
}

interface NasaLookup {
  facts: string[];
  refs: NasaRef[];
  /** Respuesta sin IA construida con los datos (si los hubo). */
  plain: string;
}

const STOP = new Set(
  'que como cual cuales cuando donde quien por para porque una uno unos unas los las del de la el en y o a al es son hay se su sus mas muy con sin sobre me te nos le les lo tu mi pero si no ya esta estan este esto eso ser fue puede pueden don rover dime cuentame explica sabes'.split(' '),
);

/** Palabras clave en español → búsqueda en inglés para NTRS/OSDR (las bases están en inglés). */
const EN: Record<string, string> = {
  marte: 'Mars', luna: 'Moon', agua: 'water', hielo: 'ice', oxigeno: 'oxygen', plantas: 'plants', planta: 'plant', cultivo: 'crop growth',
  radiacion: 'radiation', huesos: 'bone loss', hueso: 'bone', musculo: 'muscle', musculos: 'muscle', sueno: 'sleep', gravedad: 'gravity',
  microgravedad: 'microgravity', astronauta: 'astronaut', astronautas: 'astronaut', comida: 'food', energia: 'power', solar: 'solar',
  polvo: 'dust', tormenta: 'storm', suelo: 'regolith', rover: 'rover', cohete: 'rocket', estacion: 'space station', bacterias: 'bacteria',
  raton: 'mice', ratones: 'mice', corazon: 'cardiovascular', ojos: 'vision', vision: 'vision', inmune: 'immune', defensas: 'immune',
  sol: 'Sun', asteroide: 'asteroid', cometa: 'comet', galaxia: 'galaxy', estrella: 'star', telescopio: 'telescope', clima: 'climate',
};

function keywords(q: string): string {
  const words = normalizeQuestion(q)
    .split(' ')
    .filter((w) => w.length > 2 && !STOP.has(w));
  const en = words.map((w) => EN[w]).filter(Boolean);
  return (en.length ? en : words).slice(0, 4).join(' ');
}

const fmt = (x: number) => x.toLocaleString('es-MX');

/** Consulta las APIs de la NASA que tengan que ver con la pregunta. */
async function nasaLookup(question: string): Promise<NasaLookup> {
  const q = normalizeQuestion(question);
  const out: NasaLookup = { facts: [], refs: [], plain: '' };
  const wantsWeather = /(clima espacial|tormenta solar|llamarad|eyeccion|viento solar|aurora|geomagnet|actividad solar|el sol hoy|radiacion hoy|donki)/.test(q);
  const wantsNeo = /(asteroide|meteor|roca espacial|cometa|neo|impacto|choc)/.test(q);
  const wantsApod = /(foto del dia|imagen del dia|apod|foto de hoy|imagen de hoy|foto de la nasa|imagen de la nasa)/.test(q);
  const jobs: Promise<void>[] = [];

  if (wantsWeather) {
    jobs.push(
      spaceWeather(14).then((w) => {
        if (!w) return;
        out.facts.push(`Clima espacial real (NASA DONKI, ${w.from} a ${w.to}): ${w.headline}. ${w.lines.join(' ')}`);
        out.refs.push({ label: 'NASA DONKI', title: `Clima espacial: ${w.label}`, url: 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/' });
        const lines = w.lines.map((l) => l.replace(/\p{Extended_Pictographic}️?/gu, '').trim()).filter(Boolean);
        out.plain ||= `Según la NASA, el clima espacial de las últimas dos semanas está ${w.label.toLowerCase()}. ${lines.slice(0, 3).join('. ').replace(/\.\./g, '.')}.`;
      }),
    );
  }
  if (wantsNeo) {
    jobs.push(
      nasaNeo().then((n) => {
        if (!n) return;
        const c = n.closest[0];
        const near = c ? ` El más cercano es ${c.name}, de unos ${fmt(c.diameterM ?? 0)} metros, que pasa a ${fmt(c.missKm ?? 0)} kilómetros (${c.lunar} veces la distancia a la Luna) a ${fmt(c.kmh ?? 0)} km/h.` : '';
        out.facts.push(`Asteroides cerca de la Tierra hoy (NASA NeoWs, ${n.date}): ${n.count} en total, ${n.hazardous} marcados como potencialmente peligrosos por su tamaño y órbita (ninguno chocará).${near}`);
        if (c?.url) out.refs.push({ label: 'NASA NeoWs', title: `Asteroide ${c.name}`, url: c.url });
        out.plain ||= `Hoy pasan ${n.count} asteroides cerca de la Tierra, según la NASA.${near} No hay peligro: pasan muy lejos.`;
      }),
    );
  }
  if (wantsApod) {
    jobs.push(
      nasaApod().then((a) => {
        if (!a) return;
        out.facts.push(`Foto astronómica del día de la NASA (APOD ${a.date}): "${a.title}". Explicación oficial (en inglés): ${a.explanation}`);
        out.refs.push({ label: 'NASA APOD', title: a.title, url: a.page, image: a.media === 'image' || a.url.match(/\.(jpe?g|png|gif|webp)$/i) ? a.url : undefined });
        out.plain ||= `La foto astronómica del día de la NASA se llama «${a.title}». Ábrela en el enlace para verla.`;
      }),
    );
  }
  // Estudios científicos reales (NTRS + OSDR) sobre el tema, salvo saludos o preguntas del juego.
  const topic = keywords(question);
  if (topic && !wantsApod && !wantsWeather && !wantsNeo && !/(hola|gracias|quien eres|como te llamas|mision|pista)/.test(q)) {
    jobs.push(
      nasaStudies(topic, topic, 3).then((list) => {
        for (const s of list.slice(0, 3)) {
          out.facts.push(`Estudio de la NASA (${s.source}${s.year ? `, ${s.year}` : ''}): "${s.title}". ${s.summary.slice(0, 280)}`);
          out.refs.push({ label: `NASA ${s.source}`, title: s.title, url: s.url });
        }
      }),
    );
  }
  await Promise.race([Promise.allSettled(jobs), new Promise((r) => setTimeout(r, 7000))]);
  return out;
}

/* ---------------- preguntar ---------------- */

export interface Answer {
  text: string;
  followUp: string;
  ai: boolean;
  /** Fuentes reales de la NASA consultadas para esta respuesta. */
  refs: NasaRef[];
}

/** Responde una pregunta escrita o dictada y la dice en voz alta (si speak no es false). */
export async function ask(question: string, opts: { speak?: boolean } = {}): Promise<Answer | null> {
  const q = question.trim().slice(0, 400);
  if (!q) return null;
  const speak = opts.speak !== false;
  setThinking(true);
  const nasa = await nasaLookup(q).catch(() => ({ facts: [], refs: [], plain: '' }) as NasaLookup);
  const ai = await askRover({
    question: q,
    ageGroup: context.ageGroup,
    context: context.mission ? { mission: context.mission.title, briefing: context.mission.briefing, decision: context.mission.question, phase: context.phase, hint: context.hint } : { phase: context.phase },
    // Primero los datos de la NASA de esta pregunta: son los más relevantes.
    facts: [...nasa.facts, ...factList()].slice(0, 8),
    history: history.slice(-4),
  }).catch(() => null);
  setThinking(false);
  let out: Answer;
  if (ai) {
    out = { text: ai.answer, followUp: ai.followUp, ai: true, refs: nasa.refs };
    if (speak) void say(ai.followUp ? `${ai.answer} ${ai.followUp}` : ai.answer, { face: ai.face });
    else setFace(ai.face, 3000);
  } else {
    const local = localAnswer(q);
    // Si la pregunta pidió datos de hoy (clima espacial, asteroides, foto del día), van primero.
    const text = nasa.plain
      ? nasa.plain
      : local
        ? local.answer
        : (nasa.refs.length
          ? `Encontré información real de la NASA sobre eso: «${nasa.refs[0].title}». Ábrela en el enlace y léanla juntos.`
          : UNKNOWN_ANSWER);
    const face = nasa.plain ? 'wow' : (local?.face ?? 'think');
    out = { text, followUp: '', ai: false, refs: nasa.refs };
    if (speak) void say(text, { face });
    else setFace(face, 3000);
  }
  history.push({ q, a: out.text });
  if (history.length > 8) history.shift();
  return out;
}

/** Escucha por el micrófono y responde (botón largo de la placa o botón de la consola). */
export async function listenAndAnswer(): Promise<{ question: string; answer: Answer | null }> {
  const question = await listen();
  if (!question) return { question: '', answer: null };
  return { question, answer: await ask(question) };
}

/** Saludo de Don Rover cuando se conecta. */
export function greet(): void {
  setFace('happy', 3000);
  void say('¡Hola! Soy Don Rover. Ya estoy conectado a la colonia. Presiona mi botón para que repita algo, o mantenlo presionado para hacerme una pregunta.', { face: 'happy', noRepeat: true });
}
