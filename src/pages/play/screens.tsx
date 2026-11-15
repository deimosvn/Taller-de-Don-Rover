// Pantallas del celular para cada etapa de la misión.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { BADGES, CATEGORIES, MISSIONS, ROLES, SECTORS, levelFromXp } from '../../../shared/content';
import { hashString, makeRng, shuffle } from '../../../shared/rng';
import type { BadgeId, IntelCard, PlayerView, QuizView, Tier } from '../../../shared/types';
import { Astronaut, IXOrb, MissionPatch } from '../../components/art';
import { Confetti, Icon, RoleChip } from '../../components/ui';
import { HealthCard, ScienceCard } from '../../components/nasa';
import { minigameFor } from '../../../shared/minigames';
import { Minigame } from './minigames';
import { ProblemCard } from './MissionProblem';
import { hostNow, useTicker } from '../../lib/clock';
import { vibrate } from '../../lib/pwa';
import { sfx } from '../../lib/sound';
import type { PlayerNet } from '../../net/playerNet';
import { AvatarBuilder } from './AvatarBuilder';
import type { Act } from './PlayApp';

const TIER: Record<Tier, { label: string; emoji: string }> = {
  best: { label: '¡Mejor decisión!', emoji: '🌟' },
  ok: { label: 'Funcionó a medias', emoji: '👍' },
  bad: { label: 'Hubo problemas', emoji: '⚠️' },
  critical: { label: 'Sin decisión', emoji: '⏳' },
};

/* ---------------- piezas ---------------- */

function useShuffled(options: string[], seedKey: string) {
  return useMemo(() => shuffle(makeRng(hashString(seedKey)), options.map((text, index) => ({ text, index }))), [options, seedKey]);
}

function QuizBlock({ quiz, seedKey, onAnswer, kicker }: { quiz: QuizView; seedKey: string; onAnswer: (i: number) => void; kicker: string }) {
  const opts = useShuffled(quiz.options, seedKey);
  const [busy, setBusy] = useState(false);
  return (
    <div className="quiz">
      <p className="eyebrow">{kicker}</p>
      <h2 className="quiz-q">{quiz.q}</h2>
      <div className="quiz-opts">
        {opts.map((o, i) => {
          const chosen = quiz.choice === o.index;
          const state = quiz.answered ? (o.index === quiz.answer ? 'right' : chosen ? 'wrong' : 'dim') : '';
          return (
            <button
              key={o.index}
              className={`quiz-opt ${state}`}
              disabled={quiz.answered || busy}
              onClick={() => {
                setBusy(true);
                sfx.select();
                onAnswer(o.index);
                setTimeout(() => setBusy(false), 1500);
              }}
            >
              <span className="quiz-letter">{'ABC'[i]}</span>
              {o.text}
            </button>
          );
        })}
      </div>
      {quiz.answered && quiz.explain && <p className={`quiz-explain ${quiz.correct ? 'ok' : 'retry'}`}>{quiz.explain}</p>}
    </div>
  );
}

export function IntelCardView({ card }: { card: IntelCard }) {
  const r = ROLES[card.role];
  return (
    <article className="intel card" style={{ '--c': r.color, '--cs': r.soft } as CSSProperties}>
      <header>
        <span className="intel-badge">{r.emoji}</span>
        <div>
          <small>Transmisión secreta · {r.name}</small>
          <h3>{card.title}</h3>
        </div>
      </header>
      <p className="intel-intro">{card.intro}</p>
      <ul className="intel-lines">
        {card.lines.map((l, i) => (
          <li key={i} className={l.strong ? 'strong' : ''}>
            <span>
              {l.emoji ? `${l.emoji} ` : ''}
              {l.label}
            </span>
            <b className="mono">{l.value}</b>
          </li>
        ))}
      </ul>
      <p className="intel-tip">💡 {card.tip}</p>
    </article>
  );
}

function Crewmates({ view }: { view: PlayerView }) {
  if (!view.crew) return null;
  return (
    <div className="crewmates">
      {view.crew.members.map((m) => (
        <div key={m.id} className={`mate ${m.id === view.me.id ? 'me' : ''} ${m.connected ? '' : 'off'}`}>
          <Astronaut avatar={m.avatar} role={m.roles[0]} size={46} pose="still" />
          <b>{m.id === view.me.id ? 'Tú' : m.name}</b>
          <span className="mate-roles">
            {m.roles.map((r) => (
              <span key={r} title={ROLES[r].name}>
                {ROLES[r].emoji}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

function Center({ children }: { children: ReactNode }) {
  return <div className="play-center">{children}</div>;
}

/* ---------------- abordaje ---------------- */

function Waiting({ view, act }: { view: PlayerView; act: Act }) {
  const [edit, setEdit] = useState(false);
  const [avatar, setAvatar] = useState(view.me.avatar);
  const lvl = levelFromXp(view.me.xp);
  if (edit) {
    return (
      <div className="screen">
        <h2>Ajusta tu astronauta</h2>
        <AvatarBuilder value={avatar} onChange={setAvatar} />
        <button
          className="btn big block food"
          onClick={async () => {
            await act({ type: 'avatar', avatar });
            setEdit(false);
          }}
        >
          <Icon name="check" /> Guardar
        </button>
      </div>
    );
  }
  return (
    <Center>
      <div className="aboard">
        <div className="aboard-glow" />
        <Astronaut avatar={view.me.avatar} size={170} pose="cheer" />
      </div>
      <h1 className="sticker">¡Estás a bordo!</h1>
      <p className="lead">Mira el proyector: IX formará las tripulaciones y te dará una especialidad.</p>
      <div className="level-chip">
        Nivel {lvl.level} · {lvl.title} · {view.me.xp} XP
      </div>
      {view.me.badges.includes('first') && <span className="chip">🚀 ¡Primer contacto! Fuiste la primera persona en abordar</span>}
      <button className="btn ghost" onClick={() => setEdit(true)}>
        <Icon name="edit" size={18} /> Editar astronauta
      </button>
    </Center>
  );
}

/* ---------------- tripulación y rol ---------------- */

function RoleReveal({ view }: { view: PlayerView }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setOpen(true);
      sfx.unlock();
    }, 900);
    return () => clearTimeout(t);
  }, []);
  if (!view.crew || !view.me.roles.length) {
    return (
      <Center>
        <IXOrb size={100} mood="talk" />
        <h2>IX te está asignando una tripulación…</h2>
      </Center>
    );
  }
  const roles = view.me.roles;
  const r = ROLES[roles[0]];
  const sector = SECTORS[view.crew.sectorId];
  return (
    <div className="screen">
      <p className="eyebrow center">Tripulación</p>
      <h1 className="sticker crew-title">{view.crew.name}</h1>
      <div className={`role-flip ${open ? 'open' : ''}`}>
        <div className="role-back card">
          <IXOrb size={70} mood="talk" />
          <b>Tu especialidad es…</b>
        </div>
        <div className="role-front card" style={{ '--c': r.color, '--cd': r.dark } as CSSProperties}>
          <div className="role-num mono">{r.num}</div>
          <Astronaut avatar={view.me.avatar} role={roles[0]} size={110} pose="wave" />
          <h2>{r.name}</h2>
          <p className="role-es">
            {r.emoji} {r.es} · {r.specialty}
          </p>
          <p className="role-ability">⭐ {r.ability}</p>
          <p className="role-secret">🔒 {r.secret}</p>
          {roles.length > 1 && (
            <div className="role-extra">
              También cubres:{' '}
              {roles.slice(1).map((x) => (
                <RoleChip key={x} role={x} />
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="panel sector-line">
        <span>{sector.emoji}</span>
        <p>
          Su sector: <b>{sector.name}</b> — {sector.desc}
        </p>
      </div>
      <Crewmates view={view} />
    </div>
  );
}

/* ---------------- escáner ---------------- */

function ScanWait({ view, act }: { view: PlayerView; act: Act }) {
  const ov = view.objectVote;
  if (ov?.open) {
    return (
      <div className="screen">
        <p className="eyebrow center">Votación de la clase</p>
        <h2 className="center">¿Qué objeto del salón exploramos?</h2>
        <div className="object-vote">
          {ov.options.map((c) => (
            <button
              key={c}
              className={`ov-opt card ${ov.myVote === c ? 'on' : ''}`}
              onClick={() => {
                sfx.select();
                vibrate(15);
                void act({ type: 'objectVote', category: c });
              }}
            >
              <span className="ov-emoji">{CATEGORIES[c].emoji}</span>
              <b>{CATEGORIES[c].label}</b>
              <small>{CATEGORIES[c].examples}</small>
              {ov.myVote === c && <span className="ov-check">✓</span>}
            </button>
          ))}
        </div>
        <p className="fine center">Puedes cambiar tu voto hasta que el profesor cierre la votación.</p>
      </div>
    );
  }
  return (
    <Center>
      <div className="radar">
        <i />
        <IXOrb size={80} mood="talk" />
      </div>
      <h2>IX está escaneando el mundo…</h2>
      <p className="lead">Mira el proyector: un objeto del salón está por convertirse en misión.</p>
    </Center>
  );
}

/* ---------------- briefing ---------------- */

function Briefing({ view }: { view: PlayerView }) {
  const m = view.mission!;
  const def = MISSIONS[m.id];
  return (
    <div className="screen center-col">
      <p className="eyebrow">New mission unlocked</p>
      <div className="patch-pop">
        <MissionPatch id={m.id} size={190} />
      </div>
      <h1 className="sticker mission-title" style={{ color: def.color }}>
        {def.title}
      </h1>
      <h3 className="mission-es">{def.titleEs}</h3>
      <div className="ix-bubble">
        <IXOrb size={44} mood="talk" />
        <p>{def.hook}</p>
      </div>
      {view.crew && m.crewLines[view.crew.id] && (
        <div className="panel my-line">
          <b>{view.crew.name}:</b> {m.crewLines[view.crew.id]}
        </div>
      )}
      {view.nasa?.science && <ScienceCard highlight={view.nasa.science} compact />}
      <p className="lead">Prepárate: vas a recibir una transmisión secreta que solo tú puedes leer.</p>
    </div>
  );
}

/* ---------------- descubrimiento ---------------- */

function Decode({ view, act }: { view: PlayerView; act: Act }) {
  const quiz = view.quiz;
  const [reveal, setReveal] = useState(false);
  const answeredWrong = quiz?.answered && !quiz.correct;
  useEffect(() => {
    if (!quiz?.answered) return;
    if (quiz.correct) {
      sfx.success();
      vibrate([20, 40, 20]);
      setReveal(true);
      return;
    }
    sfx.fail();
    const t = setTimeout(() => setReveal(true), 3800);
    return () => clearTimeout(t);
  }, [quiz?.answered, quiz?.correct]);

  if (!quiz || !view.me.roles[0]) {
    return (
      <Center>
        <IXOrb size={90} mood="talk" />
        <h2>Esperando tu transmisión…</h2>
      </Center>
    );
  }
  const role = ROLES[view.me.roles[0]];
  return (
    <div className="screen">
      {!quiz.answered ? (
        <>
          <div className="transmission card" style={{ '--c': role.color } as CSSProperties}>
            <span className="tx-icon">📡</span>
            <div>
              <b>Transmisión cifrada</b>
              <small>Solo {role.name} puede descifrarla</small>
            </div>
          </div>
          <QuizBlock quiz={quiz} seedKey={`${view.me.id}:${quiz.q}`} kicker="Resuelve el reto para descifrarla" onAnswer={(i) => void act({ type: 'quiz', choice: i })} />
        </>
      ) : (
        <>
          <div className={`decode-result ${quiz.correct ? 'ok' : 'retry'}`}>
            <span>{quiz.correct ? '🔓' : '📶'}</span>
            <div>
              <b>{quiz.correct ? '¡Transmisión descifrada!' : 'Interferencia en la señal…'}</b>
              <small>{quiz.correct ? '+50 XP · Decodificador' : reveal ? 'IX reparó la señal. ¡Tus datos están listos!' : 'IX está reparando la señal'}</small>
            </div>
          </div>
          {answeredWrong && <p className="quiz-explain retry">{quiz.explain}</p>}
          {answeredWrong && !reveal && (
            <div className="repair">
              <i />
            </div>
          )}
          {reveal && view.intel && (
            <>
              {view.intel.map((c) => (
                <IntelCardView key={c.role} card={c} />
              ))}
              <div className="share-aloud">
                <span>📣</span>
                <p>
                  <b>Comparte estos datos en voz alta con tu tripulación.</b> Nadie más los tiene: sin ellos, su equipo no podrá decidir bien.
                </p>
              </div>
              {quiz.correct && quiz.explain && <p className="quiz-explain ok">{quiz.explain}</p>}
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ---------------- reto de tripulación ---------------- */

function LogForm({ act }: { act: Act }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="logform card">
      <b>📓 Bitácora de la tripulación</b>
      <p className="muted">¿Por qué eligieron esta opción? Una sola persona escribe por todo el equipo.</p>
      <textarea className="input" maxLength={220} value={text} placeholder="Elegimos esto porque…" onChange={(e) => setText(e.target.value)} />
      <div className="row between">
        <small className="muted">{text.length}/220</small>
        <button
          className="btn small ix"
          disabled={text.trim().length < 3 || busy}
          onClick={async () => {
            setBusy(true);
            if (await act({ type: 'log', text })) sfx.success();
            setBusy(false);
          }}
        >
          Enviar bitácora
        </button>
      </div>
    </div>
  );
}

function Vote({ view, act }: { view: PlayerView; act: Act }) {
  const ch = view.challenge;
  useTicker(250);
  const lockSecs = ch?.lockIn ? Math.max(0, Math.ceil((ch.lockIn - hostNow()) / 1000)) : null;
  const prevLocked = useRef(ch?.locked);
  useEffect(() => {
    if (ch?.locked && !prevLocked.current) {
      sfx.lock();
      vibrate([40, 40, 80]);
    }
    prevLocked.current = ch?.locked;
  }, [ch?.locked]);

  if (!ch || !view.crew) {
    return (
      <Center>
        <IXOrb size={90} mood="talk" />
        <h2>Preparando el reto…</h2>
      </Center>
    );
  }
  const members = new Map(view.crew.members.map((m) => [m.id, m]));
  const decided = ch.options.find((o) => o.id === ch.decision);
  return (
    <div className="screen">
      <p className="eyebrow">Reto de tripulación · {view.crew.name}</p>
      <h2 className="vote-q">{ch.question}</h2>

      {view.intel && (
        <details className="my-intel" open={!ch.myVote && !ch.locked}>
          <summary>📡 Mis datos secretos</summary>
          {view.intel.map((c) => (
            <IntelCardView key={c.role} card={c} />
          ))}
        </details>
      )}

      <div className={`vote-status ${ch.locked ? 'locked' : ch.tie ? 'tie' : lockSecs !== null ? 'locking' : ''}`}>
        {ch.locked
          ? `🔒 Decisión bloqueada: ${decided ? `${decided.emoji} ${decided.label}` : 'sin votos'}`
          : ch.tie
            ? '⚖️ ¡Empate! Platiquen y cambien su voto'
            : lockSecs !== null
              ? `⏳ Todos votaron igual: bloqueando en ${lockSecs}…`
              : 'Comparen sus datos y voten. La decisión se bloquea cuando toda la tripulación vota.'}
      </div>

      <div className="vote-opts">
        {ch.options.map((o) => {
          const voters = Object.entries(ch.votes)
            .filter(([, v]) => v === o.id)
            .map(([id]) => members.get(id))
            .filter(Boolean);
          const mine = ch.myVote === o.id;
          const isDecision = ch.locked && ch.decision === o.id;
          return (
            <button
              key={o.id}
              className={`vote-opt-btn ${mine ? 'mine' : ''} ${isDecision ? 'decision' : ''}`}
              disabled={ch.locked}
              onClick={() => {
                sfx.select();
                vibrate(12);
                void act({ type: 'vote', optionId: o.id });
              }}
            >
              <span className="vo-emoji">{o.emoji}</span>
              <span className="vo-text">
                <b>{o.label}</b>
                <small>{o.detail}</small>
              </span>
              <span className="vo-voters">
                {voters.map((m) => (
                  <span key={m!.id} className="vo-voter" title={m!.name}>
                    <Astronaut avatar={m!.avatar} size={24} pose="still" />
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {ch.locked && (ch.log ? <div className="panel logdone">📓 Bitácora de {ch.log.by}: “{ch.log.text}”</div> : <LogForm act={act} />)}

      {view.bonus && (
        <div className="bonus card">
          <p className="bonus-tag">⚡ EMERGENCIA BONUS</p>
          {view.bonus.answered ? (
            <p className={`quiz-explain ${view.bonus.correct ? 'ok' : 'retry'}`}>
              {view.bonus.correct ? '¡Correcto! +40 XP · Experto NASA. ' : 'Casi. '}
              {view.bonus.explain}
            </p>
          ) : (
            <QuizBlock quiz={view.bonus} seedKey={`${view.me.id}:bonus:${view.bonus.q}`} kicker="Pregunta experta" onAnswer={(i) => void act({ type: 'bonus', choice: i })} />
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- evento global ---------------- */

export function TapGame({ view, net }: { view: PlayerView; net: PlayerNet | null }) {
  const ev = view.event!;
  const role = view.me.roles[0] ?? 'power';
  const r = ROLES[role];
  const spec = minigameFor(view.mission?.id, role);
  const pending = useRef(0);
  const [local, setLocal] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      if (pending.current > 0 && net) {
        net.sendTaps(pending.current);
        pending.current = 0;
      }
    }, 280);
    return () => clearInterval(id);
  }, [net]);
  // Cada acierto del minijuego se convierte en acciones para la colonia.
  const onPoints = (n: number) => {
    pending.current += n;
    setLocal((x) => x + n);
  };
  return (
    <div className="tapgame">
      <p className="eyebrow center">
        ¡ACCIÓN! · {ev.action.emoji} {ev.action.verb}
      </p>
      <Minigame spec={spec} color={r.color} dark={r.dark} onPoints={onPoints} />
      <p className="tap-count mono">{local} acciones</p>
      <div className="tap-bars">
        {ev.rolesPresent.map((x) => (
          <div key={x} className={`tap-bar ${x === role ? 'mine' : ''}`} style={{ '--c': ROLES[x].color, '--w': `${Math.min(100, (ev.crewTaps[x] / ev.target) * 100)}%` } as CSSProperties}>
            <span>{ROLES[x].emoji}</span>
            <i />
          </div>
        ))}
      </div>
      {ev.protocol && <p className="fine center">🛡️ Protocolo de tripulación: si una especialidad no trabaja, todo el equipo pierde fuerza.</p>}
      {view.nasa?.health && <HealthCard health={view.nasa.health} status={view.nasa.health} compact />}
      <ClassProgress view={view} />
    </div>
  );
}

function ClassProgress({ view }: { view: PlayerView }) {
  const ev = view.event!;
  return (
    <div className="class-progress">
      <div className="cp-track">
        <i style={{ width: `${Math.min(100, ev.progress)}%` }} />
        <span className="cp-goal" style={{ left: `${ev.goal}%` }} />
      </div>
      <small>
        Colonia: <b className="mono">{ev.progress}%</b> · meta {ev.goal}%
      </small>
    </div>
  );
}

function Emergency({ view, act, net }: { view: PlayerView; act: Act; net: PlayerNet | null }) {
  const ev = view.event;
  if (!ev) {
    return (
      <Center>
        <IXOrb size={90} mood="alert" />
        <h2>¡Alerta en la colonia!</h2>
      </Center>
    );
  }
  if (ev.stage === 'alert') {
    return (
      <div className="screen alert-screen">
        <div className="alert-card">
          <span className="alert-siren">🚨</span>
          <h1>{ev.title}</h1>
          <p>{ev.narrative}</p>
        </div>
        <p className="lead center">Mira el proyector…</p>
      </div>
    );
  }
  if (ev.stage === 'share') {
    const opts = [
      { n: 0, label: 'Guardar todo', detail: 'Nuestro sector se queda con todo' },
      { n: 1, label: 'Compartir un poco', detail: `${ev.shareUnit} para la red de la colonia` },
      { n: 2, label: 'Compartir mucho', detail: `${ev.shareUnit}${ev.shareUnit} para salvar a todos` },
    ];
    return (
      <div className="screen">
        <p className="eyebrow">{ev.title}</p>
        <h2>{ev.shareLabel}</h2>
        <p className="muted-light">Compartir protege a toda la colonia, pero su sector se queda con menos. La tripulación decide por promedio.</p>
        <div className="share-opts">
          {opts.map((o) => (
            <button
              key={o.n}
              className={`share-opt card ${ev.myShareVote === o.n ? 'on' : ''}`}
              onClick={() => {
                sfx.select();
                vibrate(15);
                void act({ type: 'share', amount: o.n });
              }}
            >
              <span className="share-icons">{o.n === 0 ? '🔒' : ev.shareUnit.repeat(o.n)}</span>
              <b>{o.label}</b>
              <small>{o.detail}</small>
            </button>
          ))}
        </div>
        <p className="fine center">{Object.keys(ev.shareVotes).length} de {view.crew?.members.length ?? 0} tripulantes ya votaron</p>
        {view.nasa?.health && <HealthCard health={view.nasa.health} status={view.nasa.health} compact />}
        <ClassProgress view={view} />
      </div>
    );
  }
  if (ev.stage === 'action') return <TapGame view={view} net={net} />;
  return (
    <Center>
      {ev.saved && <Confetti count={40} />}
      <div className={`stamp ${ev.saved ? 'ok' : 'bad'}`}>{ev.saved ? '¡COLONIA A SALVO!' : 'DAÑOS EN LA COLONIA'}</div>
      <p className="lead">Hiciste {ev.myTaps} acciones. ¡Mira los resultados en el proyector!</p>
      <ClassProgress view={view} />
    </Center>
  );
}

/* ---------------- resultados y debrief ---------------- */

function BadgePop({ id, delay }: { id: BadgeId; delay: number }) {
  const b = BADGES[id];
  return (
    <div className="badge-pop" style={{ animationDelay: `${delay}s` }}>
      <span>{b.emoji}</span>
      <div>
        <b>{b.name}</b>
        <small>{b.desc}</small>
      </div>
    </div>
  );
}

function Outcome({ view }: { view: PlayerView }) {
  const o = view.outcome;
  useEffect(() => {
    if (o) (o.tier === 'best' ? sfx.success : o.tier === 'ok' ? sfx.pop : sfx.fail)();
  }, [o?.tier]);
  if (!o) {
    return (
      <Center>
        <IXOrb size={90} mood="talk" />
        <h2>Calculando resultados…</h2>
      </Center>
    );
  }
  return (
    <div className="screen">
      {o.tier === 'best' && <Confetti count={50} />}
      <div className={`outcome-card card tier-${o.tier}`}>
        <span className="outcome-tier">
          {TIER[o.tier].emoji} {TIER[o.tier].label}
        </span>
        <h2>
          {o.optionEmoji} {o.optionLabel}
        </h2>
        <p className="why">{o.why}</p>
        {o.tier !== 'best' && o.solution && <p className="solution">💡 {o.solution}</p>}
      </div>
      <div className="xp-burst">
        <span className="mono">+{o.xpGained} XP</span>
        <small>
          Lugar {o.rank} de {o.crews} · {o.saved ? 'colonia a salvo 🎉' : 'colonia con daños 🛠️'}
        </small>
      </div>
      {o.newBadges.length > 0 && (
        <div className="badges-new">
          {o.newBadges.map((b, i) => (
            <BadgePop key={b} id={b} delay={0.3 + i * 0.25} />
          ))}
        </div>
      )}
      <div className="panel my-scores">
        {(
          [
            ['Eficiencia', o.scores.efficiency, 'var(--energy)'],
            ['Cooperación', o.scores.cooperation, 'var(--water)'],
            ['Creatividad', o.scores.creativity, 'var(--ix)'],
          ] as const
        ).map(([label, v, c]) => (
          <div key={label} className="my-score" style={{ '--c': c, '--w': `${v}%` } as CSSProperties}>
            <span>{label}</span>
            <i />
            <b className="mono">{v}</b>
          </div>
        ))}
      </div>
      {o.scores.creativity === 0 && <p className="fine center">💡 La próxima vez escriban la bitácora de la tripulación: suma puntos de creatividad.</p>}
    </div>
  );
}

function Debrief({ view }: { view: PlayerView }) {
  const d = view.debrief;
  const lvl = levelFromXp(view.me.xp);
  return (
    <div className="screen">
      <div className="ix-bubble">
        <IXOrb size={52} mood="happy" />
        <p>
          <b>{d?.headline ?? 'Debrief de la misión'}</b>
        </p>
      </div>
      {d && (
        <>
          <ol className="learn-list">
            {d.learnings.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ol>
          <div className="panel fact-m">
            <b>🛰️ Dato NASA</b>
            <p>{d.nasaFact}</p>
          </div>
          <div className="panel fact-m">
            <b>💬 Para conversar</b>
            <p>{d.reflection}</p>
          </div>
        </>
      )}
      <div className="profile-card-m card">
        <Astronaut avatar={view.me.avatar} role={view.me.roles[0]} size={84} pose="wave" />
        <div className="pc-info">
          <b>{view.me.name}</b>
          <small>
            Nivel {lvl.level} · {lvl.title}
          </small>
          <div className="xp-track">
            <i style={{ width: `${lvl.progress * 100}%` }} />
          </div>
          <small>{lvl.next} XP para el siguiente nivel</small>
        </div>
      </div>
      <div className="badge-wall">
        {(Object.keys(BADGES) as BadgeId[]).map((b) => (
          <span key={b} className={`bw ${view.me.badges.includes(b) ? 'on' : ''}`} title={BADGES[b].name}>
            {BADGES[b].emoji}
          </span>
        ))}
      </div>
      <p className="lead center">Espera la siguiente misión en el proyector 🚀</p>
    </div>
  );
}

/* ---------------- enrutador por fase ---------------- */

/** Invitación a recorrer la colonia en 3D mientras se espera. */
function Explore3D({ open3d, text }: { open3d?: () => void; text: string }) {
  if (!open3d) return null;
  return (
    <button className="explore-3d card" onClick={open3d}>
      <span className="explore-3d-emoji">🌍</span>
      <span>
        <b>Explorar la colonia en 3D</b>
        <small>{text}</small>
      </span>
    </button>
  );
}

export function PhaseScreen({ view, act, net, open3d }: { view: PlayerView; act: Act; net: PlayerNet | null; open3d?: () => void }) {
  if (view.phase !== 'lobby' && !view.crew) {
    return (
      <Center>
        <IXOrb size={100} mood="talk" />
        <h2>IX te está asignando una tripulación…</h2>
        <p className="lead">Te unirás en cuanto empiece la siguiente etapa.</p>
      </Center>
    );
  }
  switch (view.phase) {
    case 'lobby':
      return (
        <>
          <Waiting view={view} act={act} />
          <Explore3D open3d={open3d} text="Camina con tu astronauta, salta con la gravedad de Marte y saluda a tus compañeros." />
        </>
      );
    case 'crews':
      return (
        <>
          <RoleReveal view={view} />
          <Explore3D open3d={open3d} text="Ve a conocer tu sector y a tu tripulación en la colonia." />
        </>
      );
    case 'scan':
      return <ScanWait view={view} act={act} />;
    case 'briefing':
      return view.mission ? (
        <>
          <Briefing view={view} />
          <ProblemCard view={view} net={net} open3d={open3d} />
        </>
      ) : (
        <ScanWait view={view} act={act} />
      );
    case 'discovery':
      return (
        <>
          <Decode view={view} act={act} />
          <ProblemCard view={view} net={net} open3d={open3d} />
        </>
      );
    case 'challenge':
      return (
        <>
          {view.quiz && !view.quiz.answered ? <Decode view={view} act={act} /> : <Vote view={view} act={act} />}
          <ProblemCard view={view} net={net} open3d={open3d} />
        </>
      );
    case 'event':
      return <Emergency view={view} act={act} net={net} />;
    case 'results':
      return <Outcome view={view} />;
    case 'debrief':
      return <Debrief view={view} />;
  }
}
