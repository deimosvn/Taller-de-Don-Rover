// Astronauta 3D del Taller de Don Rover. Es el mismo personaje que cada alumno arma en su celular (traje,
// casco, visor y accesorio) llevado a 3D, con un esqueleto de articulaciones para animarlo:
//
//   root ─ body ─ hips ─┬─ legL / legR
//                       └─ torso ─┬─ armL / armR (la mano derecha sostiene tableta o llave)
//                                 └─ head ─ eyes
//
// Animaciones (se mezclan entre sí con suavidad): idle, walk, run, jump, wave, scan, talk,
// work, cheer, sad y point. El estado de la entidad elige la animación (`anim`) y la
// rapidez del paso (`speed`, 1 = caminar normal).

import { Group, Mesh, SphereGeometry, Vector3, type Material } from 'three';
import { ACCESSORIES, HELMETS, ROLES, SUIT_COLORS, VISORS } from '../../../shared/content';
import type { AvatarConfig, RoleId } from '../../../shared/types';
import { damp } from '../core/math';
import type { BuildContext, BuiltModel, EntityState, UpdateContext } from '../entities/types';
import { Sculpt, type MaterialKit } from './sculpt';
import { DARK, INK, labelSprite, shade } from './util';

export type AnimName = 'idle' | 'walk' | 'run' | 'jump' | 'wave' | 'scan' | 'talk' | 'work' | 'cheer' | 'sad' | 'point';
/** Orden fijo para enviar la animación por la red como un número. */
export const ANIMS: AnimName[] = ['idle', 'walk', 'run', 'jump', 'wave', 'scan', 'talk', 'work', 'cheer', 'sad', 'point'];

/** Escala del personaje: con ella el astronauta mide ≈ 1.75 u (casco incluido). */
export const ASTRO_SCALE = 0.86;
/** Altura de los ojos (para la cámara en primera persona). */
export const ASTRO_EYE = 1.38;
/** Altura del centro del casco (para encuadres y etiquetas). */
export const ASTRO_HEAD = 1.36;

export interface AstronautParams {
  avatar: AvatarConfig;
  role?: RoleId | null;
  /** Nombre que flota sobre la cabeza (opcional). */
  label?: string;
  labelColor?: string;
  /** Semilla para que dos astronautas no se muevan exactamente igual. */
  seed?: number;
}

const GLOVE = '#EEF0F8';
const BOOT = '#E3E6F2';
const SCREEN = '#1B1640';
const _lp = new Vector3();

/* ------------------------------------------------------------------ */
/* Piezas                                                               */
/* ------------------------------------------------------------------ */

function legMesh(kit: MaterialKit, suit: string, dark: string, side: 1 | -1): Mesh {
  const s = new Sculpt(1);
  s.capsule(0.118, 0.28, suit, { at: [0, -0.27, 0], rough: 0.75 });
  s.sphere(0.07, dark, { at: [0, -0.28, 0.095], scale: [1, 0.8, 0.6], rough: 0.6 });
  s.box(0.25, 0.15, 0.34, BOOT, { at: [0, -0.555, 0.045], radius: 0.06, rough: 0.55 });
  s.box(0.26, 0.04, 0.35, DARK, { at: [0, -0.625, 0.045], radius: 0.015, rough: 0.8 });
  s.box(0.06, 0.05, 0.06, dark, { at: [0.09 * side, -0.5, 0.17], radius: 0.015 });
  return s.mesh(kit.paint, 'astro:leg')!;
}

function armMesh(kit: MaterialKit, suit: string, side: 1 | -1): Mesh {
  const s = new Sculpt(1);
  s.sphere(0.125, suit, { rough: 0.7 });
  s.capsule(0.096, 0.2, suit, { at: [0.02 * side, -0.19, 0], rough: 0.72 });
  s.torus(0.088, 0.03, GLOVE, { at: [0.02 * side, -0.33, 0], rot: [Math.PI / 2, 0, 0], rough: 0.5 });
  s.sphere(0.112, GLOVE, { at: [0.025 * side, -0.41, 0.01], scale: [1, 1.05, 0.95], rough: 0.5 });
  s.capsule(0.035, 0.05, GLOVE, { at: [-0.045 * side, -0.4, 0.075], rot: [0.6, 0, 0], rough: 0.5 });
  return s.mesh(kit.paint, 'astro:arm')!;
}

function torsoMesh(kit: MaterialKit, suit: string, dark: string, light: string, roleColor: string): Mesh {
  const s = new Sculpt(1);
  // Cadera y cinturón.
  s.box(0.5, 0.2, 0.36, DARK, { at: [0, -0.02, 0], radius: 0.08, rough: 0.7 });
  s.box(0.12, 0.08, 0.04, '#C9CCE0', { at: [0, -0.02, 0.185], radius: 0.015, metal: 0.4, rough: 0.35 });
  // Cuerpo.
  s.box(0.6, 0.52, 0.42, suit, { at: [0, 0.29, 0], radius: 0.17, rough: 0.72 });
  s.box(0.44, 0.07, 0.03, light, { at: [0, 0.46, 0.2], radius: 0.03, rough: 0.6 });
  // Placa del pecho con la insignia del rol.
  s.box(0.32, 0.22, 0.06, GLOVE, { at: [0, 0.29, 0.2], radius: 0.05, rough: 0.45 });
  s.cylinder(0.075, 0.075, 0.03, INK, { at: [0, 0.29, 0.235], rot: [Math.PI / 2, 0, 0], sides: 24 });
  s.cylinder(0.058, 0.058, 0.035, roleColor, { at: [0, 0.29, 0.24], rot: [Math.PI / 2, 0, 0], sides: 24, glow: 0.65, rough: 0.4 });
  s.box(0.05, 0.03, 0.02, '#FF6B5B', { at: [-0.1, 0.36, 0.235], radius: 0.01, glow: 0.8 });
  s.box(0.05, 0.03, 0.02, '#55DB7A', { at: [0.1, 0.36, 0.235], radius: 0.01, glow: 0.8 });
  // Mochila de soporte vital con dos tanques.
  s.box(0.48, 0.52, 0.22, dark, { at: [0, 0.31, -0.28], radius: 0.08, rough: 0.7 });
  s.cylinder(0.075, 0.075, 0.42, '#D6D9EA', { at: [0.12, 0.31, -0.41], metal: 0.45, rough: 0.35 });
  s.cylinder(0.075, 0.075, 0.42, '#D6D9EA', { at: [-0.12, 0.31, -0.41], metal: 0.45, rough: 0.35 });
  s.sphere(0.035, roleColor, { at: [0.17, 0.58, -0.3], glow: 1.2 });
  // Collar del casco.
  s.torus(0.2, 0.055, dark, { at: [0, 0.56, 0], rot: [Math.PI / 2, 0, 0], rough: 0.6 });
  return s.mesh(kit.paint, 'astro:torso')!;
}

interface HeadParts {
  shell: Mesh;
  visor: Mesh | null;
  eyes: Mesh;
  /** Altura de los ojos dentro de la cabeza. */
  eyeY: number;
}

/** Centro del casco dentro del grupo de la cabeza. */
const C = 0.36;

const wrap = (i: number, n: number) => ((Math.round(i) % n) + n) % n;

function headParts(kit: MaterialKit, avatar: AvatarConfig, suit: string, dark: string, light: string): HeadParts {
  const visorTint = VISORS[wrap(avatar.visor, VISORS.length)];
  const glowTint = shade(visorTint, 0.5);
  const s = new Sculpt(1);
  const v = new Sculpt(1);
  const e = new Sculpt(1);
  const helmet = wrap(avatar.helmet, HELMETS.length);
  let eyeY = C;

  switch (helmet) {
    case 1: {
      // Gorra
      s.sphere(0.41, suit, { at: [0, C, 0], rough: 0.6 });
      s.add(new SphereGeometry(0.43, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.44), dark, { at: [0, C, 0], rough: 0.7 });
      s.cylinder(0.3, 0.3, 0.045, light, { at: [0, C + 0.17, 0.3], scale: [1, 1, 1.15], rot: [0.18, 0, 0], rough: 0.6 });
      s.box(0.2, 0.08, 0.03, GLOVE, { at: [0, C + 0.27, 0.32], rot: [-0.55, 0, 0], radius: 0.02 });
      s.box(0.64, 0.22, 0.22, SCREEN, { at: [0, C - 0.04, 0.27], radius: 0.1, rough: 0.25, metal: 0.2 });
      e.box(0.14, 0.05, 0.02, glowTint, { at: [0.13, C - 0.03, 0.39], radius: 0.02, glow: 1.6 });
      e.box(0.14, 0.05, 0.02, glowTint, { at: [-0.13, C - 0.03, 0.39], radius: 0.02, glow: 1.6 });
      eyeY = C - 0.03;
      break;
    }
    case 2: {
      // Goggles
      s.sphere(0.41, suit, { at: [0, C, 0], rough: 0.6 });
      s.torus(0.415, 0.035, dark, { at: [0, C + 0.06, 0], rot: [Math.PI / 2, 0, 0], rough: 0.7 });
      for (const x of [0.135, -0.135]) {
        s.torus(0.095, 0.035, GLOVE, { at: [x, C + 0.06, 0.36], rough: 0.4 });
        v.sphere(0.085, visorTint, { at: [x, C + 0.06, 0.36], scale: [1, 1, 0.45] });
        e.sphere(0.035, '#FFFFFF', { at: [x, C + 0.06, 0.345], glow: 1.2 });
      }
      s.box(0.32, 0.17, 0.14, GLOVE, { at: [0, C - 0.17, 0.33], radius: 0.07, rough: 0.5 });
      for (const x of [-0.08, -0.027, 0.027, 0.08]) s.box(0.015, 0.09, 0.02, '#9AA0C2', { at: [x, C - 0.17, 0.405], radius: 0.005 });
      eyeY = C + 0.06;
      break;
    }
    case 3: {
      // Robot
      s.box(0.74, 0.68, 0.66, suit, { at: [0, C, 0], radius: 0.17, rough: 0.55 });
      s.box(0.13, 0.14, 0.22, dark, { at: [0, C + 0.4, 0], radius: 0.04 });
      s.box(0.62, 0.24, 0.08, SCREEN, { at: [0, C + 0.06, 0.31], radius: 0.06, rough: 0.25 });
      e.sphere(0.06, glowTint, { at: [0.15, C + 0.06, 0.355], glow: 1.6 });
      e.sphere(0.06, glowTint, { at: [-0.15, C + 0.06, 0.355], glow: 1.6 });
      s.box(0.38, 0.15, 0.06, GLOVE, { at: [0, C - 0.17, 0.32], radius: 0.03 });
      for (const x of [-0.12, -0.04, 0.04, 0.12]) s.box(0.02, 0.1, 0.02, '#9AA0C2', { at: [x, C - 0.17, 0.355], radius: 0.006 });
      for (const x of [0.38, -0.38]) s.cylinder(0.07, 0.07, 0.06, dark, { at: [x, C, 0], rot: [0, 0, Math.PI / 2] });
      eyeY = C + 0.06;
      break;
    }
    case 4: {
      // Buzo
      s.sphere(0.42, suit, { at: [0, C, 0], rough: 0.55 });
      s.cylinder(0.07, 0.08, 0.1, '#D6D9EA', { at: [0, C + 0.44, 0], metal: 0.5, rough: 0.35 });
      s.torus(0.22, 0.06, '#F2C462', { at: [0, C, 0.35], metal: 0.75, rough: 0.28 });
      s.sphere(0.2, SCREEN, { at: [0, C, 0.3], scale: [1, 1, 0.5], rough: 0.4 });
      v.sphere(0.19, visorTint, { at: [0, C, 0.36], scale: [1, 1, 0.42] });
      e.sphere(0.03, '#FFFFFF', { at: [0.065, C + 0.01, 0.35], glow: 1.4 });
      e.sphere(0.03, '#FFFFFF', { at: [-0.065, C + 0.01, 0.35], glow: 1.4 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const x = Math.cos(a) * 0.31;
        const y = Math.sin(a) * 0.31;
        const z = Math.sqrt(Math.max(0, 0.42 * 0.42 - x * x - y * y)) - 0.01;
        s.sphere(0.028, '#D6D9EA', { at: [x, C + y, z], metal: 0.5, rough: 0.35 });
      }
      break;
    }
    default: {
      // Burbuja
      s.sphere(0.42, '#F2F3FA', { at: [0, C, 0], rough: 0.32 });
      s.sphere(0.3, SCREEN, { at: [0, C, 0.12], scale: [1.08, 0.88, 0.62], rough: 0.4 });
      v.sphere(0.31, visorTint, { at: [0, C, 0.16], scale: [1.12, 0.92, 0.66] });
      e.sphere(0.055, '#FFFFFF', { at: [0.1, C + 0.01, 0.315], scale: [1, 1.4, 0.5], glow: 1.3 });
      e.sphere(0.055, '#FFFFFF', { at: [-0.1, C + 0.01, 0.315], scale: [1, 1.4, 0.5], glow: 1.3 });
      // Franja del color del traje alrededor del casco.
      s.torus(0.425, 0.03, suit, { at: [0, C - 0.16, 0], rot: [Math.PI / 2, 0, 0], rough: 0.6 });
    }
  }

  // Accesorios
  const top = helmet === 3 ? C + 0.46 : C + 0.42;
  switch (wrap(avatar.accessory, ACCESSORIES.length)) {
    case 1:
      s.cylinder(0.016, 0.016, 0.3, INK, { at: [0, top + 0.15, 0] });
      s.sphere(0.06, '#FF4FB0', { at: [0, top + 0.32, 0], glow: 0.9, rough: 0.4 });
      break;
    case 2:
      s.tube(
        [
          [0, top - 0.02, 0],
          [0.01, top + 0.1, 0],
          [0, top + 0.18, 0.01],
        ],
        0.022,
        '#2F9E52',
      );
      s.sphere(0.09, '#55DB7A', { at: [-0.08, top + 0.19, 0], scale: [1.2, 0.45, 0.7], rot: [0, 0, 0.5] });
      s.sphere(0.08, '#7BE896', { at: [0.08, top + 0.21, 0], scale: [1.2, 0.45, 0.7], rot: [0, 0, -0.5] });
      break;
    case 3:
      for (const x of [0.22, -0.22]) {
        s.cone(0.11, 0.22, suit, { at: [x, top - 0.02, 0], rot: [0, 0, x > 0 ? -0.45 : 0.45], sides: 4 });
        s.cone(0.06, 0.13, '#FF9EC7', { at: [x * 1.02, top - 0.03, 0.04], rot: [0, 0, x > 0 ? -0.45 : 0.45], sides: 4 });
      }
      break;
    case 4:
      s.torus(0.44, 0.035, '#FF4FB0', { at: [0, C, 0], rot: [0, Math.PI / 2, 0], arc: Math.PI, rough: 0.45 });
      for (const x of [0.43, -0.43]) s.cylinder(0.1, 0.1, 0.1, '#FF4FB0', { at: [x, C, 0], rot: [0, 0, Math.PI / 2], rough: 0.45 });
      break;
    case 5:
      s.torus(0.64, 0.032, '#FFD27A', { at: [0, C + 0.02, 0], rot: [Math.PI / 2 - 0.32, 0, 0.22], glow: 0.25, rough: 0.35, metal: 0.4 });
      break;
  }

  const shell = s.mesh(kit.paint, 'astro:helmet')!;
  const visor = v.empty ? null : v.mesh(kit.glass(visorTint, 0.58), 'astro:visor', false);
  const eyes = e.mesh(kit.paint, 'astro:eyes', false)!;
  return { shell, visor, eyes, eyeY };
}

/** Versión lejana: el mismo personaje en reposo, fusionado en una sola malla. */
function lowAstronaut(kit: MaterialKit, avatar: AvatarConfig, suit: string, dark: string, roleColor: string): Mesh {
  const s = new Sculpt(0);
  const visorTint = VISORS[wrap(avatar.visor, VISORS.length)];
  for (const x of [0.15, -0.15]) {
    s.capsule(0.12, 0.3, suit, { at: [x, 0.34, 0] });
    s.box(0.25, 0.15, 0.34, BOOT, { at: [x, 0.07, 0.045] });
  }
  s.box(0.6, 0.6, 0.42, suit, { at: [0, 0.95, 0] });
  s.box(0.48, 0.52, 0.22, dark, { at: [0, 0.97, -0.28] });
  s.cylinder(0.06, 0.06, 0.03, roleColor, { at: [0, 0.95, 0.22], rot: [Math.PI / 2, 0, 0], glow: 0.6 });
  for (const x of [0.36, -0.36]) s.capsule(0.1, 0.3, suit, { at: [x, 0.88, 0], rot: [0, 0, x > 0 ? 0.12 : -0.12] });
  const helmet = wrap(avatar.helmet, HELMETS.length);
  if (helmet === 3) s.box(0.74, 0.68, 0.66, suit, { at: [0, 1.58, 0] });
  else s.sphere(0.42, helmet === 0 ? '#F2F3FA' : suit, { at: [0, 1.58, 0] });
  s.sphere(0.3, visorTint, { at: [0, 1.58, 0.16], scale: [1.1, 0.9, 0.64], glow: 0.35, rough: 0.3 });
  const m = s.mesh(kit.paint, 'astro:low')!;
  m.scale.setScalar(ASTRO_SCALE);
  return m;
}

/* ------------------------------------------------------------------ */
/* Construcción del modelo con esqueleto                                */
/* ------------------------------------------------------------------ */

interface Pose {
  hipsY: number;
  lean: number;
  twist: number;
  headX: number;
  headY: number;
  headZ: number;
  armLX: number;
  armLZ: number;
  armRX: number;
  armRZ: number;
  legLX: number;
  legRX: number;
}

const ZERO_POSE: Pose = { hipsY: 0, lean: 0, twist: 0, headX: 0, headY: 0, headZ: 0, armLX: 0, armLZ: 0.12, armRX: 0, armRZ: -0.12, legLX: 0, legRX: 0 };
const POSE_KEYS = Object.keys(ZERO_POSE) as (keyof Pose)[];

export function normalizeAvatar(a: Partial<AvatarConfig> | null | undefined): AvatarConfig {
  return {
    suit: wrap(a?.suit ?? 0, SUIT_COLORS.length),
    helmet: wrap(a?.helmet ?? 0, HELMETS.length),
    visor: wrap(a?.visor ?? 0, VISORS.length),
    accessory: wrap(a?.accessory ?? 0, ACCESSORIES.length),
  };
}

export function buildAstronaut(ctx: BuildContext, params: Record<string, unknown>): BuiltModel {
  const p = params as unknown as AstronautParams;
  const avatar = normalizeAvatar(p.avatar);
  const role = p.role ?? null;
  const suit = SUIT_COLORS[avatar.suit];
  const dark = shade(suit, -0.32);
  const light = shade(suit, 0.3);
  const roleColor = role ? ROLES[role].color : '#FFF8EC';
  const kit = ctx.kit;

  const root = new Group();
  root.name = 'astronaut';
  const anchors = {
    head: new Vector3(0, ASTRO_HEAD + 0.1, 0),
    eye: new Vector3(0, ASTRO_EYE, 0.1),
    chest: new Vector3(0, 0.95, 0.2),
    label: new Vector3(0, 2.15, 0),
  };

  if (!ctx.detail) {
    root.add(lowAstronaut(kit, avatar, suit, dark, roleColor));
    return { object: root, anchors };
  }

  const body = new Group();
  body.name = 'body';
  body.scale.setScalar(ASTRO_SCALE);
  root.add(body);

  const hips = new Group();
  hips.name = 'hips';
  hips.position.set(0, 0.62, 0);
  body.add(hips);
  const legL = new Group();
  legL.name = 'legL';
  legL.position.set(0.15, 0, 0);
  legL.add(legMesh(kit, suit, dark, 1));
  const legR = new Group();
  legR.name = 'legR';
  legR.position.set(-0.15, 0, 0);
  legR.add(legMesh(kit, suit, dark, -1));
  hips.add(legL, legR);

  const torso = new Group();
  torso.name = 'torso';
  torso.position.set(0, 0.04, 0);
  torso.add(torsoMesh(kit, suit, dark, light, roleColor));
  hips.add(torso);

  const armL = new Group();
  armL.name = 'armL';
  armL.position.set(0.335, 0.42, 0);
  armL.add(armMesh(kit, suit, 1));
  const armR = new Group();
  armR.name = 'armR';
  armR.position.set(-0.335, 0.42, 0);
  armR.add(armMesh(kit, suit, -1));
  torso.add(armL, armR);

  // Tableta científica (aparece al escanear o señalar).
  const tabletSculpt = new Sculpt(1);
  tabletSculpt.box(0.3, 0.2, 0.025, DARK, { radius: 0.02, rough: 0.4 });
  tabletSculpt.box(0.26, 0.16, 0.01, '#7FDBFF', { at: [0, 0, 0.014], radius: 0.01, glow: 1.4 });
  const tablet = tabletSculpt.mesh(kit.paint, 'astro:tablet', false)!;
  tablet.position.set(0.02, -0.45, 0.12);
  tablet.rotation.set(-1.25, 0, 0);
  tablet.visible = false;
  armR.add(tablet);

  // Llave para reparar.
  const toolSculpt = new Sculpt(1);
  toolSculpt.cylinder(0.025, 0.025, 0.32, '#C9CCE0', { at: [0, -0.1, 0], metal: 0.6, rough: 0.3 });
  toolSculpt.torus(0.06, 0.022, '#C9CCE0', { at: [0, 0.08, 0], metal: 0.6, rough: 0.3, arc: Math.PI * 1.5 });
  toolSculpt.box(0.07, 0.1, 0.07, '#FFC93C', { at: [0, -0.26, 0], radius: 0.02 });
  const tool = toolSculpt.mesh(kit.paint, 'astro:tool', false)!;
  tool.position.set(0.02, -0.43, 0.09);
  tool.rotation.set(Math.PI / 2, 0, 0);
  tool.visible = false;
  armR.add(tool);

  const head = new Group();
  head.name = 'head';
  head.position.set(0, 0.56, 0);
  torso.add(head);
  const parts = headParts(kit, avatar, suit, dark, light);
  head.add(parts.shell);
  if (parts.visor) head.add(parts.visor);
  const eyes = new Group();
  eyes.name = 'eyes';
  eyes.position.set(0, parts.eyeY, 0.3);
  parts.eyes.position.set(0, -parts.eyeY, -0.3);
  eyes.add(parts.eyes);
  head.add(eyes);

  let label: ReturnType<typeof labelSprite> | null = null;
  let labelOn = true;
  if (p.label) {
    label = labelSprite(p.label, { bg: p.labelColor ?? '#FFF8EC', height: 0.3 });
    label.position.copy(anchors.label);
    root.add(label);
  }
  const labelW = label?.scale.x ?? 1;
  const labelH = label?.scale.y ?? 1;

  /* ---------------- animación ---------------- */

  const pose: Pose = { ...ZERO_POSE };
  const goal: Pose = { ...ZERO_POSE };
  const seed = p.seed ?? Math.random() * 10;
  const off = seed * 1.37;
  let phase = seed * 7.13;
  let blinkTimer = 1.5 + (seed % 3);
  let blink = 0;

  function target(anim: AnimName, speed: number, t: number, dt: number): void {
    Object.assign(goal, ZERO_POSE);
    const breathe = Math.sin(t * 1.7 + off);
    switch (anim) {
      case 'walk':
      case 'run': {
        const run = anim === 'run';
        phase += dt * (run ? 10.5 : 7.4) * Math.max(0.45, Math.min(1.6, speed));
        const sw = Math.sin(phase);
        const amp = run ? 0.95 : 0.6;
        goal.legLX = sw * amp;
        goal.legRX = -sw * amp;
        goal.armLX = -sw * (run ? 0.9 : 0.45);
        goal.armRX = sw * (run ? 0.9 : 0.45);
        goal.armLZ = run ? 0.32 : 0.14;
        goal.armRZ = run ? -0.32 : -0.14;
        // Paso marciano: rebote amplio y ligero.
        goal.hipsY = Math.abs(Math.cos(phase)) * (run ? 0.09 : 0.04);
        goal.lean = run ? 0.24 : 0.07;
        goal.twist = sw * (run ? 0.12 : 0.06);
        goal.headX = -goal.lean * 0.6;
        break;
      }
      case 'jump':
        goal.legLX = -0.75;
        goal.legRX = 0.3;
        goal.armLZ = 2.1 + Math.sin(t * 3) * 0.12;
        goal.armRZ = -2.1 - Math.sin(t * 3) * 0.12;
        goal.lean = 0.08;
        goal.headX = -0.18;
        break;
      case 'wave':
        goal.armRZ = -2.45 + Math.sin(t * 8 + off) * 0.38;
        goal.armRX = -0.25;
        goal.headZ = 0.14;
        goal.headY = 0.12;
        goal.armLZ = 0.16 + breathe * 0.02;
        goal.hipsY = breathe * 0.006;
        break;
      case 'scan':
        goal.armRX = -1.25;
        goal.armRZ = 0.1;
        goal.armLX = -1.0;
        goal.armLZ = 0.32;
        goal.headX = 0.28;
        goal.headY = Math.sin(t * 0.9 + off) * 0.12;
        goal.hipsY = breathe * 0.006;
        break;
      case 'point':
        goal.armRX = -1.45;
        goal.armRZ = -0.05;
        goal.headX = -0.05;
        goal.headY = -0.08;
        goal.armLZ = 0.18;
        goal.hipsY = breathe * 0.006;
        break;
      case 'talk':
        goal.armLX = -0.55 + Math.sin(t * 3.1 + off) * 0.38;
        goal.armLZ = 0.42 + Math.sin(t * 2.3 + off) * 0.18;
        goal.armRX = -0.5 + Math.sin(t * 2.7 + off + 1.4) * 0.35;
        goal.armRZ = -0.42 - Math.sin(t * 2.1 + off) * 0.18;
        goal.headX = Math.sin(t * 4.2 + off) * 0.11;
        goal.headY = Math.sin(t * 1.3 + off) * 0.25;
        goal.twist = Math.sin(t * 1.7 + off) * 0.14;
        goal.hipsY = breathe * 0.006;
        break;
      case 'work': {
        const hit = Math.abs(Math.sin(t * 8.5 + off));
        goal.armRX = -1.75 + hit * 0.95;
        goal.armLX = -1.15 + Math.sin(t * 4.2 + off) * 0.12;
        goal.armLZ = 0.25;
        goal.hipsY = -0.06 + hit * 0.015;
        goal.lean = 0.3;
        goal.headX = 0.32;
        goal.legLX = -0.18;
        goal.legRX = 0.18;
        break;
      }
      case 'cheer': {
        const hop = Math.abs(Math.sin(t * 5.4 + off));
        goal.armLZ = 2.6 + Math.sin(t * 9 + off) * 0.25;
        goal.armRZ = -2.6 - Math.sin(t * 9 + off) * 0.25;
        goal.hipsY = hop * 0.2;
        goal.legLX = -hop * 0.35;
        goal.legRX = -hop * 0.35;
        goal.headX = -0.22;
        goal.headZ = Math.sin(t * 4.5 + off) * 0.12;
        break;
      }
      case 'sad':
        goal.headX = 0.48;
        goal.armLZ = 0.04;
        goal.armRZ = -0.04;
        goal.lean = 0.14;
        goal.twist = Math.sin(t * 0.6 + off) * 0.05;
        goal.hipsY = -0.02 + breathe * 0.004;
        break;
      default:
        // idle: respirar y mirar alrededor
        goal.hipsY = breathe * 0.007;
        goal.armLZ = 0.12 + breathe * 0.025;
        goal.armRZ = -0.12 - breathe * 0.025;
        goal.headY = Math.sin(t * 0.37 + off) * 0.38 + Math.sin(t * 0.83 + off) * 0.1;
        goal.headX = Math.sin(t * 0.29 + off) * 0.08;
    }
  }

  function apply(): void {
    hips.position.y = 0.62 + pose.hipsY;
    hips.rotation.x = pose.lean;
    torso.rotation.y = pose.twist;
    head.rotation.set(pose.headX - pose.lean * 0.5, pose.headY, pose.headZ);
    armL.rotation.set(pose.armLX, 0, pose.armLZ);
    armR.rotation.set(pose.armRX, 0, pose.armRZ);
    legL.rotation.x = pose.legLX - pose.lean;
    legR.rotation.x = pose.legRX - pose.lean;
  }

  function update(state: EntityState, uc: UpdateContext): void {
    const anim = ((state.anim as AnimName) || 'idle') as AnimName;
    const speed = Number(state.speed ?? 1);
    const dt = uc.dt;
    target(anim, speed, uc.time, dt);
    const k = anim === 'walk' || anim === 'run' ? 16 : anim === 'jump' ? 12 : 8;
    for (const key of POSE_KEYS) pose[key] = damp(pose[key], goal[key], k, dt);
    apply();
    tablet.visible = anim === 'scan' || anim === 'point';
    tool.visible = anim === 'work';
    // Parpadeo
    blinkTimer -= dt;
    if (blinkTimer <= 0) {
      blink = 0.14;
      blinkTimer = 2.2 + Math.random() * 3.2;
    }
    if (blink > 0) blink -= dt;
    eyes.scale.y = blink > 0 ? 0.12 : 1;
    // El nombre se oculta si la cámara está encima o muy lejos, y se achica al acercarse.
    if (label && uc.eye && labelOn) {
      const d = root.getWorldPosition(_lp).distanceTo(uc.eye);
      label.visible = d > 2.3 && d < 46;
      const k = Math.min(1, Math.max(0.55, d / 7));
      label.scale.set(labelW * k, labelH * k, 1);
    }
  }

  // En primera persona el propio astronauta no se dibuja (la cámara está dentro del casco),
  // pero sigue proyectando su sombra sobre el suelo.
  const saved = new Map<Mesh, Material | Material[]>();
  function setFirstPerson(on: boolean): void {
    body.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      if (on) {
        if (!saved.has(m)) saved.set(m, m.material);
        m.material = kit.shadowOnly;
      } else {
        const original = saved.get(m);
        if (original) m.material = original;
      }
    });
    if (!on) saved.clear();
  }

  function applyState(state: EntityState): void {
    setFirstPerson(Boolean(state.firstPerson));
    labelOn = !state.hideLabel && !state.firstPerson;
    if (label) label.visible = labelOn;
  }

  apply();

  return {
    object: root,
    anchors,
    rig: { root, body, hips, torso, head, eyes, armL, armR, legL, legR, tablet, tool },
    update,
    applyState,
  };
}
