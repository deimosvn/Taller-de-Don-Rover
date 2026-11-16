// Presentación del hackatón (#/pitch): 14 diapositivas visuales que duran 10 minutos.
// Un Marte 3D real (el mismo motor del juego) acompaña toda la presentación y viaja por la
// colonia; las pantallas son capturas reales de la plataforma y los astronautas, la cara de Don
// Rover y los medidores son los componentes vivos del juego. Al iniciar, Don Rover da su primer
// diálogo y un dato real de la NASA de ese día; si la placa está conectada, también habla ahí.

import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { ROLES, ROLE_ORDER } from '../../../shared/content';
import { RADIATION } from '../../../shared/marsSim';
import type { SpaceWeather } from '../../../shared/nasa';
import type { RoleId, SystemId } from '../../../shared/types';
import { Astronaut } from '../../components/art';
import { QR, SystemMeter, useCountUp } from '../../components/ui';
import { nasaApod, nasaNeo, spaceWeather, type Apod, type NeoToday } from '../../lib/nasa';
import { ask, listenAndAnswer, type Answer } from '../../rover/assistant';
import { rover, transportLabel, usbSupported, type RoverStatus } from '../../rover/link';
import { RoverFace } from '../../rover/RoverFace';
import { useRoverStatus, useVoice } from '../../rover/RoverPanel';
import { repeat, say, stop, voiceState } from '../../rover/voice';
import { DEMO_SNAPSHOT } from '../../world/colony/snapshot';
import { ROLE_AVATARS } from '../../world/react/missionZones';
import { PlanetView } from '../../world/react/PlanetView';
import '../../styles/pitch.css';

const REPO = 'https://github.com/deimosvn/Taller-de-Don-Rover';
const APP = 'https://tallerdedonrover.vercel.app';
const CHALLENGE_URL = 'https://www.spaceappschallenge.org/2026/challenges/junior-astronaut-mission-trainer/';
const TOTAL = 600;

const OPENING =
  'Saludos, tripulación. Soy Don Rover, el asistente de la colonia. Tengo una mala noticia: una tormenta solar se acerca a nuestra base en Marte. Y una buena: ustedes pueden salvarla. Pero primero, déjenme contarles por qué existo.';
const CLOSING = 'Los descubrimientos de la NASA deben llegar a las aulas y a los hogares. La ciencia deja de leerse y empieza a vivirse. ¡Gracias, tripulación!';

const fmt = (n: number) => n.toLocaleString('es-MX');
const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

interface Live {
  weather: SpaceWeather | null;
  neo: NeoToday | null;
  apod: Apod | null;
  loaded: boolean;
}

interface Fact {
  spoken: string;
  big: string;
  unit: string;
  detail: string;
  source: string;
}

/** El dato real de la NASA que Don Rover dice al abrir (el más fresco que haya). */
function nasaFact(live: Live): Fact {
  const w = live.weather;
  if (w && w.cmes > 0) {
    return {
      spoken: `Y un dato real de la NASA, de hoy: en las últimas dos semanas el Sol lanzó ${w.cmes} eyecciones de masa coronal, y la más rápida viajaba a ${fmt(w.fastestCme)} kilómetros por segundo. En Marte, el clima espacial puede decidir si una colonia sobrevive.`,
      big: String(w.cmes),
      unit: 'eyecciones de masa coronal',
      detail: `en 14 días · la más rápida a ${fmt(w.fastestCme)} km/s`,
      source: 'NASA DONKI · hoy',
    };
  }
  const n = live.neo;
  const c = n?.closest[0];
  if (n && c) {
    return {
      spoken: `Y un dato real de la NASA, de hoy: ${n.count === 1 ? 'un asteroide pasa' : `${n.count} asteroides pasan`} cerca de la Tierra. El más cercano mide unos ${fmt(c.diameterM ?? 0)} metros. Tranquilos: ninguno va a chocar.`,
      big: String(n.count),
      unit: n.count === 1 ? 'asteroide cerca de la Tierra' : 'asteroides cerca de la Tierra',
      detail: `el más cercano: ${c.name}`,
      source: 'NASA NeoWs · hoy',
    };
  }
  return {
    spoken: `Y un dato real de la NASA: el rover Curiosity midió en Marte ${String(RADIATION.surface).replace('.', ' punto ')} milisieverts de radiación al día. Por eso nuestra colonia necesita escudos.`,
    big: String(RADIATION.surface),
    unit: 'mSv de radiación al día',
    detail: 'medidos por Curiosity en Marte',
    source: 'NASA · Curiosity RAD',
  };
}

/* ------------------------------------------------------------------ */
/* Piezas visuales                                                      */
/* ------------------------------------------------------------------ */

function In({ d = 0, children, className = '', style }: { d?: number; children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`pt-in ${className}`} style={{ '--d': `${d}s`, ...style } as CSSProperties}>
      {children}
    </div>
  );
}

function Kicker({ children, d = 0 }: { children: ReactNode; d?: number }) {
  return (
    <In d={d} className="pt-kicker">
      {children}
    </In>
  );
}

/** Captura real de la consola dentro de un monitor. */
function Screen({ src, alt, d = 0, className = '', label }: { src: string; alt: string; d?: number; className?: string; label?: string }) {
  return (
    <In d={d} className={`pt-screen ${className}`}>
      <div className="pt-screen-bar">
        <i />
        <i />
        <i />
        {label && <span>{label}</span>}
      </div>
      <img src={`pitch/${src}`} alt={alt} />
    </In>
  );
}

/** Captura real del celular del alumno dentro de un teléfono. */
function Phone({ src, alt, d = 0, tilt = 0, className = '' }: { src: string; alt: string; d?: number; tilt?: number; className?: string }) {
  return (
    <In d={d} className={`pt-phone ${className}`} style={{ '--tilt': `${tilt}deg` } as CSSProperties}>
      <img src={`pitch/${src}`} alt={alt} />
    </In>
  );
}

function Polaroid({ src, alt, caption, d = 0, tilt = 0, quote }: { src: string; alt: string; caption: string; d?: number; tilt?: number; quote?: string }) {
  return (
    <In d={d} className="pt-polaroid" style={{ '--tilt': `${tilt}deg` } as CSSProperties}>
      <img src={`pitch/${src}`} alt={alt} />
      <span>{caption}</span>
      {/* Lo que dijo el niño de la foto, como globo de diálogo. */}
      {quote && (
        <q className="pt-quote" style={{ '--d': `${d + 0.6}s` } as CSSProperties}>
          {quote}
        </q>
      )}
    </In>
  );
}

function Crew({ size = 150, d = 0, pose = 'idle' as 'idle' | 'cheer' | 'wave' }) {
  return (
    <div className="pt-crew">
      {ROLE_ORDER.map((r: RoleId, i) => (
        <In key={r} d={d + i * 0.1} className="pt-crew-member">
          <Astronaut avatar={ROLE_AVATARS[r]} role={r} size={size} pose={i % 2 ? pose : 'idle'} />
          <span style={{ '--c': ROLES[r].color } as CSSProperties}>
            {ROLES[r].emoji} {ROLES[r].specialty}
          </span>
        </In>
      ))}
    </div>
  );
}

function Count({ value }: { value: number }) {
  return <>{fmt(useCountUp(value, 1400))}</>;
}

/** Medidores de la colonia que van bajando: el problema, en vivo. */
function FallingMeters() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((x) => x + 1), 1600);
    return () => clearInterval(id);
  }, []);
  const base: Record<SystemId, number> = { energy: 78, water: 70, food: 66, habitat: 74 };
  const drop: Record<SystemId, number> = { energy: 9, water: 6, food: 7, habitat: 11 };
  return (
    <div className="pt-meters">
      {(Object.keys(base) as SystemId[]).map((s) => (
        <SystemMeter key={s} system={s} value={Math.max(12, base[s] - drop[s] * Math.min(t, 6))} size="lg" />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Diapositivas                                                         */
/* ------------------------------------------------------------------ */

type Who = 'Don Rover' | 'Diego' | 'Daniel' | 'Los tres' | 'Equipo';
type PlanetPos = 'hero' | 'right' | 'center' | 'corner' | 'off';

interface Slide {
  id: string;
  title: string;
  who: Who;
  seconds: number;
  planet: { pos: PlanetPos; focus?: string | null };
  render: (ctx: Ctx) => ReactNode;
}

interface Ctx {
  live: Live;
  fact: Fact;
  started: boolean;
  start: () => void;
  voice: ReturnType<typeof useVoice>;
  board: RoverStatus;
}

/**
 * Conectar el Don Rover físico desde la presentación (USB o Wi-Fi/nube con el código de la
 * placa). Así su cara y su boca se mueven en la placa cuando habla en pantalla.
 */
function BoardControl({ board, compact = false }: { board: RoverStatus; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(() => rover.saved.id || rover.saved.ip || '');
  const [busy, setBusy] = useState(false);
  const on = board.state === 'on';
  const run = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    const ok = await fn().catch(() => false);
    setBusy(false);
    // Si no se pudo, se queda abierto con el motivo y la opción de Wi-Fi.
    setOpen(!ok);
  };
  const usb = () => void run(() => rover.connectUsb({ ask: true }));
  const label = on ? `Don Rover físico · ${transportLabel(board.via)}` : board.state === 'connecting' ? 'Conectando la placa…' : compact ? 'Conectar placa' : '🔌 Conectar Don Rover físico';
  return (
    <div className={`pt-board-ctl ${compact ? 'compact' : ''}`}>
      <button
        className={`pt-board-chip ${board.state}`}
        onClick={() => (on || board.state === 'connecting' ? setOpen((o) => !o) : usbSupported() && !compact ? usb() : setOpen((o) => !o))}
        title={board.detail}
      >
        <i />
        {label}
      </button>
      {open && (
        <div className="pt-board-pop" onKeyDown={(e) => e.stopPropagation()}>
          <p>{board.detail}</p>
          {usbSupported() && (
            <button className="pt-board-btn" disabled={busy} onClick={usb}>
              🔌 Por USB
            </button>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => rover.connectWifi(code));
            }}
          >
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código (A1B2C3) o IP" aria-label="Código o IP de la placa" />
            <button className="pt-board-btn" disabled={busy || !code.trim()}>
              📶 Wi-Fi
            </button>
          </form>
          {on && (
            <button className="pt-board-btn ghost" onClick={() => void rover.disconnect()}>
              Desconectar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const SLIDES: Slide[] = [
  {
    id: 'inicio',
    title: 'Don Rover',
    who: 'Don Rover',
    seconds: 40,
    planet: { pos: 'hero', focus: null },
    render: ({ started, start, fact, voice, board }) => (
      <div className="pt-cover">
        <In className="pt-cover-face">
          <RoverFace expr={voice.face} mouth={voice.mouth} size={330} linked={board.state === 'on'} pulse={!started && !voice.speaking ? '#F59A63' : null} />
          <BoardControl board={board} />
        </In>
        <div className={`pt-cover-copy ${started ? 'started' : ''}`}>
          <Kicker>NASA Space Apps Challenge 2026</Kicker>
          <In d={0.1}>
            <h1>Don Rover</h1>
          </In>
          {!started ? (
            <>
              <In d={0.2}>
                <p className="pt-tag">La ciencia deja de leerse y empieza a vivirse.</p>
              </In>
              <In d={0.35}>
                <button className="pt-start" onClick={start}>
                  ▶ Iniciar
                </button>
              </In>
            </>
          ) : (
            <>
              <In className="pt-bubble">{!voice.caption || voice.caption.startsWith(OPENING) ? OPENING : voice.caption}</In>
              <In d={0.3} className="pt-fact">
                <span className="pt-live-dot">● {fact.source}</span>
                <b>{fact.big}</b>
                <span>
                  {fact.unit}
                  <small>{fact.detail}</small>
                </span>
              </In>
            </>
          )}
        </div>
      </div>
    ),
  },
  {
    id: 'reto',
    title: 'El reto',
    who: 'Equipo',
    seconds: 45,
    planet: { pos: 'corner', focus: 'colony.mars01' },
    render: () => (
      <div className="pt-col center">
        <Kicker>Nuestro reto · NASA Space Apps Challenge 2026</Kicker>
        <In d={0.1} className="pt-challenge">
          <span>Reto oficial</span>
          <b>Build a Junior Astronaut Mission Trainer</b>
          <a href={CHALLENGE_URL} target="_blank" rel="noreferrer">
            spaceappschallenge.org
          </a>
        </In>
        <div className="pt-tiles">
          {[
            ['🧒', '7 a 12 años'],
            ['🫁', 'Soporte vital'],
            ['🛡️', 'Blindaje'],
            ['⚡', 'Energía'],
            ['🥔', 'Comida'],
            ['📡', 'Retraso de señal'],
            ['🛰️', 'Datos reales NASA'],
            ['🌐', 'Sin cuentas'],
          ].map(([e, t], i) => (
            <In key={t} d={0.3 + i * 0.07} className="pt-tile">
              <span>{e}</span>
              {t}
              <i>✓</i>
            </In>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'problema',
    title: 'El problema',
    who: 'Equipo',
    seconds: 30,
    planet: { pos: 'off' },
    render: () => (
      <div className="pt-split">
        <div>
          <Kicker>El problema</Kicker>
          <In d={0.1}>
            <h2 className="pt-h-big">
              Saben qué es la radiación.
              <em> Casi nunca la usan para decidir.</em>
            </h2>
          </In>
        </div>
        <In d={0.3} className="pt-card">
          <p className="pt-card-title">Colonia MARS-01 · una mala decisión…</p>
          <FallingMeters />
        </In>
      </div>
    ),
  },
  {
    id: 'solucion',
    title: 'La solución',
    who: 'Equipo',
    seconds: 35,
    planet: { pos: 'center', focus: null },
    render: () => (
      <div className="pt-solution">
        <In className="pt-solution-head">
          <Kicker>La solución</Kicker>
          <h2>
            Un salón → <em>una colonia en Marte</em>
          </h2>
        </In>
        <div className="pt-solution-crew">
          <Crew size={150} d={0.4} pose="wave" />
        </div>
        <div className="pt-pills">
          {[
            ['🛰️', 'Datos reales NASA'],
            ['✨', 'IA que narra'],
            ['🎮', 'Juego multijugador'],
          ].map(([e, t], i) => (
            <In key={t} d={0.8 + i * 0.1} className="pt-pill">
              {e} {t}
            </In>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'ninos',
    title: 'Lo probamos con niños',
    who: 'Equipo',
    seconds: 40,
    planet: { pos: 'off' },
    render: () => (
      <div className="pt-kids">
        <div>
          <Kicker>Lo probamos con niños</Kicker>
          <In d={0.1}>
            <h2>
              Dos talleres STEM <em>sobre Marte.</em>
            </h2>
          </In>
          <In d={0.25} className="pt-compare">
            <div className="pt-compare-row">
              <span className="pt-compare-label">
                📚 <b>Taller teórico</b>
              </span>
              <div className="pt-bar">
                <i className="base" />
              </div>
            </div>
            <div className="pt-compare-row win">
              <span className="pt-compare-label">
                🚀 <b>Taller de Don Rover</b>
              </span>
              <div className="pt-bar">
                <i className="win" />
                <em>+80 %</em>
              </div>
            </div>
            <p className="pt-compare-note">
              Retuvieron <b>hasta un 80 % más</b> de lo que aprendieron en el taller.
            </p>
          </In>
          <In d={0.6} className="pt-pill aware">
            🪐 Más conciencia de lo que implica vivir en Marte
          </In>
        </div>
        {/* Fotos completas de los talleres, en abanico. */}
        <div className="pt-kids-fan">
          <Polaroid src="nino-me-gusto.webp" alt="Un niño muestra su astronauta en el celular con el pulgar arriba" caption="¡Listo para la misión!" d={0.3} tilt={-4} quote="¡Me gustó mucho!" />
          <Polaroid src="nino-mundo-3d.webp" alt="Niños jugando el mundo 3D de Don Rover en sus celulares" caption="Su astronauta en 3D" d={0.45} tilt={3} />
          <Polaroid src="nino-minijuego.webp" alt="Un niño resuelve el minijuego de conectar cables" caption="Minijuego en equipo" d={0.6} tilt={-2} />
          <Polaroid src="nino-explorando.webp" alt="Un niño explora Marte con su astronauta en el celular" caption="Explorando Marte" d={0.75} tilt={4} />
        </div>
      </div>
    ),
  },
  {
    id: 'como',
    title: 'Cómo funciona',
    who: 'Diego',
    seconds: 85,
    planet: { pos: 'off' },
    render: () => <HowItWorks />,
  },
  {
    id: 'nasa',
    title: 'Datos reales de la NASA',
    who: 'Daniel',
    seconds: 60,
    planet: { pos: 'right', focus: 'sector.solar' },
    render: ({ live }) => {
      const w = live.weather;
      const c = live.neo?.closest[0];
      return (
        <div className="pt-nasa">
          <Kicker>Datos reales de la NASA · en vivo</Kicker>
          <In d={0.1}>
            <h2>Lo que pasa en el Sol, pasa en la colonia.</h2>
          </In>
          <div className="pt-sources">
            {[
              ['☀️', 'DONKI', 'Clima espacial'],
              ['📄', 'NTRS', 'Reportes técnicos'],
              ['🧬', 'OSDR', 'Biología espacial'],
              ['☄️', 'NeoWs', 'Asteroides'],
              ['📸', 'APOD', 'Foto del día'],
            ].map(([e, k, t], i) => (
              <In key={k} d={0.25 + i * 0.08} className="pt-source">
                <span>{e}</span>
                <b>{k}</b>
                <small>{t}</small>
              </In>
            ))}
          </div>
          <div className="pt-stats">
            <In d={0.7} className="pt-stat sun">
              <b>{w ? <Count value={w.cmes} /> : '—'}</b>
              <span>eyecciones de masa coronal</span>
              <small>{w ? `clima espacial ${w.label.toLowerCase()}` : 'consultando…'}</small>
            </In>
            <In d={0.8} className="pt-stat fast">
              <b>{w ? <Count value={w.fastestCme} /> : '—'}</b>
              <span>km/s la más rápida</span>
              <small>NASA DONKI</small>
            </In>
            <In d={0.9} className="pt-stat rock">
              <b>{live.neo ? <Count value={live.neo.count} /> : '—'}</b>
              <span>{live.neo?.count === 1 ? 'asteroide cerca hoy' : 'asteroides cerca hoy'}</span>
              <small>{c ? c.name : 'NASA NeoWs'}</small>
            </In>
          </div>
        </div>
      );
    },
  },
  {
    id: 'ia',
    title: 'La IA narra, el motor decide',
    who: 'Daniel',
    seconds: 55,
    planet: { pos: 'off' },
    render: () => (
      <div className="pt-ai">
        <Kicker>Qué hay debajo</Kicker>
        <In d={0.1}>
          <h2 className="pt-h-big center">
            La IA narra. <em>El motor decide.</em>
          </h2>
        </In>
        <div className="pt-flow">
          {[
            ['🛰️', 'NASA'],
            ['✨', 'Claude'],
            ['✅', 'Validación'],
            ['⚙️', 'Motor justo'],
            ['🪐', 'Planeta 3D'],
          ].map(([e, t], i) => (
            <In key={t} d={0.25 + i * 0.12} className="pt-flow-node">
              <span>{e}</span>
              {t}
            </In>
          ))}
          <div className="pt-flow-line" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="pt-acts">
          {[
            ['🎯', 'Elige la misión'],
            ['🧩', 'Reparte las tareas'],
            ['📖', 'Escribe la historia'],
            ['⭐', 'Evalúa bitácoras'],
            ['🤖', 'Mueve a Don Rover'],
            ['🎓', 'Escribe el debrief'],
          ].map(([e, t], i) => (
            <In key={t} d={0.9 + i * 0.08} className="pt-act">
              <span>{e}</span>
              {t}
            </In>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'rover',
    title: 'Don Rover sale de la pantalla',
    who: 'Los tres',
    seconds: 60,
    planet: { pos: 'off' },
    render: ({ voice }) => <RoverDemo voice={voice} />,
  },
  {
    id: 'compilar',
    title: 'Se instala desde el navegador',
    who: 'Los tres',
    seconds: 35,
    planet: { pos: 'off' },
    render: () => (
      <div className="pt-split">
        <div>
          <Kicker>Hardware abierto</Kicker>
          <In d={0.1}>
            <h2>
              Se instala <em>desde el navegador.</em>
            </h2>
          </In>
          <div className="pt-steps3">
            {[
              ['🔌', 'Conecta por USB'],
              ['⬇️', 'Instalar en la placa'],
              ['🤖', '¡Don Rover vive!'],
            ].map(([e, t], i) => (
              <In key={t} d={0.3 + i * 0.15} className="pt-step3">
                <span>{e}</span>
                {t}
              </In>
            ))}
          </div>
          <In d={0.8}>
            <p className="pt-mono">Web Serial + esptool-js · ESP32 · firmware abierto</p>
          </In>
        </div>
        <Screen src="app-instalador.webp" alt="Instalador del firmware de Don Rover en la plataforma" label="#/donrover" d={0.25} />
      </div>
    ),
  },
  {
    id: 'tecnico',
    title: 'Arquitectura',
    who: 'Daniel',
    seconds: 50,
    planet: { pos: 'off' },
    render: () => <Architecture />,
  },
  {
    id: 'planeta',
    title: 'Un planeta que recuerda',
    who: 'Diego',
    seconds: 35,
    planet: { pos: 'right', focus: 'colony.mars01' },
    render: () => (
      <div className="pt-world">
        <Kicker>Resultado</Kicker>
        <In d={0.1}>
          <h2>
            Cada decisión <em>cambia el planeta.</em>
          </h2>
        </In>
        <div className="pt-world-row">
          <Phone src="app-simulador.webp" alt="Simulador del Entrenador de Misión con paneles, baterías y modo ahorro" d={0.3} tilt={-4} />
          <Screen src="app-colonia-3d.webp" alt="La colonia MARS-01 en 3D" label="Colonia 3D" d={0.45} className="small" />
        </div>
        <In d={0.7} className="pt-pills left">
          <span className="pt-pill">⚖️ Ninguna decisión es gratis</span>
          <span className="pt-pill">💾 Se guarda entre clases</span>
        </In>
      </div>
    ),
  },
  {
    id: 'abierto',
    title: 'Código abierto',
    who: 'Equipo',
    seconds: 15,
    planet: { pos: 'off' },
    render: () => (
      <div className="pt-open">
        <div>
          <Kicker>Código abierto</Kicker>
          <In d={0.1}>
            <h2>Todo el código es público.</h2>
          </In>
          <In d={0.25}>
            <a className="pt-repo" href={REPO} target="_blank" rel="noreferrer">
              github.com/deimosvn/Taller-de-Don-Rover
            </a>
          </In>
          <In d={0.35}>
            <a className="pt-repo light" href={APP} target="_blank" rel="noreferrer">
              🚀 tallerdedonrover.vercel.app
            </a>
          </In>
        </div>
        <div className="pt-qrs">
          <In d={0.2} className="pt-qr">
            <QR value={REPO} size={220} />
            <span>Repositorio</span>
          </In>
          <In d={0.3} className="pt-qr">
            <QR value={APP} size={220} />
            <span>Pruébalo</span>
          </In>
        </div>
      </div>
    ),
  },
  {
    id: 'cierre',
    title: 'Gracias',
    who: 'Equipo',
    seconds: 15,
    planet: { pos: 'hero', focus: null },
    render: ({ voice, board }) => (
      <div className="pt-cover">
        <In className="pt-cover-face">
          <RoverFace expr={voice.speaking ? voice.face : 'star'} mouth={voice.mouth} size={300} linked={board.state === 'on'} />
        </In>
        <div className="pt-cover-copy">
          <In d={0.1}>
            <h2 className="pt-h-big">
              La ciencia deja de leerse <em>y empieza a vivirse.</em>
            </h2>
          </In>
          <In d={0.3}>
            <button className="pt-start small" onClick={() => void say(CLOSING, { face: 'star' })}>
              🤖 Don Rover se despide
            </button>
          </In>
          <In d={0.45}>
            <p className="pt-mono">¡Gracias, tripulación!</p>
          </In>
        </div>
      </div>
    ),
  },
];

/** Cómo funciona: cuatro pantallas reales que se encienden una tras otra. */
function HowItWorks() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % 4), 4200);
    return () => clearInterval(id);
  }, []);
  const steps = [
    { n: '1', t: 'El profe abre la sala', s: 'Código y QR · sin cuentas' },
    { n: '2', t: '4 alumnos, 4 especialidades', s: 'Cada quien con un dato secreto' },
    { n: '3', t: 'IX arma la misión', s: 'Con un estudio real de la NASA' },
    { n: '4', t: 'Juegan en su celular', s: 'Mundo 3D y minijuegos' },
  ];
  return (
    <div className="pt-how">
      <div className="pt-how-left">
        <Kicker>Cómo funciona</Kicker>
        <In d={0.1}>
          <h2>Nadie puede salvar la colonia solo.</h2>
        </In>
        <ol className="pt-how-steps">
          {steps.map((x, i) => (
            <li key={x.n} className={i === step ? 'on' : ''} onClick={() => setStep(i)}>
              <span>{x.n}</span>
              <b>{x.t}</b>
              <small>{x.s}</small>
            </li>
          ))}
        </ol>
      </div>
      <div className="pt-how-right">
        <div className={`pt-how-shot ${step === 0 ? 'on' : ''}`}>
          <Screen src="app-consola-4-astronautas.webp" alt="Consola del profe con el QR y 4 astronautas" label="Consola del profe" />
        </div>
        <div className={`pt-how-shot ${step === 1 ? 'on' : ''}`}>
          <Screen src="app-tripulacion-don-rover.webp" alt="Tripulación formada y Don Rover narrando" label="Tripulación lista" />
        </div>
        <div className={`pt-how-shot ${step === 2 ? 'on' : ''}`}>
          <Screen src="app-mision-nasa.webp" alt="Misión generada por IX con un estudio real de la NASA" label="Misión con datos NASA" />
        </div>
        <div className={`pt-how-shot phones ${step === 3 ? 'on' : ''}`}>
          <Phone src="app-celular-3d.webp" alt="Celular del alumno en el mundo 3D" tilt={-5} />
          <Phone src="app-minijuego-energia.webp" alt="Minijuego de repartir la energía del invernadero" tilt={4} />
          <Phone src="app-minijuego-compuertas.webp" alt="Minijuego de sellar compuertas" tilt={-2} />
        </div>
      </div>
    </div>
  );
}

/** Arquitectura: nodos con conexiones animadas. */
function Architecture() {
  return (
    <div className="pt-arch">
      <Kicker>Por dentro</Kicker>
      <In d={0.1}>
        <h2 className="center">El proyector es el servidor.</h2>
      </In>
      <div className="pt-arch-row">
        <In d={0.25} className="pt-node">
          <span>📱</span>
          <b>Celulares</b>
          <small>PWA · sin cuentas</small>
        </In>
        <In d={0.35} className="pt-wire">
          <i />
          <small>WebRTC directo</small>
        </In>
        <In d={0.45} className="pt-node main">
          <span>🖥️</span>
          <b>Proyector</b>
          <small>Motor + Three.js</small>
        </In>
        <In d={0.55} className="pt-wire">
          <i />
          <small>USB · Wi-Fi · nube</small>
        </In>
        <In d={0.65} className="pt-node">
          <RoverFace expr="happy" mouth={0} size={70} />
          <b>Don Rover</b>
          <small>ESP32</small>
        </In>
      </div>
      <In d={0.75} className="pt-wire down">
        <i />
      </In>
      <div className="pt-cloud">
        {[
          ['✨', '/api/ai', 'Claude Opus 5.5'],
          ['🛰️', '/api/nasa', 'DONKI · NTRS · OSDR'],
          ['🗄️', '/api/colonies', 'Supabase'],
          ['📡', '/api/realtime', 'Respaldo'],
        ].map(([e, k, t], i) => (
          <In key={k} d={0.85 + i * 0.08} className="pt-fn">
            <span>{e}</span>
            <code>{k}</code>
            <small>{t}</small>
          </In>
        ))}
      </div>
    </div>
  );
}

/** Demo en vivo: el público le pregunta a Don Rover (Claude + datos reales de la NASA). */
function RoverDemo({ voice }: { voice: ReturnType<typeof useVoice> }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<{ q: string; a: Answer } | null>(null);
  const suggestions = ['¿Por qué la radiación es peligrosa para el hábitat?', '¿Cómo está el clima espacial hoy?', '¿Qué asteroides pasan cerca hoy?'];
  const linked = useRoverStatus().state === 'on';
  const go = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setQ('');
    const a = await ask(t).catch(() => null);
    setBusy(false);
    if (a) setAnswer({ q: t, a });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void go(q);
  };
  return (
    <div className="pt-rover">
      <div className="pt-rover-left">
        <Kicker>Don Rover sale de la pantalla</Kicker>
        <In d={0.1}>
          <h2>
            Un asistente de IA <em>físico.</em>
          </h2>
        </In>
        <div className="pt-board-wrap">
          <In d={0.2} className="pt-board">
            <RoverFace expr={voice.face} mouth={voice.mouth} size={250} linked={linked} pulse={busy ? '#FFC93C' : null} />
          </In>
          <div className="pt-rover-roles">
            {[
              ['🎙️', 'Narra'],
              ['💡', 'Da pistas'],
              ['🧠', 'Explica'],
              ['🛰️', 'Datos NASA'],
            ].map(([e, t], i) => (
              <In key={t} d={0.35 + i * 0.1} className="pt-act">
                <span>{e}</span>
                {t}
              </In>
            ))}
          </div>
        </div>
      </div>
      <In d={0.3} className="pt-demo">
        <div className="pt-demo-head">
          <span className={`pt-live-dot ${linked ? '' : 'off'}`}>● {linked ? 'Placa conectada' : 'En vivo'}</span>
          <b>Pregúntale a Don Rover</b>
        </div>
        <div className="pt-demo-chat">
          {answer ? (
            <>
              <p className="pt-demo-q">{answer.q}</p>
              <p className="pt-demo-a">{answer.a.text}</p>
              {answer.a.refs.length > 0 && (
                <p className="pt-demo-refs">
                  {answer.a.refs.slice(0, 2).map((r) => (
                    <a key={r.url} href={r.url} target="_blank" rel="noreferrer">
                      <span>{r.label}</span> {r.title}
                    </a>
                  ))}
                </p>
              )}
            </>
          ) : (
            <p className="pt-demo-empty">{busy ? 'Consultando a la NASA…' : '👇 Elige una pregunta o escribe la tuya'}</p>
          )}
        </div>
        <div className="pt-demo-sugs">
          {suggestions.map((s) => (
            <button key={s} onClick={() => void go(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="pt-demo-form">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Escribe una pregunta…" maxLength={200} aria-label="Pregunta para Don Rover" onKeyDown={(e) => e.stopPropagation()} />
          <button disabled={!q.trim() || busy}>{busy ? '…' : 'Preguntar'}</button>
        </form>
      </In>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Presentación                                                         */
/* ------------------------------------------------------------------ */

const W = 1600;
const H = 900;

export function Pitch() {
  const [index, setIndex] = useState(() => {
    const n = Number(new URLSearchParams(location.hash.split('?')[1] ?? '').get('s'));
    return Number.isInteger(n) && n >= 1 && n <= SLIDES.length ? n - 1 : 0;
  });
  const [scale, setScale] = useState(1);
  const [live, setLive] = useState<Live>({ weather: null, neo: null, apod: null, loaded: false });
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [chrome, setChrome] = useState(true);
  const voice = useVoice();
  const board = useRoverStatus();
  const liveRef = useRef(live);
  liveRef.current = live;

  // Si la placa se conecta (o reconecta) a mitad del diálogo, se pone al día: misma cara y,
  // si Don Rover está hablando, la boca se mueve en la placa también.
  useEffect(
    () =>
      rover.onEvent((e) => {
        if (e.t === 'hi') {
          const v = voiceState();
          rover.send({ t: 'face', e: v.speaking ? v.face : 'happy', ms: v.speaking ? 0 : 2500 });
          if (v.speaking) rover.send({ t: 'talk', on: 1 });
        } else if (e.t === 'btn') {
          // Botón de la cabeza: corto = repetir · sostenido = preguntarle con el micrófono.
          if (e.k === 'short') void repeat();
          else void listenAndAnswer();
        }
      }),
    [],
  );

  // Escala del escenario de 1600 × 900 a la pantalla.
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // Datos de la NASA desde antes de empezar, para que Don Rover los diga al instante.
  useEffect(() => {
    void rover.auto().catch(() => false);
    let alive = true;
    void Promise.all([spaceWeather(14), nasaNeo(), nasaApod()]).then(([weather, neo, apod]) => {
      if (alive) setLive({ weather, neo, apod, loaded: true });
    });
    return () => {
      alive = false;
      stop();
    };
  }, []);

  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [startedAt]);

  const go = useCallback((i: number) => setIndex(Math.max(0, Math.min(SLIDES.length - 1, i))), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) {
        e.preventDefault();
        setIndex((i) => Math.min(SLIDES.length - 1, i + 1));
      } else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Home') setIndex(0);
      else if (e.key === 'End') setIndex(SLIDES.length - 1);
      else if (e.key.toLowerCase() === 'f') {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.().catch(() => {});
      } else if (e.key.toLowerCase() === 'h') setChrome((c) => !c);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Al iniciar: Don Rover habla y luego dice el dato real de la NASA (sin esperar más de 2.5 s).
  const start = useCallback(async () => {
    setStartedAt(Date.now());
    setNow(Date.now());
    void document.documentElement.requestFullscreen?.().catch(() => {});
    // La placa mira al público antes de hablar (say() la despierta si estaba dormida).
    rover.send({ t: 'look', x: 0, y: 0 });
    if (!liveRef.current.loaded) await new Promise((r) => setTimeout(r, 2500));
    const fact = nasaFact(liveRef.current);
    // say() mueve la cara y la boca en pantalla y en la placa (talk + golpes de cada palabra).
    await say(`${OPENING} ${fact.spoken}`, { face: 'happy' });
    // Al terminar, la pantalla redonda muestra el dato de la NASA.
    if (rover.connected) rover.send({ t: 'card', title: fact.big, sub: fact.unit, ms: 9000 });
  }, []);

  const slide = SLIDES[index];
  const fact = nasaFact(live);
  const elapsed = startedAt ? (now - startedAt) / 1000 : 0;
  const planned = SLIDES.slice(0, index).reduce((a, s) => a + s.seconds, 0);
  const drift = startedAt ? elapsed - planned : 0;
  const pace = !startedAt ? '' : drift > 20 ? 'late' : drift < -25 ? 'early' : 'ok';

  return (
    <div className={`pitch ${chrome ? '' : 'clean'}`}>
      <div className="pt-bg" aria-hidden="true">
        <i className="b1" />
        <i className="b2" />
        <i className="b3" />
      </div>
      <div className="pt-stage" style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})` }}>
        {/* Marte 3D real: acompaña la presentación y viaja por la colonia. */}
        <div className={`pt-planet pos-${slide.planet.pos}`} aria-hidden="true">
          <div className="pt-planet-ring" />
          <div className="pt-planet-globe">
            <PlanetView snapshot={DEMO_SNAPSHOT} focus={slide.planet.focus ?? null} autoRotate={!slide.planet.focus} interactive={false} distance={175} />
          </div>
        </div>
        <section key={slide.id} className={`pt-slide pt-s-${slide.id}`} aria-roledescription="diapositiva" aria-label={`${index + 1} de ${SLIDES.length}: ${slide.title}`}>
          {slide.render({ live, fact, started: startedAt !== null, start: () => void start(), voice, board })}
        </section>
        <footer className="pt-foot">
          <span className="pt-brand">
            <RoverFace expr={voice.face} mouth={voice.mouth} size={36} linked={board.state === 'on'} />
            Don Rover
          </span>
          {index > 0 && <BoardControl board={board} compact />}
          <span className={`pt-who who-${slide.who.replace(' ', '-').toLowerCase()}`}>🎤 {slide.who}</span>
          <span className="pt-dots">
            {SLIDES.map((s, i) => (
              <button key={s.id} className={i === index ? 'on' : i < index ? 'done' : ''} onClick={() => go(i)} aria-label={`Ir a ${s.title}`} title={s.title} />
            ))}
          </span>
          <span className={`pt-clock ${pace}`} title="Tiempo transcurrido de 10 minutos · sugerido para esta diapositiva">
            {startedAt ? `${mmss(elapsed)} / 10:00` : '10:00'} · {slide.seconds} s
          </span>
        </footer>
        <div className="pt-progress" aria-hidden="true">
          <i style={{ width: `${Math.min(100, ((startedAt ? elapsed : planned) / TOTAL) * 100)}%` }} />
        </div>
      </div>
      <nav className="pt-nav" aria-label="Navegación de la presentación">
        <button onClick={() => go(index - 1)} disabled={index === 0} aria-label="Diapositiva anterior">
          ‹
        </button>
        <span>
          {index + 1} / {SLIDES.length}
        </span>
        <button onClick={() => go(index + 1)} disabled={index === SLIDES.length - 1} aria-label="Diapositiva siguiente">
          ›
        </button>
        <a href="#/" aria-label="Salir de la presentación" title="Salir">
          ✕
        </a>
      </nav>
    </div>
  );
}

// Los tiempos deben sumar 10 minutos.
if (import.meta.env.DEV && SLIDES.reduce((a, s) => a + s.seconds, 0) !== TOTAL) console.warn('[pitch] los tiempos no suman 600 s');
