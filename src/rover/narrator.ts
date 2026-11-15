// Narrador de la consola del profe: Don Rover cuenta en voz alta lo que pasa en la misión,
// pone la cara que corresponde en la placa, muestra el código de la sala mientras abordan y
// dibuja el tiempo que queda como un anillo alrededor de la pantalla redonda.

import { useEffect, useRef } from 'react';
import { DIFFICULTIES, MISSIONS, PACES } from '../../shared/content';
import type { HostView } from '../../shared/types';
import { greet, setRoverContext } from './assistant';
import { rover } from './link';
import { say, setFace, voiceSettings, voiceState } from './voice';

function phaseTotal(v: HostView): number {
  const p = PACES[v.pace];
  if (v.phase === 'discovery') return p.discovery;
  if (v.phase === 'challenge') return p.challenge;
  if (v.phase === 'event' && v.event) return v.event.stage === 'alert' ? 6 : v.event.stage === 'share' ? p.share : p.action;
  return 0;
}

/** Lo que Don Rover dice al empezar cada fase (las de IA ya vienen escritas por IX). */
function phaseLine(v: HostView): { text: string; face: Parameters<typeof setFace>[0] } | null {
  const m = v.mission ? MISSIONS[v.mission.id] : null;
  switch (v.phase) {
    case 'crews':
      return { text: 'IX ya formó la tripulación. Cada quien tiene una especialidad y un dato que nadie más tiene. ¡Aquí nadie sobra!', face: 'happy' };
    case 'scan':
      return { text: 'IX está revisando el clima espacial real de la NASA y el estado de la colonia para armar su misión. Un momento…', face: 'think' };
    case 'briefing':
      return m && v.mission ? { text: `Misión ${m.titleEs}. ${v.mission.briefing}`, face: 'alert' } : null;
    case 'discovery':
      return { text: '¡A sus estaciones! Cada especialidad tiene una tarea en el mundo 3D. Al terminarla, recibirán un dato secreto para la tripulación.', face: 'happy' };
    case 'challenge':
      return {
        text: v.mission?.puzzleQuestion
          ? `Hora de decidir en equipo. ${v.mission.puzzleQuestion} Compartan sus datos antes de votar.`
          : 'Hora de decidir en equipo: compartan sus datos y voten la mejor decisión.',
        face: 'think',
      };
    case 'event':
      return { text: '¡Alerta! ¡Emergencia en la colonia! Todos atentos a su celular.', face: 'alert' };
    case 'results':
      return v.results?.saved
        ? { text: '¡Lo lograron! La colonia resistió gracias a su trabajo en equipo.', face: 'star' }
        : { text: 'Esta vez la colonia sufrió daños, pero cada error nos enseña algo. Veamos qué pasó.', face: 'sad' };
    case 'debrief':
      return v.debrief
        ? { text: `${v.debrief.headline}. ${v.debrief.learnings[0] ?? ''} Para pensar: ${v.debrief.reflection}`, face: 'happy' }
        : null;
    default:
      return null;
  }
}

const ringColor = (left: number) => (left > 0.5 ? '#55DB7A' : left > 0.2 ? '#FFC93C' : '#FF6B5B');

/** Conecta la consola con Don Rover (placa + voz). Montar una sola vez en la consola. */
export function useRoverNarrator(view: HostView): void {
  const viewRef = useRef(view);
  viewRef.current = view;
  const prev = useRef<{ phase: string; stage: string | null; ix: Set<string>; humans: Set<string> } | null>(null);

  // Reconectar sola al último camino que funcionó. Los botones de la placa los atiende el
  // Don Rover flotante (RoverDock), que está en todas las secciones.
  useEffect(() => {
    void rover.auto();
    let greeted = false;
    const off = rover.onEvent((e) => {
      if (e.t === 'hi' && !greeted) {
        greeted = true;
        greet();
        sendBoardState(viewRef.current);
      } else if (e.t === 'hi') {
        sendBoardState(viewRef.current);
      }
    });
    return off;
  }, []);

  // Contexto para las respuestas de Don Rover.
  const lastHint = [...view.ix].reverse().find((m) => m.kind === 'hint');
  const m = view.mission ? MISSIONS[view.mission.id] : null;
  useEffect(() => {
    setRoverContext({
      ageGroup: DIFFICULTIES[view.difficulty]?.age ?? '8 a 14 años',
      phase: view.phase,
      hint: lastHint?.text ?? '',
      mission: m && view.mission ? { title: m.titleEs, briefing: view.mission.briefing, question: view.mission.puzzleQuestion } : null,
    });
  }, [view.difficulty, view.phase, lastHint?.text, m, view.mission]);

  // Narración de fases, etapas de la emergencia, pistas de IX y alumnos que llegan.
  useEffect(() => {
    const p = prev.current;
    const humans = new Set(view.players.filter((x) => !x.isBot).map((x) => x.id));
    const ix = new Set(view.ix.map((x) => x.id));
    const stage = view.event?.stage ?? null;
    prev.current = { phase: view.phase, stage, ix, humans };
    if (!p) {
      sendBoardState(view);
      return;
    }
    const narrate = voiceSettings().narrate;
    if (p.phase !== view.phase) {
      sendBoardState(view);
      const line = phaseLine(view);
      if (line && narrate) void say(line.text, { face: line.face });
      else if (line) setFace(line.face, 4000);
      return;
    }
    if (view.phase === 'event' && stage !== p.stage && stage) {
      const lines: Record<string, [string, Parameters<typeof setFace>[0]]> = {
        share: ['Decidan cuánto comparten con la colonia. ¡Compartir también protege!', 'think'],
        action: ['¡Ahora! Cada especialidad a su minijuego. ¡Rápido y en equipo!', 'alert'],
        done: view.event?.saved ? ['¡Emergencia superada! Bien hecho, tripulación.', 'star'] : ['Uf… la emergencia nos ganó esta vez.', 'sad'],
      };
      const l = lines[stage];
      if (l && narrate) void say(l[0], { face: l[1] });
      else if (l) setFace(l[1], 3000);
    }
    for (const msg of view.ix) {
      if (p.ix.has(msg.id)) continue;
      if (msg.kind === 'hint' || msg.kind === 'alert') {
        if (narrate) void say(msg.kind === 'hint' ? `Pista de IX: ${msg.text}` : msg.text, { face: msg.kind === 'hint' ? 'think' : 'alert', interrupt: false });
        else setFace(msg.kind === 'hint' ? 'think' : 'alert', 3000);
      }
    }
    if (view.phase === 'lobby') {
      for (const pl of view.players) {
        if (pl.isBot || p.humans.has(pl.id)) continue;
        if (narrate) void say(`¡Bienvenido a bordo, ${pl.name}!`, { face: 'happy', interrupt: false, noRepeat: true });
        else setFace('happy', 2500);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.phase, view.event?.stage, view.ix.length, view.players.length]);

  // Anillo de tiempo en la pantalla redonda (una vez por segundo) y, mientras abordan, el
  // código de la sala en la placa cada 20 s (sin tapar la cara cuando Don Rover habla).
  useEffect(() => {
    let tick = 0;
    const id = setInterval(() => {
      const v = viewRef.current;
      if (!rover.connected) return;
      tick++;
      if (v.phase === 'lobby' && !voiceState().speaking && tick % 20 === 3) {
        rover.send({ t: 'card', title: v.code, sub: 'Codigo para unirse a la mision', ms: 8000 });
      }
      const total = phaseTotal(v);
      const end = v.phase === 'event' ? (v.event?.stageEndsAt ?? v.deadline) : v.deadline;
      if (!total || !end) return;
      const remaining = v.paused ? (v.pausedRemaining ?? 0) : Math.max(0, end - Date.now()) / 1000;
      const left = Math.max(0, Math.min(1, remaining / total));
      rover.send({ t: 'ring', p: Math.round(left * 1000), c: v.paused ? '#B9B3D9' : ringColor(left) });
    }, 1000);
    return () => clearInterval(id);
  }, []);
}

/** Cara, anillo y tarjeta de la placa según la fase (al conectar y al cambiar de fase). */
function sendBoardState(v: HostView): void {
  if (!rover.connected) return;
  if (v.phase !== 'lobby') rover.send({ t: 'card', title: '' });
  if (!phaseTotal(v)) rover.send({ t: 'ring', p: -1 });
}
