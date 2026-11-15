// Director de la colonia: coloca el centro de mando, los sectores, los tubos, los edificios,
// los hallazgos, IX y el rover; refleja el estado del juego (salud, edificios, clima) y da
// vida a las tripulaciones: cada astronauta camina a su lugar según la fase de la misión y
// hace lo que su equipo está haciendo (escuchar, discutir, reparar, festejar…). Los alumnos
// que juegan en 3D desde su celular aparecen moviéndose en tiempo real (presencia).

import {
  Color,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { MYSTERY_POOL, ROLES, SECTORS, SECTOR_ORDER, SYSTEMS } from '../../../shared/content';
import type { BuildingId, Phase, SectorId } from '../../../shared/types';
import { PLANET_RADIUS } from '../core/config';
import { angleBetween, angleDelta, damp, headingTo, offsetOnSphere, seeded, slerpDir } from '../core/math';
import type { Entity, EntityManager } from '../entities/EntityManager';
import type { UpdateContext } from '../entities/types';
import { ANIMS, type AnimName } from '../models/astronaut';
import { Sculpt, type MaterialKit, type Vec3 } from '../models/sculpt';
import { DARK, STEEL, WHITE } from '../models/util';
import { HUB_DIR, ICE_PATCHES, LAVA_TUBE, MESAS, PADS } from '../planet/features';
import { surfacePoint } from '../planet/heightfield';
import {
  BUILDING_SPOTS,
  LANDING_PAD,
  ROVER_ROUTE,
  SECTOR_ANGLE,
  SECTOR_SPOTS,
  boardingSpots,
  colonyDir,
  colonyPoint,
  colonySpot,
  crewSpots,
  type Spot,
} from '../planet/layout';
import type { CrewMood, PresenceMap, WorldCrewMember, WorldSnapshot } from './snapshot';

const R = PLANET_RADIUS;
const TUBE_H = 2.3;
const TUBE_R = 0.34;
const WALK = 1.55;
const RUN = 3.4;
const UP = new Vector3(0, 1, 0);
const FWD = new Vector3(0, 0, 1);
const _q = new Quaternion();
const _e = new Euler();
const _v = new Vector3();
const _v2 = new Vector3();
const _m = new Matrix4();

/** Ángulos (XYZ) que giran +Y hacia `up` (para apoyar piezas sobre la esfera). */
function uprightRot(up: Vector3): Vec3 {
  _q.setFromUnitVectors(UP, up);
  _e.setFromQuaternion(_q, 'XYZ');
  return [_e.x, _e.y, _e.z];
}

/** Ángulos (XYZ) que giran +Z hacia `dir` (anillos alrededor de un tubo). */
function facingRot(dir: Vector3): Vec3 {
  _q.setFromUnitVectors(FWD, dir);
  _e.setFromQuaternion(_q, 'XYZ');
  return [_e.x, _e.y, _e.z];
}

const BUILDING_IDS: Exclude<BuildingId, 'city'>[] = ['hydroponics', 'recycler', 'reactor', 'antenna', 'module'];
const CITY_ANGLES = [-135, -45, 0, 180];

/** Lo que hace la tripulación en cada fase de la misión. */
function activityPool(phase: Phase, mood: CrewMood | undefined): AnimName[] {
  switch (phase) {
    case 'lobby':
      return ['idle', 'idle', 'wave', 'idle', 'point'];
    case 'crews':
      return ['wave', 'cheer', 'idle', 'wave'];
    case 'scan':
      return ['scan', 'idle', 'point', 'scan'];
    case 'briefing':
      return ['idle', 'idle', 'talk', 'idle'];
    case 'discovery':
      return ['scan', 'talk', 'scan', 'idle'];
    case 'challenge':
      return ['talk', 'talk', 'point', 'idle', 'scan', 'talk'];
    case 'event':
      return ['work', 'work', 'work', 'scan'];
    case 'results':
      return mood === 'cheer' ? ['cheer', 'cheer', 'wave'] : mood === 'sad' ? ['sad', 'sad', 'idle'] : ['idle', 'wave'];
    case 'debrief':
      return ['wave', 'cheer', 'idle', 'talk'];
    default:
      return ['idle'];
  }
}

interface Remote {
  dir: Vector3;
  heading: number;
  anim: AnimName;
  speed: number;
}

interface Npc {
  uid: string;
  member: WorldCrewMember;
  key: string;
  entity: Entity;
  dir: Vector3;
  heading: number;
  goal: Vector3;
  goalHeading: number;
  pool: AnimName[];
  activity: AnimName;
  actTimer: number;
  anim: AnimName;
  rnd: () => number;
  wander: boolean;
  wanderTimer: number;
  home: Vector3;
  react: number;
  remote: Remote | null;
}

interface Packet {
  tube: number;
  t: number;
}

interface TubeInfo {
  sector: SectorId;
  points: Vector3[];
  length: number;
  inward: boolean;
  color: Color;
}

export class ColonyDirector {
  /** Tubos, faroles y balizas (geometría fija en coordenadas del mundo). */
  private readonly statics = new Group();
  private readonly tubes: TubeInfo[] = [];
  private packets: InstancedMesh | null = null;
  private readonly packetData: Packet[] = [];
  private readonly npcs = new Map<string, Npc>();
  private snapshot: WorldSnapshot | null = null;
  private localId: string | null = null;
  private presence: PresenceMap = {};
  private readonly health: Record<SectorId, number> = Object.fromEntries(SECTOR_ORDER.map((s) => [s, 1])) as Record<SectorId, number>;
  /** Posición del jugador local (el rover se detiene si lo tiene enfrente). */
  readonly playerPos = new Vector3();
  playerActive = false;

  // IX
  private readonly ixDir = new Vector3();
  private ixHeading = 0;
  private ixAngle = 0;
  // Rover
  private roverT = 0;
  private roverSpeed = 0;
  private roverHeading = 0;
  private readonly roverSeg: number[] = [];

  constructor(
    protected readonly entities: EntityManager,
    protected readonly kit: MaterialKit,
    protected readonly scene: Object3D,
  ) {
    this.statics.name = 'colony:statics';
  }

  /* ---------------- construcción ---------------- */

  build(): void {
    const E = this.entities;
    E.spawn('structure.hub', 'structure:hub', { dir: HUB_DIR, heading: 0 });
    for (const s of SECTOR_ORDER) {
      const spot = SECTOR_SPOTS[s];
      E.spawn(`sector.${s}`, `sector:${s}`, { dir: spot.dir, heading: spot.heading });
    }
    E.spawn('prop.landingpad', 'prop:landingpad', { dir: LANDING_PAD.dir, heading: LANDING_PAD.heading });
    const lander = colonySpot(39.6, 103);
    E.spawn('prop.lander', 'prop:lander', { dir: lander.dir, heading: lander.heading + 0.5 });
    for (const b of BUILDING_IDS) {
      const spot = BUILDING_SPOTS[b];
      E.spawn(`building.${b}`, `building:${b}`, { dir: spot.dir, heading: spot.heading });
      E.setVisible(`building:${b}`, false);
    }
    CITY_ANGLES.forEach((a, i) => {
      const spot = colonySpot(10.8, a);
      E.spawn('building.cityTower', `building:city:${i}`, { dir: spot.dir, heading: spot.heading }, { variant: i });
      E.setVisible(`building:city:${i}`, false);
    });
    const pad = (id: string) => PADS.find((p) => p.id === id)!.dir;
    E.spawn('landmark.icecave', 'landmark:icecave', { dir: pad('icecave'), heading: 2.4 });
    E.spawn('landmark.blueberries', 'landmark:blueberries', { dir: pad('blueberries'), heading: 0.6 });
    E.spawn('landmark.meteorite', 'landmark:meteorite', { dir: pad('meteorite'), heading: -0.8 });

    const ixStart = colonyPoint(9.5, 0);
    this.ixDir.copy(colonyDir(ixStart.east, ixStart.north));
    E.spawn('character.ix', 'character:ix', { dir: this.ixDir, heading: 0 });

    for (let i = 0; i < ROVER_ROUTE.length; i++) this.roverSeg.push(angleBetween(ROVER_ROUTE[i], ROVER_ROUTE[(i + 1) % ROVER_ROUTE.length]) * R);
    E.spawn('vehicle.rover', 'vehicle:rover', { dir: ROVER_ROUTE[0], heading: headingTo(ROVER_ROUTE[0], ROVER_ROUTE[1]) });

    this.buildStatics();
    this.scene.add(this.statics);
  }

  /** Tubos elevados del hub a cada sector, con pilares, balizas de camino y faroles. */
  private buildStatics(): void {
    const opaque = new Sculpt(1);
    const glass = new Sculpt(1);
    const t = new Vector3();
    const side = new Vector3();
    for (const s of SECTOR_ORDER) {
      const angle = SECTOR_ANGLE[s];
      const sys = SYSTEMS[SECTORS[s].system];
      const steps = 10;
      const pts: Vector3[] = [];
      const ground: Vector3[] = [];
      for (let i = 0; i <= steps; i++) {
        const r = 4.4 + ((17.9 - 4.4) * i) / steps;
        const { east, north } = colonyPoint(r, angle);
        const dir = colonyDir(east, north);
        ground.push(dir);
        pts.push(surfacePoint(dir, TUBE_H));
      }
      glass.tube(
        pts.map((p) => p.toArray() as Vec3),
        TUBE_R,
        '#E8F4FF',
      );
      // Riel luminoso dentro del tubo
      opaque.tube(
        pts.map((p, i) => p.clone().addScaledVector(ground[i], -TUBE_R + 0.07).toArray() as Vec3),
        0.05,
        sys.color,
        { glow: 0.8, rough: 0.5 },
      );
      let length = 0;
      for (let i = 0; i < pts.length; i++) {
        if (i > 0) length += pts[i].distanceTo(pts[i - 1]);
        const up = ground[i];
        t.copy(pts[Math.min(pts.length - 1, i + 1)]).sub(pts[Math.max(0, i - 1)]).normalize();
        // Anillos blancos
        if (i % 2 === 0 || i === pts.length - 1) opaque.torus(TUBE_R + 0.02, 0.05, WHITE, { at: pts[i].toArray() as Vec3, rot: facingRot(t), rough: 0.45 });
        // Pilares y balizas solo en el tramo cercano al hub: frente al sector se reúne la tripulación.
        const near = i === 1 || i === 3 || i === 5;
        if (near) {
          const base = surfacePoint(up, 0);
          const h = TUBE_H - TUBE_R;
          opaque.cylinder(0.09, 0.13, h, STEEL, { at: base.clone().addScaledVector(up, h / 2).toArray() as Vec3, rot: uprightRot(up), metal: 0.4, sides: 10 });
        }
        // Balizas del camino a ambos lados
        if (near) {
          side.crossVectors(t, up).normalize();
          for (const k of [-1.25, 1.25]) {
            const p = surfacePoint(up, 0).addScaledVector(side, k);
            const d = p.clone().normalize();
            const base = surfacePoint(d, 0);
            opaque.cylinder(0.07, 0.09, 0.36, DARK, { at: base.clone().addScaledVector(d, 0.18).toArray() as Vec3, rot: uprightRot(d), sides: 8 });
            opaque.sphere(0.075, sys.color, { at: base.clone().addScaledVector(d, 0.4).toArray() as Vec3, glow: 1.8 });
          }
        }
      }
      const inward = s !== 'habitat' && s !== 'shield';
      this.tubes.push({ sector: s, points: pts, length, inward, color: new Color(sys.color) });
    }

    // Faroles del perímetro, entre sectores y lejos del camino del rover (sin tapar la
    // avenida sur que va de la plataforma de abordaje a la puerta del hub).
    for (const s of SECTOR_ORDER) {
      for (const [radius, offset] of [
        [31.2, 22.5],
        [12.2, 22.5],
      ] as const) {
        const angle = SECTOR_ANGLE[s] + offset;
        if (Math.abs(((angle % 360) + 360) % 360 - 90) < 1) continue;
        const { east, north } = colonyPoint(radius, angle);
        const d = colonyDir(east, north);
        const base = surfacePoint(d, 0);
        const rot = uprightRot(d);
        opaque.cylinder(0.06, 0.09, 2.6, STEEL, { at: base.clone().addScaledVector(d, 1.3).toArray() as Vec3, rot, metal: 0.4, sides: 10 });
        opaque.cylinder(0.2, 0.14, 0.14, DARK, { at: base.clone().addScaledVector(d, 2.66).toArray() as Vec3, rot, sides: 12 });
        opaque.sphere(0.15, '#FFE7A8', { at: base.clone().addScaledVector(d, 2.52).toArray() as Vec3, glow: 1.9 });
      }
    }

    const om = opaque.mesh(this.kit.paint, 'colony:tubes');
    if (om) {
      om.frustumCulled = false;
      this.statics.add(om);
    }
    const gm = glass.mesh(this.kit.glass('#E8F4FF', 0.3), 'colony:tube-glass', false);
    if (gm) {
      gm.frustumCulled = false;
      this.statics.add(gm);
    }

    // Paquetes de recursos que viajan por los tubos.
    const per = 4;
    const geo = new SphereGeometry(0.13, 10, 8);
    const mat = new MeshBasicMaterial({ color: '#FFFFFF', toneMapped: false });
    this.packets = new InstancedMesh(geo, mat, this.tubes.length * per);
    this.packets.name = 'colony:packets';
    this.packets.frustumCulled = false;
    this.tubes.forEach((tube, ti) => {
      for (let k = 0; k < per; k++) {
        const idx = ti * per + k;
        this.packetData.push({ tube: ti, t: k / per });
        this.packets!.setColorAt(idx, tube.color);
      }
    });
    this.statics.add(this.packets);
  }

  /* ---------------- estado del juego ---------------- */

  apply(snapshot: WorldSnapshot): void {
    this.snapshot = snapshot;
    const E = this.entities;
    for (const s of SECTOR_ORDER) {
      const h = snapshot.sectors?.[s] ?? 100;
      this.health[s] = h / 100;
      E.get(`sector:${s}`)?.setState({ health: h, highlight: Boolean(snapshot.highlight && SECTORS[s].system === snapshot.highlight) });
    }
    const built = new Set(snapshot.buildings.map((b) => b.id));
    for (const b of BUILDING_IDS) {
      E.setVisible(`building:${b}`, built.has(b));
      E.get(`building:${b}`)?.setState({ fresh: snapshot.newBuilding === b });
    }
    for (let i = 0; i < CITY_ANGLES.length; i++) E.setVisible(`building:city:${i}`, built.has('city'));
    this.applyDiscoveries(snapshot.discoveries ?? []);
    this.applyCrews();
  }

  private applyDiscoveries(labels: string[]): void {
    const want = new Map<string, { dir: Vector3; label: string; color: string }>();
    const near = (dir: Vector3, east: number, north: number) => offsetOnSphere(dir, east, north, R);
    for (const label of labels) {
      const m = MYSTERY_POOL.find((x) => x.label === label);
      if (!m) continue;
      let dir: Vector3 | null = null;
      if (label === 'Meteorito de hierro') dir = near(PADS.find((p) => p.id === 'meteorite')!.dir, 3.4, 1.2);
      else if (label === 'Arándanos marcianos') dir = near(PADS.find((p) => p.id === 'blueberries')!.dir, 3.8, -1.5);
      else if (label === 'Tubo de lava') dir = near(LAVA_TUBE.dir, 3.6, 0);
      else if (label === 'Hielo bajo el suelo') dir = near(ICE_PATCHES[0].dir, 0, 0);
      else if (label === 'Roca con capas') dir = near(MESAS[0].dir, 5.6, 0);
      else if (label === 'Remolino de polvo') {
        const p = colonyPoint(46, 200);
        dir = colonyDir(p.east, p.north);
      }
      if (!dir) continue;
      const slug = label.normalize('NFD').replace(/[^\w]+/g, '-').toLowerCase();
      want.set(`discovery:${slug}`, { dir, label: `${m.emoji} ${m.label}`, color: '#B69CFF' });
    }
    for (const e of this.entities.byDef('landmark.discovery')) if (!want.has(e.uid)) this.entities.remove(e.uid);
    for (const [uid, w] of want) {
      if (!this.entities.has(uid)) this.entities.spawn('landmark.discovery', uid, { dir: w.dir, heading: 0 }, { label: w.label, color: w.color, text: MYSTERY_POOL.find((m) => w.label.endsWith(m.label))?.text ?? '' });
    }
  }

  /** Jugador que controla este dispositivo (su astronauta lo mueve el motor, no el director). */
  setLocalPlayer(id: string | null): void {
    if (this.localId === id) return;
    this.localId = id;
    if (this.snapshot) this.applyCrews();
  }

  /** Poses de los alumnos que juegan en 3D en sus celulares. */
  setPresence(map: PresenceMap): void {
    this.presence = map;
    for (const npc of this.npcs.values()) {
      const p = map[npc.member.id];
      if (!p) {
        npc.remote = null;
        continue;
      }
      const dir = new Vector3(p[0], p[1], p[2]);
      if (dir.lengthSq() < 0.5) continue;
      dir.normalize();
      npc.remote = { dir, heading: p[3], anim: ANIMS[p[4]] ?? 'idle', speed: p[5] };
    }
  }

  private applyCrews(): void {
    const snap = this.snapshot;
    if (!snap) return;
    const phase: Phase = snap.phase ?? 'lobby';
    const seen = new Set<string>();
    const place = (m: WorldCrewMember, spot: { dir: Vector3; heading: number }, pool: AnimName[], wander: boolean) => {
      if (m.id === this.localId) return;
      const uid = `astro:${m.id}`;
      seen.add(uid);
      const key = JSON.stringify([m.avatar, m.role, m.name]);
      let npc = this.npcs.get(uid);
      if (npc && npc.key !== key) {
        this.entities.remove(uid);
        this.npcs.delete(uid);
        npc = undefined;
      }
      if (!npc) {
        const seed = hash(m.id);
        const entity = this.entities.spawn(
          'character.astronaut',
          uid,
          { dir: spot.dir, heading: spot.heading },
          { avatar: m.avatar, role: m.role, label: m.name, labelColor: m.role ? ROLES[m.role].soft : '#FFF8EC', seed: (seed % 1000) / 100 },
        );
        npc = {
          uid,
          member: m,
          key,
          entity,
          dir: spot.dir.clone(),
          heading: spot.heading,
          goal: spot.dir.clone(),
          goalHeading: spot.heading,
          pool,
          activity: pool[0],
          actTimer: 0,
          anim: 'idle',
          rnd: seeded(seed),
          wander,
          wanderTimer: 3,
          home: spot.dir.clone(),
          react: 0,
          remote: null,
        };
        this.npcs.set(uid, npc);
        const p = this.presence[m.id];
        if (p) npc.remote = { dir: new Vector3(p[0], p[1], p[2]).normalize(), heading: p[3], anim: ANIMS[p[4]] ?? 'idle', speed: p[5] };
      }
      npc.member = m;
      npc.home.copy(spot.dir);
      npc.goal.copy(spot.dir);
      npc.goalHeading = spot.heading;
      npc.wander = wander;
      if (npc.pool.join() !== pool.join()) {
        npc.pool = pool;
        npc.actTimer = 0;
      }
    };

    for (const crew of snap.crews ?? []) {
      const n = crew.members.length;
      const spots = phase === 'challenge' || phase === 'discovery' ? huddleSpots(crew.sectorId, n) : phase === 'event' ? workSpots(crew.sectorId, n) : crewSpots(crew.sectorId, n);
      const pool = activityPool(phase, crew.mood);
      crew.members.forEach((m, i) => place(m, spots[i], pool, false));
    }
    const boarding = snap.boarding ?? [];
    const bSpots = boardingSpots(boarding.length);
    boarding.forEach((m, i) => place(m, bSpots[i], activityPool(phase === 'lobby' ? 'lobby' : 'lobby', null), true));

    for (const uid of [...this.npcs.keys()]) {
      if (seen.has(uid)) continue;
      this.entities.remove(uid);
      this.npcs.delete(uid);
    }
  }

  /** Dónde está ahora el astronauta de un alumno (para que entre al mundo justo ahí). */
  spawnFor(id: string | null): { dir: Vector3; heading: number } | null {
    if (!id) return null;
    const npc = this.npcs.get(`astro:${id}`);
    return npc ? { dir: npc.dir.clone(), heading: npc.heading } : null;
  }

  /** El jugador saludó a un astronauta: le devuelve el saludo. */
  greet(uid: string): void {
    const npc = this.npcs.get(uid);
    if (npc) npc.react = 2.6;
  }

  /** Posiciones de los astronautas e IX (para que el jugador no los atraviese). */
  characterSpheres(out: { x: number; y: number; z: number; r: number }[]): void {
    out.length = 0;
    for (const npc of this.npcs.values()) {
      if (!npc.entity.visible) continue;
      const p = npc.entity.root.position;
      out.push({ x: p.x, y: p.y, z: p.z, r: 0.42 });
    }
  }

  /* ---------------- animación ---------------- */

  update(ctx: UpdateContext): void {
    const dt = ctx.dt;
    this.updatePackets(dt, ctx.time);
    this.updateRover(dt);
    this.updateIx(dt, ctx.time);
    for (const npc of this.npcs.values()) this.updateNpc(npc, dt);
  }

  private updatePackets(dt: number, time: number): void {
    const inst = this.packets;
    if (!inst) return;
    for (let i = 0; i < this.packetData.length; i++) {
      const p = this.packetData[i];
      const tube = this.tubes[p.tube];
      const h = this.health[tube.sector];
      const speed = 0.4 + 2.6 * h;
      p.t = (p.t + (dt * speed) / tube.length) % 1;
      const k = tube.inward ? 1 - p.t : p.t;
      const f = k * (tube.points.length - 1);
      const a = Math.floor(f);
      const b = Math.min(tube.points.length - 1, a + 1);
      _v.copy(tube.points[a]).lerp(tube.points[b], f - a);
      const blink = h < 0.35 ? (Math.sin(time * 10 + i) > 0 ? 1 : 0.2) : 1;
      _m.makeScale(blink, blink, blink).setPosition(_v);
      inst.setMatrixAt(i, _m);
    }
    inst.instanceMatrix.needsUpdate = true;
  }

  private updateRover(dt: number): void {
    const n = ROVER_ROUTE.length;
    const i = Math.floor(this.roverT) % n;
    const f = this.roverT - Math.floor(this.roverT);
    const pos = slerpDir(ROVER_ROUTE[i], ROVER_ROUTE[(i + 1) % n], f, _v);
    // ¿El jugador está justo enfrente? El rover espera a que se quite.
    let blocked = false;
    if (this.playerActive) {
      const ahead = slerpDir(ROVER_ROUTE[(i + 1) % n], ROVER_ROUTE[(i + 2) % n], f, _v2).multiplyScalar(R);
      const here = pos.clone().multiplyScalar(R);
      const pp = _v2.copy(this.playerPos).normalize().multiplyScalar(R);
      blocked = pp.distanceTo(here) < 3.2 || pp.distanceTo(ahead) < 3.2;
    }
    this.roverSpeed = damp(this.roverSpeed, blocked ? 0 : 2.4, blocked ? 6 : 1.2, dt);
    this.roverT = (this.roverT + (this.roverSpeed * dt) / Math.max(0.5, this.roverSeg[i])) % n;
    const next = ROVER_ROUTE[(i + 2) % n];
    this.roverHeading += angleDelta(this.roverHeading, headingTo(pos, next)) * (1 - Math.exp(-3 * dt));
    this.entities.move('vehicle:rover', { dir: pos, heading: this.roverHeading });
    this.entities.get('vehicle:rover')?.setState({ speed: Math.round(this.roverSpeed * 100) / 100 });
  }

  private updateIx(dt: number, time: number): void {
    const phase = this.snapshot?.phase ?? 'lobby';
    let mode = 'idle';
    let target: Vector3;
    if (phase === 'briefing' || phase === 'debrief' || phase === 'results') {
      const p = colonyPoint(8.6, 90);
      target = colonyDir(p.east, p.north);
      mode = 'talk';
    } else {
      this.ixAngle += dt * (phase === 'scan' ? 9 : 4);
      const p = colonyPoint(9.6 + Math.sin(time * 0.2) * 1.2, this.ixAngle);
      target = colonyDir(p.east, p.north);
      mode = phase === 'scan' || phase === 'event' ? 'scan' : 'idle';
    }
    const before = this.ixDir.clone();
    slerpDir(this.ixDir, target, 1 - Math.exp(-1.6 * dt), this.ixDir);
    let face = angleBetween(before, this.ixDir) > 1e-5 ? headingTo(before, this.ixDir) : this.ixHeading;
    // Si el jugador está cerca, IX lo mira.
    if (this.playerActive) {
      const pd = _v2.copy(this.playerPos).normalize();
      if (angleBetween(pd, this.ixDir) * R < 7) {
        face = headingTo(this.ixDir, pd);
        if (mode === 'idle') mode = 'talk';
      }
    }
    if (mode === 'talk' && phase !== 'briefing' && !this.playerActive) face = headingTo(this.ixDir, HUB_DIR) + Math.PI;
    this.ixHeading += angleDelta(this.ixHeading, face) * (1 - Math.exp(-3 * dt));
    this.entities.move('character:ix', { dir: this.ixDir, heading: this.ixHeading });
    this.entities.get('character:ix')?.setState({ mode });
  }

  private updateNpc(npc: Npc, dt: number): void {
    let anim: AnimName = npc.activity;
    let speed = 1;
    if (npc.remote) {
      const r = npc.remote;
      const d = angleBetween(npc.dir, r.dir) * R;
      if (d > 12) npc.dir.copy(r.dir);
      else slerpDir(npc.dir, r.dir, 1 - Math.exp(-9 * dt), npc.dir);
      npc.heading += angleDelta(npc.heading, r.heading) * (1 - Math.exp(-12 * dt));
      anim = r.anim;
      speed = r.speed;
    } else {
      // Actividad del equipo (cambia cada pocos segundos para que no se vean robóticos).
      npc.actTimer -= dt;
      if (npc.actTimer <= 0) {
        npc.activity = npc.pool[Math.floor(npc.rnd() * npc.pool.length)] ?? 'idle';
        npc.actTimer = 4 + npc.rnd() * 5;
      }
      // Paseos cortos alrededor de su lugar (solo mientras esperan en la plataforma).
      if (npc.wander) {
        npc.wanderTimer -= dt;
        if (npc.wanderTimer <= 0) {
          npc.wanderTimer = 5 + npc.rnd() * 8;
          if (npc.rnd() < 0.5) offsetOnSphere(npc.home, (npc.rnd() - 0.5) * 3, (npc.rnd() - 0.5) * 3, R, npc.goal);
          else npc.goal.copy(npc.home);
        }
      }
      const d = angleBetween(npc.dir, npc.goal) * R;
      if (d > 0.06) {
        const run = d > 8;
        const v = run ? RUN : WALK;
        const want = headingTo(npc.dir, npc.goal);
        npc.heading += angleDelta(npc.heading, want) * (1 - Math.exp(-10 * dt));
        slerpDir(npc.dir, npc.goal, Math.min(1, (v * dt) / d), npc.dir);
        anim = run ? 'run' : 'walk';
      } else {
        npc.heading += angleDelta(npc.heading, npc.goalHeading) * (1 - Math.exp(-4 * dt));
      }
      if (npc.react > 0) {
        npc.react -= dt;
        if (anim !== 'walk' && anim !== 'run') anim = 'wave';
        if (this.playerActive) npc.heading += angleDelta(npc.heading, headingTo(npc.dir, _v2.copy(this.playerPos).normalize())) * (1 - Math.exp(-8 * dt));
      }
    }
    this.entities.move(npc.uid, { dir: npc.dir, heading: npc.heading });
    if (npc.anim !== anim || npc.entity.state.speed !== speed) {
      npc.anim = anim;
      npc.entity.setState({ anim, speed });
    }
  }

  dispose(): void {
    this.statics.traverse((o) => {
      const m = o as { geometry?: { dispose(): void } };
      m.geometry?.dispose();
    });
    this.packets?.dispose();
    (this.packets?.material as MeshBasicMaterial | undefined)?.dispose();
    this.statics.removeFromParent();
    this.npcs.clear();
  }
}

/* ------------------------------------------------------------------ */
/* Formaciones                                                          */
/* ------------------------------------------------------------------ */

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** La tripulación hace un círculo para discutir frente a su sector. */
function huddleSpots(sector: SectorId, count: number): Spot[] {
  const c = colonyPoint(22 - 7.2, SECTOR_ANGLE[sector]);
  const center = colonyDir(c.east, c.north);
  const r = 0.85 + count * 0.12;
  const out: Spot[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / Math.max(1, count)) * Math.PI * 2 + SECTOR_ANGLE[sector] * (Math.PI / 180);
    const east = c.east + Math.cos(a) * r;
    const north = c.north + Math.sin(a) * r;
    const dir = colonyDir(east, north);
    out.push({ dir, heading: headingTo(dir, center), east, north });
  }
  return out;
}

/** En la emergencia todos van a reparar su sector (de frente a la consola y al muelle). */
function workSpots(sector: SectorId, count: number): Spot[] {
  const angle = (SECTOR_ANGLE[sector] * Math.PI) / 180;
  const radial = { east: Math.cos(angle), north: -Math.sin(angle) };
  const side = { east: -radial.north, north: radial.east };
  const sectorDir = SECTOR_SPOTS[sector].dir;
  const out: Spot[] = [];
  for (let i = 0; i < count; i++) {
    const k = (i - (count - 1) / 2) * 1.25;
    const r = 22 - 5.6 - Math.abs(k) * 0.05;
    const east = radial.east * r + side.east * k;
    const north = radial.north * r + side.north * k;
    const dir = colonyDir(east, north);
    out.push({ dir, heading: headingTo(dir, sectorDir), east, north });
  }
  return out;
}
