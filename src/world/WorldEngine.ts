// Motor del mundo 3D de MARS-01. Una instancia = una vista del planeta dentro de un contenedor.
// Reúne renderizador, planeta, cielo, luces, cámara, entidades y estados del juego en un solo
// ciclo de animación (un único requestAnimationFrame que se detiene cuando la vista no se ve).

import {
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PCFShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Sphere,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three';
import type { AvatarConfig, RoleId } from '../../shared/types';
import { BlockWorld, type BlockHit } from './blocks/BlockWorld';
import { keyAt } from './blocks/grid';
import { BLOCKS, type BlockId } from './blocks/types';
import { CameraRig, type CameraMode, type CameraShot, type PlayerView } from './camera/CameraRig';
import { InputController } from './camera/InputController';
import { ColonyDirector } from './colony/ColonyDirector';
import { DEMO_SNAPSHOT, type PresenceMap, type PresencePose, type WorldSnapshot } from './colony/snapshot';
import { CAMERA, PLANET_RADIUS, QUALITY, detectQuality, type QualityTier } from './core/config';
import { Emitter } from './core/emitter';
import { DEG, angleDelta, clamp, damp } from './core/math';
import { LIGHTING, WEATHER, type LightingId, type LightingPreset } from './core/palette';
import { createCatalog } from './entities/catalog';
import { EntityManager, type Entity } from './entities/EntityManager';
import type { EntityInfo, EntityState, InteractionKind } from './entities/types';
import { PostFX } from './fx/PostFX';
import { ANIMS, type AnimName } from './models/astronaut';
import { MaterialKit } from './models/sculpt';
import { HUB_DIR } from './planet/features';
import { terrainRadius } from './planet/heightfield';
import { LANDING_PAD, colonySpot } from './planet/layout';
import { PLAYER, PlayerController, type Sphere as CharSphere } from './player/PlayerController';
import { PlayerInput } from './player/PlayerInput';
import { SurfaceDetail } from './planet/detail';
import { Sky } from './planet/sky';
import { PlanetTerrain } from './planet/terrain';
import { createTerrainMaterial, type TerrainUniforms } from './planet/terrainMaterial';
import { createZones, type ZoneDef, type ZoneRegistry } from './zones';

export interface WorldOptions {
  /** Permite explorar con ratón/táctil. Si es false la vista es un fondo animado. */
  interactive?: boolean;
  /** Atajos de teclado (solo en la vista de exploración a pantalla completa). */
  keyboard?: boolean;
  quality?: QualityTier | 'auto';
  lighting?: LightingId;
  /** Empieza con la rotación continua del planeta. */
  autoRotate?: boolean;
  /** Distancia inicial de la cámara. */
  distance?: number;
}

/** Quién juega en este dispositivo. */
export interface PlayerProfile {
  /** Id del jugador en la sesión (null en el explorador sin sesión). */
  id: string | null;
  name: string;
  avatar: AvatarConfig;
  role: RoleId | null;
}

export interface PlayerPrompt {
  uid: string;
  interactionId: string;
  label: string;
  kind: InteractionKind;
}

/** Estado del jugador para la interfaz (HUD). */
export interface PlayerHud {
  view: PlayerView;
  prompt: PlayerPrompt | null;
  grounded: boolean;
  running: boolean;
}

/** El jugador interactuó con algo del mundo. */
export interface InteractEvent {
  uid: string;
  defId: string;
  kind: InteractionKind;
  interactionId: string;
  name: string;
  description: string;
  state: EntityState;
  params: Record<string, unknown>;
}

/** Quien lleva el inventario del modo libre (la interfaz): el motor solo mueve bloques. */
export interface BuildHost {
  /** Bloque elegido en la barra (0 si no queda ninguno). */
  selected(): BlockId | 0;
  /** Se minó un bloque (`fromGround`: salió del suelo, no de un bloque colocado). */
  mined(block: BlockId, fromGround: boolean): void;
  placed(block: BlockId): void;
  denied(reason: 'empty' | 'self' | 'far'): void;
}

/** Qué está apuntando el jugador y cuánto lleva minado (para la interfaz). */
export interface BuildAim {
  target: 'block' | 'ground' | null;
  block: BlockId | 0;
  progress: number;
}

/** Con qué acción responde un toque: en táctil lo elige el jugador; con ratón, clic izq./der. */
export type BuildMode = 'auto' | 'mine' | 'place';

/** Alcance del brazo del astronauta (u). */
const REACH = 5.6;

export interface WorldEventMap {
  ready: null;
  select: EntityInfo | null;
  hover: EntityInfo | null;
  mode: CameraMode;
  zone: ZoneDef | null;
  frame: number;
  quality: QualityTier;
  lighting: LightingId;
  activity: null;
  player: PlayerHud | null;
  interact: InteractEvent;
  build: BuildAim;
  /** Casilla de la barra elegida con el teclado (0–9). */
  slot: number;
}

interface LocalPlayer {
  profile: PlayerProfile;
  controller: PlayerController;
  entity: Entity;
  view: PlayerView;
  prompt: PlayerPrompt | null;
  promptTimer: number;
  hudKey: string;
}

const PLAYER_UID = 'player:local';

export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
  /** Distancia de la cámara al punto. */
  distance: number;
}

interface LightState {
  zenith: Color;
  mid: Color;
  horizon: Color;
  haze: Color;
  streak: Color;
  streakAlpha: number;
  sun: Color;
  sunIntensity: number;
  sunElevation: number;
  skyLight: Color;
  groundLight: Color;
  ambient: number;
  fog: Color;
  fogDensity: number;
  glow: number;
  dust: number;
}

const SUN_AZIMUTH = -52 * DEG;
const _v = new Vector3();
const _v2 = new Vector3();
const _ndc = new Vector2();
const _sphere = new Sphere(new Vector3(), PLANET_RADIUS);
const _tint = new Color();

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function lightStateFrom(p: LightingPreset): LightState {
  return {
    zenith: new Color(p.zenith),
    mid: new Color(p.mid),
    horizon: new Color(p.horizon),
    haze: new Color(p.haze),
    streak: new Color(p.streak),
    streakAlpha: p.streakAlpha,
    sun: new Color(p.sun),
    sunIntensity: p.sunIntensity,
    sunElevation: p.sunElevation,
    skyLight: new Color(p.skyLight),
    groundLight: new Color(p.groundLight),
    ambient: p.ambientIntensity,
    fog: new Color(p.fog),
    fogDensity: p.fogDensity,
    glow: p.glow,
    dust: 0,
  };
}

export class WorldEngine {
  /** ¿Puede este navegador mostrar el mundo 3D? */
  static isSupported(): boolean {
    try {
      const c = document.createElement('canvas');
      return !!c.getContext('webgl2');
    } catch {
      return false;
    }
  }

  readonly events = new Emitter<WorldEventMap>();
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(CAMERA.fov, 1, 0.1, 2200);
  readonly renderer: WebGLRenderer;
  readonly rig: CameraRig;
  readonly kit = new MaterialKit();
  readonly entities: EntityManager;
  readonly zones: ZoneRegistry;
  readonly director: ColonyDirector;
  readonly canvas: HTMLCanvasElement;

  private readonly terrain: PlanetTerrain;
  private readonly terrainUniforms: TerrainUniforms;
  private readonly sky = new Sky();
  private readonly detail: SurfaceDetail;
  private readonly sun = new DirectionalLight(0xffffff, 2);
  private readonly hemi = new HemisphereLight(0xffffff, 0x444444, 1);
  private readonly fog = new Fog(0xffffff, 10, 300);
  private readonly input: InputController;
  private readonly playerInput: PlayerInput;
  private player: LocalPlayer | null = null;
  /** Bloques del modo libre (null si esta vista no los usa). */
  blocks: BlockWorld | null = null;
  buildMode: BuildMode = 'auto';
  private buildHost: BuildHost | null = null;
  private aimXY: { x: number; y: number } | null = null;
  private aimTtl = 0;
  private aim: BlockHit | null = null;
  private aimTimer = 0;
  private mining: { key: number; kind: 'block' | 'ground'; t: number; need: number } | null = null;
  private mineHeld = false;
  private buildKey = '';
  private readonly chars: CharSphere[] = [];
  private readonly raycaster = new Raycaster();
  private readonly marker: Mesh;
  private post: PostFX | null = null;
  private pmrem: PMREMGenerator | null = null;
  private envTarget: WebGLRenderTarget | null = null;
  private envDirty = true;
  private envTimer = 0;

  private tier: QualityTier;
  private scale = 1;
  private width = 1;
  private height = 1;
  private readonly resizeObs: ResizeObserver;
  private readonly viewObs: IntersectionObserver;

  private raf = 0;
  private last = 0;
  private time = 0;
  private paused = false;
  private onScreen = true;
  private disposed = false;
  private frames = 0;
  private frameAcc = 0;
  private slowChecks = 0;
  private readyEmitted = false;

  private lighting: LightingId;
  private readonly light: LightState;
  private readonly lightGoal: LightState;
  private snapshot: WorldSnapshot = DEMO_SNAPSHOT;
  private selectedUid: string | null = null;
  private hoverUid: string | null = null;
  private zoneId: string | null = null;
  private zoneTimer = 0;
  private interactive: boolean;

  constructor(
    private readonly container: HTMLElement,
    options: WorldOptions = {},
  ) {
    this.interactive = options.interactive ?? true;
    this.tier = options.quality && options.quality !== 'auto' ? options.quality : detectQuality();
    this.lighting = options.lighting ?? 'day';
    this.light = lightStateFrom(LIGHTING[this.lighting]);
    this.lightGoal = lightStateFrom(LIGHTING[this.lighting]);

    // ---- renderizador ----
    this.renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.shadowMap.type = PCFShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'world-canvas';
    this.canvas.setAttribute('aria-label', 'Vista 3D de la colonia MARS-01 en Marte');
    this.canvas.setAttribute('role', 'img');
    this.canvas.style.touchAction = 'none';
    container.appendChild(this.canvas);

    // ---- escena ----
    this.scene.fog = this.fog;
    this.scene.add(this.sky.mesh);
    const detail = this.tier === 'high' ? 2 : this.tier === 'medium' ? 1 : 0;
    const { material, uniforms } = createTerrainMaterial(detail);
    this.terrainUniforms = uniforms;
    this.terrain = new PlanetTerrain(material, this.tier === 'low' ? 28 : 56);
    this.scene.add(this.terrain.group);
    this.detail = new SurfaceDetail(Math.round(6500 * QUALITY[this.tier].scatter));
    this.scene.add(this.detail.mesh);

    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.radius = 3.5;
    this.scene.add(this.sun, this.sun.target, this.hemi);

    // ---- entidades ----
    this.entities = new EntityManager(this.kit, createCatalog());
    this.scene.add(this.entities.root);
    this.zones = createZones();
    this.director = new ColonyDirector(this.entities, this.kit, this.scene);
    this.director.build();

    // Marcador de selección: un aro crema que late bajo el objeto elegido.
    this.marker = new Mesh(new TorusGeometry(1, 0.045, 8, 48), new MeshBasicMaterial({ color: '#FFF8EC', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, fog: false }));
    this.marker.name = 'world:selection-marker';
    this.marker.rotation.x = Math.PI / 2;
    this.marker.visible = false;
    this.marker.renderOrder = 5;
    this.scene.add(this.marker);

    // ---- cámara ----
    this.rig = new CameraRig(this.camera, {
      terrainRadius,
      colliders: () => this.entities.colliders(),
      solidAt: (p) => {
        const b = this.blocks?.get(keyAt(p)) ?? 0;
        return b !== 0 && !BLOCKS[b].transparent;
      },
    });
    this.rig.onModeChange = (mode) => {
      const p = this.player;
      if (p && (mode === 'first' || mode === 'third') && p.view !== mode) {
        p.view = mode;
        p.entity.setState({ firstPerson: mode === 'first' });
        if (mode === 'third') this.playerInput.releaseLock();
        this.emitHud(true);
      }
      this.events.emit('mode', mode);
    };
    this.rig.jumpTo(HUB_DIR, options.distance ?? CAMERA.homeDistance, 0);
    if (options.autoRotate) this.rig.startAuto();

    this.input = new InputController({
      rig: this.rig,
      element: this.canvas,
      groundAt: (x, y) => this.groundAt(x, y),
      onTap: (x, y) => this.handleTap(x, y),
      onDoubleTap: (x, y) => this.handleDoubleTap(x, y),
      onHover: (x, y) => this.handleHover(x, y),
      onHome: () => this.goHome(),
      onEscape: () => this.clearSelection(),
      onActivity: () => this.events.emit('activity', null),
    });
    this.input.enabled = this.interactive;
    this.input.keyboard = options.keyboard ?? false;
    this.playerInput = new PlayerInput({
      element: this.canvas,
      look: (yaw, pitch) => this.rig.lookBy(yaw, pitch),
      zoom: (factor) => this.rig.zoomPlayer(factor),
      jump: () => this.playerJump(),
      toggleView: () => this.togglePlayerView(),
      interact: () => this.playerInteract(),
      emote: (anim) => this.playerEmote(anim),
      firstPerson: () => this.player?.view === 'first',
      activity: () => this.events.emit('activity', null),
      building: () => Boolean(this.blocks && this.buildHost && this.player),
      action: (kind, phase, x, y) => this.buildAction(kind, phase, x, y),
      hover: (x, y) => {
        this.aimXY = { x, y };
        this.aimTtl = Infinity;
      },
      slot: (i) => this.events.emit('slot', i),
    });

    this.applyQuality();
    this.applySnapshot();

    // ---- ciclo de vida ----
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.viewObs = new IntersectionObserver((entries) => {
      this.onScreen = entries.some((e) => e.isIntersecting);
      this.schedule();
    });
    this.viewObs.observe(container);
    document.addEventListener('visibilitychange', this.schedule);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    this.resize();
    this.terrain.warm(this.camera.position, QUALITY[this.tier].lodBias, 90);
    this.schedule();
  }

  /* ---------------- API pública ---------------- */

  /** Refleja el estado del juego (salud de sectores, edificios, tripulaciones, clima…). */
  setSnapshot(snapshot: WorldSnapshot): void {
    this.snapshot = snapshot;
    this.applySnapshot();
  }

  getSnapshot(): WorldSnapshot {
    return this.snapshot;
  }

  setLighting(id: LightingId): void {
    if (this.lighting === id) return;
    this.lighting = id;
    this.refreshLightGoal();
    this.events.emit('lighting', id);
  }

  getLighting(): LightingId {
    return this.lighting;
  }

  setInteractive(on: boolean): void {
    this.interactive = on;
    this.input.enabled = on && !this.player;
    this.playerInput.enabled = on && Boolean(this.player);
    this.canvas.style.cursor = this.player ? 'default' : on ? 'grab' : 'default';
    if (!on) this.setHover(null);
  }

  setKeyboard(on: boolean): void {
    this.input.keyboard = on;
    this.playerInput.keyboard = on;
  }

  /* ---------------- jugador en primera / tercera persona ---------------- */

  get playerActive(): boolean {
    return this.player !== null;
  }

  get playerView(): PlayerView | null {
    return this.player?.view ?? null;
  }

  /** Estado actual del HUD (para la interfaz que se monta después de entrar). */
  get hud(): PlayerHud | null {
    const p = this.player;
    return p ? { view: p.view, prompt: p.prompt, grounded: p.controller.grounded, running: p.controller.anim === 'run' } : null;
  }

  /** Controles táctiles de la interfaz (joystick y botón de correr). */
  get controls(): { stick: { x: number; y: number }; setRun(on: boolean): void } {
    const input = this.playerInput;
    return {
      stick: input.stick,
      setRun: (on: boolean) => {
        input.runHeld = on;
      },
    };
  }

  /**
   * El alumno entra al mundo con su astronauta. Si el director ya lo tenía en la colonia
   * (con su tripulación), aparece justo ahí; si no, en la plaza frente al centro de mando.
   */
  enterPlayer(profile: PlayerProfile, view: PlayerView = 'third'): void {
    if (this.player) this.exitPlayer();
    let spawn = this.director.spawnFor(profile.id);
    if (!spawn) {
      const plaza = profile.id ? colonySpot(31.5, 90 + ((hashCode(profile.id) % 30) - 15)) : colonySpot(10.2, 90);
      spawn = { dir: plaza.dir, heading: profile.id ? LANDING_PAD.heading : plaza.heading };
    }
    this.director.setLocalPlayer(profile.id);
    const entity = this.entities.spawn('character.astronaut', PLAYER_UID, { dir: spawn.dir, heading: spawn.heading, lift: 0 }, { avatar: profile.avatar, role: profile.role, seed: 3.3 });
    const controller = new PlayerController(spawn.dir, spawn.heading);
    controller.blocks = this.blocks;
    this.player = { profile, controller, entity, view, prompt: null, promptTimer: 0, hudKey: '' };
    entity.setState({ firstPerson: view === 'first', anim: 'idle', speed: 1 });
    this.select(null);
    this.setHover(null);
    this.input.enabled = false;
    this.playerInput.enabled = this.interactive;
    this.canvas.style.cursor = 'default';
    this.rig.attachPlayer(controller, view, controller.face);
    this.director.playerActive = true;
    this.emitHud(true);
  }

  exitPlayer(): void {
    const p = this.player;
    if (!p) return;
    this.player = null;
    this.playerInput.releaseLock();
    this.playerInput.enabled = false;
    this.entities.remove(PLAYER_UID);
    this.director.playerActive = false;
    this.director.setLocalPlayer(null);
    this.rig.detachPlayer();
    this.input.enabled = this.interactive;
    this.canvas.style.cursor = this.interactive ? 'grab' : 'default';
    this.events.emit('player', null);
  }

  setPlayerView(view: PlayerView): void {
    if (!this.player) return;
    this.rig.setPlayerView(view);
  }

  togglePlayerView(): void {
    if (!this.player) return;
    this.setPlayerView(this.player.view === 'first' ? 'third' : 'first');
  }

  playerJump(): void {
    this.player?.controller.jump();
  }

  playerEmote(anim: AnimName): void {
    this.player?.controller.playEmote(anim);
  }

  /* ---------------- minar y construir (modo libre) ---------------- */

  /** Activa los bloques: el planeta gana depósitos que se minan y se puede construir. */
  enableBuilding(host: BuildHost): BlockWorld {
    if (!this.blocks) {
      this.blocks = new BlockWorld();
      this.scene.add(this.blocks.group);
    }
    this.buildHost = host;
    if (this.player) this.player.controller.blocks = this.blocks;
    return this.blocks;
  }

  /**
   * Brújula del explorador: depósito natural más cercano, a qué distancia está y hacia
   * dónde queda respecto de la cámara (rad; 0 = al frente, positivo = a la derecha).
   */
  nearestDeposit(): { block: BlockId; distance: number; angle: number } | null {
    const p = this.player;
    const b = this.blocks;
    if (!p || !b) return null;
    const block = b.nearestDeposit(p.controller.feet, _v);
    if (!block) return null;
    const to = _v2.copy(_v).sub(p.controller.feet);
    return { block, distance: to.length(), angle: Math.atan2(to.dot(this.rig.right), to.dot(this.rig.forward)) };
  }

  /** Devuelve al jugador a la plaza de la colonia (por si se pierde o queda encerrado). */
  respawnPlayer(): void {
    const p = this.player;
    if (!p) return;
    this.enterPlayer(p.profile, p.view);
  }

  private buildAction(kind: 'primary' | 'secondary', phase: 'down' | 'up' | 'tap', x: number, y: number): void {
    if (!this.blocks || !this.buildHost || !this.player) return;
    if (phase === 'up') {
      if (kind === 'primary') this.mineHeld = false;
      return;
    }
    let k = kind;
    if (phase === 'tap') {
      this.aimXY = { x, y };
      if (this.aimTtl !== Infinity) this.aimTtl = 1.6;
      if (this.buildMode !== 'auto') k = this.buildMode === 'place' ? 'secondary' : 'primary';
    }
    this.refreshAim();
    if (k === 'secondary') this.placeBlock();
    else {
      this.mineHeld = phase === 'down';
      this.startMining();
    }
  }

  /** Coloca el bloque elegido donde apunta el jugador (botón de la interfaz táctil). */
  buildPlace(): void {
    if (!this.blocks || !this.player) return;
    this.refreshAim();
    this.placeBlock();
  }

  /** Empieza a minar lo que apunta el jugador (botón de la interfaz táctil). */
  buildMine(): void {
    if (!this.blocks || !this.player) return;
    this.refreshAim();
    this.startMining();
  }

  private refreshAim(): void {
    const p = this.player;
    const b = this.blocks;
    if (!p || !b) return;
    const first = p.view === 'first';
    if (!first && !this.aimXY) {
      this.aim = null;
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const x = first || !this.aimXY ? rect.left + rect.width / 2 : this.aimXY.x;
    const y = first || !this.aimXY ? rect.top + rect.height / 2 : this.aimXY.y;
    this.setRay(x, y);
    const ray = this.raycaster.ray;
    // Solo cuenta el tramo del rayo que queda al alcance del brazo.
    const chest = _v.copy(p.controller.feet).addScaledVector(p.controller.dir, 1.2);
    const oc = _v2.copy(ray.origin).sub(chest);
    const bq = oc.dot(ray.direction);
    const disc = bq * bq - (oc.lengthSq() - REACH * REACH);
    if (disc <= 0) {
      this.aim = null;
      return;
    }
    const sq = Math.sqrt(disc);
    this.aim = b.raycast(ray.origin, ray.direction, Math.max(0.25, -bq - sq), -bq + sq);
  }

  private startMining(): void {
    const p = this.player;
    const aim = this.aim;
    if (!p || !this.buildHost) return;
    if (!aim) {
      this.buildHost.denied('far');
      return;
    }
    if (this.mining && this.mining.key === aim.key && this.mining.kind === aim.kind) return;
    const need = aim.kind === 'block' ? BLOCKS[aim.block].hardness : 0.5;
    this.mining = { key: aim.key, kind: aim.kind, t: 0, need };
    p.controller.faceTowards(aim.point);
    p.controller.playEmote('work', need + 0.4);
  }

  private placeBlock(): void {
    const p = this.player;
    const b = this.blocks;
    const host = this.buildHost;
    const aim = this.aim;
    if (!p || !b || !host) return;
    if (!aim || aim.placeKey === null) {
      host.denied('far');
      return;
    }
    const id = host.selected();
    if (!id) {
      host.denied('empty');
      return;
    }
    // No se puede construir dentro del propio astronauta.
    const c = b.center(aim.placeKey, _v);
    const ctl = p.controller;
    const feetR = ctl.feet.length();
    const cr = c.length();
    const horiz = _v2.copy(c).addScaledVector(ctl.dir, -c.dot(ctl.dir)).length();
    if (horiz < 0.5 + PLAYER.radius * 0.85 && cr + 0.5 > feetR + 0.05 && cr - 0.5 < feetR + PLAYER.height) {
      host.denied('self');
      return;
    }
    b.set(aim.placeKey, id);
    b.burst(c, id, 5);
    ctl.faceTowards(c);
    ctl.playEmote('point', 0.7);
    host.placed(id);
    this.aimTimer = 0;
  }

  private updateBuild(dt: number): void {
    const b = this.blocks;
    const host = this.buildHost;
    if (!b || !host) return;
    if (this.aimTtl !== Infinity && !this.mining) {
      this.aimTtl -= dt;
      if (this.aimTtl <= 0) this.aimXY = null;
    }
    this.aimTimer -= dt;
    if (this.aimTimer <= 0) {
      this.aimTimer = 0.07;
      this.refreshAim();
    }
    const aim = this.aim;
    let m = this.mining;
    if (m && (!aim || aim.key !== m.key || aim.kind !== m.kind)) m = this.mining = null;
    if (m && aim) {
      m.t += dt;
      if (m.t >= m.need) {
        if (aim.kind === 'block') {
          b.set(aim.key, 0);
          b.burst(b.center(aim.key, _v), aim.block, 12);
        } else {
          b.burst(aim.point, aim.block, 8);
        }
        host.mined(aim.block, aim.kind === 'ground');
        m = this.mining = null;
        this.aimTimer = 0;
        this.aim = null;
      }
    } else if (!m && this.mineHeld && aim) {
      this.startMining();
      m = this.mining;
    }
    const progress = m ? Math.min(1, m.t / m.need) : 0;
    if (!aim) b.highlight(null);
    else if (aim.kind === 'block') b.highlight(aim.key, progress);
    else b.highlight(aim.placeKey, progress, !m);
    const key = `${aim?.kind ?? ''}|${aim?.block ?? 0}|${Math.round(progress * 12)}`;
    if (key !== this.buildKey) {
      this.buildKey = key;
      this.events.emit('build', { target: aim?.kind ?? null, block: aim?.block ?? 0, progress });
    }
  }

  /** Interactúa con lo que el jugador tiene enfrente (consola, IX, un compañero…). */
  playerInteract(): void {
    const p = this.player;
    const pr = p?.prompt;
    if (!p || !pr) return;
    const e = this.entities.get(pr.uid);
    if (!e) return;
    p.controller.faceTowards(e.root.position);
    if (e.def.id === 'character.astronaut') {
      p.controller.playEmote('wave', 2.2);
      this.director.greet(e.uid);
    } else if (pr.kind === 'talk') {
      p.controller.playEmote('talk', 2.6);
    } else if (pr.kind === 'scan' || pr.kind === 'inspect') {
      p.controller.playEmote('scan', 2.6);
    } else {
      p.controller.playEmote('point', 1.8);
    }
    this.events.emit('interact', {
      uid: e.uid,
      defId: e.def.id,
      kind: pr.kind,
      interactionId: pr.interactionId,
      name: e.def.name,
      description: e.def.description,
      state: { ...e.state },
      params: { ...e.params },
    });
  }

  /** Pose compacta del jugador para mandarla por la red. */
  playerPose(): PresencePose | null {
    const c = this.player?.controller;
    if (!c) return null;
    const r4 = (x: number) => Math.round(x * 10000) / 10000;
    // El último valor lleva la rapidez del paso (unidades) y la altura sobre el terreno (decenas, en dm).
    const lift = Math.max(0, Math.round((c.feet.length() - terrainRadius(c.dir)) * 10));
    return [r4(c.dir.x), r4(c.dir.y), r4(c.dir.z), Math.round(c.heading * 100) / 100, Math.max(0, ANIMS.indexOf(c.anim)), Math.min(9.9, Math.round(c.stride * 10) / 10) + lift * 10];
  }

  /** Poses de los compañeros que juegan en 3D. */
  setPresence(map: PresenceMap): void {
    const own = this.player?.profile.id;
    if (own && map[own]) {
      const copy = { ...map };
      delete copy[own];
      this.director.setPresence(copy);
    } else {
      this.director.setPresence(map);
    }
  }

  private updatePlayer(dt: number): void {
    const p = this.player!;
    const c = p.controller;
    const move = this.playerInput.read(dt);
    const first = p.view === 'first';
    this.director.characterSpheres(this.chars);
    c.update(dt, move, this.rig.forward, this.rig.right, first, this.entities.colliders(), this.chars);
    // En tercera persona, al caminar hacia delante la cámara se acomoda sola detrás.
    if (!first && move.y > 0.3 && this.playerInput.sinceLook > 1.2 && c.speed > 0.5) {
      const want = this.rig.headingFor(c.face);
      this.rig.goalHeading += angleDelta(this.rig.goalHeading, want) * (1 - Math.exp(-1.3 * dt));
    }
    // Altura real sobre el terreno: cuenta el salto y los bloques sobre los que está parado.
    this.entities.move(PLAYER_UID, { dir: c.dir, heading: c.heading, lift: Math.max(0, c.feet.length() - terrainRadius(c.dir)) });
    if (p.entity.state.anim !== c.anim || Math.abs(Number(p.entity.state.speed) - c.stride) > 0.05) p.entity.setState({ anim: c.anim, speed: Math.round(c.stride * 100) / 100 });
    this.director.playerPos.copy(c.feet);
    this.updateBuild(dt);

    p.promptTimer -= dt;
    if (p.promptTimer <= 0) {
      p.promptTimer = 0.15;
      p.prompt = this.findPrompt(c);
    }
    this.emitHud(false);
  }

  private findPrompt(c: PlayerController): PlayerPrompt | null {
    const chest = _v.copy(c.feet).addScaledVector(c.dir, 1.0);
    let best: PlayerPrompt | null = null;
    let bestScore = Infinity;
    for (const hit of this.entities.interactionsNear(chest)) {
      if (hit.entity.uid === PLAYER_UID) continue;
      // Preferir lo que está enfrente del jugador.
      const to = _v2.copy(hit.entity.root.position).sub(c.feet);
      to.addScaledVector(c.dir, -to.dot(c.dir));
      const ahead = to.lengthSq() > 1e-6 ? to.normalize().dot(c.face) : 1;
      const score = hit.distance - ahead * 0.8;
      if (score < bestScore) {
        bestScore = score;
        best = { uid: hit.entity.uid, interactionId: hit.interaction.id, label: hit.interaction.label, kind: hit.interaction.kind };
      }
    }
    return best;
  }

  private emitHud(force: boolean): void {
    const p = this.player;
    if (!p) return;
    const hud: PlayerHud = { view: p.view, prompt: p.prompt, grounded: p.controller.grounded, running: p.controller.anim === 'run' };
    const key = `${hud.view}|${hud.prompt?.uid}:${hud.prompt?.interactionId}|${hud.grounded}|${hud.running}`;
    if (!force && key === p.hudKey) return;
    p.hudKey = key;
    this.events.emit('player', hud);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.schedule();
  }

  get quality(): QualityTier {
    return this.tier;
  }

  setQuality(tier: QualityTier): void {
    if (this.tier === tier) return;
    this.tier = tier;
    this.scale = 1;
    this.applyQuality();
    this.resize();
    this.events.emit('quality', tier);
  }

  /** Selecciona una entidad (sin mover la cámara). */
  select(uid: string | null): void {
    const e = uid ? this.entities.get(uid) : null;
    this.selectedUid = e ? e.uid : null;
    this.events.emit('select', e ? e.info : null);
  }

  get selected(): string | null {
    return this.selectedUid;
  }

  /** Lleva la cámara a una entidad y la deja orbitándola (o siguiéndola si se mueve). */
  focusEntity(uid: string, follow = false): boolean {
    const e = this.entities.get(uid);
    if (!e || !e.visible || this.player) return false;
    this.select(uid);
    this.rig.focusOn(e.cameraTarget(e.heading + Math.PI + 0.42), follow || e.def.kind === 'vehicle' || e.def.kind === 'phenomenon');
    return true;
  }

  /** Viaja a un lugar del registro de zonas. */
  focusZone(zoneId: string): boolean {
    const z = this.zones.get(zoneId);
    if (!z || this.player) return false;
    const e = z.entityUid ? this.entities.get(z.entityUid) : null;
    if (e && e.visible && z.kind !== 'colony') return this.focusEntity(e.uid);
    this.select(null);
    this.rig.flyTo({ dir: z.dir, distance: z.view.distance, tilt: z.view.tilt ?? 0 });
    return true;
  }

  goHome(): void {
    if (this.player) return;
    this.select(null);
    this.rig.flyTo({ dir: HUB_DIR, distance: CAMERA.homeDistance, heading: 0, tilt: 0 });
  }

  /** Suelta la selección y vuelve a la exploración libre. */
  clearSelection(): void {
    this.select(null);
    this.rig.release();
  }

  /** Reproduce una secuencia de planos de cámara (para futuras misiones). */
  playShots(shots: CameraShot[], onDone?: () => void): void {
    this.rig.playShots(shots, onDone);
  }

  /** Posición en pantalla (pixeles CSS del contenedor) de un anclaje de una entidad. */
  screenPosition(uid: string, anchor: string, out: ScreenPoint): ScreenPoint {
    const e = this.entities.get(uid);
    if (!e || !e.visible) {
      out.visible = false;
      return out;
    }
    return this.project(e.anchorWorld(anchor, _v), out);
  }

  project(world: Vector3, out: ScreenPoint): ScreenPoint {
    const cam = this.camera.position;
    out.distance = world.distanceTo(cam);
    // Oculto si el planeta se interpone entre la cámara y el punto.
    _v2.copy(world).sub(cam).divideScalar(out.distance || 1);
    const b = cam.dot(_v2);
    const occ = PLANET_RADIUS - 2.5;
    const disc = b * b - (cam.lengthSq() - occ * occ);
    const hidden = disc > 0 && -b - Math.sqrt(disc) > 0 && -b - Math.sqrt(disc) < out.distance - 1;
    const p = _v2.copy(world).project(this.camera);
    out.x = (p.x * 0.5 + 0.5) * this.width;
    out.y = (-p.y * 0.5 + 0.5) * this.height;
    out.visible = !hidden && p.z > -1 && p.z < 1 && p.x > -1.15 && p.x < 1.15 && p.y > -1.15 && p.y < 1.15;
    return out;
  }

  /** Información para depurar y para el panel de rendimiento. */
  get stats() {
    const info = this.renderer.info;
    return { tier: this.tier, scale: this.scale, calls: info.render.calls, triangles: info.render.triangles, terrain: this.terrain.stats, entities: this.entities.all().length };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.viewObs.disconnect();
    document.removeEventListener('visibilitychange', this.schedule);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.input.dispose();
    this.playerInput.dispose();
    this.events.clear();
    this.director.dispose();
    this.blocks?.dispose();
    this.entities.dispose();
    this.terrain.dispose();
    this.detail.dispose();
    this.sky.dispose();
    this.kit.dispose();
    this.post?.dispose();
    this.envTarget?.dispose();
    this.pmrem?.dispose();
    this.marker.geometry.dispose();
    (this.marker.material as MeshBasicMaterial).dispose();
    this.sun.shadow.map?.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }

  /* ---------------- estado del juego → mundo ---------------- */

  private applySnapshot(): void {
    this.director.apply(this.snapshot);
    this.entities.markCollidersDirty();
    this.refreshLightGoal();
    if (this.selectedUid && !this.entities.get(this.selectedUid)?.visible) this.clearSelection();
  }

  private refreshLightGoal(): void {
    const g = this.lightGoal;
    const p = LIGHTING[this.lighting];
    Object.assign(g, lightStateFrom(p));
    const weather = this.snapshot.dark ? WEATHER.dark : this.snapshot.storm ? WEATHER.storm : null;
    if (!weather) return;
    const k = this.snapshot.dark ? 0.62 : 0.5;
    _tint.set(weather.tint);
    g.zenith.lerp(_tint, k);
    g.mid.lerp(_tint, k);
    g.horizon.lerp(_tint, k * 0.8);
    g.haze.lerp(_tint, k);
    g.fog.lerp(_tint, k);
    g.sunIntensity *= weather.sun;
    g.ambient *= weather.ambient;
    g.fogDensity *= weather.fog;
    g.glow = Math.max(g.glow, this.snapshot.dark ? 2.4 : 1.1);
    g.dust = this.snapshot.dark ? 0 : 1;
    g.streakAlpha *= 0.4;
  }

  /* ---------------- calidad ---------------- */

  private applyQuality(): void {
    const q = QUALITY[this.tier];
    this.renderer.shadowMap.enabled = q.shadowMap > 0;
    if (q.shadowMap > 0 && this.sun.shadow.mapSize.x !== q.shadowMap) {
      this.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.sun.castShadow = q.shadowMap > 0;
    if (q.postFx && !this.post) {
      this.post = new PostFX(this.renderer, q.msaa);
    } else if (!q.postFx && this.post) {
      this.post.dispose();
      this.post = null;
    }
  }

  private resize(): void {
    if (this.disposed) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.width = w;
    this.height = h;
    const q = QUALITY[this.tier];
    const ratio = Math.min(window.devicePixelRatio || 1, q.maxPixelRatio) * this.scale;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.post?.setSize(w * ratio, h * ratio);
    this.rig.setViewport(w, h);
  }

  /** Ajuste dinámico: si el equipo no llega a 45 fps baja la resolución y, si no basta, la calidad. */
  private monitor(frameMs: number): void {
    this.frames++;
    this.frameAcc += frameMs;
    if (this.frames < 50) return;
    const avg = this.frameAcc / this.frames;
    this.frames = 0;
    this.frameAcc = 0;
    const q = QUALITY[this.tier];
    if (avg > 23) {
      if (this.scale > q.minScale + 0.01) {
        this.scale = Math.max(q.minScale, this.scale * 0.87);
        this.resize();
        this.slowChecks = 0;
      } else if (++this.slowChecks >= 2 && this.tier !== 'low') {
        this.slowChecks = 0;
        this.setQuality(this.tier === 'high' ? 'medium' : 'low');
      }
    } else if (avg < 13 && this.scale < 1) {
      this.scale = Math.min(1, this.scale * 1.07);
      this.resize();
      this.slowChecks = 0;
    } else {
      this.slowChecks = 0;
    }
  }

  /* ---------------- ciclo de animación ---------------- */

  private schedule = (): void => {
    if (this.disposed) return;
    const run = !this.paused && this.onScreen && !document.hidden;
    if (run && !this.raf) {
      this.last = 0;
      this.raf = requestAnimationFrame(this.loop);
    } else if (!run && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  };

  private loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    const elapsed = this.last ? now - this.last : 16.7;
    this.last = now;
    const dt = Math.min(0.05, elapsed / 1000);
    this.time += dt;

    if (this.player) this.updatePlayer(dt);
    this.rig.update(dt);
    this.updateLighting(dt);
    const q = QUALITY[this.tier];
    this.terrain.update(this.camera.position, q.lodBias, q.buildBudgetMs);

    const ctx = { dt, time: this.time, night: clamp((this.light.glow - 0.55) / 1.6, 0, 1), eye: this.camera.position };
    this.director.update(ctx);
    this.entities.update(ctx);
    if (this.blocks) {
      this.blocks.setGlow(0.75 + ctx.night * 1.1);
      this.blocks.update(dt);
    }
    this.updateMarker();
    this.updateZone(dt);

    this.terrainUniforms.uTime.value = this.time;
    this.sky.uniforms.uTime.value = this.time;
    this.sky.mesh.position.copy(this.camera.position);

    if (this.post) {
      // De cerca el desenfoque es más marcado (maqueta); desde la órbita casi desaparece.
      // Jugando en primera o tercera persona la vista es "real": sin efecto maqueta.
      const zoom = this.rig.zoomLevel();
      this.post.strength = this.player ? 0.04 : clamp(1.05 - zoom * 0.75, 0.25, 1);
      this.post.focus = 0.5;
      this.post.render(this.renderer, this.scene, this.camera);
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    this.events.emit('frame', this.time);
    if (!this.readyEmitted) {
      this.readyEmitted = true;
      this.events.emit('ready', null);
    }
    this.monitor(elapsed);
  };

  private updateLighting(dt: number): void {
    const s = this.light;
    const g = this.lightGoal;
    const k = 1 - Math.exp(-1.7 * dt);
    s.zenith.lerp(g.zenith, k);
    s.mid.lerp(g.mid, k);
    s.horizon.lerp(g.horizon, k);
    s.haze.lerp(g.haze, k);
    s.streak.lerp(g.streak, k);
    s.sun.lerp(g.sun, k);
    s.skyLight.lerp(g.skyLight, k);
    s.groundLight.lerp(g.groundLight, k);
    s.fog.lerp(g.fog, k);
    const before = s.sunElevation;
    s.streakAlpha = damp(s.streakAlpha, g.streakAlpha, 1.7, dt);
    s.sunIntensity = damp(s.sunIntensity, g.sunIntensity, 1.7, dt);
    s.sunElevation = damp(s.sunElevation, g.sunElevation, 1.7, dt);
    s.ambient = damp(s.ambient, g.ambient, 1.7, dt);
    s.fogDensity = damp(s.fogDensity, g.fogDensity, 1.7, dt);
    s.glow = damp(s.glow, g.glow, 1.7, dt);
    s.dust = damp(s.dust, g.dust, 1.7, dt);
    if (Math.abs(s.sunElevation - before) > 0.01) {
      this.envDirty = true;
      this.envTimer = 0.6;
    }

    // Cielo.
    const u = this.sky.uniforms;
    u.uZenith.value.copy(s.zenith);
    u.uMid.value.copy(s.mid);
    u.uHorizon.value.copy(s.horizon);
    u.uHaze.value.copy(s.haze);
    u.uStreak.value.copy(s.streak);
    u.uStreakAlpha.value = s.streakAlpha;
    u.uUp.value.copy(this.rig.focus);
    u.uDust.value = s.dust;

    // Sol: fijo respecto del marco local de la cámara, así toda la zona que se explora
    // está iluminada (como en la referencia) y las sombras no giran al orbitar.
    const el = s.sunElevation * DEG;
    const sunDir = this.rig.frameDirection(SUN_AZIMUTH, _v).multiplyScalar(Math.cos(el)).addScaledVector(this.rig.focus, Math.sin(el)).normalize();
    u.uSunDir.value.copy(sunDir);
    u.uSunColor.value.copy(s.sun);
    this.sun.color.copy(s.sun);
    this.sun.intensity = s.sunIntensity;
    this.sun.target.position.copy(this.rig.target);
    this.sun.position.copy(this.rig.target).addScaledVector(sunDir, 170);
    this.sun.target.updateMatrixWorld();
    const span = clamp(this.rig.dist * 0.95, 20, 78);
    const cam = this.sun.shadow.camera;
    if (Math.abs(cam.right - span) > 0.5) {
      cam.left = -span;
      cam.right = span;
      cam.top = span;
      cam.bottom = -span;
      cam.near = 20;
      cam.far = 330;
      cam.updateProjectionMatrix();
    }

    this.hemi.color.copy(s.skyLight);
    this.hemi.groundColor.copy(s.groundLight);
    this.hemi.intensity = s.ambient;
    // La luz ambiente "mira" con la vertical local.
    this.hemi.position.copy(this.rig.focus);

    // Bruma: cercana a ras de suelo, casi nula desde la órbita.
    const alt = Math.max(0.5, this.camera.position.length() - PLANET_RADIUS);
    const far = (70 + alt * 3.4 + alt * alt * 0.02) / s.fogDensity;
    this.fog.color.copy(s.fog);
    this.fog.near = Math.min(far * 0.6, (6 + alt * 0.6) / Math.max(1, s.fogDensity * 0.6));
    this.fog.far = far;
    if (this.player) {
      // A ras de suelo la bruma empieza más lejos para que la colonia se vea nítida.
      this.fog.near = Math.max(this.fog.near, 13 / Math.max(1, s.fogDensity));
      this.fog.far = Math.max(this.fog.far, 105 / s.fogDensity);
    }

    this.terrainUniforms.uHaze.value.copy(s.haze);
    this.terrainUniforms.uHazeAmount.value = clamp(0.16 + alt / 260, 0.16, 0.62);
    this.terrainUniforms.uDust.value = s.dust;
    this.kit.glow.value = s.glow;

    if (this.envDirty) {
      this.envTimer -= dt;
      if (this.envTimer <= 0) this.rebuildEnvironment();
    }
  }

  /** Mapa de entorno para los reflejos del vidrio, generado a partir del propio cielo. */
  private rebuildEnvironment(): void {
    this.envDirty = false;
    try {
      this.pmrem ??= new PMREMGenerator(this.renderer);
      const scene = new Scene();
      const sky = this.sky.mesh.clone();
      sky.position.set(0, 0, 0);
      scene.add(sky);
      const up = this.sky.uniforms.uUp.value.clone();
      // El entorno se orienta con la vertical de la colonia, que es donde está el vidrio.
      this.sky.uniforms.uUp.value.copy(HUB_DIR);
      const target = this.pmrem.fromScene(scene, 0, 1, 1200);
      this.sky.uniforms.uUp.value.copy(up);
      this.envTarget?.dispose();
      this.envTarget = target;
      this.kit.setEnvironment(target.texture);
    } catch {
      this.kit.setEnvironment(null);
    }
  }

  private updateMarker(): void {
    const uid = this.player ? (this.player.prompt?.uid ?? null) : this.selectedUid;
    const e = uid ? this.entities.get(uid) : null;
    if (!e || !e.visible) {
      this.marker.visible = false;
      return;
    }
    const r = (e.def.collider ? e.def.collider.radius * 1.25 : 1) * e.root.scale.x;
    this.marker.visible = true;
    this.marker.position.copy(e.root.position).addScaledVector(e.dir, 0.12);
    this.marker.quaternion.copy(e.root.quaternion);
    this.marker.rotateX(Math.PI / 2);
    const pulse = 1 + Math.sin(this.time * 3.2) * 0.04;
    this.marker.scale.setScalar(r * pulse);
    (this.marker.material as MeshBasicMaterial).opacity = 0.55 + 0.3 * Math.sin(this.time * 3.2);
  }

  private updateZone(dt: number): void {
    this.zoneTimer -= dt;
    if (this.zoneTimer > 0) return;
    this.zoneTimer = 0.25;
    const z = this.zones.at(this.rig.focus)[0] ?? null;
    const id = z?.id ?? null;
    if (id !== this.zoneId) {
      this.zoneId = id;
      this.events.emit('zone', z);
    }
  }

  /* ---------------- puntero ---------------- */

  private setRay(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    _ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(_ndc, this.camera);
  }

  /** Dirección del planeta bajo un punto de la pantalla (null si es cielo). */
  groundAt(clientX: number, clientY: number): Vector3 | null {
    this.setRay(clientX, clientY);
    const ray = this.raycaster.ray;
    _sphere.radius = PLANET_RADIUS + 0.3;
    if (!ray.intersectSphere(_sphere, _v)) return null;
    for (let i = 0; i < 2; i++) {
      _sphere.radius = terrainRadius(_v2.copy(_v).normalize());
      if (!ray.intersectSphere(_sphere, _v)) break;
    }
    return _v.clone().normalize();
  }

  private pickAt(clientX: number, clientY: number): Entity | null {
    this.setRay(clientX, clientY);
    const ray = this.raycaster.ray;
    // No se puede seleccionar a través del planeta.
    _sphere.radius = PLANET_RADIUS - 1;
    const ground = ray.intersectSphere(_sphere, _v);
    return this.entities.pick(ray, ground ? ground.distanceTo(ray.origin) : Infinity);
  }

  private handleTap(x: number, y: number): void {
    const e = this.pickAt(x, y);
    if (e) {
      this.focusEntity(e.uid);
    } else if (this.selectedUid) {
      this.clearSelection();
    }
  }

  private handleDoubleTap(x: number, y: number): void {
    const e = this.pickAt(x, y);
    if (e) {
      this.focusEntity(e.uid);
      return;
    }
    const dir = this.groundAt(x, y);
    if (!dir) return;
    this.select(null);
    this.rig.flyTo({ dir, distance: Math.max(this.rig.distanceLimits.min * 2, this.rig.dist * 0.5), duration: 0.9 });
  }

  private handleHover(x: number, y: number): void {
    const e = this.pickAt(x, y);
    this.setHover(e ? e.uid : null);
  }

  private setHover(uid: string | null): void {
    if (uid === this.hoverUid) return;
    this.hoverUid = uid;
    this.canvas.style.cursor = uid ? 'pointer' : this.interactive ? 'grab' : 'default';
    const e = uid ? this.entities.get(uid) : null;
    this.events.emit('hover', e ? e.info : null);
  }

  private onContextLost = (e: Event): void => {
    e.preventDefault();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  };

  private onContextRestored = (): void => {
    this.envDirty = true;
    this.envTimer = 0;
    this.schedule();
  };
}
