// Mochila de minerales del alumno durante la exploración. Vive en memoria (fuera de React),
// así que no se pierde al abrir o cerrar el mundo 3D o el panel de la misión. Si el alumno
// recarga la página, se reconstruye con los puntos que el proyector ya le cuenta.
//
// Cada vez que la mochila cambia, se mandan al proyector solo los puntos nuevos: los de minar
// lo que pide la receta y, al fabricar la pieza, los que faltan para completar la tarea.

import { useEffect, useState } from 'react';
import { MINERAL_ORDER, MINE_POINTS, emptyBag, minedPoints, recipeUnits, type Bag, type MineralId, type Recipe } from '../../../shared/crafting';
import { TASK_GOAL } from '../../../shared/roleTasks';

export interface BagState {
  key: string;
  bag: Bag;
  crafted: boolean;
  /** Puntos ya enviados al proyector. */
  sent: number;
}

let state: BagState = { key: '', bag: emptyBag(), crafted: false, sent: 0 };
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** Lo que había minado según los puntos que ya cuenta el proyector (al recargar la página). */
function bagFromPoints(r: Recipe, points: number): Bag {
  const bag = emptyBag();
  let units = Math.round((Math.min(points, MINE_POINTS) / MINE_POINTS) * recipeUnits(r));
  for (const m of MINERAL_ORDER) {
    const take = Math.min(units, r.needs[m] ?? 0);
    bag[m] = take;
    units -= take;
  }
  return bag;
}

function ensure(key: string, points: number, recipe: Recipe) {
  if (state.key === key) return;
  state = { key, bag: bagFromPoints(recipe, points), crafted: points >= TASK_GOAL, sent: points };
}

export function useBag(key: string, points: number, recipe: Recipe): BagState {
  ensure(key, points, recipe);
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  }, []);
  return state;
}

/** Agrega minerales y devuelve los puntos nuevos que hay que mandar al proyector. */
export function addMineral(key: string, recipe: Recipe, m: MineralId, n: number): number {
  if (state.key !== key || n <= 0) return 0;
  state = { ...state, bag: { ...state.bag, [m]: state.bag[m] + n } };
  const target = state.crafted ? TASK_GOAL : minedPoints(recipe, state.bag);
  const delta = Math.max(0, target - state.sent);
  state.sent += delta;
  emit();
  return delta;
}

/** Fabrica la pieza: gasta lo que pide la receta y devuelve los puntos que faltan. */
export function craft(key: string, recipe: Recipe): number {
  if (state.key !== key || state.crafted) return 0;
  const bag = { ...state.bag };
  for (const m of MINERAL_ORDER) bag[m] = Math.max(0, bag[m] - (recipe.needs[m] ?? 0));
  const delta = Math.max(0, TASK_GOAL - state.sent);
  state = { ...state, bag, crafted: true, sent: state.sent + delta };
  emit();
  return delta;
}

/** Termina la exploración: la próxima misión empieza con la mochila vacía. */
export function resetBag() {
  if (!state.key) return;
  state = { key: '', bag: emptyBag(), crafted: false, sent: 0 };
  emit();
}

export const bagKey = (missionId: string, role: string) => `${missionId}:${role}`;
