// Portada del Taller de Don Rover: Marte en 3D. El planeta gira detrás del título, la
// tripulación y los personajes son los mismos modelos 3D del juego y cada misión se
// presenta con el edificio que desbloquea y su lugar en el planeta.

import { useState, type CSSProperties, type ReactNode } from 'react';
import { CLASS_PLAN, CREWS, MISSIONS, MISSION_ORDER, ROLES, ROLE_ORDER, SECTORS, SYSTEM_ORDER } from '../../shared/content';
import type { MissionId } from '../../shared/types';
import { Astronaut, DonRover, IXOrb, MissionPatch } from '../components/art';
import { Model3D } from '../components/Model3D';
import { Icon, Logo, SystemMeter } from '../components/ui';
import { useInstall } from '../lib/pwa';
import { DEMO_SNAPSHOT } from '../world/colony/snapshot';
import { MISSION_ZONE, ROLE_AVATARS } from '../world/react/missionZones';
import { PlanetView } from '../world/react/PlanetView';

const OBJECTS: { emoji: string; obj: string; mission: MissionId }[] = [
  { emoji: '🪴', obj: 'Una planta', mission: 'greenhouse' },
  { emoji: '🧴', obj: 'Una botella', mission: 'water' },
  { emoji: '💡', obj: 'Una lámpara', mission: 'darkness' },
  { emoji: '📱', obj: 'Un celular', mission: 'signal' },
  { emoji: '♻️', obj: 'Material reciclable', mission: 'habitat' },
];

function SectionHead({ kicker, title, children, center = false }: { kicker: string; title: string; children?: ReactNode; center?: boolean }) {
  return (
    <header className={`sec-head ${center ? 'center' : ''}`}>
      <p className="eyebrow">{kicker}</p>
      <h2>{title}</h2>
      {children && <p className="sec-lead">{children}</p>}
    </header>
  );
}

/* ---------------- tripulación ---------------- */

function CrewSection() {
  return (
    <section className="sec sec-crew" id="tripulacion">
      <SectionHead kicker="La tripulación" title="Cuatro especialidades. Ninguna sobra." center>
        Cada alumno arma su astronauta en su celular y recibe una especialidad con información secreta: nadie tiene el panorama completo. Arrastra a cada
        astronauta para verlo por todos lados.
      </SectionHead>
      <div className="crew-row">
        {ROLE_ORDER.map((r, i) => {
          const role = ROLES[r];
          return (
            <article key={r} className="crew-card" style={{ '--c': role.color, animationDelay: `${i * 0.08}s` } as CSSProperties}>
              <div className="crew-stage">
                <span className="crew-num mono">{role.num}</span>
                <Astronaut avatar={ROLE_AVATARS[r]} role={r} size={150} pose={i % 2 ? 'wave' : 'idle'} draggable />
              </div>
              <h3>{role.name}</h3>
              <p className="crew-es">
                {role.emoji} {role.es}
              </p>
              <p className="crew-ability">{role.ability}</p>
              <p className="crew-secret">🔒 {role.secret}</p>
            </article>
          );
        })}
      </div>
      <div className="cast">
        <article className="cast-card">
          <IXOrb size={150} mood="talk" />
          <div>
            <p className="eyebrow">La IA de la colonia</p>
            <h3>IX</h3>
            <p>Narra cada misión, da pistas cuando la clase se atora y escribe el debrief final. La IA narra; el motor del juego decide.</p>
          </div>
        </article>
        <article className="cast-card">
          <DonRover size={190} animate turntable draggable />
          <div>
            <p className="eyebrow">El taller sobre ruedas</p>
            <h3>Don Rover</h3>
            <p>Recorre la colonia MARS-01 entre los sectores. Es la mascota del taller: donde la clase aprende a sobrevivir en Marte.</p>
          </div>
        </article>
      </div>
    </section>
  );
}

/* ---------------- colonia ---------------- */

function ColonySection() {
  return (
    <section className="sec sec-colony" id="colonia">
      <SectionHead kicker="Un planeta que comparte toda la clase" title="MARS-01: ocho sectores, una sola colonia">
        Todas las tripulaciones mantienen viva la misma colonia. En un salón de 32 alumnos se forman ocho tripulaciones de cuatro y cada una cuida un sector.
        Si un equipo toma una mala decisión, toda la colonia lo siente.
      </SectionHead>
      <div className="colony-grid">
        <div className="status-demo panel">
          <div className="status-head">
            <div>
              <p className="eyebrow">Global planet status</p>
              <h3>MARS-01</h3>
            </div>
            <span className="chip">Sol 47</span>
          </div>
          <div className="status-meters">
            {SYSTEM_ORDER.map((s, i) => (
              <SystemMeter key={s} system={s} value={[78, 64, 85, 71][i]} size="lg" />
            ))}
          </div>
          <p className="fine">Ejemplo de interfaz: los porcentajes son valores de juego.</p>
        </div>
        <div className="sector-grid">
          {CREWS.map((c) => (
            <div key={c.id} className="sector-tile">
              <Model3D subject={{ type: 'sector', id: c.sector }} width={118} height={92} pitch={30} />
              <span>
                <b>{c.name}</b>
                <small>
                  {SECTORS[c.sector].emoji} {SECTORS[c.sector].name}
                </small>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- misiones ---------------- */

function MissionsSection() {
  const [active, setActive] = useState<MissionId>('greenhouse');
  const m = MISSIONS[active];
  return (
    <section className="sec sec-missions" id="misiones">
      <SectionHead kicker="Las misiones" title="Seis misiones en la superficie de Marte">
        Cada misión tiene narrativa, acontecimientos inesperados, decisiones y consecuencias. Elige una para viajar a su lugar en el planeta.
      </SectionHead>
      <div className="missions-layout">
        <div className="mission-planet">
          <PlanetView snapshot={DEMO_SNAPSHOT} focus={MISSION_ZONE[active]} autoRotate={false} />
          <div className="mission-planet-tag" style={{ '--mc': m.color } as CSSProperties}>
            <span className="mono">{m.code}</span> {m.titleEs}
          </div>
        </div>
        <div className="missions-side">
          <div className="missions-list">
            {MISSION_ORDER.map((id) => {
              const mm = MISSIONS[id];
              return (
                <button key={id} className={`mission-item ${active === id ? 'on' : ''}`} style={{ '--mc': mm.color } as CSSProperties}
                  aria-pressed={active === id}
                  onClick={() => setActive(id)}
                >
                  <MissionPatch id={id} size={64} live={active === id} />
                  <span>
                    <b>{mm.title}</b>
                    <small>{mm.titleEs}</small>
                  </span>
                </button>
              );
            })}
          </div>
          <article className="mission-detail card" style={{ '--mc': m.color } as CSSProperties}>
            <p className="eyebrow dark">Misión {m.code.slice(2)}</p>
            <h3>{m.title}</h3>
            <p className="mission-story">{m.story}</p>
            <p className="mission-twist">
              <b>Giro inesperado:</b> {m.twist}
            </p>
            <div className="chips">
              {m.learning.map((l) => (
                <span key={l} className="chip dark">
                  {l}
                </span>
              ))}
            </div>
            {m.disclaimer && <p className="fine">{m.disclaimer}</p>}
            {active === 'final' && <p className="fine">Se desbloquea al completar tres misiones distintas.</p>}
          </article>
        </div>
      </div>
    </section>
  );
}

/* ---------------- escáner ---------------- */

function ScanSection() {
  return (
    <section className="sec sec-scan" id="escaner">
      <div className="scan-layout">
        <div className="scan-ix">
          <IXOrb size={220} mood="talk" />
        </div>
        <div>
          <SectionHead kicker="Scan to mission" title="Un objeto del salón desbloquea la misión">
            El profesor fotografía un objeto del salón, o deja que la clase vote. IX identifica la categoría y abre una misión científicamente revisada. Con la
            IA local la foto se analiza en el navegador y nunca sale del dispositivo.
          </SectionHead>
          <div className="objects">
            {OBJECTS.map((o) => (
              <div key={o.obj} className="object-tile">
                <span className="object-emoji">{o.emoji}</span>
                <Icon name="arrow" size={18} />
                <MissionPatch id={o.mission} size={52} />
                <span>
                  <b>{o.obj}</b>
                  <small>{MISSIONS[o.mission].title}</small>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- clase ---------------- */

function ClassSection() {
  return (
    <section className="sec sec-class" id="clase">
      <SectionHead kicker="Cómo se juega" title="Una clase completa en 40 minutos" center>
        El profesor controla todo desde una sola pantalla y los alumnos juegan desde su celular.
      </SectionHead>
      <ol className="timeline">
        {CLASS_PLAN.map((s, i) => (
          <li key={s.stage} style={{ animationDelay: `${i * 0.06}s` }}>
            <span className="tl-time mono">
              {s.from}–{s.to}
            </span>
            <b>{s.es}</b>
            <p>{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------------- página ---------------- */

export function Landing() {
  const install = useInstall();
  return (
    <div className="landing">
      <section className="hero">
        <div className="hero-planet">
          <PlanetView snapshot={DEMO_SNAPSHOT} distance={170} />
        </div>
        <nav className="hero-nav">
          <Logo size="sm" sub={false} />
          <div className="row">
            {install.canInstall && (
              <button className="btn small cream" onClick={install.install}>
                <Icon name="install" size={16} /> Instalar app
              </button>
            )}
            <a className="btn small cream" href="#/entrenador">
              Entrenador
            </a>
            <a className="btn small cream" href="#/libre">
              Jugar ahora
            </a>
            <a className="btn small cream" href="#/jugar">
              Tengo código
            </a>
            <a className="btn small mars" href="#/profe">
              Crear misión
            </a>
          </div>
        </nav>
        <div className="hero-copy">
          <p className="eyebrow">Misiones cooperativas en Marte para tu salón</p>
          <Logo size="xl" sub={false} />
          <h1 className="hero-tag">
            Un salón. Varias tripulaciones. <span>Una colonia en Marte por salvar.</span>
          </h1>
          <p className="hero-lead">
            Cada alumno tiene un rol y una pieza secreta de información, la IA convierte objetos del salón en misiones y las decisiones de cada tripulación
            cambian la colonia que comparte toda la clase.
          </p>
          <div className="hero-ctas">
            <a className="btn huge mars" href="#/profe">
              🚀 Soy profe: crear misión
            </a>
            <a className="btn huge cream" href="#/jugar">
              🧑‍🚀 Soy alumno: unirme
            </a>
          </div>
          <a className="hero-free" href="#/libre">
            <span className="hero-free-icon" aria-hidden="true">
              🏗️
            </span>
            <span>
              <b>¿Sin código? Juega ahora</b>
              <small>Recolecta recursos y construye tu base en Marte · solo o con amigos por enlace</small>
            </span>
            <span className="hero-free-go">Jugar →</span>
          </a>
          <a className="hero-free" href="#/entrenador">
            <span className="hero-free-icon ix" aria-hidden="true">
              🎓
            </span>
            <span>
              <b>Entrenador de misión con IA</b>
              <small>Retos a tu medida con física real y datos de la NASA: energía, aire, agua, comida y radiación</small>
            </span>
            <span className="hero-free-go">Entrenar →</span>
          </a>
          <p className="hero-hint">
            <Icon name="map" size={16} /> Arrastra el planeta para girarlo · rueda o pellizco para acercarte
          </p>
        </div>
        <div className="hero-crew" aria-hidden="true">
          {ROLE_ORDER.map((r, i) => (
            <Astronaut key={r} avatar={ROLE_AVATARS[r]} role={r} size={104} pose={i === 1 ? 'wave' : i === 3 ? 'cheer' : 'idle'} />
          ))}
        </div>
        <ul className="hero-stats">
          <li>
            <b>4</b> especialidades
          </li>
          <li>
            <b>8</b> tripulaciones
          </li>
          <li>
            <b>6</b> misiones
          </li>
          <li>
            <b>40</b> minutos
          </li>
        </ul>
      </section>

      <CrewSection />
      <ColonySection />
      <MissionsSection />
      <ScanSection />
      <ClassSection />

      <section className="closing">
        <div className="closing-rover">
          <DonRover size={300} animate turntable draggable />
        </div>
        <div className="closing-inner">
          <p className="eyebrow">Bienvenidos al taller</p>
          <h2>La próxima generación de exploradores no debería limitarse a aprender sobre Marte: debería poder explorarlo.</h2>
          <div className="hero-ctas center">
            <a className="btn huge mars" href="#/profe">
              🚀 Crear misión
            </a>
            <a className="btn huge cream" href="#/jugar">
              🧑‍🚀 Unirme
            </a>
            <a className="btn huge ghost" href="#/libre">
              🎮 Jugar solo o con amigos
            </a>
          </div>
        </div>
        <footer className="foot">
          <Logo size="sm" />
          <p>PWA que corre 100% en el navegador · Datos científicos basados en publicaciones de la NASA · La señal de la Misión 04 es ficticia</p>
        </footer>
      </section>
    </div>
  );
}
