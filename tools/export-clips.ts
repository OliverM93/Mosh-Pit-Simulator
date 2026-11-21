/**
 * Samples the hand-keyed clips (src/animation/clips.ts) to JSON so the Blender
 * build can retarget them onto the MakeHuman skeleton:
 *   npx rolldown tools/export-clips.ts --format esm --file .cache/export-clips.mjs && node .cache/export-clips.mjs
 */
import { writeFileSync } from 'node:fs';
import { CLIPS, sampleClip } from '../src/animation/clips';
import { createPose, JOINTS, ROOT } from '../src/animation/pose';

const SAMPLES_PER_CLIP = 31;
const out: Record<string, { loop: boolean; frames: number[][] }> = {};
for (const [id, clip] of CLIPS) {
  const frames: number[][] = [];
  for (let i = 0; i < SAMPLES_PER_CLIP; i++) {
    const p = sampleClip(clip, i / (SAMPLES_PER_CLIP - 1), createPose());
    frames.push(Array.from(p, (v) => Math.round(v * 1e4) / 1e4));
  }
  out[id] = { loop: clip.loop, frames };
}
writeFileSync('tools/blender/keyframe_clips.json', JSON.stringify({ root: ROOT, joints: JOINTS, clips: out }));
console.log(`exported ${CLIPS.size} clips`);
