"""
Headless Blender build of the MOSH PIT characters (run with the `bpy` module):

    python tools/blender/build_characters.py --mh <makehuman/data> --out public/models/characters.glb

Builds from the CC0 MakeHuman base mesh: shaped body (morph targets), eyes,
clothes modelled from the body (tee, baggy pants, sneakers, cap, buzz hair),
a 38-bone game skeleton with weights, procedural textures baked with Cycles
(incl. ambient occlusion), and exports glTF. Animations are added by
retarget_mocap.py.
"""
import argparse
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector, kdtree

sys.path.insert(0, os.path.dirname(__file__))
from mh import BaseMesh, Skeleton, to_blender  # noqa: E402
from retarget import retarget, retarget_keyframes  # noqa: E402
from authoring import AUTHORED, author  # noqa: E402
import textures as tx  # noqa: E402
from variants import VARIANTS  # noqa: E402

# ---------------------------------------------------------------- body presets

BODY = {
    # (target path, weight)
    'brute': [
        ('macrodetails/universal-male-young-averagemuscle-averageweight.target', 0.35),
        ('macrodetails/universal-male-young-maxmuscle-averageweight.target', 0.45),
        ('macrodetails/universal-male-young-averagemuscle-maxweight.target', 0.2),
        ('macrodetails/caucasian-male-young.target', 1.0),
    ],
}


# Motion capture clips: (clip name, BVH file, first frame, last frame, mirrored copy "<name>_m")
STANCE_MATCH = {'match': ('stance', 0.18, 0.3)}
# Mocap clips: (name, file, start, end, mirrored, options). 'bn:' = Bandai Namco dataset-1 (CC BY-NC 4.0), else CMU.
# The stance must come first: moves blend their first/last frames into it so they chain without pops.
CLIPS = [
    ('stance', 'bn:dataset-1_kick_normal_001.bvh', 0, 44, False, {'cycle': (14, 40), 'loop': 0.3, 'register': 'stance'}),
    ('swagger', 'bn:dataset-1_walk_chimpira_001.bvh', 20, 165, False, {'cycle': (25, 48), 'loop': 0.2}),
    ('jog', 'bn:dataset-1_run_chimpira_001.bvh', 5, 69, False, {'cycle': (14, 30), 'loop': 0.2}),
    ('dash', 'bn:dataset-1_dash_chimpira_001.bvh', 5, 68, False, {'cycle': (14, 28), 'loop': 0.2}),
    ('high_kick', 'bn:dataset-1_kick_normal_001.bvh', 44, 92, True, STANCE_MATCH),
    ('idle', '082/82_08.bvh', 100, 400, False),
    ('walk', '002/02_01.bvh', 100, 232, False),
    ('run', '009/09_01.bvh', 40, 112, False),
    ('spinkick', '088/88_06.bvh', 37, 125, True, STANCE_MATCH),
    ('cartwheel', '090/90_02.bvh', 364, 471, True, STANCE_MATCH),
    ('tornado_kick', '087/87_01.bvh', 188, 300, True, STANCE_MATCH),
    ('butterfly_kick', '090/90_05.bvh', 219, 345, True, STANCE_MATCH),
    ('floorwork', '090/90_28.bvh', 340, 500, True),
    ('bail', '090/90_16.bvh', 330, 500, False, {'max_rise': 0.05}),
    ('cheer', '079/79_69.bvh', 110, 300, False),
    ('hop', '013/13_39.bvh', 130, 230, False),
]

# Hand-keyed clips (src/animation/clips.ts → keyframe_clips.json): (clip id, mirrored copy)
KEY_CLIPS = [
    ('crowd_push', False), ('forward_arms', False), ('side_arms', False),
    ('pick_up_change', False), ('bob', False), ('headbang', False), ('fist_pump', False), ('arms_crossed', False),
    ('jump_cheer', False), ('ooh', False), ('shove', False), ('stumble', False), ('surf', False),
    ('band_vocals', False), ('band_vocals_heavy', False), ('band_guitar', False), ('band_guitar_heavy', False),
    ('band_drums', False),
]


BANDAI_CAL = ('dataset-1_bow_normal_001.bvh', 0)  # neutral standing frame used to calibrate the Bandai skeleton


def clip_source(args, file):
    """BVH path and source options for a CLIPS entry ('bn:' = Bandai Namco take, else CMU)."""
    if file.startswith('bn:'):
        return os.path.join(args.bandai, file[3:]), {'source': 'bandai', 'cal': (os.path.join(args.bandai, BANDAI_CAL[0]), BANDAI_CAL[1])}
    return os.path.join(args.cmu, file), {}


def run_clip(rig, args, file, start, end, name, mirror, opt):
    path, src = clip_source(args, file)
    return retarget(rig, path, start, end, name, mirror=mirror, **src, **(opt[0] if opt else {}))


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_mesh(name, mesh_data, groups, positions):
    """Create a Blender mesh from base-mesh groups. Returns (object, original vertex index per new vertex)."""
    faces = [f for g in groups for f in mesh_data.faces[g]]
    used = sorted({i for vs, _ in faces for i in vs})
    remap = {old: new for new, old in enumerate(used)}
    me = bpy.data.meshes.new(name)
    me.from_pydata([to_blender(positions[i]) for i in used], [], [[remap[i] for i in vs] for vs, _ in faces])
    uv = me.uv_layers.new(name='UVMap')
    li = 0
    for _, uvs in faces:
        for t in uvs:
            uv.data[li].uv = mesh_data.uvs[t]
            li += 1
    me.validate()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob, used


def build_armature(sk, mesh):
    arm = bpy.data.armatures.new('Rig')
    ob = bpy.data.objects.new('Rig', arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    forward = Vector((0, -1, 0))  # Blender -Y = character front (+Z in MakeHuman / glTF)
    for name in Skeleton.CORE:
        b = sk.bones[name]
        eb = arm.edit_bones.new(name)
        eb.head = Vector(to_blender(sk.joint_pos(mesh, b['head'])))
        eb.tail = Vector(to_blender(sk.joint_pos(mesh, b['tail'])))
        if (eb.tail - eb.head).length < 1e-4:
            eb.tail = eb.head + Vector((0, 0, 0.02))
        eb.align_roll(forward)
    for name in Skeleton.CORE:
        p = sk.core_parent(name)
        if p:
            arm.edit_bones[name].parent = arm.edit_bones[p]
    bpy.ops.object.mode_set(mode='OBJECT')
    return ob


def skin(ob, rig, used, weights_by_bone, override=None):
    """Add vertex groups from MakeHuman weights (or a single bone) and an armature modifier."""
    index = {old: new for new, old in enumerate(used)}
    if override:
        vg = ob.vertex_groups.new(name=override)
        vg.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    else:
        for bone, lst in weights_by_bone.items():
            vg = ob.vertex_groups.new(name=bone)
            for i, w in lst:
                j = index.get(i)
                if j is not None and w > 0.001:
                    vg.add([j], w, 'ADD')
    mod = ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig
    ob.parent = rig


def cut_clothing(name, source, planes, keep_near, smooth=8, drop_arms=None):
    """Copy the source mesh, cut it with (point, normal) planes keeping the side opposite the normal,
    keep the connected piece nearest `keep_near`, smooth away anatomy, return a new object."""
    bm = bmesh.new()
    bm.from_mesh(source.data)
    for plane in planes:
        co, no = plane[0], plane[1]
        region = plane[2] if len(plane) > 2 else None  # optional predicate limiting the cut (e.g. one arm)
        verts = [v for v in bm.verts if region is None or region(v.co)]
        vs = set(verts)
        edges = [e for e in bm.edges if e.verts[0] in vs and e.verts[1] in vs]
        faces = [f for f in bm.faces if all(v in vs for v in f.verts)]
        bmesh.ops.bisect_plane(bm, geom=verts + edges + faces, plane_co=co, plane_no=no, clear_outer=True)
    if drop_arms:
        sh_l, sh_r, hip_z = drop_arms
        kill = [f for f in bm.faces if abs(f.calc_center_median().x) > abs(sh_l.x) * 0.8 and f.calc_center_median().z > hip_z]
        bmesh.ops.delete(bm, geom=kill, context='FACES')
    # Keep only the connected component closest to keep_near (drops hands/head islands).
    bm.verts.ensure_lookup_table()
    seen, best, best_d = set(), None, 1e9
    for v in bm.verts:
        if v.index in seen:
            continue
        comp, stack = [], [v]
        seen.add(v.index)
        while stack:
            x = stack.pop()
            comp.append(x)
            for e in x.link_edges:
                o = e.other_vert(x)
                if o.index not in seen:
                    seen.add(o.index)
                    stack.append(o)
        d = min((x.co - keep_near).length for x in comp)
        if len(comp) > 50 and d < best_d:
            best, best_d = comp, d
    keep = {x.index for x in best}
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in keep], context='VERTS')
    inner = [v for v in bm.verts if not v.is_boundary]
    for _ in range(smooth):
        bmesh.ops.smooth_vert(bm, verts=inner, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def transfer_weights(ob, source, source_used, weights_by_bone, rig):
    """Copy skin weights from the nearest vertex of the (rest-pose) source body."""
    kd = kdtree.KDTree(len(source.data.vertices))
    for v in source.data.vertices:
        kd.insert(v.co, v.index)
    kd.balance()
    per_src = {}
    index = {old: new for new, old in enumerate(source_used)}
    for bone, lst in weights_by_bone.items():
        for i, w in lst:
            j = index.get(i)
            if j is not None:
                per_src.setdefault(j, []).append((bone, w))
    groups = {}
    for v in ob.data.vertices:
        _, j, _ = kd.find(v.co)
        for bone, w in per_src.get(j, []):
            if bone not in groups:
                groups[bone] = ob.vertex_groups.new(name=bone)
            groups[bone].add([v.index], w, 'REPLACE')
    mod = ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig
    ob.parent = rig


def inflate(bm, amount):
    """Push every vertex along its normal – keeps cloth clear of the skin everywhere."""
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * amount


def radial_push(bm, center_fn, factor_fn):
    for v in bm.verts:
        c = center_fn(v.co)
        if c is None:
            continue
        d = v.co - c
        v.co = c + d * factor_fn(v.co)


def closest_on_segment(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-9, ab.length_squared)))
    return a + ab * t, t


def subset_mesh(name, mesh_data, group, positions, keep_vertex):
    """Faces of a base-mesh group whose vertices all satisfy keep_vertex(original_index)."""
    faces = [f for f in mesh_data.faces[group] if all(keep_vertex(i) for i in f[0])]
    tmp = '__subset__'
    mesh_data.faces[tmp] = faces
    ob, used = make_mesh(name, mesh_data, [tmp], positions)
    del mesh_data.faces[tmp]
    return ob, used


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--mh', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--preview', default='')
    ap.add_argument('--cmu', default='', help='cmu-mocap data dir (BVH)')
    ap.add_argument('--bandai', default='', help='Bandai-Namco-Research-Motiondataset-1/data dir (BVH, CC BY-NC 4.0)')
    ap.add_argument('--keyclips', default='', help='keyframe_clips.json exported from src/animation/clips.ts')
    ap.add_argument('--anim-preview', default='')
    ap.add_argument('--tex', type=int, default=1024, help='body texture size (0 = untextured)')
    ap.add_argument('--no-cap', action='store_true', help='(debug) drop the headwear')
    ap.add_argument('--variant', default='player', choices=sorted(VARIANTS))
    ap.add_argument('--anims-only', action='store_true', help='export skeleton + clips only (anims.glb)')
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])

    clear_scene()
    spec = VARIANTS[args.variant]
    mesh = BaseMesh(args.mh)
    for path, w in spec['body']:
        mesh.apply_target(path, w)
    # Stand on the floor: feet at z = 0.
    floor_y = min(mesh.verts[i][1] for i in mesh.group_verts('body'))
    for v in mesh.verts:
        v[1] -= floor_y
    sk = Skeleton(args.mh)
    weights, per_vert = sk.collapsed_weights()
    dom = lambda i: sk.dominant_bone(per_vert, i)  # noqa: E731
    P = mesh.verts

    rig = build_armature(sk, mesh)
    jp = lambda name: Vector(to_blender(sk.joint_pos(mesh, name)))  # noqa: E731

    if args.anims_only:
        export_anims(args, rig)
        return

    # Body without the feet (hidden inside the sneakers – avoids toes poking through).
    ankle_cut = jp('foot.L____head').z + 0.01
    feet = {'foot.L', 'foot.R', 'toe1-1.L', 'toe1-1.R'}
    body, body_used = subset_mesh('Body', mesh, 'body', P,
                                  lambda i: not (dom(i) in feet and to_blender(P[i])[2] < ankle_cut))
    skin(body, rig, body_used, weights)
    eyes, eyes_used = make_mesh('Eyes', mesh, ['helper-l-eye', 'helper-r-eye'], P)
    skin(eyes, rig, eyes_used, weights, override='head')

    # ---- Clothes are cut from a smoothed copy of the full body with planes → clean hems, collar, sleeves.
    hip_z = jp('upperleg01.L____head').z + 0.04
    neck = jp('neck01____head')
    sh_l, el_l = jp('upperarm01.L____head'), jp('lowerarm01.L____head')
    sh_r, el_r = jp('upperarm01.R____head'), jp('lowerarm01.R____head')
    waist_z = jp('spine05____head').z + 0.03
    ankle_z = jp('foot.L____head').z + 0.02
    full, full_used = make_mesh('__full', mesh, ['body'], P)

    shirt = cut_clothing('Shirt', full, [
        (Vector((0, 0, hip_z - 0.07)), Vector((0, 0, -1))),                        # hem
        (neck + Vector((0, 0.0, -0.005)), Vector((0, -0.55, 1)).normalized()),    # crew neck, lower in front
    ] + sleeve_planes(spec['shirt']['sleeves'], jp), keep_near=neck + Vector((0, 0, -0.2)), smooth=4)
    long_sleeves = spec['shirt']['sleeves'] == 'long'
    wr_l, wr_r = jp('wrist.L____head'), jp('wrist.R____head')
    spine_axis = (Vector((0, neck.y, hip_z - 0.1)), neck)

    def shirt_center(co):
        best = None
        arms = [(sh_l, wr_l), (sh_r, wr_r)] if long_sleeves else [(sh_l, el_l), (sh_r, el_r)]
        for a, b in [spine_axis] + arms:
            c, _ = closest_on_segment(co, a, b)
            if best is None or (co - c).length < (co - best).length:
                best = c
        return best

    bm = bmesh.new()
    bm.from_mesh(shirt.data)
    radial_push(bm, shirt_center, lambda co: spec['shirt']['fit'])
    inflate(bm, 0.009)
    bm.to_mesh(shirt.data)
    bm.free()
    transfer_weights(shirt, full, full_used, weights, rig)

    legs = [(jp('upperleg01.L____head'), jp('foot.L____head')), (jp('upperleg01.R____head'), jp('foot.R____head'))]
    cut = spec['pants']['cut']
    hem_z = jp('lowerleg01.L____head').z - 0.07 if cut == 'shorts' else ankle_z + 0.025
    pants = cut_clothing('Pants', full, [
        (Vector((0, 0, waist_z)), Vector((0, 0, 1))),                               # waistband
        (Vector((0, 0, hem_z)), Vector((0, 0, -1))),                                # hems
    ], keep_near=Vector((0, legs[0][0].y, hip_z - 0.1)), smooth=1, drop_arms=(sh_l, sh_r, hip_z))
    bm = bmesh.new()
    bm.from_mesh(pants.data)
    knee_z = jp('lowerleg01.L____head').z
    bottom = ankle_z
    for v in bm.verts:
        if v.co.z > hip_z - 0.02:
            c = Vector((0, legs[0][0].y, v.co.z))
            v.co = c + (v.co - c) * 1.06
            continue
        cands = [closest_on_segment(v.co, a, b)[0] for a, b in legs]
        c = min(cands, key=lambda q: (v.co - q).length)
        d = v.co - c
        t = max(0.0, min(1.0, (hip_z - v.co.z) / (hip_z - bottom)))
        target = 0.0 if cut == 'slim' else (0.088 + 0.012 * t + (0.006 if v.co.z < knee_z else 0))
        loose = 1.1 if cut == 'slim' else 1.15
        v.co = c + d.normalized() * max(d.length * loose, target * (0.85 + 0.15 * abs(d.normalized().x)))
    inflate(bm, 0.006)
    bm.to_mesh(pants.data)
    bm.free()
    transfer_weights(pants, full, full_used, weights, rig)
    bpy.data.objects.remove(full)

    # ---- Sneakers: convex hull of each foot (no toes), smoothed, flat chunky sole.
    foot_bones = {'foot.L', 'foot.R', 'toe1-1.L', 'toe1-1.R'}
    shoe_objs = []
    for side, bone in (('L', 'foot.L'), ('R', 'foot.R')):
        ids = [i for i in mesh.group_verts('body') if dom(i) in foot_bones and (to_blender(P[i])[0] > 0) == (side == 'L')]
        pts = [Vector(to_blender(P[i])) for i in ids]
        bm = bmesh.new()
        for p in pts:
            bm.verts.new(p)
        bmesh.ops.convex_hull(bm, input=bm.verts[:])
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True)
        for _ in range(4):
            bmesh.ops.smooth_vert(bm, verts=bm.verts[:], factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        c = sum((v.co for v in bm.verts), Vector()) / len(bm.verts)
        floor = min(v.co.z for v in bm.verts)
        for v in bm.verts:
            d = v.co - c
            v.co = c + Vector((d.x * 1.3, d.y * 1.12, d.z * 1.25))
            if v.co.z < floor + 0.03:
                v.co.z = floor - 0.01  # flat thick sole
        me = bpy.data.meshes.new('Shoe' + side)
        bm.to_mesh(me)
        bm.free()
        for poly in me.polygons:
            poly.use_smooth = True
        ob = bpy.data.objects.new('Shoe' + side, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.vertex_groups.new(name=bone).add(list(range(len(me.vertices))), 1.0, 'REPLACE')
        mod = ob.modifiers.new('Armature', 'ARMATURE')
        mod.object = rig
        ob.parent = rig
        shoe_objs.append(ob)
    for ob in shoe_objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = shoe_objs[0]
    bpy.ops.object.join()
    shoes = shoe_objs[0]
    shoes.name = 'Shoes'

    cap = build_headwear(spec['head'], mesh, P, dom, jp, rig)

    if cap and args.no_cap:
        bpy.data.objects.remove(cap)
        cap = None
    objs = [body, eyes, shirt, pants, shoes] + ([cap] if cap else [])
    hide_covered(body, [shirt, pants, shoes])
    if spec['lod'] < 1:
        decimate(body, spec['lod'])
        decimate(shoes, 0.5)  # closed shapes: no hems to fray  # clothes keep their clean hems
    if args.tex:
        lm = landmarks(mesh, sk, P, jp)
        texture_all(spec['tex'] if args.tex == 1024 else args.tex, lm, spec, body, eyes, shirt, pants, shoes, cap)
    else:
        assign_materials(objs)

    clips = []
    if args.cmu:
        only = os.environ.get('MOSH_CLIPS', '').split(',') if os.environ.get('MOSH_CLIPS') else None
        for name, file, start, end, mirrored, *opt in CLIPS:
            if only and name not in only:
                continue
            for m in ([False, True] if mirrored else [False]):
                act, n, dt = run_clip(rig, args, file, start, end, name + ('_m' if m else ''), m, opt)
                clips.append((act, n))
            print(f'clip {name}: {n} keys, {n * dt:.2f}s')
    if args.cmu:
        for name, dur, spec, mirrored in AUTHORED:
            if only and name not in only:
                continue
            for m in ([False, True] if mirrored else [False]):
                n = author(rig, name + ('_m' if m else ''), dur, spec, mirror=m)
                clips.append((bpy.data.actions[name + ('_m' if m else '')], n))
    if args.keyclips:
        import json
        with open(args.keyclips) as f:
            data = json.load(f)
        for cid, mirrored in KEY_CLIPS:
            for m in ([False, True] if mirrored else [False]):
                act, n = retarget_keyframes(rig, data, cid, cid + ('_m' if m else ''), mirror=m, settle=cid != 'surf')
                clips.append((act, n))
        print(f'keyframe clips: {len(KEY_CLIPS)}')
    if args.anim_preview and clips:
        render_anim_sheet(args.anim_preview, rig, objs, clips)

    if os.environ.get('MOSH_DEBUG'):
        debug_stats(body, pants, shirt)
    if os.environ.get('MOSH_POSE'):
        dump_poses(rig, clips)

    # ---- Preview
    if args.preview:
        render_preview(args.preview, objs)

    for o in objs:
        o.select_set(True)
    rig.select_set(True)
    bpy.ops.export_scene.gltf(filepath=args.out, export_format='GLB', export_apply=False, export_skins=True,
                              export_animations=bool(clips), export_animation_mode='ACTIONS',
                              export_force_sampling=True, export_frame_step=1, export_yup=True,
                              use_selection=True, export_image_format='JPEG', export_jpeg_quality=88)
    print('exported', args.out)


def dump_poses(rig, clips):
    """Print world positions of key joints at the first key of each clip (retarget debugging)."""
    for track in rig.animation_data.nla_tracks:
        track.mute = True
    for act, n in clips:
        rig.animation_data.action = act
        bpy.context.scene.frame_set(1)
        pos = {b: tuple(round(c, 2) for c in rig.matrix_world @ rig.pose.bones[b].head)
               for b in ('root', 'spine05', 'spine01', 'neck01', 'head', 'foot.L', 'foot.R', 'wrist.L')}
        print('POSE', act.name, pos)
    rig.animation_data.action = None


def landmarks(mesh, sk, P, jp):
    def mean(ids):
        return Vector(tuple(sum(to_blender(P[i])[k] for i in ids) / len(ids) for k in range(3)))
    eye_l = mean(mesh.group_verts('helper-l-eye'))
    eye_r = mean(mesh.group_verts('helper-r-eye'))
    mouth = mean(mesh.group_verts('helper-upper-teeth') + mesh.group_verts('helper-lower-teeth'))
    eyes_c = (eye_l + eye_r) / 2
    head_c = eyes_c + Vector((0, 0.075, 0))
    face = [Vector(to_blender(P[i])) for i in mesh.group_verts('body')]
    face = [v for v in face if abs(v.x) < 0.012 and v.z > mouth.z - 0.08 and v.z < eyes_c.z + 0.02]
    nose = min((v for v in face if v.z > mouth.z + 0.01), key=lambda v: v.y)
    mouth_front = min((v for v in face if abs(v.z - mouth.z) < 0.012), key=lambda v: v.y)
    mouth = Vector((0, mouth_front.y, mouth.z))
    chin = min((v for v in face if v.y < mouth.y + 0.03), key=lambda v: v.z)
    t = lambda v: tuple(v)  # noqa: E731
    return {
        'eye_l': t(eye_l), 'eye_r': t(eye_r), 'mouth': t(mouth), 'nose': t(nose), 'chin': t(chin),
        'head_c': t(head_c),
        'cheek_l': t(eye_l + Vector((0.012, 0, -0.032))), 'cheek_r': t(eye_r + Vector((-0.012, 0, -0.032))),
        'ear_l': t(Vector((eyes_c.x + 0.075, head_c.y + 0.005, eyes_c.z - 0.012))),
        'ear_r': t(Vector((eyes_c.x - 0.075, head_c.y + 0.005, eyes_c.z - 0.012))),
        'chest_z': jp('spine01____head').z - 0.03,
        'knee_z': jp('lowerleg01.L____head').z,
        'ankle_z': jp('foot.L____head').z,
    }


def smart_unwrap(ob):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.01)
    bpy.ops.object.mode_set(mode='OBJECT')


def texture_all(size, lm, spec, body, eyes, shirt, pants, shoes, cap):
    for ob in (eyes, shirt, pants, shoes) + ((cap,) if cap else ()):
        smart_unwrap(ob)
    look = {'skin': spec['skin'], 'hair': spec['hair_color'], 'beard': spec['beard'], 'buzz': spec['hair'] == 'buzz'}
    pos, nrm, ao, valid = tx.bake_maps(body, size)
    tx.final_material(body, tx.paint_body(pos, nrm, ao, valid, lm, look), 0.55)
    pos, nrm, ao, valid = tx.bake_maps(eyes, 128, 8)
    tx.final_material(eyes, tx.paint_eyes(pos, valid, lm), 0.15)
    sh = spec['shirt']
    pos, nrm, ao, valid = tx.bake_maps(shirt, size)
    tx.final_material(shirt, tx.paint_shirt(pos, nrm, ao, valid, lm, sh['color'], sh['text'], sh['ink'], sh['pattern']), 0.9)
    pa = spec['pants']
    pos, nrm, ao, valid = tx.bake_maps(pants, max(256, size // 2))
    tx.final_material(pants, tx.paint_pants(pos, nrm, ao, valid, lm, pa['fabric'], pa['color']), 0.85)
    pos, nrm, ao, valid = tx.bake_maps(shoes, 256)
    tx.final_material(shoes, tx.paint_shoes(pos, nrm, ao, valid, spec['shoes']), 0.6)
    if cap:
        pos, nrm, ao, valid = tx.bake_maps(cap, 256)
        knit = spec['head'] == 'beanie'
        tx.final_material(cap, tx.paint_cap(pos, nrm, ao, valid, spec['head_color'], spec['head_logo'], knit), 0.85 if knit else 0.7)


def sleeve_planes(sleeves, jp):
    planes = []
    for side, sign in (('L', 1), ('R', -1)):
        sh, el, wr = jp(f'upperarm01.{side}____head'), jp(f'lowerarm01.{side}____head'), jp(f'wrist.{side}____head')
        region = (lambda co, s=sh, g=sign: co.x * g > s.x * g - 0.02)
        if sleeves == 'long':
            planes.append((el + (wr - el) * 0.92, (wr - el).normalized(), region))
        else:
            planes.append((sh + (el - sh) * 0.5, (el - sh).normalized(), region))
    return planes


def build_headwear(kind, mesh, P, dom, jp, rig):
    """Cap (brim front/back) or beanie made from the scalp; None for bare heads."""
    if kind == 'none':
        return None
    brow_z = jp('head____head').z + 0.1
    head_c = jp('head____head') + Vector((0, 0, 0.1))
    low = brow_z - (0.012 if kind == 'beanie' else 0)
    cap, _ = subset_mesh('Cap', mesh, 'body', P, lambda i: to_blender(P[i])[2] > low and dom(i) in ('head', 'neck03'))
    bm = bmesh.new()
    bm.from_mesh(cap.data)
    if kind == 'beanie':
        radial_push(bm, lambda co: head_c, lambda co: 1.09)
        for vtx in bm.verts:  # slouchy top
            vtx.co.z += max(0.0, vtx.co.z - (brow_z + 0.05)) * 0.6
    else:
        radial_push(bm, lambda co: head_c, lambda co: 1.07)
    bm.to_mesh(cap.data)
    bm.free()
    if kind in ('cap', 'cap_back'):
        front_y = min(vv.co.y for vv in cap.data.vertices)
        bpy.ops.mesh.primitive_cube_add(size=1)
        brim = bpy.context.active_object
        brim.name = 'Brim'
        brim.scale = (0.17, 0.1, 0.01)
        brim.location = (head_c.x, front_y - 0.04, brow_z + 0.008)
        bpy.ops.object.transform_apply(location=True, scale=True)
        bpy.ops.object.select_all(action='DESELECT')
        brim.select_set(True)
        cap.select_set(True)
        bpy.context.view_layer.objects.active = cap
        bpy.ops.object.join()
        if kind == 'cap_back':
            for vv in cap.data.vertices:  # rotate 180° about the head's vertical axis
                d = vv.co - head_c
                vv.co = Vector((head_c.x - d.x, head_c.y - d.y, vv.co.z))
    skin(cap, rig, [], {}, override='head')
    return cap


def hide_covered(body, clothes, reach=0.12, hem=0.04):
    """Delete body faces fully hidden under clothing (never visible, ~40 % of the triangles).
    A vertex counts as covered when a ray along its normal hits a garment within `reach` and it lies
    more than `hem` away from any garment edge, so skin never shows through at hems while animating."""
    from mathutils.bvhtree import BVHTree
    from mathutils.kdtree import KDTree
    trees, edge_pts = [], []
    for c in clothes:
        bm = bmesh.new()
        bm.from_mesh(c.data)
        bm.transform(c.matrix_world)
        trees.append(BVHTree.FromBMesh(bm))
        edge_pts += [v.co.copy() for v in bm.verts if v.is_boundary]
        bm.free()
    kd = KDTree(len(edge_pts))
    for i, co in enumerate(edge_pts):
        kd.insert(co, i)
    kd.balance()
    bm = bmesh.new()
    bm.from_mesh(body.data)
    mw = body.matrix_world
    covered = set()
    for v in bm.verts:
        co = mw @ v.co
        no = (mw.to_3x3() @ v.normal).normalized()
        if kd.find(co)[2] < hem:
            continue
        if any(t.ray_cast(co + no * 0.001, no, reach)[0] is not None for t in trees):
            covered.add(v.index)
    kill = [f for f in bm.faces if all(v.index in covered for v in f.verts)]
    before = len(bm.faces)
    bmesh.ops.delete(bm, geom=kill, context='FACES_ONLY')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(body.data)
    bm.free()
    print(f'hide_covered: {len(kill)}/{before} body faces removed')


def decimate(ob, ratio):
    """Crowd LOD: collapse-decimate in rest pose (keeps UVs and vertex groups)."""
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    mod = ob.modifiers.new('Decimate', 'DECIMATE')
    mod.ratio = ratio
    bpy.ops.object.modifier_move_to_index(modifier='Decimate', index=0)
    bpy.ops.object.modifier_apply(modifier='Decimate')


def export_anims(args, rig):
    """Skeleton + every clip, no meshes – shared by all character variants."""
    import json
    if args.cmu:
        for name, file, start, end, mirrored, *opt in CLIPS:
            for m in ([False, True] if mirrored else [False]):
                run_clip(rig, args, file, start, end, name + ('_m' if m else ''), m, opt)
        for name, dur, spec, mirrored in AUTHORED:
            for m in ([False, True] if mirrored else [False]):
                author(rig, name + ('_m' if m else ''), dur, spec, mirror=m)
    if args.keyclips:
        with open(args.keyclips) as f:
            data = json.load(f)
        for cid, mirrored in KEY_CLIPS:
            for m in ([False, True] if mirrored else [False]):
                retarget_keyframes(rig, data, cid, cid + ('_m' if m else ''), mirror=m, settle=cid != 'surf')
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    rig.select_set(True)
    bpy.ops.export_scene.gltf(filepath=args.out, export_format='GLB', export_skins=True, export_animations=True,
                              export_animation_mode='ACTIONS', export_force_sampling=True, export_yup=True,
                              use_selection=True)
    print('exported', args.out, len(bpy.data.actions), 'clips')


def debug_stats(body, pants, shirt):
    def rad(o, z):
        pts = [v.co for v in o.data.vertices if abs(v.co.z - z) < 0.02 and v.co.x > 0.02]
        if not pts:
            return None
        c = sum(pts, Vector()) / len(pts)
        return round(max((p - c).length for p in pts), 3), len(pts)
    for z in [0.15, 0.3, 0.5, 0.7]:
        print('DBG z', z, 'body', rad(body, z), 'pants', rad(pants, z))
    bm = bmesh.new()
    bm.from_mesh(shirt.data)
    loops = [e for e in bm.edges if e.is_boundary]
    print('DBG shirt boundary edges', len(loops), 'verts', len(shirt.data.vertices))
    bm.free()


def simple_material(name, color, rough=0.8):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    return m


PROTO_COLORS = {'Body': ((0.62, 0.42, 0.32), 0.55), 'Eyes': ((0.85, 0.85, 0.85), 0.2), 'Shirt': ((0.03, 0.03, 0.03), 0.9),
                'Pants': ((0.10, 0.16, 0.32), 0.85), 'Shoes': ((0.85, 0.85, 0.85), 0.6), 'Cap': ((0.35, 0.02, 0.02), 0.7)}


def assign_materials(objs):
    for o in objs:
        col, rough = PROTO_COLORS.get(o.name, ((0.5, 0.5, 0.5), 0.8))
        o.data.materials.clear()
        o.data.materials.append(simple_material(o.name, col, rough))


def setup_preview_scene(objs, res=720):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 12
    scene.cycles.device = 'CPU'
    scene.render.resolution_x = res
    scene.render.resolution_y = res
    world = bpy.data.worlds.new('W')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.08, 0.07, 0.09, 1)
    scene.world = world
    cam_data = bpy.data.cameras.new('Cam')
    cam = bpy.data.objects.new('Cam', cam_data)
    scene.collection.objects.link(cam)
    cam.location = (1.6, -3.4, 1.05)
    cam.rotation_euler = (math.radians(88), 0, math.radians(25))
    cam_data.lens = 30
    scene.camera = cam
    for loc, energy in [((2, -2, 3), 900), ((-2.5, 1, 2), 500), ((0, -3, 1), 200)]:
        ld = bpy.data.lights.new('L', 'POINT')
        ld.energy = energy
        lo = bpy.data.objects.new('L', ld)
        lo.location = loc
        scene.collection.objects.link(lo)
    return scene


def render_anim_sheet(path, rig, objs, clips, per_clip=6):
    from PIL import Image
    scene = setup_preview_scene(objs, res=360)
    tiles = []
    for act, n in clips:
        for track in rig.animation_data.nla_tracks:
            track.mute = True
        rig.animation_data.action = act
        for k in range(per_clip):
            f = 1 + round(k * (n - 1) / (per_clip - 1))
            scene.frame_set(f)
            out = f'{path}.tmp_{act.name}_{k}.png'
            scene.render.filepath = out
            bpy.ops.render.render(write_still=True)
            tiles.append(out)
    rig.animation_data.action = None
    sheet = Image.new('RGB', (per_clip * 360, len(clips) * 360))
    for i, t in enumerate(tiles):
        sheet.paste(Image.open(t), ((i % per_clip) * 360, (i // per_clip) * 360))
        os.remove(t)
    sheet.save(path)


def render_preview(path, objs):
    if os.environ.get('MOSH_CAM') == 'face':
        scene = setup_preview_scene(objs, res=640)
        head = [o for o in objs if o.name == 'Body'][0]
        top = max(v.co.z for v in head.data.vertices)
        cam = scene.camera
        cam.location = (0.22, -0.62, top - 0.1)
        cam.rotation_euler = (math.radians(90), 0, math.radians(19))
        cam.data.lens = 60
        scene.cycles.samples = 32
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        return
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.device = 'CPU'
    scene.render.resolution_x = 720
    scene.render.resolution_y = 720
    world = bpy.data.worlds.new('W')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.08, 0.07, 0.09, 1)
    scene.world = world
    cam_data = bpy.data.cameras.new('Cam')
    cam = bpy.data.objects.new('Cam', cam_data)
    scene.collection.objects.link(cam)
    cam.location = (1.1, -3.6, 1.05)
    cam.rotation_euler = (math.radians(88), 0, math.radians(17))
    cam_data.lens = 40
    scene.camera = cam
    for loc, energy in [((2, -2, 3), 900), ((-2.5, 1, 2), 500), ((0, -3, 1), 200)]:
        ld = bpy.data.lights.new('L', 'POINT')
        ld.energy = energy
        lo = bpy.data.objects.new('L', ld)
        lo.location = loc
        scene.collection.objects.link(lo)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main()
