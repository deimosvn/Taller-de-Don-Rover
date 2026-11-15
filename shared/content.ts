// Contenido del juego: roles, tripulaciones, sectores, misiones, eventos y datos científicos.
// Todo el texto científico está pensado para niñas y niños de 8 a 14 años y se basa en
// hechos publicados por la NASA. Los valores de los medidores son valores de juego.

import type {
  BadgeId,
  BuildingId,
  CategoryId,
  Difficulty,
  Meters,
  MissionId,
  Pace,
  Phase,
  Quiz,
  RoleId,
  SectorId,
  SystemId,
} from './types';

/* ------------------------------------------------------------------ */
/* Sistemas de la colonia                                               */
/* ------------------------------------------------------------------ */

export const SYSTEM_ORDER: SystemId[] = ['energy', 'water', 'food', 'habitat'];

export const SYSTEMS: Record<
  SystemId,
  { id: SystemId; name: string; short: string; color: string; dark: string; emoji: string }
> = {
  energy: { id: 'energy', name: 'Energía global', short: 'Energía', color: '#FFC93C', dark: '#B07400', emoji: '⚡' },
  water: { id: 'water', name: 'Agua y oxígeno', short: 'Agua', color: '#3CC8FF', dark: '#0A78B0', emoji: '💧' },
  food: { id: 'food', name: 'Producción de alimentos', short: 'Alimentos', color: '#55DB7A', dark: '#17914A', emoji: '🌱' },
  habitat: { id: 'habitat', name: 'Protección de hábitats', short: 'Hábitat', color: '#FF6B5B', dark: '#C13628', emoji: '🛡️' },
};

/* ------------------------------------------------------------------ */
/* Roles de la tripulación                                              */
/* ------------------------------------------------------------------ */

export interface RoleDef {
  id: RoleId;
  num: string;
  name: string;
  es: string;
  specialty: string;
  system: SystemId;
  color: string;
  dark: string;
  soft: string;
  emoji: string;
  ability: string;
  secret: string;
  helmet: number;
}

export const ROLE_ORDER: RoleId[] = ['power', 'life', 'bio', 'habitat'];

export const ROLES: Record<RoleId, RoleDef> = {
  power: {
    id: 'power',
    num: '01',
    name: 'Power Engineer',
    es: 'Ingeniería de Energía',
    specialty: 'Energía',
    system: 'energy',
    color: '#FFC93C',
    dark: '#9A6500',
    soft: '#FFF3CC',
    emoji: '⚡',
    ability: 'Optimizar y redistribuir la energía',
    secret: 'Recibe la predicción de energía disponible',
    helmet: 1,
  },
  life: {
    id: 'life',
    num: '02',
    name: 'Life Support Officer',
    es: 'Soporte Vital',
    specialty: 'Agua y oxígeno',
    system: 'water',
    color: '#3CC8FF',
    dark: '#076A9E',
    soft: '#D9F4FF',
    emoji: '💧',
    ability: 'Recuperar recursos y resolver crisis',
    secret: 'Recibe el estado de las reservas',
    helmet: 2,
  },
  bio: {
    id: 'bio',
    num: '03',
    name: 'Astro-Biologist',
    es: 'Astrobiología',
    specialty: 'Alimentos',
    system: 'food',
    color: '#55DB7A',
    dark: '#137A3C',
    soft: '#DDF8E5',
    emoji: '🌱',
    ability: 'Crear cultivos y desarrollar ecosistemas',
    secret: 'Recibe el estado de los cultivos',
    helmet: 0,
  },
  habitat: {
    id: 'habitat',
    num: '04',
    name: 'Habitat Engineer',
    es: 'Ingeniería de Hábitat',
    specialty: 'Protección',
    system: 'habitat',
    color: '#FF6B5B',
    dark: '#A82A1E',
    soft: '#FFE1DD',
    emoji: '🛡️',
    ability: 'Diseñar y mejorar refugios',
    secret: 'Recibe la información de protección del refugio',
    helmet: 4,
  },
};

/* ------------------------------------------------------------------ */
/* Tripulaciones y sectores                                             */
/* ------------------------------------------------------------------ */

export const CREWS: { id: string; name: string; sector: SectorId }[] = [
  { id: 'apollo', name: 'Apollo', sector: 'greenhouse' },
  { id: 'orion', name: 'Orion', sector: 'solar' },
  { id: 'artemis', name: 'Artemis', sector: 'waterplant' },
  { id: 'voyager', name: 'Voyager', sector: 'habitat' },
  { id: 'gemini', name: 'Gemini', sector: 'oxygen' },
  { id: 'pioneer', name: 'Pioneer', sector: 'battery' },
  { id: 'cassini', name: 'Cassini', sector: 'algae' },
  { id: 'juno', name: 'Juno', sector: 'shield' },
];

export const SECTOR_ORDER: SectorId[] = CREWS.map((c) => c.sector);

export const SECTORS: Record<SectorId, { name: string; system: SystemId; desc: string; emoji: string }> = {
  greenhouse: { name: 'Invernaderos', system: 'food', desc: 'Cultivos bajo domos de vidrio', emoji: '🌿' },
  solar: { name: 'Granja solar', system: 'energy', desc: 'Paneles que alimentan la colonia', emoji: '☀️' },
  waterplant: { name: 'Planta de agua', system: 'water', desc: 'Extrae y purifica hielo marciano', emoji: '💧' },
  habitat: { name: 'Hábitats', system: 'habitat', desc: 'Refugios donde vive la tripulación', emoji: '🏠' },
  oxygen: { name: 'Generador de oxígeno', system: 'water', desc: 'Convierte CO₂ en aire respirable', emoji: '🫧' },
  battery: { name: 'Banco de baterías', system: 'energy', desc: 'Energía guardada para noches y tormentas', emoji: '🔋' },
  algae: { name: 'Biolab de algas', system: 'food', desc: 'Algas que dan alimento y oxígeno', emoji: '🧪' },
  shield: { name: 'Escudo de radiación', system: 'habitat', desc: 'Domo blindado con regolito', emoji: '🛡️' },
};

/* ------------------------------------------------------------------ */
/* Escáner: categorías de objetos                                       */
/* ------------------------------------------------------------------ */

export const CATEGORIES: Record<
  CategoryId,
  { id: CategoryId; label: string; emoji: string; examples: string; missionId: MissionId; unlocks: string }
> = {
  plant: { id: 'plant', label: 'Planta', emoji: '🪴', examples: 'plantas, flores, frutas, árboles', missionId: 'greenhouse', unlocks: 'Crear un ecosistema agrícola en Marte' },
  water: { id: 'water', label: 'Agua', emoji: '🧴', examples: 'botellas, vasos, recipientes', missionId: 'water', unlocks: 'Resolver una crisis de agua' },
  light: { id: 'light', label: 'Luz', emoji: '💡', examples: 'lámparas, focos, ventanas, linternas', missionId: 'darkness', unlocks: 'Superar una falla energética' },
  signal: { id: 'signal', label: 'Señal', emoji: '📡', examples: 'celulares, radios, bocinas, computadoras', missionId: 'signal', unlocks: 'Investigar una señal desconocida' },
  material: { id: 'material', label: 'Material', emoji: '♻️', examples: 'cartón, plástico, latas, papel', missionId: 'habitat', unlocks: 'Construir un módulo virtual de hábitat' },
  mystery: { id: 'mystery', label: 'Misterio', emoji: '❔', examples: 'cualquier otra cosa', missionId: 'greenhouse', unlocks: 'Un descubrimiento sorpresa' },
};

export const SCAN_CATEGORIES: CategoryId[] = ['plant', 'water', 'light', 'signal', 'material'];

/** Textos de respaldo del escáner cuando la IA en la nube no está disponible. */
export const CATEGORY_LINES: Record<CategoryId, { discovery: string; funFact: string }> = {
  plant: {
    discovery: '¡Hemos descubierto un organismo vegetal! Necesitamos aprender a crear un ecosistema capaz de producir alimentos en Marte.',
    funFact: 'En la Estación Espacial Internacional ya se han cultivado lechugas, flores de zinnia y chiles.',
  },
  water: {
    discovery: '¡Un contenedor de agua! En Marte cada gota cuenta: hay que encontrarla, limpiarla y reciclarla.',
    funFact: 'La Estación Espacial Internacional recupera cerca del 98% de su agua.',
  },
  light: {
    discovery: '¡Una fuente de luz! Sin luz no hay energía solar… ni cultivos. ¿Qué pasaría si el Sol desapareciera por días?',
    funFact: 'Marte recibe menos de la mitad de la luz solar que llega a la Tierra.',
  },
  signal: {
    discovery: '¡Un aparato de comunicación! Detectamos ondas… y una señal misteriosa en Marte.',
    funFact: 'Un mensaje de radio tarda entre 3 y 22 minutos en viajar entre la Tierra y Marte.',
  },
  material: {
    discovery: '¡Material de construcción! Con ingenio, la colonia puede convertir materiales en un nuevo hogar.',
    funFact: 'La NASA ha probado hábitats impresos en 3D, como Mars Dune Alpha en Houston.',
  },
  mystery: {
    discovery: '¡Objeto misterioso detectado! IX lo registró en la bitácora de descubrimientos.',
    funFact: 'Marte tiene el volcán más grande del sistema solar: el Monte Olimpo.',
  },
};

/* ------------------------------------------------------------------ */
/* Edificios que se desbloquean (progresión de la colonia)              */
/* ------------------------------------------------------------------ */

export const BUILDINGS: Record<BuildingId, { name: string; desc: string; emoji: string; missionId: MissionId }> = {
  hydroponics: { name: 'Invernadero hidropónico', desc: 'Cultiva sin tierra usando agua con nutrientes.', emoji: '🌿', missionId: 'greenhouse' },
  recycler: { name: 'Recicladora de agua', desc: 'Recupera casi toda el agua de la colonia.', emoji: '♻️', missionId: 'water' },
  reactor: { name: 'Reactor compacto', desc: 'Energía estable aunque no haya Sol.', emoji: '⚛️', missionId: 'darkness' },
  antenna: { name: 'Antena de espacio profundo', desc: 'Comunicación directa con la Tierra.', emoji: '📡', missionId: 'signal' },
  module: { name: 'Módulo impreso en 3D', desc: 'Un nuevo hogar hecho con regolito.', emoji: '🏗️', missionId: 'habitat' },
  city: { name: 'Ciudad Don Rover', desc: 'La colonia es autosuficiente. ¡Rumbo a la Luna!', emoji: '🌙', missionId: 'final' },
};

/* ------------------------------------------------------------------ */
/* Insignias                                                            */
/* ------------------------------------------------------------------ */

export const BADGES: Record<BadgeId, { name: string; emoji: string; desc: string }> = {
  first: { name: 'Primer contacto', emoji: '🚀', desc: 'Primera persona en abordar la colonia' },
  decoder: { name: 'Decodificador', emoji: '🔓', desc: 'Completó la tarea de su especialidad' },
  voice: { name: 'Voz de la tripulación', emoji: '🗳️', desc: 'Votó en la decisión de su tripulación' },
  brain: { name: 'Mente brillante', emoji: '🧠', desc: 'Su tripulación encontró la mejor solución' },
  hands: { name: 'Manos a la obra', emoji: '🛠️', desc: 'La mayor cantidad de acciones de su tripulación' },
  hero: { name: 'Héroe de la colonia', emoji: '🏅', desc: 'La clase salvó a la colonia en la emergencia' },
  writer: { name: 'Bitácora', emoji: '📓', desc: 'Escribió el plan de su tripulación' },
  expert: { name: 'Experto NASA', emoji: '🛰️', desc: 'Respondió bien la pregunta bonus' },
};

/* ------------------------------------------------------------------ */
/* Personalización del astronauta                                       */
/* ------------------------------------------------------------------ */

export const SUIT_COLORS = ['#FF5A4E', '#FF9A3C', '#FFC93C', '#55DB7A', '#3CC8FF', '#4C6FFF', '#A57CFF', '#FF7EB6'];
export const SUIT_NAMES = ['Rojo Marte', 'Naranja', 'Sol', 'Brote', 'Hielo', 'Cosmos', 'Nebulosa', 'Chicle'];
export const HELMETS = ['Burbuja', 'Gorra', 'Goggles', 'Robot', 'Buzo'];
export const VISORS = ['#1B2A6B', '#FFB703', '#38E1FF', '#FF4FB0'];
export const VISOR_NAMES = ['Noche', 'Oro', 'Hielo', 'Neón'];
export const ACCESSORIES = ['Nada', 'Antena', 'Brote', 'Orejitas', 'Audífonos', 'Anillo'];

/* ------------------------------------------------------------------ */
/* Dificultad, ritmo y fases                                            */
/* ------------------------------------------------------------------ */

export const DIFFICULTIES: Record<Difficulty, { label: string; age: string; desc: string }> = {
  explorer: { label: 'Explorador', age: '7 a 9 años', desc: 'Números pequeños y pistas muy claras.' },
  cadet: { label: 'Cadete', age: '10 a 12 años', desc: 'Comparar y sumar datos de toda la tripulación.' },
  commander: { label: 'Comandante', age: '12 a 15 años', desc: 'Multiplicar por sols y razonar con varias condiciones.' },
};

export const PACES: Record<Pace, { label: string; desc: string; discovery: number; challenge: number; share: number; action: number }> = {
  class: { label: 'Clase completa', desc: '40 minutos, con tiempo para conversar', discovery: 300, challenge: 420, share: 60, action: 35 },
  demo: { label: 'Demo rápida', desc: '10 minutos, ideal para jueces y pruebas', discovery: 75, challenge: 150, share: 30, action: 25 },
};

export const PHASE_LABELS: Record<Phase, string> = {
  lobby: 'Abordaje',
  crews: 'Tripulaciones',
  scan: 'Escáner',
  briefing: 'Briefing',
  discovery: 'Descubrimiento',
  challenge: 'Reto de tripulación',
  event: 'Evento global',
  results: 'Resultados',
  debrief: 'Debrief',
};

export const PHASE_FLOW: Phase[] = ['lobby', 'crews', 'scan', 'briefing', 'discovery', 'challenge', 'event', 'results', 'debrief'];

export const CLASS_PLAN: { from: string; to: string; stage: string; es: string; text: string }[] = [
  { from: '00', to: '03', stage: 'JOIN THE MISSION', es: 'Abordaje', text: 'Escanean el QR, crean su astronauta y aparecen en la colonia.' },
  { from: '03', to: '05', stage: 'CREW ASSIGNMENT', es: 'Tripulaciones', text: 'IX forma tripulaciones de cuatro y asigna las especialidades.' },
  { from: '05', to: '08', stage: 'WORLD SCANNER', es: 'Escáner', text: 'Se fotografía un objeto del salón y la IA desbloquea la misión.' },
  { from: '08', to: '15', stage: 'DISCOVERY', es: 'Descubrimiento', text: 'Cada quien va a su estación en Marte y completa la tarea de su especialidad.' },
  { from: '15', to: '22', stage: 'CREW CHALLENGE', es: 'Reto de tripulación', text: 'Los cuatro roles combinan sus datos y votan una decisión.' },
  { from: '22', to: '30', stage: 'GLOBAL EVENT', es: 'Evento global', text: 'Toda la clase enfrenta una emergencia y decide cuánto compartir.' },
  { from: '30', to: '35', stage: 'MISSION RESULTS', es: 'Resultados', text: 'La colonia cambia según las decisiones de cada tripulación.' },
  { from: '35', to: '40', stage: 'DEBRIEF', es: 'Debrief', text: 'IX explica lo aprendido y desbloquea un nuevo edificio.' },
];

/* ------------------------------------------------------------------ */
/* Misiones                                                             */
/* ------------------------------------------------------------------ */

export interface EventDef {
  title: string;
  narrative: string;
  shareLabel: string;
  shareUnit: string;
  actions: Record<RoleId, { verb: string; emoji: string; hint: string }>;
  savedText: string;
  failText: string;
}

export interface MissionDef {
  id: MissionId;
  code: string;
  title: string;
  titleEs: string;
  color: string;
  deep: string;
  emoji: string;
  hook: string;
  story: string;
  objective: string;
  twist: string;
  learning: string[];
  focus: SystemId;
  conceptHint: string;
  twists: [string, string, string];
  quiz: Record<RoleId, Quiz>;
  bonus: Quiz;
  event: EventDef;
  debrief: { learnings: string[]; nasaFact: string; reflection: string; teaser: string };
  unlock: BuildingId;
  requires?: number;
  disclaimer?: string;
}

export const MISSION_ORDER: MissionId[] = ['greenhouse', 'water', 'darkness', 'signal', 'habitat', 'final'];

export const MISSIONS: Record<MissionId, MissionDef> = {
  greenhouse: {
    id: 'greenhouse',
    code: 'M-01',
    title: 'GREENHOUSE RESCUE',
    titleEs: 'Rescate del invernadero',
    color: '#3FCF6E',
    deep: '#0D5A33',
    emoji: '🌱',
    hook: '¡El invernadero principal perdió sus condiciones de operación! Los cultivos que alimentan a toda la colonia tienen pocas horas.',
    story:
      'Un invernadero de la colonia acaba de fallar. Sin luz, agua y calor estables, los cultivos están en peligro. Cada tripulación debe decidir qué cultivo rescatar con los recursos de su sector.',
    objective: 'Rescatar el cultivo que pueda sobrevivir a la tormenta de polvo que se acerca.',
    twist: 'Una tormenta de polvo reduce la energía solar y obliga a decidir qué cultivos conservar.',
    learning: ['Fotosíntesis', 'Ecosistemas', 'Recursos', 'Agricultura espacial'],
    focus: 'food',
    conceptHint: 'Recuerden: la fotosíntesis necesita luz, agua y CO₂. Cada especialidad tiene un dato que descarta un cultivo.',
    twists: [
      'Datos nuevos: los sensores detectan polvo acercándose al invernadero.',
      'Emergencia global: una tormenta de polvo cubre toda la colonia.',
      'Descubrimiento: algo brilla bajo la arena del invernadero…',
    ],
    quiz: {
      power: {
        q: '¿Qué colores de luz LED aprovechan más las plantas para hacer fotosíntesis?',
        options: ['Rojo y azul', 'Verde y amarillo', 'Solo luz blanca'],
        answer: 0,
        explain: 'Las plantas absorben sobre todo luz roja y azul. La verde la reflejan: ¡por eso las vemos verdes!',
      },
      life: {
        q: 'En la fotosíntesis las plantas toman agua y dióxido de carbono. ¿Qué gas liberan?',
        options: ['Oxígeno', 'Nitrógeno', 'Helio'],
        answer: 0,
        explain: 'Liberan oxígeno. En Marte, los cultivos ayudarían a renovar el aire de la base.',
      },
      bio: {
        q: '¿Qué necesita una planta para hacer fotosíntesis?',
        options: ['Luz, agua y dióxido de carbono', 'Solo tierra', 'Oscuridad y frío'],
        answer: 0,
        explain: 'Con luz, agua y CO₂ la planta fabrica su propio alimento (glucosa) y libera oxígeno.',
      },
      habitat: {
        q: '¿Por qué un invernadero en Marte necesita una cubierta cerrada y protegida?',
        options: ['Afuera hace muchísimo frío y el aire es muy delgado', 'Porque en Marte llueve mucho', 'Para que no entren insectos marcianos'],
        answer: 0,
        explain: 'Marte tiene en promedio unos −60 °C y una atmósfera muy delgada. Sin protección, el agua de las plantas se congelaría o evaporaría.',
      },
    },
    bonus: {
      q: 'La atmósfera de Marte está hecha casi toda de un gas que las plantas usan. ¿Cuál es?',
      options: ['Dióxido de carbono', 'Oxígeno', 'Hidrógeno'],
      answer: 0,
      explain: 'Cerca del 95% de la atmósfera marciana es dióxido de carbono: ¡ingrediente de la fotosíntesis!',
    },
    event: {
      title: 'TORMENTA DE POLVO',
      narrative:
        'Una tormenta de polvo cubre la colonia y la energía solar cae en picada. Los invernaderos de todos los sectores necesitan energía para sus luces. ¿Cuánto comparte su tripulación con la red?',
      shareLabel: 'Compartir energía con la red de invernaderos',
      shareUnit: '⚡',
      actions: {
        power: { verb: 'Limpia los paneles', emoji: '🧽', hint: 'Toca rápido para quitar el polvo' },
        life: { verb: 'Bombea agua', emoji: '💧', hint: 'Toca para mantener el riego' },
        bio: { verb: 'Cubre los brotes', emoji: '🌱', hint: 'Toca para proteger cada planta' },
        habitat: { verb: 'Sella las compuertas', emoji: '🔧', hint: 'Toca para cerrar las fugas' },
      },
      savedText: '¡La red de energía mantuvo encendidas las luces de todos los invernaderos!',
      failText: 'La energía no alcanzó y algunos invernaderos se quedaron a oscuras.',
    },
    debrief: {
      learnings: [
        'Las plantas hacen fotosíntesis: usan luz, agua y dióxido de carbono para fabricar su alimento y liberar oxígeno.',
        'En Marte un invernadero debe proteger a las plantas del frío extremo, la radiación y el aire tan delgado.',
        'Elegir un cultivo es equilibrar recursos: energía para la luz, agua para el riego, calor y tiempo de cosecha.',
      ],
      nasaFact:
        'En 2021 la tripulación de la Estación Espacial Internacional cosechó chiles cultivados en órbita… ¡y con ellos prepararon tacos espaciales!',
      reflection: '¿Qué cultivo plantarían primero en Marte y por qué?',
      teaser: 'El agua de los cultivos salió de algún lado… ¿y si la reserva tiene una fuga?',
    },
    unlock: 'hydroponics',
  },

  water: {
    id: 'water',
    code: 'M-02',
    title: 'THE WATER CRISIS',
    titleEs: 'La crisis del agua',
    color: '#2FB9F5',
    deep: '#0A4A78',
    emoji: '💧',
    hook: '¡Alarma! Se detectó una fuga en el depósito principal. Cada sol perdemos agua que la colonia necesita para vivir.',
    story:
      'Una fuga vació parte de la reserva de agua. Cada tripulación debe elegir una nueva fuente de agua segura… sin gastar toda la energía ni poner en riesgo a los rovers.',
    objective: 'Elegir la fuente de agua que cubra lo que necesita la colonia de forma segura.',
    twist: 'Una zona de cultivo consume más agua de lo esperado y la red pierde presión.',
    learning: ['Ciclo del agua', 'Conservación', 'Reciclaje', 'Gestión de recursos'],
    focus: 'water',
    conceptHint: 'En Marte el agua está congelada y el suelo tiene sales tóxicas. Revisen energía, cantidad, distancia y pureza.',
    twists: [
      'Datos nuevos: el radar encontró hielo enterrado cerca de la colonia.',
      'Emergencia global: una zona de cultivo bebe más agua de lo previsto.',
      'Descubrimiento: el radar detecta una cueva de hielo…',
    ],
    quiz: {
      power: {
        q: '¿Qué se necesita para convertir el hielo marciano en agua líquida?',
        options: ['Calor, es decir, energía', 'Viento', 'Sombra'],
        answer: 0,
        explain: 'Derretir hielo requiere energía en forma de calor. Por eso el agua y la energía están conectadas en la colonia.',
      },
      life: {
        q: 'La Estación Espacial Internacional recicla casi toda su agua. ¿Cuánta, aproximadamente?',
        options: ['Cerca del 98%', 'La mitad', 'Solo el 10%'],
        answer: 0,
        explain: 'En 2023 la NASA logró recuperar cerca del 98% del agua: el sudor, la respiración y hasta la orina se purifican.',
      },
      bio: {
        q: 'En el ciclo del agua, cuando el vapor se enfría y forma gotitas, se llama…',
        options: ['Condensación', 'Evaporación', 'Fotosíntesis'],
        answer: 0,
        explain: 'Es la condensación. Las recicladoras de las bases espaciales condensan el vapor del aire para volver a usarlo.',
      },
      habitat: {
        q: '¿Dónde se ha encontrado agua congelada en Marte?',
        options: ['En los polos y enterrada bajo el suelo', 'En ríos que fluyen hoy', 'En nubes de lluvia'],
        answer: 0,
        explain: 'Marte tiene casquetes polares de hielo y hielo enterrado. Hoy no hay ríos líquidos en su superficie.',
      },
    },
    bonus: {
      q: '¿Qué sales tóxicas hay en el suelo marciano y obligan a filtrar el agua?',
      options: ['Percloratos', 'Azúcares', 'Bicarbonatos'],
      answer: 0,
      explain: 'La sonda Phoenix encontró percloratos en 2008. Hay que quitarlos antes de beber el agua o regar con ella.',
    },
    event: {
      title: 'LA RED PIERDE PRESIÓN',
      narrative:
        'Una zona de cultivo consume más agua de lo esperado y la red de la colonia pierde presión. Si cada sector dona un poco, nadie se queda sin agua.',
      shareLabel: 'Donar agua a la red de la colonia',
      shareUnit: '💧',
      actions: {
        power: { verb: 'Enciende las bombas', emoji: '⚙️', hint: 'Toca para dar potencia' },
        life: { verb: 'Cierra las válvulas', emoji: '🚰', hint: 'Toca para frenar la fuga' },
        bio: { verb: 'Ajusta el goteo', emoji: '🌾', hint: 'Toca para regar solo lo necesario' },
        habitat: { verb: 'Parcha la tubería', emoji: '🩹', hint: 'Toca para sellar cada grieta' },
      },
      savedText: '¡La red recuperó la presión y ningún sector se quedó sin agua!',
      failText: 'La presión no se recuperó a tiempo y varios sectores tuvieron que racionar agua.',
    },
    debrief: {
      learnings: [
        'El agua se mueve en un ciclo: se evapora, se condensa y vuelve a usarse. En una base espacial ese ciclo se cierra con máquinas.',
        'En Marte hay hielo en los polos y bajo el suelo, pero hay que derretirlo y filtrarlo porque el suelo contiene percloratos.',
        'Conservar y reciclar agua es tan importante como encontrar agua nueva.',
      ],
      nasaFact:
        'En 2023 la Estación Espacial Internacional logró recuperar cerca del 98% de su agua: el sudor, el vapor de la respiración y hasta la orina se purifican para volver a beberse.',
      reflection: '¿Qué harían en su escuela para cerrar el ciclo del agua como en una base espacial?',
      teaser: 'Las bombas de agua necesitan energía… ¿qué pasa si el Sol desaparece por días?',
    },
    unlock: 'recycler',
  },

  darkness: {
    id: 'darkness',
    code: 'M-03',
    title: 'DARKNESS PROTOCOL',
    titleEs: 'Protocolo Oscuridad',
    color: '#8B7BFF',
    deep: '#231A63',
    emoji: '🌑',
    hook: '¡Se ha perdido el 40% de la energía de la colonia! Tenemos poco tiempo antes de que se agoten las reservas.',
    story:
      'Una tormenta de polvo tapó el Sol. Los paneles producen muy poca energía y la colonia debe reorganizar sus prioridades: cada tripulación diseñará un plan de ahorro sin apagar lo que nos mantiene vivos.',
    objective: 'Crear un plan que no gaste más energía de la que producen los paneles.',
    twist: 'La tormenta dura más de lo previsto.',
    learning: ['Energía solar', 'Almacenamiento', 'Consumo', 'Toma de decisiones'],
    focus: 'energy',
    conceptHint: 'Sumen lo que gasta cada sistema y compárenlo con lo que producen los paneles. El soporte vital nunca se apaga.',
    twists: [
      'Datos nuevos: el polvo bloquea gran parte de la luz solar.',
      'Emergencia global: la tormenta durará más de lo previsto.',
      'Descubrimiento: un remolino de polvo limpió algunos paneles…',
    ],
    quiz: {
      power: {
        q: '¿Por qué una tormenta de polvo reduce la energía de la colonia?',
        options: ['El polvo bloquea la luz del Sol y cubre los paneles', 'El polvo es magnético', 'El viento descarga las baterías'],
        answer: 0,
        explain: 'Los paneles solares necesitan luz. El polvo en el aire y sobre los paneles reduce la energía que producen.',
      },
      life: {
        q: '¿Qué sistema NUNCA debemos apagar en una base espacial?',
        options: ['El soporte vital: oxígeno y aire', 'La música', 'Las pantallas'],
        answer: 0,
        explain: 'Sin soporte vital no hay aire que respirar. Siempre es la primera prioridad.',
      },
      bio: {
        q: 'Marte recibe menos luz solar que la Tierra porque…',
        options: ['Está más lejos del Sol', 'Es más pequeño', 'Es de color rojo'],
        answer: 0,
        explain: 'Al estar más lejos, Marte recibe menos de la mitad de la luz solar que llega a la Tierra.',
      },
      habitat: {
        q: '¿Para qué sirve una batería en la colonia?',
        options: ['Para guardar energía y usarla después', 'Para producir luz solar', 'Para enfriar el hábitat'],
        answer: 0,
        explain: 'Las baterías guardan la energía del día para usarla de noche o durante una tormenta.',
      },
    },
    bonus: {
      q: '¿Qué fuente de energía usan los rovers Curiosity y Perseverance que no depende del Sol?',
      options: ['Un generador nuclear de radioisótopos', 'Paneles solares gigantes', 'Pedales'],
      answer: 0,
      explain: 'Usan un generador que convierte en electricidad el calor del plutonio. Funciona de día, de noche y con tormentas.',
    },
    event: {
      title: 'LA TORMENTA SE EXTIENDE',
      narrative:
        'La tormenta durará varios sols más de lo previsto. Las baterías de la colonia no alcanzarán… a menos que los sectores compartan su energía guardada.',
      shareLabel: 'Compartir batería con la red',
      shareUnit: '🔋',
      actions: {
        power: { verb: 'Orienta los paneles', emoji: '☀️', hint: 'Toca para atrapar cada rayo de luz' },
        life: { verb: 'Recicla el aire', emoji: '🫧', hint: 'Toca para mantener el oxígeno' },
        bio: { verb: 'Luces de emergencia', emoji: '💡', hint: 'Toca para encender los LED' },
        habitat: { verb: 'Aísla los muros', emoji: '🧱', hint: 'Toca para guardar el calor' },
      },
      savedText: '¡La colonia sobrevivió a la oscuridad compartiendo sus baterías!',
      failText: 'Las reservas se agotaron y algunos sistemas tuvieron que apagarse.',
    },
    debrief: {
      learnings: [
        'Marte recibe menos de la mitad de la luz solar que la Tierra porque está más lejos del Sol; las tormentas de polvo la reducen todavía más.',
        'Las baterías guardan energía para usarla cuando no hay Sol: de noche o durante una tormenta.',
        'Ahorrar energía significa decidir prioridades. El soporte vital siempre va primero.',
      ],
      nasaFact:
        'En 2018 una tormenta de polvo que cubrió casi todo Marte dejó sin energía al rover Opportunity, que funcionaba con paneles solares. Nunca volvió a comunicarse.',
      reflection: '¿Qué aparatos de su casa podrían apagar si tuvieran que ahorrar energía como en Marte?',
      teaser: 'Durante la tormenta, una antena captó algo extraño… una señal que se repite.',
    },
    unlock: 'reactor',
  },

  signal: {
    id: 'signal',
    code: 'M-04',
    title: 'THE UNKNOWN SIGNAL',
    titleEs: 'La señal desconocida',
    color: '#D06BFF',
    deep: '#4A1670',
    emoji: '📡',
    hook: 'Una estación de investigación capta una señal desconocida que se repite cada pocos minutos desde un cañón cercano.',
    story:
      '¿Enviamos un rover a investigar? Cada tripulación debe planear la expedición con datos reales de su equipo: distancia, batería, clima y tiempo para tomar muestras.',
    objective: 'Planear una expedición segura que consiga la mayor cantidad de información.',
    twist: 'La señal cambia de frecuencia y la comunicación con el rover se vuelve intermitente.',
    learning: ['Comunicación', 'Ondas', 'Observación', 'Análisis de información'],
    focus: 'habitat',
    conceptHint: 'Calculen ida y vuelta: la batería debe alcanzar y el rover debe volver antes de que llegue la tormenta.',
    twists: [
      'Datos nuevos: la señal se repite cada 7 minutos.',
      'Emergencia global: la señal cambia de frecuencia y la comunicación se corta.',
      'Descubrimiento: ¡la señal venía de una vieja sonda perdida!',
    ],
    quiz: {
      power: {
        q: 'Las señales de radio viajan a la velocidad de…',
        options: ['La luz', 'El sonido', 'Un cohete'],
        answer: 0,
        explain: 'Las ondas de radio son ondas electromagnéticas, igual que la luz: viajan a unos 300 000 km por segundo.',
      },
      life: {
        q: '¿Cuánto tarda un mensaje de radio en llegar de la Tierra a Marte?',
        options: ['Entre 3 y 22 minutos', '1 segundo', '3 días'],
        answer: 0,
        explain: 'Depende de dónde estén los planetas en su órbita: entre unos 3 y 22 minutos, solo de ida.',
      },
      bio: {
        q: '¿Por qué un rover avanza despacio y planea cada movimiento?',
        options: ['Porque nadie puede ir a repararlo si se daña', 'Porque se cansa', 'Porque Marte no tiene gravedad'],
        answer: 0,
        explain: 'Un rover está solo a millones de kilómetros. Cada paso se planea para no atascarse ni romperse.',
      },
      habitat: {
        q: 'Si una onda vibra más rápido (tiene más frecuencia), su longitud de onda es…',
        options: ['Más corta', 'Más larga', 'Igual'],
        answer: 0,
        explain: 'A mayor frecuencia, menor longitud de onda. Las antenas se diseñan según la frecuencia que quieren captar.',
      },
    },
    bonus: {
      q: '¿Cómo envían los rovers de Marte la mayor parte de sus datos a la Tierra?',
      options: ['A través de orbitadores que funcionan como relevo', 'Por un cable muy largo', 'Con espejos'],
      answer: 0,
      explain: 'Orbitadores como el Mars Reconnaissance Orbiter reciben los datos del rover y los reenvían a la Tierra.',
    },
    event: {
      title: 'SEÑAL INTERMITENTE',
      narrative:
        'La señal cambió de frecuencia y la comunicación con los rovers se corta. La antena principal necesita energía de todos los sectores para sintonizarla.',
      shareLabel: 'Prestar energía a la antena principal',
      shareUnit: '📡',
      actions: {
        power: { verb: 'Carga la antena', emoji: '🔋', hint: 'Toca para mandar energía' },
        life: { verb: 'Enfría el sistema', emoji: '🌡️', hint: 'Toca para evitar el sobrecalentamiento' },
        bio: { verb: 'Analiza la señal', emoji: '🔬', hint: 'Toca para descifrar el patrón' },
        habitat: { verb: 'Orienta el plato', emoji: '📡', hint: 'Toca para apuntar la antena' },
      },
      savedText: '¡Sintonizamos la frecuencia y recuperamos el contacto con todos los rovers!',
      failText: 'La señal se perdió un tiempo y algunos rovers quedaron incomunicados.',
    },
    debrief: {
      learnings: [
        'Las ondas de radio viajan a la velocidad de la luz y, aun así, un mensaje entre la Tierra y Marte tarda entre 3 y 22 minutos.',
        'Por eso los rovers deben ser autónomos: no pueden esperar instrucciones para cada paso.',
        'Una buena expedición se planea con datos: distancia, energía, clima y tiempo.',
      ],
      nasaFact:
        'Los rovers en Marte casi siempre envían sus datos a la Tierra a través de orbitadores, como el Mars Reconnaissance Orbiter, que funcionan como antenas de relevo.',
      reflection: 'Si cada mensaje tardara 20 minutos en llegar, ¿cómo cambiaría su forma de comunicarse?',
      teaser: 'La sonda perdida traía planos de un hábitat… ¡y llegan nuevos colonos!',
    },
    unlock: 'antenna',
    disclaimer: 'La señal es un recurso ficticio de la historia, no una afirmación sobre señales extraterrestres reales.',
  },

  habitat: {
    id: 'habitat',
    code: 'M-05',
    title: 'HABITAT ZERO',
    titleEs: 'Hábitat Cero',
    color: '#FF7A59',
    deep: '#7A2414',
    emoji: '🏗️',
    hook: '¡Una nave con nuevos colonos está por aterrizar y no hay dónde alojarlos!',
    story:
      'La colonia necesita crecer. Cada tripulación diseñará virtualmente un nuevo módulo: debe caber en el terreno, usar poca energía, alojar a todos y proteger de la radiación.',
    objective: 'Elegir el diseño de módulo que cumpla todas las condiciones.',
    twist: 'El espacio protegido es limitado y habrá que negociar cómo repartirlo.',
    learning: ['Diseño', 'Arquitectura', 'Sostenibilidad', 'Planificación'],
    focus: 'habitat',
    conceptHint: 'Un buen hábitat equilibra espacio, energía, capacidad y protección. Cada especialidad revisa una condición.',
    twists: [
      'Datos nuevos: el terreno estable es más pequeño de lo esperado.',
      'Emergencia global: no hay espacio protegido para todos los módulos.',
      'Descubrimiento: el radar encontró un tubo de lava gigante…',
    ],
    quiz: {
      power: {
        q: '¿Qué formas resisten mejor la presión del aire dentro de un hábitat?',
        options: ['Domos y cilindros redondeados', 'Cubos con esquinas', 'Pirámides de papel'],
        answer: 0,
        explain: 'Las formas redondeadas reparten la presión de manera uniforme; las esquinas concentran el esfuerzo.',
      },
      life: {
        q: '¿Para qué sirve una esclusa (airlock) en un hábitat?',
        options: ['Para entrar y salir sin perder el aire', 'Para guardar comida', 'Para hacer ejercicio'],
        answer: 0,
        explain: 'La esclusa tiene dos puertas: así se puede salir a la superficie sin que escape el aire de la base.',
      },
      bio: {
        q: '¿Por qué en Marte se necesita protección extra contra la radiación?',
        options: ['Marte no tiene un campo magnético global ni una atmósfera gruesa', 'Porque Marte es muy caliente', 'Por las tormentas de lluvia'],
        answer: 0,
        explain: 'La Tierra nos protege con su campo magnético y su atmósfera. En Marte hay que blindar los hábitats.',
      },
      habitat: {
        q: '¿Qué material local podría usarse para construir con impresoras 3D en Marte?',
        options: ['Regolito, el suelo marciano', 'Madera de árboles marcianos', 'Hielo de Júpiter'],
        answer: 0,
        explain: 'Usar materiales del lugar ahorra muchísimos viajes desde la Tierra. La NASA ha probado hábitats impresos en 3D.',
      },
    },
    bonus: {
      q: '¿Cómo se llama la misión de la NASA donde cuatro voluntarios vivieron un año en un hábitat de Marte impreso en 3D?',
      options: ['CHAPEA', 'Apollo 11', 'Hubble'],
      answer: 0,
      explain: 'En CHAPEA vivieron 378 días en Mars Dune Alpha, un hábitat impreso en 3D en Houston.',
    },
    event: {
      title: 'ESPACIO LIMITADO',
      narrative:
        'Llegaron más colonos de los esperados y solo queda espacio protegido para algunos módulos. Si los sectores ceden un poco de su espacio, todos tendrán refugio.',
      shareLabel: 'Ceder espacio protegido',
      shareUnit: '🧱',
      actions: {
        power: { verb: 'Conecta los cables', emoji: '🔌', hint: 'Toca para llevar energía al módulo' },
        life: { verb: 'Presuriza el módulo', emoji: '🎈', hint: 'Toca para llenarlo de aire' },
        bio: { verb: 'Muda los cultivos', emoji: '🪴', hint: 'Toca para mover cada maceta' },
        habitat: { verb: 'Ensambla paneles', emoji: '🔩', hint: 'Toca para unir las piezas' },
      },
      savedText: '¡Todos los colonos tienen un refugio seguro gracias a los sectores que cedieron espacio!',
      failText: 'No hubo espacio para todos y algunos colonos durmieron en la nave.',
    },
    debrief: {
      learnings: [
        'Las formas redondeadas, como domos y cilindros, resisten mejor la presión del aire dentro de un hábitat.',
        'Marte no tiene un campo magnético global ni una atmósfera gruesa: los hábitats necesitan blindaje, por ejemplo con regolito o agua.',
        'Diseñar es equilibrar: no existe un módulo perfecto, sino el que mejor cumple las condiciones.',
      ],
      nasaFact:
        'En la misión CHAPEA de la NASA, cuatro voluntarios vivieron 378 días en Mars Dune Alpha, un hábitat impreso en 3D en Houston que simula una base en Marte.',
      reflection: 'Si diseñaran su propio módulo, ¿qué no podría faltar?',
      teaser: 'Con todos los sistemas funcionando… ¿podrá la colonia sobrevivir sola una misión larga?',
    },
    unlock: 'module',
  },

  final: {
    id: 'final',
    code: 'M-06',
    title: 'THE FINAL COLONY',
    titleEs: 'La colonia final',
    color: '#FFB703',
    deep: '#6B4100',
    emoji: '🌕',
    hook: 'La Tierra no podrá enviar suministros durante 10 sols. La colonia tiene que funcionar sola.',
    story:
      'Llegó la prueba final. Cada plan ayuda a un sistema, pero puede dañar a otro. Solo un plan mantiene en equilibrio la energía, el agua, los alimentos y la protección.',
    objective: 'Encontrar el plan que deja los cuatro sistemas con balance positivo.',
    twist: 'El sistema genera una emergencia conjunta.',
    learning: ['Pensamiento sistémico', 'Colaboración', 'Equilibrio', 'Planeación'],
    focus: 'energy',
    conceptHint: 'Cada plan cambia los cuatro sistemas. Descarten los planes que dejen algún sistema en negativo.',
    twists: [
      'Datos nuevos: la Tierra no enviará suministros en 10 sols.',
      'Emergencia global: tormenta solar y fuga de aire al mismo tiempo.',
      'Descubrimiento: la colonia es autosuficiente… ¡y la Luna nos llama!',
    ],
    quiz: {
      power: {
        q: 'Si la energía de la colonia falla, ¿qué sistemas se afectan?',
        options: ['Todos: agua, oxígeno, calefacción y cultivos', 'Ninguno', 'Solo las luces'],
        answer: 0,
        explain: 'Todo en una base espacial necesita energía: bombas, recicladoras, calefacción y luces de cultivo.',
      },
      life: {
        q: 'Un sistema de soporte vital "cerrado" es aquel que…',
        options: ['Recicla el aire y el agua una y otra vez', 'Nunca se abre', 'No necesita energía'],
        answer: 0,
        explain: 'En un sistema cerrado casi nada se tira: el agua y el aire se limpian y se vuelven a usar.',
      },
      bio: {
        q: 'En un ecosistema, las plantas son…',
        options: ['Productores: fabrican su propio alimento', 'Consumidores', 'Descomponedores'],
        answer: 0,
        explain: 'Las plantas producen alimento con la luz del Sol; de ellas dependen los demás seres vivos del ecosistema.',
      },
      habitat: {
        q: '¿Qué pasa si un sistema de la colonia gasta más de lo que produce?',
        options: ['Sus reservas bajan hasta agotarse', 'Produce más por sí solo', 'No pasa nada'],
        answer: 0,
        explain: 'Un balance negativo vacía las reservas poco a poco. Por eso cada plan debe cuidar el equilibrio.',
      },
    },
    bonus: {
      q: '¿Cómo se llama el experimento del rover Perseverance que produjo oxígeno en Marte?',
      options: ['MOXIE', 'VEGGIE', 'ROVER-O2'],
      answer: 0,
      explain: 'En 2021 MOXIE convirtió dióxido de carbono marciano en oxígeno por primera vez.',
    },
    event: {
      title: 'EMERGENCIA CONJUNTA',
      narrative:
        'Una tormenta solar y una fuga de aire golpean la colonia al mismo tiempo. Solo si todos los sectores comparten reservas la colonia resistirá.',
      shareLabel: 'Compartir reservas con toda la colonia',
      shareUnit: '⭐',
      actions: {
        power: { verb: 'Reparte la energía', emoji: '⚡', hint: 'Toca para mandar energía a la red' },
        life: { verb: 'Sella la fuga de aire', emoji: '🫧', hint: 'Toca para tapar la fuga' },
        bio: { verb: 'Protege los cultivos', emoji: '🌿', hint: 'Toca para cubrirlos' },
        habitat: { verb: 'Refuerza el escudo', emoji: '🛡️', hint: 'Toca para blindar los refugios' },
      },
      savedText: '¡La colonia resistió la emergencia conjunta! Somos autosuficientes.',
      failText: 'La colonia resistió con daños: habrá que reconstruir algunos sectores.',
    },
    debrief: {
      learnings: [
        'En una colonia todos los sistemas están conectados: si la energía falla, también fallan el agua, el aire y los cultivos.',
        'Un sistema que gasta más de lo que produce agota sus reservas; el equilibrio es la clave para sobrevivir.',
        'Las mejores decisiones salen de combinar la información de todas las especialidades.',
      ],
      nasaFact:
        'En 2021 el experimento MOXIE del rover Perseverance produjo oxígeno a partir del CO₂ de la atmósfera marciana por primera vez: una tecnología clave para futuras colonias.',
      reflection: '¿Qué aprendieron de trabajar como una sola colonia?',
      teaser: 'Capítulo 2 desbloqueado: la Luna. Nuevos retos, nuevas tripulaciones.',
    },
    unlock: 'city',
    requires: 3,
  },
};

/* ------------------------------------------------------------------ */
/* Descubrimientos misteriosos                                          */
/* ------------------------------------------------------------------ */

export const MYSTERY_POOL: { label: string; emoji: string; text: string }[] = [
  { label: 'Meteorito de hierro', emoji: '☄️', text: 'Un meteorito metálico, como el que encontró el rover Opportunity en 2005.' },
  { label: 'Tubo de lava', emoji: '🕳️', text: 'Un túnel natural de lava antigua: un refugio perfecto contra la radiación.' },
  { label: 'Hielo bajo el suelo', emoji: '🧊', text: 'Hielo escondido a pocos centímetros, como el que descubrió la sonda Phoenix en 2008.' },
  { label: 'Remolino de polvo', emoji: '🌪️', text: 'Un remolino que limpia paneles solares, como les pasó a los rovers Spirit y Opportunity.' },
  { label: 'Roca con capas', emoji: '🪨', text: 'Capas de sedimento que cuentan que hace mucho tiempo hubo agua líquida en Marte.' },
  { label: 'Arándanos marcianos', emoji: '🫐', text: 'Esferitas de hematita como las que encontró Opportunity en 2004; se formaron con ayuda del agua.' },
];

/* ------------------------------------------------------------------ */
/* Valores iniciales y utilidades                                       */
/* ------------------------------------------------------------------ */

export const START_METERS: Meters = { energy: 72, water: 64, food: 60, habitat: 70 };

export const BOT_NAMES = [
  'Sofía', 'Mateo', 'Valentina', 'Santiago', 'Camila', 'Leonardo', 'Ximena', 'Regina',
  'Emiliano', 'Renata', 'Iker', 'Fernanda', 'Gael', 'Mía', 'Sebastián', 'Itzel',
  'Kenji', 'Zoe', 'Tadeo', 'Naomi', 'Bruno', 'Maya', 'Luca', 'Danna',
  'Thiago', 'Aitana', 'Elías', 'Julia', 'Andrés', 'Lía', 'Pablo', 'Nicole',
];

export const BOT_LOGS = [
  'Juntamos los cuatro datos y descartamos las opciones que no cumplían.',
  'Elegimos esta opción porque es la única que no rompe ninguna condición.',
  'Cada quien dijo su número y así encontramos la respuesta.',
  'Pensamos en toda la colonia y no solo en nuestro sector.',
];

export function missionForCategory(category: CategoryId): MissionId {
  return CATEGORIES[category]?.missionId ?? 'greenhouse';
}

export function levelFromXp(xp: number): { level: number; title: string; progress: number; next: number } {
  const per = 400;
  const level = Math.floor(xp / per) + 1;
  const titles = ['Cadete', 'Exploradora/or', 'Piloto', 'Especialista', 'Comandante', 'Leyenda espacial'];
  return { level, title: titles[Math.min(titles.length - 1, level - 1)], progress: (xp % per) / per, next: per - (xp % per) };
}
