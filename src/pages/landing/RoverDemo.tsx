// Don Rover en la portada: toca una pregunta (o escribe la tuya) y Don Rover escucha, piensa y
// contesta moviendo la boca. Son las mismas respuestas que da en clase cuando no hay internet;
// con internet, en clase, contesta con IA cualquier pregunta a la edad del grupo.

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { matchKnowledge, UNKNOWN_ANSWER } from '../../rover/knowledge';
import type { RoverExpr } from '../../rover/link';
import { RoverFace } from '../../rover/RoverFace';
import { prefersReducedMotion, useInView } from './motion';

export const QUESTION_GROUPS: { id: string; emoji: string; label: string; questions: string[] }[] = [
  {
    id: 'marte',
    emoji: '🪐',
    label: 'Sobre Marte',
    questions: ['¿Por qué Marte es rojo?', '¿Cuántas lunas tiene Marte?', '¿Cuál es el volcán más grande?', '¿Qué tan frío es Marte?'],
  },
  {
    id: 'vivir',
    emoji: '🧑‍🚀',
    label: 'Vivir en Marte',
    questions: ['¿Cómo respiran los astronautas en Marte?', '¿De dónde sacan agua en Marte?', '¿Cómo se cultiva comida en Marte?', '¿Por qué es peligrosa la radiación?'],
  },
  {
    id: 'viajar',
    emoji: '🚀',
    label: 'Viajar y explorar',
    questions: ['¿Cuánto se tarda en llegar a Marte?', '¿Cuánto pesaría yo en Marte?', '¿Cuánto dura un día en Marte?', '¿Qué rovers hay en Marte?'],
  },
];

type Stage = 'idle' | 'listen' | 'think' | 'talk' | 'done';

const STATUS: Record<Stage, string> = {
  idle: 'Listo para tu pregunta',
  listen: 'Escuchando…',
  think: 'Pensando…',
  talk: 'Contestando…',
  done: '¿Otra pregunta?',
};

const ttsOk = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

/** "hay agua en marte" → "¿Hay agua en marte?" (solo si parece pregunta y le faltan los signos). */
function asQuestion(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  const cap = t.charAt(0).toUpperCase() + t.slice(1);
  if (t.includes('?') || t.includes('¿')) return cap.startsWith('¿') || !cap.endsWith('?') ? cap : `¿${cap}`;
  const looksLikeQuestion = /^(qu[eé]|c[oó]mo|cu[aá]nt[oa]s?|cu[aá]l(es)?|d[oó]nde|por ?qu[eé]|qui[eé]n(es)?|cu[aá]ndo|hay|es|son|puedo|puede|se puede|existe)\b/i.test(t);
  return looksLikeQuestion ? `¿${cap}?` : cap;
}

function pickVoice(): SpeechSynthesisVoice | null {
  const es = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('es'));
  return es.find((v) => /es[-_]mx/i.test(v.lang)) ?? es.find((v) => /es[-_](us|419)/i.test(v.lang)) ?? es[0] ?? null;
}

export function RoverDemo() {
  const [root, seen] = useInView<HTMLDivElement>();
  const [group, setGroup] = useState(QUESTION_GROUPS[0].id);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [expr, setExpr] = useState<RoverExpr>('happy');
  const [stage, setStage] = useState<Stage>('idle');
  const [typed, setTyped] = useState(0);
  const [mouth, setMouth] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const [draft, setDraft] = useState('');
  const run = useRef(0);
  const timers = useRef<number[]>([]);
  const wordPulse = useRef(0);

  const clearTimers = () => {
    timers.current.forEach((t) => clearTimeout(t));
    timers.current = [];
  };
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));
  const hush = () => {
    if (ttsOk()) speechSynthesis.cancel();
    setSpeaking(false);
  };

  function ask(q: string) {
    const my = ++run.current;
    clearTimers();
    hush();
    const hit = matchKnowledge(q);
    const text = hit ? hit.answer : UNKNOWN_ANSWER;
    setQuestion(q);
    setAnswer(text);
    setTyped(0);
    setMouth(0);
    if (prefersReducedMotion()) {
      setExpr(hit ? hit.face : 'think');
      setTyped(text.length);
      setStage('done');
      return;
    }
    // Como en clase: el anillo morado escucha, luego piensa y por fin contesta.
    setStage('listen');
    setExpr('listen');
    later(() => {
      if (my !== run.current) return;
      setStage('think');
      setExpr('think');
    }, 900);
    later(() => {
      if (my !== run.current) return;
      setStage('talk');
      setExpr(hit ? hit.face : 'think');
    }, 1800);
  }

  // Mientras contesta, el texto aparece letra por letra y la boca abre en las vocales.
  useEffect(() => {
    if (stage !== 'talk') return;
    let raf = 0;
    const t0 = performance.now();
    const perSecond = 58;
    const tick = (t: number) => {
      const n = Math.min(answer.length, Math.floor(((t - t0) / 1000) * perSecond));
      setTyped(n);
      const ch = answer[n] ?? ' ';
      const open = /[aeiouáéíóú]/i.test(ch) ? 0.8 : /[\s.,;:!?¡¿…]/.test(ch) ? 0.04 : 0.38;
      setMouth(open * (0.8 + 0.2 * Math.sin(t / 40)));
      if (n < answer.length) raf = requestAnimationFrame(tick);
      else {
        setMouth(0);
        setStage('done');
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage, answer]);

  // Con voz: la boca sigue el ritmo de las palabras que va diciendo la computadora.
  useEffect(() => {
    if (!speaking) return;
    let raf = 0;
    const tick = (t: number) => {
      wordPulse.current *= 0.9;
      setMouth(Math.min(1, 0.18 + Math.abs(Math.sin(t / 85)) * 0.45 + wordPulse.current * 0.4));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      setMouth(0);
    };
  }, [speaking]);

  function speak() {
    if (!ttsOk() || !answer) return;
    run.current++;
    clearTimers();
    hush();
    setTyped(answer.length);
    setStage('done');
    // Frase por frase: algunos navegadores cortan los textos largos a la mitad.
    const parts = answer.match(/[^.!?…]+[.!?…]*/g) ?? [answer];
    const v = pickVoice();
    parts.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part.trim());
      if (v) u.voice = v;
      u.lang = v?.lang ?? 'es-MX';
      u.pitch = 1.05;
      u.onboundary = () => {
        wordPulse.current = 1;
      };
      if (i === parts.length - 1) {
        u.onend = () => setSpeaking(false);
        u.onerror = () => setSpeaking(false);
      }
      speechSynthesis.speak(u);
    });
    setSpeaking(true);
    // Seguro por si el navegador no avisa que terminó.
    later(() => setSpeaking(false), 4000 + answer.length * 95);
  }

  // La primera vez que se ve la sección, Don Rover contesta solo una pregunta de ejemplo.
  useEffect(() => {
    if (!seen || run.current > 0) return;
    const t = window.setTimeout(() => {
      if (run.current === 0) ask(QUESTION_GROUPS[0].questions[0]);
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seen]);

  useEffect(
    () => () => {
      clearTimers();
      if (ttsOk()) speechSynthesis.cancel();
    },
    [],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const q = draft.trim();
    if (!q) return;
    ask(asQuestion(q));
    setDraft('');
  };

  const current = QUESTION_GROUPS.find((g) => g.id === group) ?? QUESTION_GROUPS[0];
  const answering = stage === 'talk' || stage === 'done';

  return (
    <div className="lp-rd" ref={root}>
      <div className="lp-rd-stage">
        <div className={`lp-rd-device is-${stage} ${speaking ? 'is-speaking' : ''}`}>
          <span className="lp-rd-glow" aria-hidden="true" />
          <RoverFace expr={expr} mouth={mouth} size={236} pulse={stage === 'listen' ? '#B69CFF' : null} />
        </div>
        <p className="lp-rd-status">
          <span className={`lp-dot is-${stage}`} aria-hidden="true" />
          {speaking ? 'Hablando…' : STATUS[stage]}
        </p>
      </div>

      <div className="lp-rd-chat">
        <div className="lp-rd-log">
          {question ? (
            <p key={question} className="lp-bubble is-me">
              {question}
            </p>
          ) : (
            <p className="lp-bubble is-rover">¡Hola! Soy Don Rover. Toca una pregunta y te contesto.</p>
          )}
          {stage === 'think' && (
            <p className="lp-bubble is-rover is-typing">
              <span className="lp-sr">Don Rover está pensando</span>
              <i />
              <i />
              <i />
            </p>
          )}
          {answering && (
            <p className="lp-bubble is-rover" aria-hidden="true">
              {answer.slice(0, typed)}
              {stage === 'talk' && <span className="lp-caret" />}
            </p>
          )}
          <p className="lp-sr" aria-live="polite">
            {answering ? `Don Rover dice: ${answer}` : ''}
          </p>
        </div>

        {ttsOk() && (
          <button type="button" className="lp-btn is-soft is-small lp-rd-listen" onClick={speaking ? hush : speak} disabled={!answering}>
            {speaking ? '⏹️ Detener' : '🔊 Escuchar a Don Rover'}
          </button>
        )}

        <div className="lp-rd-ask">
          <p className="lp-rd-label">¿Qué le puedo preguntar?</p>
          <div className="lp-seg" role="tablist" aria-label="Temas de preguntas">
            {QUESTION_GROUPS.map((g) => (
              <button key={g.id} type="button" role="tab" aria-selected={g.id === group} className={g.id === group ? 'is-on' : ''} onClick={() => setGroup(g.id)}>
                <span aria-hidden="true">{g.emoji}</span> {g.label}
              </button>
            ))}
          </div>
          <div key={group} className="lp-chips" role="tabpanel" aria-label={current.label}>
            {current.questions.map((q, i) => (
              <button key={q} type="button" className={`lp-chip ${q === question ? 'is-on' : ''}`} style={{ animationDelay: `${i * 60}ms` }} onClick={() => ask(q)}>
                {q}
              </button>
            ))}
          </div>
          <form className="lp-rd-form" onSubmit={onSubmit}>
            <label className="lp-sr" htmlFor="lp-rd-input">
              Escribe tu pregunta para Don Rover
            </label>
            <input id="lp-rd-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Escribe tu pregunta sobre Marte…" maxLength={120} autoComplete="off" />
            <button type="submit" className="lp-btn is-primary is-small" disabled={!draft.trim()}>
              Preguntar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
