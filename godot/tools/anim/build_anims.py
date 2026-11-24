"""
Animation build for the Godot project (D-033): free CMU motion capture retargeted onto the MakeHuman game skeleton,
**in the captured tempo** (keys every 1/60 s, scene at 60 fps – fixes the 30→24 fps slow-down of the Three.js
pipeline), **without pose matching** (anticipation and follow-through stay) and **with root motion** (horizontal hip
travel stays in the clip; the game decides per clip whether to use it or strip it).

Writes `anims.glb` (skeleton + actions) and `anims_meta.json`: per clip duration, loop flag, travel speed, and
phase markers measured from the motion itself – foot contacts (per foot), airborne intervals, plus named markers
from the table below (hit, recover, …) given in source frames.

Run with the bpy venv (see tools/blender/README.md; MakeHuman + CMU data in .cache/):

    .cache/blender-venv/bin/python godot/tools/anim/build_anims.py --mh .cache/mh/makehuman/data \
        --cmu .cache/cmu/data --out godot/assets/animations/anims.glb

The shared modules in tools/blender/ are imported read-only (the Three.js pipeline stays unchanged).
"""
import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', '..', 'tools', 'blender'))
from mh import BaseMesh, Skeleton as MhSkeleton  # noqa: E402
from build_characters import VARIANTS, build_armature, clear_scene  # noqa: E402
from bvhreader import BVH  # noqa: E402
from retarget import find_cycle, retarget, src_hip_height, SOURCES  # noqa: E402

FPS = 60
STEP = 2  # source frames per key at 120 fps → 60 Hz

# name: (take, start, end, options). Frames are source frames (120 fps).
# options: loop=(min_period, max_period) → best cycle inside [start, end], blended into a seamless loop;
#          mirror → also build '<name>_m'; markers={'name': source_frame}; keep_drift → keep the net turn.
CLIPS = {
    # Locomotion (loops; the game strips their travel and drives speed itself).
    'idle': ('082/82_08', 100, 420, {'loop': (150, 300)}),
    'walk': ('002/02_01', 20, 340, {'loop': (110, 150)}),
    'run': ('009/09_01', 10, 148, {'loop': (70, 95)}),
    # Footwork: Charleston kick-steps (93_03) as the base of the 2-step – a full left/right cycle.
    'two_step': ('093/93_03', 90, 430, {'loop': (140, 185)}),
    # Kicks / acrobatics (one-shots with root motion).
    'spinkick': ('088/88_06', 37, 125, {'mirror': True}),
    'tornado_kick': ('087/87_01', 188, 300, {'mirror': True}),
    'butterfly_kick': ('090/90_05', 219, 345, {'mirror': True}),
    'cartwheel': ('090/90_02', 364, 471, {'mirror': True}),
    'jump': ('118/118_10', 140, 285, {}),
    'pogo': ('013/13_29', 0, 470, {'loop': (55, 80)}),
    # Contact: a fast straight arm thrust from boxing (13_17, right hand peaks at frame 232) as the shove,
    # A lurching into B (22_12) as forward stumble, the small stumble when being hit.
    'shove': ('013/13_17', 198, 290, {'mirror': True, 'aim': True}),
    'stumble': ('091/91_59', 40, 230, {'mirror': True}),
    'stumble_fwd': ('022/22_12', 14, 150, {}),
    'dodge_back': ('076/76_11', 96, 216, {}),
    'fall_front': ('090/90_16', 330, 500, {'max_rise': 0.05}),
    'getup_front': ('140/140_01', 200, 600, {}),
    # Crowd.
    'cheer': ('079/79_69', 110, 300, {}),
}


def build_rig(mh_dir):
    clear_scene()
    spec = VARIANTS['player']
    mesh = BaseMesh(mh_dir)
    for path, w in spec['body']:
        mesh.apply_target(path, w)
    floor_y = min(mesh.verts[i][1] for i in mesh.group_verts('body'))
    for v in mesh.verts:
        v[1] -= floor_y
    return build_armature(MhSkeleton(mh_dir), mesh)


def make_clip(rig, cmu, name, take, start, end, opt, mirror):
    path = os.path.join(cmu, take + '.bvh')
    b = BVH(path)
    loop = opt.get('loop')
    speed = 0.0
    if loop:
        s, e = find_cycle(b, start, end, loop[0], loop[1], SOURCES['cmu']['facing'])
        scale = rig.data.bones['root'].head_local.z / src_hip_height(b)
        w0, w1 = b.frame_world(s)['Hips'][0], b.frame_world(e)['Hips'][0]
        speed = math.hypot(w1.x - w0.x, w1.y - w0.y) * scale / ((e - s) * b.frame_time)
        start, end = s, e
    retarget(rig, path, start, end, name, step=STEP, in_place=bool(loop), mirror=mirror,
             keep_yaw_drift=opt.get('keep_drift', False), max_rise=opt.get('max_rise'), loop=0.15 if loop else None)
    markers = {k: (f - start) * b.frame_time for k, f in opt.get('markers', {}).items()}
    return {'take': take, 'frames': [start, end], 'loop': bool(loop), 'speed': round(speed, 3), 'markers': markers}


def aim_of(rig, action):
    """Strike direction: hips → hand at the hand's farthest horizontal reach (time, yaw in Godot convention:
    0 = model forward +Z, atan2(x, z)). Used to turn bladed captures (boxing) towards the target."""
    rig.animation_data.action = action
    pb = rig.pose.bones
    best = (0.0, 0, 0.0)
    for k in range(1, int(action.frame_range[1]) + 1):
        bpy.context.scene.frame_set(k)
        hip = rig.matrix_world @ pb['root'].head
        for s in 'LR':
            d = rig.matrix_world @ pb[f'wrist.{s}'].head - hip
            reach = math.hypot(d.x, d.y)
            if reach > best[0]:
                best = (reach, k, math.atan2(d.x, -d.y))  # Blender -Y forward → Godot +Z
    rig.animation_data.action = None
    return {'time': round((best[1] - 1) / FPS, 3), 'yaw': round(best[2], 3), 'reach': round(best[0], 3)}


def measure(rig, action, loop):
    """Foot contacts and airborne intervals from the baked motion (world positions per key)."""
    rig.animation_data.action = action
    n = int(action.frame_range[1])
    pb = rig.pose.bones
    sole = {s: rig.data.bones[f'foot.{s}'].head_local.z for s in 'LR'}
    feet = []
    for k in range(1, n + 1):
        bpy.context.scene.frame_set(k)
        feet.append({s: (rig.matrix_world @ pb[f'foot.{s}'].head, rig.matrix_world @ pb[f'toe1-1.{s}'].tail) for s in 'LR'})
    dt = 1 / FPS
    contacts = {}
    for s in 'LR':
        flags = []
        for k in range(n):
            ankle, toe = feet[k][s]
            prev = feet[max(0, k - 1)][s][0]
            nxt = feet[min(n - 1, k + 1)][s][0]
            v = (Vector((nxt.x - prev.x, nxt.y - prev.y, 0)).length / (2 * dt)) if n > 1 else 0
            low = ankle.z < sole[s] + 0.05 or toe.z < 0.04
            # Loops are in place: a planted foot slides backwards at the travel speed, so only height counts.
            flags.append(low and (loop or v < 0.6))
        contacts[s] = intervals(flags, dt)
    if os.environ.get('MOSH_ADBG'):
        for k in range(0, n, 4):
            print('   ', k, ' '.join(f'{s}:{feet[k][s][0].z:.3f}/{feet[k][s][1].z:.3f}' for s in 'LR'), 'sole', {s: round(sole[s], 3) for s in 'LR'})
    air = intervals([not any(feet[k][s][0].z < sole[s] + 0.08 or feet[k][s][1].z < 0.06 for s in 'LR') for k in range(n)], dt)
    rig.animation_data.action = None
    return n, contacts, [a for a in air if a[1] - a[0] >= 0.08]


def intervals(flags, dt):
    out, start = [], None
    for k, f in enumerate(flags + [False]):
        if f and start is None:
            start = k
        elif not f and start is not None:
            out.append([round(start * dt, 3), round((k - 1) * dt, 3)])
            start = None
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--mh', required=True)
    ap.add_argument('--cmu', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--only', default='')
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])
    rig = build_rig(args.mh)
    bpy.context.scene.render.fps = FPS
    only = set(args.only.split(',')) if args.only else None
    meta = {}
    for name, (take, start, end, opt) in CLIPS.items():
        if only and name not in only:
            continue
        for m in ([False, True] if opt.get('mirror') else [False]):
            cname = name + ('_m' if m else '')
            info = make_clip(rig, args.cmu, cname, take, start, end, opt, m)
            n, contacts, air = measure(rig, bpy.data.actions[cname], info['loop'])
            info.update(duration=round((n - 1) / FPS, 3), keys=n, contacts=contacts, air=air)
            if opt.get('aim'):
                info['aim'] = aim_of(rig, bpy.data.actions[cname])
            meta[cname] = info
            print(f'{cname:16s} {info["duration"]:5.2f}s loop={info["loop"]} speed={info["speed"]:.2f} air={air} aim={info.get("aim")} '
                  f'L={contacts["L"]} R={contacts["R"]}')
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    rig.select_set(True)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=args.out, export_format='GLB', export_skins=True, export_animations=True,
                              export_animation_mode='ACTIONS', export_force_sampling=True, export_yup=True,
                              export_optimize_animation_size=True, use_selection=True)
    with open(os.path.splitext(args.out)[0] + '_meta.json', 'w') as f:
        json.dump({'fps': FPS, 'source': 'CMU Graphics Lab Motion Capture Database (free for all uses)',
                   'clips': meta}, f, indent=1)
    print('exported', args.out, len(meta), 'clips')


main()
