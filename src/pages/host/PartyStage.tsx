// Torneo marciano en el proyector: la pista alrededor de la colonia con la ficha de cada
// jugador, la ruleta que elige el minijuego, los puntajes en vivo, los premios de la ronda,
// el avance casilla por casilla (con su sorpresa) y el podio final.

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { BOARD, PARTY_GAMES, PARTY_ORDER, SPACES, type PartyRoundLine, type PartyView } from '../../../shared/party';
import type { HostAction } from '../../../shared/types';
import { Astronaut } from '../../components/art';
import { Confetti } from '../../components/ui';
import { sfx } from '../../lib/sound';
import type { Run } from './Console';

function useNow(ms = 200) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return Date.now();
}

const left = (p: PartyView, now: number) => (p.paused ? (p.pausedLeft ?? 0) : p.endsAt ? Math.max(0, p.endsAt - now) : 0);

export function partyPrimary(p: PartyView): { label: string; icon?: string; action: HostAction; tone?: 'alert' | 'ix' } {
  if (p.stage === 'final') return { label: 'Otro torneo', icon: 'refresh', action: { type: 'partyStart', rounds: p.rounds } };
  if (p.stage === 'move' && p.round >= p.rounds) return { label: 'Ver el podio', icon: 'trophy', action: { type: 'partyNext' } };
  return { label: p.stage === 'play' ? 'Terminar ronda' : 'Siguiente', icon: 'arrow', action: { type: 'partyNext' } };
}

/* ---------------- la pista ---------------- */

/** Posición (en %) de una casilla sobre el círculo. */
function spot(i: number) {
  const a = -Math.PI / 2 + (i / BOARD.length) * Math.PI * 2;
  return { x: 50 + Math.cos(a) * 41, y: 50 + Math.sin(a) * 41 };
}

/** Casilla en la que se dibuja cada ficha (con la animación de avance). */
function useTokenSpots(party: PartyView): Record<string, number> {
  const lines = useMemo(() => new Map((party.last ?? []).map((l) => [l.id, l])), [party.last]);
  const [hop, setHop] = useState(0);
  useEffect(() => {
    if (party.stage !== 'move') {
      setHop(0);
      return;
    }
    const max = Math.max(0, ...(party.last ?? []).map((l) => pathOf(l).length - 1));
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      setHop(n);
      if (n <= max) sfx.step(n);
      if (n >= max) clearInterval(id);
    }, 340);
    return () => clearInterval(id);
  }, [party.stage, party.last]);
  const out: Record<string, number> = {};
  for (const p of party.players) {
    const l = lines.get(p.id);
    if (l && party.stage === 'score') out[p.id] = l.from;
    else if (l && party.stage === 'move') {
      const path = pathOf(l);
      out[p.id] = path[Math.min(hop, path.length - 1)];
    } else out[p.id] = p.pos;
  }
  return out;
}

/** Casillas por las que pasa una ficha: lo que avanzó y, si cayó en un tubo de lava, el atajo. */
function pathOf(l: PartyRoundLine): number[] {
  const path = [l.from];
  for (let i = 1; i <= l.steps; i++) path.push((l.from + i) % BOARD.length);
  const landed = path[path.length - 1];
  if (SPACES[BOARD[landed]].move) for (let i = 1; i <= SPACES[BOARD[landed]].move; i++) path.push((landed + i) % BOARD.length);
  return path;
}

function Board({ party }: { party: PartyView }) {
  const spots = useTokenSpots(party);
  const g = PARTY_GAMES[party.game];
  // Corona solo si hay un único líder (al empezar todos empatan en primer lugar).
  const leader = party.players.filter((p) => p.standing === 1).length === 1 ? party.players[0]?.id : null;
  const byPos = new Map<number, string[]>();
  for (const p of party.players) {
    const s = spots[p.id];
    byPos.set(s, [...(byPos.get(s) ?? []), p.id]);
  }
  return (
    <div className="pt-board" aria-label="Pista alrededor de la colonia">
      <div className="pt-board-ring" aria-hidden="true" />
      {BOARD.map((kind, i) => {
        const s = spot(i);
        const def = SPACES[kind];
        return (
          <span key={i} className={`pt-space is-${kind}`} style={{ left: `${s.x}%`, top: `${s.y}%`, '--c': def.color } as CSSProperties} title={`${def.name}: ${def.text}`}>
            {def.emoji}
          </span>
        );
      })}
      {party.players.map((p, idx) => {
        const s = spot(spots[p.id]);
        // Las fichas se paran encima de su casilla; si comparten casilla, se forman en fila.
        const crowd = byPos.get(spots[p.id]) ?? [p.id];
        const k = crowd.indexOf(p.id);
        const dx = (k - (crowd.length - 1) / 2) * 6.6;
        return (
          <span key={p.id} className={`pt-token ${p.id === leader ? 'is-lead' : ''} ${k % 2 ? 'is-alt' : ''}`} style={{ left: `${s.x + dx}%`, top: `${s.y}%`, '--i': idx } as CSSProperties} title={p.name}>
            <small>{p.name}</small>
            <Astronaut avatar={p.avatar} size={42} pose="still" />
          </span>
        );
      })}
      <div className="pt-board-center">
        <span className="pt-board-game" aria-hidden="true">
          {party.stage === 'final' ? '🏆' : g.emoji}
        </span>
        <b>{party.stage === 'final' ? '¡Fin del torneo!' : `Ronda ${party.round} de ${party.rounds}`}</b>
        <small>{party.stage === 'final' ? 'Gana quien tiene más 💎' : g.name}</small>
      </div>
    </div>
  );
}

/* ---------------- etapas ---------------- */

function Wheel({ party }: { party: PartyView }) {
  const target = PARTY_ORDER.indexOf(party.game);
  const slice = 360 / PARTY_ORDER.length;
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    // La ruleta da varias vueltas y se detiene con el minijuego elegido bajo la flecha.
    const id = requestAnimationFrame(() => setTurn(360 * 5 - target * slice - slice / 2 + (Math.random() - 0.5) * slice * 0.6));
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 0;
    for (let i = 0; i < 26; i++) {
      t += 40 + i * i * 0.45;
      const speed = 1 - i / 26;
      timers.push(setTimeout(() => sfx.spin(speed), t));
    }
    timers.push(setTimeout(() => sfx.unlock(), 3500));
    return () => {
      cancelAnimationFrame(id);
      timers.forEach(clearTimeout);
    };
  }, [target, slice]);
  return (
    <div className="pt-wheel-wrap">
      <span className="pt-wheel-arrow" aria-hidden="true">
        ▼
      </span>
      <div className="pt-wheel" style={{ transform: `rotate(${turn}deg)` }}>
        {PARTY_ORDER.map((id, i) => (
          <span key={id} style={{ transform: `rotate(${i * slice + slice / 2}deg)` } as CSSProperties}>
            <i style={{ transform: `rotate(${-(i * slice + slice / 2)}deg)` }}>{PARTY_GAMES[id].emoji}</i>
          </span>
        ))}
      </div>
    </div>
  );
}

function Intro({ party }: { party: PartyView }) {
  const now = useNow(200);
  const g = PARTY_GAMES[party.game];
  const s = Math.ceil(left(party, now) / 1000);
  const last = useRef(-1);
  useEffect(() => {
    if (s === last.current) return;
    last.current = s;
    if (s > 0 && s <= 3 && !party.paused) sfx.count();
  }, [s, party.paused]);
  return (
    <div className="pt-intro">
      <span className="pt-intro-emoji" aria-hidden="true">
        {g.emoji}
      </span>
      <h2>{g.name}</h2>
      <p>{g.how}</p>
      {/* Solo el 3, 2, 1 rebota: si la pieza se volviera a montar cada segundo, en equipos lentos no alcanzaría a verse. */}
      <b className={`pt-count ${s <= 3 && !party.paused ? 'is-beat' : ''}`} key={s <= 3 && !party.paused ? s : 'ready'}>
        {party.paused ? 'II' : s > 3 ? '📱 ¡Prepárense!' : s}
      </b>
    </div>
  );
}

function Live({ party }: { party: PartyView }) {
  const now = useNow(200);
  const g = PARTY_GAMES[party.game];
  useEffect(() => sfx.go(), []);
  const ms = left(party, now);
  const best = Math.max(1, ...party.players.map((p) => p.score));
  const rows = [...party.players].sort((a, b) => b.score - a.score);
  return (
    <div className="pt-live">
      <div className="pt-live-head">
        <span aria-hidden="true">{g.emoji}</span>
        <b>{g.name}</b>
        <span className="pt-live-time">{party.paused ? 'En pausa' : `${Math.ceil(ms / 1000)} s`}</span>
      </div>
      <div className="pt-timebar">
        <i style={{ width: `${(ms / (g.seconds * 1000)) * 100}%` }} />
      </div>
      <ol className="pt-bars">
        {rows.map((p) => (
          <li key={p.id}>
            <Astronaut avatar={p.avatar} size={34} pose="still" />
            <span className="pt-bar-name">{p.name}</span>
            <span className="pt-bar">
              <i style={{ width: `${g.id === 'land' ? (p.score ? 100 : 6) : (p.score / best) * 100}%` }} />
            </span>
            <b>{g.id === 'land' ? (p.score ? '✓' : '…') : p.score}</b>
          </li>
        ))}
      </ol>
      <p className="pt-hint">{g.id === 'land' ? 'Cada quien aterriza en su celular: el puntaje aparece al tocar el suelo.' : '¡Todos juegan a la vez en su celular!'}</p>
    </div>
  );
}

const MEDAL = ['🥇', '🥈', '🥉'];

function RoundResults({ party }: { party: PartyView }) {
  const lines = party.last ?? [];
  const name = (id: string) => party.players.find((p) => p.id === id);
  useEffect(() => {
    sfx.whistle();
    const t = [setTimeout(() => sfx.drumroll(0.8), 500), setTimeout(() => (lines.some((l) => l.winner) ? sfx.crystal() : sfx.coin()), 1400)];
    return () => t.forEach(clearTimeout);
  }, [lines]);
  return (
    <div className="pt-round">
      <h2>Resultados de la ronda</h2>
      <ol>
        {lines.map((l, i) => {
          const p = name(l.id);
          if (!p) return null;
          return (
            <li key={l.id} style={{ '--i': i } as CSSProperties} className={l.winner ? 'is-win' : ''}>
              <span className="pt-medal">{l.place <= 3 ? MEDAL[l.place - 1] : `${l.place}.º`}</span>
              <Astronaut avatar={p.avatar} size={40} pose="still" />
              <span className="pt-round-name">{p.name}</span>
              <span className="pt-round-score">{PARTY_GAMES[party.game].id === 'land' ? `${l.score} / 100` : `${l.score} pts`}</span>
              <span className="pt-prize">
                {l.prize ? `+${l.prize} ⚡` : '—'}
                {l.winner && ' +1 💎'}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="pt-fact">🔬 {PARTY_GAMES[party.game].fact}</p>
    </div>
  );
}

function Moves({ party }: { party: PartyView }) {
  const lines = party.last ?? [];
  useEffect(() => {
    const longest = Math.max(0, ...lines.map((l) => l.steps + (SPACES[BOARD[(l.from + l.steps) % BOARD.length]].move || 0)));
    const t = setTimeout(() => {
      const kinds = new Set(lines.map((l) => BOARD[(l.from + l.steps) % BOARD.length]));
      if (kinds.has('meteor')) sfx.meteor();
      else if (kinds.has('crystal')) sfx.crystal();
      else if (kinds.has('storm')) sfx.storm();
      else sfx.coin();
    }, longest * 340 + 200);
    return () => clearTimeout(t);
  }, [lines]);
  return (
    <div className="pt-moves">
      <h2>¡A avanzar por la pista!</h2>
      <ul>
        {lines.map((l, i) => {
          const p = party.players.find((x) => x.id === l.id);
          const landed = BOARD[(l.from + l.steps) % BOARD.length];
          const def = SPACES[landed];
          if (!p) return null;
          return (
            <li key={l.id} style={{ '--i': i, '--c': def.color } as CSSProperties}>
              <b>{p.name}</b> avanza {l.steps} → <span className="pt-space-chip">{def.emoji} {def.name}</span>
              <small>
                {def.text}
                {l.lap ? ' ¡Pasó por la base: +5 ⚡!' : ''}
              </small>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Podium({ party, run }: { party: PartyView; run: Run }) {
  useEffect(() => {
    const t = setTimeout(() => sfx.fanfare(), 300);
    return () => clearTimeout(t);
  }, []);
  const top = party.players.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);
  return (
    <div className="pt-podium">
      <h2>🏆 ¡{party.players[0]?.name} gana el torneo marciano!</h2>
      <div className="pt-steps">
        {order.map((p) => (
          <div key={p.id} className={`pt-step is-${p.standing}`}>
            <Astronaut avatar={p.avatar} size={p.standing === 1 ? 118 : 92} pose={p.standing === 1 ? 'cheer' : 'wave'} />
            <b>{p.name}</b>
            <small>
              💎 {p.crystals} · ⚡ {p.energy}
            </small>
            <span className="pt-block">{p.standing}</span>
          </div>
        ))}
      </div>
      <p className="pt-hint">Cada quien se lleva XP a su perfil: el 1.º lugar gana {party.players[0]?.xp ?? 60} XP.</p>
      <button className="hc-btn is-soft" onClick={() => run({ type: 'partyEnd' })}>
        Volver al abordaje
      </button>
      <Confetti />
    </div>
  );
}

/* ---------------- tabla ---------------- */

function Standings({ party }: { party: PartyView }) {
  return (
    <ol className="pt-standings" aria-label="Clasificación del torneo">
      {party.players.map((p) => (
        <li key={p.id} className={p.connected ? '' : 'is-off'}>
          <span className="pt-place">{p.standing}</span>
          <Astronaut avatar={p.avatar} size={34} pose="still" />
          <span className="pt-st-name">
            {p.name}
            {p.isBot ? ' 🤖' : ''}
          </span>
          <span className="pt-gems">
            💎 <b>{p.crystals}</b>
          </span>
          <span className="pt-energy">
            ⚡ <b>{p.energy}</b>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function PartyStage({ party, run }: { party: PartyView; run: Run }) {
  let panel = null;
  switch (party.stage) {
    case 'spin':
      panel = (
        <div className="pt-spin">
          <h2>La ruleta elige el minijuego…</h2>
          <Wheel party={party} />
        </div>
      );
      break;
    case 'intro':
      panel = <Intro party={party} />;
      break;
    case 'play':
      panel = <Live party={party} />;
      break;
    case 'score':
      panel = <RoundResults party={party} />;
      break;
    case 'move':
      panel = <Moves party={party} />;
      break;
    case 'final':
      panel = <Podium party={party} run={run} />;
      break;
  }
  return (
    <div className={`pt is-${party.stage}`}>
      <div className="pt-left">
        <Board party={party} />
      </div>
      <div className="pt-right">
        <div className="pt-panel" key={`${party.stage}-${party.round}`}>
          {panel}
        </div>
        {party.stage !== 'final' && <Standings party={party} />}
      </div>
    </div>
  );
}
