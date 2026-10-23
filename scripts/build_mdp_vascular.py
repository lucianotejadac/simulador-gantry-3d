"""Restore the omitted ICRP leg-artery basis in the MDP spatial phantom.

Uses only existing synthetic, attenuated MAG3 projections, never patient pixels.
Each source basis is unit activity before attenuation. Equal territory weights
are a documented teaching approximation, not measured blood flow fractions.
"""
from pathlib import Path
import json,re,zlib,hashlib
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
TERRITORIES=[12,13,14]
WEIGHTS=[1/3,1/3,1/3]
VASCULAR_MODEL={'model':'icrp-upper-abdominal-leg-arteries-v2','sourceComponents':TERRITORIES,'territoryWeights':WEIGHTS,
    'source':'Existing synthetic ICRP 145 vascular labels projected at 36 angles with attenuation.',
    'limitations':'Equal territory activity fractions are illustrative. No patient anatomy, lesions or image pixels are included.'}
def main():
    html=(ROOT/'index.html').read_text(encoding='utf-8')
    mag=json.loads(re.search(r'window.GANTRY_MAG3_DATA=(.*?);\n',html)[1])
    path=ROOT/'assets/icrp145/mdp-provenance.json'
    meta=json.loads(path.read_text(encoding='utf-8'))
    for pose in ['down','up']:
        payload=meta['poses'][pose]['organs']
        # Preserve other six organ bases byte-for-byte, including their scales.
        q=np.frombuffer(zlib.decompress((ROOT/payload['url']).read_bytes()),'<u2').copy().reshape(7,36,384,160)
        src=np.frombuffer(zlib.decompress((ROOT/mag['urls'][pose]).read_bytes()),'<u2').reshape(15,36,384,160)
        arteries=sum(src[c].astype(np.float64)*mag['scales'][pose][c]*w for c,w in zip(TERRITORIES,WEIGHTS))
        scale=float(arteries.max())/65535;q[6]=np.rint(arteries/scale).astype('<u2')
        scales=list(payload['scales']);scales[6]=scale
        packed=zlib.compress(q.tobytes(),9)
        url='assets/runtime/mdp-organs-'+pose+'.'+hashlib.sha256(packed).hexdigest()[:16]+'.bin'
        (ROOT/url).write_bytes(packed);meta['poses'][pose]['organs']={'url':url,'scales':scales}
        print(pose,len(packed),'bytes')
    meta['vascularModel']=VASCULAR_MODEL
    path.write_text(json.dumps(meta,indent=2)+'\n',encoding='utf-8')
if __name__=='__main__':main()
