// Escenarios del proyector para cada etapa de la clase.

import type { CSSProperties } from 'react';
import { BUILDINGS, CATEGORIES, MISSIONS, MISSION_ORDER, PACES, ROLES, ROLE_ORDER, SECTORS } from '../../../shared/content';
import type { HostCrew, HostView, Tier } from '../../../shared/types';
import { Astronaut, IXOrb, MissionPatch } from '../../components/art';
import { PlanetView } from '../../world/react/PlanetView';
import { useHostSnapshot } from '../../world/react/useHostSnapshot';
import { MISSION_ZONE } from '../../world/react/missionZones';
import { Confetti, Icon, QR, RoleChip, Stars, Typewriter, useCountUp } from '../../components/ui';
import { HealthCard, NasaLiveChip, ScienceCard, WeatherCard } from '../../components/nasa';
import { joinUrl, loadSettings } from '../../engine/settings';
import { encodeSignaling } from '../../net/protocol';
import type { Run } from './Console';

export const TIER_LABEL: Record<Tier, { label: string; emoji: string }> = {
  best: { label: 'Mejor decisión', emoji: '🌟' },
  ok: { label: 'Funcionó a medias', emoji: '👍' },
  bad: { label: 'Hubo problemas', emoji: '⚠️' },
  critical: { label: 'Sin decisión', emoji: '⏳' },
};

/* ------------------------------------------------------------------ */
/* Abordaje                                                             */
/* ------------------------------------------------------------------ */

export function LobbyStage({ view, run }: { view: HostView; run: Run }) {
  const snapshot = useHostSnapshot(view);
  const settings = loadSettings();
  const sig = encodeSignaling(settings.signaling);
  const url = joinUrl(view.code, settings) + (sig ? `&s=${sig}` : '');
  const display = url.replace(/^https?:\/\//, '').replace(/#.*$/, '');
  const localhost = /^(localhost|127\.|\[::1\])/.test(window.location.hostname) && !settings.joinBase;
  return (
    <div className="lobby">
      <div className="join card">
        <p className="eyebrow dark">Únete a la misión</p>
        <QR value={url} size={250} />
        <div className="code-tiles" aria-label={`Código ${view.code}`}>
          {view.code.split('').map((ch, i) => (
            <span key={i} className="tile" style={{ animationDelay: `${i * 0.08}s` }}>
              {ch}
            </span>
          ))}
        </div>
        <p className="join-url">
          Escanea el QR o abre <b>{display}</b> y escribe el código
        </p>
        {localhost && (
          <p className="join-warn">
            <Icon name="alert" size={16} /> Estás en “localhost”: los celulares no pueden abrirlo. Publica la app (HTTPS) o abre el Taller de Don Rover con la IP de tu red.
          </p>
        )}
      </div>

      <div className="lobby-world">
        <div className="lobby-head">
          <h2 className="sticker">{view.players.length ? `${view.players.length} astronauta${view.players.length > 1 ? 's' : ''} a bordo` : 'Esperando tripulantes…'}</h2>
          <p>Cada quien crea su astronauta en su celular. Cuando estén todos, IX formará tripulaciones de cuatro.</p>
          <NasaLiveChip />
        </div>
        <div className="lobby-empty">
          <PlanetView snapshot={snapshot} className="stage-planet" />
          {view.players.length === 0 ? (
            <div className="lobby-empty-tip panel">
              <IXOrb size={64} mood="talk" />
              <p>
                <b>¿Probando solo?</b> Agrega bots de práctica desde la barra inferior: juegan como alumnos reales para que veas toda la misión.
              </p>
            </div>
          ) : (
            <div className="landing-pad">
              {view.players.map((p, i) => (
                <div key={p.id} className={`pad-astro ${p.connected ? '' : 'off'}`} style={{ animationDelay: `${(i % 12) * 0.04}s` }}>
                  <Astronaut avatar={p.avatar} size={view.players.length > 12 ? 52 : 70} pose={i % 3 === 0 ? 'wave' : 'idle'} />
                  <span className="pad-name">
                    {p.name}
                    {p.isBot ? ' 🤖' : ''}
                  </span>
                  <button
                    className="pad-kick"
                    aria-label={`Quitar a ${p.name}`}
                    onClick={() => confirm(`¿Quitar a ${p.name} de la colonia?`) && run({ type: 'kick', playerId: p.id })}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tripulaciones                                                        */
/* ------------------------------------------------------------------ */

export function CrewsStage({ view }: { view: HostView }) {
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const snapshot = useHostSnapshot(view);
  return (
    <div className="crews-stage">
      <div className="stage-head">
        <p className="eyebrow">Crew assignment</p>
        <h2 className="sticker">¡Tripulaciones listas!</h2>
        <p>Cada tripulación cuida un sector de la colonia. Los cuatro roles reciben información distinta: nadie puede resolver la misión solo.</p>
      </div>
      <div className="crews-layout">
      <div className="crews-planet">
        <PlanetView snapshot={snapshot} focus="colony.mars01" autoRotate={false} className="stage-planet" />
      </div>
      <div className="crew-grid">
        {view.crews.map((c, i) => (
          <article key={c.id} className="crew-card card" style={{ animationDelay: `${i * 0.08}s` }}>
            <header>
              <h3>{c.name}</h3>
              <span className="chip dark">
                {SECTORS[c.sectorId].emoji} {SECTORS[c.sectorId].name}
              </span>
            </header>
            <ul>
              {c.memberIds.map((id) => {
                const p = byId.get(id);
                if (!p) return null;
                return (
                  <li key={id}>
                    <Astronaut avatar={p.avatar} role={p.roles[0]} size={40} pose="still" />
                    <span className="crew-member-name">
                      {p.name}
                      {p.isBot ? ' 🤖' : ''}
                    </span>
                    <span className="crew-roles">
                      {p.roles.map((r) => (
                        <RoleChip key={r} role={r} short />
                      ))}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="crew-desc">{SECTORS[c.sectorId].desc}</p>
          </article>
        ))}
      </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Briefing                                                             */
/* ------------------------------------------------------------------ */

export function BriefingStage({ view }: { view: HostView }) {
  const m = view.mission!;
  const snapshot = useHostSnapshot(view);
  const def = MISSIONS[m.id];
  return (
    <div className="briefing">
      <div className="brief-left">
        <div className="brief-planet">
          <PlanetView snapshot={snapshot} focus={MISSION_ZONE[m.id]} autoRotate={false} className="stage-planet" />
          <div className="unlock-burst">
            <MissionPatch id={m.id} size={150} live />
          </div>
        </div>
        <span className="chip ix">
          {CATEGORIES[m.category].emoji} {m.source === 'teacher' ? 'Elegida por el profesor' : `Descubierto: ${m.objectLabel}`}
        </span>
      </div>
      <div className="brief-right">
        <p className="eyebrow">New mission unlocked · {def.code}</p>
        <h1 className="sticker brief-title" style={{ '--mc': def.color } as CSSProperties}>
          {def.title}
        </h1>
        <h2 className="brief-es">{def.titleEs}</h2>
        <div className="ix-say">
          <IXOrb size={68} mood="talk" />
          <p>
            <Typewriter text={m.briefing} />
          </p>
        </div>
        <div className="brief-grid">
          <div className="panel brief-box">
            <span className="eyebrow">Objetivo</span>
            <p>{def.objective}</p>
          </div>
          <div className="panel brief-box">
            <span className="eyebrow">Aprenderemos</span>
            <div className="chips">
              {def.learning.map((l) => (
                <span key={l} className="chip">
                  {l}
                </span>
              ))}
            </div>
          </div>
        </div>
        {view.nasa?.science?.highlight && <ScienceCard highlight={view.nasa.science.highlight} studies={view.nasa.science.studies} ai={view.nasa.science.ai} />}
        <div className="twists">
          <span className="eyebrow">3 acontecimientos inesperados</span>
          <div className="twist-cards">
            {[0, 1, 2].map((i) => (
              <div key={i} className="twist sealed">
                <Icon name="lock" size={18} />
                <span>{['Datos nuevos', 'Emergencia global', 'Descubrimiento'][i]}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="brief-foot">
          {m.aiNarrative && <span className="chip ok">✨ Historia personalizada por Claude</span>}
          {def.disclaimer && <span className="fine">{def.disclaimer}</span>}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Descubrimiento                                                       */
/* ------------------------------------------------------------------ */

function Gauge({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = useCountUp(Math.round(value * 100));
  return (
    <div className="gauge" style={{ '--c': color, '--p': `${pct * 3.6}deg` } as CSSProperties}>
      <div className="gauge-ring">
        <b className="mono">{pct}%</b>
      </div>
      <span>{label}</span>
    </div>
  );
}

export function DiscoveryStage({ view }: { view: HostView }) {
  const def = MISSIONS[view.mission!.id];
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const inCrews = view.crews.flatMap((c) => c.memberIds);
  const answered = inCrews.filter((id) => view.progress[id]?.decoded).length;
  const correct = inCrews.filter((id) => view.progress[id]?.correct).length;
  return (
    <div className="discovery">
      <div className="stage-head">
        <p className="eyebrow">Discovery</p>
        <h2 className="sticker">Transmisiones cifradas</h2>
        <p>Cada especialidad recibió una transmisión secreta. Para leerla debe resolver un reto científico en su celular… y luego contarla a su tripulación.</p>
      </div>
      <div className="discovery-body">
        <div className="decode-grid">
          {view.crews.map((c) => (
            <div key={c.id} className="decode-card panel">
              <div className="decode-head">
                <b>{c.name}</b>
                <small>
                  {c.status.decoded}/{c.status.members}
                </small>
              </div>
              <div className="role-slots">
                {c.memberIds.map((id) => {
                  const p = byId.get(id);
                  const pr = view.progress[id];
                  if (!p) return null;
                  const role = p.roles[0];
                  return (
                    <div key={id} className={`role-slot ${pr?.decoded ? (pr.correct ? 'ok' : 'retry') : ''}`} style={{ '--c': role ? ROLES[role].color : '#999' } as CSSProperties} title={p.name}>
                      <span>{role ? ROLES[role].emoji : '•'}</span>
                      <i>{pr?.decoded ? (pr.correct ? '✓' : '↺') : '…'}</i>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="discovery-side">
          <Gauge label="Transmisiones descifradas" value={inCrews.length ? answered / inCrews.length : 0} color="var(--water)" />
          <Gauge label="Precisión de la clase" value={answered ? correct / answered : 0} color="var(--food)" />
          <div className="panel concept">
            <span className="eyebrow">Conceptos en juego</span>
            <div className="chips">
              {def.learning.map((l) => (
                <span key={l} className="chip">
                  {l}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reto de tripulación                                                  */
/* ------------------------------------------------------------------ */

export function ChallengeStage({ view }: { view: HostView }) {
  const m = view.mission!;
  const byId = new Map(view.players.map((p) => [p.id, p]));
  const locked = view.crews.filter((c) => c.status.locked).length;
  return (
    <div className="challenge">
      <div className="stage-head">
        <p className="eyebrow">Crew challenge · {locked}/{view.crews.length} decisiones</p>
        <h2 className="sticker">{m.puzzleTitle}</h2>
        <p>
          {m.puzzleQuestion} Nadie tiene toda la información: combinen sus datos y voten en su celular. Cuando toda la tripulación vota lo mismo, la decisión se
          bloquea.
        </p>
      </div>
      {view.bonusActive && (
        <div className="bonus-banner">
          <span>⚡</span> EMERGENCIA BONUS desbloqueada: pregunta experta en los celulares ({view.stats.bonusCorrect}/{view.stats.bonusAnswered} correctas)
        </div>
      )}
      <div className="vote-grid">
        {view.crews.map((c) => {
          const s = c.status;
          return (
            <div key={c.id} className={`vote-card panel ${s.locked ? 'locked' : ''} ${s.tie ? 'tie' : ''}`}>
              <div className="vote-head">
                <b>{c.name}</b>
                {s.locked ? (
                  <span className="chip ok">🔒 Bloqueada</span>
                ) : s.tie ? (
                  <span className="chip warn">⚖️ Empate: dialoguen</span>
                ) : s.lockIn ? (
                  <span className="chip ix">⏳ Bloqueando…</span>
                ) : (
                  <span className="chip">
                    {s.voted}/{s.members} votos
                  </span>
                )}
              </div>
              <div className="vote-avatars">
                {c.memberIds.map((id) => {
                  const p = byId.get(id);
                  if (!p) return null;
                  return (
                    <span key={id} className={`va ${view.progress[id]?.voted ? 'on' : ''}`} title={p.name}>
                      <Astronaut avatar={p.avatar} role={p.roles[0]} size={40} pose="still" />
                      {view.progress[id]?.voted && <i>✓</i>}
                    </span>
                  );
                })}
              </div>
              {s.log && <p className="vote-log">📓 Bitácora enviada{s.logBy ? ` por ${s.logBy}` : ''}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Evento global                                                        */
/* ------------------------------------------------------------------ */

function ShareTokens({ n, unit }: { n: number; unit: string }) {
  return (
    <span className="tokens">
      {[0, 1].map((i) => (
        <span key={i} className={i < n ? 'on' : ''}>
          {unit}
        </span>
      ))}
    </span>
  );
}

export function EventStage({ view }: { view: HostView }) {
  const m = view.mission!;
  const def = MISSIONS[m.id];
  const ev = view.event!;
  const target = Math.round(PACES[view.pace].action * 1.6);
  const progress = useCountUp(ev.progress, 400);
  const dark = m.id === 'darkness';
  const snapshot = useHostSnapshot(view, dark ? { dark: true, storm: false } : { storm: true });
  return (
    <div className={`event-stage stage-${ev.stage}`}>
      <div className="event-map">
        <PlanetView snapshot={snapshot} interactive={false} className="stage-planet" />
      </div>
      <div className="event-overlay">
        <div className="alarm-title">
          <span className="siren" aria-hidden="true">
            🚨
          </span>
          <h1 className="sticker">{def.event.title}</h1>
        </div>
        <p className="event-narrative">{def.event.narrative}</p>

        {(view.nasa?.weather || view.nasa?.health) && (
          <div className="nasa-row">
            {view.nasa.weather && <WeatherCard weather={view.nasa.weather} compact={ev.stage === 'action'} />}
            {view.nasa.health && <HealthCard health={view.nasa.health} compact={ev.stage !== 'alert'} />}
          </div>
        )}

        {ev.stage === 'alert' && <p className="event-hint">Transmisión de emergencia a todas las tripulaciones…</p>}

        {ev.stage === 'share' && (
          <div className="share-board">
            <p className="eyebrow">Cada tripulación decide: {def.event.shareLabel.toLowerCase()}</p>
            <div className="share-grid">
              {view.crews.map((c) => {
                const votes = c.memberIds.map((id) => view.progress[id]?.share).filter((x): x is number => x !== null && x !== undefined);
                const live = votes.length ? Math.round(votes.reduce((a, b) => a + b, 0) / votes.length) : 0;
                return (
                  <div key={c.id} className="share-cell panel">
                    <b>{c.name}</b>
                    <ShareTokens n={live} unit={def.event.shareUnit} />
                    <small>
                      {c.status.shareVotes}/{c.status.members} votos
                    </small>
                  </div>
                );
              })}
            </div>
            <p className="fine">Si la clase comparte lo suficiente y todas las especialidades trabajan, toda la colonia queda protegida.</p>
          </div>
        )}

        {(ev.stage === 'action' || ev.stage === 'done') && (
          <div className="action-board">
            <div className="big-progress" aria-label={`Progreso de la colonia ${progress}%`}>
              <div className="big-progress-fill" style={{ width: `${Math.min(100, progress)}%` }} />
              <div className="big-progress-goal" style={{ left: `${ev.goal}%` }}>
                <span>Meta {ev.goal}%</span>
              </div>
              <b className="mono">{progress}%</b>
            </div>
            <div className="action-crews">
              {view.crews.map((c) => (
                <div key={c.id} className="action-crew">
                  <b>{c.name}</b>
                  <ShareTokens n={c.status.share ?? 0} unit={def.event.shareUnit} />
                  <div className="role-bars">
                    {ROLE_ORDER.filter((r) => c.status.rolesPresent.includes(r)).map((r) => (
                      <i key={r} title={ROLES[r].name} style={{ '--c': ROLES[r].color, '--w': `${Math.min(100, (c.status.taps[r] / target) * 100)}%` } as CSSProperties} />
                    ))}
                  </div>
                  {c.status.protocol && <span className="chip warn">Protocolo</span>}
                  {c.health && (
                    <span className="crew-health" title="Protección ante la condición de salud y rendimiento de sus acciones">
                      {view.nasa?.health?.emoji} {Math.round(c.health.factor * 100)}%{c.health.dose !== null ? ` · ${c.health.dose.toFixed(1)} mSv` : ''}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {ev.stage === 'done' && (
          <div className={`stamp ${ev.saved ? 'ok' : 'bad'}`}>{ev.saved ? '¡COLONIA A SALVO!' : 'DAÑOS EN LA COLONIA'}</div>
        )}
      </div>
      {ev.stage === 'done' && ev.saved && <Confetti />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Resultados                                                           */
/* ------------------------------------------------------------------ */

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="scorebar" style={{ '--c': color, '--w': `${value}%` } as CSSProperties}>
      <span>{label}</span>
      <i />
      <b className="mono">{value}</b>
    </div>
  );
}

export function ResultsStage({ view }: { view: HostView }) {
  const m = view.mission!;
  const r = view.results!;
  const def = MISSIONS[m.id];
  const crewName = (id: string) => view.crews.find((c) => c.id === id)?.name ?? id;
  const snapshot = useHostSnapshot(view, { newBuilding: def.unlock });
  const ranked = r.ranking.map((x) => view.crews.find((c) => c.id === x.crewId)).filter((c): c is HostCrew => Boolean(c));
  return (
    <div className="results">
      <div className="res-left">
        <div className={`res-banner ${r.saved ? 'ok' : 'bad'}`}>{r.saved ? '🎉 ¡La colonia sigue en pie!' : '🛠️ La colonia resistió con daños'}</div>
        <div className="res-planet">
          <PlanetView snapshot={snapshot} focus={zoneForBuilding(def.unlock)} className="stage-planet" />
        </div>
        <div className="chain panel">
          <span className="eyebrow">Reacciones en cadena</span>
          <ul>
            {r.chain.map((c, i) => (
              <li key={i} style={{ animationDelay: `${0.3 + i * 0.25}s` }}>
                {c}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="res-right">
        <div className="awards">
          {r.awards.map((a) => (
            <div key={a.title} className="award card">
              <span className="award-emoji">{a.emoji}</span>
              <span>
                <small>{a.title}</small>
                <b>{crewName(a.crewId)}</b>
              </span>
            </div>
          ))}
        </div>
        <div className="res-crews">
          {ranked.map((c, i) => {
            const o = c.outcome!;
            return (
              <article key={c.id} className={`res-crew card tier-${o.tier}`} style={{ animationDelay: `${i * 0.12}s` }}>
                <header>
                  <span className="rank">#{i + 1}</span>
                  <b>{c.name}</b>
                  <span className="res-opt">
                    {o.optionEmoji} {o.optionLabel}
                  </span>
                  <span className={`tier-badge tier-${o.tier}`}>
                    {TIER_LABEL[o.tier].emoji} {TIER_LABEL[o.tier].label}
                  </span>
                </header>
                <p className="why">{o.why}</p>
                <div className="scores">
                  <ScoreBar label="Eficiencia" value={o.scores.efficiency} color="var(--energy)" />
                  <ScoreBar label="Cooperación" value={o.scores.cooperation} color="var(--water)" />
                  <ScoreBar label="Creatividad" value={o.scores.creativity} color="var(--ix)" />
                </div>
                {c.status.log && (
                  <p className="log">
                    📓 {c.status.logHidden ? 'Bitácora oculta por IX' : `“${c.status.log}”`}
                    {c.status.logStars ? <Stars value={c.status.logStars} /> : null}
                    {c.status.logComment && <em> — IX: {c.status.logComment}</em>}
                  </p>
                )}
              </article>
            );
          })}
        </div>
        {r.discovery && (
          <div className="discovery-card card">
            <span className="disc-emoji">{r.discovery.emoji}</span>
            <span>
              <small>Descubrimiento misterioso</small>
              <b>{r.discovery.label}</b>
              <p>{r.discovery.text}</p>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Debrief                                                              */
/* ------------------------------------------------------------------ */

export function DebriefStage({ view }: { view: HostView }) {
  const d = view.debrief!;
  const b = BUILDINGS[d.unlocked];
  const done = new Set(view.colony.missions.map((x) => x.id));
  const crewName = (id: string) => view.crews.find((c) => c.id === id)?.name ?? '';
  return (
    <div className="debrief">
      <div className="deb-head">
        <IXOrb size={104} mood="happy" />
        <div>
          <p className="eyebrow">Debrief de IX {d.aiGenerated && <span className="chip ok">✨ Claude</span>}</p>
          <h1 className="sticker">{d.headline}</h1>
        </div>
      </div>
      <div className="deb-grid">
        <div className="learnings">
          {d.learnings.map((l, i) => (
            <div key={i} className="learn card" style={{ animationDelay: `${i * 0.15}s` }}>
              <span className="num">{i + 1}</span>
              <p>{l}</p>
            </div>
          ))}
          {d.shoutouts.length > 0 && (
            <div className="shoutouts">
              {d.shoutouts.map((s, i) => (
                <span key={i} className="chip">
                  <b>{crewName(s.crewId)}</b> · {s.text}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="deb-side">
          <div className="unlock-card card">
            <span className="unlock-emoji">{b.emoji}</span>
            <div>
              <small>Nuevo en la colonia</small>
              <h3>{b.name}</h3>
              <p>{b.desc}</p>
            </div>
          </div>
          <div className="panel fact">
            <span className="eyebrow">🛰️ Dato NASA</span>
            <p>{d.nasaFact}</p>
          </div>
          <div className="panel fact">
            <span className="eyebrow">💬 Para conversar</span>
            <p>{d.reflection}</p>
          </div>
        </div>
      </div>
      <div className="campaign panel">
        <div>
          <span className="eyebrow">The space campaign · Capítulo 1: Marte</span>
          <p>
            {done.size}/6 misiones completadas · Próximo: <b>{d.nextTeaser}</b>
          </p>
        </div>
        <div className="campaign-patches">
          {MISSION_ORDER.map((id) => (
            <MissionPatch key={id} id={id} size={58} locked={!done.has(id)} />
          ))}
          <div className="next-chapter">
            <span>🌙</span>
            <small>Luna</small>
          </div>
        </div>
      </div>
    </div>
  );
}

function zoneForBuilding(b: string): string {
  return b === 'city' ? 'colony.hub' : `site.${b}`;
}
