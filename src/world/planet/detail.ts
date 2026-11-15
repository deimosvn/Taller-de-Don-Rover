// Detalle de la superficie: miles de piedras pequeñas repartidas por todo el planeta.
// Son una sola malla instanciada (una llamada de dibujo), colocadas con semilla fija para
// que el planeta sea el mismo en todos los dispositivos. Dentro de la colonia no hay: ahí el
// suelo está nivelado y limpio.

import { Color, IcosahedronGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { TAU, seeded } from '../core/math';
import { PROPS, TERRAIN } from '../core/palette';
import { COLONY_FLAT_ANGLE, HUB_DIR } from './features';
import { newSample, sampleTerrain, terrainRadius } from './heightfield';

const TONES = [PROPS.boulder, PROPS.pebble, PROPS.boulderDark, TERRAIN.rock, TERRAIN.rockLight, PROPS.hematite, TERRAIN.rockDark, PROPS.pebble];

export class SurfaceDetail {
  readonly mesh: InstancedMesh;

  constructor(count: number) {
    const geometry = new IcosahedronGeometry(1, 0);
    const material = new MeshStandardMaterial({ roughness: 1, metalness: 0, flatShading: true });
    this.mesh = new InstancedMesh(geometry, material, count);
    this.mesh.name = 'world:pebbles';
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;

    const rnd = seeded(7741);
    const dir = new Vector3();
    const pos = new Vector3();
    const scale = new Vector3();
    const quat = new Quaternion();
    const axis = new Vector3();
    const m = new Matrix4();
    const color = new Color();
    const sample = newSample();
    const hubCos = Math.cos(COLONY_FLAT_ANGLE + 0.02);
    let n = 0;
    let guard = 0;
    while (n < count && guard++ < count * 3) {
      const y = rnd() * 2 - 1;
      const a = rnd() * TAU;
      const s = Math.sqrt(1 - y * y);
      dir.set(s * Math.cos(a), y, s * Math.sin(a));
      const size = 0.1 + Math.pow(rnd(), 2.4) * 0.5;
      const squash = 0.45 + rnd() * 0.4;
      const tone = TONES[Math.floor(rnd() * TONES.length)];
      const spin = rnd() * TAU;
      const light = rnd();
      if (dir.dot(HUB_DIR) > hubCos) continue;
      sampleTerrain(dir.x, dir.y, dir.z, sample);
      // Sobre el hielo casi no hay piedras; en las dunas, pocas.
      if (sample.ice > 0.5 || (sample.dune > 0.6 && light < 0.6)) continue;
      pos.copy(dir).multiplyScalar(terrainRadius(dir) + size * squash * 0.25);
      quat.setFromUnitVectors(axis.set(0, 1, 0), dir);
      quat.multiply(new Quaternion().setFromAxisAngle(axis.set(0, 1, 0), spin));
      scale.set(size * (0.8 + rnd() * 0.5), size * squash, size * (0.8 + rnd() * 0.5));
      this.mesh.setMatrixAt(n, m.compose(pos, quat, scale));
      this.mesh.setColorAt(n, color.set(tone).offsetHSL(0, 0, (light - 0.5) * 0.12));
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshStandardMaterial).dispose();
    this.mesh.dispose();
    this.mesh.removeFromParent();
  }
}
