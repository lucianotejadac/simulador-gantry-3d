"""Separate cardiac MIBI into normalized 360-degree organ projection bases.
Retains the previously approved asymmetric enlarged LV emitter, not a new heart.
"""
from pathlib import Path
import sys, re, json, zlib, hashlib
import numpy as np
from scipy.ndimage import gaussian_filter
from numba import set_num_threads
from externalize_assets import asset

ROOT=Path(__file__).resolve().parents[1];WORK=ROOT.parent
SRC=WORK/'icrp145-multitrazador-ap-pa'
sys.path.insert(0,str(SRC))
from generar_mibi_360 import project
set_num_threads(6)

def main():
    html=(ROOT/'index.html').read_text(encoding='utf-8')
    mag=json.loads(re.search(r'window.GANTRY_MAG3_DATA=(.*?);\n',html)[1])
    source=SRC/'mibi-360-brazos-arriba'
    volume=np.load(source/'volumen_mibi_brazos_arriba.npz')
    organs=np.load(SRC/'organos_3mm.npz')['organo']
    lv=np.load(source/'miocardio_3d.npz')
    shape=(750,104,320)
    def coarse(v):return v.reshape(375,2,52,2,160,2).sum((1,3,5))
    v=np.zeros(shape,np.float32);v[:,:,:319]=volume['mu']
    mu=coarse(v)/8*2
    raw=np.frombuffer(zlib.decompress((ROOT/mag['urls']['up']).read_bytes()),'<u2').reshape(15,36,384,160)
    existing=raw.astype(np.float32)*np.array(mag['scales']['up'],np.float32)[:,None,None,None]
    custom={}
    for name,ids in [('heart',None),('gallbladder',[7000,7100]),('smallIntestine',[7500,7501]),('colon',[7700,7900,8100,8300,8500]),('glands',[12000,12100,13200])]:
        v=np.zeros(shape,np.float32)
        if name=='heart':
            lo=lv['origen_roi_zyx'].copy();lo[2]+=63
            slices=tuple(slice(int(x),int(x+n)) for x,n in zip(lo,lv['componente'].shape))
            v[slices]=lv['componente']
        else:v[:594,:,63:256]=np.isin(organs,ids)
        total=v.sum(dtype=float);assert total>0,name
        a=coarse(v/total)
        # Retain established 15 mm cardiac PSF; other organs use 9 mm.
        sigma=(15 if name=='heart' else 9)/2.35482/6
        custom[name]=np.stack([gaussian_filter(project(a,mu,np.deg2rad(angle),160,384)/.3,sigma) for angle in mag['angles']])
        print(name,'ready',flush=True)
    components=['heart','blood','soft','liver','gallbladder','smallIntestine','colon','kidneys','bladder','glands']
    bases=[custom['heart'],existing[7],existing[8],existing[9],custom['gallbladder'],custom['smallIntestine'],custom['colon'],.45*(existing[0]+existing[2])+.05*(existing[1]+existing[3]),existing[6],custom['glands']]
    frames=np.stack(bases);scales=frames.max(axis=(1,2,3))/65535
    packed=zlib.compress(np.rint(frames/scales[:,None,None,None]).astype('<u2').tobytes(),9)
    meta={k:mag[k] for k in ['width','height','pixelMm','angles','headRow','footRow']}
    meta.update(components=components,scales=scales.tolist(),url=asset(packed,'mibi-kinetic-up','bin'),
        posture='Arms up; derived ICRP 145 anatomy, same enlarged asymmetric LV as existing cardiac MIBI',
        sensitivityCpsPerMBq=100,halfLifeMinutes=360.402,maxMinutes=720,
        limitations='Educational compartment kinetics, not a measured camera calibration. LV is a synthetic emitter inside the ICRP cardiac envelope. 6 mm spatial sampling, 10 degree views. Pharmacologic-stress kinetics use rest as an explicit approximation.',
        sources=['https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=07c893fc-cfba-1d98-0232-6448463afb87','https://www.asnc.org/wp-content/uploads/2024/06/ASNC-SPECT-ProtocolsTracers-Guidelines2016.pdf'],
        sourceHashes={str(p.relative_to(WORK)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [source/'miocardio_3d.npz',source/'volumen_mibi_brazos_arriba.npz',SRC/'organos_3mm.npz',ROOT/mag['urls']['up']]})
    (ROOT/'assets/icrp145/mibi-kinetic-provenance.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')
    print(len(packed),'bytes',flush=True)

if __name__=='__main__':main()
