import * as THREE from 'three';
import { PS1_UNIFORMS } from './ps1';

const POST_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const POST_FRAG = /* glsl */ `
uniform sampler2D tScene;
uniform vec2 uLowRes;
uniform float uLevels;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uVignette;
uniform float uTime;
varying vec2 vUv;

float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float i = q.x + q.y * 4.0;
  // 4x4 Bayer matrix, row major.
  float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return m[int(i)] / 16.0;
}

vec3 toSRGB(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}

void main() {
  vec3 c = toSRGB(texture2D(tScene, vUv).rgb);
  // Ordered dither + colour quantisation in low-res pixel space (PS1 15-bit look).
  vec2 px = floor(vUv * uLowRes);
  float d = bayer4(px) - 0.5;
  c = floor(c * uLevels + d + 0.5) / uLevels;
  c = mix(c, uFlashColor, uFlash);
  // Vignette + faint scanlines on the output resolution.
  vec2 v = vUv - 0.5;
  c *= 1.0 - dot(v, v) * uVignette;
  c *= 0.94 + 0.06 * step(0.5, fract(gl_FragCoord.y * 0.5));
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

/**
 * Renders the scene into a small render target (≈270p) and upscales it with
 * nearest filtering, dithering and colour quantisation.
 */
export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  private target: THREE.WebGLRenderTarget;
  private readonly postScene = new THREE.Scene();
  private readonly postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly post: THREE.ShaderMaterial;
  lowHeight = 270;
  private flash = 0;

  constructor(container: HTMLElement) {
    this.gl = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(1);
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.gl.domElement;
    this.canvas.id = 'game-canvas';
    container.appendChild(this.canvas);

    this.target = this.makeTarget(480, 270);
    this.post = new THREE.ShaderMaterial({
      vertexShader: POST_VERT,
      fragmentShader: POST_FRAG,
      uniforms: {
        tScene: { value: this.target.texture },
        uLowRes: { value: new THREE.Vector2(480, 270) },
        uLevels: { value: 31 },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Color(1, 1, 1) },
        uVignette: { value: 1.1 },
        uTime: { value: 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post);
    quad.frustumCulled = false;
    this.postScene.add(quad);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private makeTarget(w: number, h: number): THREE.WebGLRenderTarget {
    const t = new THREE.WebGLRenderTarget(w, h, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      generateMipmaps: false,
    });
    t.texture.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  get aspect(): number {
    return window.innerWidth / Math.max(1, window.innerHeight);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.gl.setSize(w, h, true);
    const lh = this.lowHeight;
    const lw = Math.max(1, Math.round(lh * (w / Math.max(1, h))));
    this.target.setSize(lw, lh);
    (this.post.uniforms.uLowRes!.value as THREE.Vector2).set(lw, lh);
    PS1_UNIFORMS.uSnap.value.set(lw / 2, lh / 2);
  }

  /** Full-screen colour flash (perfect hits, strobes). */
  pulseFlash(amount: number, color: number): void {
    this.flash = Math.max(this.flash, amount);
    (this.post.uniforms.uFlashColor!.value as THREE.Color).setHex(color);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, dt: number): void {
    this.flash = Math.max(0, this.flash - dt * 4);
    this.post.uniforms.uFlash!.value = this.flash;
    this.post.uniforms.uTime!.value += dt;
    this.gl.setRenderTarget(this.target);
    this.gl.render(scene, camera);
    this.gl.setRenderTarget(null);
    this.gl.render(this.postScene, this.postCamera);
  }
}
