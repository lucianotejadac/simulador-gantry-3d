"""Blender background export of the existing Godot patient (source is read-only).

blender -b --python scripts/build_godot_patient.py -- --source /path/to/SymbiaRoom
Two fixed poses, shared 512–1024px textures, reduced meshes; no runtime cloth solver.
"""
import argparse
import hashlib
import json
import math
import struct
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector

args = argparse.ArgumentParser()
args.add_argument('--source', type=Path, required=True)
opt = args.parse_args(sys.argv[sys.argv.index('--') + 1:])
root = Path(__file__).resolve().parents[1]
out = root / 'assets/patient'
out.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
poses = {}
sources = {}
common = None
images = {}

def smoothstep(a, b, value):
    t = max(0., min(1., (value - a) / (b - a)))
    return t * t * (3 - 2 * t)


def correct_resting_pose(obj, pose):
    """Correct the baked source seating, without changing the denim UVs.

    Source prepare_makehuman.py adds a 6 cm lateral rail-clearance ramp to
    every mesh, including trousers and shoes. Undo it on the lower body;
    it otherwise curls each leg into a trough. Work before normalization,
    in source metres (the source object has a uniform 1.0120826 scale).
    """
    source_scale = 1.0120826
    for vertex in obj.data.vertices:
        p = vertex.co
        x, y, z = (c / source_scale for c in p)
        if not obj.name.startswith('IQSPECT'):
            lower_body = 1 - smoothstep(.95, 1.15, -x)
            p.z -= source_scale * .06 * smoothstep(.15, .185, abs(y)) * lower_body
        if pose != 'up':
            continue
        if 'Head_Pad' in obj.name:
            # Lower the cushion top with the occiput; retain its bottom seat.
            p.z -= source_scale * .065 * max(0., min(1., (z - .065) / .11))
            p.x += source_scale * .055
        elif not obj.name.startswith('IQSPECT'):
            # Rigid head displacement with a smooth neck transition. The
            # transverse/cranial limits exclude raised arms and fingertips.
            head = (smoothstep(1.39, 1.53, -x)
                    * (1 - smoothstep(1.79, 1.85, -x))
                    * (1 - smoothstep(.105, .155, abs(y))))
            p.z -= source_scale * .065 * head
            p.x += source_scale * .055 * head
    obj.data.update()

for pose, filename in [('down', 'patient.glb'), ('up', 'patient_arms_back.glb')]:
    path = opt.source / 'godot/assets/patient' / filename
    sources[pose] = hashlib.sha256(path.read_bytes()).hexdigest()
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    objects = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    # Bake source transforms. Blender Z-up -> patient axis X, head at negative X.
    rotation = Matrix.Rotation(math.pi / 2, 4, 'Z')
    for o in objects:
        o.data.transform(rotation @ o.matrix_world)
        o.matrix_world = Matrix.Identity(4)
        correct_resting_pose(o, pose)
    if common is None:
        points = [v.co for o in objects for v in o.data.vertices]
        feet = max(p.x for p in points)
        head = min(p.x for p in points)
        floor = min(p.z for p in points)
        scale = 1.75 / (feet - head)
        common = Matrix.Diagonal(Vector((scale, scale, scale, 1))) @ Matrix.Translation((-feet, 0, -floor))
    group = bpy.data.objects.new('Patient_' + pose, None)
    bpy.context.collection.objects.link(group)
    count = 0
    for o in objects:
        o.data.transform(common)
        bpy.context.view_layer.objects.active = o
        # Keep the face/hands recognisable, but avoid traversing 140k triangles
        # on each collision query. The same reduced mesh is used for contact.
        original = sum(len(p.vertices) - 2 for p in o.data.polygons)
        budget = 5500 if o.name == 'Human' or o.name.startswith('Human.00') else 1800
        if 'eyebrow' in o.name: budget = 350
        # Cornea/iris layers and their UV islands are too small to decimate.
        if 'high-poly' in o.name: budget = original
        # Preserve the rounded trouser legs, hems and cloth folds at close zoom.
        if 'casualsuit' in o.name: budget = 8000
        mod = o.modifiers.new('Web reduction', 'DECIMATE')
        mod.ratio = min(1, budget / max(1, original))
        bpy.ops.object.modifier_apply(modifier=mod.name)
        o.parent = group
        count += sum(len(p.vertices) - 2 for p in o.data.polygons)
        for mat in o.data.materials:
            if not mat or not mat.use_nodes: continue
            for node in mat.node_tree.nodes:
                if node.type != 'TEX_IMAGE' or not node.image: continue
                image = node.image
                key = image.name.split('.')[0]
                if key in images:
                    node.image = images[key]
                else:
                    w, h = image.size
                    limit = 1024 if any(s in key for s in ['casualsuit','brown_eye','male_diffuse']) else 512
                    if max(w, h) > limit:
                        ratio = limit / max(w, h)
                        image.scale(max(1, round(w * ratio)), max(1, round(h * ratio)))
                    images[key] = image
    points = [v.co for o in objects for v in o.data.vertices]
    # glTF coordinates: x, z, -y in Blender.
    coords = [(p.x, p.z, -p.y) for p in points]
    bounds = [[min(p[i] for p in coords) for i in range(3)], [max(p[i] for p in coords) for i in range(3)]]
    poses[pose] = {'node': group.name, 'triangles': count, 'bounds': bounds,
                   'height': bounds[1][1] - bounds[0][1]}

# Decimation can shift a supporting vertex slightly. Seat both poses using
# one longitudinal correction and a submillimetre seating correction per pose.
shift_x = -poses['down']['bounds'][1][0]
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        pose = poses['up' if obj.parent.name == 'Patient_up' else 'down']
        obj.data.transform(Matrix.Translation((shift_x, 0, -pose['bounds'][0][1])))
for pose in poses.values():
    shift_z = -pose['bounds'][0][1]
    for bound in pose['bounds']:
        bound[0] += shift_x
        bound[1] += shift_z

temp = out / 'patient-export.glb'
bpy.ops.export_scene.gltf(filepath=str(temp), export_format='GLB', export_animations=False,
                         export_cameras=False, export_lights=False, export_extras=True,
                         export_image_format='AUTO', export_yup=True)
data = temp.read_bytes()
# Godot/Blender tolerated BLEND on every material. In Three.js it sorts whole
# meshes rather than their intersecting faces, exposing eyes/skin through the
# head and clothing. Solid surfaces must write opaque depth; only hair/brows
# need cutout alpha, with depth testing preserved.
json_size = struct.unpack_from('<I', data, 12)[0]
doc = json.loads(data[20:20 + json_size])
for material in doc.get('materials', []):
    cutout = any(name in material.get('name', '') for name in ['short02', 'eyebrow001', 'high-poly'])
    material['alphaMode'] = 'MASK' if cutout else 'OPAQUE'
    if cutout: material['alphaCutoff'] = .35
    else: material.pop('alphaCutoff', None)
    if 'casualsuit' in material.get('name',''):
        material.get('normalTexture', {})['scale'] = .35
encoded = json.dumps(doc, separators=(',', ':')).encode()
encoded += b' ' * (-len(encoded) % 4)
binary_chunk = data[20 + json_size:]
data = struct.pack('<III', 0x46546C67, 2, 20 + len(encoded) + len(binary_chunk)) + struct.pack('<II', len(encoded), 0x4E4F534A) + encoded + binary_chunk
digest = hashlib.sha256(data).hexdigest()
asset = root / 'assets/runtime' / ('patient-godot.' + digest[:16] + '.glb')
asset.write_bytes(data)
temp.unlink()
metadata = {'source': 'SymbiaRoom Godot / MakeHuman MPFB 2.0.17', 'license': 'CC0',
            'sourceHashes': sources, 'url': asset.relative_to(root).as_posix(),
            'sha256': digest, 'bytes': len(data), 'poses': poses,
            'notes': 'Fixed poses; shared reduced textures; static clothing. Visual model, not ICRP anatomy.'}
(out / 'manifest.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
print(json.dumps(metadata, indent=2))
