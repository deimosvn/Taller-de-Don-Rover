// Tarjeta de cada etapa en el proyector. Regla de diseño: un título grande, una frase y una
// sola cosa que mirar. Lo demás lo cuenta Don Rover en voz alta o vive en el reporte.

import type { CSSProperties, ReactNode } from 'react';
import { BUILDINGS, MISSIONS, ROLES } from '../../../shared/content';
import { MINERALS, MINERAL_ORDER, RECIPES, craftStage } from '../../../shared/crafting';
import type { HostView, RoleId, Tier } from '../../../shared/types';
import { Astronaut, IXOrb, MissionPatch } from '../../components/art';
import { Confetti, Icon, QR, Typewriter, useCountUp } from '../../components/ui';
import { aiStatus } from '../../engine/ai';
import { joinUrl, loadSettings } from '../../engine/settings';
import { encodeSignaling } from '../../net/protocol';
import type { Run } from './Console';

export const TIER_LABEL: Record<Tier, { label: string; emoji: string }> = {
  best: { label: 'Mejor decisión', emoji: '🌟' },
  ok: { label: 'Funcionó a medias', emoji: '👍' },
  bad: { label: 'Hubo problemas', emoji: '⚠️' },
  critical: { label: 'Sin decisión', emoji: '⏳' },
};

/** Las tareas se leen en el orden en que dependen unas de otras. */
const CHAIN: RoleId[] = ['habitat', 'power', 'life', 'bio'];

function Kicker({ children, tone }: { children: ReactNode; tone?: 'alert' | 'ix' }) {
  return <p className={`hc-kicker ${tone ? `is-${tone}` : ''}`}>{children}</p>;
}

/* ------------------------------------------------------------------ */
/* Abordaje                                                             */
/* ------------------------------------------------------------------ */

export function LobbyStage({ view, run }: { view: HostView; run: Run }) {
  const settings = loadSettings();
  const sig = encodeSignaling(settings.signaling);
  const url = joinUrl(view.code, settings) + (sig ? `&s=${sig}` : '');
  const display = url.replace(/^https?:\/\//, '').replace(/#.*$/, '');
  const localhost = /^(localhost|127\.|\[::1\])/.test(window.location.hostname) && !settings.joinBase;
  const seats = Array.from({ length: view.maxPlayers }, (_, i) => view.players[i] ?? null);
  const n = view.players.length;
  return (
    <div className="hc-card hc-lobby">
      <div className="hc-join">
        <div className="hc-qr">
          <QR value={url} size={176} />
        </div>
        <div>
          <Kicker>Únete con tu celular</Kicker>
          <div className="hc-tiles" aria-label={`Código ${view.code}`}>
            {view.code.split('').map((ch, i) => (
              <span key={i} style={{ '--i': i } as CSSProperties}>
                {ch}
              </span>
            ))}
          </div>
          <p className="hc-url">
            Escanea el QR o abre <b>{display}</b>
          </p>
        </div>
      </div>
      <h1 className="hc-title">{n ? `${n} de ${view.maxPlayers} astronautas a bordo` : 'Esperando astronautas…'}</h1>
      <div className="hc-seats">
        {seats.map((p, i) =>
          p ? (
            <div key={p.id} className={`hc-seat ${p.connected || p.isBot ? '' : 'is-off'}`} style={{ '--i': i } as CSSProperties}>
              <Astronaut avatar={p.avatar} size={74} pose={i % 2 ? 'wave' : 'idle'} />
              <b>
                {p.name}
                {p.isBot ? ' 🤖' : ''}
              </b>
              <button className="hc-seat-x" aria-label={`Quitar a ${p.name}`} onClick={() => confirm(`¿Quitar a ${p.name}?`) && run({ type: 'kick', playerId: p.id })}>
                ×
              </button>
            </div>
          ) : (
            <div key={`free-${i}`} className="hc-seat is-free">
              <span aria-hidden="true">🧑‍🚀</span>
              <small>Lugar libre</small>
            </div>
          ),
        )}
      </div>
      <div className="hc-modes">
        <p>
          <b>¿Qué jugamos?</b> Misión en equipo con el botón de abajo, o un torneo de todos contra todos.
        </p>
        <button className="hc-mode" onClick={() => run({ type: 'partyStart', rounds: 5 })} disabled={n < 2} title={n < 2 ? 'Necesitas al menos 2 jugadores (agrega bots)' : 'Empezar el torneo'}>
          <span aria-hidden="true">🏆</span>
          <span>
            <b>Torneo marciano</b>
            <small>{n < 2 ? 'Necesita 2 jugadores o más' : '5 rondas · todos contra todos'}</small>
          </span>
        </button>
      </div>
      {localhost && (
        <p className="hc-warn">
          <Icon name="alert" size={16} /> Estás en “localhost”: los celulares no pueden abrirlo. Publica la app (HTTPS) o abre el Taller con la IP de tu red.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tripulación                                                          */
/* ------------------------------------------------------------------ */

export function CrewsStage({ view }: { view: HostView }) {
  const crew = view.crews[0];
  const byId = new Map(view.players.map((p) => [p.id, p]));
  if (!crew) return null;
  return (
    <div className="hc-card">
      <Kicker>Tripulación lista</Kicker>
      <h1 className="hc-title">Tripulación {crew.name}</h1>
      <p className="hc-lead">Cada especialidad cuida un sistema de la colonia y tendrá un dato que nadie más tiene.</p>
      <ul className="hc-roster">
        {crew.memberIds.map((id, i) => {
          const p = byId.get(id);
          if (!p) return null;
          return (
            <li key={id} style={{ '--i': i } as CSSProperties}>
              <Astronaut avatar={p.avatar} role={p.roles[0] ?? null} size={58} pose="still" />
              <b>
                {p.name}
                {p.isBot ? ' 🤖' : ''}
              </b>
              <span className="hc-roles">
                {p.roles.map((r) => (
                  <span key={r} style={{ '--c': ROLES[r].color } as CSSProperties}>
                    {ROLES[r].emoji} {ROLES[r].specialty}
                  </span>
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* IX genera la misión                                                  */
/* ------------------------------------------------------------------ */

const GEN_STEPS: { stage: 'nasa' | 'ai' | 'ready'; label: string }[] = [
  { stage: 'nasa', label: 'Clima espacial real de la NASA' },
  { stage: 'ai', label: 'La misión y las 4 piezas por fabricar' },
  { stage: 'ready', label: 'Misión lista' },
];

export function MissionGenStage({ view, run }: { view: HostView; run: Run }) {
  const g = view.generator;
  const at = g ? GEN_STEPS.findIndex((s) => s.stage === g.stage) : 0;
  return (
    <div className="hc-card hc-gen">
      <div className="hc-gen-orb">
        <IXOrb size={110} mood={g?.stage === 'error' ? 'alert' : 'talk'} />
      </div>
      <Kicker tone="ix">IX está creando la misión</Kicker>
      <h1 className="hc-title">Leyendo el cielo de Marte…</h1>
      <ol className="hc-steps">
        {GEN_STEPS.map((s, i) => (
          <li key={s.stage} className={i < at ? 'is-done' : i === at ? 'is-now' : ''}>
            <span>{i < at ? '✓' : i + 1}</span>
            {s.label}
          </li>
        ))}
      </ol>
      <p className="hc-lead">{g?.text ?? 'Conectando con IX…'}</p>
      {g?.conditions.length ? (
        <div className="hc-chips">
          {g.conditions.slice(0, 3).map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
      ) : null}
      <p className="hc-fine">{aiStatus().enabled ? 'La IA (Claude) escribe la misión.' : 'Sin IA conectada, las reglas del motor deciden con los mismos datos.'}</p>
      {g?.stage === 'error' && (
        <button className="hc-btn" onClick={() => run({ type: 'toScan' })}>
          <Icon name="refresh" size={18} /> Volver a intentar
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Briefing                                                             */
/* ------------------------------------------------------------------ */

export function BriefingStage({ view }: { view: HostView }) {
  const m = view.mission!;
  const def = MISSIONS[m.id];
  const science = view.nasa?.science?.highlight;
  return (
    <div className="hc-card">
      <div className="hc-brief-head">
        <MissionPatch id={m.id} size={88} live />
        <div>
          <Kicker>
            Misión {def.code} · {m.aiPlanned ? 'creada por IX con IA y datos de la NASA' : 'creada por IX con datos de la NASA'}
          </Kicker>
          <h1 className="hc-title" style={{ '--mc': def.color } as CSSProperties}>
            {def.titleEs}
          </h1>
        </div>
      </div>
      <p className="hc-lead hc-typed">
        <Typewriter text={m.briefing} />
      </p>
      <div className="hc-chips">
        {def.learning.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      {science && (
        <a className="hc-science" href={science.url} target="_blank" rel="noreferrer">
          <span aria-hidden="true">🛰️</span>
          <span>
            <small>Basada en un estudio real de la NASA ({science.source})</small>
            <b>{science.title}</b>
          </span>
        </a>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Exploración: minar y fabricar                                        */
/* ------------------------------------------------------------------ */

export function DiscoveryStage({ view }: { view: HostView }) {
  const m = view.mission!;
  const crew = view.crews[0];
  const byId = new Map(view.players.map((p) => [p.id, p]));
  if (!crew) return null;
  const roles = CHAIN.filter((r) => crew.memberIds.some((id) => byId.get(id)?.roles.includes(r)));
  const done = roles.filter((r) => (crew.tasks?.[r] ?? 0) >= 1).length;
  return (
    <div className="hc-card">
      <Kicker>Exploración · minar y fabricar</Kicker>
      <h1 className="hc-title">
        {done === roles.length && roles.length ? '¡Todas las piezas listas!' : 'Cada especialidad fabrica una pieza'}
      </h1>
      <p className="hc-lead">Salen a minar regolito, hielo y hematita en el Marte 3D y fabrican su pieza en su estación. Las piezas dependen unas de otras.</p>
      <ul className="hc-craft">
        {roles.map((r, i) => {
          const recipe = RECIPES[m.id][r];
          const who = crew.memberIds.map((id) => byId.get(id)).find((p) => p?.roles.includes(r));
          const v = Math.round((crew.tasks?.[r] ?? 0) * 100);
          const stage = craftStage(crew.taskPoints?.[r] ?? 0);
          const label = v >= 100 ? 'Instalada' : stage === 'done' ? 'Esperando a la pieza anterior' : stage === 'crafting' ? 'Lista para fabricar' : 'Minando';
          return (
            <li key={r} className={`is-${v >= 100 ? 'done' : stage}`} style={{ '--c': ROLES[r].color, '--i': i } as CSSProperties}>
              <span className="hc-craft-item" aria-hidden="true">
                {recipe.emoji}
              </span>
              <div className="hc-craft-text">
                <b>{recipe.item}</b>
                <small>
                  {ROLES[r].emoji} {who?.name ?? ROLES[r].specialty} ·{' '}
                  {MINERAL_ORDER.filter((x) => recipe.needs[x]).map((x) => `${MINERALS[x].emoji}${recipe.needs[x]}`).join(' ')}
                </small>
                <span className="hc-bar">
                  <i style={{ width: `${v}%` }} />
                </span>
              </div>
              <span className="hc-craft-state">
                {v >= 100 ? '✅' : stage === 'mining' ? '⛏️' : '🛠️'}
                <small>{label}</small>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reto de la tripulación                                               */
/* ------------------------------------------------------------------ */

export function ChallengeStage({ view }: { view: HostView }) {
  const m = view.mission!;
  const crew = view.crews[0];
  const byId = new Map(view.players.map((p) => [p.id, p]));
  if (!crew) return null;
  const s = crew.status;
  return (
    <div className="hc-card">
      <Kicker>Reto de la tripulación</Kicker>
      <h1 className="hc-title">{m.puzzleTitle}</h1>
      <p className="hc-lead">{m.puzzleQuestion}</p>
      <div className="hc-votes">
        {crew.memberIds.map((id) => {
          const p = byId.get(id);
          if (!p) return null;
          const voted = view.progress[id]?.voted;
          return (
            <span key={id} className={`hc-vote ${voted ? 'is-on' : ''}`}>
              <Astronaut avatar={p.avatar} role={p.roles[0] ?? null} size={62} pose="still" />
              <i aria-hidden="true">{voted ? '✓' : '…'}</i>
              <small>{p.name}</small>
            </span>
          );
        })}
      </div>
      <p className={`hc-state ${s.locked ? 'is-ok' : s.tie ? 'is-warn' : ''}`}>
        {s.locked ? '🔒 Decisión tomada' : s.tie ? '⚖️ Empate: dialoguen y vuelvan a votar' : s.lockIn ? '⏳ Bloqueando la decisión…' : `🗳️ ${s.voted} de ${s.members} votos`}
      </p>
      {view.bonusActive && <p className="hc-fine">⚡ Pregunta experta abierta en los celulares.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Emergencia                                                           */
/* ------------------------------------------------------------------ */

export function EventStage({ view }: { view: HostView }) {
  const m = view.mission!;
  const def = MISSIONS[m.id];
  const ev = view.event!;
  const crew = view.crews[0];
  const progress = useCountUp(ev.progress, 400);
  return (
    <div className={`hc-card hc-event is-${ev.stage}`}>
      <Kicker tone="alert">🚨 Emergencia en la colonia</Kicker>
      <h1 className="hc-title">{def.event.title}</h1>
      <p className="hc-lead">{ev.stage === 'alert' ? def.event.narrative : ev.stage === 'share' ? `La tripulación decide: ${def.event.shareLabel.toLowerCase()}.` : 'Cada especialidad juega su minijuego. ¡Rápido!'}</p>
      {view.nasa?.weather && ev.stage !== 'action' && <p className="hc-fine">☀️ Clima espacial real (NASA DONKI): {view.nasa.weather.headline}</p>}
      {ev.stage === 'share' && crew && (
        <p className="hc-state">
          🗳️ {crew.status.shareVotes} de {crew.status.members} votaron
        </p>
      )}
      {(ev.stage === 'action' || ev.stage === 'done') && (
        <div className="hc-goal" aria-label={`Progreso ${progress}% de ${ev.goal}%`}>
          <span className="hc-goal-fill" style={{ width: `${Math.min(100, progress)}%` }} />
          <span className="hc-goal-mark" style={{ left: `${ev.goal}%` }}>
            Meta {ev.goal}%
          </span>
          <b>{progress}%</b>
        </div>
      )}
      {ev.stage === 'done' && <p className={`hc-stamp ${ev.saved ? 'is-ok' : 'is-bad'}`}>{ev.saved ? '¡Colonia a salvo!' : 'Daños en la colonia'}</p>}
      {ev.stage === 'done' && ev.saved && <Confetti />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Resultados                                                           */
/* ------------------------------------------------------------------ */

function Score({ label, value, color }: { label: string; value: number; color: string }) {
  const v = useCountUp(value, 900);
  return (
    <div className="hc-score" style={{ '--c': color, '--w': `${value}%` } as CSSProperties}>
      <span>{label}</span>
      <i />
      <b>{v}</b>
    </div>
  );
}

export function ResultsStage({ view }: { view: HostView }) {
  const r = view.results!;
  const crew = view.crews[0];
  const o = crew?.outcome;
  return (
    <div className="hc-card">
      <Kicker>Resultados</Kicker>
      <h1 className="hc-title">{r.saved ? '¡La colonia sigue en pie!' : 'La colonia resistió con daños'}</h1>
      {o && (
        <>
          <p className={`hc-tier tier-${o.tier}`}>
            {TIER_LABEL[o.tier].emoji} {TIER_LABEL[o.tier].label} · {o.optionEmoji} {o.optionLabel}
          </p>
          <p className="hc-lead">{o.why}</p>
          <div className="hc-scores">
            <Score label="Eficiencia" value={o.scores.efficiency} color="#FFC93C" />
            <Score label="Cooperación" value={o.scores.cooperation} color="#3CC8FF" />
            <Score label="Creatividad" value={o.scores.creativity} color="#B69CFF" />
          </div>
        </>
      )}
      {r.chain.length > 0 && (
        <ul className="hc-chain">
          {r.chain.slice(0, 3).map((c, i) => (
            <li key={i} style={{ '--i': i } as CSSProperties}>
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Debrief                                                              */
/* ------------------------------------------------------------------ */

export function DebriefStage({ view }: { view: HostView }) {
  const d = view.debrief!;
  const b = BUILDINGS[d.unlocked];
  return (
    <div className="hc-card">
      <Kicker tone="ix">Debrief de IX {d.aiGenerated ? '· escrito con Claude' : ''}</Kicker>
      <h1 className="hc-title">{d.headline}</h1>
      <ol className="hc-learn">
        {d.learnings.slice(0, 3).map((l, i) => (
          <li key={i} style={{ '--i': i } as CSSProperties}>
            {l}
          </li>
        ))}
      </ol>
      <div className="hc-unlock">
        <span aria-hidden="true">{b.emoji}</span>
        <span>
          <small>Nuevo en la colonia</small>
          <b>{b.name}</b>
        </span>
      </div>
      <p className="hc-question">💬 {d.reflection}</p>
    </div>
  );
}

