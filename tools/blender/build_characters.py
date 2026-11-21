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
from retarget import retarget  # noqa: E402

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


# (clip name, BVH file, first frame, last frame, strip horizontal travel)
CLIPS = [
    ('spinkick', '088/88_06.bvh', 22, 125, True),
    ('cartwheel', '090/90_02.bvh', 325, 520, True),
]


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
    ap.add_argument('--anim-preview', default='')
    args = ap.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:])

    clear_scene()
    mesh = BaseMesh(args.mh)
    for path, w in BODY['brute']:
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

    # Body without the feet (hidden inside the sneakers – avoids toes poking through).
    ankle_cut = jp('foot.L____head').z + 0.01
    feet = {'foot.L', 'foot.R', 'toe1-1.L', 'toe1-1.R'}
    body, body_used = subset_mesh('Body', mesh, 'body', P,
                                  lambda i: not (dom(i) in feet and to_blender(P[i])[2] < ankle_cut))
    skin(body, rig, body_used, weights)
    eyes, eyes_used = make_mesh('Eyes', mesh, ['helper-l-eye', 'helper-r-eye'], P)
    skin(eyes, rig, eyes_used, weights, override='head')

    # ---- T-shirt from the tights helper: torso + upper half of the upper arm.
    hip_z = jp('upperleg01.L____head').z + 0.04
    neck_z = jp('neck01____head').z - 0.015
    spine_a, spine_b = jp('upperleg01.L____head') * 0 + Vector((0, jp('spine05____head').y, hip_z - 0.1)), jp('neck01____head')
    arms = [(jp('shoulder01.L____head'), jp('lowerarm01.L____head')), (jp('shoulder01.R____head'), jp('lowerarm01.R____head'))]

    def in_shirt(i):
        co = Vector(to_blender(P[i]))
        if co.z < hip_z - 0.07 or co.z > neck_z:
            return False
        dt = (co - closest_on_segment(co, spine_a, spine_b)[0]).length
        for a, b in arms:
            c, t = closest_on_segment(co, a, b)
            if (co - c).length < dt and t > 0.08:
                return t < 0.55  # short sleeve ends mid upper arm
        return True

    shirt, shirt_used = subset_mesh('Shirt', mesh, 'helper-tights', P, in_shirt)
    bm = bmesh.new()
    bm.from_mesh(shirt.data)

    def shirt_center(co):
        best = None
        for a, b in [(spine_a, spine_b)] + arms:
            c, _ = closest_on_segment(co, a, b)
            if best is None or (co - c).length < (co - best).length:
                best = c
        return best

    radial_push(bm, shirt_center, lambda co: 1.1)
    # Close small gaps (armpits); neck, hem and sleeve openings are much larger and stay open.
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=14)
    bm.to_mesh(shirt.data)
    bm.free()
    skin(shirt, rig, shirt_used, weights)

    # ---- Baggy pants: everything below the waist down to the ankle, flared towards the bottom.
    pant_bones = {'root', 'spine05', 'pelvis.L', 'pelvis.R', 'upperleg01.L', 'upperleg01.R', 'upperleg02.L',
                  'upperleg02.R', 'lowerleg01.L', 'lowerleg01.R', 'lowerleg02.L', 'lowerleg02.R'}
    waist_z = jp('spine05____head').z + 0.03
    ankle_z = jp('foot.L____head').z + 0.02
    pants, pants_used = subset_mesh('Pants', mesh, 'body', P,
                                    lambda i: dom(i) in pant_bones and ankle_z + 0.03 < to_blender(P[i])[2] < waist_z)
    legs = [(jp('upperleg01.L____head'), jp('foot.L____head')), (jp('upperleg01.R____head'), jp('foot.R____head'))]
    bm = bmesh.new()
    bm.from_mesh(pants.data)

    def leg_center(co):
        if co.z > hip_z + 0.02:
            return Vector((0, 0, co.z)) if abs(co.x) < 0.25 else None
        a, b = legs[0] if co.x > 0 else legs[1]
        return closest_on_segment(co, a, b)[0]

    top, bottom = waist_z, ankle_z
    knee_z = jp('lowerleg01.L____head').z
    for v in bm.verts:
        c = leg_center(v.co)
        if c is None:
            continue
        d = v.co - c
        if v.co.z > hip_z - 0.02:  # seat/crotch: just loosen
            v.co = c + d * 1.06
            continue
        # Baggy cut: target radius grows from the thigh (11 cm) to the hem (13 cm), never tighter than the leg.
        t = max(0.0, min(1.0, (hip_z - v.co.z) / (hip_z - bottom)))
        target = 0.088 + 0.012 * t
        if v.co.z < knee_z:
            target += 0.006
        v.co = c + d.normalized() * max(d.length * 1.1, target * (0.85 + 0.15 * abs(d.normalized().x)))
    bm.to_mesh(pants.data)
    bm.free()
    skin(pants, rig, pants_used, weights)

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

    # ---- Cap: crown of the scalp, pushed out, plus a flat brim.
    brow_z = jp('head____head').z + 0.1
    head_c = jp('head____head') + Vector((0, 0, 0.1))
    cap, cap_used = subset_mesh('Cap', mesh, 'body', P,
                                lambda i: to_blender(P[i])[2] > brow_z and dom(i) in ('head', 'neck03'))
    bm = bmesh.new()
    bm.from_mesh(cap.data)
    radial_push(bm, lambda co: head_c, lambda co: 1.07)
    bm.to_mesh(cap.data)
    bm.free()
    front_y = min(v.co.y for v in cap.data.vertices)
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
    skin(cap, rig, [], {}, override='head')

    clips = []
    if args.cmu:
        for name, file, start, end, in_place in CLIPS:
            act, n, dt = retarget(rig, os.path.join(args.cmu, file), start, end, name, in_place=in_place)
            clips.append((act, n))
            print(f'clip {name}: {n} keys, {n * dt:.2f}s')
    if args.anim_preview and clips:
        render_anim_sheet(args.anim_preview, rig, [body, eyes, shirt, pants, shoes, cap], clips)

    if os.environ.get('MOSH_DEBUG'):
        debug_stats(body, pants, shirt)

    # ---- Preview
    if args.preview:
        render_preview(args.preview, [body, eyes, shirt, pants, shoes, cap])

    assign_materials([body, eyes, shirt, pants, shoes, cap])
    for o in [body, eyes, shirt, pants, shoes, cap]:
        o.select_set(True)
    rig.select_set(True)
    bpy.ops.export_scene.gltf(filepath=args.out, export_format='GLB', export_apply=False, export_skins=True,
                              export_animations=bool(clips), export_animation_mode='ACTIONS',
                              export_force_sampling=True, export_frame_step=1, export_yup=True,
                              use_selection=True)
    print('exported', args.out)


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
    assign_materials(objs)
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
    assign_materials(objs)
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
