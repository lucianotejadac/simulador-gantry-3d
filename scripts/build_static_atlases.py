"""Reuse the existing 360-degree PNG atlases as static acquisition weights.

These are normalized intensity weights, not recovered clinical count data.
No anatomy or new angular views are generated. Resolution and angles retained.
"""
from pathlib import Path
import hashlib
import json
import re
import zlib
import numpy as np
from PIL import Image
from externalize_assets import asset

ROOT = Path(__file__).resolve().parents[1]
page = ROOT / 'index.html'
html = page.read_text(encoding='utf-8')
match = re.search(r'window.GANTRY_ICRP_DATA=(.*?);\n', html)
data = json.loads(match[1])
irregular = [base+offset for base in range(0,360,45) for offset in [0,5,15,25,35]]
cases = [('thyroid','GANTRY_LIVE_ATLAS',irregular),
         ('exploration','GANTRY_LIVE_ATLAS_EXPLORACION',list(np.arange(0,360,22.5))),
         ('parathyroid','GANTRY_LIVE_ATLAS_PARATIROIDES',irregular)]
provenance = {}
for name, variable, angles in cases:
    url = json.loads(re.search(r'window\.'+variable+r'=(.*?);', html)[1])
    source = ROOT / url
    with Image.open(source) as image:
        image = image.convert('L')
        assert image.size == (480*8,960*((len(angles)+7)//8))
        frames = np.stack([np.array(image.crop((i%8*480,i//8*960,i%8*480+480,i//8*960+960)),dtype=np.uint16)*257
                           for i in range(len(angles))])
    scale = 2_000_000/float(frames[0].sum())
    data[name] = dict(angles=angles,width=480,height=960,scale=scale,window=65535*scale,
        headRow=0,footRow=960,pixelMm=1750/960,transversePxPerCm=480/50,
        source='Atlas 360 previo · intensidad normalizada',
        url=asset(zlib.compress(frames.astype('<u2').tobytes(),9),'atlas-'+name,'deflate'))
    provenance[name] = dict(source=url,sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
        angles=angles,normalization='2 M reference in the anterior view; PNG luminance as relative activity weights.',
        limitation='Not quantitative clinical counts or an ICRP organ-seeded activity volume. Original image noise may remain.')
    print(name,len(angles),'views',data[name]['url'])
html = html[:match.start(1)] + json.dumps(data,separators=(',',':')) + html[match.end(1):]
page.write_text(html,encoding='utf-8',newline='\n')
(ROOT/'assets/icrp145/static-atlas-provenance.json').write_text(json.dumps(provenance,indent=2,ensure_ascii=False),encoding='utf-8')
