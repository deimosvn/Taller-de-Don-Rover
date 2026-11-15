// Dirección de arte del mundo 3D.
//
// La referencia es un "planeta diminuto": formas redondas y blandas, color plano con
// degradados suaves, manchas circulares claras sobre el suelo, transiciones difuminadas
// entre zonas, cielo luminoso que palidece hacia el horizonte y sombras teñidas (nunca negras).
// Aquí ese mismo tratamiento se traduce a Marte usando los tonos que IXCHEL ya define en
// global.css (--mars-*, --sand-*, colores de los cuatro sistemas, tinta y crema).
//
//   Referencia (Tierra)            →  MARS-01
//   césped lima con burbujas       →  regolito terracota con burbujas durazno
//   claros amarillos al sol        →  campos de dunas ocre
//   estanques azules difuminados   →  llanuras de basalto + placas de hielo celeste
//   piedras grises moteadas        →  roca malva-óxido con estratos
//   cielo cian → blanco menta      →  cielo durazno → crema (día) / noche IXCHEL (atardecer)
//   sombras oliva                  →  sombras ciruela

export const INK = '#211A4A';
export const WHITE = '#F4F5FB';
export const GREY = '#C9CCE0';
export const CREAM = '#FFF8EC';
export const MOON = '#FFF4DC';

export const TERRAIN = {
  regolith: '#DB6A3C',
  regolithLight: '#F3935C',
  regolithDark: '#BC5230',
  dune: '#EBA75E',
  duneLight: '#F9CC8C',
  basalt: '#8A3A26',
  basaltDark: '#632619',
  rock: '#A95A40',
  rockDark: '#823D2A',
  rockLight: '#DD9466',
  ice: '#D6F4F8',
  iceShade: '#86D2EA',
  frost: '#FBE6D6',
  colony: '#EC8C56',
  hex: '#FFE3C8',
  cavity: '#7C3540',
} as const;

export const PROPS = {
  mound: '#EE8B55',
  moundLight: '#F9B07A',
  boulder: '#9A6464',
  boulderDark: '#6F4350',
  pebble: '#B8684A',
  hematite: '#5C6FA8',
  meteorite: '#3D3550',
} as const;

export const SYSTEM_COLORS = {
  energy: '#FFC93C',
  water: '#3CC8FF',
  food: '#55DB7A',
  habitat: '#FF6B5B',
} as const;

export const IX_PURPLE = '#B69CFF';

export type LightingId = 'day' | 'dusk';

export interface LightingPreset {
  id: LightingId;
  label: string;
  /** Cielo: cenit → medio → horizonte, y bruma bajo el horizonte. */
  zenith: string;
  mid: string;
  horizon: string;
  haze: string;
  /** Vetas y nubes suaves del cielo. */
  streak: string;
  streakAlpha: number;
  /** Luz principal. */
  sun: string;
  sunIntensity: number;
  /** Elevación del sol sobre el horizonte local (grados). */
  sunElevation: number;
  /** Luz ambiente (cielo / rebote del suelo). */
  skyLight: string;
  groundLight: string;
  ambientIntensity: number;
  /** Bruma atmosférica. */
  fog: string;
  fogDensity: number;
  /** Brillo de ventanas y balizas. */
  glow: number;
}

export const LIGHTING: Record<LightingId, LightingPreset> = {
  day: {
    id: 'day',
    label: 'Día marciano',
    zenith: '#EFA06C',
    mid: '#F8C594',
    horizon: '#FFF1DE',
    haze: '#FFE9D2',
    streak: '#FFFFFF',
    streakAlpha: 0.5,
    sun: '#FFF3E0',
    sunIntensity: 2.45,
    sunElevation: 52,
    skyLight: '#FFE7CF',
    groundLight: '#9A4F62',
    ambientIntensity: 1.55,
    fog: '#FFE6CC',
    fogDensity: 1,
    glow: 0.55,
  },
  dusk: {
    id: 'dusk',
    label: 'Atardecer',
    zenith: '#0B0F38',
    mid: '#3A2468',
    horizon: '#E58A55',
    haze: '#B4553A',
    streak: '#FFB98A',
    streakAlpha: 0.32,
    sun: '#FFB27A',
    sunIntensity: 1.75,
    sunElevation: 17,
    skyLight: '#8E7BD8',
    groundLight: '#5A2440',
    ambientIntensity: 1.15,
    fog: '#C4633F',
    fogDensity: 1.25,
    glow: 1.6,
  },
};

/** Ajustes que los estados del juego aplican encima de la iluminación elegida. */
export const WEATHER = {
  storm: { tint: '#D9733F', fog: 3.4, sun: 0.55, ambient: 0.9 },
  dark: { tint: '#0A0C2E', fog: 1.5, sun: 0.22, ambient: 0.5 },
} as const;
