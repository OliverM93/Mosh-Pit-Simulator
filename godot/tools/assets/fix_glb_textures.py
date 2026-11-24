"""
Re-encode the JPEG textures embedded in a GLB as plain baseline JPEGs (Pillow). Godot 4.5's JPEG decoder rejects the
JPEGs Blender writes (extra APP/COM metadata) – the characters then import untextured. Rewrites the GLB in place.

    .cache/blender-venv/bin/python godot/tools/assets/fix_glb_textures.py godot/assets/characters/*.glb
"""
import io
import json
import struct
import sys

from PIL import Image


def fix(path):
    data = open(path, 'rb').read()
    jlen = struct.unpack_from('<I', data, 12)[0]
    gltf = json.loads(data[20:20 + jlen])
    bin_start = 20 + jlen + 8
    blob = data[bin_start:]
    views = gltf['bufferViews']
    new_blob = bytearray()
    remap = {}
    image_views = {im['bufferView']: im for im in gltf.get('images', []) if 'bufferView' in im}
    for i, v in enumerate(views):
        chunk = blob[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
        if i in image_views and image_views[i].get('mimeType') == 'image/jpeg':
            out = io.BytesIO()
            Image.open(io.BytesIO(chunk)).convert('RGB').save(out, 'JPEG', quality=92, optimize=True)
            chunk = out.getvalue()
        while len(new_blob) % 4:
            new_blob.append(0)
        remap[i] = (len(new_blob), len(chunk))
        new_blob += chunk
    for i, v in enumerate(views):
        v['byteOffset'], v['byteLength'] = remap[i]
    while len(new_blob) % 4:
        new_blob.append(0)
    gltf['buffers'][0]['byteLength'] = len(new_blob)
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(new_blob)
    out = struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<I', len(js)) + b'JSON' + js
    out += struct.pack('<I', len(new_blob)) + b'BIN\x00' + bytes(new_blob)
    open(path, 'wb').write(out)
    print(path, len(data), '->', len(out))


for p in sys.argv[1:]:
    fix(p)
