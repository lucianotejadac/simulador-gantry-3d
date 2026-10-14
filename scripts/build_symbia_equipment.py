"""Export the SymbiaRoom scanner as three rigid, vertex-coloured web batches.

The existing simulator table is deliberately retained: its telescopic support,
patient positioning and acquisition envelope remain the authority for movement.
Source files are read only. Units and scanner proportions stay in metres.
"""
import argparse
import gzip
import hashlib
import json
import struct
from pathlib import Path

import numpy as np
from build_symbia_room import GLB
from externalize_assets import asset

ROOT = Path(__file__).resolve().parents[1]


def build(source):
    original = source / 'godot_remy_trial/assets/symbia_room.glb'
    groups = {'Gantry': [], 'Detector1': [], 'Detector2': []}
    included, excluded = [], []
    for name, pos, normal, colour, index in GLB(original).meshes():
        if name.startswith('Detector_01') or name == 'SPECT_Rotation_Part_21':
            group, face, sign = 'Detector1', 1.4053, 1
        elif name.startswith('Detector_02') or name == 'SPECT_Rotation_Part_22':
            group, face, sign = 'Detector2', .6822, -1
        elif name.startswith(('Gantry_Static_', 'CT_Part_', 'Monitor_', 'Rear_Support_')):
            group, face, sign = 'Gantry', .0116, 1
        else:
            excluded.append(name)
            continue
        # Rotate source -Z into the simulator's +X axis. Detector origins are
        # the innermost collimator rail; both local +Y axes point away from skin.
        rotation = np.array([[0, 0, -1], [0, sign, 0], [sign, 0, 0]])
        p = pos @ rotation.T + [-3.7065, -sign * face, -sign * 2.2965]
        n = normal @ rotation.T
        groups[group].append((p, n, colour, index))
        included.append({'name': name, 'group': group, 'triangles': len(index)//3})
    data = bytearray()
    meta = {'version': 1, 'source': 'SymbiaRoom / Siemens planning model 13041',
            'source_sha256': hashlib.sha256(original.read_bytes()).hexdigest(),
            'units': 'metres', 'scale': 1, 'groups': [], 'components': included,
            'excluded': excluded,
            'registration': {'source_transverse_center': 2.2965,
                             'source_spect_plane_z': -3.7065,
                             'source_ring_center_y': 1.0416, 'web_ring_center_y': 1.03,
                             'collimator_face_y': [1.4053, .6822]},
            'limits': 'Visual scanner adaptation. Existing simulator table and collision/acquisition model retained; not certified mechanical kinematics.'}
    for name, pieces in groups.items():
        arrays = [[], [], [], []]
        offset = 0
        for p, n, c, idx in pieces:
            for dst, value in zip(arrays, [p, n, c, idx + offset]):
                dst.append(value)
            offset += len(p)
        p, n, c, idx = [np.concatenate(a) for a in arrays]
        assert np.isfinite(p).all() and np.isfinite(n).all()
        item = {'name': name, 'vertices': len(p), 'triangles': len(idx)//3,
                'bounds': [p.min(0).tolist(), p.max(0).tolist()]}
        for key, a in [('position', p.astype('<f4')), ('normal', np.rint(n*127).astype('i1')),
                       ('color', np.rint(np.clip(c, 0, 1)*255).astype('u1')), ('index', idx.astype('<u4'))]:
            data.extend(b'\0' * (-len(data) % 4))
            item[key] = [len(data), a.size]
            data.extend(a.tobytes())
        meta['groups'].append(item)
    header = json.dumps(meta, separators=(',', ':')).encode()
    header += b' ' * (-len(header) % 4)
    packed = gzip.compress(struct.pack('<I', len(header)) + header + data, mtime=0)
    url = asset(packed, 'symbia-equipment', 'bin')
    meta.update(url=url, compressed_bytes=len(packed), triangles=sum(g['triangles'] for g in meta['groups']))
    dest = ROOT / 'assets/symbia-equipment'
    dest.mkdir(parents=True, exist_ok=True)
    (dest / 'manifest.json').write_text(json.dumps(meta, indent=2)+'\n', encoding='utf-8')
    embed()
    print(json.dumps({k: meta[k] for k in ['url', 'compressed_bytes', 'triangles']}))


def embed():
    meta = json.loads((ROOT/'assets/symbia-equipment/manifest.json').read_text(encoding='utf-8'))
    js = (ROOT/'scripts/symbia_equipment.js').read_text(encoding='utf-8')
    start, end = '<!-- SYMBIA_EQUIPMENT_BEGIN -->', '<!-- SYMBIA_EQUIPMENT_END -->'
    block = f'{start}\n<script id="symbiaEquipmentData" type="application/octet-stream" data-src="{meta["url"]}"></script>\n<script>\n{js}\n</script>\n{end}'
    page = ROOT/'index.html'
    html = page.read_text(encoding='utf-8')
    if start in html:
        a = html.index(start)
        b = html.index(end, a)+len(end)
        html = html[:a]+block+html[b:]
    else:
        html = html.replace('<!-- SYMBIA_ROOM_BEGIN -->', block+'\n<!-- SYMBIA_ROOM_BEGIN -->', 1)
    page.write_text(html, encoding='utf-8', newline='\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path)
    args = parser.parse_args()
    if args.source:
        build(args.source)
    else:
        embed()
