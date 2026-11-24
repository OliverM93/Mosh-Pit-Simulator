"""Text summary of a BVH take every N frames: hip height/speed, toe heights, facing yaw (metres, CMU scale)."""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..', 'tools', 'blender'))
from bvhreader import BVH  # noqa: E402

UNIT = 0.056  # CMU BVH unit → metres (hip height ≈ 17 units ≈ 0.95 m)

path = sys.argv[1]
every = int(sys.argv[2]) if len(sys.argv) > 2 else 10
b = BVH(path)
W = [b.frame_world(f) for f in range(b.frames)]
z0 = min(min(w['LeftToeBase'][0].z, w['RightToeBase'][0].z) for w in W)
print(f'{os.path.basename(path)}: {b.frames} frames, {b.frames * b.frame_time:.2f}s')
print(' frame  hipZ  hipV  toeL  toeR  yaw')
for f in range(0, b.frames, every):
    w = W[f]
    p = w['Hips'][0]
    q = W[max(0, f - 4)]['Hips'][0]
    v = math.hypot(p.x - q.x, p.y - q.y) * UNIT / (4 * b.frame_time) if f >= 4 else 0
    l, r = w['LeftUpLeg'][0], w['RightUpLeg'][0]
    yaw = math.degrees(math.atan2(-(l.y - r.y), l.x - r.x))
    print(f'{f:6d} {(p.z - z0) * UNIT:5.2f} {v:5.2f} {(w["LeftToeBase"][0].z - z0) * UNIT:5.2f} {(w["RightToeBase"][0].z - z0) * UNIT:5.2f} {yaw:5.0f}')
