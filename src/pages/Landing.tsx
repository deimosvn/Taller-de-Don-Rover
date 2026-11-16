// Portada del Taller de Don Rover: explica en un vistazo qué es, cómo se juega, qué aprenden
// los alumnos y quién es Don Rover, con el planeta, los astronautas y la cara de Don Rover de
// verdad (los mismos del juego). Todo aparece al hacer scroll y se queda quieto para quien pide
// menos movimiento en su sistema.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CLASS_PLAN, DIFFICULTIES, MISSIONS, MISSION_ORDER, ROLES, ROLE_ORDER, SYSTEMS, SYSTEM_ORDER } from '../../shared/content';
import { FACTS, HUMAN, RADIATION } from '../../shared/marsSim';
import type { MissionId } from '../../shared/types';
import { Astronaut, DonRover, IXOrb, MissionPatch } from '../components/art';
import { Logo } from '../components/ui';
import { useInstall } from '../lib/pwa';
import { DEMO_SNAPSHOT } from '../world/colony/snapshot';
import { MISSION_ZONE, ROLE_AVATARS } from '../world/react/missionZones';
import { PlanetView } from '../world/react/PlanetView';
import { LaptopFrame, PhoneFrame, SampleQR, SystemsLoop } from './landing/art';
import { CountUp, Reveal, scrollToId, useInView, useScrollFx } from './landing/motion';
import { RoverDemo } from './landing/RoverDemo';

const NAV: { id: string; label: string }[] = [
  { id: 'como', label: 'Cómo se juega' },
  { id: 'aprenden', label: 'Qué aprenden' },
  { id: 'donrover', label: 'Don Rover' },
  { id: 'misiones', label: 'Misiones' },
  { id: 'preguntas', label: 'Para profes' },
];

const HERO_METERS = [78, 64, 85, 71];

function Head({ kicker, title, children, center = false }: { kicker: string; title: ReactNode; children?: ReactNode; center?: boolean }) {
  return (
    <Reveal as="header" className={`lp-head ${center ? 'is-center' : ''}`}>
      <p className="lp-kicker">{kicker}</p>
      <h2>{title}</h2>
      {children && <p className="lp-lead">{children}</p>}
    </Reveal>
  );
}

/* ================================================================== */
/* Barra de arriba                                                      */
/* ================================================================== */

function TopBar({ scrolled }: { scrolled: boolean }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('');

  // Resalta la sección que se está leyendo.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        // La portada no tiene botón propio: al volver arriba ya no se marca ninguna sección.
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id === 'inicio' ? '' : e.target.id);
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    for (const id of ['inicio', ...NAV.map((n) => n.id)]) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const go = (id: string) => {
    setOpen(false);
    scrollToId(id);
  };

  return (
    <header className={`lp-bar ${scrolled ? 'is-scrolled' : ''} ${open ? 'is-open' : ''}`}>
      <div className="lp-bar-in">
        <button type="button" className="lp-bar-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Taller de Don Rover: ir al inicio">
          <Logo size="sm" sub={false} />
        </button>
        <nav className="lp-bar-nav" aria-label="Secciones">
          {NAV.map((n) => (
            <button key={n.id} type="button" className={active === n.id ? 'is-on' : ''} aria-current={active === n.id ? 'true' : undefined} onClick={() => go(n.id)}>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="lp-bar-cta">
          <a className="lp-btn is-ghost is-small" href="#/jugar">
            Tengo código
          </a>
          <a className="lp-btn is-primary is-small" href="#/profe">
            Crear misión
          </a>
          <button type="button" className="lp-burger" aria-expanded={open} aria-controls="lp-menu" aria-label={open ? 'Cerrar menú' : 'Abrir menú'} onClick={() => setOpen((v) => !v)}>
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>
      <div id="lp-menu" className="lp-menu" hidden={!open}>
        {NAV.map((n) => (
          <button key={n.id} type="button" onClick={() => go(n.id)}>
            {n.label}
          </button>
        ))}
        <div className="lp-menu-cta">
          <a className="lp-btn is-primary" href="#/profe">
            🚀 Crear misión
          </a>
          <a className="lp-btn is-ghost" href="#/jugar">
            🧑‍🚀 Tengo código
          </a>
        </div>
      </div>
      <span className="lp-progress" aria-hidden="true" />
    </header>
  );
}

/* ================================================================== */
/* Portada                                                              */
/* ================================================================== */

function Hero() {
  const coarse = useMemo(() => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true, []);
  return (
    <section className="lp-hero" id="inicio" aria-labelledby="lp-title">
      <div className="lp-hero-bg" aria-hidden="true">
        <span className="lp-blob is-a" />
        <span className="lp-blob is-b" />
        <span className="lp-blob is-c" />
        <span className="lp-dust" />
      </div>

      <div className="lp-hero-in">
        <div className="lp-hero-copy">
          <Reveal variant="fade">
            <p className="lp-award">
              <span aria-hidden="true">🥈</span>
              <span>
                2.º lugar en NASA Space Apps · etapa local · <b>pase al global</b>
              </span>
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h1 id="lp-title">
              Aprende ciencia <span className="lp-mark">salvando una colonia en Marte</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="lp-hero-lead">
              Una aventura en equipo para niñas y niños de <b>7 a 15 años</b>. Cada quien juega desde su celular con una especialidad y un dato secreto. <b>IX</b> arma la
              misión con <b>datos reales de la NASA</b> y <b>Don Rover</b> la narra en voz alta.
            </p>
          </Reveal>
          <Reveal delay={240} className="lp-hero-ctas">
            <a className="lp-btn is-primary is-big" href="#/profe">
              <span aria-hidden="true">🚀</span> Soy profe: crear misión
            </a>
            <a className="lp-btn is-ghost is-big" href="#/jugar">
              <span aria-hidden="true">🧑‍🚀</span> Soy alumno: tengo código
            </a>
          </Reveal>
          <Reveal delay={320} className="lp-hero-more">
            <a href="#/libre">
              <span aria-hidden="true">🎮</span> Jugar sin código <span aria-hidden="true">→</span>
            </a>
            <a href="#/entrenador">
              <span aria-hidden="true">🎓</span> Entrenador con IA <span aria-hidden="true">→</span>
            </a>
          </Reveal>
          <Reveal delay={400} as="ul" className="lp-trust">
            <li>Sin instalar nada</li>
            <li>Funciona en el celular</li>
            <li>En español</li>
            <li>Sin cuentas</li>
          </Reveal>
        </div>

        <Reveal variant="scale" delay={120} className="lp-hero-art">
          <div className="lp-orbits" aria-hidden="true">
            <span />
            <span />
          </div>
          <div className={`lp-porthole ${coarse ? 'is-static' : ''}`}>
            <PlanetView snapshot={DEMO_SNAPSHOT} distance={190} interactive={!coarse} />
          </div>
          <div className="lp-float-meters" aria-hidden="true">
            {SYSTEM_ORDER.map((s, i) => (
              <span key={s} className={`lp-fm is-${i}`} style={{ '--c': SYSTEMS[s].color } as CSSProperties}>
                <i>{SYSTEMS[s].emoji}</i>
                <span>
                  <small>{SYSTEMS[s].short}</small>
                  <b>{HERO_METERS[i]}%</b>
                </span>
              </span>
            ))}
          </div>
          <div className="lp-hero-astro is-left" aria-hidden="true">
            <Astronaut avatar={ROLE_AVATARS.power} role="power" size={112} pose="wave" />
          </div>
          <div className="lp-hero-astro is-right" aria-hidden="true">
            <Astronaut avatar={ROLE_AVATARS.bio} role="bio" size={104} pose="cheer" />
          </div>
          {!coarse && <p className="lp-hero-hint">🖐️ Arrastra el planeta para girarlo</p>}
        </Reveal>
      </div>

      <button type="button" className="lp-scroll-cue" onClick={() => scrollToId('como')} aria-label="Bajar a cómo se juega">
        <span />
      </button>
    </section>
  );
}

function Stats() {
  const items: { n: number; label: string; sub: string }[] = [
    { n: 4, label: 'especialidades', sub: 'una para cada alumno' },
    { n: 6, label: 'misiones', sub: 'con datos de la NASA' },
    { n: 40, label: 'minutos', sub: 'una clase completa' },
    { n: 3, label: 'niveles', sub: 'de 7 a 15 años' },
  ];
  return (
    <div className="lp-stats">
      {items.map((s, i) => (
        <Reveal key={s.label} delay={i * 90} className="lp-stat">
          <b>
            <CountUp to={s.n} ms={1100 + i * 150} />
          </b>
          <span>{s.label}</span>
          <small>{s.sub}</small>
        </Reveal>
      ))}
    </div>
  );
}

/* ================================================================== */
/* Cómo se juega                                                        */
/* ================================================================== */

function StepScreen() {
  return (
    <div className="lp-mock lp-mock-screen" aria-hidden="true">
      <div className="lp-mock-top">
        <i />
        <i />
        <i />
        <span>Únete a la misión</span>
      </div>
      <div className="lp-mock-body">
        <span className="lp-qr-wrap">
          <SampleQR size={104} />
        </span>
        <div className="lp-mock-code">
          {['M', 'A', 'R', 'S'].map((c, i) => (
            <span key={c} style={{ '--c': SYSTEMS[SYSTEM_ORDER[i]].color } as CSSProperties}>
              {c}
            </span>
          ))}
          <small>3 de 4 astronautas a bordo</small>
        </div>
      </div>
    </div>
  );
}

function StepPhone() {
  return (
    <PhoneFrame className="lp-mock-phone">
      <div className="lp-mini-role" aria-hidden="true">
        <span className="lp-mini-pill">⚡ Energía</span>
        <Astronaut avatar={ROLE_AVATARS.power} role="power" size={64} pose="still" />
        <p className="lp-mini-task">Tu estación: paneles solares</p>
        <p className="lp-mini-secret">🔒 Dato secreto desbloqueado</p>
      </div>
    </PhoneFrame>
  );
}

function StepColony() {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={`lp-mock lp-mock-colony ${seen ? 'is-in' : ''}`} aria-hidden="true">
      <div className="lp-mock-votes">
        {ROLE_ORDER.map((r) => (
          <span key={r} style={{ '--c': ROLES[r].color } as CSSProperties}>
            {ROLES[r].emoji}
          </span>
        ))}
        <small>4 de 4 votaron ✓</small>
      </div>
      {SYSTEM_ORDER.map((s, i) => (
        <div key={s} className="lp-mock-meter" style={{ '--c': SYSTEMS[s].color, '--v': `${[82, 74, 88, 79][i]}%`, '--i': i } as CSSProperties}>
          <span>
            {SYSTEMS[s].emoji} {SYSTEMS[s].short}
          </span>
          <i />
        </div>
      ))}
      <p className="lp-mock-win">🎉 ¡La colonia sobrevivió!</p>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: '1',
      title: 'El profe abre la misión',
      text: 'Elige la edad y el tiempo, y proyecta el QR. Hasta 4 alumnos entran con su celular; si falta alguien, un bot de práctica ocupa su lugar.',
      art: <StepScreen />,
    },
    {
      n: '2',
      title: 'Cada quien recibe su especialidad',
      text: 'Energía, soporte vital, comida o hábitat. Cada especialidad tiene una tarea en el Marte 3D y un dato secreto que nadie más tiene.',
      art: <StepPhone />,
    },
    {
      n: '3',
      title: 'Deciden juntos y la colonia cambia',
      text: 'Comparten sus datos, votan y enfrentan una emergencia con minijuegos. El juego calcula qué pasa con la energía, el agua, la comida y el refugio.',
      art: <StepColony />,
    },
  ];
  return (
    <section className="lp-sec lp-how" id="como" aria-labelledby="lp-how-t">
      <Head kicker="Cómo se juega" title={<span id="lp-how-t">Una misión en 3 pasos</span>} center>
        El profe dirige la misión desde el proyector y cada alumno juega desde su celular. No hace falta crear cuentas ni instalar nada.
      </Head>
      <ol className="lp-steps">
        {steps.map((s, i) => (
          <Reveal as="li" key={s.n} delay={i * 140} className="lp-step">
            <div className="lp-step-art">{s.art}</div>
            <span className="lp-step-n" aria-hidden="true">
              {s.n}
            </span>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
          </Reveal>
        ))}
      </ol>
      <Reveal className="lp-how-note" delay={200}>
        <IXOrb size={56} mood="talk" />
        <p>
          <b>Mientras juegan,</b> IX da pistas si la tripulación se atora y Don Rover narra cada fase en voz alta.{' '}
          <button type="button" className="lp-link" onClick={() => scrollToId('donrover')}>
            Conoce a Don Rover →
          </button>
        </p>
      </Reveal>
    </section>
  );
}

/* ================================================================== */
/* Profes y alumnos                                                     */
/* ================================================================== */

const WHO = {
  profe: {
    tab: '👩‍🏫 Soy profe',
    title: 'Tú diriges la misión desde el proyector',
    steps: [
      ['🧭', 'Abre «Crear misión» en la computadora del salón y elige la edad (7–9, 10–12 o 12–15 años) y el tiempo (40 o 10 minutos).'],
      ['📱', 'Proyecta el QR. Los alumnos entran con su celular escaneándolo o con el código de 4 letras.'],
      ['🛰️', 'Presiona «Generar la misión»: IX revisa el clima espacial real de la NASA y el estado de la colonia, y escribe la misión.'],
      ['⏯️', 'Avanza las fases con un solo botón. Pausa, da +30 segundos o pide una pista de IX cuando se atoren.'],
      ['📊', 'Al final, el debrief resume lo aprendido. Descarga el reporte: la colonia se guarda para la próxima clase.'],
    ],
    shot: { kind: 'laptop' as const, src: 'landing/consola.webp', alt: 'Consola del profe en el briefing de la misión The Final Colony, con el planeta, el estado de la colonia y la tripulación' },
  },
  alumno: {
    tab: '🧑‍🚀 Soy alumno',
    title: 'Tú eres parte de la tripulación',
    steps: [
      ['📷', 'Escanea el QR del proyector o escribe el código de 4 letras en tu celular.'],
      ['🧑‍🚀', 'Escribe tu nombre y arma tu astronauta: traje, casco, visor y un accesorio.'],
      ['🗺️', 'Recibe tu especialidad y camina a tu estación en el Marte 3D con el joystick.'],
      ['🔓', 'Resuelve tu tarea y descubre tu dato secreto. ¡Nadie más lo tiene!'],
      ['🗳️', 'Compártelo con tu tripulación, voten y salven la colonia en la emergencia. Ganas XP e insignias.'],
    ],
    shot: { kind: 'phone' as const, src: 'landing/celular.webp', alt: 'Celular con un astronauta en el Marte 3D, el joystick y los botones' },
  },
};

function ForWhom() {
  const [who, setWho] = useState<'profe' | 'alumno'>('profe');
  const w = WHO[who];
  return (
    <section className="lp-sec lp-who" id="quien" aria-labelledby="lp-who-t">
      <Head kicker="Para profes y alumnos" title={<span id="lp-who-t">¿Qué hace cada quien?</span>} center />
      <Reveal className="lp-switch-wrap">
        <div className="lp-switch" role="tablist" aria-label="Elige tu papel" style={{ '--x': who === 'profe' ? 0 : 1 } as CSSProperties}>
          <span className="lp-switch-thumb" aria-hidden="true" />
          {(Object.keys(WHO) as ('profe' | 'alumno')[]).map((k) => (
            <button key={k} type="button" role="tab" id={`lp-tab-${k}`} aria-selected={who === k} aria-controls="lp-who-panel" className={who === k ? 'is-on' : ''} onClick={() => setWho(k)}>
              {WHO[k].tab}
            </button>
          ))}
        </div>
      </Reveal>
      <Reveal>
      <div key={who} id="lp-who-panel" role="tabpanel" aria-labelledby={`lp-tab-${who}`} className="lp-who-panel">
        <div className="lp-who-text">
          <h3>{w.title}</h3>
          <ol className="lp-who-steps">
            {w.steps.map(([icon, text], i) => (
              <li key={text} style={{ '--i': i } as CSSProperties}>
                <span className="lp-who-icon" aria-hidden="true">
                  {icon}
                </span>
                <p>{text}</p>
              </li>
            ))}
          </ol>
          <a className="lp-btn is-primary" href={who === 'profe' ? '#/profe' : '#/jugar'}>
            {who === 'profe' ? '🚀 Crear mi primera misión' : '🧑‍🚀 Entrar con mi código'}
          </a>
        </div>
        <div className="lp-who-shot">{w.shot.kind === 'laptop' ? <LaptopFrame src={w.shot.src} alt={w.shot.alt} /> : <PhoneFrame src={w.shot.src} alt={w.shot.alt} />}</div>
      </div>
      </Reveal>
    </section>
  );
}

/* ================================================================== */
/* Qué aprenden                                                         */
/* ================================================================== */

const LEARN: { icon: string; title: string; text: string; ex: string; c: string }[] = [
  {
    icon: '🔬',
    title: 'Ciencia de Marte',
    text: 'Radiación, gravedad, atmósfera, agua y fotosíntesis, con datos que midieron rovers y sondas de la NASA.',
    ex: `El rover Curiosity midió ${RADIATION.surface} milisieverts de radiación al día en Marte.`,
    c: '#FF6B5B',
  },
  {
    icon: '➗',
    title: 'Matemáticas con datos reales',
    text: 'Comparar, sumar, multiplicar por sols y sacar porcentajes, con unidades de verdad.',
    ex: `Si cada astronauta respira ${HUMAN.o2} kg de oxígeno al día, ¿cuánto necesitan 4 en 10 sols?`,
    c: '#FFC93C',
  },
  {
    icon: '🔄',
    title: 'Pensamiento sistémico',
    text: 'La energía mueve el agua, el agua riega la comida y la comida mantiene fuerte a la tripulación.',
    ex: 'Apagar los paneles para ahorrar puede dejar sin agua al invernadero.',
    c: '#3CC8FF',
  },
  {
    icon: '🤝',
    title: 'Colaborar y comunicar',
    text: 'Cada especialidad tiene un dato secreto: solo compartiéndolo encuentran la mejor decisión.',
    ex: 'Energía sabe cuánta luz habrá; Astrobiología sabe qué cultivo la aguanta.',
    c: '#55DB7A',
  },
  {
    icon: '🧭',
    title: 'Decidir con consecuencias',
    text: 'Votan, ven qué pasa sol por sol y entienden por qué funcionó o por qué falló.',
    ex: '«Apagón en el sol 5: las baterías se vaciaron durante la tormenta.»',
    c: '#B69CFF',
  },
  {
    icon: '🛰️',
    title: 'Leer ciencia de verdad',
    text: 'Cada misión parte de un estudio real de la NASA, resumido para su edad, con su enlace original.',
    ex: 'Estudios de las bibliotecas NTRS y OSDR de la NASA.',
    c: '#F08A57',
  },
];

function Learn() {
  return (
    <section className="lp-sec lp-learn" id="aprenden" aria-labelledby="lp-learn-t">
      <Head kicker="Qué aprenden" title={<span id="lp-learn-t">Ciencia de verdad, aprendida en equipo</span>} center>
        Cada misión trabaja ciencias y matemáticas, y habilidades para la vida: colaborar, comunicar y decidir con datos.
      </Head>
      <div className="lp-learn-grid">
        {LEARN.map((l, i) => (
          <Reveal as="article" key={l.title} delay={(i % 3) * 110} className="lp-learn-card" style={{ '--c': l.c } as CSSProperties}>
            <span className="lp-learn-icon" aria-hidden="true">
              {l.icon}
            </span>
            <h3>{l.title}</h3>
            <p>{l.text}</p>
            <p className="lp-learn-ex">
              <span>En el juego</span>
              {l.ex}
            </p>
          </Reveal>
        ))}
      </div>
      <Reveal className="lp-levels" delay={120}>
        <p className="lp-levels-title">Tres niveles, la misma aventura</p>
        <div className="lp-levels-row">
          {(['explorer', 'cadet', 'commander'] as const).map((d, i) => (
            <div key={d} className="lp-level" style={{ '--i': i } as CSSProperties}>
              <span className="lp-level-stars" aria-hidden="true">
                {'★'.repeat(i + 1)}
                <i>{'★'.repeat(2 - i)}</i>
              </span>
              <b>{DIFFICULTIES[d].label}</b>
              <small>{DIFFICULTIES[d].age}</small>
              <p>{DIFFICULTIES[d].desc}</p>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

/* ================================================================== */
/* Tripulación                                                          */
/* ================================================================== */

function Crew() {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <section className="lp-sec lp-crew" id="tripulacion" aria-labelledby="lp-crew-t">
      <Head kicker="La tripulación" title={<span id="lp-crew-t">Cuatro especialidades, una sola colonia</span>} center>
        Cada alumno es una pieza clave. Nadie tiene toda la información: la tripulación gana cuando comparte.
      </Head>
      <div className="lp-crew-layout">
        <Reveal variant="scale" className="lp-crew-loop">
          <div ref={ref}>
            <SystemsLoop active={seen} />
          </div>
        </Reveal>
        <div className="lp-crew-grid">
          {ROLE_ORDER.map((r, i) => {
            const role = ROLES[r];
            return (
              <Reveal as="article" key={r} delay={i * 100} className="lp-role" style={{ '--c': role.color } as CSSProperties}>
                <div className="lp-role-art">
                  <Astronaut avatar={ROLE_AVATARS[r]} role={r} size={104} pose={i % 2 ? 'wave' : 'idle'} />
                </div>
                <div className="lp-role-text">
                  <p className="lp-role-name">
                    <span aria-hidden="true">{role.emoji}</span> {role.es}
                  </p>
                  <p>{role.ability}.</p>
                  <p className="lp-role-secret">
                    <span aria-hidden="true">🔒</span> {role.secret}.
                  </p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ================================================================== */
/* Don Rover                                                            */
/* ================================================================== */

function DonRoverSection() {
  return (
    <section className="lp-sec lp-rover" id="donrover" aria-labelledby="lp-rover-t">
      <div className="lp-rover-head">
        <Head kicker="Tu compañero de misión" title={<span id="lp-rover-t">Conoce a Don Rover</span>}>
          Don Rover es el robot del taller. Narra la misión en voz alta, da pistas cuando la tripulación se atora y responde preguntas sobre Marte. Vive en la
          pantalla del proyector y, si quieres, en un robot de verdad.
        </Head>
        <Reveal variant="right" delay={150} className="lp-rover-model">
          <div aria-hidden="true">
            <DonRover size={210} animate turntable draggable />
          </div>
        </Reveal>
      </div>

      <div className="lp-rover-feats">
        {[
          ['🗣️', 'Narra cada fase', 'Lee el briefing, el reto, la emergencia y los resultados, con subtítulos grandes en pantalla.'],
          ['💡', 'Da pistas', 'Cuando IX manda una pista, Don Rover la dice en voz alta sin revelar la respuesta.'],
          ['🎙️', 'Responde preguntas', 'Con internet usa IA para contestar a la edad del grupo; sin internet, con su propia base de datos de Marte.'],
        ].map(([icon, title, text], i) => (
          <Reveal key={title} delay={i * 110} className="lp-feat">
            <span aria-hidden="true">{icon}</span>
            <b>{title}</b>
            <p>{text}</p>
          </Reveal>
        ))}
      </div>

      <Reveal variant="up" className="lp-rover-demo">
        <p className="lp-demo-tag">
          <span aria-hidden="true">✨</span> Pruébalo: pregúntale algo
        </p>
        <RoverDemo />
      </Reveal>

      <div className="lp-rover-tips">
        <Reveal className="lp-tip" delay={0}>
          <h3>Durante la misión también puedes pedirle</h3>
          <ul>
            <li>
              <b>«¿Qué tenemos que hacer?»</b> te recuerda la misión.
            </li>
            <li>
              <b>«Dame una pista»</b> repite la última pista de IX.
            </li>
            <li>
              <b>«¿Qué es MOXIE?»</b> y otras dudas de lo que están viendo.
            </li>
          </ul>
        </Reveal>
        <Reveal className="lp-tip" delay={110}>
          <h3>Cómo hablarle</h3>
          <ul>
            <li>
              <span aria-hidden="true">🎙️</span> En la consola: botón <b>Preguntar</b> y habla.
            </li>
            <li>
              <span aria-hidden="true">🔘</span> En el robot: <b>mantén presionado</b> su botón.
            </li>
            <li>
              <span aria-hidden="true">🔁</span> Un toque corto: <b>repite</b> lo último que dijo.
            </li>
            <li>
              <span aria-hidden="true">⌨️</span> También se puede <b>escribir</b> la pregunta.
            </li>
          </ul>
        </Reveal>
        <Reveal className="lp-tip is-robot" delay={220}>
          <h3>¿Quieres un Don Rover de verdad?</h3>
          <p>Con una placa ESP32 con pantalla redonda, su cara vive en un robot: mueve la boca mientras la computadora habla. Se instala desde el navegador.</p>
          <a className="lp-btn is-soft is-small" href="#/donrover">
            🤖 Armar mi Don Rover
          </a>
        </Reveal>
      </div>
    </section>
  );
}

/* ================================================================== */
/* Misiones                                                             */
/* ================================================================== */

function Missions() {
  const [active, setActive] = useState<MissionId>('greenhouse');
  const m = MISSIONS[active];
  return (
    <section className="lp-sec lp-missions" id="misiones" aria-labelledby="lp-mis-t">
      <Head kicker="Las misiones" title={<span id="lp-mis-t">Seis misiones en la superficie de Marte</span>}>
        Cada misión tiene una historia, un giro inesperado y decisiones con consecuencias. Elige una para viajar a su lugar en el planeta.
      </Head>
      <div className="lp-mis-layout">
        <Reveal variant="scale" className="lp-mis-planet">
          <PlanetView snapshot={DEMO_SNAPSHOT} focus={MISSION_ZONE[active]} autoRotate={false} />
          <p className="lp-mis-tag" style={{ '--mc': m.color } as CSSProperties}>
            <span className="mono">{m.code}</span> {m.titleEs}
          </p>
        </Reveal>
        <div className="lp-mis-side">
          <Reveal className="lp-mis-list" delay={100}>
            {MISSION_ORDER.map((id) => {
              const mm = MISSIONS[id];
              return (
                <button key={id} type="button" className={active === id ? 'is-on' : ''} style={{ '--mc': mm.color } as CSSProperties} aria-pressed={active === id} onClick={() => setActive(id)}>
                  <MissionPatch id={id} size={52} live={active === id} />
                  <span>
                    <small className="mono">{mm.code}</small>
                    <b>{mm.titleEs}</b>
                  </span>
                </button>
              );
            })}
          </Reveal>
          <article key={active} className="lp-mis-card" style={{ '--mc': m.color } as CSSProperties} aria-live="polite">
            <p className="lp-mis-code mono">
              {m.code} · {m.title}
            </p>
            <h3>{m.titleEs}</h3>
            <p>{m.story}</p>
            <p className="lp-mis-twist">
              <b>Giro inesperado:</b> {m.twist}
            </p>
            <div className="lp-mis-learn">
              {m.learning.map((l) => (
                <span key={l}>{l}</span>
              ))}
            </div>
            {m.disclaimer && <p className="lp-fine">{m.disclaimer}</p>}
            {active === 'final' && <p className="lp-fine">Se desbloquea al completar tres misiones distintas.</p>}
          </article>
        </div>
      </div>
    </section>
  );
}

/* ================================================================== */
/* Datos reales de la NASA                                              */
/* ================================================================== */

const WEATHER: { emoji: string; event: string; mission: MissionId }[] = [
  { emoji: '🔆', event: 'Una fulguración solar fuerte', mission: 'signal' },
  { emoji: '☢️', event: 'Partículas energéticas del Sol', mission: 'habitat' },
  { emoji: '🌪️', event: 'Varias eyecciones de masa coronal', mission: 'darkness' },
  { emoji: '🌱', event: 'Poca comida en la colonia', mission: 'greenhouse' },
  { emoji: '💧', event: 'Poca agua en la colonia', mission: 'water' },
];

function NasaData() {
  const facts = Object.values(FACTS);
  return (
    <section className="lp-sec lp-nasa" id="nasa" aria-labelledby="lp-nasa-t">
      <Head kicker="Datos reales" title={<span id="lp-nasa-t">Cada misión nace de datos reales de la NASA</span>} center>
        Nadie elige la misión a mano: IX revisa el clima espacial que midió la NASA en los últimos 14 días y el estado de la colonia, y escribe la misión a la medida de
        la tripulación.
      </Head>
      <ol className="lp-flow">
        {[
          ['🛰️', 'La NASA mide el Sol', 'Fulguraciones, tormentas y partículas (base de datos DONKI).'],
          ['🤖', 'IX lee los datos', 'Junta el clima espacial con lo que le falta a la colonia.'],
          ['📜', 'Nace la misión', 'Con un estudio real de la NASA y una tarea para cada especialidad.'],
        ].map(([icon, title, text], i) => (
          <Reveal as="li" key={title} delay={i * 160} className="lp-flow-step">
            <span className="lp-flow-icon" aria-hidden="true">
              {icon}
            </span>
            <b>{title}</b>
            <p>{text}</p>
          </Reveal>
        ))}
      </ol>
      <Reveal className="lp-weather" delay={100}>
        <p className="lp-weather-title">Por ejemplo, si la NASA detecta…</p>
        <ul>
          {WEATHER.map((w) => (
            <li key={w.mission}>
              <span className="lp-weather-emoji" aria-hidden="true">
                {w.emoji}
              </span>
              <span className="lp-weather-event">{w.event}</span>
              <span className="lp-weather-arrow" aria-hidden="true">
                →
              </span>
              <span className="lp-weather-mission" style={{ '--mc': MISSIONS[w.mission].color } as CSSProperties}>
                <MissionPatch id={w.mission} size={34} />
                {MISSIONS[w.mission].titleEs}
              </span>
            </li>
          ))}
        </ul>
      </Reveal>
      <div className="lp-marquee" aria-label="Datos reales de la NASA que aparecen en el juego">
        <div className="lp-marquee-track">
          {[...facts, ...facts].map((f, i) => (
            <figure key={i} className="lp-fact" aria-hidden={i >= facts.length}>
              <p>{f.text}</p>
              <figcaption>{f.source}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ================================================================== */
/* Más formas de jugar                                                  */
/* ================================================================== */

function MoreWays() {
  return (
    <section className="lp-sec lp-more" id="mas" aria-labelledby="lp-more-t">
      <Head kicker="Fuera de clase también" title={<span id="lp-more-t">Más formas de explorar Marte</span>} center />
      <div className="lp-more-grid">
        <Reveal as="article" className="lp-big-card is-free">
          <div className="lp-big-text">
            <span className="lp-big-icon" aria-hidden="true">
              🏗️
            </span>
            <h3>Modo libre</h3>
            <p>Sin código de clase: explora Marte, recolecta regolito, hielo y hematita y construye tu propia base. Juega solo o invita a tus amigos con un enlace.</p>
            <a className="lp-btn is-primary" href="#/libre">
              Jugar ahora
            </a>
          </div>
          <PhoneFrame src="landing/celular.webp" alt="Modo libre en el celular: astronauta, joystick e inventario de recursos" className="lp-big-phone" />
        </Reveal>
        <Reveal as="article" className="lp-big-card is-trainer" delay={120}>
          <div className="lp-big-text">
            <span className="lp-big-icon" aria-hidden="true">
              🎓
            </span>
            <h3>Entrenador de misión</h3>
            <p>Seis simuladores con física real: tormenta de polvo, oxígeno, agua, invernadero, radiación y aterrizaje. La IA elige el reto que cada quien necesita practicar.</p>
            <a className="lp-btn is-primary" href="#/entrenador">
              Entrenar
            </a>
          </div>
          <img className="lp-big-shot" src="landing/entrenador.webp" alt="Simulador de energía: la misión falla en el sol 5 y muestra las cuentas" loading="lazy" decoding="async" />
        </Reveal>
      </div>
      <div className="lp-mini-grid">
        {[
          ['#/donrover', '🤖', 'Don Rover físico', 'Instala su cara en una placa ESP32 con pantalla redonda.'],
          ['#/mundo', '🌍', 'Explorar el planeta', 'Recorre el Marte 3D completo, con sus volcanes y cañones.'],
          ['#/minijuegos', '🕹️', 'Minijuegos', 'Prueba los minijuegos de cada especialidad.'],
        ].map(([href, icon, title, text], i) => (
          <Reveal key={href} delay={i * 90} className="lp-mini-wrap">
            <a className="lp-mini" href={href}>
              <span aria-hidden="true">{icon}</span>
              <b>{title}</b>
              <small>{text}</small>
            </a>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ================================================================== */
/* Una clase de 40 minutos                                              */
/* ================================================================== */

const STAGE_COLORS = ['#F08A57', '#B69CFF', '#3CC8FF', '#55DB7A', '#FFC93C', '#FF6B5B', '#8FB8FF', '#F6AE7E'];

function ClassPlan() {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <section className="lp-sec lp-class" id="clase" aria-labelledby="lp-class-t">
      <Head kicker="Plan de clase" title={<span id="lp-class-t">Una clase completa en 40 minutos</span>} center>
        También hay una demo rápida de 10 minutos, ideal para probarlo o presentarlo.
      </Head>
      <div ref={ref} className={`lp-bar40 ${seen ? 'is-in' : ''}`} aria-hidden="true">
        {CLASS_PLAN.map((s, i) => (
          <span key={s.stage} style={{ '--w': Number(s.to) - Number(s.from), '--c': STAGE_COLORS[i], '--i': i } as CSSProperties} title={`${s.from}–${s.to} · ${s.es}`} />
        ))}
      </div>
      <ol className="lp-plan">
        {CLASS_PLAN.map((s, i) => (
          <Reveal as="li" key={s.stage} delay={(i % 4) * 80} style={{ '--c': STAGE_COLORS[i] } as CSSProperties}>
            <span className="lp-plan-time mono">
              {s.from}–{s.to} min
            </span>
            <b>{s.es}</b>
            <p>{s.text}</p>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

/* ================================================================== */
/* Preguntas frecuentes                                                 */
/* ================================================================== */

const FAQ: [string, string][] = [
  ['¿Hay que instalar algo?', 'No. Funciona en el navegador de la computadora del proyector y en los celulares de los alumnos. Si quieres, puedes instalarlo como app.'],
  [
    '¿Cuántos alumnos juegan a la vez?',
    'Cada misión es para una tripulación de 4, uno por especialidad. Si faltan alumnos, entran bots de práctica; si son más, pueden turnarse o abrir otra sala en otra computadora.',
  ],
  ['¿Para qué edades es?', 'De 7 a 15 años, con tres niveles: Explorador (7 a 9), Cadete (10 a 12) y Comandante (12 a 15). Cambia qué tan difíciles son los números y las pistas.'],
  ['¿Cuánto dura una misión?', 'Una clase completa dura 40 minutos. La demo rápida dura unos 10 minutos.'],
  [
    '¿Necesito internet?',
    'Sí, para que los celulares se conecten, para la IA y para los datos de la NASA. Sin internet, el proyector puede correr una demo con bots y las misiones con el contenido propio del juego.',
  ],
  ['¿Los alumnos necesitan cuenta o correo?', 'No. Solo escriben un nombre. Su astronauta, su XP y sus insignias se guardan en su propio celular.'],
  ['¿Necesito comprar el robot?', 'No. Don Rover aparece en la pantalla del proyector y habla por las bocinas de la computadora. El robot con pantalla redonda es opcional.'],
  ['¿La IA decide quién gana?', 'No. La IA narra, escribe y da pistas. Los puntajes y las consecuencias los calcula el motor del juego con reglas fijas, así que es justo para todos.'],
];

function Faq() {
  const [open, setOpen] = useState<number>(0);
  return (
    <section className="lp-sec lp-faq" id="preguntas" aria-labelledby="lp-faq-t">
      <Head kicker="Para profes" title={<span id="lp-faq-t">Preguntas frecuentes</span>} center />
      <div className="lp-faq-list">
        {FAQ.map(([q, a], i) => {
          const on = open === i;
          return (
            <Reveal key={q} delay={(i % 4) * 60} className={`lp-faq-item ${on ? 'is-open' : ''}`}>
              <h3>
                <button type="button" aria-expanded={on} aria-controls={`lp-faq-${i}`} id={`lp-faq-q-${i}`} onClick={() => setOpen(on ? -1 : i)}>
                  {q}
                  <span className="lp-faq-plus" aria-hidden="true" />
                </button>
              </h3>
              <div className="lp-faq-a" id={`lp-faq-${i}`} role="region" aria-labelledby={`lp-faq-q-${i}`} aria-hidden={!on}>
                <div>
                  <p>{a}</p>
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

/* ================================================================== */
/* Cierre                                                               */
/* ================================================================== */

function Closing() {
  const install = useInstall();
  return (
    <>
      <section className="lp-sec lp-close" aria-labelledby="lp-close-t">
        <Reveal variant="scale" className="lp-close-card">
          <div className="lp-close-text">
            <h2 id="lp-close-t">¿Listos para despegar?</h2>
            <p>Crea una misión en un minuto o únete con el código de tu clase. La colonia MARS-01 los está esperando.</p>
            <div className="lp-close-ctas">
              <a className="lp-btn is-white is-big" href="#/profe">
                🚀 Crear misión
              </a>
              <a className="lp-btn is-glass is-big" href="#/jugar">
                🧑‍🚀 Tengo código
              </a>
              <a className="lp-btn is-glass is-big" href="#/libre">
                🎮 Jugar sin código
              </a>
            </div>
          </div>
          <div className="lp-close-art" aria-hidden="true">
            <Astronaut avatar={ROLE_AVATARS.life} role="life" size={120} pose="cheer" />
            <Astronaut avatar={ROLE_AVATARS.habitat} role="habitat" size={120} pose="wave" />
          </div>
        </Reveal>
      </section>
      <footer className="lp-foot">
        <div className="lp-foot-in">
          <div className="lp-foot-brand">
            <Logo size="sm" sub={false} />
            <p>Misiones cooperativas en Marte para tu salón. Funciona en el navegador, con datos científicos de publicaciones de la NASA.</p>
            {install.canInstall && (
              <button type="button" className="lp-btn is-soft is-small" onClick={install.install}>
                📲 Instalar la app
              </button>
            )}
          </div>
          <nav className="lp-foot-col" aria-label="Jugar">
            <b>Jugar</b>
            <a href="#/profe">Crear misión</a>
            <a href="#/jugar">Unirme con código</a>
            <a href="#/libre">Modo libre</a>
            <a href="#/entrenador">Entrenador</a>
          </nav>
          <nav className="lp-foot-col" aria-label="Explorar">
            <b>Explorar</b>
            <a href="#/donrover">Don Rover físico</a>
            <a href="#/mundo">Planeta 3D</a>
            <a href="#/minijuegos">Minijuegos</a>
          </nav>
        </div>
        <p className="lp-foot-fine">
          🥈 2.º lugar en NASA Space Apps (etapa local) con pase al global · No es un producto oficial de la NASA · La señal de la Misión 04 es parte de la historia.
        </p>
      </footer>
    </>
  );
}

/* ================================================================== */
/* Página                                                               */
/* ================================================================== */

export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const scrolled = useScrollFx(root);
  return (
    <div className="lp" ref={root}>
      <TopBar scrolled={scrolled} />
      <main>
        <Hero />
        <Stats />
        <HowItWorks />
        <ForWhom />
        <Learn />
        <Crew />
        <DonRoverSection />
        <Missions />
        <NasaData />
        <MoreWays />
        <ClassPlan />
        <Faq />
        <Closing />
      </main>
    </div>
  );
}
