// Piezas del mundo para jugar: la estación donde cada tripulación resuelve el problema de su
// misión y los puntos de recursos del modo libre (regolito, hielo y hematita) que se
// recolectan para construir módulos de la colonia.

import { Group, Vector3 } from 'three';
import { seeded } from '../core/math';
import type { BuildContext, BuiltModel, EntityState, UpdateContext } from '../entities/types';
import { Sculpt } from './sculpt';
import { CONCRETE, DARK, PANEL, STEEL, WHITE, labelSprite, shade } from './util';

/* ------------------------------------------------------------------ */
/* Estación del problema de la misión                                   */
/* ------------------------------------------------------------------ */

/** Consola con baliza flotante: se ve desde lejos para que el alumno sepa a dónde ir. */
export function buildMissionStation(ctx: BuildContext, params: Record<string, unknown>): BuiltModel {
  const kit = ctx.kit;
  const d = ctx.detail;
  const color = String(params.color ?? '#FFC93C');
  const root = new Group();
  root.name = 'station';

  const s = new Sculpt(d);
  // Losa con faldón (el planeta es pequeño y el suelo se curva).
  s.cylinder(1.5, 1.55, 0.6, shade(CONCRETE, -0.08), { at: [0, -0.26, 0], sides: 28, rough: 0.95 });
  s.cylinder(1.5, 1.5, 0.08, CONCRETE, { at: [0, 0.04, 0], sides: 28, rough: 0.9 });
  s.torus(1.32, 0.06, color, { at: [0, 0.09, 0], rot: [Math.PI / 2, 0, 0], glow: 0.5, rough: 0.6 });
  // Consola inclinada hacia el jugador.
  s.box(0.9, 1.0, 0.55, PANEL, { at: [0, 0.5, 0.15], radius: 0.14, rough: 0.5 });
  s.box(1.0, 0.09, 0.66, DARK, { at: [0, 1.05, 0.22], rot: [0.5, 0, 0], radius: 0.03 });
  s.box(0.08, 0.5, 0.08, STEEL, { at: [0.42, 1.3, -0.08], metal: 0.4 });
  s.box(0.08, 0.5, 0.08, STEEL, { at: [-0.42, 1.3, -0.08], metal: 0.4 });
  // Mástil de la baliza.
  s.cylinder(0.06, 0.09, 2.6, STEEL, { at: [0, 1.3, -0.55], metal: 0.4, sides: 10 });
  s.cylinder(0.2, 0.16, 0.12, DARK, { at: [0, 2.62, -0.55], sides: 14 });
  root.add(s.mesh(kit.paint, 'station:body')!);

  const screen = new Sculpt(d);
  screen.box(0.84, 0.02, 0.5, color, { at: [0, 1.1, 0.24], rot: [0.5, 0, 0], radius: 0.01, glow: 1.3 });
  root.add(screen.mesh(kit.paint, 'station:screen', false)!);

  // Rombo flotante que gira y late.
  const beacon = new Group();
  beacon.position.set(0, 3.4, -0.55);
  const b = new Sculpt(d);
  b.cone(0.34, 0.5, color, { at: [0, 0.25, 0], sides: 4, glow: 1.4 });
  b.cone(0.34, 0.5, color, { at: [0, -0.25, 0], rot: [Math.PI, 0, 0], sides: 4, glow: 1.4 });
  beacon.add(b.mesh(kit.paint, 'station:beacon', false)!);
  const ringS = new Sculpt(d);
  ringS.torus(0.62, 0.035, WHITE, { rot: [Math.PI / 2, 0, 0] });
  const ring = ringS.mesh(kit.light(color, 0.8), 'station:ring', false)!;
  beacon.add(ring);
  root.add(beacon);

  // Haz de luz hacia el cielo para encontrar la estación desde lejos.
  const beamS = new Sculpt(d);
  beamS.cylinder(0.08, 0.35, 9, '#FFFFFF', { at: [0, 4.5 + 3.2, -0.55], sides: 12, open: true });
  const beam = beamS.mesh(kit.light(color, 0.22), 'station:beam', false)!;
  root.add(beam);

  if (d && params.label) {
    const label = labelSprite(String(params.label), { height: 0.5 });
    label.position.set(0, 4.35, -0.55);
    root.add(label);
  }

  let solved = false;
  const applyState = (state: EntityState) => {
    solved = Boolean(state.solved);
    beam.visible = !solved;
  };
  const update = (_s: EntityState, uc: UpdateContext) => {
    const t = uc.time;
    beacon.rotation.y = t * (solved ? 0.6 : 1.6);
    beacon.position.y = 3.4 + Math.sin(t * 2.2) * 0.12;
    ring.scale.setScalar(1 + ((t * 0.9) % 1) * (solved ? 0.1 : 0.5));
  };

  return {
    object: root,
    anchors: { console: new Vector3(0, 1.0, 0.7), label: new Vector3(0, 4.35, -0.55), center: new Vector3(0, 1, 0) },
    update,
    applyState,
  };
}

/* ------------------------------------------------------------------ */
/* Puntos de recursos del modo libre                                    */
/* ------------------------------------------------------------------ */

export type ResourceLook = 'regolith' | 'ice' | 'metal';

const LOOK: Record<ResourceLook, { base: string; accent: string; rough: number; metal: number; glow: number }> = {
  regolith: { base: '#C9552E', accent: '#E8814E', rough: 1, metal: 0, glow: 0 },
  ice: { base: '#BFEAF5', accent: '#E9FBFF', rough: 0.18, metal: 0, glow: 0.12 },
  metal: { base: '#4E5A86', accent: '#8C9AC9', rough: 0.55, metal: 0.45, glow: 0 },
};

/**
 * Montículo de un recurso. El estado `amount` (0–1) lo encoge a medida que se recolecta;
 * al llegar a 0 queda solo una marca en el suelo hasta que vuelve a crecer.
 */
export function buildResourceNode(kind: ResourceLook) {
  return (ctx: BuildContext, params: Record<string, unknown>): BuiltModel => {
    const kit = ctx.kit;
    const d = ctx.detail;
    const look = LOOK[kind];
    const rnd = seeded(Number(params.seed ?? 7));
    const root = new Group();
    root.name = `resource:${kind}`;

    // Marca del suelo (siempre visible).
    const mark = new Sculpt(d);
    mark.cylinder(1.25, 1.3, 0.3, shade(look.base, -0.25), { at: [0, -0.1, 0], sides: 18, rough: 1 });
    root.add(mark.mesh(kit.paint, 'resource:mark')!);

    const pile = new Group();
    const s = new Sculpt(d);
    if (kind === 'ice') {
      // Bloques de hielo que asoman del suelo.
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + rnd() * 0.5;
        const r = 0.25 + rnd() * 0.55;
        const h = 0.5 + rnd() * 0.9;
        s.box(0.35 + rnd() * 0.25, h, 0.35 + rnd() * 0.25, i % 2 ? look.base : look.accent, {
          at: [Math.cos(a) * r, h / 2 - 0.05, Math.sin(a) * r],
          rot: [rnd() * 0.4 - 0.2, rnd() * Math.PI, rnd() * 0.4 - 0.2],
          radius: 0.06,
          rough: look.rough,
          glow: look.glow,
        });
      }
    } else if (kind === 'metal') {
      // Rocas oscuras con esferitas de hematita ("arándanos" de Opportunity).
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + rnd();
        s.blob(0.35 + rnd() * 0.25, look.base, { at: [Math.cos(a) * 0.5, 0.25, Math.sin(a) * 0.5], scale: [1, 0.7, 1], rough: look.rough, metal: look.metal });
      }
      for (let i = 0; i < 14; i++) {
        const a = rnd() * Math.PI * 2;
        const r = 0.3 + rnd() * 0.8;
        s.sphere(0.08 + rnd() * 0.06, look.accent, { at: [Math.cos(a) * r, 0.12 + rnd() * 0.4, Math.sin(a) * r], rough: 0.3, metal: 0.6 });
      }
    } else {
      // Montón de regolito suelto con piedritas.
      s.blob(0.85, look.base, { at: [0, 0.18, 0], scale: [1, 0.55, 1], rough: 1 });
      for (let i = 0; i < 7; i++) {
        const a = rnd() * Math.PI * 2;
        const r = 0.5 + rnd() * 0.6;
        s.blob(0.14 + rnd() * 0.12, i % 2 ? look.accent : shade(look.base, -0.15), { at: [Math.cos(a) * r, 0.1, Math.sin(a) * r], rough: 1 });
      }
    }
    pile.add(s.mesh(kit.paint, `resource:${kind}`)!);
    root.add(pile);

    let goal = 1;
    let shown = 1;
    const applyState = (state: EntityState) => {
      goal = Math.max(0, Math.min(1, Number(state.amount ?? 1)));
    };
    const update = (_s: EntityState, uc: UpdateContext) => {
      shown += (goal - shown) * Math.min(1, uc.dt * 6);
      pile.visible = shown > 0.04;
      pile.scale.set(0.35 + shown * 0.65, Math.max(0.05, shown), 0.35 + shown * 0.65);
    };

    return {
      object: root,
      anchors: { center: new Vector3(0, 0.6, 0) },
      update,
      applyState,
    };
  };
}
