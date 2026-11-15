// Interfaz del modo jugador sobre el mundo 3D: joystick y botones táctiles, atajos de
// teclado, cambio de primera a tercera persona, aviso de interacción ("E · Revisar…"),
// tarjetas con lo que el jugador descubre y el visor del casco en primera persona. Las
// pantallas que la usan (misión, modo libre) agregan sus propias piezas: barra de recursos,
// botones de construir, la estación del problema…

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { WorldSnapshot } from '../colony/snapshot';
import type { AnimName } from '../models/astronaut';
import type { InteractEvent, PlayerHud, WorldEngine } from '../WorldEngine';
import { cardFor, type WorldCard } from './interactions';

export interface WorldBanner {
  text: string;
  action?: string;
  onAction?: () => void;
  tone?: 'alert' | 'info';
}

interface Props {
  engine: WorldEngine | null;
  snapshot: WorldSnapshot | null;
  onExit?: () => void;
  exitLabel?: string;
  banner?: WorldBanner | null;
  /** Barra inferior propia de la pantalla (recursos, construir…). */
  hotbar?: ReactNode;
  /** Botones redondos extra en táctil (junto a saltar). */
  touchActions?: ReactNode;
  /** Líneas propias en la ayuda de controles del teclado. */
  keysHelp?: ReactNode;
  /** La pantalla atiende esta interacción (devuelve true) en vez de mostrar la tarjeta. */
  onInteract?: (ev: InteractEvent) => boolean;
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

export function WorldPlay({ engine, snapshot, onExit, exitLabel = 'Salir', banner, hotbar, touchActions, keysHelp, onInteract, actions, objective, notice, onEmote, children }: Props) {
  const [hud, setHud] = useState<PlayerHud | null>(null);
  const [zone, setZone] = useState<string | null>(null);
  const [card, setCard] = useState<WorldCard | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [touch] = useState(coarse);
  // En ventanas pequeñas la ayuda empieza cerrada para no tapar el mundo.
  const [showKeys, setShowKeys] = useState(() => typeof window === 'undefined' || window.innerWidth >= 900);
  const [showEmotes, setShowEmotes] = useState(false);
  const snapRef = useRef(snapshot);
  snapRef.current = snapshot;
  const interactRef = useRef(onInteract);
  interactRef.current = onInteract;
  const talks = useRef(0);

  useEffect(() => {
    if (!engine) return;
    setHud(engine.hud);
    const offs = [
      engine.events.on('player', (h) => setHud(h)),
      engine.events.on('zone', (z) => setZone(z ? z.name : null)),
      engine.events.on('interact', (ev) => {
        if (interactRef.current?.(ev)) return;
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
  const message = notice ?? toast;

  return (
    <div className={`wp ${first ? 'is-first' : 'is-third'} ${touch ? 'is-touch' : 'is-mouse'} ${hotbar ? 'is-build' : ''}`}>
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

      {hotbar && <div className="wp-build">{hotbar}</div>}

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
              {touchActions}
              <button className="wp-round jump" aria-label="Saltar" onPointerDown={() => engine.playerJump()}>
                ⤒<small>Saltar</small>
              </button>
            </div>
          </div>
        </>
      ) : (
        <button type="button" className={`wp-keys ${showKeys ? 'open' : ''}`} aria-expanded={showKeys} onClick={() => setShowKeys((v) => !v)}>
          {showKeys ? (
            <>
              <b>Controles</b>
              <span>
                <kbd>W</kbd>
                <kbd>A</kbd>
                <kbd>S</kbd>
                <kbd>D</kbd> caminar · <kbd>Mayús</kbd> correr · <kbd>Espacio</kbd> saltar
              </span>
              <span>
                <kbd>V</kbd> 1.ª / 3.ª persona · <kbd>E</kbd> interactuar
              </span>
              <span>
                <kbd>1</kbd>–<kbd>4</kbd> gestos 👋 🎉 📡 👉
              </span>
              {keysHelp}
              <span>
                <kbd>Arrastrar</kbd> mirar · <kbd>Rueda</kbd> acercar
              </span>
            </>
          ) : (
            <b>⌨️ Controles</b>
          )}
        </button>
      )}

      {!touch && hotbar && (
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
