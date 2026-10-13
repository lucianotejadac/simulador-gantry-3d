"""Export only static, redistributable SymbiaRoom scenery; never modify the source.

Usage: python scripts/build_symbia_room.py --source /path/to/SymbiaRoom
Textures are sampled into vertex colours, objects batched, normals quantized.
Requires numpy and Pillow. The compressed asset is embedded for offline use.
"""
import argparse
import base64
import gzip
import hashlib
import io
import json
from pathlib import Path
import struct

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DTYPES = {5120: 'i1', 5121: 'u1', 5122: '<i2', 5123: '<u2', 5125: '<u4', 5126: '<f4'}
SIZES = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def transform(node):
    if 'matrix' in node:
        return np.array(node['matrix']).reshape(4, 4).T
    x, y, z, w = node.get('rotation', [0, 0, 0, 1])
    r = np.array([[1-2*y*y-2*z*z, 2*x*y-2*z*w, 2*x*z+2*y*w],
                  [2*x*y+2*z*w, 1-2*x*x-2*z*z, 2*y*z-2*x*w],
                  [2*x*z-2*y*w, 2*y*z+2*x*w, 1-2*x*x-2*y*y]])
    m = np.eye(4)
    m[:3, :3] = r @ np.diag(node.get('scale', [1, 1, 1]))
    m[:3, 3] = node.get('translation', [0, 0, 0])
    return m


def linear(c):
    return np.where(c <= .04045, c/12.92, ((c+.055)/1.055)**2.4)


class GLB:
    def __init__(self, path):
        data = path.read_bytes()
        size = struct.unpack_from('<I', data, 12)[0]
        self.doc = json.loads(data[20:20+size])
        self.bin = data[28+size:]
        self.images = {}

    def accessor(self, i):
        a = self.doc['accessors'][i]
        assert 'sparse' not in a
        v = self.doc['bufferViews'][a['bufferView']]
        dtype = np.dtype(DTYPES[a['componentType']])
        width = SIZES[a['type']]
        arr = np.ndarray((a['count'], width), dtype, self.bin,
                         v.get('byteOffset', 0)+a.get('byteOffset', 0),
                         (v.get('byteStride', width*dtype.itemsize), dtype.itemsize)).copy()
        if a.get('normalized'):
            arr = np.maximum(-1, arr.astype(float)/np.iinfo(dtype).max)
        return arr

    def colour(self, primitive, n):
        attrs = primitive['attributes']
        mat = self.doc.get('materials', [{}])[primitive.get('material', 0)]
        pbr = mat.get('pbrMetallicRoughness', {})
        rgb = np.tile(pbr.get('baseColorFactor', [1, 1, 1, 1])[:3], (n, 1)).astype(float)
        if 'COLOR_0' in attrs:
            rgb *= self.accessor(attrs['COLOR_0'])[:, :3]
        if 'baseColorTexture' in pbr and 'TEXCOORD_0' in attrs:
            tex = self.doc['textures'][pbr['baseColorTexture']['index']]['source']
            if tex not in self.images:
                v = self.doc['bufferViews'][self.doc['images'][tex]['bufferView']]
                start = v.get('byteOffset', 0)
                self.images[tex] = np.asarray(Image.open(io.BytesIO(self.bin[start:start+v['byteLength']])).convert('RGB'))/255
            image = self.images[tex]
            uv = self.accessor(attrs['TEXCOORD_0']) % 1
            xy = np.floor(uv*np.array([image.shape[1], image.shape[0]])).astype(int)
            rgb *= linear(image[xy[:, 1], xy[:, 0]])
        return rgb

    def meshes(self, outer=np.eye(4), keep=lambda name: True):
        def visit(index, parent):
            node = self.doc['nodes'][index]
            matrix = parent @ transform(node)
            name = node.get('name', '')
            if 'mesh' in node and keep(name):
                for primitive in self.doc['meshes'][node['mesh']]['primitives']:
                    assert primitive.get('mode', 4) == 4
                    attrs = primitive['attributes']
                    pos = self.accessor(attrs['POSITION'])
                    normal = self.accessor(attrs['NORMAL'])
                    pos = pos @ matrix[:3, :3].T + matrix[:3, 3]
                    normal = normal @ np.linalg.inv(matrix[:3, :3])
                    normal /= np.maximum(np.linalg.norm(normal, axis=1)[:, None], 1e-12)
                    idx = self.accessor(primitive['indices']).ravel() if 'indices' in primitive else np.arange(len(pos))
                    yield name, pos, normal, self.colour(primitive, len(pos)), idx
            for child in node.get('children', []):
                yield from visit(child, matrix)
        for root in self.doc['scenes'][self.doc.get('scene', 0)]['nodes']:
            yield from visit(root, outer)


def build(source):
    groups = {}
    provenance = []
    def add(group, p, n, c, indices):
        groups.setdefault(group, []).append((p, n, c, indices))
    # Longitudinal placement chosen for the existing web gantry, not a surveyed
    # registration: source depth 4.25 m -> web SPECT plane X=0; scale stays 1:1.
    mapping = np.array([[0, 0, -1, -4.25], [0, 1, 0, 0], [1, 0, 0, -2.2965], [0, 0, 0, 1.]])
    room = source/'exports/symbia_room.glb'
    for name, p, n, c, idx in GLB(room).meshes(mapping, lambda name: name == 'Floor' or name.startswith('Wall_')):
        group = name.split('.')[0]
        colour = [0.71, .70, .64] if name == 'Floor' else ([.075, .088, .105] if name == 'Wall_Front' else [.81, .80, .76])
        add(group, p, n, np.tile(linear(np.array(colour)), (len(p), 1)), idx)
    furniture = [
        ('medical_cabinet', [3.48, 0, -6.92], 0),
        ('hospital_medical_trolley', [.30, 0, -5.65], np.pi/2),
        ('iv_pole', [1.08, 0, -6.75], 0),
        ('clinical_hospital_bin_white', [4.07, 0, -3], -np.pi/2),
        ('clinical_waste_hospital_bin_yellow', [4.07, 0, -3.50], -np.pi/2),
        ('clinical_chair', [3.97, 0, -2.45], 1.5*np.pi),
        ('clinical_hand_wash_basin', [.25, 0, -1.50], np.pi/2),
    ]
    for name, pos, yaw in furniture:
        path = source/f'godot_remy_trial/assets/furniture/{name}.glb'
        matrix = transform({'translation': pos, 'rotation': [0, np.sin(yaw/2), 0, np.cos(yaw/2)]})
        for _, p, n, c, idx in GLB(path).meshes(mapping @ matrix):
            add('Furniture', p, n, c, idx)
        provenance.append({'file': name+'.glb', 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})

    def rectangle(group, x0, x1, z0, z1, y, colour):
        p = np.array([[x0,y,z0],[x1,y,z0],[x1,y,z1],[x0,y,z1]])
        p = p @ mapping[:3,:3].T + mapping[:3,3]
        add(group, p, np.tile([0,1,0], (4,1)), np.tile(linear(np.array(colour)), (4,1)), np.array([0,2,1,0,3,2]))
    rectangle('Floor',1.04,3.50,-6.35,-.75,.003,[.27,.30,.30])
    rectangle('Floor',1.08,1.72,-4.10,-2.35,.004,[.62,.43,.035])
    # Door/glass as inexpensive coloured panels, matching the source layout.
    def panel(x0,x1,y0,y1,z,colour):
        p=np.array([[x0,y0,z],[x1,y0,z],[x1,y1,z],[x0,y1,z]])
        p=p@mapping[:3,:3].T+mapping[:3,3]
        n=np.tile(np.array([0,0,-1])@mapping[:3,:3].T,(4,1))
        add('Wall_Front',p,n,np.tile(linear(np.array(colour)),(4,1)),np.array([0,2,1,0,3,2]))
    panel(.145,1.155,0,2.15,-.032,[.40,.45,.47])
    panel(.195,1.105,0,2.10,-.061,[.79,.81,.77])
    panel(.89,1.04,1.01,1.04,-.13,[.18,.21,.23])
    panel(1.525,3.575,.96,2,-.035,[.4,.45,.47])
    panel(1.575,3.525,1.01,1.95,-.057,[.38,.55,.57])

    data = bytearray()
    meta = {'version':1,'groups':[], 'source':'SymbiaRoom static scenery',
            'dimensions_m':[4.255,7.189,2.34], 'placement':'visual alignment; original scale retained',
            'source_files':provenance, 'excluded':['scanner','patient','ceiling','physics','lights','photos','hospital_kit_2','siemens_collimator_cart']}
    for name, pieces in groups.items():
        arrays = [[],[],[],[]]
        offset = 0
        for p,n,c,idx in pieces:
            for dst, val in zip(arrays,[p,n,c,idx+offset]): dst.append(val)
            offset += len(p)
        p,n,c,idx = [np.concatenate(a) for a in arrays]
        assert np.isfinite(p).all() and np.isfinite(n).all()
        obj={'name':name,'vertices':len(p),'triangles':len(idx)//3,'bounds':[p.min(0).tolist(),p.max(0).tolist()]}
        for key,arr in [('position',p.astype('<f4')),('normal',np.rint(n*127).astype('i1')),('color',np.rint(np.clip(c,0,1)*255).astype('u1')),('index',idx.astype('<u4'))]:
            data.extend(b'\0'*(-len(data)%4))
            obj[key]=[len(data),arr.size]
            data.extend(arr.tobytes())
        meta['groups'].append(obj)
    header=json.dumps(meta,separators=(',',':')).encode()
    header+=b' '*(-len(header)%4)
    compressed=gzip.compress(struct.pack('<I',len(header))+header+data,mtime=0)
    dest=ROOT/'assets/symbia-room';dest.mkdir(exist_ok=True,parents=True)
    (dest/'room.bin.gz').write_bytes(compressed)
    meta['compressed_bytes']=len(compressed)
    meta['triangles']=sum(g['triangles'] for g in meta['groups'])
    (dest/'manifest.json').write_text(json.dumps(meta,indent=2)+'\n',encoding='utf-8')
    embed()
    print(json.dumps({k:meta[k] for k in ['compressed_bytes','triangles']}))


def embed():
    html=ROOT/'index.html'
    text=html.read_text(encoding='utf-8')
    start='<!-- SYMBIA_ROOM_BEGIN -->';end='<!-- SYMBIA_ROOM_END -->'
    asset=base64.b64encode((ROOT/'assets/symbia-room/room.bin.gz').read_bytes()).decode()
    js=(ROOT/'scripts/symbia_room.js').read_text(encoding='utf-8')
    block=f'{start}\n<script id="symbiaRoomData" type="application/octet-stream">{asset}</script>\n<script>\n{js}\n</script>\n{end}'
    if start in text:
        a=text.index(start);b=text.index(end,a)+len(end);text=text[:a]+block+text[b:]
    else:
        text=text.replace('  /* ---------- sala ---------- */', '  /* ---------- sala ---------- */',1)
        anchor='<script>\n// Enlace de demostración:'
        assert anchor in text
        text=text.replace(anchor,block+'\n\n'+anchor,1)
    html.write_text(text,encoding='utf-8',newline='\n')


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path);args=parser.parse_args()
    build(args.source) if args.source else embed()
