// Material del terreno marciano.
//
// Parte de MeshStandardMaterial (PBR: luces, sombras y bruma del motor) y sustituye el color,
// la rugosidad y la normal por versiones procedurales calculadas en el fragment shader:
//
//   · color base por zonas (regolito, dunas, basalto, roca, hielo) mezclado con las máscaras
//     suaves que llegan por vértice → transiciones difuminadas como las orillas de la referencia;
//   · "burbujas": discos claros de borde blando a dos escalas, la firma visual del suelo original;
//   · estratos horizontales en paredes de cañón, cráteres y mesetas;
//   · ondas de duna, motas oscuras, escarcha en las orillas del hielo y destellos que titilan;
//   · pavimento hexagonal tenue en el suelo de la colonia (el mismo motivo del mapa SVG);
//   · relieve fino (normal map procedural) y rugosidad variable por material;
//   · bruma atmosférica en el limbo del planeta.

import { Color, MeshStandardMaterial, Vector3 } from 'three';
import { TERRAIN } from '../core/palette';
import { tangentFrame } from '../core/math';
import { HUB_DIR } from './features';

export interface TerrainUniforms {
  uTime: { value: number };
  uHaze: { value: Color };
  uHazeAmount: { value: number };
  uDust: { value: number };
}

const GLSL_PARS = /* glsl */ `
uniform float uTime;
uniform vec3 uRegolith; uniform vec3 uRegolithLight; uniform vec3 uRegolithDark;
uniform vec3 uDune; uniform vec3 uDuneLight;
uniform vec3 uBasalt; uniform vec3 uBasaltDark;
uniform vec3 uRock; uniform vec3 uRockDark; uniform vec3 uRockLight;
uniform vec3 uIce; uniform vec3 uIceShade; uniform vec3 uFrost;
uniform vec3 uColony; uniform vec3 uHex; uniform vec3 uCavity;
uniform vec3 uHubEast; uniform vec3 uHubNorth;
uniform vec3 uHaze; uniform float uHazeAmount; uniform float uDust;
varying vec4 vMask;
varying vec3 vInfo;
varying vec3 vPlanetPos;

float ixBump = 0.0;
float ixRough = 1.0;
float ixGlint = 0.0;

vec3 ixHash3(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float ixNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = ixHash3(i).x;
  float b = ixHash3(i + vec3(1.0, 0.0, 0.0)).x;
  float c = ixHash3(i + vec3(0.0, 1.0, 0.0)).x;
  float d = ixHash3(i + vec3(1.0, 1.0, 0.0)).x;
  float e = ixHash3(i + vec3(0.0, 0.0, 1.0)).x;
  float g = ixHash3(i + vec3(1.0, 0.0, 1.0)).x;
  float h = ixHash3(i + vec3(0.0, 1.0, 1.0)).x;
  float k = ixHash3(i + vec3(1.0, 1.0, 1.0)).x;
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}
float ixFbm(vec3 p) {
  return ixNoise(p) * 0.55 + ixNoise(p * 2.07 + 11.3) * 0.3 + ixNoise(p * 4.31 - 5.7) * 0.15;
}
// Discos de borde blando: x = cobertura (0–1), y = azar propio de cada disco.
vec2 ixDiscs(vec3 p, float rMin, float rMax, float soft) {
  vec3 ip = floor(p - 0.5);
  float m = 0.0;
  float id = 0.0;
  for (int k = 0; k < 8; k++) {
    vec3 cell = ip + vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
    vec3 rnd = ixHash3(cell);
    vec3 c = cell + 0.5 + (rnd - 0.5) * 0.5;
    float r = mix(rMin, rMax, rnd.x);
    float s = 1.0 - smoothstep(r * soft, r, length(p - c));
    if (s > m) { m = s; id = rnd.y; }
  }
  return vec2(m, id);
}
// Distancia al borde del hexágono más cercano (0 en la línea).
float ixHex(vec2 p) {
  const vec2 s = vec2(1.0, 1.7320508);
  vec4 hc = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 h = vec4(p - hc.xy * s, p - (hc.zw + 0.5) * s);
  vec2 g = dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw;
  g = abs(g);
  return 0.5 - max(dot(g, s * 0.5), g.x);
}
vec3 ixPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
  vec3 sx = normalize(dFdx(surfPos));
  vec3 sy = normalize(dFdy(surfPos));
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}

vec3 ixTerrain() {
  vec3 p = vPlanetPos;
  float ice = vMask.x;
  float basalt = vMask.y;
  float dune = vMask.z;
  float rock = vMask.w;
  float h = vInfo.x;
  float ao = vInfo.y;
  float colony = vInfo.z;
  float dist = length(vViewPosition);
  float near = 1.0 - smoothstep(26.0, 70.0, dist);
  float mid = 1.0 - smoothstep(90.0, 260.0, dist);

  float n = ixFbm(p * 0.33);
  float n2 = ixNoise(p * 1.9 + 3.1);
  vec2 d1 = ixDiscs(p * 0.21, 0.27, 0.54, 0.7);
  vec2 d2 = vec2(0.0);
  #if IX_DETAIL > 0
    d2 = ixDiscs(p * 0.63 + 7.3, 0.2, 0.46, 0.66) * vec2(mid, 1.0);
  #endif

  // --- regolito: base terracota con burbujas claras y algunas oscuras -----------------
  vec3 col = mix(uRegolith, uRegolithDark, smoothstep(0.42, 0.8, n) * 0.6);
  col = mix(col, uRegolithLight, d1.x * (0.42 + 0.4 * d1.y));
  col = mix(col, mix(uRegolithLight, uRegolithDark, step(0.55, d2.y)), d2.x * 0.3);
  float bump = d1.x * 0.5 + d2.x * 0.28 + n * 0.4;

  // --- suelo de la colonia: regolito compactado con pavimento hexagonal ---------------
  if (colony > 0.001) {
    vec3 ground = mix(uColony, uRegolithLight, d1.x * 0.5 + d2.x * 0.15);
    col = mix(col, ground, colony * 0.75);
    vec2 q = vec2(dot(p, uHubEast), dot(p, uHubNorth)) / 3.4;
    float line = 1.0 - smoothstep(0.012, 0.05, ixHex(q));
    col = mix(col, uHex, line * colony * 0.24 * mid);
  }

  // --- dunas ocre con ondas ---------------------------------------------------------
  if (dune > 0.001) {
    float ripple = sin(dot(p, vec3(1.9, 0.7, 1.3)) * 2.4 + n2 * 5.0 + n * 9.0);
    ripple = smoothstep(-0.2, 0.9, ripple);
    vec3 duneCol = mix(uDune, uDuneLight, clamp(d1.x * 0.55 + ripple * 0.4 * mid, 0.0, 1.0));
    col = mix(col, duneCol, dune);
    bump += ripple * dune * 0.45;
  }

  // --- llanuras de basalto ----------------------------------------------------------
  if (basalt > 0.001) {
    vec3 bas = mix(uBasalt, uBasaltDark, smoothstep(0.35, 0.8, n2) * 0.7);
    bas = mix(bas, uBasalt * 1.3, d1.x * 0.4);
    col = mix(col, bas, basalt);
  }

  // --- roca con estratos ------------------------------------------------------------
  if (rock > 0.001) {
    float band = sin(h * 5.4 + n * 3.2 + n2 * 1.1);
    vec3 rk = mix(uRock, uRockDark, smoothstep(-0.25, 0.55, band));
    rk = mix(rk, uRockLight, smoothstep(0.7, 0.95, sin(h * 2.3 + 1.7 + n * 2.0)));
    col = mix(col, rk, rock);
    bump += band * rock * 0.35;
  }

  // --- motas oscuras (solo de cerca) --------------------------------------------------
  #if IX_DETAIL > 1
    if (near > 0.01) {
      vec2 sp = ixDiscs(p * 2.6 + 1.7, 0.07, 0.16, 0.55);
      col *= 1.0 - sp.x * 0.2 * near * (1.0 - ice);
      bump -= sp.x * 0.25 * near;
    }
  #endif

  // --- cavidades: fondos de cráter y cañón teñidos de ciruela -------------------------
  col = mix(col, col * uCavity * 2.1, ao * 0.8);

  // --- hielo: orilla de escarcha y cuerpo celeste con destellos -----------------------
  float rough = mix(0.95, 0.86, rock);
  if (ice > 0.001) {
    float body = smoothstep(0.34, 0.78, ice + (n2 - 0.5) * 0.18);
    float fringe = smoothstep(0.02, 0.36, ice) * (1.0 - body);
    vec3 iceCol = mix(uIceShade, uIce, clamp(d1.x * 0.6 + n * 0.45, 0.0, 1.0));
    col = mix(col, uFrost, fringe * 0.9);
    col = mix(col, iceCol, body);
    rough = mix(rough, 0.5, body);
    bump = mix(bump, d1.x * 0.2 + n * 0.15, body);
    #if IX_DETAIL > 0
      vec2 g = ixDiscs(p * 1.7 + 4.1, 0.035, 0.07, 0.4);
      float tw = pow(0.5 + 0.5 * sin(uTime * 1.6 + g.y * 60.0), 5.0);
      ixGlint = g.x * tw * body * mid;
    #endif
  }

  // Polvo en suspensión (tormenta): aclara y desatura el suelo.
  col = mix(col, uRegolithLight, uDust * 0.35);

  ixBump = bump * (0.35 + 0.65 * mid);
  ixRough = rough;
  return col;
}
`;

export function createTerrainMaterial(detail: 0 | 1 | 2): { material: MeshStandardMaterial; uniforms: TerrainUniforms } {
  const east = new Vector3();
  const north = new Vector3();
  tangentFrame(HUB_DIR, east, north);
  const c = (hex: string) => ({ value: new Color(hex) });
  const uniforms = {
    uTime: { value: 0 },
    uRegolith: c(TERRAIN.regolith),
    uRegolithLight: c(TERRAIN.regolithLight),
    uRegolithDark: c(TERRAIN.regolithDark),
    uDune: c(TERRAIN.dune),
    uDuneLight: c(TERRAIN.duneLight),
    uBasalt: c(TERRAIN.basalt),
    uBasaltDark: c(TERRAIN.basaltDark),
    uRock: c(TERRAIN.rock),
    uRockDark: c(TERRAIN.rockDark),
    uRockLight: c(TERRAIN.rockLight),
    uIce: c(TERRAIN.ice),
    uIceShade: c(TERRAIN.iceShade),
    uFrost: c(TERRAIN.frost),
    uColony: c(TERRAIN.colony),
    uHex: c(TERRAIN.hex),
    uCavity: c(TERRAIN.cavity),
    uHubEast: { value: east },
    uHubNorth: { value: north },
    uHaze: c('#FFE9D2'),
    uHazeAmount: { value: 0.3 },
    uDust: { value: 0 },
  };

  const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  material.name = 'mat:terrain';
  material.defines = { ...(material.defines ?? {}), IX_DETAIL: detail };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 aMask;
attribute vec3 aInfo;
varying vec4 vMask;
varying vec3 vInfo;
varying vec3 vPlanetPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vMask = aMask;
vInfo = aInfo;
vPlanetPos = position;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb = ixTerrain();`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = ixRough;`)
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
normal = ixPerturb(-vViewPosition, normal, vec2(dFdx(ixBump), dFdy(ixBump)) * 0.9, faceDirection);`,
      )
      .replace(
        '#include <opaque_fragment>',
        `outgoingLight += vec3(1.0, 0.98, 0.94) * ixGlint * 0.9;
float ixFres = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 2.4);
outgoingLight = mix(outgoingLight, uHaze, ixFres * uHazeAmount);
#include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => `ix-terrain-${detail}`;
  return { material, uniforms };
}
