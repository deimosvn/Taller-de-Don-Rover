// Preguntas a Don Rover: el alumno (o el profe) habla por el micrófono, Don Rover piensa y
// contesta en voz alta con la boca moviéndose en la placa.
//
// Con IA (Claude) la respuesta se escribe para la edad del grupo, con la misión en curso como
// contexto y datos reales de la NASA como apoyo. Sin IA o sin internet contesta con su propia
// base de conocimiento (los mismos datos del juego), así que siempre responde algo útil.

import { FACTS } from '../../shared/marsSim';
import { askRover } from '../engine/ai';
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

/* ---------------- preguntar ---------------- */

export interface Answer {
  text: string;
  followUp: string;
  ai: boolean;
}

/** Responde una pregunta escrita o dictada y la dice en voz alta. */
export async function ask(question: string): Promise<Answer | null> {
  const q = question.trim().slice(0, 400);
  if (!q) return null;
  setThinking(true);
  const ai = await askRover({
    question: q,
    ageGroup: context.ageGroup,
    context: context.mission ? { mission: context.mission.title, briefing: context.mission.briefing, decision: context.mission.question, phase: context.phase, hint: context.hint } : { phase: context.phase },
    facts: factList(),
    history: history.slice(-4),
  }).catch(() => null);
  setThinking(false);
  let out: Answer;
  if (ai) {
    out = { text: ai.answer, followUp: ai.followUp, ai: true };
    void say(ai.followUp ? `${ai.answer} ${ai.followUp}` : ai.answer, { face: ai.face });
  } else {
    const local = localAnswer(q);
    const text = local
      ? local.answer
      : UNKNOWN_ANSWER;
    out = { text, followUp: '', ai: false };
    void say(text, { face: local?.face ?? 'think' });
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
