// Entrenador de Misión para Astronautas Junior (#/entrenador y dentro del modo libre).
//
// Responde al reto de NASA Space Apps "Junior Astronaut Mission Trainer": dirigir una base en
// Marte equilibrando energía, soporte vital, comida y blindaje, y ver qué decisiones hacen que
// la misión triunfe o fracase. IX (la IA) arma cada reto para este astronauta con su historial,
// el estado de su base y datos reales de la NASA; la física la calcula el motor.

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { SpaceWeather } from '../../../shared/nasa';
import { SIMS, SIM_ORDER, rank, recordResult, xpFor, type Challenge, type Level, type SimId, type SimResult } from '../../../shared/trainer';
import { ROLES } from '../../../shared/content';
import type { RoleId } from '../../../shared/types';
import { aiStatus } from '../../engine/ai';
import { buildChallenge, loadTrainer, saveTrainer, type BaseBrief, type TrainerSave } from '../../engine/trainer';
import { probeServer } from '../../lib/cloud';
import { nasaCheck, type NasaSource } from '../../lib/nasa';
import { loadProfile, saveProfile } from '../../lib/profile';
import { primeAudio, sfx } from '../../lib/sound';
import { SimPlay } from './SimPlay';

interface Props {
  /** Dentro del mundo 3D (modo libre): se dibuja como panel y se puede cerrar. */
  embedded?: boolean;
  role?: RoleId | null;
  base?: BaseBrief | null;
  onClose?(): void;
  /** Una corrida terminó: el modo libre la premia con recursos para la base. */
  onReward?(info: { sim: SimId; ok: boolean; stars: number; xp: number }): void;
}

export function Trainer({ embedded = false, role = null, base = null, onClose, onReward }: Props) {
  const [save, setSave] = useState<TrainerSave>(loadTrainer);
  const [profile, setProfile] = useState(loadProfile);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [weather, setWeather] = useState<SpaceWeather | null>(null);
  const [nasa, setNasa] = useState<{ key: boolean; sources: NasaSource[] } | null | 'loading'>('loading');
  const [ai, setAi] = useState(aiStatus);
  const [pick, setPick] = useState<SimId | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;
  const name = profile.name.trim() || 'Astronauta';
  const r = rank(save.skills);

  // Estado real de las conexiones: IA del servidor y las tres fuentes de la NASA.
  useEffect(() => {
    let alive = true;
    void probeServer().then(() => alive && setAi(aiStatus()));
    void nasaCheck().then((c) => alive && setNasa(c));
    return () => {
      alive = false;
    };
  }, []);

  const request = async (sim?: SimId, level?: Level) => {
    primeAudio();
    setLoading(true);
    setPick(null);
    const last = saveRef.current.history.at(-1)?.sim ?? null;
    const built = await buildChallenge({ name, role, xp: profile.xp, skills: saveRef.current.skills, last, base, sim, level });
    setWeather(built.weather);
    setChallenge(built.challenge);
    setLoading(false);
    sfx.unlock();
    if (sim) setPlaying(true);
  };

  const onResult = (result: SimResult) => {
    if (!challenge) return;
    const s = challenge.scenario;
    const next: TrainerSave = {
      skills: recordResult(saveRef.current.skills, s, result),
      history: [...saveRef.current.history, { sim: s.sim, level: s.level, stars: result.stars, at: Date.now() }].slice(-30),
    };
    saveRef.current = next;
    setSave(next);
    saveTrainer(next);
    const xp = xpFor(s, result);
    const p = { ...loadProfile() };
    p.xp += xp;
    saveProfile(p);
    setProfile(p);
    onReward?.({ sim: s.sim, ok: result.ok, stars: result.stars, xp });
  };

  if (playing && challenge) {
    return (
      <div className={`tr ${embedded ? 'embedded' : 'page'}`}>
        <SimPlay
          key={challenge.id}
          challenge={challenge}
          name={name}
          onResult={onResult}
          onClose={() => setPlaying(false)}
          onNext={() => {
            setPlaying(false);
            setChallenge(null);
            void request();
          }}
        />
      </div>
    );
  }

  const live = nasa && nasa !== 'loading' ? nasa.sources.filter((s) => s.ok).length : 0;

  return (
    <div className={`tr ${embedded ? 'embedded' : 'page'}`}>
      <section className="tr-hub" role={embedded ? 'dialog' : undefined} aria-label="Entrenador de misión">
        <header className="tr-hub-head">
          <div>
            <p className="tr-kicker">Entrenador de misión · Astronautas junior</p>
            <h1>
              {name}, <span>{r.title.toLowerCase()}</span>
            </h1>
          </div>
          {onClose ? (
            <button className="tr-x" onClick={onClose} aria-label="Cerrar">
              ✕
            </button>
          ) : (
            <a className="tr-x" href="#/" aria-label="Inicio">
              ✕
            </a>
          )}
        </header>

        <div className="tr-rank">
          <div className="tr-rank-bar" role="progressbar" aria-valuemin={0} aria-valuemax={r.total} aria-valuenow={r.done}>
            <i style={{ width: `${(r.done / r.total) * 100}%` }} />
          </div>
          <span>
            {r.done}/{r.total} certificaciones · {profile.xp} XP
          </span>
        </div>

        <p className="tr-lead">
          Dirige una base en Marte. Cada reto es un problema real de la colonia con las mismas cuentas que usa la NASA: tú decides, la simulación corre sol por sol y
          ves si la misión sobrevive.
        </p>

        <section className="tr-ix">
          {!challenge && !loading && (
            <>
              <div className="tr-ix-orb" aria-hidden />
              <div>
                <h2>Tu siguiente reto, hecho a tu medida</h2>
                <p>IX revisa tu historial, {base ? 'lo que le falta a tu base, ' : ''}el clima espacial de hoy y un estudio real de la NASA para armarte una misión.</p>
                <button className="tr-btn go" onClick={() => void request()}>
                  ✨ Pedir mi reto a IX
                </button>
              </div>
            </>
          )}
          {loading && (
            <div className="tr-loading" role="status">
              <div className="tr-ix-orb think" aria-hidden />
              <p>IX está leyendo tu historial y el clima espacial de la NASA…</p>
            </div>
          )}
          {challenge && !loading && (
            <article className="tr-card" style={{ '--rc': ROLES[SIMS[challenge.scenario.sim].role].color } as CSSProperties}>
              <p className="tr-kicker">
                {SIMS[challenge.scenario.sim].emoji} {SIMS[challenge.scenario.sim].need} · Nivel {challenge.scenario.level}
                <span className="tr-ai">{challenge.ai ? '✨ Escrito por IX (Claude)' : 'Plantilla del motor'}</span>
              </p>
              <h2>{challenge.title}</h2>
              <p>{challenge.briefing}</p>
              <p className="tr-why">
                <b>¿Por qué este reto?</b> {challenge.why}
              </p>
              {challenge.study && (
                <p className="tr-study">
                  <b>Basado en un estudio real ({challenge.study.source}):</b> {challenge.study.title}
                </p>
              )}
              <div className="tr-actions">
                <button className="tr-btn go" onClick={() => setPlaying(true)}>
                  🚀 Empezar la misión
                </button>
                <button className="tr-btn" onClick={() => void request()}>
                  ↻ Otro reto
                </button>
              </div>
            </article>
          )}
        </section>

        {weather && (
          <p className={`tr-weather lv${weather.level}`}>
            <b>☀️ Clima espacial real (NASA DONKI): {weather.label}.</b> {weather.headline}
          </p>
        )}

        <h2 className="tr-h">Especialidades de la colonia</h2>
        <ul className="tr-grid">
          {SIM_ORDER.map((id) => {
            const def = SIMS[id];
            const k = save.skills[id];
            const open = pick === id;
            return (
              <li key={id} style={{ '--rc': ROLES[def.role].color } as CSSProperties} className={open ? 'open' : ''}>
                <button className="tr-tile" onClick={() => setPick(open ? null : id)} aria-expanded={open}>
                  <span className="tr-tile-emoji">{def.emoji}</span>
                  <span>
                    <b>{def.name}</b>
                    <small>
                      {def.need} · {ROLES[def.role].specialty}
                    </small>
                  </span>
                  <span className="tr-pips" aria-label={`Nivel ${k?.level ?? 0} de 3`}>
                    {[1, 2, 3].map((n) => (
                      <i key={n} className={n <= (k?.level ?? 0) ? 'on' : ''} />
                    ))}
                  </span>
                </button>
                {open && (
                  <div className="tr-levels">
                    {([1, 2, 3] as Level[]).map((lv) => {
                      const locked = lv > (k?.level ?? 0) + 1;
                      return (
                        <button key={lv} className="tr-btn" disabled={locked || loading} onClick={() => void request(id, lv)}>
                          {locked ? '🔒' : ''} Nivel {lv}
                        </button>
                      );
                    })}
                    <small>{k ? `Mejor nota: ${k.best} · ${k.wins}/${k.plays} misiones cumplidas` : 'Aún sin entrenar'}</small>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <footer className="tr-status">
          <span className={ai.enabled ? 'ok' : ''}>
            <i /> IA: {ai.enabled ? `Claude (${ai.server ? 'servidor' : 'clave local'})` : 'plantillas del motor (sin clave)'}
          </span>
          <span className={live === 3 ? 'ok' : live > 0 ? 'warn' : ''}>
            <i /> NASA:{' '}
            {nasa === 'loading'
              ? 'comprobando…'
              : nasa
                ? nasa.sources.map((s) => `${s.name} ${s.ok ? '✓' : '✗'}`).join(' · ') + (nasa.key ? '' : ' (DEMO_KEY)')
                : 'sin conexión: se usan los datos publicados'}
          </span>
        </footer>
      </section>
    </div>
  );
}
