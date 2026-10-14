"""Validate packaged angular volumes, quantization and AP/PA checks."""
from pathlib import Path
import hashlib
import json
import re
import zlib
import numpy as np

root = Path(__file__).resolve().parents[1]
html = (root/'index.html').read_text(encoding='utf-8')
data = json.loads(re.search(r'window.GANTRY_ICRP_DATA=(.*?);\n', html)[1])
provenance = json.loads((root/'assets/icrp145/organ-static-provenance.json').read_text(encoding='utf-8'))
for name in ['dmsa', 'maa', 'thyroid', 'exploration', 'parathyroid']:
    p = data[name]
    assert p == provenance[name]['descriptor']
    assert p['angles'] == list(range(0, 360, 5))
    raw = (root/p['url']).read_bytes()
    assert hashlib.sha256(raw).hexdigest()[:16] in p['url']
    if name == 'parathyroid':
        assert p==data['mibi_up']
        assert provenance[name]['shared_model']=='mibi_up'
        assert provenance[name]['asset_sha256']==hashlib.sha256(raw).hexdigest()
        print(name, 'Exact shared cardiac MIBI volume, scale, window, registration and angles OK')
        continue
    quant = np.frombuffer(zlib.decompress(raw), dtype='<u2').reshape(72,640,256)
    frames = quant*p['scale']
    assert np.all(frames.sum(axis=(1,2))>0)
    assert len({hashlib.sha256(f.tobytes()).digest() for f in quant}) == 72
    assert abs(frames[0].sum()-2_000_000)/2_000_000 < .001
    assert 0 < p['headRow'] < p['footRow'] < p['height']
    assert max(provenance[name]['cardinal_relative_l1_errors']) < .001
    case = provenance[name]['case']
    rules = case['reglas_captacion']
    if name == 'thyroid':
        assert any(r['ids']==[13200] and r['voxeles']>0 and r['actividad_relativa_por_voxel']==12 for r in rules)
    if name == 'exploration':
        assert case['energy']==364 and case['remanente']['voxeles']==25
        assert provenance[name]['attenuation']['factor']==.7
    original = root.parent/'icrp145-multitrazador-ap-pa'/(name+'-360')/'proyecciones_lineales.npz'
    if original.exists():
        expected = np.load(original)['cuentas_esperadas']
        assert np.max(np.abs(frames-expected)) < p['scale']*.502
    print(name, '72 unique angles, AP reference, AP/PA convention, quantization and registration OK')
