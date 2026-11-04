"""Illustrative isolated cellulitis: superficial right foot/ankle, no bone focus.

Extent, redistribution and clearance are teaching parameters, not patient fits.
The source volume and the existing case remain unchanged.
"""
from pathlib import Path
import sys, json, zlib, hashlib
import numpy as np
from scipy.ndimage import distance_transform_edt
from numba import set_num_threads

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent/'icrp145-multitrazador-ap-pa'))
from generar_mibi_360 import project


def main():
    set_num_threads(6)
    source = np.load(ROOT.parent/'simulador-renograma-mc/salida_osea/cuerpo.npz')
    reg = source['reg'][:80]
    z, y, x = np.ogrid[:80, :104, :193]
    tissue = reg > 0
    # Transverse distance to skin avoids treating the cut at z=80 as skin.
    depth = np.stack([distance_transform_edt(plane) for plane in tissue])*3
    soft = tissue & ~np.isin(reg, [2, 3, 4]) & (x < 96)
    superficial = np.exp(-.5*((depth-5)/4)**2)*soft
    def focus(center, radii):
        d = sum(((a-c)/r)**2 for a, c, r in zip((z,y,x), center, radii))
        return np.exp(-1.3*d)*(d < 4)
    # Overlapping smooth regions follow the skin instead of a compact bone spot.
    pool = superficial*(focus((27,68,73),(19,21,15)) +
                        .45*focus((12,57,73),(10,20,13)))
    perfusion = superficial*(focus((37,69,73),(25,22,16)) + .25*pool)
    mu = np.zeros((80,104,320), np.float32)
    mu[:,:,63:256] = source['mu'][:80]
    groups = []
    for label, raw in [('pool',pool), ('perfusion',perfusion)]:
        assert raw.sum() > 0 and not np.any(raw[np.isin(reg,[2,3,4])])
        activity = np.zeros_like(mu)
        activity[:,:,63:256] = raw/raw.sum()
        frames = []
        for angle in range(0,360,10):
            local = project(activity,mu,np.deg2rad(angle),320,80)/.3
            frame = np.zeros((768,320),np.float32)
            frame[679:759] = local
            frames.append(frame.reshape(384,2,160,2).sum((1,3)))
        groups.append(frames)
        print(label, '36 attenuated views', flush=True)
    frames = np.asarray(groups)
    scales = frames.max(axis=(1,2,3))/65535
    payload = zlib.compress(np.rint(frames/scales[:,None,None,None]).astype('<u2').tobytes(),9)
    url = 'assets/runtime/cellulitis-case.'+hashlib.sha256(payload).hexdigest()[:16]+'.bin'
    (ROOT/url).write_bytes(payload)
    meta = dict(id='caso-oseo-2',name='Caso óseo 2',model='cellulitis-right-foot-v1',
        diagnosis='Isolated cellulitis without added pathological bone uptake',
        sources=[
            'https://epos.myesr.org/poster/esr/ecr2003/C-0773/imaging%20findings%20or%20procedure%20',
            'https://pmc.ncbi.nlm.nih.gov/articles/PMC4932135/'],
        limitations='Illustrative ICRP soft-tissue lesion. Extent, fractions and clearance are teaching assumptions, not quantitative patient measurements.',
        width=160,height=384,pixelMm=6,angles=list(range(0,360,10)),url=url,scales=scales.tolist(),
        components=['pool','perfusion'],side='right',region='superficial foot/ankle',
        kinetics=dict(bloodFraction=.008,softFraction=.012,arterialFraction=.025,
                      poolRiseSeconds=[3,40],washoutStartSeconds=180,washoutTauSeconds=900))
    (ROOT/'assets/physics/cellulitis-case.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')


if __name__ == '__main__':
    main()
