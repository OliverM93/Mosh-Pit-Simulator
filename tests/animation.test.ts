import { describe, expect, it } from 'vitest';
import { Animator } from '../src/animation/Animator';
import { CLIPS, getClip, sampleClip } from '../src/animation/clips';
import { createPose, JOINT_INDEX, mirrorPose, POSE_SIZE } from '../src/animation/pose';
import { MOVES } from '../src/data/moves';

describe('animation clips', () => {
  it('every move has a clip', () => {
    for (const m of MOVES) expect(CLIPS.has(m.clip), m.clip).toBe(true);
  });

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

  it('cross-fades between clips', () => {
    const anim = new Animator();
    anim.play('idle', 'a', false, 0);
    anim.update(0.016, 0.5);
    anim.play('hop', 'b', false, 0.1);
    const mid = anim.update(0.05, 0.45)[JOINT_INDEX.kneeL]!;
    const target = sampleClip(getClip('hop'), 0.45, createPose())[JOINT_INDEX.kneeL]!;
    expect(mid).not.toBeCloseTo(target, 2);
    const end = anim.update(0.2, 0.45)[JOINT_INDEX.kneeL]!;
    expect(end).toBeCloseTo(target, 5);
  });
});
