"""
Texture painting for the Blender character build.

Cycles bakes a *position map* and a *normal map* (object space) per mesh, so
every texel knows where it sits on the body. Details are then painted with
numpy from anatomical landmarks (eyes, mouth, nose) – brows, lips, eyelids,
stubble/beard, buzz-cut hair, skin variation, denim, cotton, prints, sneaker
soles – and multiplied with a baked ambient-occlusion pass.
"""
import numpy as np
import bpy
from PIL import Image, ImageDraw, ImageFont

RNG = np.random.default_rng(7)


# ---------------------------------------------------------------- baking helpers

def _bake_setup(samples):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.render.bake.margin = 6
    sc.render.bake.use_clear = True


def _bake_target(ob, name, size, is_float):
    img = bpy.data.images.new(name, size, size, alpha=True, float_buffer=is_float)
    img.generated_color = (0, 0, 0, 0)
    mat = bpy.data.materials.new(name + '_bakemat')
    mat.use_nodes = True
    nt = mat.node_tree
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.nodes.active = tex
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    return img, mat


def _select_only(ob):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def _pixels(img):
    w, h = img.size
    a = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(h, w, 4)


def bake_maps(ob, size, ao_samples=48):
    """Return (position HxWx3 in metres, normal HxWx3, ao HxW, valid mask HxW) for one mesh."""
    _bake_setup(1)
    _select_only(ob)
    # Position: emission = object coordinates (shifted into positive range).
    img, mat = _bake_target(ob, ob.name + '_pos', size, True)
    nt = mat.node_tree
    em = nt.nodes.new('ShaderNodeEmission')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    add = nt.nodes.new('ShaderNodeVectorMath')
    add.operation = 'ADD'
    add.inputs[1].default_value = (4, 4, 4)
    nt.links.new(tc.outputs['Object'], add.inputs[0])
    nt.links.new(add.outputs[0], em.inputs['Color'])
    out = nt.nodes['Material Output']
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    bpy.ops.object.bake(type='EMIT')
    px = _pixels(img)
    pos = px[..., :3] - 4.0
    valid = px[..., 3] > 0.5
    # Normal (object space).
    img_n, _ = _bake_target(ob, ob.name + '_nrm', size, True)
    bpy.context.scene.render.bake.normal_space = 'OBJECT'
    bpy.ops.object.bake(type='NORMAL')
    nrm = _pixels(img_n)[..., :3] * 2 - 1
    # Ambient occlusion.
    _bake_setup(ao_samples)
    img_ao, _ = _bake_target(ob, ob.name + '_ao', size, False)
    bpy.ops.object.bake(type='AO')
    ao = _pixels(img_ao)[..., 0]
    for i in (img, img_n, img_ao):
        bpy.data.images.remove(i)
    return pos, nrm, ao, valid


# ---------------------------------------------------------------- painting helpers

def smooth01(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def ellipsoid(pos, center, radii):
    d = (pos - np.asarray(center)) / np.asarray(radii)
    return np.sqrt((d * d).sum(-1))


def blob(pos, center, radii, softness=0.35):
    """1 inside the ellipsoid, fading to 0 at its surface."""
    return 1 - smooth01(1 - softness, 1.0, ellipsoid(pos, center, radii))


def uv_noise(shape, cells, amp=1.0):
    """Smooth value noise in texture space (bicubic upsampled random grid), mean 0."""
    h, w = shape
    small = Image.fromarray((RNG.random((cells, cells)) * 255).astype(np.uint8))
    big = np.asarray(small.resize((w, h), Image.BICUBIC), np.float32) / 255 - 0.5
    return big * amp


def speckle(shape, density):
    return (RNG.random(shape) < density).astype(np.float32)


def mix(base, color, mask):
    m = mask[..., None]
    return base * (1 - m) + np.asarray(color, np.float32) * m


def to_image(name, rgb, valid, ao=None, ao_strength=0.6):
    col = rgb.copy()
    if ao is not None:
        col *= (1 - ao_strength + ao_strength * np.clip(ao, 0, 1))[..., None]
    h, w = valid.shape
    rgba = np.concatenate([np.clip(col, 0, 1), np.ones((h, w, 1), np.float32)], -1)
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    img.file_format = 'PNG'
    img.pack()
    return img


def final_material(ob, img, roughness=0.75, name=None):
    mat = bpy.data.materials.new(name or ob.name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = img
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = roughness
    ob.data.materials.clear()
    ob.data.materials.append(mat)


def srgb(c):
    """Hex or 0..1 sRGB triple → linear (Blender image pixels are linear for non-float images? keep sRGB)."""
    if isinstance(c, int):
        c = ((c >> 16) & 255, (c >> 8) & 255, c & 255)
        c = tuple(v / 255 for v in c)
    return np.asarray(c, np.float32)


# ---------------------------------------------------------------- body / face

def paint_body(pos, nrm, ao, valid, lm, look):
    """lm: landmarks dict (Blender space). look: dict with skin, hair, beard ('none'|'stubble'|'full'), buzz."""
    shape = valid.shape
    skin = srgb(look['skin'])
    hair = srgb(look['hair'])
    rgb = np.broadcast_to(skin, shape + (3,)).copy()
    # Skin variation: blotches + fine pores, warmer on cheeks/nose/ears/knuckles.
    rgb *= (1 + uv_noise(shape, 48, 0.08) + uv_noise(shape, 220, 0.05))[..., None]
    warm = np.maximum.reduce([
        blob(pos, lm['cheek_l'], (0.03, 0.03, 0.025)),
        blob(pos, lm['cheek_r'], (0.03, 0.03, 0.025)),
        blob(pos, lm['nose'], (0.018, 0.02, 0.02)),
    ])
    rgb = mix(rgb, skin * np.array([1.05, 0.82, 0.78]), warm * 0.35)

    ex, ez = lm['eye_l'], lm['eye_r']
    # Eyelids / socket shading and eyebrows.
    for e in (ex, ez):
        rgb = mix(rgb, skin * 0.72, blob(pos, e, (0.024, 0.03, 0.015), 0.6) * 0.5)
        side = 1 if e[0] > 0 else -1
        for k in np.linspace(-1, 1, 9):
            c = (e[0] + side * k * 0.016, e[1] - 0.004, e[2] + 0.024 + 0.004 * (1 - k * k))
            rgb = mix(rgb, hair * 0.8, blob(pos, c, (0.007, 0.03, 0.0045), 0.5) * 0.9)
    # Lips.
    m = lm['mouth']
    lips = blob(pos, (m[0], m[1], m[2] + 0.002), (0.025, 0.035, 0.011), 0.5)
    rgb = mix(rgb, skin * np.array([0.85, 0.55, 0.52]), lips * 0.8)
    rgb = mix(rgb, skin * 0.45, blob(pos, m, (0.022, 0.035, 0.0018), 0.5) * 0.9)  # mouth line
    # Nostrils.
    for s in (-1, 1):
        rgb = mix(rgb, skin * 0.4, blob(pos, (lm['nose'][0] + s * 0.009, lm['nose'][1] + 0.008, lm['nose'][2] - 0.012),
                                       (0.005, 0.01, 0.004), 0.5))
    # Beard / stubble region: lower face below the nose, in front of the ears, plus upper neck.
    face_front = smooth01(lm['head_c'][1] + 0.03, lm['head_c'][1] - 0.0, pos[..., 1])
    below_nose = smooth01(lm['nose'][2] - 0.008, lm['nose'][2] - 0.02, pos[..., 2])
    jaw = smooth01(lm['chin'][2] - 0.035, lm['chin'][2] - 0.005, pos[..., 2])
    sideburn = blob(pos, lm['ear_l'], (0.03, 0.025, 0.05)) + blob(pos, lm['ear_r'], (0.03, 0.025, 0.05))
    region = np.clip(face_front * np.maximum(below_nose, np.clip(sideburn, 0, 1) * 0.8) * jaw, 0, 1)
    region *= 1 - blob(pos, lm['mouth'], (0.03, 0.04, 0.012), 0.6) * 0.85
    grain = 0.8 + 0.2 * speckle(shape, 0.5)
    if look.get('beard') == 'full':
        rgb = mix(rgb, hair * grain[..., None], region * 0.9)
    elif look.get('beard') == 'stubble':
        rgb = mix(rgb, hair * 0.7 + skin * 0.3, region * 0.45 * grain)
    # Buzz cut: hairline arcs from the forehead down to the nape.
    if look.get('buzz'):
        e_z = (ex[2] + ez[2]) / 2
        back = np.clip((pos[..., 1] - lm['head_c'][1] + 0.02) / 0.1, 0, 1)
        hairline = e_z + 0.055 - 0.085 * back
        ears = np.maximum(blob(pos, lm['ear_l'], (0.02, 0.03, 0.035)), blob(pos, lm['ear_r'], (0.02, 0.03, 0.035)))
        scalp = smooth01(-0.012, 0.01, pos[..., 2] - hairline) * (1 - ears) * (pos[..., 2] > lm['chin'][2])
        rgb = mix(rgb, hair * (0.85 + 0.3 * speckle(shape, 0.5))[..., None], scalp * 0.88)
    return to_image('BodyTex', rgb, valid, ao, 0.55)


def paint_eyes(pos, valid, lm):
    shape = valid.shape
    rgb = np.broadcast_to(srgb((0.92, 0.9, 0.86)), shape + (3,)).copy()
    for e in (lm['eye_l'], lm['eye_r']):
        front = (e[0], e[1] - 0.012, e[2])
        rgb = mix(rgb, srgb((0.28, 0.18, 0.1)), blob(pos, front, (0.0065, 0.01, 0.0065), 0.3))
        rgb = mix(rgb, srgb((0.02, 0.02, 0.02)), blob(pos, front, (0.003, 0.012, 0.003), 0.3))
    return to_image('EyesTex', rgb, valid)


# ---------------------------------------------------------------- clothes

def text_image(text, size=(512, 256), color=(240, 240, 240, 255)):
    img = Image.new('RGBA', size, (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype('DejaVuSans-Bold.ttf', 120)
    except OSError:
        font = ImageFont.load_default()
    words = text.split()
    lines = [' '.join(words[: (len(words) + 1) // 2]), ' '.join(words[(len(words) + 1) // 2:])] if len(text) > 9 else [text]
    lines = [l for l in lines if l]
    y = 0
    boxes = [d.textbbox((0, 0), l, font=font) for l in lines]
    total_h = sum(b[3] - b[1] for b in boxes) + 20 * (len(lines) - 1)
    y = (size[1] - total_h) // 2
    for l, b in zip(lines, boxes):
        w = b[2] - b[0]
        sc = min(1.0, (size[0] - 20) / w)
        tmp = Image.new('RGBA', (w + 10, b[3] - b[1] + 20), (0, 0, 0, 0))
        ImageDraw.Draw(tmp).text((-b[0] + 5, -b[1] + 5), l, font=font, fill=color)
        tmp = tmp.resize((int(tmp.width * sc), int(tmp.height * sc)))
        img.alpha_composite(tmp, ((size[0] - tmp.width) // 2, y))
        y += tmp.height + 10
    return np.asarray(img, np.float32) / 255


def project_print(rgb, pos, nrm, print_rgba, center, width, height):
    """Planar projection of an RGBA print onto front-facing texels (Blender front = -Y)."""
    h, w = print_rgba.shape[:2]
    u = (pos[..., 0] - (center[0] - width / 2)) / width
    v = 1 - (pos[..., 2] - (center[2] - height / 2)) / height
    inside = (u >= 0) & (u < 1) & (v >= 0) & (v < 1) & (nrm[..., 1] < -0.35)
    ui = np.clip((u * w).astype(int), 0, w - 1)
    vi = np.clip((v * h).astype(int), 0, h - 1)
    px = print_rgba[vi, ui]
    a = px[..., 3] * inside
    # Cracked screen-print look.
    a *= 0.75 + 0.25 * speckle(a.shape, 0.85)
    return rgb * (1 - a[..., None]) + px[..., :3] * a[..., None]


def paint_shirt(pos, nrm, ao, valid, lm, color, print_text=None, ink=(0.93, 0.93, 0.9), pattern='plain'):
    shape = valid.shape
    rgb = np.broadcast_to(srgb(color), shape + (3,)).copy()
    x, z = pos[..., 0], pos[..., 2]
    if pattern == 'pinstripe':
        rgb = mix(rgb, srgb((0.1, 0.13, 0.3)), (np.abs(np.sin(x * 260)) > 0.93).astype(np.float32))
        rgb = mix(rgb, srgb((0.1, 0.13, 0.3)), blob(pos, (-0.06, -0.2, lm['chest_z'] + 0.02), (0.035, 0.3, 0.035)) * 0.9)
    elif pattern == 'flannel':
        bands = ((np.sin(x * 70) > 0.3).astype(np.float32) + (np.sin(z * 70) > 0.3).astype(np.float32))
        rgb *= (1 - 0.32 * bands)[..., None]
        rgb = mix(rgb, srgb((0.85, 0.8, 0.7)), ((np.abs(np.sin(x * 70)) < 0.06) | (np.abs(np.sin(z * 70)) < 0.06)) * 0.35)
    rgb *= (1 + uv_noise(shape, 160, 0.06) + uv_noise(shape, 24, 0.05))[..., None]
    if print_text:
        pr = text_image(print_text, color=tuple(int(c * 255) for c in ink) + (255,))
        rgb = project_print(rgb, pos, nrm, pr, (0, 0, lm['chest_z']), 0.26, 0.13)
    return to_image('ShirtTex', rgb, valid, ao, 0.65)


def paint_pants(pos, nrm, ao, valid, lm, fabric, color):
    if fabric == 'denim':
        return paint_denim(pos, nrm, ao, valid, lm, color)
    shape = valid.shape
    if fabric == 'camo':
        rgb = np.broadcast_to(srgb((0.32, 0.36, 0.22)), shape + (3,)).copy()
        for col, cells, thr in (((0.2, 0.17, 0.11), 18, 0.12), ((0.12, 0.14, 0.09), 26, 0.15), ((0.45, 0.42, 0.3), 34, 0.18)):
            rgb = mix(rgb, srgb(col), smooth01(thr - 0.03, thr + 0.03, uv_noise(shape, cells, 1.0)))
    else:
        rgb = np.broadcast_to(srgb(color), shape + (3,)).copy()
    rgb *= (1 + uv_noise(shape, 140, 0.07))[..., None]
    if fabric == 'track':
        rgb = mix(rgb, srgb((0.9, 0.9, 0.9)), (np.abs(nrm[..., 0]) > 0.93).astype(np.float32))
    return to_image('PantsTex', rgb, valid, ao, 0.7)


def paint_denim(pos, nrm, ao, valid, lm, color=(0.16, 0.25, 0.42)):
    shape = valid.shape
    h, w = shape
    base = srgb(color)
    yy, xx = np.mgrid[0:h, 0:w]
    twill = (np.sin((xx + yy) * 0.9) * 0.5 + 0.5) * 0.08
    rgb = np.broadcast_to(base, shape + (3,)).copy()
    rgb *= (1 - twill + uv_noise(shape, 90, 0.1))[..., None]
    # Fading on the front of the thighs and the knees.
    front = smooth01(-0.2, -0.8, nrm[..., 1])
    thigh = blob(pos, (0.1, -0.05, lm['knee_z'] + 0.18), (0.08, 0.3, 0.15)) + blob(pos, (-0.1, -0.05, lm['knee_z'] + 0.18), (0.08, 0.3, 0.15))
    knee = blob(pos, (0.1, -0.06, lm['knee_z']), (0.06, 0.3, 0.06)) + blob(pos, (-0.1, -0.06, lm['knee_z']), (0.06, 0.3, 0.06))
    rgb = mix(rgb, base * 1.7 + 0.08, np.clip(front * (thigh * 0.45 + knee * 0.35), 0, 1))
    # Hem darkening and whiskers near the crotch.
    rgb = mix(rgb, base * 0.6, smooth01(lm['ankle_z'] + 0.1, lm['ankle_z'] + 0.02, pos[..., 2]) * 0.6)
    return to_image('PantsTex', rgb, valid, ao, 0.7)


def paint_shoes(pos, nrm, ao, valid, color=(0.92, 0.92, 0.9)):
    shape = valid.shape
    rgb = np.broadcast_to(srgb(color), shape + (3,)).copy()
    floor = pos[..., 2][valid].min() if valid.any() else 0
    sole = smooth01(floor + 0.03, floor + 0.022, pos[..., 2])
    rgb = mix(rgb, srgb((0.82, 0.8, 0.76)), sole)
    rgb = mix(rgb, srgb((0.25, 0.25, 0.25)), smooth01(floor + 0.006, floor, pos[..., 2]))
    # Laces: stripes on the top front.
    top = smooth01(0.3, 0.8, nrm[..., 2]) * (pos[..., 1] < np.median(pos[..., 1][valid]))
    stripes = (np.sin(pos[..., 1] * 600) > 0.6).astype(np.float32)
    rgb = mix(rgb, srgb((0.7, 0.7, 0.7)), top * stripes * 0.6)
    return to_image('ShoesTex', rgb, valid, ao, 0.6)


def paint_cap(pos, nrm, ao, valid, color, logo=None, knit=False):
    shape = valid.shape
    rgb = np.broadcast_to(srgb(color), shape + (3,)).copy()
    rgb *= (1 + uv_noise(shape, 120, 0.05))[..., None]
    if knit:  # vertical ribs
        ang = np.arctan2(pos[..., 0], pos[..., 1])
        rgb *= (0.85 + 0.15 * (np.sin(ang * 60) > 0))[..., None]
    if logo:
        pr = text_image(logo, (256, 256))
        c = (0, 0, float(np.percentile(pos[..., 2][valid], 40)))
        rgb = project_print(rgb, pos, nrm, pr, c, 0.07, 0.07)
    return to_image('CapTex', rgb, valid, ao, 0.5)
