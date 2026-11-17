// Minar y fabricar: en la exploración, cada especialidad sale a minar recursos del planeta
// (regolito, hielo y hematita) y en su estación fabrica la pieza que resuelve su parte de la
// misión. Es lo que la NASA llama ISRU: usar lo que hay en Marte en vez de traerlo de la Tierra.
//
// Las cantidades son múltiplos de lo que da cada depósito del mundo 3D (3 de regolito, 2 de
// hielo y 2 de hematita por golpe), así que cada receta pide entre 3 y 5 viajes de minería.
//
// Puntos: minar lo que pide la receta vale MINE_POINTS y fabricar la pieza, CRAFT_POINTS.
// Juntos suman TASK_GOAL, así que el motor, las dependencias entre especialidades y el
// avance que ve el proyector funcionan igual que con cualquier otra tarea.

import { TASK_GOAL } from './roleTasks';
import type { MissionId, RoleId } from './types';

export type MineralId = 'regolith' | 'ice' | 'metal';

export const MINERAL_ORDER: MineralId[] = ['regolith', 'ice', 'metal'];

export const MINERALS: Record<MineralId, { name: string; emoji: string; color: string; where: string }> = {
  regolith: { name: 'Regolito', emoji: '🟧', color: '#E2683C', where: 'el suelo suelto de Marte (está en todas partes)' },
  ice: { name: 'Hielo', emoji: '🧊', color: '#7FDBFF', where: 'hielo enterrado (brilla azul en el suelo)' },
  metal: { name: 'Hematita', emoji: '🔩', color: '#6F7FB8', where: 'rocas oscuras de hierro, como las que encontró Opportunity' },
};

/** Lo que da cada golpe de pico en un depósito (igual que en el modo libre). */
export const MINE_YIELD: Record<MineralId, number> = { regolith: 3, ice: 2, metal: 2 };

export const MINE_POINTS = 12;
export const CRAFT_POINTS = TASK_GOAL - MINE_POINTS;

export interface Recipe {
  item: string;
  emoji: string;
  needs: Partial<Record<MineralId, number>>;
  /** Cómo se hace con recursos de Marte (en palabras para niñas y niños). */
  how: string;
}

const R = (item: string, emoji: string, needs: Recipe['needs'], how: string): Recipe => ({ item, emoji, needs, how });

export const RECIPES: Record<MissionId, Record<RoleId, Recipe>> = {
  greenhouse: {
    power: R('Lámparas LED de cultivo', '💡', { metal: 4, regolith: 3 }, 'El hierro de la hematita hace los soportes y la sílice del regolito, fundida, se vuelve el vidrio de las lámparas.'),
    life: R('Riego por goteo', '🚿', { ice: 4, metal: 2 }, 'El hielo derretido viaja por tubos de hierro y cae gota a gota: así no se desperdicia nada de agua.'),
    bio: R('Sustrato de cultivo', '🪴', { regolith: 6, ice: 2 }, 'El regolito lavado se mezcla con agua y nutrientes para que las raíces crezcan en suelo marciano.'),
    habitat: R('Domo sellado', '🛖', { regolith: 6, metal: 2 }, 'Un domo impreso en 3D con regolito guarda el aire y el calor del invernadero.'),
  },
  water: {
    power: R('Calentador de hielo', '🔥', { metal: 4, regolith: 3 }, 'Una resistencia de hierro calienta el hielo del suelo hasta convertirlo en agua.'),
    life: R('Filtro de agua', '🧪', { regolith: 3, ice: 4 }, 'Capas de regolito atrapan el polvo y las sales: el agua sale lista para beber.'),
    bio: R('Cubierta anti-evaporación', '🍃', { regolith: 6, ice: 2 }, 'Una capa de regolito sobre la tierra de cultivo evita que el agua se escape al aire tan seco.'),
    habitat: R('Parche para la fuga', '🩹', { metal: 4, regolith: 3 }, 'Una placa de hierro sellada con regolito tapa la grieta del depósito de agua.'),
  },
  darkness: {
    power: R('Batería de hierro y aire', '🔋', { metal: 4, ice: 2 }, 'Las baterías de hierro y aire guardan energía con hierro, agua y oxígeno: perfectas para la noche.'),
    life: R('Celda de oxígeno', '🫧', { ice: 4, metal: 2 }, 'Con electricidad, el agua del hielo se separa en hidrógeno y oxígeno para respirar (electrólisis).'),
    bio: R('Lámpara de bajo consumo', '🌱', { metal: 4, regolith: 3 }, 'Luz roja y azul que gasta poquita energía (justo la que usan las plantas para la fotosíntesis), con carcasa de hierro y vidrio de regolito.'),
    habitat: R('Aislante térmico', '🧱', { regolith: 6, metal: 2 }, 'Una capa gruesa de regolito guarda el calor del hábitat durante la noche marciana.'),
  },
  signal: {
    power: R('Batería del rover', '🔋', { metal: 4, regolith: 3 }, 'Un paquete de baterías más grande le da al rover el alcance para llegar hasta la señal.'),
    life: R('Tanques de oxígeno', '🧯', { ice: 4, metal: 2 }, 'El oxígeno sale del hielo y se guarda en tanques de metal para la expedición.'),
    bio: R('Kit de muestras', '🧫', { metal: 2, regolith: 3, ice: 2 }, 'Frascos sellados para traer muestras sin contaminarlas, como los tubos del rover Perseverance.'),
    habitat: R('Antena reparada', '📡', { metal: 4, regolith: 3 }, 'Un plato de metal bien orientado recupera la comunicación con el rover.'),
  },
  habitat: {
    power: R('Paneles del módulo', '☀️', { metal: 4, regolith: 3 }, 'Con la sílice del regolito y el hierro se arman paneles solares para el nuevo módulo.'),
    life: R('Tanques-escudo de agua', '🛢️', { ice: 4, metal: 2 }, 'El agua frena la radiación: tanques llenos alrededor del refugio protegen a la tripulación.'),
    bio: R('Huerto del refugio', '🥬', { regolith: 3, ice: 4 }, 'Un huerto dentro del refugio da comida fresca sin salir a la radiación.'),
    habitat: R('Ladrillos de regolito', '🧱', { regolith: 6, metal: 2 }, 'Ladrillos horneados con regolito: un metro encima del hábitat bloquea gran parte de la radiación.'),
  },
  final: {
    power: R('Red eléctrica', '⚡', { metal: 4, regolith: 3 }, 'Cables y torres de hierro reparten la energía a toda la colonia.'),
    life: R('Reciclador de agua y aire', '♻️', { ice: 4, metal: 2 }, 'Recupera casi toda el agua y limpia el aire, como en la Estación Espacial Internacional.'),
    bio: R('Invernadero autosuficiente', '🌿', { regolith: 3, ice: 4 }, 'Plantas que dan comida y oxígeno, regadas con agua reciclada.'),
    habitat: R('Muralla de regolito', '🏰', { regolith: 6, metal: 2 }, 'Una muralla impresa en 3D protege la colonia del polvo y de la radiación.'),
  },
};

export type Bag = Record<MineralId, number>;

export const emptyBag = (): Bag => ({ regolith: 0, ice: 0, metal: 0 });

/** Unidades que pide la receta en total. */
export const recipeUnits = (r: Recipe): number => MINERAL_ORDER.reduce((s, m) => s + (r.needs[m] ?? 0), 0);

/** Cuánto de lo que pide la receta ya está en la mochila (lo que sobra no cuenta). */
export const unitsReady = (r: Recipe, bag: Bag): number => MINERAL_ORDER.reduce((s, m) => s + Math.min(bag[m], r.needs[m] ?? 0), 0);

export const canCraft = (r: Recipe, bag: Bag): boolean => MINERAL_ORDER.every((m) => bag[m] >= (r.needs[m] ?? 0));

/** Puntos de minería que corresponden a lo que hay en la mochila. */
export const minedPoints = (r: Recipe, bag: Bag): number => Math.floor((MINE_POINTS * unitsReady(r, bag)) / Math.max(1, recipeUnits(r)));

/** El recurso que falta y conviene ir a buscar primero (el que más falta). */
export function nextMineral(r: Recipe, bag: Bag): MineralId | null {
  let best: MineralId | null = null;
  let gap = 0;
  for (const m of MINERAL_ORDER) {
    const g = (r.needs[m] ?? 0) - bag[m];
    if (g > gap) {
      gap = g;
      best = m;
    }
  }
  return best;
}

/**
 * Qué está haciendo una especialidad según sus puntos (los ve el proyector, que solo sabe
 * puntos): minando, lista para fabricar o con la pieza fabricada.
 */
export function craftStage(points: number): 'mining' | 'crafting' | 'done' {
  if (points >= TASK_GOAL) return 'done';
  if (points >= MINE_POINTS) return 'crafting';
  return 'mining';
}
