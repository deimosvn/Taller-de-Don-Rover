// Postproceso: desenfoque de miniatura (tilt-shift). En la referencia la franja central es
// nítida y la imagen se difumina hacia el borde inferior (primer plano o limbo lejano) y un
// poco hacia arriba y las esquinas; ese desenfoque es gran parte de su aspecto de maqueta.
// Se hace en una sola pasada sobre la escena renderizada con MSAA.

import {
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uTexel;
uniform float uBlur;
uniform float uFocus;
uniform float uStrength;
varying vec2 vUv;
const int TAPS = 22;
void main() {
  float below = smoothstep(uFocus - 0.08, 0.0, vUv.y);
  float above = smoothstep(uFocus + 0.34, 1.02, vUv.y) * 0.42;
  float side = smoothstep(0.3, 0.52, abs(vUv.x - 0.5)) * 0.3;
  float amount = clamp(max(below, above) + side * (0.4 + below), 0.0, 1.0) * uStrength;
  float radius = amount * amount * uBlur;
  vec3 col = texture2D(tScene, vUv).rgb;
  if (radius > 0.4) {
    for (int i = 0; i < TAPS; i++) {
      float fi = float(i) + 0.5;
      float r = sqrt(fi / float(TAPS)) * radius;
      float a = fi * 2.3999632;
      col += texture2D(tScene, vUv + vec2(cos(a), sin(a)) * r * uTexel).rgb;
    }
    col /= float(TAPS + 1);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export class PostFX {
  /** 0 = sin desenfoque, 1 = desenfoque completo. */
  strength = 1;
  /** Altura de la franja nítida (0 = borde inferior, 1 = borde superior). */
  focus = 0.5;

  private readonly target: WebGLRenderTarget;
  private readonly scene = new Scene();
  private readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: ShaderMaterial;
  private readonly quad: Mesh;

  constructor(renderer: WebGLRenderer, samples: number) {
    const float = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
    this.target = new WebGLRenderTarget(4, 4, {
      samples,
      type: float ? HalfFloatType : UnsignedByteType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: true,
    });
    if (!float) this.target.texture.colorSpace = SRGBColorSpace;
    this.target.texture.name = 'post:scene';
    this.material = new ShaderMaterial({
      uniforms: {
        tScene: { value: this.target.texture },
        uTexel: { value: new Vector2(1, 1) },
        uBlur: { value: 8 },
        uFocus: { value: 0.5 },
        uStrength: { value: 1 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.material.name = 'mat:post';
    this.quad = new Mesh(new PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  setSize(width: number, height: number): void {
    const w = Math.max(2, Math.floor(width));
    const h = Math.max(2, Math.floor(height));
    this.target.setSize(w, h);
    this.material.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.material.uniforms.uBlur.value = h * 0.0095;
  }

  render(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera): void {
    this.material.uniforms.uFocus.value = this.focus;
    this.material.uniforms.uStrength.value = this.strength;
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}
