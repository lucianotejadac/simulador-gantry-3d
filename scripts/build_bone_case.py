"""Case 3: illustrative right hindfoot volumes, projected through ICRP tissue.

PDF pages 6-9 establish location and triphasic asymmetry, not quantitative
kinetics. Spatial dimensions and redistribution fractions are model assumptions.
No patient identifiers or source image pixels are included.
"""
from pathlib import Path
import sys, json, zlib, hashlib
import numpy as np
from numba import set_num_threads
from resting_feet import relax, MODEL as FOOT_MODEL

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent/'icrp145-multitrazador-ap-pa'))
from generar_mibi_360 import project

def main():
    set_num_threads(6)
    v = np.load(ROOT.parent/'simulador-renograma-mc/salida_osea/cuerpo.npz')
    reg = v['reg'][:80]
    z,y,x = np.ogrid[:80,:104,:193]
    # LPS: lower x is patient right. z increases from soles towards head.
    def focus(center, radii):
        d = sum(((a-c)/r)**2 for a,c,r in zip((z,y,x),center,radii))
        a = np.exp(-2*d)*(d<=4)*(reg>0)
        return a.astype(np.float32)
    bone = focus((25,70,73),(9,12,8))*np.where(np.isin(reg,[2,3,4]),1,.08)
    pool = focus((26,70,73),(15,17,12))
    arterial = focus((38,70,73),(24,13,10))
    mu = np.zeros((80,104,320),np.float32)
    mu[:,:,63:256] = v['mu'][:80]
    mu=relax(mu)
    groups=[]
    for label,raw in zip(['bone','pool','perfusion'],[bone,pool,arterial]):
        a=np.zeros_like(mu); a[:,:,63:256]=raw/raw.sum()
        a=relax(a,conserve=True)
        frames=[]
        for angle in range(0,360,10):
            # Project only the lower 24 cm: no other z slice contributes to
            # parallel planar rays. Embed in the same 750-slice atlas geometry.
            local=project(a,mu,np.deg2rad(angle),320,80)/.3
            image=np.zeros((768,320),np.float32);image[679:759]=local
            frames.append(image.reshape(384,2,160,2).sum((1,3)))
        groups.append(frames)
        print(label, '36 attenuated views', flush=True)
    frames=np.asarray(groups)
    scales=frames.max(axis=(1,2,3))/65535
    raw=zlib.compress(np.rint(frames/scales[:,None,None,None]).astype('<u2').tobytes(),9)
    url='assets/runtime/bone-case.'+hashlib.sha256(raw).hexdigest()[:16]+'.bin'
    (ROOT/url).write_bytes(raw)
    meta=dict(id='caso-oseo',name='Caso óseo',model='case3-right-hindfoot-v1',
        source='Mesa_Redonda_1_Musculoesqueletico_2026.pptx.pdf, case 3, pages 6–9',
        limitations='Illustrative ICRP lesion, not reconstructed patient anatomy. Dimensions, uptake fractions and timing are assumptions; PDF has no quantitative calibration.',
        width=160,height=384,pixelMm=6,angles=list(range(0,360,10)),url=url,scales=scales.tolist(),
        components=['bone','pool','perfusion'],redistribution=[.04,.006,.012,0,0,0,0,.025],
        voxelCenterZYX=[25,70,73],voxelMm=3,side='right',region='ankle/hindfoot',footPosture=FOOT_MODEL)
    (ROOT/'assets/physics/bone-case.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')

if __name__=='__main__': main()
