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
(cd cmu && git checkout HEAD -- data/088/88_06.bvh data/090/90_02.bvh)
```

## Build

```bash
python3.13 -m venv .cache/blender-venv && .cache/blender-venv/bin/pip install bpy pillow
.cache/blender-venv/bin/python tools/blender/build_characters.py \
  --mh .cache/mh/makehuman/data --cmu .cache/cmu/data --out public/models/proto.glb
```

Optional: `--preview out.png` (Cycles still), `--anim-preview sheet.png` (frames of every clip), `MOSH_DEBUG=1`.
Check in the browser: `npm run dev` → `http://localhost:5173/viewer.html?model=proto&clip=spinkick`.

## Files

- `mh.py` – MakeHuman base mesh, targets, skeleton (reduced to 38 core bones), weights
- `build_characters.py` – body shaping, clothes from the body (tee, baggy pants, sneakers, cap), rig, export
- `bvhreader.py` – BVH parser + forward kinematics
- `retarget.py` – CMU BVH → game skeleton (T-pose/A-pose alignment, facing, yaw-drift removal, in-place)
