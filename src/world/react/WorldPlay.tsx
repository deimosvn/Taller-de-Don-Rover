// Interfaz del modo jugador sobre el mundo 3D: joystick y botones táctiles, atajos de
// teclado, cambio de primera a tercera persona, aviso de interacción ("E · Revisar…"),
// tarjetas con lo que el jugador descubre, el visor del casco en primera persona y, en el
// modo libre, la barra de bloques para minar y construir.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BLOCKS, blockIcon, type BlockId } from '../blocks/types';
import type { WorldSnapshot } from '../colony/snapshot';
import type { AnimName } from '../models/astronaut';
import type { BuildAim, PlayerHud, WorldEngine } from '../WorldEngine';
import { cardFor, type WorldCard } from './interactions';

export interface WorldBanner {
  text: string;
  action?: string;
  onAction?: () => void;
  tone?: 'alert' | 'info';
}

/** Barra de bloques del modo libre. */
export interface BuildUi {
  slots: { id: BlockId; count: number }[];
  selected: number;
  onSelect(index: number): void;
}

interface Props {
  engine: WorldEngine | null;
  snapshot: WorldSnapshot | null;
  onExit?: () => void;
  exitLabel?: string;
  banner?: WorldBanner | null;
  build?: BuildUi;
  /** Botones extra de la barra superior (invitar, fabricar…). */
  actions?: ReactNode;
  /** Objetivo actual, bajo la barra superior. */
  objective?: ReactNode;
  /** Aviso corto que manda la pantalla (misión cumplida, sin bloques…). */
  notice?: string | null;
  /** Se envía un gesto (para mostrarlo a los amigos). */
  onEmote?: (anim: AnimName) => void;
  children?: ReactNode;
}

const EMOTES: { anim: AnimName; emoji: string; label: string }[] = [
  { anim: 'wave', emoji: '👋', label: 'Saludar' },
  { anim: 'cheer', emoji: '🎉', label: 'Festejar' },
  { anim: 'scan', emoji: '📡', label: 'Escanear' },
  { anim: 'point', emoji: '👉', label: 'Señalar' },
];

const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export function WorldPlay({ engine, snapshot, onExit, exitLabel = 'Salir', banner, build, actions, objective, notice, onEmote, children }: Props) {
  const [hud, setHud] = useState<PlayerHud | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const [card, setCard] = useState<WorldCard | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [touch] = useState(coarse);
  const [showKeys, setShowKeys] = useState(true);
  const [showEmotes, setShowEmotes] = useState(false);
  const [aim, setAim] = useState<BuildAim | null>(null);
  const [mode, setMode] = useState<'mine' | 'place'>('mine');
  const snapRef = useRef(snapshot);
  snapRef.current = snapshot;
  const buildRef = useRef(build);
  buildRef.current = build;
  const talks = useRef(0);
  const building = Boolean(build);

  useEffect(() => {
    if (!engine) return;
    setHud(engine.hud);
    const offs = [
      engine.events.on('player', (h) => setHud(h)),
      engine.events.on('zone', (z) => setZone(z ? z.name : null)),
      engine.events.on('build', (a) => setAim(a)),
      engine.events.on('slot', (i) => {
        const b = buildRef.current;
        if (b && i < b.slots.length) b.onSelect(i);
      }),
      engine.events.on('interact', (ev) => {
        if (ev.defId === 'character.astronaut') {
          setToast(`👋 Saludaste a ${String(ev.params.label ?? 'tu compañero')}`);
          return;
        }
        const c = cardFor(ev, snapRef.current, talks.current++);
        if (c) setCard(c);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [engine]);

  // En táctil el jugador elige qué hace un toque; con ratón: clic izquierdo y derecho.
  useEffect(() => {
    if (engine) engine.buildMode = building && touch ? mode : 'auto';
  }, [engine, building, touch, mode]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const t = setTimeout(() => setShowKeys(false), 14000);
    return () => clearTimeout(t);
  }, []);

  // Esc cierra la tarjeta abierta.
  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyE') setCard(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card]);

  if (!engine || !hud) return null;
  const first = hud.view === 'first';
  const emote = (anim: AnimName) => {
    engine.playerEmote(anim);
    onEmote?.(anim);
    setShowEmotes(false);
  };
  const selected = build?.slots[build.selected];
  const message = notice ?? toast;

  return (
    <div className={`wp ${first ? 'is-first' : 'is-third'} ${touch ? 'is-touch' : 'is-mouse'} ${building ? 'is-build' : ''}`}>
      {first && <div className="wp-visor" aria-hidden />}
      {first && <div className="wp-crosshair" aria-hidden />}

      <div className="wp-top">
        {onExit && (
          <button className="wp-btn" onClick={onExit} aria-label={exitLabel}>
            ✕ <span>{exitLabel}</span>
          </button>
        )}
        {zone && <span className="wp-chip">📍 {zone}</span>}
        <span className="wp-spacer" />
        {actions}
        <button className="wp-btn" onClick={() => engine.togglePlayerView()} aria-label={first ? 'Cambiar a tercera persona' : 'Cambiar a primera persona'}>
          {first ? '🧑‍🚀' : '👁️'} <span>{first ? '3.ª persona' : '1.ª persona'}</span>
        </button>
      </div>

      {objective && <div className="wp-objective">{objective}</div>}

      {banner && (
        <div className={`wp-banner ${banner.tone ?? 'info'}`} role="status">
          <span>{banner.text}</span>
          {banner.action && (
            <button className="wp-btn solid" onClick={banner.onAction}>
              {banner.action}
            </button>
          )}
        </div>
      )}

      {hud.prompt && !card && (
        <button className="wp-prompt" onClick={() => engine.playerInteract()}>
          <kbd>{touch ? '👆' : 'E'}</kbd> {hud.prompt.label}
        </button>
      )}

      {build && (
        <div className="wp-build">
          {aim && aim.progress > 0 && (
            <div className="wp-mine" role="progressbar" aria-valuenow={Math.round(aim.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <span>⛏️ {aim.block ? BLOCKS[aim.block].name : ''}</span>
              <div className="wp-mine-bar">
                <i style={{ width: `${Math.round(aim.progress * 100)}%` }} />
              </div>
            </div>
          )}
          {selected && (
            <p className="wp-slot-name" key={selected.id}>
              {BLOCKS[selected.id].name}
            </p>
          )}
          <div className="wp-hotbar" role="listbox" aria-label="Bloques">
            {build.slots.map((s, i) => (
              <button
                key={s.id}
                role="option"
                aria-selected={i === build.selected}
                aria-label={`${BLOCKS[s.id].name}: ${s.count}`}
                className={`wp-slot ${i === build.selected ? 'on' : ''} ${s.count ? '' : 'empty'}`}
                onClick={() => build.onSelect(i)}
              >
                <img src={blockIcon(s.id)} alt="" draggable={false} />
                {!touch && <small>{(i + 1) % 10}</small>}
                <b>{s.count > 999 ? '999+' : s.count}</b>
              </button>
            ))}
          </div>
        </div>
      )}

      {touch ? (
        <>
          <Joystick engine={engine} />
          <div className="wp-actions">
            {showEmotes && (
              <div className="wp-emotes">
                {EMOTES.map((e) => (
                  <button key={e.anim} className="wp-round small" aria-label={e.label} onClick={() => emote(e.anim)}>
                    {e.emoji}
                  </button>
                ))}
              </div>
            )}
            <div className="wp-actions-row">
              <button className={`wp-round small ${showEmotes ? 'on' : ''}`} aria-label="Gestos" onClick={() => setShowEmotes((v) => !v)}>
                👋
              </button>
              {build && (
                <button className="wp-round mode" aria-label={mode === 'mine' ? 'Cambiar a construir' : 'Cambiar a minar'} onClick={() => setMode((m) => (m === 'mine' ? 'place' : 'mine'))}>
                  {mode === 'mine' ? '⛏️' : '🧱'}
                  <small>{mode === 'mine' ? 'Minar' : 'Construir'}</small>
                </button>
              )}
              <button className="wp-round jump" aria-label="Saltar" onPointerDown={() => engine.playerJump()}>
                ⤒<small>Saltar</small>
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className={`wp-keys ${showKeys ? 'open' : ''}`} onClick={() => setShowKeys((v) => !v)}>
          {showKeys ? (
            <>
              <b>Controles</b>
              <span>
                <kbd>W</kbd>
                <kbd>A</kbd>
                <kbd>S</kbd>
                <kbd>D</kbd> caminar · <kbd>Mayús</kbd> correr · <kbd>Espacio</kbd> saltar
              </span>
              {build ? (
                <>
                  <span>
                    <kbd>Clic</kbd> minar · <kbd>Clic der.</kbd> construir
                  </span>
                  <span>
                    <kbd>1</kbd>–<kbd>0</kbd> bloque · <kbd>C</kbd> fabricar · <kbd>V</kbd> vista
                  </span>
                </>
              ) : (
                <>
                  <span>
                    <kbd>V</kbd> 1.ª / 3.ª persona · <kbd>E</kbd> interactuar
                  </span>
                  <span>
                    <kbd>1</kbd>–<kbd>4</kbd> gestos 👋 🎉 📡 👉
                  </span>
                </>
              )}
              <span>
                <kbd>Arrastrar</kbd> mirar · <kbd>Rueda</kbd> acercar
              </span>
            </>
          ) : (
            <b>⌨️ Controles</b>
          )}
        </div>
      )}

      {!touch && build && (
        <div className="wp-emote-bar">
          {EMOTES.map((e) => (
            <button key={e.anim} className="wp-round small" aria-label={e.label} title={e.label} onClick={() => emote(e.anim)}>
              {e.emoji}
            </button>
          ))}
        </div>
      )}

      {card && (
        <div className={`wp-card ${card.kind}`} style={{ ['--wc' as string]: card.color ?? '#B69CFF' }} role="dialog" aria-label={card.title}>
          <div className="wp-card-head">
            <span className="wp-card-emoji">{card.emoji}</span>
            <h3>{card.title}</h3>
            <button className="wp-close" onClick={() => setCard(null)} aria-label="Cerrar">
              ✕
            </button>
          </div>
          <p>{card.kind === 'ix' ? <Typewriter text={card.text} /> : card.text}</p>
          {card.meters?.map((m) => (
            <div className="wp-meter" key={m.label}>
              <span>{m.label}</span>
              <div className="wp-meter-bar">
                <i style={{ width: `${Math.max(3, Math.min(100, m.value))}%`, background: m.color }} />
              </div>
              <b>{m.value} %</b>
            </div>
          ))}
          {card.lines?.map((l) => (
            <div className="wp-line" key={l.label}>
              <span>{l.label}</span>
              <b>{l.value}</b>
            </div>
          ))}
        </div>
      )}

      {children}

      {message && (
        <div className="wp-toast" key={message}>
          {message}
        </div>
      )}
    </div>
  );
}

function Typewriter({ text }: { text: string }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    const id = setInterval(() => setN((v) => (v >= text.length ? v : v + 2)), 22);
    return () => clearInterval(id);
  }, [text]);
  return <>{text.slice(0, n)}</>;
}

/** Joystick táctil: escribe directamente en los controles del motor (sin re-render). */
function Joystick({ engine }: { engine: WorldEngine }) {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const active = useRef<number | null>(null);
  const R = 50;

  const update = (x: number, y: number) => {
    const el = base.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let dx = x - (rect.left + rect.width / 2);
    let dy = y - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > R) {
      dx *= R / len;
      dy *= R / len;
    }
    if (knob.current) knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
    const c = engine.controls;
    c.stick.x = dx / R;
    c.stick.y = -dy / R;
  };
  const release = () => {
    active.current = null;
    if (knob.current) knob.current.style.transform = 'translate(0px, 0px)';
    const c = engine.controls;
    c.stick.x = 0;
    c.stick.y = 0;
  };

  useEffect(() => release, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className="wp-stick"
      ref={base}
      onPointerDown={(e) => {
        active.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (active.current === e.pointerId) update(e.clientX, e.clientY);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <div className="wp-stick-knob" ref={knob} />
    </div>
  );
}
