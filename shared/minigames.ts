// Minijuegos de la emergencia global: cada especialidad hace una tarea realista de su
// sistema (limpiar paneles, regular la presión, sellar fugas, orientar la antena…) en vez de
// tocar un botón muchas veces. Lo bien que la haga se convierte en "acciones" para el motor,
// así que las reglas, la meta y el balance del juego no cambian.
//
// Los datos científicos de cada tarea están aquí, en un solo lugar, para reemplazarlos o
// enriquecerlos con la base de datos de la NASA cuando esté conectada (ver `science`).

import type { MissionId, RoleId } from './types';

export type MinigameKind = 'scrub' | 'gauge' | 'targets' | 'aim' | 'dose' | 'wires' | 'pattern' | 'budget' | 'switches' | 'tune';

/** Indicador con zona segura, en unidades reales. Mantener presionado lo mueve hacia `push`. */
export interface GaugeSpec {
  label: string;
  unit: string;
  min: number;
  max: number;
  /** Zona segura (verde). */
  low: number;
  high: number;
  start: number;
  /** Hacia dónde mueve la aguja el botón. */
  push: 'up' | 'down';
  /** Rapidez del botón y de la deriva natural (unidades por segundo). */
  rate: number;
  drift: number;
  /** Texto del botón. */
  button: string;
  decimals?: number;
}

export type TargetTheme = 'leak' | 'sprout' | 'heat' | 'pot' | 'crack' | 'hatch';
export type AimTheme = 'sun' | 'earth';
export type DoseTheme = 'drip' | 'led';
export type WiresTheme = 'power' | 'assembly' | 'grid';
export type PatternTheme = 'signal' | 'pumps';
/** Qué se reparte en el minijuego de repartir: energía entre cultivos, agua o recursos. */
export type BudgetTheme = 'crops' | 'water' | 'systems';

export interface MinigameSpec {
  kind: MinigameKind;
  /** Instrucción corta y concreta (qué hacer con el dedo). */
  how: string;
  /** Dato real relacionado (se mostrará el de la base de datos de la NASA cuando exista). */
  science: string;
  /** De dónde viene el dato. */
  source: string;
  gauge?: GaugeSpec;
  targets?: TargetTheme;
  aim?: AimTheme;
  dose?: DoseTheme;
  wires?: WiresTheme;
  pattern?: PatternTheme;
  budget?: BudgetTheme;
}

const SCRUB_PANELS: MinigameSpec = {
  kind: 'scrub',
  how: 'Frota la pantalla para quitar el polvo de cada panel solar.',
  science: 'Los rovers Spirit y Opportunity perdían energía por el polvo en sus paneles; a veces el viento marciano los limpiaba solo.',
  source: 'NASA · Mars Exploration Rovers',
};

export const MINIGAMES: Record<MissionId, Record<RoleId, MinigameSpec>> = {
  greenhouse: {
    power: SCRUB_PANELS,
    life: {
      kind: 'gauge',
      how: 'Mantén presionado para bombear y deja el flujo dentro de la zona verde.',
      science: 'En la Estación Espacial Internacional se recupera cerca del 98 % del agua: cada gota se vuelve a usar.',
      source: 'NASA · Sistema de soporte vital de la EEI',
      gauge: { label: 'Flujo de riego', unit: 'L/min', min: 0, max: 10, low: 4, high: 6, start: 2.5, push: 'up', rate: 3.2, drift: 1.6, button: 'Bombear', decimals: 1 },
    },
    bio: {
      kind: 'targets',
      targets: 'sprout',
      how: 'Toca cada brote antes de que lo alcance la nube de polvo para cubrirlo.',
      science: 'Las tormentas de polvo de Marte pueden cubrir todo el planeta durante semanas y tapar la luz del Sol.',
      source: 'NASA · Tormentas de polvo en Marte',
    },
    habitat: {
      kind: 'targets',
      targets: 'hatch',
      how: 'Toca las compuertas que silban para sellarlas antes de que se escape el aire.',
      science: 'Los hábitats espaciales mantienen dentro una presión de aire parecida a la del nivel del mar en la Tierra.',
      source: 'NASA · Estación Espacial Internacional',
    },
  },
  water: {
    power: {
      kind: 'pattern',
      pattern: 'pumps',
      how: 'Mira el orden en que se encienden las bombas y repítelo.',
      science: 'Las máquinas de la colonia se encienden en un orden fijo para no sobrecargar la red eléctrica, igual que en las naves reales.',
      source: 'NASA · Procedimientos de la EEI',
    },
    life: {
      kind: 'gauge',
      how: 'Mantén presionado para cerrar las válvulas y sube la presión hasta la zona verde.',
      science: 'En la Estación Espacial Internacional se recupera cerca del 98 % del agua: cada gota se vuelve a usar.',
      source: 'NASA · Sistema de soporte vital de la EEI',
      gauge: { label: 'Presión de la red de agua', unit: 'kPa', min: 0, max: 400, low: 200, high: 260, start: 90, push: 'up', rate: 110, drift: 55, button: 'Cerrar válvulas' },
    },
    bio: {
      kind: 'dose',
      dose: 'drip',
      how: 'Mantén presionado para regar cada planta y suelta dentro de la franja verde.',
      science: 'En la Estación Espacial, el experimento Veggie cultiva lechugas en "almohadas" que reciben solo el agua necesaria.',
      source: 'NASA · Experimento Veggie',
    },
    habitat: {
      kind: 'targets',
      targets: 'leak',
      how: 'Toca cada grieta de la tubería para ponerle un parche.',
      science: 'En 2020, los astronautas de la Estación Espacial encontraron una fuga de aire viendo hacia dónde flotaban unas hojitas de té.',
      source: 'NASA · Estación Espacial Internacional',
    },
  },
  darkness: {
    power: {
      kind: 'aim',
      aim: 'sun',
      how: 'Desliza para girar los paneles y seguir al Sol entre el polvo.',
      science: 'Marte recibe menos de la mitad de la luz solar que la Tierra, por eso cada rayo cuenta.',
      source: 'NASA · Datos de Marte',
    },
    life: {
      kind: 'gauge',
      how: 'Mantén presionado para limpiar el aire y baja el CO₂ hasta la zona verde.',
      science: 'En la Estación Espacial, una máquina retira el dióxido de carbono que exhalan los astronautas para que el aire sea seguro.',
      source: 'NASA · Soporte vital de la EEI',
      gauge: { label: 'CO₂ en el aire', unit: '%', min: 0, max: 1.2, low: 0.1, high: 0.4, start: 0.85, push: 'down', rate: 0.36, drift: 0.16, button: 'Limpiar aire', decimals: 2 },
    },
    bio: {
      kind: 'dose',
      dose: 'led',
      how: 'Mantén presionado para encender las luces de cada bandeja y suelta en la franja verde.',
      science: 'Las plantas en el espacio crecen con luces LED rojas y azules: son los colores que más usan para la fotosíntesis.',
      source: 'NASA · Experimento Veggie',
    },
    habitat: {
      kind: 'targets',
      targets: 'heat',
      how: 'La cámara térmica muestra por dónde se escapa el calor: toca cada mancha roja para aislarla.',
      science: 'La temperatura promedio en Marte es de unos −60 °C: un hábitat sin aislamiento perdería su calor muy rápido.',
      source: 'NASA · Datos de Marte',
    },
  },
  signal: {
    power: {
      kind: 'gauge',
      how: 'Mantén presionado para cargar la antena sin pasarte de la zona verde.',
      science: 'Las naves en Marte se comunican con la Tierra mediante la Red del Espacio Profundo de la NASA.',
      source: 'NASA · Deep Space Network',
      gauge: { label: 'Corriente de carga', unit: 'A', min: 0, max: 20, low: 9, high: 12, start: 3, push: 'up', rate: 6.5, drift: 3, button: 'Cargar', decimals: 1 },
    },
    life: {
      kind: 'gauge',
      how: 'Mantén presionado para enfriar el transmisor y mantenlo en la zona verde.',
      science: 'Las naves usan radiadores para soltar al espacio el calor que les sobra.',
      source: 'NASA · Control térmico de la EEI',
      gauge: { label: 'Temperatura del transmisor', unit: '°C', min: 0, max: 100, low: 20, high: 35, start: 78, push: 'down', rate: 32, drift: 15, button: 'Enfriar' },
    },
    bio: {
      kind: 'pattern',
      pattern: 'signal',
      how: 'Escucha y mira el patrón de pulsos de la señal y repítelo para descifrarla.',
      science: 'Un mensaje de radio tarda entre 3 y 22 minutos en viajar entre la Tierra y Marte.',
      source: 'NASA · Comunicaciones con Marte',
    },
    habitat: {
      kind: 'aim',
      aim: 'earth',
      how: 'Desliza para apuntar el plato de la antena hacia la Tierra.',
      science: 'La Red del Espacio Profundo de la NASA usa antenas de hasta 70 metros para escuchar a las naves que están en Marte.',
      source: 'NASA · Deep Space Network',
    },
  },
  habitat: {
    power: {
      kind: 'wires',
      wires: 'power',
      how: 'Toca un conector y luego su pareja del mismo color para llevar energía al módulo.',
      science: 'La Estación Espacial guarda la energía de sus paneles solares en baterías de iones de litio.',
      source: 'NASA · Sistema eléctrico de la EEI',
    },
    life: {
      kind: 'gauge',
      how: 'Mantén presionado para presurizar el módulo hasta la zona verde sin pasarte.',
      science: 'La Estación Espacial mantiene su aire a unos 101 kPa, casi la misma presión que al nivel del mar en la Tierra.',
      source: 'NASA · Estación Espacial Internacional',
      gauge: { label: 'Presión del módulo', unit: 'kPa', min: 0, max: 120, low: 96, high: 106, start: 40, push: 'up', rate: 26, drift: 9, button: 'Presurizar' },
    },
    bio: {
      kind: 'targets',
      targets: 'pot',
      how: 'Toca cada maceta para llevarla al módulo nuevo antes de que se maltrate.',
      science: 'En la Estación Espacial ya se han cultivado lechugas, flores de zinnia y chiles.',
      source: 'NASA · Experimento Veggie',
    },
    habitat: {
      kind: 'wires',
      wires: 'assembly',
      how: 'Toca una pieza y luego la que encaja con ella para ensamblar el módulo.',
      science: 'La NASA ha probado hábitats impresos en 3D, como Mars Dune Alpha en Houston.',
      source: 'NASA · CHAPEA / Mars Dune Alpha',
    },
  },
  final: {
    power: {
      kind: 'wires',
      wires: 'grid',
      how: 'Conecta cada fuente de energía con el sector que la necesita.',
      science: 'La Estación Espacial reparte la energía de sus paneles solares entre todos sus módulos con una red de cables y baterías.',
      source: 'NASA · Sistema eléctrico de la EEI',
    },
    life: {
      kind: 'targets',
      targets: 'leak',
      how: 'Toca cada fuga de aire para sellarla antes de que la presión baje.',
      science: 'En 2020, los astronautas de la Estación Espacial encontraron una fuga de aire viendo hacia dónde flotaban unas hojitas de té.',
      source: 'NASA · Estación Espacial Internacional',
    },
    bio: {
      kind: 'targets',
      targets: 'sprout',
      how: 'Toca cada cultivo en peligro para cubrirlo con su domo.',
      science: 'Las tormentas de polvo de Marte pueden cubrir todo el planeta durante semanas y tapar la luz del Sol.',
      source: 'NASA · Tormentas de polvo en Marte',
    },
    habitat: {
      kind: 'targets',
      targets: 'crack',
      how: 'Toca cada grieta del escudo para reforzarla con regolito.',
      science: 'Una capa de regolito (suelo marciano) sobre los refugios ayuda a proteger a los astronautas de la radiación.',
      source: 'NASA · Hábitats en Marte',
    },
  },
};

export function minigameFor(mission: MissionId | null | undefined, role: RoleId | null | undefined): MinigameSpec {
  if (!mission || !role) return SCRUB_PANELS;
  return MINIGAMES[mission]?.[role] ?? SCRUB_PANELS;
}

/* ------------------------------------------------------------------ */
/* Problemas de la historia                                             */
/* ------------------------------------------------------------------ */
//
// Cada misión plantea un problema en su historia (el invernadero sin energía, la reserva de
// agua vacía, la colonia a oscuras…). Toda la tripulación lo resuelve con un minijuego en una
// estación del mundo 3D (o desde su pantalla) mientras investiga y decide. Lo que logra se
// manda al motor como "reparaciones" y mejora el sistema de la misión en los resultados.
// El acontecimiento inesperado (la emergencia) se resuelve con los minijuegos de cada
// especialidad (`MINIGAMES`).

/** Puntos de minijuego que vale una reparación completa por tripulante. */
export const FIX_GOAL = 15;

export interface MissionProblem {
  emoji: string;
  /** Lo que hay que hacer, en pocas palabras. */
  title: string;
  /** Qué pasó en la historia y por qué hay que resolverlo. */
  text: string;
  /** Dónde está la estación del problema: `sector:<id>`, `building:<id>` o `hub`. */
  station: string;
  /** Nombre del lugar, para orientar al jugador. */
  place: string;
  spec: MinigameSpec;
}

export const MISSION_PROBLEMS: Record<MissionId, MissionProblem> = {
  greenhouse: {
    emoji: '🌱',
    title: 'Reparte la energía del invernadero',
    text: 'La tormenta de polvo bajó la energía solar. Reparte la que queda entre los cultivos para que ninguno se quede sin luz.',
    station: 'sector:greenhouse',
    place: 'Invernaderos',
    spec: {
      kind: 'budget',
      budget: 'crops',
      how: 'Usa + y − para repartir la energía. Cada cultivo necesita la cantidad de su franja verde y no debe sobrar nada.',
      science: 'El experimento Veggie de la NASA cultiva lechugas en la Estación Espacial con luces LED que gastan muy poca energía.',
      source: 'NASA · Experimento Veggie',
    },
  },
  water: {
    emoji: '💧',
    title: 'Raciona el agua de la reserva',
    text: 'La fuga vació parte de la reserva. Reparte el agua que queda entre la tripulación, los cultivos y el generador de oxígeno.',
    station: 'sector:waterplant',
    place: 'Planta de agua',
    spec: {
      kind: 'budget',
      budget: 'water',
      how: 'Usa + y − para repartir el agua del tanque. Cada uso necesita la cantidad de su franja verde y no debe sobrar nada.',
      science: 'En la Estación Espacial Internacional se recupera cerca del 98 % del agua: cada litro se planea con cuidado.',
      source: 'NASA · Sistema de soporte vital de la EEI',
    },
  },
  darkness: {
    emoji: '🌑',
    title: 'Restablece la energía',
    text: 'Los paneles casi no producen. Decide qué sistemas se quedan encendidos sin gastar más energía de la que entra.',
    station: 'sector:solar',
    place: 'Granja solar',
    spec: {
      kind: 'switches',
      how: 'Enciende y apaga sistemas. El soporte vital y la calefacción no se pueden apagar; usa la energía de los paneles sin pasarte ni desperdiciarla.',
      science: 'En 2018 una tormenta de polvo cubrió Marte y dejó sin energía al rover Opportunity: sus paneles casi no recibían luz.',
      source: 'NASA · Mars Exploration Rovers',
    },
  },
  signal: {
    emoji: '📡',
    title: 'Sintoniza la señal del rover',
    text: 'La señal cambia de frecuencia y la comunicación con el rover se corta. Iguala su frecuencia para recibir cada mensaje.',
    station: 'building:antenna',
    place: 'Antena de la colonia',
    spec: {
      kind: 'tune',
      how: 'Desliza para que tu onda quede encima de la señal del rover y mantenla así hasta fijarla. ¡La frecuencia cambia!',
      science: 'Los rovers en Marte mandan casi todos sus datos a orbitadores como el Mars Reconnaissance Orbiter, que los reenvían a la Tierra.',
      source: 'NASA · Red de comunicaciones de Marte',
    },
  },
  habitat: {
    emoji: '🏗️',
    title: 'Arma el módulo nuevo',
    text: 'La colonia necesita crecer. Ensambla las piezas del módulo para que toda la tripulación tenga un lugar protegido.',
    station: 'sector:habitat',
    place: 'Hábitats',
    spec: {
      kind: 'wires',
      wires: 'assembly',
      how: 'Toca una pieza y luego la que encaja con ella para armar el módulo.',
      science: 'La NASA ha probado hábitats impresos en 3D, como Mars Dune Alpha en Houston, donde voluntarios vivieron un año.',
      source: 'NASA · CHAPEA / Mars Dune Alpha',
    },
  },
  final: {
    emoji: '⚖️',
    title: 'Equilibra los cuatro sistemas',
    text: 'Cada plan ayuda a un sistema y puede dañar a otro. Reparte los recursos para que energía, agua, alimentos y protección queden en equilibrio.',
    station: 'hub',
    place: 'Centro de mando',
    spec: {
      kind: 'budget',
      budget: 'systems',
      how: 'Usa + y − para repartir los recursos. Cada sistema necesita la cantidad de su franja verde y no debe sobrar nada.',
      science: 'Una base en Marte tendría que fabricar su propia agua, aire y comida con lo que hay en el planeta: la NASA lo llama ISRU.',
      source: 'NASA · Uso de recursos del lugar (ISRU)',
    },
  },
};
