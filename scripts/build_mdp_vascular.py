"""Build a continuous lower arterial perfusion basis with attenuated 3D views.

Uses only existing synthetic, attenuated MAG3 projections, never patient pixels.
The upper tree retains one third of first-pass arterial activity. The lower
tree shares one concentration across abdomen and legs, without a label seam.
"""
from pathlib import Path
import json,re,zlib,hashlib,sys
import numpy as np
from scipy.ndimage import gaussian_filter
from mdp_vascular_geometry import pelvic_perfusion, MODEL
ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT.parent
VASCULAR_MODEL={'model':'icrp-continuous-lower-perfusion-v3','sourceComponents':[12,13,14],
    'territoryWeights':{'upper':1/3,'continuousAbdomenAndLegs':2/3},'geometry':MODEL,
    'source':'Synthetic ICRP 145 arterial labels, pelvis/thigh perfusion approximation, 36 attenuated angular projections.',
    'limitations':'Illustrative concentration and geometry. No patient anatomy, lesions or image pixels are included.'}

def lower_tree():
    sys.path.insert(0,str(WORK/'icrp145-multitrazador-ap-pa'))
    from generar_mibi_360 import project
    from numba import set_num_threads
    set_num_threads(6)
    full=np.load(WORK/'simulador-renograma-mc/salida_osea/cuerpo.npz')
    vascular=np.load(WORK/'icrp145-mag3-cuerpo-entero/vasos_3mm.npz')
    assert np.array_equal(vascular['origen'],full['origen'])
    org=np.load(WORK/'icrp145-multitrazador-ap-pa/organos_3mm.npz')['organo']
    renal_z=float(np.argwhere(np.isin(org,[8900,9200]))[:,0].mean()*3+full['origen'][2])
    z=full['origen'][2]+(np.arange(org.shape[0])+.5)*3
    raw=((vascular['organo']==1000)&(z[:,None,None]<=renal_z+90))|(vascular['organo']==1200)
    weights,_=pelvic_perfusion(raw,full['origen']);weights/=weights.sum(dtype=float)
    shape=(750,104,320);central=(slice(0,594),slice(None),slice(63,256))
    def coarse(a):return a.reshape(375,2,52,2,160,2).sum((1,3,5))
    v=np.zeros(shape,np.float32);v[central]=weights;activity=coarse(v)
    assert abs(activity.sum(dtype=float)-1)<1e-6
    results={}
    for pose in ['down','up']:
        v.fill(0)
        if pose=='down':
            mu=full['mu'].copy();correction=np.load(WORK/'icrp145-oseo-360/correccion_huesos_largos.npz')['organo']
            mu[np.isin(correction,[1600,3100])]=.2732992;mu[np.isin(correction,[1800,3300])]=.1537*.981
            v[central]=mu
        else:v[:,:,:319]=np.load(WORK/'icrp145-multitrazador-ap-pa/mibi-360-brazos-arriba/volumen_mibi_brazos_arriba.npz')['mu']
        mu=coarse(v)/8*2
        results[pose]=np.stack([gaussian_filter(project(activity,mu,np.deg2rad(a),160,384)/.3,9/2.35482/6) for a in range(0,360,10)])
        print(pose,'continuous lower tree projected',flush=True)
    return results
def main():
    html=(ROOT/'index.html').read_text(encoding='utf-8')
    mag=json.loads(re.search(r'window.GANTRY_MAG3_DATA=(.*?);\n',html)[1])
    path=ROOT/'assets/icrp145/mdp-provenance.json'
    meta=json.loads(path.read_text(encoding='utf-8'))
    lower=lower_tree()
    for pose in ['down','up']:
        payload=meta['poses'][pose]['organs']
        # Preserve other six organ bases byte-for-byte, including their scales.
        q=np.frombuffer(zlib.decompress((ROOT/payload['url']).read_bytes()),'<u2').copy().reshape(7,36,384,160)
        src=np.frombuffer(zlib.decompress((ROOT/mag['urls'][pose]).read_bytes()),'<u2').reshape(15,36,384,160)
        arteries=src[12].astype(np.float64)*mag['scales'][pose][12]/3+lower[pose]*2/3
        scale=float(arteries.max())/65535;q[6]=np.rint(arteries/scale).astype('<u2')
        scales=list(payload['scales']);scales[6]=scale
        packed=zlib.compress(q.tobytes(),9)
        url='assets/runtime/mdp-organs-'+pose+'.'+hashlib.sha256(packed).hexdigest()[:16]+'.bin'
        (ROOT/url).write_bytes(packed);meta['poses'][pose]['organs']={'url':url,'scales':scales}
        print(pose,len(packed),'bytes')
    meta['vascularModel']=VASCULAR_MODEL
    meta['vascularModel']['generatorSha256']=hashlib.sha256(Path(__file__).read_bytes()+(ROOT/'scripts/mdp_vascular_geometry.py').read_bytes()).hexdigest()
    path.write_text(json.dumps(meta,indent=2)+'\n',encoding='utf-8')
if __name__=='__main__':main()
