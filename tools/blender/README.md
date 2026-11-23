# Character build (Blender, headless)

Builds `public/models/*.glb` from CC0 / free sources. Runs without the Blender GUI via the `bpy` Python module.

## Sources (downloaded into `.cache/`, git-ignored)

| Source | License | What we use |
| --- | --- | --- |
| [MakeHuman](https://github.com/makehumancommunity/makehuman) `makehuman/data` | CC0 1.0 | base mesh, morph targets, default skeleton + weights, eyes |
| [CMU Motion Capture (BVH by B. Hahne)](https://github.com/una-dinosauria/cmu-mocap) | "free for research and commercial use" | spin kick, cartwheel, … |

```bash
mkdir -p .cache && cd .cache
git clone --depth 1 --filter=blob:none --sparse https://github.com/makehumancommunity/makehuman.git mh
(cd mh && git sparse-checkout set makehuman/data/3dobjs makehuman/data/rigs makehuman/data/eyes makehuman/data/targets)
git clone --depth 1 --filter=blob:none --no-checkout https://github.com/una-dinosauria/cmu-mocap.git cmu
(cd cmu && git checkout HEAD -- data/002/02_01.bvh data/009/09_01.bvh data/013/13_39.bvh data/079/79_69.bvh data/082/82_08.bvh data/087/87_01.bvh data/088/88_06.bvh data/090/90_02.bvh data/090/90_05.bvh data/090/90_16.bvh data/090/90_28.bvh)
```

## Build

```bash
python3.13 -m venv .cache/blender-venv && .cache/blender-venv/bin/pip install bpy pillow
# Skeleton + all clips (shared by every character)
.cache/blender-venv/bin/python tools/blender/build_characters.py --anims-only \
  --mh .cache/mh/makehuman/data --cmu .cache/cmu/data --keyclips tools/blender/keyframe_clips.json \
  --bandai .cache/bandai/dataset/Bandai-Namco-Research-Motiondataset-1/data \
  --out public/models/anims.glb
# One file per variant (player, c1 … c8, see variants.py)
for v in player c1 c2 c3 c4 c5 c6 c7 c8; do
  .cache/blender-venv/bin/python tools/blender/build_characters.py \
    --mh .cache/mh/makehuman/data --variant $v --out public/models/char_$v.glb
done
```

`keyframe_clips.json` comes from the old box-rig clips: `npx rolldown tools/export-clips.ts --format esm
--file .cache/export-clips.mjs --platform node && node .cache/export-clips.mjs`.

Optional: `--preview out.png` (Cycles still), `--anim-preview sheet.png` (frames of every clip), `MOSH_DEBUG=1`,
`MOSH_CLIPS=idle,walk` (only these mocap clips), `MOSH_POSE=1` (print key joint positions per clip).
Check in the browser: `npm run dev` → `http://localhost:5173/viewer.html?model=player&clip=spinkick`.

Bandai Namco dataset (CC BY-NC 4.0, non-commercial):

```bash
git clone --depth 1 --filter=blob:none --no-checkout https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset.git .cache/bandai
(cd .cache/bandai && git checkout HEAD -- dataset/Bandai-Namco-Research-Motiondataset-1/data)
```

Video mocap (2-step, D-031) – only needed to re-extract landmarks from a new reference video:

```bash
python3.12 -m venv .cache/mp-venv && .cache/mp-venv/bin/pip install "mediapipe==0.10.14" opencv-python-headless
.cache/mp-venv/bin/python tools/blender/video/pose_video.py clip.mp4 pose.json overlay_dir/
```

Then reduce `pose.json` to `tools/blender/video/<move>_pose.json` (world + image landmarks) and add it to
`VIDEO_CLIPS` in `build_characters.py` (spread factors per clip). `MOSH_VDBG=1` prints video vs. figure foot gaps.

## Files

- `mh.py` – MakeHuman base mesh, targets, skeleton (reduced to 38 core bones), weights
- `build_characters.py` – body shaping, clothes from the body (tee, baggy pants, sneakers, cap), rig, export
- `bvhreader.py` – BVH parser + forward kinematics
- `retarget.py` – BVH → game skeleton (CMU: T-pose alignment; Bandai: calibration frame), facing, yaw drift,
  floor clearance, loop search/blending, pose matching into the stance
- `authoring.py` – IK-authored moves on the stance (arm swing, windmill)
- `videomocap.py` – MediaPipe landmarks → skeleton (2-step), cycle search, split into alternating halves
