// Qué le cuenta el mundo al jugador cuando interactúa con algo: tarjetas con datos de la
// colonia (salud de cada sector, tripulación a cargo…) y datos curiosos de Marte que dice IX.
// Todo el texto científico sale del contenido del juego o de hechos publicados por la NASA.

import { BUILDINGS, CATEGORY_LINES, SECTORS, SYSTEMS, SYSTEM_ORDER } from '../../../shared/content';
import type { BuildingId, SectorId, SystemId } from '../../../shared/types';
import type { WorldSnapshot } from '../colony/snapshot';
import type { InteractEvent } from '../WorldEngine';

export interface CardMeter {
  label: string;
  value: number;
  color: string;
}

export interface WorldCard {
  kind: 'info' | 'ix' | 'discovery' | 'sector';
  emoji: string;
  title: string;
  text: string;
  /** Color de acento de la tarjeta. */
  color?: string;
  meters?: CardMeter[];
  lines?: { label: string; value: string }[];
}

export const IX_FACTS = [
  'La gravedad de Marte es solo el 38 % de la de la Tierra: por eso aquí puedes saltar tan alto.',
  'Un día en Marte se llama "sol" y dura 24 horas y 39 minutos.',
  'Marte se ve rojo porque su suelo está cubierto de polvo con óxido de hierro.',
  'La temperatura promedio en Marte es de unos −60 °C. Los hábitats necesitan calefacción todo el tiempo.',
  'El aire de Marte es casi todo dióxido de carbono. El generador de oxígeno lo convierte en aire respirable.',
  'Marte tiene dos lunas pequeñas: Fobos y Deimos.',
  'El rover Perseverance llegó a Marte en 2021 junto con Ingenuity, el primer helicóptero en volar en otro planeta.',
  'En Marte hay tormentas de polvo que pueden cubrir todo el planeta durante semanas.',
  'El viaje de la Tierra a Marte dura unos siete meses.',
  ...Object.values(CATEGORY_LINES).map((l) => l.funFact),
];

function healthStatus(h: number): string {
  return h >= 60 ? 'Funciona bien' : h >= 35 ? 'Necesita atención' : '¡En peligro!';
}

export function healthTone(h: number): string {
  return h >= 60 ? '#55DB7A' : h >= 35 ? '#FFC93C' : '#FF6B5B';
}

function systemAverages(snapshot: WorldSnapshot | null): CardMeter[] {
  if (!snapshot) return [];
  return SYSTEM_ORDER.map((sys: SystemId) => {
    const sectors = (Object.keys(SECTORS) as SectorId[]).filter((s) => SECTORS[s].system === sys);
    const avg = sectors.reduce((a, s) => a + (snapshot.sectors[s] ?? 0), 0) / Math.max(1, sectors.length);
    return { label: `${SYSTEMS[sys].emoji} ${SYSTEMS[sys].short}`, value: Math.round(avg), color: SYSTEMS[sys].color };
  });
}

/** Lo que IX dice al hablarle: alerta si algo está en peligro, si no un dato curioso. */
export function ixLine(snapshot: WorldSnapshot | null, n: number): string {
  if (snapshot) {
    const worst = (Object.keys(SECTORS) as SectorId[]).map((s) => [s, snapshot.sectors[s] ?? 100] as const).sort((a, b) => a[1] - b[1])[0];
    if (worst && worst[1] < 35 && n % 2 === 0) return `¡Atención! ${SECTORS[worst[0]].name} está al ${worst[1]} %. Si su sistema falla, toda la colonia lo sentirá.`;
  }
  return IX_FACTS[n % IX_FACTS.length];
}

export function cardFor(ev: InteractEvent, snapshot: WorldSnapshot | null, n: number): WorldCard | null {
  const id = ev.defId;
  if (id.startsWith('sector.')) {
    const s = id.slice('sector.'.length) as SectorId;
    const info = SECTORS[s];
    const sys = SYSTEMS[info.system];
    const h = Number(ev.state.health ?? snapshot?.sectors[s] ?? 100);
    const crew = snapshot?.crews?.find((c) => c.sectorId === s);
    const lines = [
      { label: 'Sistema', value: `${sys.emoji} ${sys.name}` },
      { label: 'Estado', value: healthStatus(h) },
    ];
    if (crew) lines.push({ label: 'Tripulación', value: `${crew.name}: ${crew.members.map((m) => m.name).join(', ')}` });
    return { kind: 'sector', emoji: info.emoji, title: info.name, text: info.desc + '.', color: sys.color, meters: [{ label: 'Salud del sector', value: Math.round(h), color: healthTone(h) }], lines };
  }
  if (id === 'structure.hub') {
    return {
      kind: 'info',
      emoji: '🛰️',
      title: 'Centro de mando',
      text: 'Desde aquí IX coordina a las ocho tripulaciones. Cada sector cuida uno de los cuatro sistemas que mantienen viva la colonia.',
      color: '#B69CFF',
      meters: systemAverages(snapshot),
    };
  }
  if (id === 'character.ix') {
    return { kind: 'ix', emoji: '🤖', title: 'IX', text: ixLine(snapshot, n), color: '#B69CFF' };
  }
  if (id.startsWith('building.') && id !== 'building.cityTower') {
    const b = id.slice('building.'.length) as BuildingId;
    return { kind: 'info', emoji: BUILDINGS[b].emoji, title: BUILDINGS[b].name, text: `${BUILDINGS[b].desc} La clase lo desbloqueó al completar una misión.`, color: '#FFC93C' };
  }
  if (id === 'building.cityTower') {
    return { kind: 'info', emoji: '🌙', title: BUILDINGS.city.name, text: BUILDINGS.city.desc, color: '#B69CFF' };
  }
  if (id === 'landmark.discovery') {
    return { kind: 'discovery', emoji: '✨', title: String(ev.params.label ?? 'Descubrimiento'), text: String(ev.params.text || ev.description), color: '#B69CFF' };
  }
  if (id.startsWith('landmark.')) {
    return { kind: 'discovery', emoji: id === 'landmark.icecave' ? '🧊' : id === 'landmark.meteorite' ? '☄️' : '🫐', title: ev.name, text: ev.description, color: '#7FDBFF' };
  }
  if (id === 'vehicle.rover') {
    return {
      kind: 'info',
      emoji: '🚙',
      title: ev.name,
      text: `${ev.description} Los rovers reales se manejan desde la Tierra y cada orden tarda de 3 a 22 minutos en llegar: por eso avanzan despacio y con cuidado.`,
      color: '#FF9A3C',
    };
  }
  if (id === 'prop.lander') {
    return { kind: 'info', emoji: '🚀', title: ev.name, text: ev.description, color: '#FF9A3C' };
  }
  return null;
}
