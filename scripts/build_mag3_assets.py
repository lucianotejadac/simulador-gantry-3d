"""Embed basal MAG3 kinetics and angle/pose-dependent organ projections."""
from pathlib import Path
import base64, json, sys, zlib, re, hashlib
import numpy as np
from scipy.ndimage import affine_transform, gaussian_filter
from scipy.spatial.transform import Rotation

ROOT=Path(__file__).resolve().parents[1];WORK=ROOT.parent
sys.path.insert(0,str(WORK/'icrp145-multitrazador-ap-pa'))
from generar_mibi_360 import project
from numba import set_num_threads
set_num_threads(6)
SOURCE=WORK/'icrp145-mag3-cuerpo-entero'
source=np.load(SOURCE/'basal/dinamica.npz')
full=np.load(WORK/'simulador-renograma-mc/salida_osea/cuerpo.npz')
org=np.load(WORK/'icrp145-multitrazador-ap-pa/organos_3mm.npz')['organo'].copy()
ureters=np.load(SOURCE/'ureteres_remuestreados.npz')['organo'];org[ureters>0]=ureters[ureters>0]
reg=full['reg'];arm=np.load(WORK/'icrp145-oseo-360/brazos-arriba/mascara_brazos_original.npz')['brazos']
origin=full['origen'];new_origin=origin-np.array([189,0,0])
mu_up=np.load(WORK/'icrp145-multitrazador-ap-pa/mibi-360-brazos-arriba/volumen_mibi_brazos_arriba.npz')['mu']
mu_down=full['mu'].copy()
correction=np.load(WORK/'icrp145-oseo-360/correccion_huesos_largos.npz')['organo']
mu_down[np.isin(correction,[1600,3100])]=.2732992
mu_down[np.isin(correction,[1800,3300])]=.1537*.981
body=(reg>0)&~np.isin(reg,[2,3]);shape=(750,104,320)
central=(slice(0,594),slice(None),slice(63,256))
def coarse(a):return a.reshape(375,2,52,2,160,2).sum((1,3,5))
def rotate(a,b):
    a=a/np.linalg.norm(a);b=b/np.linalg.norm(b);v=np.cross(a,b);s=np.linalg.norm(v)
    return Rotation.from_rotvec(v/s*np.arctan2(s,np.dot(a,b))).as_matrix()
coords=np.argwhere(arm);xyz=origin+(coords[:,::-1]+.5)*3
posemap=[]
for side,S,E,W in [(-1,[-184,20,570],[-211,85,291],[-241,84,30]),(1,[190,20,574],[199,83,291],[226,80,30])]:
    S,E,W=map(lambda p:np.array(p,float),(S,E,W));R1=rotate(E-S,np.array([.6*side,0,.8]));R2=rotate(W-E,np.array([-.6*side,0,.8]));elbow=S+R1@(E-S)
    for R,pivot,dest,upper in [(R1,S,S,True),(R2,E,elbow,False)]:
        mask=(xyz[:,0]*side>0)&((xyz[:,2]>=E[2]) if upper else (xyz[:,2]<E[2]))
        transformed=(xyz[mask]-pivot)@R.T+dest
        pos=((transformed-new_origin)/3-.5)[:,::-1];lo=np.floor(pos).astype(int);frac=pos-lo
        posemap.append((coords[mask],lo,frac))
def volume(weights,pose):
    v=np.zeros(shape,np.float32);v[central]=weights
    if pose=='up':
        v[central][arm]=0
        for old,lo,f in posemap:
            values=weights[tuple(old.T)]
            for dz in [0,1]:
                for dy in [0,1]:
                    for dx in [0,1]:
                        d=np.array([dz,dy,dx]);idx=lo+d;w=np.prod(np.where(d,f,1-f),axis=1)
                        assert (idx>=0).all() and (idx<np.array(shape)).all()
                        np.add.at(v,tuple(idx.T),values*w)
    assert abs(v.sum(dtype=float)-1)<1e-5
    return coarse(v)
mus={}
v=np.zeros(shape,np.float32);v[central]=mu_down;mus['down']=coarse(v)/8*2
v=np.zeros(shape,np.float32);v[:,:,:319]=mu_up;mus['up']=coarse(v)/8*2
ids=[[8900,9000],[9100],[9200,9300],[9400],[13500],[13600],[13800],None,None,[9500]]
angles=list(range(0,360,10));packed={};scales={}
for pose in ['down','up']:
    frames=[]
    for c,labels in enumerate(ids):
        if c==7:
            weights=body.astype(np.float32)*.2;weights[np.isin(org,[8800,900,910])]=12
            weights[np.isin(org,[8900,9000,9200,9300])]=3
        elif c==8:weights=body.astype(np.float32)
        else:
            weights=np.isin(org,labels).astype(np.float32)
            if c in [0,2]:weights[np.isin(org,[9000,9300])]*=.45
        weights/=weights.sum();activity=volume(weights,pose)
        series=np.stack([gaussian_filter(project(activity,mus[pose],np.deg2rad(a),160,384)/.3,9/2.35482/6) for a in angles])
        frames.append(series);print(pose,c,'ready',flush=True)
    frames=np.array(frames);scale=frames.max(axis=(1,2,3))/65535
    quant=np.rint(frames/scale[:,None,None,None]).astype('<u2')
    packed[pose]=base64.b64encode(zlib.compress(quant.tobytes(),9)).decode('ascii');scales[pose]=scale.tolist()
    if pose=='down':baseline_bases=frames[:,18].copy()
t=source['t_s'];A=source['actividad_relativa'];dt=np.diff(t)
integral=np.concatenate([np.zeros((10,1)),np.cumsum((A[:,1:]+A[:,:-1])*.5*dt,axis=1)],axis=1)
duration=source['duracion_s'];edges=np.r_[0,duration.cumsum()]
weights=np.array([np.diff(np.interp(edges,t,c)) for c in integral]).T
gain=float(source['cuentas_esperadas'].sum(dtype=float)/(weights@source['bases_por_organo'].sum((1,2))).sum())
# Align peak expected renal counts with the source despite coarse projector sampling.
source_left=float(source['bases_por_organo'][0].sum());coarse_left=float(baseline_bases[0].sum())
gain*=source_left/coarse_left
top=float(origin[2]+(750+(384*2-750)/2)*3)
payload={'width':160,'height':384,'pixelMm':6,'angles':angles,'scales':scales,'packed':packed,
    'headRow':(top-881.44478)/6,'footRow':(top+878.60229)/6,
    'integral':(integral*gain).T.tolist(),'dt':float(t[1]-t[0]),'edges':edges.tolist(),'duration':1200,
    'source':'ICRP 145 · MAG3 basal · 20 min','reference':'https://radiopaedia.org/cases/normal-captopril-renal-mag3-nuclear-study'}
meta={k:v for k,v in payload.items() if k not in ['packed','integral']}
meta['sha256_basal']=hashlib.sha256((SOURCE/'basal/dinamica.npz').read_bytes()).hexdigest()
meta['method']='Organ projections at 10 degrees, interpolated linearly, 6 mm grid and 9 mm PSF; two arm poses. Basal cumulative kinetics integrated at 0.25 s. Full detector counts; no renal mask.'
(ROOT/'assets/icrp145/mag3-procedencia.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
engine=(ROOT/'scripts/mag3_acquisition.js').read_text(encoding='utf-8')
block='<!-- MAG3_BEGIN -->\n<script>window.GANTRY_MAG3_DATA='+json.dumps(payload,separators=(',',':'))+';\n'+engine+'\n</script>\n<!-- MAG3_END -->'
p=ROOT/'index.html';html=p.read_text(encoding='utf-8')
if '<!-- MAG3_BEGIN -->' in html:html=re.sub(r'<!-- MAG3_BEGIN -->.*?<!-- MAG3_END -->',lambda _:block,html,flags=re.S)
else:html=html.replace('</body>',block+'\n</body>')
p.write_text(html,encoding='utf-8');print('MAG3 embedded',flush=True)
