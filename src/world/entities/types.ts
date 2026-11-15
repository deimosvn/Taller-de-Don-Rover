// Contrato de las entidades del mundo: todo lo que existe en MARS-01 (personajes, vehículos,
// edificios, objetos, lugares) se describe con una definición reutilizable y se coloca en el
// planeta como una instancia con identificador único. Las futuras misiones solo necesitan
// estos identificadores para asignar objetivos, comportamientos, diálogos o animaciones.

import type { Object3D, Vector3 } from 'three';
import type { MaterialKit } from '../models/sculpt';

export type EntityKind =
  | 'character' // astronautas e IX
  | 'vehicle' // rover
  | 'structure' // hub y sectores de la colonia
  | 'building' // edificios que se desbloquean
  | 'landmark' // rasgos naturales y hallazgos
  | 'prop' // objetos del escenario
  | 'tool' // herramientas
  | 'resource' // recursos de la colonia
  | 'phenomenon'; // fenómenos ambientales

export type InteractionKind = 'inspect' | 'talk' | 'use' | 'collect' | 'enter' | 'repair' | 'scan';

/** Punto de interacción de una entidad. Los de misión existen pero nacen desactivados. */
export interface InteractionDef {
  id: string;
  kind: InteractionKind;
  /** Nombre de un anclaje del modelo. */
  anchor: string;
  /** Alcance en unidades de mundo. */
  radius: number;
  label: string;
  enabled: boolean;
}

/** Cómo se encuadra la entidad cuando la cámara la enfoca. */
export interface FocusPreset {
  distance: number;
  minDistance: number;
  maxDistance: number;
  /** Inclinación inicial (grados). */
  pitch: number;
  /** Altura del punto de mira sobre el suelo. */
  lift: number;
}

/** Colisión aproximada: un cilindro vertical (se resuelve como esferas apiladas). */
export interface ColliderDef {
  radius: number;
  height: number;
}

export type EntityState = Record<string, number | string | boolean | null>;

export interface BuildContext {
  kit: MaterialKit;
  /** 1 = modelo completo, 0 = versión ligera para lejanía. */
  detail: 0 | 1;
}

export interface UpdateContext {
  dt: number;
  time: number;
  /** Brillo ambiental de luces (0 = día, 1 = oscuridad). */
  night: number;
  /** Posición de la cámara (para ajustar etiquetas según la distancia). */
  eye?: Vector3;
}

/** Resultado de construir un modelo. */
export interface BuiltModel {
  /** Raíz del modelo: origen en el suelo, +Y arriba, +Z frente. */
  object: Object3D;
  /** Puntos con nombre en coordenadas locales (puertas, consolas, manos, etiquetas…). */
  anchors: Record<string, Vector3>;
  /** Articulaciones con nombre, listas para rigging/animación. */
  rig?: Record<string, Object3D>;
  /** Animación y reacción al estado, cuadro a cuadro. */
  update?(state: EntityState, ctx: UpdateContext): void;
  /** Se llama cuando cambia el estado (salud, nivel, iluminación…). */
  applyState?(state: EntityState): void;
}

export interface EntityDef {
  /** Identificador de catálogo, p. ej. `structure.greenhouse`. */
  id: string;
  kind: EntityKind;
  name: string;
  description: string;
  /** De qué parte del juego sale (documenta que no es contenido inventado). */
  source: string;
  tags: string[];
  collider: ColliderDef | null;
  focus: FocusPreset;
  interactions: InteractionDef[];
  initialState: EntityState;
  /** Si el jugador puede seleccionarla con un clic. */
  selectable: boolean;
  /** Distancia a partir de la cual se muestra el modelo ligero (0 = sin nivel de detalle). */
  lodDistance: number;
  build(ctx: BuildContext, params: Record<string, unknown>): BuiltModel;
}

export interface Placement {
  /** Dirección unitaria sobre el planeta. */
  dir: Vector3;
  /** Rumbo (rad, horario desde el norte). */
  heading: number;
  /** Altura extra sobre el terreno. */
  lift?: number;
  scale?: number;
}

/** Información pública de una instancia (lo que consumen la interfaz y las misiones). */
export interface EntityInfo {
  uid: string;
  defId: string;
  kind: EntityKind;
  name: string;
  description: string;
  tags: string[];
  state: EntityState;
  visible: boolean;
}
