import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { applyPS1 } from './ps1';

/**
 * Skinned characters built in Blender (tools/blender, D-025): one GLB per
 * variant (mesh + skeleton) plus anims.glb with every clip. Clips are bound by
 * bone name, so all variants share them. Playback is *phase driven*: gameplay
 * says "clip X at 40 %", the mixer only handles cross-fades.
 */

export const PLAYER_VARIANT = 'player';
export const CROWD_VARIANTS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];

interface VariantTemplate {
  scene: THREE.Object3D;
  /** Clips with the root position track rebased onto this variant's hip height. */
  clips: Map<string, THREE.AnimationClip>;
}

export class CharacterLibrary {
  private readonly variants = new Map<string, VariantTemplate>();
  ready = false;

  async load(baseUrl = './models/', ps1 = false): Promise<void> {
    const loader = new GLTFLoader();
    const anims = await loader.loadAsync(`${baseUrl}anims.glb`);
    const animRoot = findBone(anims.scene, 'root');
    const animRootRest = animRoot ? animRoot.position.clone() : new THREE.Vector3();
    // Only rotations (and the root's translation) are animated; per-bone offsets come from each variant.
    const baseClips = anims.animations.map((clip) => {
      const tracks = clip.tracks.filter((t) => t.name.endsWith('.quaternion') || t.name === `${animRoot?.name}.position`);
      return new THREE.AnimationClip(clip.name, clip.duration, tracks);
    });

    const ids = [PLAYER_VARIANT, ...CROWD_VARIANTS];
    const results = await Promise.all(ids.map((id) => loader.loadAsync(`${baseUrl}char_${id}.glb`).catch(() => null)));
    results.forEach((gltf, i) => {
      if (!gltf) return;
      const scene = gltf.scene;
      scene.traverse((o) => {
        const m = o as THREE.SkinnedMesh;
        if (m.isMesh) {
          m.frustumCulled = false;
          if (ps1) {
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            mats.forEach((mat) => applyPS1(mat));
          }
        }
      });
      const root = findBone(scene, 'root');
      const rest = root ? root.position.clone() : animRootRest.clone();
      const delta = rest.sub(animRootRest);
      const clips = new Map<string, THREE.AnimationClip>();
      for (const clip of baseClips) clips.set(clip.name, rebaseRoot(clip, `${animRoot?.name}.position`, delta));
      this.variants.set(ids[i]!, { scene, clips });
    });
    this.ready = this.variants.has(PLAYER_VARIANT);
  }

  has(id: string): boolean {
    return this.variants.has(id);
  }

  create(id: string): SkinnedCharacter {
    const t = this.variants.get(id) ?? this.variants.get(PLAYER_VARIANT)!;
    return new SkinnedCharacter(SkeletonUtils.clone(t.scene), t.clips);
  }
}

function findBone(root: THREE.Object3D, name: string): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  root.traverse((o) => {
    if (!found && (o as THREE.Bone).isBone && o.name === name) found = o;
  });
  return found;
}

function rebaseRoot(clip: THREE.AnimationClip, trackName: string, delta: THREE.Vector3): THREE.AnimationClip {
  if (delta.lengthSq() < 1e-8) return clip;
  const tracks = clip.tracks.map((t) => {
    if (t.name !== trackName) return t;
    const values = Float32Array.from(t.values);
    for (let i = 0; i < values.length; i += 3) {
      values[i]! += delta.x;
      values[i + 1]! += delta.y;
      values[i + 2]! += delta.z;
    }
    return new THREE.VectorKeyframeTrack(t.name, Array.from(t.times), Array.from(values));
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

/**
 * One animated character instance. `play()` cross-fades to a clip instance
 * (identified by `key`), `setPhase()` positions it; repeated plays of the same
 * clip ping-pong between two actions so they can still blend.
 */
export class SkinnedCharacter {
  readonly object: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly clips: Map<string, THREE.AnimationClip>;
  private readonly alt = new Map<string, THREE.AnimationClip>();
  private current: THREE.AnimationAction | null = null;
  private currentKey = '';
  private flip = false;

  constructor(object: THREE.Object3D, clips: Map<string, THREE.AnimationClip>) {
    this.object = object;
    this.clips = clips;
    this.mixer = new THREE.AnimationMixer(object);
  }

  /** Clip name with mirror suffix when a mirrored variant exists. */
  resolve(name: string, mirror: boolean): string {
    if (mirror && this.clips.has(`${name}_m`)) return `${name}_m`;
    return this.clips.has(name) ? name : 'idle';
  }

  play(name: string, key: string, fade: number): void {
    if (key === this.currentKey) return;
    const sameClip = this.current?.getClip().name === name;
    this.currentKey = key;
    let clip = this.clips.get(name);
    if (!clip) return;
    if (sameClip) {
      this.flip = !this.flip;
      if (this.flip) {
        let a = this.alt.get(name);
        if (!a) this.alt.set(name, (a = clip.clone()));
        clip = a;
      }
    }
    const next = this.mixer.clipAction(clip);
    next.reset();
    next.timeScale = 0; // time is set from gameplay phase
    next.setEffectiveWeight(1);
    next.play();
    if (this.current && this.current !== next && fade > 0) this.current.crossFadeTo(next, fade, false);
    else if (this.current && this.current !== next) this.current.stop();
    this.current = next;
  }

  setPhase(phase: number, loop: boolean): void {
    const a = this.current;
    if (!a) return;
    const d = a.getClip().duration;
    const p = loop ? phase - Math.floor(phase) : Math.min(1, Math.max(0, phase));
    a.time = p * d * 0.999;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  setShadows(cast: boolean, receive: boolean): void {
    this.object.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = cast;
        o.receiveShadow = receive;
      }
    });
  }

  bone(name: string): THREE.Object3D | undefined {
    return findBone(this.object, name);
  }
}
