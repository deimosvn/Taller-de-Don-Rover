// Catálogo del modo libre: recursos que se recolectan en Marte y módulos de la colonia que se
// construyen con ellos. Igual que en las misiones de la NASA, todo sale del planeta (ISRU):
// regolito para las estructuras, hielo para el agua y el aire, hematita para el metal.

import type { SectorId } from '../../../shared/types';

export type ResourceId = 'regolith' | 'ice' | 'metal';

export interface ResourceDef {
  id: ResourceId;
  name: string;
  emoji: string;
  color: string;
  /** Cuánto da cada recolección. */
  yield: number;
  /** Dónde se consigue y para qué sirve. */
  desc: string;
}

export const RESOURCES: Record<ResourceId, ResourceDef> = {
  regolith: { id: 'regolith', name: 'Regolito', emoji: '🟧', color: '#E2683C', yield: 3, desc: 'El suelo suelto de Marte: se imprime en 3D para hacer muros y bases.' },
  ice: { id: 'ice', name: 'Hielo', emoji: '🧊', color: '#7FDBFF', yield: 2, desc: 'Hielo enterrado: da agua para beber, regar y fabricar oxígeno.' },
  metal: { id: 'metal', name: 'Hematita', emoji: '🔩', color: '#6F7FB8', yield: 2, desc: 'Mineral de hierro, como los "arándanos" que encontró Opportunity.' },
};

export const RESOURCE_ORDER: ResourceId[] = ['regolith', 'ice', 'metal'];

/** Lo que una base necesita para funcionar. */
export type Supply = 'energy' | 'water' | 'air' | 'food' | 'beds';

export const SUPPLIES: Record<Supply, { name: string; emoji: string }> = {
  energy: { name: 'Energía', emoji: '⚡' },
  water: { name: 'Agua', emoji: '💧' },
  air: { name: 'Aire', emoji: '🫧' },
  food: { name: 'Comida', emoji: '🌱' },
  beds: { name: 'Camas', emoji: '🛏️' },
};

export const SUPPLY_ORDER: Supply[] = ['energy', 'water', 'air', 'food', 'beds'];

export type ModuleKind = 'solar' | 'battery' | 'extractor' | 'oxygen' | 'greenhouse' | 'habitat' | 'antenna';

export interface ModuleDef {
  kind: ModuleKind;
  name: string;
  emoji: string;
  desc: string;
  cost: Partial<Record<ResourceId, number>>;
  makes: Partial<Record<Supply, number>>;
  uses: Partial<Record<Supply, number>>;
  /** Diseño 3D que reutiliza: el de un sector de la colonia o la antena. */
  design: SectorId | 'antenna';
  /** Escala del modelo en el mundo. */
  scale: number;
  /** Radio del modelo sin escalar (choques y lugar que ocupa). */
  radius: number;
}

export const MODULES: Record<ModuleKind, ModuleDef> = {
  solar: {
    kind: 'solar',
    name: 'Paneles solares',
    emoji: '☀️',
    desc: 'Convierten la luz del Sol en energía. En Marte llega menos de la mitad de luz que en la Tierra.',
    cost: { metal: 3, regolith: 2 },
    makes: { energy: 4 },
    uses: {},
    design: 'solar',
    scale: 0.5,
    radius: 4.4,
  },
  battery: {
    kind: 'battery',
    name: 'Banco de baterías',
    emoji: '🔋',
    desc: 'Guarda energía para la noche y las tormentas de polvo.',
    cost: { metal: 4, regolith: 1 },
    makes: { energy: 2 },
    uses: {},
    design: 'battery',
    scale: 0.5,
    radius: 3.8,
  },
  extractor: {
    kind: 'extractor',
    name: 'Extractor de hielo',
    emoji: '💧',
    desc: 'Calienta el hielo del suelo y lo filtra para sacar agua limpia.',
    cost: { metal: 2, regolith: 2, ice: 1 },
    makes: { water: 4 },
    uses: { energy: 2 },
    design: 'waterplant',
    scale: 0.5,
    radius: 4.0,
  },
  oxygen: {
    kind: 'oxygen',
    name: 'Generador de oxígeno',
    emoji: '🫧',
    desc: 'Separa el oxígeno del aire marciano, como el experimento MOXIE del rover Perseverance.',
    cost: { metal: 2, ice: 2 },
    makes: { air: 4 },
    uses: { energy: 1, water: 1 },
    design: 'oxygen',
    scale: 0.55,
    radius: 3.2,
  },
  greenhouse: {
    kind: 'greenhouse',
    name: 'Invernadero',
    emoji: '🌿',
    desc: 'Domos de vidrio con cultivos: dan comida y un poco de oxígeno.',
    cost: { regolith: 3, ice: 2 },
    makes: { food: 4, air: 1 },
    uses: { energy: 1, water: 2 },
    design: 'greenhouse',
    scale: 0.5,
    radius: 4.2,
  },
  habitat: {
    kind: 'habitat',
    name: 'Domo habitable',
    emoji: '🏠',
    desc: 'Refugio presurizado y cubierto de regolito para dormir protegidos de la radiación.',
    cost: { regolith: 4, metal: 1 },
    makes: { beds: 4 },
    uses: { energy: 1, air: 2, water: 1, food: 2 },
    design: 'habitat',
    scale: 0.55,
    radius: 3.8,
  },
  antenna: {
    kind: 'antenna',
    name: 'Antena',
    emoji: '📡',
    desc: 'Comunica la base con la Tierra. Los mensajes tardan de 3 a 22 minutos en llegar.',
    cost: { metal: 3, regolith: 1 },
    makes: {},
    uses: { energy: 1 },
    design: 'antenna',
    scale: 0.45,
    radius: 4.4,
  },
};

export const MODULE_ORDER: ModuleKind[] = ['solar', 'extractor', 'greenhouse', 'oxygen', 'habitat', 'battery', 'antenna'];

export const isModuleKind = (k: unknown): k is ModuleKind => typeof k === 'string' && k in MODULES;

/** Lo que producen y gastan los módulos de una base. */
export function baseBalance(kinds: readonly ModuleKind[]): Record<Supply, { made: number; used: number }> {
  const out = Object.fromEntries(SUPPLY_ORDER.map((s) => [s, { made: 0, used: 0 }])) as Record<Supply, { made: number; used: number }>;
  for (const k of kinds) {
    const m = MODULES[k];
    for (const s of SUPPLY_ORDER) {
      out[s].made += m.makes[s] ?? 0;
      out[s].used += m.uses[s] ?? 0;
    }
  }
  return out;
}

/**
 * Cambio de un módulo del mundo: id, tipo (null = desmontado), dirección sobre el planeta,
 * rumbo y marca de tiempo (gana el cambio más reciente). Viaja tal cual entre los amigos.
 */
export interface ModuleEdit {
  id: string;
  k: ModuleKind | null;
  d: [number, number, number];
  h: number;
  ts: number;
}

export function isModuleEdit(e: unknown): e is ModuleEdit {
  const m = e as ModuleEdit | null;
  return (
    Boolean(m) &&
    typeof m!.id === 'string' &&
    m!.id.length > 0 &&
    m!.id.length <= 32 &&
    (m!.k === null || isModuleKind(m!.k)) &&
    Array.isArray(m!.d) &&
    m!.d.length === 3 &&
    m!.d.every((n) => Number.isFinite(n) && Math.abs(n) <= 1.01) &&
    Number.isFinite(m!.h) &&
    Number.isFinite(m!.ts)
  );
}
