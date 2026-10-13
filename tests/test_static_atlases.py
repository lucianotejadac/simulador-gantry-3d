"""Verify that existing angular images, resolution and normalization are retained."""
from pathlib import Path
import json,re,zlib
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text(encoding='utf-8')
data=json.loads(re.search(r'window.GANTRY_ICRP_DATA=(.*?);\n',html)[1])
provenance=json.loads((root/'assets/icrp145/static-atlas-provenance.json').read_text(encoding='utf-8'))
for name,n in [('thyroid',40),('exploration',16),('parathyroid',40)]:
    p=data[name]
    frames=np.frombuffer(zlib.decompress((root/p['url']).read_bytes()),dtype='<u2').reshape(n,960,480)
    assert p['angles'][0]==0 and 180 in p['angles'] and p['angles'][-1]<360
    assert p['angles']==provenance[name]['angles']
    assert abs(frames[0].sum()*p['scale']-2_000_000)<1e-6
    with Image.open(root/provenance[name]['source']) as image:
        image=image.convert('L')
        for i in range(n):
            original=np.array(image.crop((i%8*480,i//8*960,i%8*480+480,i//8*960+960)),dtype=np.uint16)*257
            assert np.array_equal(frames[i],original)
    assert np.any(frames[0]!=frames[p['angles'].index(180)])
    print(name,':',n,'original views, byte-exact intensity, 480x960, normalized activity OK')
