// Piezas de interfaz con datos reales de la NASA: la investigación en la que se basa la
// misión (NTRS / OSDR), el clima espacial (DONKI) y la condición de salud de la tripulación.

import { useEffect, useState } from 'react';
import type { CrewHealth, NasaStudy, ScienceHighlight, SpaceWeather } from '../../shared/nasa';
import type { CrewHealthStatus } from '../../shared/types';
import { spaceWeather } from '../lib/nasa';

const LEVEL_COLOR = ['#55db7a', '#ffc93c', '#ff9a3c', '#ff6b5b'];

export function SourceBadge({ source }: { source: 'NTRS' | 'OSDR' | 'DONKI' }) {
  const title =
    source === 'NTRS' ? 'Servidor de Reportes Técnicos de la NASA' : source === 'OSDR' ? 'Repositorio de Datos Científicos Abiertos de la NASA' : 'Base de datos de clima espacial de la NASA';
  return (
    <span className={`nasa-src src-${source.toLowerCase()}`} title={title}>
      NASA · {source}
    </span>
  );
}

/** La investigación real en la que se basa la misión. */
export function ScienceCard({ highlight, studies, ai, compact = false }: { highlight: ScienceHighlight; studies?: NasaStudy[]; ai?: boolean; compact?: boolean }) {
  const others = (studies ?? []).filter((s) => s.id !== highlight.studyId).slice(0, compact ? 0 : 3);
  return (
    <section className={`nasa-card science ${compact ? 'compact' : ''}`}>
      <header>
        <span className="nasa-icon">📚</span>
        <span>
          <b>Investigación real de la NASA</b>
          <small>{ai ? 'IX leyó estos estudios y escribió la misión a partir de ellos' : 'La misión se basa en este estudio'}</small>
        </span>
      </header>
      <div className="nasa-study">
        <div className="nasa-study-meta">
          <SourceBadge source={highlight.source} />
          <span className="mono">{highlight.studyId}</span>
          {highlight.year && <span>{highlight.year}</span>}
        </div>
        <h4>{highlight.title}</h4>
        {highlight.summary && <p>{highlight.summary}</p>}
        {highlight.connection && <p className="nasa-connection">🔗 {highlight.connection}</p>}
        <a className="nasa-link" href={highlight.url} target="_blank" rel="noreferrer">
          Ver el estudio original ↗
        </a>
      </div>
      {others.length > 0 && (
        <ul className="nasa-others">
          {others.map((s) => (
            <li key={s.id}>
              <SourceBadge source={s.source} />
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.title}
              </a>
              {s.year && <small> · {s.year}</small>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Clima espacial real (DONKI) con su nivel de riesgo. */
export function WeatherCard({ weather, compact = false }: { weather: SpaceWeather; compact?: boolean }) {
  return (
    <section className={`nasa-card weather ${compact ? 'compact' : ''}`} style={{ ['--lv' as string]: LEVEL_COLOR[weather.level] }}>
      <header>
        <span className="nasa-icon">☀️</span>
        <span>
          <b>Clima espacial real</b>
          <small>
            <SourceBadge source="DONKI" /> · del {weather.from} al {weather.to}
          </small>
        </span>
        <span className="nasa-level">{weather.label}</span>
      </header>
      <p className="nasa-headline">{weather.headline}</p>
      {!compact && (
        <ul className="nasa-lines">
          {weather.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Condición de salud de la tripulación (y cómo le va a una tripulación en particular). */
export function HealthCard({ health, status, compact = false }: { health: CrewHealth; status?: CrewHealthStatus | null; compact?: boolean }) {
  return (
    <section className={`nasa-card health kind-${health.kind} ${compact ? 'compact' : ''}`}>
      <header>
        <span className="nasa-icon">{health.emoji}</span>
        <span>
          <b>{health.label}</b>
          <small>Afecta a los tripulantes en la emergencia</small>
        </span>
      </header>
      <p>{health.effect}</p>
      {status && (
        <div className="nasa-health-meters">
          <div>
            <span>Protección</span>
            <i>
              <em style={{ width: `${Math.round((status.protection / 0.75) * 100)}%` }} />
            </i>
            <b className="mono">{Math.round(status.protection * 100)}%</b>
          </div>
          <div>
            <span>Rendimiento</span>
            <i>
              <em style={{ width: `${Math.round(status.factor * 100)}%` }} />
            </i>
            <b className="mono">{Math.round(status.factor * 100)}%</b>
          </div>
          {status.dose !== null && (
            <p className="nasa-dose">
              ☢️ Dosis estimada: <b className="mono">{status.dose.toFixed(2)} mSv/día</b> <small>(valor de juego)</small>
            </p>
          )}
        </div>
      )}
      <p className="nasa-advice">💡 {health.advice}</p>
      {!compact && <p className="nasa-fact">🔬 {health.fact}</p>}
      {!compact && health.study && (
        <p className="nasa-ref">
          <SourceBadge source={health.study.source} />{' '}
          <a href={health.study.url} target="_blank" rel="noreferrer">
            {health.study.title}
          </a>
          {health.study.year ? ` · ${health.study.year}` : ''}
        </p>
      )}
    </section>
  );
}

/** Chip con el clima espacial de hoy (para el lobby del proyector). */
export function NasaLiveChip() {
  const [w, setW] = useState<SpaceWeather | null>(null);
  useEffect(() => {
    let alive = true;
    void spaceWeather(14).then((x) => alive && setW(x));
    return () => {
      alive = false;
    };
  }, []);
  if (!w) return null;
  return (
    <span className="nasa-live" style={{ ['--lv' as string]: LEVEL_COLOR[w.level] }} title={w.lines.join(' · ')}>
      <i /> NASA en vivo · clima espacial {w.label.toLowerCase()}: {w.headline}
    </span>
  );
}
