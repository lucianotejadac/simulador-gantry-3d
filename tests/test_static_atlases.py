"""Regression: former PNG studies must use organ-derived volumes."""
from pathlib import Path
import json
import re

root = Path(__file__).resolve().parents[1]
html = (root/'index.html').read_text(encoding='utf-8')
data = json.loads(re.search(r'window.GANTRY_ICRP_DATA=(.*?);\n',html)[1])
legacy = json.loads((root/'assets/icrp145/static-atlas-provenance.json').read_text(encoding='utf-8'))
for name in ['thyroid','exploration','parathyroid']:
    p = data[name]
    assert p['source'].startswith('ICRP 145')
    assert p['width']==256 and p['height']==640 and p['pixelMm']==3
    assert len(p['angles'])==72
    assert 'icrp-'+name+'.' in p['url']
    descriptor = re.search(r'    '+name+r':\{(.*?)\n    \},',html,re.S)[1]
    assert 'new Image' not in descriptor and 'source:' not in descriptor
    assert descriptor.count('angles:')==1
    assert f'angles:window.GANTRY_ICRP_DATA.{name}.angles' in descriptor
    assert legacy[name]['source'] not in html
    print(name, 'ICRP volume active, no legacy image fallback or obsolete angles')
