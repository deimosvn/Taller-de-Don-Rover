// Entrenador de Misión para Astronautas Junior (reto de NASA Space Apps: dirigir una base en
// Marte equilibrando soporte vital, blindaje contra la radiación, energía y comida).
//
// Cada simulador es un problema real de una colonia: el jugador toma decisiones con controles,
// la física de `marsSim.ts` corre la misión sol por sol y se ve si la base sobrevive o falla,
// y por qué. La IA elige y narra el reto; los números y el resultado los pone el motor.

import type { RoleId } from './types';
import { CROPS, GROW_LIGHT, HUMAN, MARS, MOXIE, RADIATION, WATER, dailyInsolation, dailyLight, lightEnergy, meltEnergy, shieldedDose } from './marsSim';
import { makeRng, pick, randInt, randStep, type Rng } from './rng';

export type SimId = 'solar' | 'oxygen' | 'water' | 'greenhouse' | 'shield' | 'landing';
export type Level = 1 | 2 | 3;

export const SIM_ORDER: SimId[] = ['solar', 'oxygen', 'water', 'greenhouse', 'shield', 'landing'];
export const isSimId = (x: unknown): x is SimId => typeof x === 'string' && (SIM_ORDER as string[]).includes(x);

export interface Control {
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  help: string;
  /** Opciones con nombre (en vez de un número). */
  options?: string[];
}

export interface Metric {
  label: string;
  value: number;
  unit: string;
  /** Lo que hace falta (para dibujar la barra). */
  need?: number;
  /** true = más es peor (masa, dosis, energía gastada). */
  lowerIsBetter?: boolean;
  ok: boolean;
}

export interface SimResult {
  ok: boolean;
  stars: 0 | 1 | 2 | 3;
  /** 0–100, para la XP y el perfil de habilidades. */
  score: number;
  /** Sol en el que falló la misión (null si sobrevivió). */
  failedSol: number | null;
  metrics: Metric[];
  /** Una serie por sol para la gráfica (reserva de energía, aire, agua…). */
  series: { label: string; unit: string; values: number[]; floor: number; limit?: number };
  /** Qué pasó, en una frase. */
  verdict: string;
  /** Qué aprender de esta corrida. */
  lesson: string;
  /** Las cuentas, paso a paso, con los números de esta misión. */
  math: string[];
}

export interface Scenario {
  sim: SimId;
  level: Level;
  seed: number;
  /** Números del escenario (los fija el motor, no la IA). */
  p: Record<string, number>;
  /** Acontecimientos por sol, para mostrarlos en la línea de tiempo. */
  events: { sol: number; text: string }[];
}

export interface SimDef {
  id: SimId;
  role: RoleId;
  emoji: string;
  name: string;
  /** Necesidad de la base que entrena (las cuatro del reto + operaciones). */
  need: 'Energía' | 'Soporte vital' | 'Comida' | 'Blindaje' | 'Operaciones';
  /** Clave del dato real en FACTS. */
  fact: string;
  /** Temas para buscar estudios reales (NTRS y OSDR). */
  topics: { ntrs: string; osdr: string };
  objective(s: Scenario): string;
  controls(s: Scenario): Control[];
  run(s: Scenario, input: Record<string, number>): SimResult;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r0 = (x: number) => Math.round(x);
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const SOL_DAYS = MARS.solSeconds / 86400;

function grade(ok: boolean, good: boolean, great: boolean, survived: number, sols: number): Pick<SimResult, 'stars' | 'score'> {
  if (!ok) return { stars: 0, score: r0(45 * clamp(survived / Math.max(1, sols), 0, 1)) };
  const stars = great ? 3 : good ? 2 : 1;
  return { stars, score: stars === 3 ? 100 : stars === 2 ? 85 : 70 };
}

/* ------------------------------------------------------------------ */
/* 1 · Energía: sobrevivir a una tormenta de polvo                     */
/* ------------------------------------------------------------------ */

const PANEL = { eff: 0.27 * 0.9, kgPerM2: 2.5 };
const BATTERY = { kgPerKWh: 5 };

function solarRun(s: Scenario, area: number, battery: number, saving: number) {
  const { load, lat, ls, tauClear, tauStorm, stormStart, stormSols, sols } = s.p;
  let soc = battery;
  const values: number[] = [];
  let failed: number | null = null;
  let minGen = Infinity;
  for (let sol = 1; sol <= sols; sol++) {
    const storm = sol >= stormStart && sol < stormStart + stormSols;
    const gen = dailyInsolation(lat, ls, storm ? tauStorm : tauClear) * area * PANEL.eff;
    minGen = Math.min(minGen, gen);
    const use = load * (storm ? 1 - saving / 100 : 1);
    // De día los paneles alimentan la base y cargan la batería; de noche solo hay batería.
    soc = Math.min(battery, soc + gen - use / 2) - use / 2;
    values.push(r1(Math.max(0, soc)));
    if (soc < 0 && failed === null) failed = sol;
  }
  return { values, failed, minGen };
}

const solar: SimDef = {
  id: 'solar',
  role: 'power',
  emoji: '⚡',
  name: 'Tormenta de polvo',
  need: 'Energía',
  fact: 'solar',
  topics: { ntrs: 'Mars dust storm solar array power', osdr: '' },
  objective: (s) => `Mantén encendida la base de ${s.p.crew} astronautas durante ${s.p.sols} soles, con una tormenta de polvo de ${s.p.stormSols} soles (τ = ${s.p.tauStorm}).`,
  controls: (s) => [
    // De inicio: lo justo para un día claro. Alcanza hasta que llega la tormenta.
    { id: 'area', label: 'Paneles solares', unit: 'm²', min: 0, max: 2000, step: 20, value: Math.ceil((s.p.load * 1.1) / (dailyInsolation(s.p.lat, s.p.ls, s.p.tauClear) * PANEL.eff) / 20) * 20, help: 'Más área = más energía, pero más masa que traer de la Tierra.' },
    { id: 'battery', label: 'Baterías', unit: 'kWh', min: 0, max: 2000, step: 20, value: Math.ceil(s.p.load / 2 / 20) * 20 + 20, help: 'Guardan energía para la noche y para los días oscuros.' },
    { id: 'saving', label: 'Modo ahorro en la tormenta', unit: '%', min: 0, max: 40, step: 5, value: 0, help: 'Apagar lo que no es vital durante la tormenta.' },
  ],
  run(s, i) {
    const { load, lat, ls, tauClear, tauStorm, sols, budget } = s.p;
    const out = solarRun(s, i.area, i.battery, i.saving);
    const mass = i.area * PANEL.kgPerM2 + i.battery * BATTERY.kgPerKWh;
    const ok = out.failed === null;
    const hClear = dailyInsolation(lat, ls, tauClear);
    const hStorm = dailyInsolation(lat, ls, tauStorm);
    const g = grade(ok, mass <= budget, mass <= budget && i.saving <= 20, (out.failed ?? sols) - 1, sols);
    return {
      ok,
      ...g,
      failedSol: out.failed,
      metrics: [
        { label: 'Energía en día claro', value: r0(hClear * i.area * PANEL.eff), unit: 'kWh/sol', need: load, ok: hClear * i.area * PANEL.eff >= load },
        { label: 'Energía en la tormenta', value: r0(out.minGen), unit: 'kWh/sol', need: r0(load * (1 - i.saving / 100)), ok: out.minGen >= load * (1 - i.saving / 100) },
        { label: 'Masa del sistema', value: r0(mass), unit: 'kg', need: budget, lowerIsBetter: true, ok: mass <= budget },
      ],
      series: { label: 'Energía en las baterías', unit: 'kWh', values: out.values, floor: 0 },
      verdict: ok
        ? mass <= budget
          ? 'La base pasó la tormenta con las luces encendidas y dentro del límite de masa.'
          : 'La base sobrevivió, pero el sistema pesa más de lo que puede traer el cohete.'
        : `Apagón en el sol ${out.failed}: las baterías se vaciaron ${out.failed! >= s.p.stormStart ? 'durante la tormenta' : 'en la noche'}.`,
      lesson: ok
        ? 'En una tormenta casi no llega luz directa: las baterías y el modo ahorro valen más que seguir agregando paneles.'
        : i.battery < load / 2
          ? 'Cada noche la base gasta la mitad de su energía sin Sol: la batería debe guardar al menos esa mitad.'
          : 'Con polvo en el cielo los paneles dan mucho menos: sube las baterías o usa el modo ahorro para cruzar la tormenta.',
      math: [
        `Luz que llega al suelo: ${r1(hClear)} kWh/m² en un sol claro (τ = ${tauClear}) y ${r1(hStorm)} kWh/m² en la tormenta (τ = ${tauStorm}).`,
        `Energía = luz × área × eficiencia = ${r1(hClear)} × ${i.area} m² × ${r1(PANEL.eff * 100)} % = ${r0(hClear * i.area * PANEL.eff)} kWh por sol.`,
        `La base consume ${r0(load)} kWh por sol; la mitad (${r0(load / 2)} kWh) es de noche y sale de las baterías.`,
        `Masa = ${i.area} m² × ${PANEL.kgPerM2} kg + ${i.battery} kWh × ${BATTERY.kgPerKWh} kg = ${r0(mass)} kg (límite: ${budget} kg).`,
      ],
    };
  },
};

function solarScenario(rng: Rng, level: Level, seed: number): Scenario {
  const crew = randInt(rng, 2, 3 + level);
  const stormSols = [4, 7, 11][level - 1] + randInt(rng, 0, 2);
  const stormStart = randInt(rng, 3, 5);
  const s: Scenario = {
    sim: 'solar',
    level,
    seed,
    p: {
      crew,
      load: r0((2 + crew) * MARS.solHours),
      lat: pick(rng, [4, 14, 18, 22]),
      ls: randStep(rng, 0, 340, 20),
      tauClear: pick(rng, [0.4, 0.5, 0.6]),
      tauStorm: [pick(rng, [2, 2.5]), pick(rng, [3.5, 4, 4.5]), pick(rng, [5.5, 6.5, 8])][level - 1],
      stormStart,
      stormSols,
      sols: stormStart + stormSols + 3,
      budget: 0,
    },
    events: [
      { sol: stormStart, text: 'Llega la tormenta de polvo' },
      { sol: stormStart + stormSols, text: 'El cielo se despeja' },
    ],
  };
  // Límite de masa: 30 % más que el diseño más ligero que sobrevive con 20 % de ahorro.
  let best = Infinity;
  for (let a = 100; a <= 2000; a += 50) {
    for (let b = 0; b <= 2000; b += 50) {
      const m = a * PANEL.kgPerM2 + b * BATTERY.kgPerKWh;
      if (m < best && solarRun(s, a, b, 20).failed === null) best = m;
    }
  }
  s.p.budget = r0((best * 1.3) / 50) * 50;
  return s;
}

/* ------------------------------------------------------------------ */
/* 2 · Soporte vital: fabricar oxígeno                                 */
/* ------------------------------------------------------------------ */

/** Unidad de producción: 20 veces MOXIE (200 g de O₂ por hora, 6 kW). */
const O2_UNIT = { kgPerHour: (MOXIE.gramsPerHour * 20) / 1000, kW: (MOXIE.watts * 20) / 1000 };

const oxygen: SimDef = {
  id: 'oxygen',
  role: 'life',
  emoji: '🫧',
  name: 'Fábrica de aire',
  need: 'Soporte vital',
  fact: 'oxygen',
  topics: { ntrs: 'MOXIE Mars oxygen in-situ resource utilization', osdr: '' },
  objective: (s) => `Produce el oxígeno de ${s.p.crew} astronautas durante ${s.p.sols} soles sin pasarte de ${s.p.power} kWh por sol${s.p.failSol ? ' (ojo: habrá una avería)' : ''}.`,
  controls: (s) => [
    { id: 'units', label: 'Unidades MOXIE ×20', unit: '', min: 0, max: 8, step: 1, value: 1, help: `Cada una saca ${O2_UNIT.kgPerHour * 1000} g de O₂ por hora del CO₂ del aire y gasta ${O2_UNIT.kW} kW.` },
    { id: 'hours', label: 'Horas encendidas por sol', unit: 'h', min: 0, max: 24, step: 1, value: 8, help: 'Un sol dura 24 h 39 min.' },
    { id: 'electro', label: 'Agua para electrólisis', unit: 'L/sol', min: 0, max: s.p.water, step: 0.5, value: 0, help: `Separar agua da ${WATER.o2PerKg} kg de O₂ por litro con menos energía, pero el agua también hace falta.` },
  ],
  run(s, i) {
    const { crew, sols, power, tank0, leak, failSol, failSols } = s.p;
    const need = crew * HUMAN.o2 + leak;
    let tank = tank0;
    const values: number[] = [];
    let failed: number | null = null;
    let worstEnergy = 0;
    for (let sol = 1; sol <= sols; sol++) {
      const broken = failSol > 0 && sol >= failSol && sol < failSol + failSols;
      const units = Math.max(0, i.units - (broken ? 1 : 0));
      let moxie = units * O2_UNIT.kgPerHour * i.hours;
      let electro = i.electro * WATER.o2PerKg;
      const energy = units * O2_UNIT.kW * i.hours + electro * WATER.electrolysisKWhPerKgO2;
      worstEnergy = Math.max(worstEnergy, energy);
      // Si se pide más energía de la que hay, todo produce menos (apagón parcial).
      if (energy > power) {
        moxie *= power / energy;
        electro *= power / energy;
      }
      tank = tank + moxie + electro - need;
      values.push(r1(Math.max(0, tank)));
      if (tank < 0 && failed === null) failed = sol;
    }
    const made = i.units * O2_UNIT.kgPerHour * i.hours + i.electro * WATER.o2PerKg;
    const energy = i.units * O2_UNIT.kW * i.hours + i.electro * WATER.o2PerKg * WATER.electrolysisKWhPerKgO2;
    const ok = failed === null;
    const reserve = tank >= need * 3;
    const g = grade(ok, energy <= power, energy <= power && reserve, (failed ?? sols) - 1, sols);
    return {
      ok,
      ...g,
      failedSol: failed,
      metrics: [
        { label: 'Oxígeno fabricado', value: r1(made), unit: 'kg/sol', need: r1(need), ok: made >= need },
        { label: 'Energía usada', value: r0(energy), unit: 'kWh/sol', need: power, lowerIsBetter: true, ok: energy <= power },
        { label: 'Reserva al final', value: r1(Math.max(0, tank)), unit: 'kg', need: r1(need * 3), ok: reserve },
      ],
      series: { label: 'Oxígeno en el tanque', unit: 'kg', values, floor: 0 },
      verdict: ok
        ? reserve
          ? 'Aire de sobra: la tripulación respira tranquila y queda reserva para tres soles.'
          : 'La tripulación respiró toda la misión, pero el tanque quedó casi vacío.'
        : `Sin oxígeno en el sol ${failed}: el tanque se vació${failSol && failed! >= failSol ? ' después de la avería' : ''}.`,
      lesson: ok
        ? 'La electrólisis gasta menos energía por kilo de oxígeno que MOXIE, pero consume agua: una base real usa las dos.'
        : energy > power
          ? 'Pediste más energía de la disponible y las máquinas produjeron menos: reparte entre MOXIE y electrólisis.'
          : 'Cada astronauta respira 0.84 kg de oxígeno al día: multiplica por la tripulación y deja margen para averías.',
      math: [
        `Necesidad = ${crew} astronautas × ${HUMAN.o2} kg + ${r1(leak)} kg de fugas = ${r1(need)} kg de O₂ por sol.`,
        `MOXIE: ${i.units} × ${O2_UNIT.kgPerHour} kg/h × ${i.hours} h = ${r1(i.units * O2_UNIT.kgPerHour * i.hours)} kg, con ${r0(i.units * O2_UNIT.kW * i.hours)} kWh (${MOXIE.kWhPerKg} kWh por kg).`,
        `Electrólisis: ${i.electro} L × ${WATER.o2PerKg} = ${r1(i.electro * WATER.o2PerKg)} kg, con ${r0(i.electro * WATER.o2PerKg * WATER.electrolysisKWhPerKgO2)} kWh (${WATER.electrolysisKWhPerKgO2} kWh por kg).`,
        `Tanque cada sol: lo fabricado − lo respirado = ${r1(made)} − ${r1(need)} = ${r1(made - need)} kg.`,
      ],
    };
  },
};

function oxygenScenario(rng: Rng, level: Level, seed: number): Scenario {
  const crew = randInt(rng, 2, 3 + level);
  const sols = [10, 14, 20][level - 1];
  const need = crew * HUMAN.o2 + 0.1 * crew;
  const failSol = level === 1 ? 0 : randInt(rng, 4, 7);
  // El agua solo alcanza para una parte del oxígeno: el resto tiene que salir del aire con MOXIE.
  const share = [0.5, 0.4, 0.3][level - 1];
  return {
    sim: 'oxygen',
    level,
    seed,
    p: {
      crew,
      sols,
      power: r0((need * ((1 - share) * MOXIE.kWhPerKg + share * WATER.electrolysisKWhPerKgO2) * [1.3, 1.25, 1.2][level - 1]) / 5) * 5,
      water: Math.max(0.5, Math.round(((need * share) / WATER.o2PerKg) * 2) / 2),
      tank0: r1(need * 2),
      leak: r1(0.1 * crew),
      failSol,
      failSols: level === 1 ? 0 : level + 1,
    },
    events: failSol ? [{ sol: failSol, text: 'Se avería una unidad MOXIE' }, { sol: failSol + level + 1, text: 'Unidad reparada' }] : [],
  };
}

/* ------------------------------------------------------------------ */
/* 3 · Soporte vital: agua del hielo marciano                          */
/* ------------------------------------------------------------------ */

const HEATER_EFF = 0.7;
const RECYCLER_KWH_PER_L = 0.08;

const water: SimDef = {
  id: 'water',
  role: 'life',
  emoji: '💧',
  name: 'Minería de hielo',
  need: 'Soporte vital',
  fact: 'water',
  topics: { ntrs: 'Mars water ice extraction in-situ resource utilization', osdr: 'spaceflight water microbial' },
  objective: (s) => `Da agua a ${s.p.crew} astronautas${s.p.farm ? ` y ${s.p.farm} L diarios al invernadero` : ''} durante ${s.p.sols} soles con ${s.p.power} kWh por sol.`,
  controls: (s) => [
    { id: 'mined', label: 'Suelo con hielo excavado', unit: 'kg/sol', min: 0, max: s.p.mineMax, step: 5, value: 10, help: `En este sitio el ${r0(s.p.ice * 100)} % del suelo es hielo, a ${s.p.temp} °C.` },
    { id: 'recycle', label: 'Reciclaje de agua', unit: '%', min: 50, max: s.p.recMax, step: 1, value: 60, help: `Este reciclador llega al ${s.p.recMax} %. La Estación Espacial recicla hasta el 98 %.` },
    { id: 'ration', label: 'Agua por persona', unit: 'L/sol', min: 6, max: 11, step: 0.5, value: 11, help: 'Menos de 11 L obliga a racionar la higiene.' },
  ],
  run(s, i) {
    const { crew, sols, power, tank0, ice, temp, farm, failSol, failSols } = s.p;
    const perKg = meltEnergy(temp) / HEATER_EFF;
    let tank = tank0;
    const values: number[] = [];
    let failed: number | null = null;
    for (let sol = 1; sol <= sols; sol++) {
      const broken = failSol > 0 && sol >= failSol && sol < failSol + failSols;
      const recycled = crew * i.ration * ((broken ? 50 : i.recycle) / 100);
      let melted = i.mined * ice;
      const energy = melted * perKg + recycled * RECYCLER_KWH_PER_L;
      if (energy > power) melted *= Math.max(0, power - recycled * RECYCLER_KWH_PER_L) / Math.max(1e-6, melted * perKg);
      tank = tank + melted + recycled - crew * i.ration - farm;
      values.push(r0(Math.max(0, tank)));
      if (tank < 0 && failed === null) failed = sol;
    }
    const melted = i.mined * ice;
    const recycled = crew * i.ration * (i.recycle / 100);
    const energy = melted * perKg + recycled * RECYCLER_KWH_PER_L;
    const demand = crew * i.ration + farm;
    const ok = failed === null;
    const g = grade(ok, energy <= power, energy <= power && i.ration >= 10, (failed ?? sols) - 1, sols);
    return {
      ok,
      ...g,
      failedSol: failed,
      metrics: [
        { label: 'Agua nueva + reciclada', value: r0(melted + recycled), unit: 'L/sol', need: r0(demand), ok: melted + recycled >= demand },
        { label: 'Energía usada', value: r1(energy), unit: 'kWh/sol', need: power, lowerIsBetter: true, ok: energy <= power },
        { label: 'Agua por persona', value: i.ration, unit: 'L/sol', need: 10, ok: i.ration >= 10 },
      ],
      series: { label: 'Agua en el tanque', unit: 'L', values, floor: 0 },
      verdict: ok
        ? i.ration >= 10
          ? 'El tanque nunca se vació y nadie tuvo que racionar el agua.'
          : 'Hubo agua toda la misión, pero la tripulación tuvo que racionarla.'
        : `Tanque vacío en el sol ${failed}${failSol && failed! >= failSol ? ', con el reciclador averiado' : ''}.`,
      lesson: ok
        ? 'Reciclar casi toda el agua cuesta muy poca energía; derretir hielo a −70 °C cuesta mucha. Por eso en el espacio se recicla hasta el sudor.'
        : 'Suma lo que entra (hielo derretido + agua reciclada) y compáralo con lo que sale. Si sale más de lo que entra, el tanque baja cada sol.',
      math: [
        `Derretir 1 kg de hielo a ${temp} °C: (2.09 × ${Math.abs(temp)} + 334 + 4.18 × 20) kJ ÷ ${HEATER_EFF} = ${r1(perKg * 1000)} Wh.`,
        `Hielo: ${i.mined} kg de suelo × ${r0(ice * 100)} % = ${r1(melted)} L de agua nueva, con ${r1(melted * perKg)} kWh.`,
        `Reciclaje: ${crew} × ${i.ration} L × ${i.recycle} % = ${r1(recycled)} L que vuelven al tanque.`,
        `Balance = ${r1(melted)} + ${r1(recycled)} − ${r1(demand)} = ${r1(melted + recycled - demand)} L por sol.`,
      ],
    };
  },
};

function waterScenario(rng: Rng, level: Level, seed: number): Scenario {
  const crew = randInt(rng, 2, 3 + level);
  const temp = pick(rng, [-50, -60, -70, -80]);
  const ice = pick(rng, [[0.5, 0.6], [0.35, 0.45], [0.2, 0.3]][level - 1]);
  const farm = level === 1 ? 0 : pick(rng, [10, 15, 20]);
  const failSol = level === 3 ? randInt(rng, 4, 6) : 0;
  const recMax = [90, 95, 98][level - 1];
  const need = crew * HUMAN.water * (1 - recMax / 100) + farm;
  return {
    sim: 'water',
    level,
    seed,
    p: {
      crew,
      sols: [10, 14, 18][level - 1],
      temp,
      ice,
      farm,
      mineMax: 150,
      recMax,
      tank0: r0(crew * HUMAN.water * 0.5),
      power: Math.ceil(((need * meltEnergy(temp)) / HEATER_EFF) * [1.6, 1.4, 1.3][level - 1] + crew * HUMAN.water * RECYCLER_KWH_PER_L + 1),
      failSol,
      failSols: failSol ? 3 : 0,
    },
    events: failSol ? [{ sol: failSol, text: 'Se avería el reciclador (baja al 50 %)' }, { sol: failSol + 3, text: 'Reciclador reparado' }] : [],
  };
}

/* ------------------------------------------------------------------ */
/* 4 · Comida: el invernadero                                          */
/* ------------------------------------------------------------------ */

const greenhouse: SimDef = {
  id: 'greenhouse',
  role: 'bio',
  emoji: '🌱',
  name: 'Invernadero marciano',
  need: 'Comida',
  fact: 'greenhouse',
  topics: { ntrs: 'bioregenerative life support crop production', osdr: 'plant spaceflight' },
  objective: (s) => `Cultiva el ${r0(s.p.diet * 100)} % de la comida de ${s.p.crew} astronautas durante ${s.p.sols} soles con ${s.p.power} kWh y ${s.p.water} L de agua por sol.`,
  controls: (s) => [
    { id: 'crop', label: 'Cultivo', unit: '', min: 0, max: CROPS.length - 1, step: 1, value: 3, help: 'Cada planta da distinta energía y pide distinta luz.', options: CROPS.map((c) => `${c.emoji} ${c.name}`) },
    { id: 'area', label: 'Área de cultivo', unit: 'm²', min: 0, max: s.p.areaMax, step: 5, value: 20, help: 'La NASA calcula 40 a 50 m² por persona para toda su dieta.' },
    { id: 'hours', label: 'Horas de luz LED', unit: 'h', min: 6, max: 24, step: 1, value: 12, help: 'Más luz = más cosecha, hasta que la planta se satura.' },
  ],
  run(s, i) {
    const { crew, sols, diet, power, water: waterMax, pantry } = s.p;
    const crop = CROPS[clamp(Math.round(i.crop), 0, CROPS.length - 1)];
    const light = dailyLight(i.hours);
    const growth = Math.min(1, light / crop.dli);
    const energy = i.area * lightEnergy(i.hours);
    const drink = i.area * crop.water;
    // Si falta energía o agua, las plantas crecen menos.
    const limit = Math.min(1, power / Math.max(1e-6, energy), waterMax / Math.max(1e-6, drink));
    const kcal = i.area * crop.yield * growth * limit * crop.kcal;
    const need = crew * HUMAN.kcal * diet;
    let store = pantry;
    const values: number[] = [];
    let failed: number | null = null;
    for (let sol = 1; sol <= sols; sol++) {
      store = store + kcal - need;
      values.push(r0(Math.max(0, store) / 1000));
      if (store < 0 && failed === null) failed = sol;
    }
    const ok = failed === null;
    const within = energy <= power && drink <= waterMax;
    const o2 = (i.area * crop.yield * growth * limit * 1.07) / 0.45 / 1000;
    const g = grade(ok, within, within && kcal >= need, (failed ?? sols) - 1, sols);
    return {
      ok,
      ...g,
      failedSol: failed,
      metrics: [
        { label: 'Comida cosechada', value: r0(kcal), unit: 'kcal/sol', need: r0(need), ok: kcal >= need },
        { label: 'Energía de las lámparas', value: r0(energy), unit: 'kWh/sol', need: power, lowerIsBetter: true, ok: energy <= power },
        { label: 'Agua de riego', value: r1(drink), unit: 'L/sol', need: waterMax, lowerIsBetter: true, ok: drink <= waterMax },
        { label: 'Oxígeno extra de las plantas', value: r1(o2), unit: 'kg/sol', ok: true },
      ],
      series: { label: 'Despensa', unit: 'mil kcal', values, floor: 0 },
      verdict: ok
        ? kcal >= need
          ? 'El invernadero alimenta a la tripulación y la despensa crece cada sol.'
          : 'La despensa alcanzó, pero se fue vaciando: una misión más larga habría fallado.'
        : `Despensa vacía en el sol ${failed}: el invernadero no dio las calorías necesarias.`,
      lesson:
        crop.id === 'lechuga' && !ok
          ? 'La lechuga crece rápido y da vitaminas, pero casi no tiene calorías: para vivir de la cosecha hacen falta papa, trigo o soya.'
          : growth >= 1 && i.hours > crop.dli / (dailyLight(1) || 1) + 1
            ? `${crop.name} ya no aprovecha más luz después de ${r0(crop.dli / dailyLight(1))} h: las horas extra solo gastan energía.`
            : ok
              ? 'Las plantas dan comida y además limpian el aire: convierten el CO₂ en oxígeno.'
              : 'Calorías = área × cosecha × energía del cultivo. Si no alcanza, sube el área o la luz, o cambia de planta.',
      math: [
        `Luz diaria = ${GROW_LIGHT.ppfd} µmol/m²·s × ${i.hours} h = ${r1(light)} mol/m²; ${crop.name.toLowerCase()} aprovecha hasta ${crop.dli} → crece al ${r0(growth * 100)} %.`,
        `Cosecha = ${i.area} m² × ${crop.yield} g × ${r0(growth * limit * 100)} % × ${crop.kcal} kcal/g = ${r0(kcal)} kcal por sol.`,
        `Necesidad = ${crew} × ${HUMAN.kcal} kcal × ${r0(diet * 100)} % = ${r0(need)} kcal por sol.`,
        `Lámparas = ${i.area} m² × ${r1(lightEnergy(i.hours))} kWh = ${r0(energy)} kWh; riego = ${r1(drink)} L por sol.`,
      ],
    };
  },
};


function greenhouseScenario(rng: Rng, level: Level, seed: number): Scenario {
  const crew = randInt(rng, 2, 3 + level);
  const diet = [0.5, 0.7, 0.9][level - 1];
  const need = crew * HUMAN.kcal * diet;
  // Área justa con papa a luz plena, más un margen que se estrecha con el nivel.
  const area = need / (CROPS[0].yield * CROPS[0].kcal);
  const margin = [1.5, 1.3, 1.15][level - 1];
  return {
    sim: 'greenhouse',
    level,
    seed,
    p: {
      crew,
      sols: [20, 30, 40][level - 1],
      diet,
      areaMax: r0((area * 1.8) / 5) * 5,
      power: r0((area * lightEnergy(18) * margin) / 5) * 5,
      water: r0(area * 0.45 * margin),
      pantry: r0(need * [5, 4, 3][level - 1]),
    },
    events: [],
  };
}

/* ------------------------------------------------------------------ */
/* 5 · Blindaje: radiación y regolito                                  */
/* ------------------------------------------------------------------ */

const shield: SimDef = {
  id: 'shield',
  role: 'habitat',
  emoji: '🛡️',
  name: 'Escudo de regolito',
  need: 'Blindaje',
  fact: 'shield',
  topics: { ntrs: 'Mars habitat radiation shielding regolith', osdr: 'ionizing radiation' },
  objective: (s) => `Protege a la tripulación ${s.p.sols} soles: menos de ${s.p.limit} mSv por persona, con al menos ${s.p.evaNeed} h diarias de exploración${s.p.spe ? ` y ${s.p.spe} tormenta${s.p.spe > 1 ? 's' : ''} solar${s.p.spe > 1 ? 'es' : ''}` : ''}.`,
  controls: (s) => [
    { id: 'thick', label: 'Capa de regolito sobre el hábitat', unit: 'm', min: 0, max: 3, step: 0.1, value: 0.2, help: `El robot excavador mueve ${s.p.dig} m³ por sol; el techo mide ${s.p.roof} m².` },
    { id: 'eva', label: 'Horas afuera por sol', unit: 'h', min: 0, max: 8, step: 0.5, value: 4, help: 'Afuera solo protege el traje: casi nada.' },
    { id: 'shelter', label: 'En tormenta solar…', unit: '', min: 0, max: 1, step: 1, value: 0, help: 'Las alertas de clima espacial llegan minutos u horas antes.', options: ['Seguir trabajando', 'Todos al refugio'] },
  ],
  run(s, i) {
    const { sols, limit, evaNeed, roof, dig, digMax, spe, speDose } = s.p;
    const day = RADIATION.surface * SOL_DAYS;
    const out = i.eva / MARS.solHours;
    const inside = shieldedDose(day, i.thick);
    const perSol = (1 - out) * inside + out * day;
    const speSols = s.events.map((e) => e.sol);
    let dose = 0;
    const values: number[] = [];
    let failed: number | null = null;
    for (let sol = 1; sol <= sols; sol++) {
      dose += perSol;
      if (speSols.includes(sol)) {
        const sheltered = shieldedDose(speDose, i.thick, RADIATION.speLength);
        dose += i.shelter ? sheltered : (1 - out) * sheltered + out * speDose;
      }
      values.push(r1(dose));
      if (dose > limit && failed === null) failed = sol;
    }
    const digSols = (roof * i.thick) / dig;
    const science = i.eva >= evaNeed;
    const built = digSols <= digMax;
    const ok = failed === null && science && built;
    // Tres estrellas: dosis holgada y, además, más exploración de la mínima.
    const g = grade(ok, dose <= limit * 0.92, dose <= limit * 0.92 && i.eva >= evaNeed + 0.5, failed === null ? (science && built ? sols : sols * 0.6) : failed - 1, sols);
    return {
      ok,
      ...g,
      failedSol: failed,
      metrics: [
        { label: 'Dosis total por persona', value: r0(dose), unit: 'mSv', need: limit, lowerIsBetter: true, ok: dose <= limit },
        { label: 'Exploración', value: i.eva, unit: 'h/sol', need: evaNeed, ok: science },
        { label: 'Excavación del escudo', value: r1(digSols), unit: 'soles', need: digMax, lowerIsBetter: true, ok: built },
      ],
      series: { label: 'Dosis acumulada', unit: 'mSv', values, floor: 0, limit },
      verdict: ok
        ? 'La tripulación exploró Marte y volvió dentro del límite de radiación.'
        : failed !== null
          ? `Límite de radiación superado en el sol ${failed}: hay que evacuar a la tripulación.`
          : !science
            ? 'La tripulación quedó protegida, pero casi no salió: la misión científica no se cumplió.'
            : 'El escudo es tan grueso que el robot no termina de excavarlo a tiempo.',
      lesson:
        failed !== null && spe > 0 && !i.shelter
          ? 'Una tormenta solar puede dar en horas la dosis de muchos soles. Por eso se vigila el Sol (DONKI) y todos van al refugio.'
          : ok
            ? 'El primer metro de regolito quita casi la mitad de los rayos cósmicos; cada metro extra ayuda menos y cuesta lo mismo excavarlo.'
            : 'La dosis se suma cada sol: baja con un escudo más grueso y con menos horas afuera, pero explorar es la razón de la misión.',
      math: [
        `En la superficie: ${RADIATION.surface} mSv por día terrestre = ${r1(day * 100) / 100} mSv por sol (rover Curiosity, detector RAD).`,
        `Dentro, con ${i.thick} m de regolito: ${r1(day * 100) / 100} × e^(−${i.thick}/${RADIATION.gcrLength}) = ${r1(inside * 100) / 100} mSv por sol.`,
        `Cada sol: ${r1((1 - out) * 100)} % adentro + ${r1(out * 100)} % afuera = ${r1(perSol * 100) / 100} mSv → ${r0(perSol * sols)} mSv en ${sols} soles.`,
        spe ? `Tormenta solar: ${speDose} mSv sin protección; en el refugio, ${r1(shieldedDose(speDose, i.thick, RADIATION.speLength))} mSv.` : `Excavar: ${roof} m² × ${i.thick} m = ${r1(roof * i.thick)} m³ ÷ ${dig} m³ por sol = ${r1(digSols)} soles.`,
      ],
    };
  },
};

function shieldScenario(rng: Rng, level: Level, seed: number, spe?: number): Scenario {
  const sols = [180, 300, 500][level - 1];
  const events = spe ?? [1, 2, 3][level - 1];
  const speDose = [30, 50, 80][level - 1];
  const evaNeed = [2, 3, 4][level - 1];
  const day = RADIATION.surface * SOL_DAYS;
  // Límite alcanzable con ~1.5 m de regolito, el mínimo de salidas y refugio en las tormentas.
  const ref = sols * ((1 - evaNeed / MARS.solHours) * shieldedDose(day, 1.5) + (evaNeed / MARS.solHours) * day);
  const list: { sol: number; text: string }[] = [];
  for (let k = 0; k < events; k++) list.push({ sol: r0(((k + 1) * sols) / (events + 1)) + randInt(rng, -6, 6), text: 'Tormenta solar (alerta de clima espacial)' });
  return {
    sim: 'shield',
    level,
    seed,
    p: { sols, limit: r0((ref * [1.35, 1.25, 1.18][level - 1]) / 5) * 5, evaNeed, roof: 60, dig: 2, digMax: [70, 60, 55][level - 1], spe: events, speDose },
    events: list,
  };
}

/* ------------------------------------------------------------------ */
/* 6 · Operaciones: aterrizar la nave de suministros                   */
/* ------------------------------------------------------------------ */

export interface LanderState {
  /** Altura (m), velocidad vertical (m/s, negativa = bajando), masa total (kg) y combustible (kg). */
  h: number;
  v: number;
  mass: number;
  fuel: number;
  t: number;
}

/** Un paso de la caída: a = empuje/masa − g. El motor gasta combustible: ṁ = empuje / (Isp · g₀). */
export function landerStep(st: LanderState, throttle: number, p: Record<string, number>, dt: number): LanderState {
  const thrust = st.fuel > 0 ? clamp(throttle, 0, 1) * p.thrust : 0;
  const burn = Math.min(st.fuel, (thrust / (p.isp * 9.80665)) * dt);
  const a = thrust / st.mass - MARS.g;
  const v = st.v + a * dt;
  return { h: st.h + (st.v + v) * 0.5 * dt, v, mass: st.mass - burn, fuel: st.fuel - burn, t: st.t + dt };
}

export const landerStart = (s: Scenario): LanderState => ({ h: s.p.h0, v: -s.p.v0, mass: s.p.dry + s.p.fuel, fuel: s.p.fuel, t: 0 });

const landing: SimDef = {
  id: 'landing',
  role: 'habitat',
  emoji: '🚀',
  name: 'Aterrizaje de suministros',
  need: 'Operaciones',
  fact: 'landing',
  topics: { ntrs: 'Mars entry descent landing powered descent', osdr: '' },
  objective: (s) => `Posa la nave de ${r0(s.p.dry)} kg a menos de ${s.p.safe} m/s. Empieza a ${s.p.h0} m, cayendo a ${s.p.v0} m/s, con ${s.p.fuel} kg de combustible.`,
  controls: () => [],
  run(s, i) {
    // El aterrizaje se juega en tiempo real: aquí solo se califica cómo tocó el suelo.
    const speed = Math.abs(i.speed);
    const ok = speed <= s.p.safe;
    const g = grade(ok, i.fuel >= s.p.fuel * 0.1, i.fuel >= s.p.fuel * 0.25, ok ? 1 : speed <= s.p.safe * 3 ? 0.7 : 0.2, 1);
    const hover = (s.p.dry + s.p.fuel) * MARS.g;
    return {
      ok,
      ...g,
      failedSol: ok ? null : 1,
      metrics: [
        { label: 'Velocidad al tocar el suelo', value: r1(speed), unit: 'm/s', need: s.p.safe, lowerIsBetter: true, ok },
        { label: 'Combustible sobrante', value: r0(i.fuel), unit: 'kg', need: r0(s.p.fuel * 0.1), ok: i.fuel >= s.p.fuel * 0.1 },
        { label: 'Tiempo de descenso', value: r1(i.time), unit: 's', ok: true },
      ],
      series: { label: 'Altura', unit: 'm', values: [], floor: 0 },
      verdict: ok ? 'Aterrizaje suave: los suministros llegaron enteros a la base.' : speed <= s.p.safe * 3 ? 'Aterrizaje duro: la nave se dañó y parte de la carga se perdió.' : 'La nave se estrelló: frenaste demasiado tarde o te quedaste sin combustible.',
      lesson: ok ? 'Frenar tarde y fuerte gasta menos combustible que frenar todo el camino: así aterrizan los cohetes de verdad.' : 'El motor debe empujar más que el peso de la nave para frenar. Si empuja igual que el peso, la nave solo deja de acelerar.',
      math: [
        `Peso en Marte = masa × g = ${r0(s.p.dry + s.p.fuel)} kg × ${MARS.g} m/s² = ${r0(hover)} N (en la Tierra pesaría ${r0((s.p.dry + s.p.fuel) * 9.81)} N).`,
        `Empuje máximo = ${r0(s.p.thrust)} N → aceleración hacia arriba = ${r0(s.p.thrust)} ÷ ${r0(s.p.dry + s.p.fuel)} − ${MARS.g} = ${r1(s.p.thrust / (s.p.dry + s.p.fuel) - MARS.g)} m/s².`,
        `Para flotar sin subir ni bajar hace falta el ${r0((hover / s.p.thrust) * 100)} % del empuje.`,
        `Gasto de combustible = empuje ÷ (Isp × g₀) = ${r1(s.p.thrust / (s.p.isp * 9.80665))} kg por segundo a toda potencia.`,
      ],
    };
  },
};

function landingScenario(rng: Rng, level: Level, seed: number): Scenario {
  const dry = pick(rng, [900, 1100, 1300]);
  const isp = 290;
  const v0 = [40, 55, 70][level - 1] + randInt(rng, -5, 5);
  const twr = [2.6, 2.3, 2.0][level - 1];
  // Altura inicial: vez y media la distancia que hace falta para frenar a toda potencia.
  const stop = (v0 * v0) / (2 * (twr - 1) * MARS.g);
  const h0 = Math.round((stop * 1.5 + 80) / 50) * 50;
  // Combustible: varias veces el mínimo teórico (ecuación del cohete) para un piloto que aprende.
  const dv = Math.sqrt(v0 * v0 + 2 * MARS.g * h0) * 1.35;
  const fuel = Math.ceil((dry * (Math.exp(dv / (isp * 9.80665)) - 1) * [3.5, 2.8, 2.2][level - 1]) / 5) * 5;
  return {
    sim: 'landing',
    level,
    seed,
    p: { dry, fuel, thrust: r0(((dry + fuel) * MARS.g * twr) / 100) * 100, isp, h0, v0, safe: [4, 3, 2][level - 1] },
    events: [],
  };
}

/* ------------------------------------------------------------------ */
/* Catálogo y retos                                                     */
/* ------------------------------------------------------------------ */

export const SIMS: Record<SimId, SimDef> = { solar, oxygen, water, greenhouse, shield, landing };

/** Escenario reproducible: la misma semilla da siempre los mismos números. */
export function makeScenario(sim: SimId, level: Level, seed: number, opts: { spe?: number } = {}): Scenario {
  const rng = makeRng(seed);
  switch (sim) {
    case 'solar':
      return solarScenario(rng, level, seed);
    case 'oxygen':
      return oxygenScenario(rng, level, seed);
    case 'water':
      return waterScenario(rng, level, seed);
    case 'greenhouse':
      return greenhouseScenario(rng, level, seed);
    case 'shield':
      return shieldScenario(rng, level, seed, opts.spe);
    default:
      return landingScenario(rng, level, seed);
  }
}

/** Valores iniciales de los controles de un escenario. */
export const defaultInput = (s: Scenario): Record<string, number> => Object.fromEntries(SIMS[s.sim].controls(s).map((c) => [c.id, c.value]));

/** Lo que el entrenador sabe de cada astronauta para personalizar sus retos. */
export interface SkillRecord {
  plays: number;
  wins: number;
  best: number;
  /** Nivel más alto superado (0 = ninguno). */
  level: 0 | Level;
  last: number;
}

export type Skills = Partial<Record<SimId, SkillRecord>>;

/** Reto listo para jugar: escenario del motor + narración (de la IA o de plantilla). */
export interface Challenge {
  id: string;
  scenario: Scenario;
  title: string;
  briefing: string;
  /** Por qué IX eligió este reto para este astronauta. */
  why: string;
  /** Pista del entrenador antes de empezar. */
  tip: string;
  /** Estudio real de la NASA en el que se basa (si hubo conexión). */
  study: { title: string; summary: string; url: string; source: string } | null;
  /** true si lo escribió la IA. */
  ai: boolean;
}

/** Siguiente nivel recomendado para un simulador según el historial. */
export function nextLevel(skill: SkillRecord | undefined): Level {
  if (!skill || skill.level === 0) return 1;
  // Sube de nivel al superar el anterior con buena nota; baja si viene fallando.
  if (skill.last >= 85) return Math.min(3, skill.level + 1) as Level;
  return Math.max(1, skill.level) as Level;
}

/**
 * Qué conviene entrenar ahora: primero lo que nunca se ha jugado, luego lo que peor va y,
 * si el Sol está activo de verdad (DONKI), el blindaje.
 */
export function recommend(skills: Skills, opts: { role?: RoleId | null; solarActivity?: number; avoid?: SimId | null } = {}): SimId {
  let best: SimId = 'solar';
  let bestScore = -Infinity;
  for (const id of SIM_ORDER) {
    const k = skills[id];
    let score = !k ? 60 : 50 - k.best * 0.4 - k.level * 8 + (k.last < 70 ? 12 : 0);
    if (opts.role && SIMS[id].role === opts.role) score += 10;
    if (id === 'shield' && (opts.solarActivity ?? 0) >= 2) score += 25;
    if (id === opts.avoid) score -= 40;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

const TITLES: Record<SimId, string[]> = {
  solar: ['Se acerca un muro de polvo', 'Tres soles sin Sol', 'La base no se apaga'],
  oxygen: ['Respirar en Marte', 'El tanque no puede vaciarse', 'Aire hecho de aire marciano'],
  water: ['Hielo bajo las botas', 'Ni una gota perdida', 'El pozo de la colonia'],
  greenhouse: ['La primera cosecha', 'Papas en Marte', 'El huerto que da aire'],
  shield: ['Tormenta solar en camino', 'Un techo de regolito', 'La dosis no perdona'],
  landing: ['Siete minutos de terror', 'Llegan los suministros', 'Retrocohetes listos'],
};

const STORIES: Record<SimId, string[]> = {
  solar: ['Los satélites ven una tormenta de polvo que viene hacia la base. Cuando llegue, el cielo se pondrá café y casi no habrá luz para los paneles.', 'El pronóstico marca polvo en el aire por varios soles. La base tiene que seguir encendida: calefacción, aire y comunicaciones dependen de ti.'],
  oxygen: ['El cohete de suministros se retrasó y el oxígeno de reserva solo alcanza para un par de soles. Hay que fabricarlo aquí, con el aire y el agua de Marte.', 'La tripulación creció y el tanque de oxígeno baja más rápido de lo planeado. Te toca decidir cómo producir más sin apagar la base.'],
  water: ['El radar encontró hielo enterrado cerca de la base. Derretirlo cuesta energía, y cada gota que se pierde hay que volver a sacarla del suelo.', 'El tanque de agua está a la mitad y falta mucho para el siguiente cargamento. Entre el hielo y el reciclador tiene que alcanzar.'],
  greenhouse: ['La comida empacada se está terminando. El invernadero tiene luz, agua y espacio limitados: hay que elegir bien qué sembrar.', 'La tripulación quiere comer algo fresco y la despensa baja cada sol. Es momento de convertir el invernadero en la cocina de la colonia.'],
  shield: ['En Marte no hay campo magnético ni aire grueso que detengan la radiación. Hay que proteger el hábitat sin dejar de explorar.', 'El Sol está inquieto y la misión es larga. Cada sol suma radiación: decide cuánto escudo construir y cuánto tiempo salir.'],
  landing: ['La nave de suministros ya entró a la atmósfera y soltó el paracaídas. Los últimos metros son tuyos: frénala con los retrocohetes.', 'Llega la carga que la colonia espera desde hace meses. El aire de Marte es muy delgado: solo el motor puede frenar la nave.'],
};

/** Reto de plantilla (sin IA): mismo motor, narración escrita a mano. */
export function localChallenge(skills: Skills, opts: { name?: string; role?: RoleId | null; solarActivity?: number; avoid?: SimId | null; sim?: SimId; seed?: number } = {}): Challenge {
  const sim = opts.sim ?? recommend(skills, opts);
  const level = nextLevel(skills[sim]);
  const seed = opts.seed ?? (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
  const scenario = makeScenario(sim, level, seed, { spe: sim === 'shield' && (opts.solarActivity ?? 0) >= 2 ? Math.min(3, level + 1) : undefined });
  const def = SIMS[sim];
  const rng = makeRng(seed ^ 0x9e3779b9);
  const k = skills[sim];
  const who = opts.name ? `${opts.name}, ` : '';
  return {
    id: `${sim}-${seed.toString(36)}`,
    scenario,
    title: pick(rng, TITLES[sim]),
    briefing: `${who}la colonia te necesita. ${pick(rng, STORIES[sim])}`,
    why: !k
      ? `Todavía no entrenas ${def.need.toLowerCase()}: toda la base depende de ello.`
      : k.last < 70
        ? `La última vez la misión falló en ${def.name.toLowerCase()}: vamos a intentarlo con calma.`
        : level > k.level
          ? `Superaste el nivel ${k.level}: ahora las condiciones son más duras, como en una misión real.`
          : `Ya dominas lo básico de ${def.name.toLowerCase()}: busca las tres estrellas.`,
    tip: 'Mueve los controles y mira cómo cambian los números antes de lanzar la simulación.',
    study: null,
    ai: false,
  };
}

/** Actualiza el historial con el resultado de una corrida. */
export function recordResult(skills: Skills, s: Scenario, r: SimResult): Skills {
  const k = skills[s.sim] ?? { plays: 0, wins: 0, best: 0, level: 0 as const, last: 0 };
  return {
    ...skills,
    [s.sim]: { plays: k.plays + 1, wins: k.wins + (r.ok ? 1 : 0), best: Math.max(k.best, r.score), level: r.ok ? (Math.max(k.level, s.level) as Level) : k.level, last: r.score },
  };
}

/** XP que da una corrida (más por nivel alto y por estrellas). */
export const xpFor = (s: Scenario, r: SimResult) => (r.ok ? 20 + r.stars * 10 + s.level * 10 : 5);

/** Rango del astronauta junior según lo que ha certificado. */
export function rank(skills: Skills): { title: string; done: number; total: number } {
  const total = SIM_ORDER.length * 3;
  const done = SIM_ORDER.reduce((n, id) => n + (skills[id]?.level ?? 0), 0);
  const title = done >= total ? 'Comandante de la colonia' : done >= 12 ? 'Especialista de misión' : done >= 6 ? 'Astronauta junior' : done >= 2 ? 'Cadete espacial' : 'Recluta';
  return { title, done, total };
}
