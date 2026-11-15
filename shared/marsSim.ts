// Física y datos reales de Marte para el Entrenador de Misión.
//
// Todo lo que el juego calcula sale de aquí, con las mismas ecuaciones y los mismos números
// que usa la NASA en sus estudios (cada constante lleva su fuente). Son modelos simplificados
// para niñas y niños —se dice dónde—, pero las unidades y los órdenes de magnitud son reales.
// La IA solo elige el escenario y lo narra: el resultado lo decide esta física.

export interface Fact {
  text: string;
  source: string;
  url: string;
}

/** Marte (NASA Mars Fact Sheet, NSSDCA). */
export const MARS = {
  /** Gravedad en la superficie (m/s²): el 38 % de la terrestre. */
  g: 3.721,
  /** Duración de un sol (s): 24 h 39 min 35 s. */
  solSeconds: 88775.244,
  solHours: 24.6597,
  /** Constante solar a la distancia media de Marte, 1.524 UA (W/m²). En la Tierra: 1361. */
  solarConstant: 586.2,
  eccentricity: 0.0934,
  /** Longitud solar del perihelio (grados). */
  perihelionLs: 251,
  /** Inclinación del eje (grados). */
  obliquity: 25.19,
  /** Presión media en la superficie (Pa): menos del 1 % de la terrestre. */
  pressure: 610,
  /** Temperatura media (°C). */
  meanTemp: -63,
  /** Distancia a la Tierra (millones de km): mínima y máxima. */
  earthMin: 54.6,
  earthMax: 401,
} as const;

/** Lo que una persona necesita cada día (NASA BVAD, NASA/TP-2015-218570, tablas de soporte vital). */
export const HUMAN = {
  /** Oxígeno que respira (kg/día). */
  o2: 0.84,
  /** CO₂ que exhala (kg/día). */
  co2: 1.04,
  /** Agua total: beber, comida e higiene (L/día). */
  water: 11,
  /** Energía de la comida (kcal/día). */
  kcal: 3000,
} as const;

/** Radiación (MSL/RAD: Hassler et al., Science 343, 2014). */
export const RADIATION = {
  /** Dosis equivalente de rayos cósmicos en la superficie de Marte (mSv/día). */
  surface: 0.64,
  /** En el viaje interplanetario (mSv/día). */
  cruise: 1.84,
  /** Límite de carrera de un astronauta de la NASA (mSv), NASA-STD-3001 (2022). */
  careerLimit: 600,
  /** Longitud de atenuación en regolito (m): rayos cósmicos y partículas solares (modelo exponencial simplificado). */
  gcrLength: 1.5,
  speLength: 0.15,
  /** Densidad del regolito suelto (kg/m³). */
  regolithDensity: 1500,
} as const;

/** MOXIE en Perseverance: ~10 g de O₂ por hora con ~300 W (Hoffman et al., Science Advances 2022). */
export const MOXIE = { gramsPerHour: 10, watts: 300, kWhPerKg: 30 } as const;

/** Agua: calor específico del hielo y del agua (kJ/kg·K) y calor de fusión (kJ/kg). */
export const WATER = { cIce: 2.09, cWater: 4.18, fusion: 334, o2PerKg: 0.888, electrolysisKWhPerKgO2: 6.6 } as const;

const DEG = Math.PI / 180;
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

/** Luz solar que llega a lo alto de la atmósfera de Marte según la estación (W/m²). */
export function solarFlux(ls: number): number {
  const e = MARS.eccentricity;
  const r = (1 + e * Math.cos((ls - MARS.perihelionLs) * DEG)) / (1 - e * e);
  return MARS.solarConstant * r * r;
}

/**
 * Fracción de la luz que llega al suelo con polvo de opacidad τ (Sol alto).
 * Ajuste exponencial a las tablas de Appelbaum y Flood, "Solar Radiation on Mars" (NASA TM-102299, 1989):
 * τ = 0.5 (día claro) → 90 %; τ = 1 → 81 %; τ = 3 → 53 %; τ = 5 (tormenta global) → 35 %.
 */
export function dustTransmission(tau: number): number {
  return Math.exp(-0.21 * Math.max(0, tau));
}

/**
 * Energía solar que recibe un panel horizontal en un sol (kWh/m²), para una latitud, una
 * estación (Ls) y un cielo con polvo (τ). Es la integral del coseno del ángulo del Sol a lo
 * largo del día, la misma fórmula que se usa en la Tierra con los datos de Marte.
 */
export function dailyInsolation(latDeg: number, ls: number, tau: number): number {
  const phi = latDeg * DEG;
  const delta = Math.asin(Math.sin(MARS.obliquity * DEG) * Math.sin(ls * DEG));
  const w0 = Math.acos(clamp(-Math.tan(phi) * Math.tan(delta), -1, 1));
  const daily = (MARS.solSeconds / Math.PI) * solarFlux(ls) * (w0 * Math.sin(phi) * Math.sin(delta) + Math.cos(phi) * Math.cos(delta) * Math.sin(w0));
  return (Math.max(0, daily) * dustTransmission(tau)) / 3.6e6;
}

/** Energía para convertir hielo a T °C en agua tibia a `to` °C (kWh por kg). Q = m·(c·ΔT + L + c·ΔT). */
export function meltEnergy(iceTemp: number, to = 20): number {
  return (WATER.cIce * Math.max(0, 0 - iceTemp) + WATER.fusion + WATER.cWater * Math.max(0, to)) / 3600;
}

/** Dosis diaria dentro de un refugio cubierto con `meters` de regolito (mSv/día). */
export function shieldedDose(dose: number, meters: number, length: number = RADIATION.gcrLength): number {
  return dose * Math.exp(-Math.max(0, meters) / length);
}

/** Minutos que tarda una señal de radio (a la velocidad de la luz) en llegar a la Tierra. */
export function signalDelay(millionKm: number): number {
  return (millionKm * 1e6) / 299792.458 / 60;
}

/** Cultivos estudiados por la NASA en cámaras cerradas (Wheeler et al., KSC Biomass Production Chamber). */
export interface Crop {
  id: string;
  name: string;
  emoji: string;
  /** Materia seca comestible con luz plena (g/m²·día). */
  yield: number;
  /** Energía (kcal por gramo seco). */
  kcal: number;
  /** Luz diaria que aprovecha antes de saturarse (mol de fotones/m²·día). */
  dli: number;
  /** Agua que consume y no se recupera (L/m²·día). */
  water: number;
}

export const CROPS: Crop[] = [
  { id: 'papa', name: 'Papa', emoji: '🥔', yield: 28, kcal: 3.7, dli: 36, water: 0.35 },
  { id: 'trigo', name: 'Trigo', emoji: '🌾', yield: 30, kcal: 3.4, dli: 50, water: 0.4 },
  { id: 'soya', name: 'Soya', emoji: '🫘', yield: 13, kcal: 4.5, dli: 30, water: 0.3 },
  { id: 'lechuga', name: 'Lechuga', emoji: '🥬', yield: 7, kcal: 2.9, dli: 17, water: 0.2 },
];

/** Luces LED de cultivo: fotones por m² y segundo, y eficacia (µmol por joule). */
export const GROW_LIGHT = { ppfd: 600, efficacy: 2.5 } as const;

/** Luz diaria integrada (mol/m²·día) para unas horas de lámparas encendidas. */
export const dailyLight = (hours: number) => (GROW_LIGHT.ppfd * hours * 3600) / 1e6;

/** Electricidad de las lámparas (kWh por m² y por sol). */
export const lightEnergy = (hours: number) => ((GROW_LIGHT.ppfd / GROW_LIGHT.efficacy) * hours) / 1000;

/** Datos reales que el juego muestra junto a cada simulador. */
export const FACTS: Record<string, Fact> = {
  solar: {
    text: 'A Marte llega el 43 % de la luz solar que recibe la Tierra: 586 W/m² frente a 1361 W/m². En 2018 una tormenta global de polvo (τ > 10) dejó sin energía al rover Opportunity.',
    source: 'NASA Mars Fact Sheet · Appelbaum y Flood, NASA TM-102299',
    url: 'https://ntrs.nasa.gov/search?q=%22Solar%20radiation%20on%20Mars%22%20Appelbaum%20Flood',
  },
  oxygen: {
    text: 'MOXIE, en el rover Perseverance, fabricó oxígeno con el CO₂ del aire marciano 16 veces: unos 10 gramos por hora, lo que respira un perro pequeño.',
    source: 'NASA/JPL · Hoffman et al., Science Advances (2022)',
    url: 'https://mars.nasa.gov/mars2020/spacecraft/instruments/moxie/',
  },
  water: {
    text: 'La sonda Phoenix tocó hielo de agua a 5 cm bajo el suelo en 2008. En la Estación Espacial se recicla hasta el 98 % del agua, incluido el sudor y la orina.',
    source: 'NASA Phoenix Mars Lander · NASA ECLSS (2023)',
    url: 'https://www.nasa.gov/missions/station/iss-research/nasa-achieves-water-recovery-milestone-on-international-space-station/',
  },
  greenhouse: {
    text: 'En la Cámara de Producción de Biomasa del Centro Kennedy, la NASA cultivó trigo, papa, soya y lechuga con luz artificial: hacen falta unos 40 a 50 m² de cultivo por persona.',
    source: 'Wheeler et al., NASA Kennedy Space Center (BPC)',
    url: 'https://ntrs.nasa.gov/search?q=Wheeler%20Biomass%20Production%20Chamber%20crop%20production',
  },
  shield: {
    text: 'El detector RAD del rover Curiosity midió 0.64 milisieverts por día en la superficie de Marte: unas 230 veces más que en la Tierra. El límite de carrera de un astronauta es 600 mSv.',
    source: 'Hassler et al., Science (2014) · NASA-STD-3001',
    url: 'https://www.science.org/doi/10.1126/science.1244797',
  },
  landing: {
    text: 'Aterrizar en Marte son "7 minutos de terror": la atmósfera es tan delgada que el paracaídas no basta y hacen falta retrocohetes. La gravedad es 3.72 m/s², el 38 % de la terrestre.',
    source: 'NASA/JPL · Entrada, descenso y aterrizaje de Perseverance',
    url: 'https://mars.nasa.gov/mars2020/timeline/landing/entry-descent-landing/',
  },
  comms: {
    text: 'Una señal de radio tarda entre 3 y 22 minutos en viajar de Marte a la Tierra: nadie puede manejar la base con un control remoto en tiempo real.',
    source: 'NASA Deep Space Network',
    url: 'https://www.nasa.gov/directorates/somd/space-communications-navigation-program/deep-space-network/',
  },
};
