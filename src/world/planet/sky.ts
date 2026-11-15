// Cielo de MARS-01: una cúpula con degradado luminoso que palidece hacia el horizonte,
// vetas blancas translúcidas que cruzan el cielo y nubes blandas cerca del horizonte
// (los mismos recursos del cielo de la referencia, en tonos marcianos).
// No hay estrellas ni astros: el cielo es un fondo limpio que deja protagonismo al planeta.

import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uMid;
uniform vec3 uHorizon;
uniform vec3 uHaze;
uniform vec3 uStreak;
uniform float uStreakAlpha;
uniform vec3 uUp;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uTime;
uniform float uDust;
varying vec3 vDir;

float hash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  return noise(p) * 0.55 + noise(p * 2.1 + 3.7) * 0.3 + noise(p * 4.3 - 1.9) * 0.15;
}
float band(vec3 d, vec3 n, float width) {
  float b = dot(d, n);
  return exp(-(b * b) / (width * width));
}

void main() {
  vec3 d = normalize(vDir);
  float e = dot(d, uUp);

  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.34, e));
  col = mix(col, uZenith, smoothstep(0.24, 0.96, e));
  col = mix(col, uHaze, smoothstep(0.03, -0.4, e));

  // Vetas: bandas anchas y suaves sobre círculos máximos, moduladas con ruido lento.
  float above = smoothstep(-0.05, 0.25, e);
  float drift = uTime * 0.004;
  float s1 = band(d, normalize(vec3(0.42, 0.55, -0.72)), 0.11) * (0.55 + 0.45 * noise(d * 2.3 + drift));
  float s2 = band(d, normalize(vec3(-0.63, 0.38, 0.67)), 0.07) * (0.4 + 0.6 * noise(d * 3.1 - drift));
  float s3 = band(d, normalize(vec3(0.15, -0.3, 0.94)), 0.16) * 0.45 * noise(d * 1.7 + 4.0);
  float streaks = clamp(s1 + s2 * 0.8 + s3, 0.0, 1.0);
  col = mix(col, uStreak, streaks * uStreakAlpha * above);

  // Nubes blandas pegadas al horizonte.
  float c = fbm(d * 3.2 + vec3(drift * 2.0, 0.0, drift));
  float cloud = smoothstep(0.52, 0.78, c) * smoothstep(0.0, 0.07, e) * (1.0 - smoothstep(0.16, 0.5, e));
  col = mix(col, uStreak, cloud * uStreakAlpha * 0.9);

  // Resplandor difuso del sol (sin disco).
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(s, 48.0) * 0.16 + pow(s, 5.0) * 0.07) * above;

  // De noche: estrellas que titilan y las dos lunas de Marte (Fobos y Deimos).
  float night = 1.0 - smoothstep(0.06, 0.34, dot(uZenith, vec3(0.3, 0.5, 0.2)));
  vec3 g = d * 95.0;
  vec3 cell = floor(g);
  float h = hash(cell);
  float spark = smoothstep(0.42, 0.0, length(fract(g) - 0.5)) * step(0.972, h);
  float twinkle = 0.65 + 0.35 * sin(uTime * (1.5 + h * 3.0) + h * 40.0);
  col += vec3(1.0, 0.96, 0.9) * spark * twinkle * night * smoothstep(0.04, 0.4, e) * (1.0 - uDust);
  float phobos = smoothstep(0.99962, 0.99974, dot(d, normalize(vec3(0.45, 0.62, 0.64))));
  float deimos = smoothstep(0.99988, 0.99993, dot(d, normalize(vec3(-0.55, 0.42, 0.72))));
  float moonShade = 0.82 + 0.18 * noise(d * 260.0);
  col = mix(col, vec3(1.0, 0.95, 0.86) * moonShade, clamp(phobos + deimos, 0.0, 1.0) * (0.3 + 0.7 * night) * above * (1.0 - uDust));

  // Polvo de tormenta: el cielo se iguala en un velo anaranjado.
  col = mix(col, uHaze, uDust * 0.7);

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export class Sky {
  readonly mesh: Mesh;
  readonly uniforms = {
    uZenith: { value: new Color() },
    uMid: { value: new Color() },
    uHorizon: { value: new Color() },
    uHaze: { value: new Color() },
    uStreak: { value: new Color() },
    uStreakAlpha: { value: 0.5 },
    uUp: { value: new Vector3(0, 1, 0) },
    uSunDir: { value: new Vector3(0, 1, 0) },
    uSunColor: { value: new Color() },
    uTime: { value: 0 },
    uDust: { value: 0 },
  };

  constructor() {
    const material = new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
    });
    material.name = 'mat:sky';
    this.mesh = new Mesh(new SphereGeometry(600, 32, 20), material);
    this.mesh.name = 'planet:sky';
    this.mesh.renderOrder = -100;
    this.mesh.frustumCulled = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as ShaderMaterial).dispose();
  }
}
