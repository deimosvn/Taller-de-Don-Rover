// Presentación del hackatón (#/pitch): 14 diapositivas hechas con código, pensadas para durar
// 10 minutos en un proyector. Al iniciar, Don Rover da su primer diálogo y un dato real de la
// NASA de ese día (DONKI o NeoWs); su cara se mueve en pantalla y, si la placa está conectada,
// también en el Don Rover físico. Flechas, espacio o el control remoto cambian de diapositiva.
//
// Basada en el guion "Don Rover — Pitch". Los tiempos de cada diapositiva suman 600 s.

import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { RADIATION } from '../../../shared/marsSim';
import type { SpaceWeather } from '../../../shared/nasa';
import { DonRover } from '../../components/art';
import { QR } from '../../components/ui';
import { nasaApod, nasaNeo, spaceWeather, type Apod, type NeoToday } from '../../lib/nasa';
import { ask, type Answer } from '../../rover/assistant';
import { rover } from '../../rover/link';
import { RoverFace } from '../../rover/RoverFace';
import { useVoice } from '../../rover/RoverPanel';
import { say, stop } from '../../rover/voice';
import '../../styles/pitch.css';

const REPO = 'https://github.com/deimosvn/Taller-de-Don-Rover';
const APP = 'https://tallerdedonrover.vercel.app';
const CHALLENGE_URL = 'https://www.spaceappschallenge.org/2026/challenges/junior-astronaut-mission-trainer/';
const TOTAL = 600;

const OPENING =
  'Saludos, tripulación. Soy Don Rover, el asistente de la colonia. Tengo una mala noticia: una tormenta solar se acerca a nuestra base en Marte. Y una buena: ustedes pueden salvarla. Pero primero, déjenme contarles por qué existo.';
const CLOSING = 'Los descubrimientos de la NASA pueden cambiar el futuro. Pero deben llegar a las aulas y a los hogares. La ciencia deja de leerse y empieza a vivirse. ¡Gracias, tripulación!';

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
  title: string;
  detail: string;
  source: string;
}

/** El dato real de la NASA que Don Rover dice al abrir (el más fresco que haya). */
function nasaFact(live: Live): Fact {
  const w = live.weather;
  if (w && w.cmes > 0) {
    return {
      spoken: `Y un dato real de la NASA, de hoy: en las últimas dos semanas el Sol lanzó ${w.cmes} eyecciones de masa coronal, y la más rápida viajaba a ${fmt(w.fastestCme)} kilómetros por segundo. Por eso, en Marte, el clima espacial puede decidir si una colonia sobrevive.`,
      title: `${w.cmes} eyecciones de masa coronal`,
      detail: `La más rápida: ${fmt(w.fastestCme)} km/s${w.maxKp > 0 ? ` · índice Kp máximo ${w.maxKp}` : ''} · clima espacial ${w.label.toLowerCase()} (${w.from} a ${w.to})`,
      source: 'NASA DONKI · en vivo',
    };
  }
  const n = live.neo;
  const c = n?.closest[0];
  if (n && c) {
    return {
      spoken: `Y un dato real de la NASA, de hoy: ${n.count === 1 ? 'un asteroide pasa' : `${n.count} asteroides pasan`} cerca de la Tierra. El más cercano, ${c.name}, mide unos ${fmt(c.diameterM ?? 0)} metros y pasa a ${c.lunar} veces la distancia a la Luna. Tranquilos: ninguno va a chocar.`,
      title: n.count === 1 ? 'Un asteroide cerca de la Tierra hoy' : `${n.count} asteroides cerca de la Tierra hoy`,
      detail: `El más cercano: ${c.name}, ~${fmt(c.diameterM ?? 0)} m, a ${fmt(c.missKm ?? 0)} km`,
      source: 'NASA NeoWs · en vivo',
    };
  }
  return {
    spoken: `Y un dato real de la NASA: el rover Curiosity midió en Marte ${String(RADIATION.surface).replace('.', ' punto ')} milisieverts de radiación al día, cientos de veces más que aquí en la Tierra. Por eso nuestra colonia necesita escudos.`,
    title: `${RADIATION.surface} mSv de radiación al día`,
    detail: 'Medido por el instrumento RAD del rover Curiosity en la superficie de Marte',
    source: 'NASA · Curiosity RAD',
  };
}

/* ------------------------------------------------------------------ */
/* Piezas visuales                                                      */
/* ------------------------------------------------------------------ */

function In({ d = 0, children, className = '', as: Tag = 'div' }: { d?: number; children: ReactNode; className?: string; as?: 'div' | 'li' | 'p' | 'h1' | 'h2' | 'figure' }) {
  return (
    <Tag className={`pt-in ${className}`} style={{ '--d': `${d}s` } as CSSProperties}>
      {children}
    </Tag>
  );
}

function Photo({ src, alt, caption, d = 0, tilt = 0, className = '' }: { src: string; alt: string; caption?: string; d?: number; tilt?: number; className?: string }) {
  return (
    <figure className={`pt-photo pt-in ${className}`} style={{ '--d': `${d}s`, '--tilt': `${tilt}deg` } as CSSProperties}>
      <img src={`pitch/${src}`} alt={alt} loading="eager" />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="pt-eyebrow pt-in">{children}</p>;
}

/* ------------------------------------------------------------------ */
/* Diapositivas                                                         */
/* ------------------------------------------------------------------ */

type Who = 'Don Rover' | 'Diego' | 'Daniel' | 'Los tres' | 'Equipo';

interface Slide {
  id: string;
  title: string;
  who: Who;
  seconds: number;
  render: (ctx: Ctx) => ReactNode;
}

interface Ctx {
  live: Live;
  fact: Fact;
  started: boolean;
  start: () => void;
  voice: ReturnType<typeof useVoice>;
}

const SLIDES: Slide[] = [
  {
    id: 'inicio',
    title: 'Don Rover',
    who: 'Don Rover',
    seconds: 40,
    render: ({ started, start, fact, voice }) => (
      <div className="pt-cover">
        <div className="pt-cover-face pt-in">
          <RoverFace expr={voice.face} mouth={voice.mouth} size={360} linked={rover.status.state === 'on'} pulse={voice.speaking ? null : started ? null : '#FFC93C'} />
        </div>
        <div className={`pt-cover-copy ${started ? 'started' : ''}`}>
          {!started && <Eyebrow>NASA Space Apps Challenge 2026 · Build a Junior Astronaut Mission Trainer</Eyebrow>}
          <In d={0.1} as="h1">
            Don Rover
          </In>
          {!started && (
            <In d={0.2} as="p" className="pt-lead">
              La ciencia deja de leerse <b>y empieza a vivirse.</b>
            </In>
          )}
          {!started ? (
            <In d={0.35}>
              <button className="pt-start" onClick={start}>
                ▶ Iniciar · Don Rover toma la palabra
              </button>
              <p className="pt-hint">Al presionar, Don Rover habla y dice un dato real de la NASA de hoy.</p>
            </In>
          ) : (
            <In d={0} className="pt-caption-box">
              <p className="pt-caption">{voice.caption || OPENING}</p>
              <div className="pt-fact">
                <span className="pt-badge live">● {fact.source}</span>
                <b>{fact.title}</b>
                <small>{fact.detail}</small>
              </div>
            </In>
          )}
        </div>
      </div>
    ),
  },
  {
    id: 'reto',
    title: 'Nuestro reto',
    who: 'Equipo',
    seconds: 50,
    render: () => (
      <div className="pt-two">
        <div>
          <Eyebrow>El reto del hackatón</Eyebrow>
          <In d={0.05} as="h2">
            NASA Space Apps Challenge 2026
          </In>
          <In d={0.15} className="pt-challenge">
            <span className="pt-badge">Reto oficial · Intermedio · Principiantes/Jóvenes</span>
            <b>“Build a Junior Astronaut Mission Trainer”</b>
            <p>
              Diseñar un juego o app interactiva donde <b>niñas y niños de 7 a 12 años</b> dirijan una base en la Luna o en Marte y tomen decisiones reales sobre <b>soporte vital</b>,{' '}
              <b>blindaje contra la radiación</b>, <b>energía</b>, <b>producción de comida</b> y <b>retraso en las comunicaciones</b>, viendo cómo cada decisión hace que la misión triunfe o
              fracase. Con <b>datos abiertos reales de la NASA</b> como DONKI y OSDR.
            </p>
            <a href={CHALLENGE_URL} target="_blank" rel="noreferrer">
              spaceappschallenge.org/2026/challenges/junior-astronaut-mission-trainer
            </a>
          </In>
        </div>
        <ul className="pt-checks">
          {[
            ['7 a 12 años', 'Tres niveles: explorador (7–9), cadete (10–12) y comandante (12–15).'],
            ['Soporte vital, blindaje, energía y comida', 'Son las 4 especialidades de cada tripulación y los 6 simuladores del Entrenador de Misión.'],
            ['Retraso en las comunicaciones', 'La misión de la señal y Don Rover lo explican: de 3 a 22 minutos entre Marte y la Tierra.'],
            ['Ninguna decisión es gratis', 'Un motor determinista cobra cada elección: energía hoy contra oxígeno o escudo mañana.'],
            ['Datos reales de la NASA', 'DONKI, OSDR y NTRS en vivo, con la fuente citada en pantalla.'],
            ['Sin descargas ni cuentas', 'Corre en el navegador: el alumno solo escanea un QR.'],
          ].map(([a, b], i) => (
            <In key={a} as="li" d={0.25 + i * 0.08}>
              <span className="pt-check">✓</span>
              <span>
                <b>{a}</b>
                <small>{b}</small>
              </span>
            </In>
          ))}
        </ul>
      </div>
    ),
  },
  {
    id: 'problema',
    title: 'El problema',
    who: 'Equipo',
    seconds: 35,
    render: () => (
      <div className="pt-center">
        <Eyebrow>El problema</Eyebrow>
        <In d={0.05} as="h2" className="pt-big">
          Saben qué es la radiación.
          <br />
          <span>Casi nunca la usan para decidir.</span>
        </In>
        <In d={0.25} as="p" className="pt-lead narrow">
          Millones de estudiantes en México y en el mundo aprenden ciencia con libros y presentaciones. El problema no es el talento ni la curiosidad: es que casi nadie les da la oportunidad de{' '}
          <b>experimentar</b> la ciencia.
        </In>
        <div className="pt-needs">
          {[
            ['⚡', 'Energía', 'var(--energy)'],
            ['💧', 'Agua y oxígeno', 'var(--water)'],
            ['🌱', 'Comida', 'var(--food)'],
            ['🛡️', 'Radiación', 'var(--habitat)'],
          ].map(([e, t, c], i) => (
            <In key={t} d={0.4 + i * 0.1} className="pt-need">
              <span style={{ '--c': c } as CSSProperties}>{e}</span>
              {t}
            </In>
          ))}
        </div>
        <In d={0.85} as="p" className="pt-q">
          Cuatro astronautas en Marte. Una mala decisión y paga la colonia entera. <b>¿Y si lo enfrentaran desde su salón?</b>
        </In>
      </div>
    ),
  },
  {
    id: 'solucion',
    title: 'La solución',
    who: 'Equipo',
    seconds: 35,
    render: () => (
      <div className="pt-two">
        <div>
          <Eyebrow>La solución</Eyebrow>
          <In d={0.05} as="h2">
            Un salón se convierte en <span className="pt-mars">una colonia en Marte</span> que hay que salvar.
          </In>
          <In d={0.2} as="p" className="pt-lead">
            Don Rover es una plataforma educativa <b>multijugador</b> con <b>inteligencia artificial</b> que convierte <b>investigaciones reales de la NASA</b> en misiones espaciales.
          </In>
          <div className="pt-pillars">
            {[
              ['🛰️', 'Datos NASA', 'Clima espacial y estudios reales'],
              ['✨', 'IA', 'Claude arma y narra la misión'],
              ['🎮', 'Simulación', 'Motor, minijuegos y planeta 3D'],
            ].map(([e, t, s], i) => (
              <In key={t} d={0.35 + i * 0.12} className="pt-pillar">
                <span>{e}</span>
                <b>{t}</b>
                <small>{s}</small>
              </In>
            ))}
          </div>
        </div>
        <div className="pt-rover-stage pt-in" style={{ '--d': '0.2s' } as CSSProperties}>
          <DonRover size={420} animate turntable />
        </div>
      </div>
    ),
  },
  {
    id: 'ninos',
    title: 'Lo probamos con niños',
    who: 'Equipo',
    seconds: 40,
    render: () => (
      <div className="pt-kids">
        <div className="pt-kids-copy">
          <Eyebrow>Lo probamos con niños</Eyebrow>
          <In d={0.05} as="h2">
            No nos quedamos en la teoría.
          </In>
          <In d={0.15} as="p" className="pt-lead">
            Nos escapamos del hackatón unas horas para probar Don Rover con niñas y niños de nuestra comunidad. Jugaron <b>desde sus propios celulares</b>: crearon su astronauta, exploraron la
            colonia en 3D y resolvieron minijuegos en equipo.
          </In>
          <In d={0.3} as="p" className="pt-note">
            Fotos reales de la prueba · recortadas para proteger la identidad de los menores
          </In>
        </div>
        <div className="pt-collage">
          <Photo src="celular-mundo-3d.webp" alt="Un niño juega en su celular el mundo 3D de Don Rover" caption="Su astronauta en la estación 3D" d={0.2} tilt={-4} />
          <Photo src="celular-minijuego.webp" alt="Minijuego de conectar cables en el celular" caption="Minijuego: conectar cables" d={0.35} tilt={3} />
          <Photo src="celular-astronauta.webp" alt="Celular con el astronauta en Marte" caption="Explorando Marte" d={0.5} tilt={-2} />
          <Photo src="celular-prueba.webp" alt="Un niño muestra su astronauta en el celular" caption="¡Listo para la misión!" d={0.65} tilt={4} />
        </div>
      </div>
    ),
  },
  {
    id: 'como',
    title: 'Cómo funciona',
    who: 'Diego',
    seconds: 75,
    render: () => (
      <div className="pt-how">
        <div className="pt-how-top">
          <div>
            <Eyebrow>Cómo funciona, en vivo</Eyebrow>
            <In d={0.05} as="h2">
              Nadie puede salvar la colonia solo.
            </In>
          </div>
          <Photo src="proyector-4-astronautas.webp" alt="Consola del profesor en una pantalla con 4 astronautas a bordo" caption="La consola del profe: 4 astronautas a bordo" d={0.15} className="pt-how-photo" />
        </div>
        <ol className="pt-flow">
          {[
            ['🖥️', 'El profe crea la sala', 'Código y QR. Sin instalar nada ni cuentas.'],
            ['📱', 'Entran 4 alumnos', 'Desde su celular. Cada uno recibe una especialidad: energía, soporte vital, astrobiología o hábitat.'],
            ['🛰️', 'IX arma la misión', 'Consulta el clima espacial real y estudios de la NASA, y Claude escribe la historia con una tarea para cada quien.'],
            ['🔐', 'Un dato secreto', 'Cada celular ve solo su dato. Los números cambian con cada tripulación: copiar no sirve.'],
            ['🗳️', 'Deciden juntos', 'Comparan, votan y escriben su bitácora. La emergencia se resuelve con minijuegos.'],
            ['🪐', 'Consecuencias', 'El planeta 3D cambia y se guarda para la siguiente clase.'],
          ].map(([e, t, s], i) => (
            <In key={t} as="li" d={0.25 + i * 0.12}>
              <span className="pt-step">{i + 1}</span>
              <span className="pt-step-e">{e}</span>
              <b>{t}</b>
              <small>{s}</small>
            </In>
          ))}
        </ol>
      </div>
    ),
  },
  {
    id: 'nasa',
    title: 'Datos reales de la NASA',
    who: 'Daniel',
    seconds: 60,
    render: ({ live }) => {
      const w = live.weather;
      const c = live.neo?.closest[0];
      return (
        <div className="pt-nasa">
          <div className="pt-nasa-head">
            <Eyebrow>Datos reales de la NASA</Eyebrow>
            <In d={0.05} as="h2">
              Lo que pasa hoy en el Sol, <span className="pt-mars">pasa en la colonia.</span>
            </In>
          </div>
          <div className="pt-apis">
            {[
              ['DONKI', 'Clima espacial', 'Llamaradas, eyecciones de masa coronal, tormentas geomagnéticas y partículas solares de los últimos 14 días → nivel de riesgo 0 a 3. Si el Sol está activo, la emergencia es más difícil y el escudo se daña.', '#FFC93C'],
              ['NTRS', 'Reportes técnicos', 'Estudios de ingeniería de la NASA sobre el tema de cada misión: la base científica de la historia.', '#7FDBFF'],
              ['OSDR', 'Biología espacial', 'Investigación de ciencias de la vida en el espacio: radiación, hueso, músculo, defensas y sueño afectan a la tripulación.', '#55DB7A'],
              ['NeoWs · APOD', 'Don Rover en vivo', 'Asteroides que pasan cerca hoy y la foto astronómica del día, para responder preguntas con datos frescos.', '#C3ADFF'],
            ].map(([k, t, s, col], i) => (
              <In key={k} d={0.15 + i * 0.1} className="pt-api">
                <span className="pt-api-k" style={{ '--c': col } as CSSProperties}>
                  {k}
                </span>
                <b>{t}</b>
                <small>{s}</small>
              </In>
            ))}
          </div>
          <In d={0.6} className="pt-live">
            <span className="pt-badge live">● En vivo ahora</span>
            {w ? (
              <span>
                ☀️ Clima espacial <b>{w.label}</b> · <b>{w.cmes}</b> eyecciones de masa coronal (la más rápida, {fmt(w.fastestCme)} km/s)
                {w.maxKp > 0 ? ` · Kp máx. ${w.maxKp}` : ''}
                {w.flares > 0 ? ` · ${w.flares} llamaradas` : ''}
              </span>
            ) : (
              <span>{live.loaded ? 'Sin conexión con la NASA: el juego sigue con sus datos guardados.' : 'Consultando a la NASA…'}</span>
            )}
            {live.neo && c && (
              <span>
                ☄️ <b>{live.neo.count}</b> {live.neo.count === 1 ? 'asteroide pasa' : 'asteroides pasan'} cerca hoy · el más cercano: {c.name}
              </span>
            )}
            {live.apod?.title && (
              <span className="pt-apod">
                {live.apod.url && /\.(jpe?g|png|gif|webp)$/i.test(live.apod.url) && <img src={live.apod.url} alt="" />}
                📸 Foto del día: <b>{live.apod.title}</b>
              </span>
            )}
          </In>
        </div>
      );
    },
  },
  {
    id: 'ia',
    title: 'La IA narra, el motor decide',
    who: 'Daniel',
    seconds: 55,
    render: () => (
      <div className="pt-ai">
        <Eyebrow>Qué hay debajo</Eyebrow>
        <In d={0.05} as="h2" className="pt-big">
          La IA narra. <span>El motor decide.</span>
        </In>
        <div className="pt-pipe">
          {[
            ['🛰️', 'NASA', 'DONKI · NTRS · OSDR'],
            ['✨', 'Claude Opus 5.5', 'Salidas estructuradas (JSON Schema) validadas antes de usarse'],
            ['⚙️', 'Motor determinista', 'Puntajes y consecuencias con una semilla por tripulación'],
            ['🪐', 'Planeta 3D', 'Persistente entre clases'],
          ].map(([e, t, s], i) => (
            <In key={t} d={0.2 + i * 0.15} className="pt-pipe-step">
              <span>{e}</span>
              <b>{t}</b>
              <small>{s}</small>
            </In>
          ))}
        </div>
        <In d={0.8} className="pt-actions">
          <b>Acciones que la IA ejecuta en la plataforma</b>
          <ul>
            <li>🎯 Elige la misión según el clima espacial y reparte una tarea a cada especialidad</li>
            <li>📖 Escribe la historia a partir de un estudio real y lo resume para niños</li>
            <li>⭐ Evalúa las bitácoras de cada tripulación (de 1 a 3 estrellas)</li>
            <li>🧭 Elige el siguiente reto del Entrenador y da retroalimentación</li>
            <li>🤖 Mueve a Don Rover: su voz, su cara y la pantalla de la placa</li>
            <li>🎓 Escribe el debrief con lo aprendido</li>
          </ul>
          <small>Sin internet o sin IA, la clase no se detiene: el motor y las plantillas siguen funcionando.</small>
        </In>
      </div>
    ),
  },
  {
    id: 'rover',
    title: 'Don Rover sale de la pantalla',
    who: 'Los tres',
    seconds: 60,
    render: ({ voice }) => <RoverDemo voice={voice} />,
  },
  {
    id: 'compilar',
    title: 'Se instala desde el navegador',
    who: 'Los tres',
    seconds: 35,
    render: () => (
      <div className="pt-two">
        <div>
          <Eyebrow>Hardware abierto</Eyebrow>
          <In d={0.05} as="h2">
            El firmware de Don Rover se instala <span className="pt-mars">directo desde el navegador.</span>
          </In>
          <ol className="pt-mini-steps">
            {[
              ['🔌', 'Conecta la placa ESP32 (KNOMI) por USB'],
              ['🌐', 'Abre Don Rover → Don Rover físico en Chrome o Edge'],
              ['⬇️', 'Presiona «Instalar en la placa»: Web Serial + esptool-js la programan en menos de un minuto'],
              ['🤖', 'Don Rover despierta y se conecta por USB, Wi-Fi o la nube'],
            ].map(([e, t], i) => (
              <In key={t} as="li" d={0.2 + i * 0.12}>
                <span>{e}</span>
                {t}
              </In>
            ))}
          </ol>
          <In d={0.7} as="p" className="pt-note">
            Código del firmware en <code>firmware/donrover-knomi</code> (PlatformIO + Arduino). También se compila con <code>pio run -t upload</code>.
          </In>
        </div>
        <In d={0.25} className="pt-code">
          <div className="pt-code-bar">
            <i />
            <i />
            <i />
            <span>protocolo · una línea JSON por mensaje</span>
          </div>
          <pre>{`// Plataforma → Don Rover
{"t":"face","e":"wow","ms":3000}
{"t":"talk","on":1}   {"t":"m","v":70}
{"t":"card","title":"EZZX",
  "sub":"Codigo para unirse"}
{"t":"ring","p":350,"c":"#FFC93C"}

// Don Rover → plataforma
{"t":"hi","fw":"1.0.0","board":"knomi1"}
{"t":"btn","k":"long"}  // ¡pregunta!`}</pre>
        </In>
      </div>
    ),
  },
  {
    id: 'tecnico',
    title: 'Arquitectura',
    who: 'Daniel',
    seconds: 50,
    render: () => (
      <div className="pt-arch">
        <Eyebrow>Por dentro</Eyebrow>
        <In d={0.05} as="h2">
          El proyector es el servidor.
        </In>
        <div className="pt-arch-grid">
          <In d={0.15} className="pt-node phones">
            <b>📱 Celulares</b>
            <small>PWA · sin cuentas · vista filtrada: cada quien ve solo su dato</small>
          </In>
          <In d={0.25} className="pt-link">
            <span>WebRTC directo (PeerJS)</span>
            <span className="alt">respaldo: Supabase Realtime</span>
          </In>
          <In d={0.35} className="pt-node host">
            <b>🖥️ Proyector del profe</b>
            <small>React 19 + TypeScript · motor determinista · Three.js</small>
          </In>
          <In d={0.45} className="pt-link">
            <span>USB (Web Serial) · Wi-Fi · nube</span>
          </In>
          <In d={0.55} className="pt-node board">
            <b>🤖 Don Rover físico</b>
            <small>ESP32 + pantalla redonda GC9A01</small>
          </In>
        </div>
        <div className="pt-cloud">
          {[
            ['/api/ai', 'Claude Opus 5.5 · la clave nunca llega al navegador'],
            ['/api/nasa', 'DONKI · NTRS · OSDR · NeoWs · APOD con caché'],
            ['/api/colonies', 'Supabase Postgres con RLS · colonia persistente'],
            ['/api/realtime', 'Canal de respaldo para redes escolares'],
          ].map(([k, s], i) => (
            <In key={k} d={0.65 + i * 0.08} className="pt-fn">
              <code>{k}</code>
              <small>{s}</small>
            </In>
          ))}
        </div>
        <In d={1} as="p" className="pt-note center">
          Funciones de Vercel opcionales: sin ellas, el juego corre completo en el navegador. Privacidad: sin cuentas ni datos personales.
        </In>
      </div>
    ),
  },
  {
    id: 'planeta',
    title: 'Resultados en el planeta 3D',
    who: 'Diego',
    seconds: 35,
    render: () => (
      <div className="pt-two">
        <div>
          <Eyebrow>Resultado</Eyebrow>
          <In d={0.05} as="h2">
            Cada decisión <span className="pt-mars">cambia un planeta</span> que se guarda de una clase a otra.
          </In>
          <In d={0.2} as="p" className="pt-lead">
            Bitácoras evaluadas, puntaje calculado por el motor y una colonia que crece o sufre con lo que decidió el grupo. La siguiente clase continúa donde se quedó.
          </In>
        </div>
        <div className="pt-stack">
          <Photo src="planeta-colonia.webp" alt="Colonia en 3D sobre el planeta Marte" caption="La colonia MARS-01 en 3D" d={0.15} tilt={-3} />
          <Photo src="colonia-3d.webp" alt="Módulos de la colonia en el planeta 3D" caption="Módulos, rutas y astronautas en vivo" d={0.35} tilt={3} />
        </div>
      </div>
    ),
  },
  {
    id: 'abierto',
    title: 'Código abierto',
    who: 'Equipo',
    seconds: 15,
    render: () => (
      <div className="pt-open">
        <div>
          <Eyebrow>Código abierto</Eyebrow>
          <In d={0.05} as="h2">
            Todo el código es público.
          </In>
          <In d={0.15} as="p" className="pt-lead">
            Plataforma, IA, motor, mundo 3D y el firmware de Don Rover, listos para que cualquier escuela lo use, lo estudie o lo mejore.
          </In>
          <In d={0.25}>
            <a className="pt-repo" href={REPO} target="_blank" rel="noreferrer">
              github.com/deimosvn/Taller-de-Don-Rover
            </a>
          </In>
          <In d={0.3}>
            <a className="pt-repo app" href={APP} target="_blank" rel="noreferrer">
              tallerdedonrover.vercel.app
            </a>
          </In>
        </div>
        <div className="pt-qrs">
          <In d={0.2} className="pt-qr">
            <QR value={REPO} size={230} />
            <small>Repositorio</small>
          </In>
          <In d={0.3} className="pt-qr">
            <QR value={APP} size={230} />
            <small>Pruébalo</small>
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
    render: ({ voice }) => (
      <div className="pt-cover end">
        <div className="pt-cover-face pt-in">
          <RoverFace expr={voice.speaking ? voice.face : 'star'} mouth={voice.mouth} size={300} linked={rover.status.state === 'on'} />
        </div>
        <div className="pt-cover-copy">
          <In d={0.05} as="p" className="pt-lead">
            Los descubrimientos de la NASA no deberían quedarse en los laboratorios. También deben llegar a <b>las aulas y a los hogares.</b>
          </In>
          <In d={0.2} as="h1">
            La ciencia deja de leerse <span className="pt-mars">y empieza a vivirse.</span>
          </In>
          <In d={0.35}>
            <button className="pt-start small" onClick={() => void say(CLOSING, { face: 'star' })}>
              🤖 Don Rover se despide
            </button>
          </In>
          <In d={0.45} as="p" className="pt-note">
            Don Rover · NASA Space Apps Challenge 2026 · {REPO.replace('https://', '')}
          </In>
        </div>
      </div>
    ),
  },
];

/** Demo en vivo: el público le pregunta a Don Rover (Claude + datos reales de la NASA). */
function RoverDemo({ voice }: { voice: ReturnType<typeof useVoice> }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<{ q: string; a: Answer } | null>(null);
  const suggestions = ['¿Por qué la radiación es peligrosa para el hábitat?', '¿Cómo está el clima espacial hoy?', '¿Qué asteroides pasan cerca hoy?'];
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
        <Eyebrow>Don Rover sale de la pantalla</Eyebrow>
        <In d={0.05} as="h2">
          Un asistente de IA <span className="pt-mars">físico</span> que entiende la misión.
        </In>
        <ul className="pt-roles">
          {[
            ['🎙️', 'Narra la misión', 'cada fase, emergencia y resultado, en voz alta'],
            ['💡', 'Da pistas', 'sin regalar la respuesta del reto'],
            ['🧠', 'Explica conceptos', 'al nivel de explorador, cadete o comandante'],
            ['🛰️', 'Dice datos reales de la NASA', 'clima espacial, asteroides, foto del día y estudios'],
          ].map(([e, t, s], i) => (
            <In key={t} as="li" d={0.15 + i * 0.1}>
              <span>{e}</span>
              <b>{t}</b>
              <small>{s}</small>
            </In>
          ))}
        </ul>
        <In d={0.6} as="p" className="pt-note">
          Conoce la historia, la especialidad de cada alumno, el clima espacial del día y en qué punto va la tripulación. Su cara, su boca y su pantalla se mueven en la placa ESP32.
        </In>
      </div>
      <In d={0.2} className="pt-demo">
        <div className="pt-demo-face">
          <RoverFace expr={voice.face} mouth={voice.mouth} size={150} linked={rover.status.state === 'on'} pulse={busy ? '#FFC93C' : null} />
          <span className={`pt-badge ${rover.status.state === 'on' ? 'live' : ''}`}>{rover.status.state === 'on' ? '● Placa conectada' : 'Demo en pantalla'}</span>
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
            <p className="pt-demo-empty">{busy ? 'Consultando a la NASA…' : 'Pregúntale algo a Don Rover en vivo 👇'}</p>
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
  const liveRef = useRef(live);
  liveRef.current = live;

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
    if (!liveRef.current.loaded) await new Promise((r) => setTimeout(r, 2500));
    const fact = nasaFact(liveRef.current);
    await say(`${OPENING} ${fact.spoken}`, { face: 'happy' });
  }, []);

  const slide = SLIDES[index];
  const fact = nasaFact(live);
  const elapsed = startedAt ? (now - startedAt) / 1000 : 0;
  const planned = SLIDES.slice(0, index).reduce((a, s) => a + s.seconds, 0);
  const drift = startedAt ? elapsed - planned : 0;
  const pace = !startedAt ? '' : drift > 20 ? 'late' : drift < -25 ? 'early' : 'ok';

  return (
    <div className={`pitch ${chrome ? '' : 'clean'}`}>
      <div className="pt-stars" aria-hidden="true" />
      <div className="pt-glow" aria-hidden="true" />
      <div className="pt-stage" style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})` }}>
        <section key={slide.id} className={`pt-slide pt-s-${slide.id}`} aria-roledescription="diapositiva" aria-label={`${index + 1} de ${SLIDES.length}: ${slide.title}`}>
          {slide.render({ live, fact, started: startedAt !== null, start: () => void start(), voice })}
        </section>
        <footer className="pt-foot">
          <span className="pt-brand">
            <RoverFace expr={voice.face} mouth={voice.mouth} size={34} linked={rover.status.state === 'on'} />
            Don Rover
          </span>
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
