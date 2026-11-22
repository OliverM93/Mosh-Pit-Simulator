import { describe, expect, it } from 'vitest';
import { CLIPS, getClip, sampleClip } from '../src/animation/clips';
import { createPose, mirrorPose, POSE_SIZE } from '../src/animation/pose';

describe('keyframe clips (source for tools/blender)', () => {
  it('samples finite poses for all clips', () => {
    const out = createPose();
    for (const clip of CLIPS.values()) {
      for (const t of [0, 0.13, 0.5, 0.87, 1]) {
        sampleClip(clip, t, out);
        for (let i = 0; i < POSE_SIZE; i++) expect(Number.isFinite(out[i])).toBe(true);
      }
    }
  });

  it('2-step ends in the mirrored start pose (seamless alternation)', () => {
    const a = sampleClip(getClip('two_step'), 1, createPose());
    const b = mirrorPose(sampleClip(getClip('two_step'), 0, createPose()));
    for (let i = 0; i < POSE_SIZE; i++) expect(a[i]).toBeCloseTo(b[i]!, 5);
  });
});
