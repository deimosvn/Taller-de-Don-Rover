// Un reto del Entrenador de Misión: el astronauta ajusta los controles de su sistema, ve las
// medidas en vivo (con unidades reales), lanza la simulación sol por sol y descubre si la base
// sobrevive. Al final: estrellas, la lección, las cuentas con sus números y la fuente de la NASA.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { FACTS, MARS } from '../../../shared/marsSim';
import { SIMS, defaultInput, landerStart, landerStep, type Challenge, type Control, type Metric, type Scenario, type SimResult } from '../../../shared/trainer';
import { ROLES } from '../../../shared/content';
import type { CoachNote } from '../../engine/ai';
import { coach } from '../../engine/trainer';
import { vibrate } from '../../lib/pwa';
import { sfx } from '../../lib/sound';

interface Props {
  challenge: Challenge;
  name: string;
  /** Se llama una vez por corrida terminada (para guardar el avance y dar la XP). */
  onResult(result: SimResult, input: Record<string, number>): void;
  onClose(): void;
  onNext?(): void;
}

const fmt = (n: number) => (Math.abs(n) >= 100 ? Math.round(n).toLocaleString('es-MX') : String(Math.round(n * 10) / 10));

export function SimPlay({ challenge, name, onResult, onClose, onNext }: Props) {
  const s = challenge.scenario;
  const def = SIMS[s.sim];
  const role = ROLES[def.role];
  const controls = useMemo(() => def.controls(s), [def, s]);
  const [input, setInput] = useState<Record<string, number>>(() => defaultInput(s));
  const [phase, setPhase] = useState<'plan' | 'run' | 'result'>('plan');
  const [result, setResult] = useState<SimResult | null>(null);
  const [shown, setShown] = useState(0);
  const [note, setNote] = useState<CoachNote | null>(null);
  const [thinking, setThinking] = useState(false);
  const [showMath, setShowMath] = useState(false);
  const [tries, setTries] = useState(0);
  const fact = FACTS[def.fact];
  const isLanding = s.sim === 'landing';

  // Medidas en vivo mientras se planea (la misma física que la simulación).
  const preview = useMemo(() => (isLanding ? null : def.run(s, input)), [def, s, input, isLanding]);

  const finish = (r: SimResult, used: Record<string, number>) => {
    setResult(r);
    setPhase('result');
    setTries((t) => t + 1);
    if (r.ok) {
      sfx.success();
      vibrate([40, 60, 40]);
    } else {
      sfx.fail();
      vibrate(120);
    }
    onResult(r, used);
    setNote(null);
    setThinking(true);
    void coach(name, challenge, used, r).then((n) => {
      setNote(n);
      setThinking(false);
    });
  };

  const launch = () => {
    const r = def.run(s, input);
    setResult(r);
    setShown(0);
    setPhase('run');
    sfx.whoosh();
  };

  // La misión avanza sol por sol; si falla, se detiene en ese sol.
  useEffect(() => {
    if (phase !== 'run' || !result) return;
    const total = result.series.values.length;
    const stop = result.failedSol ?? total;
    const step = Math.max(1, Math.ceil(total / 60));
    const id = setInterval(() => {
      setShown((n) => {
        const next = Math.min(stop, n + step);
        if (next >= stop) {
          clearInterval(id);
          setTimeout(() => finish(result, input), 500);
        } else if (s.events.some((e) => e.sol > n && e.sol <= next)) sfx.pop();
        return next;
      });
    }, 70);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, result]);

  const retry = () => {
    setPhase('plan');
    setResult(null);
    setShowMath(false);
  };

  const metrics = phase === 'plan' ? preview?.metrics : result?.metrics;

  return (
    <div className="tr-sim" style={{ '--rc': role.color } as CSSProperties} role="dialog" aria-label={challenge.title}>
      <header className="tr-sim-head">
        <span className="tr-sim-emoji">{def.emoji}</span>
        <div>
          <p className="tr-kicker">
            {def.need} · {role.name} · Nivel {s.level}
            {challenge.ai && <span className="tr-ai">✨ Reto de IX</span>}
          </p>
          <h2>{challenge.title}</h2>
        </div>
        <button className="tr-x" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>
      </header>

      <div className="tr-sim-body">
        <p className="tr-brief">{challenge.briefing}</p>
        <p className="tr-goal">
          <b>Objetivo:</b> {def.objective(s)}
        </p>
        {s.events.length > 0 && (
          <ul className="tr-events">
            {s.events.map((e) => (
              <li key={e.sol + e.text} className={phase !== 'plan' && shown >= e.sol ? 'on' : ''}>
                <b>Sol {e.sol}</b> {e.text}
              </li>
            ))}
          </ul>
        )}

        {isLanding ? (
          phase === 'result' && result ? null : (
            <Lander
              scenario={s}
              key={tries}
              onLand={(speed, fuel, time) => finish(def.run(s, { speed, fuel, time }), { speed, fuel, time })}
            />
          )
        ) : (
          phase === 'plan' && (
            <div className="tr-controls">
              {controls.map((c) => (
                <ControlRow key={c.id} c={c} value={input[c.id]} onChange={(v) => setInput((i) => ({ ...i, [c.id]: v }))} />
              ))}
            </div>
          )
        )}

        {phase !== 'plan' && result && !isLanding && <Chart result={result} scenario={s} shown={phase === 'result' ? (result.failedSol ?? result.series.values.length) : shown} />}

        {metrics && (
          <ul className="tr-metrics">
            {metrics.map((m) => (
              <MetricRow key={m.label} m={m} />
            ))}
          </ul>
        )}

        {phase === 'plan' && !isLanding && (
          <>
            <p className="tr-tip">💡 {challenge.tip}</p>
            <button className="tr-btn go" onClick={launch}>
              🚀 Lanzar la simulación de {s.p.sols ?? ''} soles
            </button>
          </>
        )}

        {phase === 'result' && result && (
          <section className={`tr-result ${result.ok ? 'ok' : 'bad'}`}>
            <p className="tr-stars" aria-label={`${result.stars} de 3 estrellas`}>
              {[1, 2, 3].map((n) => (
                <span key={n} className={n <= result.stars ? 'on' : ''}>
                  ★
                </span>
              ))}
            </p>
            <h3>{result.ok ? '¡Misión cumplida!' : 'La misión falló'}</h3>
            <p className="tr-verdict">{result.verdict}</p>
            <div className="tr-coach">
              <span className="tr-coach-who">IX</span>
              <div>
                <p>{note?.feedback ?? result.lesson}</p>
                {note?.nextStep && <p className="tr-next">→ {note.nextStep}</p>}
                {note?.question && <p className="tr-q">🤔 {note.question}</p>}
                {thinking && <p className="tr-thinking">IX está revisando tus decisiones…</p>}
              </div>
            </div>
            <button className="tr-link" onClick={() => setShowMath((v) => !v)} aria-expanded={showMath}>
              {showMath ? '▾' : '▸'} Ver las cuentas de esta misión
            </button>
            {showMath && (
              <ol className="tr-math">
                {result.math.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
            )}
            <div className="tr-actions">
              <button className="tr-btn" onClick={retry}>
                ↻ {result.ok && result.stars < 3 ? 'Buscar las 3 estrellas' : 'Intentar de nuevo'}
              </button>
              {onNext && (
                <button className="tr-btn go" onClick={onNext}>
                  Siguiente reto →
                </button>
              )}
            </div>
          </section>
        )}

        <aside className="tr-fact">
          <p>
            <b>Dato real:</b> {fact.text}
          </p>
          <a href={fact.url} target="_blank" rel="noreferrer">
            {fact.source} ↗
          </a>
          {challenge.study && (
            <p className="tr-study">
              <b>Estudio de la NASA ({challenge.study.source}):</b> {challenge.study.title}. {challenge.study.summary}{' '}
              <a href={challenge.study.url} target="_blank" rel="noreferrer">
                Leerlo ↗
              </a>
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function ControlRow({ c, value, onChange }: { c: Control; value: number; onChange(v: number): void }) {
  const set = (v: number) => onChange(Math.round(Math.min(c.max, Math.max(c.min, v)) / c.step) * c.step);
  if (c.options) {
    return (
      <div className="tr-control">
        <span className="tr-control-label">{c.label}</span>
        <div className="tr-options" role="radiogroup" aria-label={c.label}>
          {c.options.map((o, i) => (
            <button key={o} role="radio" aria-checked={Math.round(value) === i} className={Math.round(value) === i ? 'on' : ''} onClick={() => onChange(i)}>
              {o}
            </button>
          ))}
        </div>
        <small>{c.help}</small>
      </div>
    );
  }
  return (
    <div className="tr-control">
      <label htmlFor={`tr-${c.id}`} className="tr-control-label">
        {c.label}
        <b>
          {fmt(value)} {c.unit}
        </b>
      </label>
      <div className="tr-slider">
        <button onClick={() => set(value - c.step)} aria-label={`Menos ${c.label}`}>
          −
        </button>
        <input id={`tr-${c.id}`} type="range" min={c.min} max={c.max} step={c.step} value={value} onChange={(e) => set(Number(e.target.value))} />
        <button onClick={() => set(value + c.step)} aria-label={`Más ${c.label}`}>
          +
        </button>
      </div>
      <small>{c.help}</small>
    </div>
  );
}

function MetricRow({ m }: { m: Metric }) {
  const max = Math.max(m.value, m.need ?? 0, 1e-6) * 1.15;
  return (
    <li className={m.ok ? 'ok' : 'bad'}>
      <span>{m.label}</span>
      <b>
        {fmt(m.value)} {m.unit}
        {m.need !== undefined && (
          <small>
            {' '}
            {m.lowerIsBetter ? 'máx.' : 'mín.'} {fmt(m.need)}
          </small>
        )}
      </b>
      {m.need !== undefined && (
        <div className="tr-bar">
          <i style={{ width: `${Math.min(100, (m.value / max) * 100)}%` }} />
          <em style={{ left: `${(m.need / max) * 100}%` }} />
        </div>
      )}
    </li>
  );
}

function Chart({ result, scenario, shown }: { result: SimResult; scenario: Scenario; shown: number }) {
  const { values, label, unit, limit } = result.series;
  const n = values.length;
  const top = Math.max(...values, limit ?? 0, 1) * 1.1;
  const x = (i: number) => 8 + (i / Math.max(1, n - 1)) * 284;
  const y = (v: number) => 96 - (v / top) * 84;
  const pts = values.slice(0, Math.max(1, shown)).map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const failed = result.failedSol !== null && shown >= result.failedSol;
  const last = Math.max(0, Math.min(n, shown) - 1);
  return (
    <figure className={`tr-chart ${failed ? 'bad' : ''}`}>
      <figcaption>
        {label} <b>{fmt(values[last] ?? 0)} {unit}</b>
        <span>Sol {Math.min(n, Math.max(1, shown))} de {n}</span>
      </figcaption>
      <svg viewBox="0 0 300 104" role="img" aria-label={`${label} por sol`}>
        <line x1="8" x2="292" y1="96" y2="96" className="tr-axis" />
        {limit !== undefined && <line x1="8" x2="292" y1={y(limit)} y2={y(limit)} className="tr-limit" />}
        {scenario.events.map((e) => (
          <line key={e.sol + e.text} x1={x(e.sol - 1)} x2={x(e.sol - 1)} y1="8" y2="96" className={`tr-event ${shown >= e.sol ? 'on' : ''}`} />
        ))}
        {pts.length > 1 && <polygon points={`${x(0)},96 ${pts.join(' ')} ${x(pts.length - 1)},96`} className="tr-area" />}
        {pts.length > 1 && <polyline points={pts.join(' ')} className="tr-line" />}
        <circle cx={x(last)} cy={y(values[last] ?? 0)} r="3.5" className="tr-dot" />
      </svg>
    </figure>
  );
}

/* ---------------- aterrizaje en tiempo real ---------------- */

function Lander({ scenario, onLand }: { scenario: Scenario; onLand(speed: number, fuel: number, time: number): void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const burn = useRef(false);
  const [started, setStarted] = useState(false);
  const [hud, setHud] = useState({ h: scenario.p.h0, v: -scenario.p.v0, fuel: scenario.p.fuel });
  const landed = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.code !== 'ArrowUp') return;
      e.preventDefault();
      burn.current = e.type === 'keydown';
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, []);

  useEffect(() => {
    if (!started) return;
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    let st = landerStart(scenario);
    let raf = 0;
    let last = 0;
    let acc = 0;
    let frame = 0;
    const W = cv.width;
    const H = cv.height;
    const draw = () => {
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#2b1220');
      sky.addColorStop(0.6, '#a2502f');
      sky.addColorStop(1, '#f0a36b');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      const ground = H - 34;
      ctx.fillStyle = '#b4522c';
      ctx.fillRect(0, ground, W, 34);
      ctx.fillStyle = '#8a3a22';
      for (let i = 0; i < 9; i++) ctx.fillRect(((i * 97 + 31) % W) - 8, ground + 6 + ((i * 13) % 16), 18, 4);
      // Plataforma de aterrizaje.
      ctx.fillStyle = '#fff8ec';
      ctx.fillRect(W / 2 - 46, ground - 3, 92, 5);
      // La nave: la altura se dibuja en escala logarítmica para ver bien los últimos metros.
      const k = Math.log(1 + Math.max(0, st.h)) / Math.log(1 + scenario.p.h0);
      const yy = ground - 22 - k * (ground - 70);
      const on = burn.current && st.fuel > 0;
      if (on) {
        ctx.fillStyle = frame % 4 < 2 ? '#ffd86b' : '#ff8a57';
        ctx.beginPath();
        ctx.moveTo(W / 2 - 8, yy + 20);
        ctx.lineTo(W / 2, yy + 44 + (frame % 3) * 5);
        ctx.lineTo(W / 2 + 8, yy + 20);
        ctx.fill();
      }
      ctx.fillStyle = '#e6e8f2';
      ctx.beginPath();
      ctx.roundRect(W / 2 - 16, yy - 14, 32, 30, 7);
      ctx.fill();
      ctx.fillStyle = '#6e4fe0';
      ctx.fillRect(W / 2 - 8, yy - 8, 16, 9);
      ctx.strokeStyle = '#e6e8f2';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 14, yy + 14);
      ctx.lineTo(W / 2 - 24, yy + 24);
      ctx.moveTo(W / 2 + 14, yy + 14);
      ctx.lineTo(W / 2 + 24, yy + 24);
      ctx.stroke();
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      acc += Math.min(0.1, last ? (now - last) / 1000 : 0);
      last = now;
      while (acc >= 1 / 60 && st.h > 0) {
        st = landerStep(st, burn.current ? 1 : 0, scenario.p, 1 / 60);
        acc -= 1 / 60;
      }
      frame++;
      draw();
      if (frame % 3 === 0) setHud({ h: Math.max(0, st.h), v: st.v, fuel: st.fuel });
      if (st.h <= 0 && !landed.current) {
        landed.current = true;
        cancelAnimationFrame(raf);
        setTimeout(() => onLand(st.v, st.fuel, st.t), 500);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  const safe = Math.abs(hud.v) <= scenario.p.safe;
  const hold = (on: boolean) => () => {
    burn.current = on;
  };
  return (
    <div className="tr-lander">
      <div className="tr-lander-hud">
        <span>
          Altura <b>{Math.round(hud.h)} m</b>
        </span>
        <span className={safe ? 'ok' : hud.h < 60 ? 'bad' : ''}>
          Velocidad <b>{Math.abs(hud.v).toFixed(1)} m/s {hud.v < -0.05 ? '↓' : hud.v > 0.05 ? '↑' : ''}</b>
        </span>
        <span className={hud.fuel < scenario.p.fuel * 0.15 ? 'bad' : ''}>
          Combustible <b>{Math.round(hud.fuel)} kg</b>
        </span>
      </div>
      <div className="tr-lander-view">
        <canvas ref={canvas} width={360} height={320} />
        {!started && (
          <button className="tr-btn go tr-lander-start" onClick={() => setStarted(true)}>
            ▶ Empezar el descenso
          </button>
        )}
      </div>
      <button className="tr-btn tr-burn" onPointerDown={hold(true)} onPointerUp={hold(false)} onPointerLeave={hold(false)} onPointerCancel={hold(false)} onContextMenu={(e) => e.preventDefault()} disabled={!started}>
        🔥 Mantén presionado para encender el motor <small>(o la barra espaciadora)</small>
      </button>
      <p className="tr-tip">💡 Gravedad de Marte: {MARS.g} m/s² hacia abajo. Sin motor, la nave gana {MARS.g} m/s cada segundo.</p>
    </div>
  );
}
