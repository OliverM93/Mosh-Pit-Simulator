import { getClip, sampleClip, type CompiledClip } from './clips';
import { createPose, lerpPose, unwrapToward, type Pose } from './pose';

/**
 * Plays one clip at a time and cross-fades on every clip change, so moves
 * flow into each other instead of snapping. The caller supplies the clip
 * phase each frame (song-time driven for moves, beat driven for loops).
 */
export class Animator {
  readonly pose: Pose = createPose();
  private clip: CompiledClip = getClip('idle');
  private mirror = false;
  private key = '';
  private readonly from: Pose = createPose();
  private readonly target: Pose = createPose();
  private blend = 1;
  private blendTime = 0.1;

  /**
   * @param key identity of the clip *instance* – a new key restarts the blend
   *            even for the same clip (e.g. two consecutive 2-steps).
   */
  play(clipId: string, key: string, mirror: boolean, blendTime = 0.1): void {
    if (key === this.key) return;
    this.key = key;
    this.clip = getClip(clipId);
    this.mirror = mirror;
    this.from.set(this.pose);
    this.blend = blendTime > 0 ? 0 : 1;
    this.blendTime = blendTime;
  }

  update(dt: number, phase: number): Pose {
    sampleClip(this.clip, phase, this.target, this.mirror);
    if (this.blend < 1) {
      if (this.blend === 0) unwrapToward(this.from, this.target);
      this.blend = Math.min(1, this.blend + dt / this.blendTime);
      const k = this.blend * this.blend * (3 - 2 * this.blend);
      lerpPose(this.pose, this.from, this.target, k);
    } else {
      this.pose.set(this.target);
    }
    return this.pose;
  }
}
