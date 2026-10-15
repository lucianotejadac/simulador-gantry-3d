"""Blender background export of the existing Godot patient (source is read-only).

blender -b --python scripts/build_godot_patient.py -- --source /path/to/SymbiaRoom
Two fixed poses, shared 512px textures, reduced meshes; no runtime cloth solver.
"""
import argparse
import hashlib
import json
import math
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
        if 'high-poly' in o.name: budget = 600
        if 'casualsuit' in o.name: budget = 3200
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
                    if max(w, h) > 512:
                        ratio = 512 / max(w, h)
                        image.scale(max(1, round(w * ratio)), max(1, round(h * ratio)))
                    images[key] = image
    points = [v.co for o in objects for v in o.data.vertices]
    # glTF coordinates: x, z, -y in Blender.
    coords = [(p.x, p.z, -p.y) for p in points]
    bounds = [[min(p[i] for p in coords) for i in range(3)], [max(p[i] for p in coords) for i in range(3)]]
    poses[pose] = {'node': group.name, 'triangles': count, 'bounds': bounds,
                   'height': bounds[1][1] - bounds[0][1]}

# Decimation can shift a supporting vertex slightly. Seat both poses using
# one shared correction so the feet and body do not jump on posture changes.
shift = Vector((-poses['down']['bounds'][1][0], 0, -min(p['bounds'][0][1] for p in poses.values())))
for obj in bpy.data.objects:
    if obj.type == 'MESH': obj.data.transform(Matrix.Translation(shift))
for pose in poses.values():
    for bound in pose['bounds']:
        bound[0] += shift.x
        bound[1] += shift.z

temp = out / 'patient-export.glb'
bpy.ops.export_scene.gltf(filepath=str(temp), export_format='GLB', export_animations=False,
                         export_cameras=False, export_lights=False, export_extras=True,
                         export_image_format='AUTO', export_yup=True)
data = temp.read_bytes()
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
