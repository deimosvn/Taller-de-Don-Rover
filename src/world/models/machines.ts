// IX (la inteligencia de la colonia, convertida en un dron que flota) y el rover de
// exploración. Los dos se mueven solos por el mundo y reaccionan a su estado.

import { Group, Vector3 } from 'three';
import { IX_PURPLE } from '../core/palette';
import { damp } from '../core/math';
import type { BuildContext, BuiltModel, EntityState, UpdateContext } from '../entities/types';
import { Sculpt } from './sculpt';
import { DARK, INK, PANEL, STEEL, WHITE } from './util';

/* ------------------------------------------------------------------ */
/* IX                                                                   */
/* ------------------------------------------------------------------ */

export const IX_HOVER = 2.3;

export function buildIx(ctx: BuildContext): BuiltModel {
  const kit = ctx.kit;
  const d = ctx.detail;
  const root = new Group();
  root.name = 'ix';
  const float = new Group();
  float.position.y = IX_HOVER;
  root.add(float);

  const s = new Sculpt(d);
  s.sphere(0.42, WHITE, { rough: 0.28 });
  s.torus(0.425, 0.045, IX_PURPLE, { rot: [Math.PI / 2, 0, 0], glow: 0.7, rough: 0.4 });
  s.sphere(0.3, '#1B1640', { at: [0, 0.03, 0.2], scale: [1.08, 0.82, 0.62], rough: 0.25, metal: 0.2 });
  for (const x of [0.43, -0.43]) {
    s.cylinder(0.11, 0.13, 0.16, PANEL, { at: [x, -0.02, 0], rot: [0, 0, Math.PI / 2], rough: 0.4 });
    s.cylinder(0.07, 0.07, 0.04, IX_PURPLE, { at: [x * 1.12, -0.02, 0], rot: [0, 0, Math.PI / 2], glow: 1.4 });
  }
  s.cylinder(0.018, 0.018, 0.26, STEEL, { at: [0, 0.52, 0], metal: 0.5, rough: 0.3 });
  s.sphere(0.06, IX_PURPLE, { at: [0, 0.67, 0], glow: 1.6 });
  s.cylinder(0.16, 0.08, 0.1, PANEL, { at: [0, -0.43, 0], rough: 0.4 });
  s.disc(0.07, IX_PURPLE, { at: [0, -0.485, 0], rot: [Math.PI, 0, 0], glow: 2 });
  const body = s.mesh(kit.paint, 'ix:body')!;
  float.add(body);

  const eyesGroup = new Group();
  eyesGroup.position.set(0, 0.05, 0.37);
  const e = new Sculpt(d);
  e.capsule(0.045, 0.07, '#E9DEFF', { at: [0.1, 0, 0], glow: 1.8 });
  e.capsule(0.045, 0.07, '#E9DEFF', { at: [-0.1, 0, 0], glow: 1.8 });
  const eyes = e.mesh(kit.paint, 'ix:eyes', false)!;
  eyesGroup.add(eyes);
  float.add(eyesGroup);

  const h = new Sculpt(d);
  h.torus(0.64, 0.028, IX_PURPLE, { glow: 1.1, rough: 0.4 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    h.sphere(0.05, WHITE, { at: [Math.cos(a) * 0.64, 0, Math.sin(a) * 0.64], glow: 0.6 });
  }
  const halo = h.mesh(kit.paint, 'ix:halo', false)!;
  halo.rotation.x = Math.PI / 2 - 0.35;
  float.add(halo);

  // Haz del escáner (solo al escanear).
  const b = new Sculpt(d);
  b.cone(0.9, IX_HOVER - 0.45, IX_PURPLE, { at: [0, -(IX_HOVER - 0.45) / 2 - 0.45, 0], sides: 24 });
  const beam = b.mesh(kit.light(IX_PURPLE, 0.16), 'ix:beam', false)!;
  beam.visible = false;
  float.add(beam);

  let blink = 0;
  let blinkTimer = 2;
  let spin = 0;
  const update = (state: EntityState, uc: UpdateContext) => {
    const mode = String(state.mode ?? 'idle');
    const t = uc.time;
    const talk = mode === 'talk';
    float.position.y = IX_HOVER + Math.sin(t * 1.6) * 0.12;
    float.rotation.z = Math.sin(t * 1.1) * 0.06;
    float.rotation.x = Math.sin(t * 0.8) * 0.05 + Number(state.tilt ?? 0);
    spin += uc.dt * (mode === 'scan' ? 3.2 : 1.1);
    halo.rotation.z = spin;
    beam.visible = mode === 'scan';
    if (beam.visible) beam.rotation.y = spin * 0.5;
    blinkTimer -= uc.dt;
    if (blinkTimer <= 0) {
      blink = 0.12;
      blinkTimer = 2.5 + Math.random() * 3;
    }
    if (blink > 0) blink -= uc.dt;
    const pulse = talk ? 1 + Math.abs(Math.sin(t * 9)) * 0.35 : 1;
    eyesGroup.scale.set(1, blink > 0 ? 0.15 : pulse, 1);
  };

  return {
    object: root,
    anchors: { head: new Vector3(0, IX_HOVER, 0), talk: new Vector3(0, 0, 0), label: new Vector3(0, IX_HOVER + 1, 0) },
    rig: { float, eyes: eyesGroup, halo, beam },
    update,
  };
}

/* ------------------------------------------------------------------ */
/* Rover                                                                */
/* ------------------------------------------------------------------ */

export const ROVER_WHEEL_R = 0.34;

export function buildRover(ctx: BuildContext): BuiltModel {
  const kit = ctx.kit;
  const d = ctx.detail;
  const root = new Group();
  root.name = 'rover';
  const accent = '#FF9A3C';

  const s = new Sculpt(d);
  // Chasis
  s.box(1.5, 0.5, 2.4, WHITE, { at: [0, 0.82, 0], radius: 0.16, rough: 0.5 });
  s.box(1.52, 0.1, 2.42, accent, { at: [0, 0.68, 0], radius: 0.04, rough: 0.55 });
  s.box(1.3, 0.2, 0.3, DARK, { at: [0, 0.6, 1.2], radius: 0.06 });
  // Panel solar
  s.box(1.75, 0.06, 1.55, '#2E3C8F', { at: [0, 1.12, -0.25], radius: 0.02, rough: 0.25, metal: 0.35 });
  if (d) {
    for (let i = -2; i <= 2; i++) s.box(0.015, 0.07, 1.5, '#8FA4FF', { at: [i * 0.34, 1.13, -0.25], radius: 0.004, glow: 0.15 });
    for (let j = -1; j <= 1; j++) s.box(1.7, 0.07, 0.015, '#8FA4FF', { at: [0, 1.13, -0.25 + j * 0.5], radius: 0.004, glow: 0.15 });
  }
  // Mástil con cámara
  s.cylinder(0.06, 0.07, 0.95, STEEL, { at: [0.48, 1.5, 0.82], metal: 0.5, rough: 0.35 });
  // Antena parabólica trasera
  s.cylinder(0.03, 0.03, 0.4, STEEL, { at: [-0.45, 1.3, -0.95], metal: 0.5 });
  s.lathe(
    [
      [0.01, 0],
      [0.18, 0.04],
      [0.3, 0.12],
    ],
    PANEL,
    { at: [-0.45, 1.5, -0.95], rot: [0.5, 0, 0], rough: 0.4 },
  );
  // Faros
  for (const x of [0.45, -0.45]) s.sphere(0.07, '#FFF4C2', { at: [x, 0.84, 1.21], glow: 2.2 });
  s.box(0.5, 0.12, 0.04, INK, { at: [0, 0.95, 1.21], radius: 0.03 });
  // Balancines (rocker-bogie)
  for (const x of [0.92, -0.92]) {
    s.tube(
      [
        [x, ROVER_WHEEL_R, 0.95],
        [x, 0.72, 0.35],
        [x, 0.62, -0.2],
        [x, ROVER_WHEEL_R, -0.95],
      ],
      0.045,
      STEEL,
      { metal: 0.45, rough: 0.35 },
    );
    s.sphere(0.08, accent, { at: [x, 0.72, 0.35] });
  }
  const chassis = s.mesh(kit.paint, 'rover:chassis')!;
  root.add(chassis);

  // Cabeza de la cámara (gira lentamente)
  const headSculpt = new Sculpt(d);
  headSculpt.box(0.42, 0.24, 0.24, WHITE, { radius: 0.06, rough: 0.45 });
  headSculpt.cylinder(0.06, 0.06, 0.05, INK, { at: [0.1, 0, 0.13], rot: [Math.PI / 2, 0, 0] });
  headSculpt.cylinder(0.06, 0.06, 0.05, INK, { at: [-0.1, 0, 0.13], rot: [Math.PI / 2, 0, 0] });
  headSculpt.sphere(0.035, '#7FDBFF', { at: [0.1, 0, 0.16], glow: 1.6 });
  headSculpt.sphere(0.035, '#7FDBFF', { at: [-0.1, 0, 0.16], glow: 1.6 });
  const head = headSculpt.mesh(kit.paint, 'rover:head')!;
  head.position.set(0.48, 2.02, 0.82);
  root.add(head);

  // Ruedas
  const wheels: Group[] = [];
  const wheelSculpt = (side: 1 | -1) => {
    const w = new Sculpt(d);
    w.cylinder(ROVER_WHEEL_R, ROVER_WHEEL_R, 0.28, '#3A3450', { rot: [0, 0, Math.PI / 2], rough: 0.9, sides: 22 });
    w.cylinder(0.2, 0.2, 0.3, PANEL, { rot: [0, 0, Math.PI / 2], rough: 0.4, sides: 16 });
    w.cylinder(0.07, 0.07, 0.32, accent, { at: [0.0 * side, 0, 0], rot: [0, 0, Math.PI / 2], sides: 12 });
    if (d) for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      w.box(0.3, 0.05, 0.06, '#2A2440', { at: [0, Math.cos(a) * ROVER_WHEEL_R, Math.sin(a) * ROVER_WHEEL_R], rot: [a, 0, 0], radius: 0.01 });
    }
    return w.mesh(kit.paint, 'rover:wheel')!;
  };
  for (const x of [1.0, -1.0]) {
    for (const z of [0.95, 0, -0.95]) {
      const g = new Group();
      g.position.set(x, ROVER_WHEEL_R, z);
      g.add(wheelSculpt(x > 0 ? 1 : -1));
      root.add(g);
      wheels.push(g);
    }
  }

  let roll = 0;
  let pan = 0;
  const update = (state: EntityState, uc: UpdateContext) => {
    const speed = Number(state.speed ?? 0);
    roll += (speed * uc.dt) / ROVER_WHEEL_R;
    for (const w of wheels) w.rotation.x = roll;
    pan = damp(pan, Math.sin(uc.time * 0.4) * 0.9, 2, uc.dt);
    head.rotation.y = pan;
    chassis.position.y = Math.sin(uc.time * 9) * 0.006 * Math.min(1, speed);
  };

  return {
    object: root,
    anchors: { head: new Vector3(0, 1.4, 0), door: new Vector3(0, 0.9, 1.5), label: new Vector3(0, 2.6, 0) },
    rig: { chassis, head, ...Object.fromEntries(wheels.map((w, i) => [`wheel${i}`, w])) },
    update,
  };
}
