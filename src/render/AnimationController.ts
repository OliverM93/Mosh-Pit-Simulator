import * as THREE from 'three';

/**
 * Upper-body bones (arms overlay layer). Everything else – root, lower spine,
 * legs – belongs to the lower layer. Names follow the game skeleton (tools/blender/mh.py).
 */
const UPPER_BONES = new Set(
  [
    'spine03', 'spine02', 'spine01', 'neck01', 'neck02', 'neck03', 'head',
    'clavicle.L', 'shoulder01.L', 'upperarm01.L', 'upperarm02.L', 'lowerarm01.L', 'lowerarm02.L', 'wrist.L',
    'clavicle.R', 'shoulder01.R', 'upperarm01.R', 'upperarm02.R', 'lowerarm01.R', 'lowerarm02.R', 'wrist.R',
  ].map((n) => THREE.PropertyBinding.sanitizeNodeName(n)), // GLTFLoader strips the dots: 'wrist.L' → 'wristL'
);

export type BodyHalf = 'lower' | 'upper';

/** One clip contribution of a source, set by the driver every frame. */
export interface ClipPart {
  clip: string;
  /** Seconds into the clip. */
  time: number;
  /** Relative weight inside the source (locomotion mixes idle/walk/run). */
  weight: number;
}

interface Source {
  key: string;
  weight: number;
  target: number;
  rate: number;
  parts: ClipPart[];
  actions: THREE.AnimationAction[];
}

/**
 * Two-layer animation for the player (D-028): the lower body and the upper
 * body each blend their own weighted sources, so arm moves can run over
 * footwork or locomotion. A source is "what this half should show" (a move,
 * or the speed-blended locomotion); switching sources fades over `fade`
 * seconds. Weights are normalised per half – no snapping to the bind pose.
 * Gameplay owns all timing; this class only displays it.
 */
export class AnimationController {
  readonly object: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly halves: Record<BodyHalf, Map<string, THREE.AnimationClip[]>> = { lower: new Map(), upper: new Map() };
  private readonly durations = new Map<string, number>();
  private readonly sources: Record<BodyHalf, Source[]> = { lower: [], upper: [] };
  /** Reference count per action (a third overlapping instance shares one). */
  private readonly inUse = new Map<THREE.AnimationAction, number>();

  constructor(object: THREE.Object3D, clips: Map<string, THREE.AnimationClip>) {
    this.object = object;
    this.mixer = new THREE.AnimationMixer(object);
    for (const [name, clip] of clips) {
      this.durations.set(name, clip.duration);
      const upper = clip.tracks.filter((t) => UPPER_BONES.has(t.name.slice(0, t.name.lastIndexOf('.'))));
      const lower = clip.tracks.filter((t) => !upper.includes(t));
      // Two instances per half so the same clip can fade into itself (repeated moves).
      this.halves.upper.set(name, [0, 1].map((i) => new THREE.AnimationClip(`${name}|U${i}`, clip.duration, upper)));
      this.halves.lower.set(name, [0, 1].map((i) => new THREE.AnimationClip(`${name}|L${i}`, clip.duration, lower)));
    }
  }

  has(clip: string): boolean {
    return this.durations.has(clip);
  }

  duration(clip: string): number {
    return this.durations.get(clip) ?? 1;
  }

  /** Name with mirror suffix when a mirrored clip exists. */
  resolve(name: string, mirror: boolean): string {
    if (mirror && this.has(`${name}_m`)) return `${name}_m`;
    return this.has(name) ? name : 'idle';
  }

  /**
   * Say what a body half shows this frame. A new `key` fades in over `fade`
   * seconds while the previous sources fade out; the same key just updates
   * clip times/weights.
   */
  want(half: BodyHalf, key: string, parts: ClipPart[], fade: number): void {
    const list = this.sources[half];
    let src = list.find((s) => s.key === key && s.target > 0);
    if (!src) {
      const rate = 1 / Math.max(0.01, fade);
      for (const s of list) {
        s.target = 0;
        s.rate = rate;
      }
      src = { key, weight: list.length ? 0 : 1, target: 1, rate, parts: [], actions: [] };
      list.push(src);
    }
    if (src.parts.length !== parts.length || src.parts.some((p, i) => p.clip !== parts[i]!.clip)) {
      for (const a of src.actions) this.release(a);
      src.actions = parts.map((p) => this.acquire(half, p.clip));
    }
    src.parts = parts;
  }

  update(dt: number): void {
    for (const half of ['lower', 'upper'] as const) {
      const list = this.sources[half];
      for (const s of list) s.weight = s.target > s.weight ? Math.min(s.target, s.weight + s.rate * dt) : Math.max(s.target, s.weight - s.rate * dt);
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i]!.target === 0 && list[i]!.weight <= 0) {
          for (const a of list[i]!.actions) this.release(a);
          list.splice(i, 1);
        }
      }
      const total = list.reduce((n, s) => n + s.weight, 0) || 1;
      for (const s of list) {
        const partTotal = s.parts.reduce((n, p) => n + p.weight, 0) || 1;
        s.parts.forEach((p, i) => {
          const a = s.actions[i]!;
          a.time = Math.min(Math.max(0, p.time), a.getClip().duration * 0.999);
          a.setEffectiveWeight((s.weight / total) * (p.weight / partTotal));
        });
      }
    }
    this.mixer.update(0); // times are set directly – only blending is evaluated
  }

  setShadows(cast: boolean, receive: boolean): void {
    this.object.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = cast;
        o.receiveShadow = receive;
      }
    });
  }

  private acquire(half: BodyHalf, clip: string): THREE.AnimationAction {
    const variants = this.halves[half].get(clip) ?? this.halves[half].get('idle')!;
    let action = this.mixer.clipAction(variants[0]!);
    if (this.inUse.has(action)) action = this.mixer.clipAction(variants[1]!);
    const n = this.inUse.get(action) ?? 0;
    this.inUse.set(action, n + 1);
    if (n > 0) return action;
    action.reset();
    action.timeScale = 0;
    action.setEffectiveWeight(0);
    action.play();
    return action;
  }

  private release(action: THREE.AnimationAction): void {
    const n = this.inUse.get(action) ?? 0;
    if (n > 1) this.inUse.set(action, n - 1);
    else if (n === 1) {
      this.inUse.delete(action);
      action.stop();
    }
  }
}
