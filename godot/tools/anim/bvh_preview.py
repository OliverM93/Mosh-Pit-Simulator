"""
Contact sheet for choosing clip ranges in a BVH take: stick figures (front + side view) every N frames with
frame numbers, plus a plot of foot heights and horizontal hip speed. Needs `mathutils` (Blender venv).

    python bvh_preview.py take.bvh out.png [--start 0 --end -1 --every 15]
"""
import argparse
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', 'tools', 'blender'))
from bvhreader import BVH  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

BONES = [('Hips', 'LowerBack'), ('LowerBack', 'Spine'), ('Spine', 'Spine1'), ('Spine1', 'Neck'), ('Neck', 'Head'),
         ('Spine1', 'LeftShoulder'), ('LeftShoulder', 'LeftArm'), ('LeftArm', 'LeftForeArm'), ('LeftForeArm', 'LeftHand'),
         ('Spine1', 'RightShoulder'), ('RightShoulder', 'RightArm'), ('RightArm', 'RightForeArm'), ('RightForeArm', 'RightHand'),
         ('Hips', 'LHipJoint'), ('LHipJoint', 'LeftUpLeg'), ('LeftUpLeg', 'LeftLeg'), ('LeftLeg', 'LeftFoot'), ('LeftFoot', 'LeftToeBase'),
         ('Hips', 'RHipJoint'), ('RHipJoint', 'RightUpLeg'), ('RightUpLeg', 'RightLeg'), ('RightLeg', 'RightFoot'), ('RightFoot', 'RightToeBase')]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('bvh')
    ap.add_argument('out')
    ap.add_argument('--start', type=int, default=0)
    ap.add_argument('--end', type=int, default=-1)
    ap.add_argument('--every', type=int, default=15)
    a = ap.parse_args()
    b = BVH(a.bvh)
    end = b.frames - 1 if a.end < 0 else min(a.end, b.frames - 1)
    frames = list(range(a.start, end + 1, a.every))
    pos = {f: {n: h for n, (h, _r) in b.frame_world(f).items()} for f in range(a.start, end + 1)}
    allp = [p for f in pos.values() for p in f.values()]
    zmin = min(p.z for p in allp)
    zmax = max(p.z for p in allp)
    scale = 150 / max(1e-6, zmax - zmin)
    cols = min(12, len(frames))
    rows = math.ceil(len(frames) / cols)
    cw, ch = 110, 190
    img = Image.new('RGB', (cols * cw, rows * ch * 2 + 160), (20, 20, 24))
    d = ImageDraw.Draw(img)
    for i, f in enumerate(frames):
        p = pos[f]
        hip = p['Hips']
        for view in (0, 1):
            ox = (i % cols) * cw + cw // 2
            oy = (i // cols) * ch * 2 + view * ch + ch - 15
            for a_, b_ in BONES:
                if a_ not in p or b_ not in p:
                    continue
                pa, pb = p[a_], p[b_]
                ax = (pa.x - hip.x) if view == 0 else (pa.y - hip.y)
                bx = (pb.x - hip.x) if view == 0 else (pb.y - hip.y)
                col = (255, 90, 90) if 'Left' in b_ or 'LHip' in b_ else (90, 160, 255) if 'Right' in b_ or 'RHip' in b_ else (230, 230, 230)
                d.line([(ox + ax * scale, oy - (pa.z - zmin) * scale), (ox + bx * scale, oy - (pb.z - zmin) * scale)], fill=col, width=2)
            d.line([(ox - 45, oy), (ox + 45, oy)], fill=(70, 70, 70))
            d.text((ox - 50, oy - ch + 18), f'{f} {"front" if view == 0 else "side"}', fill=(255, 255, 0))
    # Plot: foot heights (red = left, blue = right) and hip speed (green) over the whole range.
    py0 = rows * ch * 2 + 150
    n = end - a.start
    w = cols * cw
    fl = [pos[f]['LeftToeBase'].z - zmin for f in range(a.start, end + 1)]
    fr = [pos[f]['RightToeBase'].z - zmin for f in range(a.start, end + 1)]
    sp = [0.0] + [math.hypot(pos[f]['Hips'].x - pos[f - 1]['Hips'].x, pos[f]['Hips'].y - pos[f - 1]['Hips'].y) / b.frame_time
                  for f in range(a.start + 1, end + 1)]
    for series, col, k in ((fl, (255, 90, 90), scale), (fr, (90, 160, 255), scale), (sp, (90, 255, 120), 4)):
        pts = [(i * w / max(1, n), py0 - min(140, v * k)) for i, v in enumerate(series)]
        d.line(pts, fill=col, width=1)
    for f in range(a.start, end + 1, 60):
        x = (f - a.start) * w / max(1, n)
        d.line([(x, py0), (x, py0 - 140)], fill=(60, 60, 60))
        d.text((x + 2, py0 - 150), str(f), fill=(200, 200, 200))
    img.save(a.out)
    print(a.out, f'{b.frames} frames @ {1 / b.frame_time:.0f} fps; hip speed max {max(sp):.1f} (units/s)')


main()
