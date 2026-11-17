// Torneo marciano en el celular: mientras la ruleta gira, cada quien ve qué minijuego viene;
// luego todos juegan a la vez y el puntaje viaja al proyector; al final ven su lugar, lo que
// ganaron y la casilla en la que cayeron. Dos minijuegos son propios del torneo (minería exprés
// y aterrizaje); los demás son los mismos minijuegos de la colonia, ahora para competir.

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { BOARD, PARTY_GAMES, SPACES, type PartyView } from '../../../shared/party';
import type { PlayerView } from '../../../shared/types';
import { Astronaut } from '../../components/art';
import { hostNow } from '../../lib/clock';
import { vibrate } from '../../lib/pwa';
import { sfx } from '../../lib/sound';
import type { PlayerNet } from '../../net/playerNet';
import { Minigame } from './minigames';

function useHostTick(ms = 200) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return hostNow();
}

const leftMs = (p: PartyView, now: number) => (p.paused ? (p.pausedLeft ?? 0) : p.endsAt ? Math.max(0, p.endsAt - now) : 0);

/* ------------------------------------------------------------------ */
/* Minería exprés                                                       */
/* ------------------------------------------------------------------ */

type RockKind = 'regolith' | 'ice' | 'metal' | 'basalt';
const ROCKS: Record<RockKind, { emoji: string; pts: number; hp: number; weight: number }> = {
  regolith: { emoji: '🟧', pts: 1, hp: 1, weight: 5 },
  ice: { emoji: '🧊', pts: 2, hp: 1, weight: 3 },
  metal: { emoji: '🔩', pts: 3, hp: 1, weight: 2 },
  basalt: { emoji: '🪨', pts: 5, hp: 2, weight: 1.4 },
};
const CELLS = 16;

interface Rock {
  id: number;
  cell: number;
  kind: RockKind;
  hp: number;
  until: number;
}

function pickRock(): RockKind {
  const total = Object.values(ROCKS).reduce((s, r) => s + r.weight, 0);
  let x = Math.random() * total;
  for (const [k, r] of Object.entries(ROCKS) as [RockKind, (typeof ROCKS)[RockKind]][]) {
    x -= r.weight;
    if (x <= 0) return k;
  }
  return 'regolith';
}

function MineRush({ onPoints }: { onPoints: (n: number) => void }) {
  const [rocks, setRocks] = useState<Rock[]>([]);
  const [pops, setPops] = useState<{ id: number; cell: number; n: number }[]>([]);
  const next = useRef(1);
  useEffect(() => {
    const id = setInterval(() => {
      const t = performance.now();
      setRocks((rs) => {
        const alive = rs.filter((r) => r.until > t);
        if (alive.length >= 6) return alive;
        const used = new Set(alive.map((r) => r.cell));
        const free = Array.from({ length: CELLS }, (_, i) => i).filter((i) => !used.has(i));
        if (!free.length) return alive;
        const kind = pickRock();
        return [...alive, { id: next.current++, cell: free[Math.floor(Math.random() * free.length)], kind, hp: ROCKS[kind].hp, until: t + 1600 + Math.random() * 1400 }];
      });
    }, 300);
    return () => clearInterval(id);
  }, []);
  const hit = (rock: Rock) => {
    sfx.mine();
    vibrate(12);
    if (rock.hp > 1) {
      setRocks((rs) => rs.map((r) => (r.id === rock.id ? { ...r, hp: r.hp - 1, until: r.until + 400 } : r)));
      return;
    }
    const n = ROCKS[rock.kind].pts;
    onPoints(n);
    sfx.pickup();
    setRocks((rs) => rs.filter((r) => r.id !== rock.id));
    const pid = next.current++;
    setPops((p) => [...p.slice(-5), { id: pid, cell: rock.cell, n }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== pid)), 700);
  };
  return (
    <div className="pp-mine" role="grid" aria-label="Rocas para minar">
      {Array.from({ length: CELLS }, (_, cell) => {
        const rock = rocks.find((r) => r.cell === cell);
        const pop = pops.find((p) => p.cell === cell);
        return (
          <div key={cell} className="pp-mine-cell">
            {rock && (
              <button
                key={rock.id}
                className={`pp-rock is-${rock.kind} ${rock.hp < ROCKS[rock.kind].hp ? 'is-cracked' : ''}`}
                onPointerDown={(e: RPointerEvent<HTMLButtonElement>) => {
                  e.preventDefault();
                  hit(rock);
                }}
                aria-label={`Roca de ${rock.kind}`}
              >
                {ROCKS[rock.kind].emoji}
              </button>
            )}
            {pop && <i className="pp-pop">+{pop.n}</i>}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Aterrizaje perfecto (física real: gravedad de Marte 3.721 m/s²)      */
/* ------------------------------------------------------------------ */

const G_MARS = 3.721;
const THRUST = 9.5;
const START_H = 140;
const START_V = -16;

function Lander({ onLanded }: { onLanded: (score: number) => void }) {
  const [s, setS] = useState({ h: START_H, v: START_V, fuel: 100, burn: false, done: false, score: 0, msg: '' });
  const burn = useRef(false);
  const state = useRef(s);
  state.current = s;
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let flame = 0;
    const step = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const cur = state.current;
      if (cur.done) return;
      const firing = burn.current && cur.fuel > 0;
      const a = (firing ? THRUST : 0) - G_MARS;
      const v = cur.v + a * dt;
      const h = cur.h + v * dt;
      const fuel = Math.max(0, cur.fuel - (firing ? 13 * dt : 0));
      if (firing && (flame += dt) > 0.12) {
        flame = 0;
        sfx.print();
      }
      if (h <= 0) {
        const speed = Math.abs(v);
        const crash = speed > 9;
        const score = crash ? 5 : Math.round(Math.max(0, Math.min(90, 100 - speed * 11)) + fuel * 0.1);
        const msg = crash ? `💥 Te estrellaste a ${speed.toFixed(1)} m/s` : speed <= 2 ? `🌟 ¡Aterrizaje perfecto! ${speed.toFixed(1)} m/s` : `🛬 Aterrizaste a ${speed.toFixed(1)} m/s`;
        setS({ h: 0, v, fuel, burn: false, done: true, score, msg });
        (crash ? sfx.meteor : speed <= 2 ? sfx.fanfare : sfx.success)();
        vibrate(crash ? [200, 60, 200] : 60);
        onLanded(score);
        return;
      }
      setS({ h, v, fuel, burn: firing, done: false, score: 0, msg: '' });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const press = (on: boolean) => (e: RPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    burn.current = on;
  };
  const pct = Math.max(0, Math.min(1, s.h / START_H));
  const safe = Math.abs(s.v) <= 2.5;
  return (
    <div className="pp-land">
      <div className="pp-land-sky">
        <span className={`pp-ship ${s.burn ? 'is-burn' : ''} ${s.done ? 'is-down' : ''}`} style={{ bottom: `${8 + pct * 78}%` }} aria-hidden="true">
          <span className="pp-rocket">🚀</span>
          {s.burn && <i className="pp-flame">🔥</i>}
        </span>
        <span className="pp-ground" aria-hidden="true" />
      </div>
      <div className="pp-land-gauges">
        <span>
          Altura <b>{Math.max(0, s.h).toFixed(0)} m</b>
        </span>
        <span className={safe ? 'is-ok' : 'is-bad'}>
          Velocidad <b>{Math.abs(s.v).toFixed(1)} m/s</b>
        </span>
        <span>
          Combustible <b>{s.fuel.toFixed(0)}%</b>
        </span>
      </div>
      {s.done ? (
        <p className="pp-land-msg">
          {s.msg}
          <b>{s.score} / 100</b>
        </p>
      ) : (
        <button className={`pp-burn ${s.burn ? 'is-on' : ''}`} onPointerDown={press(true)} onPointerUp={press(false)} onPointerLeave={press(false)} onPointerCancel={press(false)}>
          🔥 Mantén para encender el motor
        </button>
      )}
      <p className="pp-tip">Toca el suelo a menos de 2.5 m/s (verde). En Marte la gravedad es 3.721 m/s².</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Ronda en juego                                                       */
/* ------------------------------------------------------------------ */

function Play({ party, net }: { party: PartyView; net: PlayerNet | null }) {
  const g = PARTY_GAMES[party.game];
  const score = useRef(0);
  const [shown, setShown] = useState(0);
  const sent = useRef(-1);
  const now = useHostTick(250);
  useEffect(() => {
    sfx.go();
    vibrate(60);
    const id = setInterval(() => {
      if (score.current !== sent.current && net) {
        sent.current = score.current;
        net.sendPartyScore(party.round, score.current);
      }
    }, 350);
    return () => {
      clearInterval(id);
      if (net && g.id !== 'land' && score.current !== sent.current) net.sendPartyScore(party.round, score.current);
    };
  }, [net, party.round, g.id]);
  const add = (n: number) => {
    score.current = Math.min(g.max, score.current + n);
    setShown(score.current);
  };
  const ms = leftMs(party, now);
  return (
    <div className="pp-play">
      <div className="pp-play-head">
        <span>
          {g.emoji} {g.name}
        </span>
        <b>{g.id === 'land' ? (shown ? `${shown}/100` : '') : `${shown} pts`}</b>
      </div>
      <div className="pp-timebar" aria-label={`Quedan ${Math.ceil(ms / 1000)} segundos`}>
        <i style={{ width: `${(ms / (g.seconds * 1000)) * 100}%` }} />
      </div>
      {party.paused ? (
        <p className="pp-paused">⏸️ El profe pausó el torneo.</p>
      ) : g.id === 'mine' ? (
        <MineRush onPoints={add} />
      ) : g.id === 'land' ? (
        <Lander
          onLanded={(s) => {
            add(s);
            net?.sendPartyScore(party.round, s);
            sent.current = s;
          }}
        />
      ) : (
        g.spec && <Minigame spec={g.spec} color="#F08A57" dark="#9C3B22" onPoints={add} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pantalla del torneo                                                  */
/* ------------------------------------------------------------------ */

const MEDAL = ['🥇', '🥈', '🥉'];

/** Cuenta regresiva de la introducción: solo el 3, 2, 1 rebota (visible desde el primer cuadro). */
function Count({ party }: { party: PartyView }) {
  const secs = Math.ceil(leftMs(party, useHostTick(250)) / 1000);
  const beat = secs <= 3 && !party.paused;
  return (
    <b className={`pp-count ${beat ? 'is-beat' : ''}`} key={beat ? secs : 'ready'}>
      {party.paused ? 'II' : secs > 3 ? 'Prepárate…' : secs}
    </b>
  );
}

export function PartyScreen({ view, net }: { view: PlayerView; net: PlayerNet | null }) {
  const party = view.party!;
  const me = view.me.id;
  const mine = party.players.find((p) => p.id === me);
  const line = party.last?.find((l) => l.id === me) ?? null;
  const g = PARTY_GAMES[party.game];

  useEffect(() => {
    if (party.stage === 'score' && line) {
      if (line.winner) sfx.crystal();
      else if (line.prize) sfx.coin();
      vibrate(line.winner ? [80, 60, 80, 60, 160] : 40);
    }
    if (party.stage === 'move' && line) {
      const kind = BOARD[(line.from + line.steps) % BOARD.length];
      const t = setTimeout(() => (kind === 'meteor' ? sfx.meteor : kind === 'crystal' ? sfx.crystal : kind === 'storm' ? sfx.storm : sfx.coin)(), 900);
      return () => clearTimeout(t);
    }
    if (party.stage === 'final' && mine) setTimeout(() => sfx.place(mine.standing), 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party.stage]);

  let body = null;
  switch (party.stage) {
    case 'spin':
      body = (
        <div className="pp-center">
          <span className="pp-roulette" aria-hidden="true">
            🎡
          </span>
          <h2>La ruleta está eligiendo…</h2>
          <p>Mira el proyector: ¿qué minijuego tocará?</p>
        </div>
      );
      break;
    case 'intro':
      body = (
        <div className="pp-center">
          <span className="pp-game-emoji" aria-hidden="true">
            {g.emoji}
          </span>
          <h2>{g.name}</h2>
          <p className="pp-how">{g.how}</p>
          <Count party={party} />
        </div>
      );
      break;
    case 'play':
      body = <Play party={party} net={net} />;
      break;
    case 'score':
      body = line ? (
        <div className="pp-center">
          <span className="pp-medal" aria-hidden="true">
            {line.place <= 3 ? MEDAL[line.place - 1] : '🎖️'}
          </span>
          <h2>{line.winner ? '¡Ganaste la ronda!' : `Quedaste en ${line.place}.º lugar`}</h2>
          <p className="pp-big">
            {line.prize ? `+${line.prize} ⚡` : 'Sin energía esta vez'}
            {line.winner && <span> +1 💎</span>}
          </p>
          <p className="pp-fact">🔬 {g.fact}</p>
        </div>
      ) : (
        <div className="pp-center">
          <h2>Resultados de la ronda</h2>
        </div>
      );
      break;
    case 'move': {
      const kind = line ? BOARD[(line.from + line.steps) % BOARD.length] : null;
      const def = kind ? SPACES[kind] : null;
      body = (
        <div className="pp-center">
          {line && def ? (
            <>
              <span className="pp-space" style={{ '--c': def.color } as CSSProperties} aria-hidden="true">
                {def.emoji}
              </span>
              <h2>Avanzas {line.steps} casillas</h2>
              <p className="pp-big">{def.name}</p>
              <p>
                {def.text}
                {line.lap ? ' ¡Y pasaste por la base: +5 ⚡!' : ''}
              </p>
            </>
          ) : (
            <h2>¡A avanzar!</h2>
          )}
        </div>
      );
      break;
    }
    case 'final':
      body = mine ? (
        <div className="pp-center">
          <Astronaut avatar={view.me.avatar} size={120} pose={mine.standing === 1 ? 'cheer' : 'wave'} />
          <h2>{mine.standing === 1 ? '¡Ganaste el torneo!' : `Terminaste en ${mine.standing}.º lugar`}</h2>
          <p className="pp-big">
            💎 {mine.crystals} · ⚡ {mine.energy}
          </p>
          <p>
            +{mine.xp} XP para tu astronauta. Ganó <b>{party.players[0]?.name}</b>.
          </p>
        </div>
      ) : null;
      break;
  }

  return (
    <div className={`pp is-${party.stage}`}>
      <header className="pp-head">
        <span>
          🏆 Torneo marciano · <b>Ronda {party.round}/{party.rounds}</b>
        </span>
        {mine && (
          <span className="pp-me">
            {mine.standing}.º · 💎 {mine.crystals} · ⚡ {mine.energy}
          </span>
        )}
      </header>
      <div className="pp-body" key={`${party.stage}-${party.round}`}>
        {body}
      </div>
    </div>
  );
}
