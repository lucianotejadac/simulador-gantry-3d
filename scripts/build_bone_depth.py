"""Attenuation-weighted bone depth moments from the same native 3 mm phantom.
Coarse 60 x 48 mm tiles describe depth, never anatomical image intensity.
Depth is measured from the first tissue intersection on each detector ray.
"""
from pathlib import Path
import math, json, hashlib, zlib
import numpy as np
from numba import njit, prange, set_num_threads
from build_mdp_fine import volume, ROOT

@njit(parallel=True, cache=True)
def moments(activity, mu, theta):
    nz,ny,nx=activity.shape
    out=np.zeros((768,320,3),np.float32)
    c,s=math.cos(theta),math.sin(theta);cx,cy=(nx-1)/2,(ny-1)/2
    depth=int(math.ceil(math.sqrt(nx*nx+ny*ny)/2))+2
    phase=.5*abs(c);pad=(768-nz)//2
    for row in prange(nz):
        z=nz-1-row
        for col in range(320):
            u=col-cx;optical=0.;front=1e9
            for k in range(2*depth+2):
                d=depth-k+phase;x=cx+u*c-d*s;y=cy-u*s-d*c
                ix=int(math.floor(x));iy=int(math.floor(y))
                if ix < -1 or iy < -1 or ix>=nx or iy>=ny:continue
                fx=x-ix;fy=y-iy;a=0.;m=0.
                for dy in range(2):
                    yy=iy+dy
                    if yy<0 or yy>=ny:continue
                    for dx in range(2):
                        xx=ix+dx
                        if xx<0 or xx>=nx:continue
                        w=(fx if dx else 1-fx)*(fy if dy else 1-fy)
                        a+=activity[z,yy,xx]*w;m+=mu[z,yy,xx]*w
                if front==1e9 and m>.02:front=d
                dist=max(0.,(front-d)*3) if front!=1e9 else 0.
                weight=a*math.exp(-optical-m*.15)
                out[row+pad,col,0]+=weight
                out[row+pad,col,1]+=weight*dist
                out[row+pad,col,2]+=weight*dist*dist
                optical+=m*.3
    return out

def main():
    set_num_threads(6)
    path=ROOT/'assets/icrp145/mdp-provenance.json'
    meta=json.loads(path.read_text(encoding='utf-8'))
    for pose in ['down','up']:
        a,mu=volume(pose);tiles=[]
        for angle in range(360):
            m=moments(a,mu,math.radians(angle))
            tiles.append(m.reshape(48,16,16,20,3).sum(axis=(1,3)))
            if angle%60==0:print(pose,angle,flush=True)
        values=np.stack(tiles).astype('<f4');raw=zlib.compress(values.tobytes(),7)
        url='assets/runtime/mdp-depth-'+pose+'.'+hashlib.sha256(raw).hexdigest()[:16]+'.bin'
        (ROOT/url).write_bytes(raw)
        meta['poses'][pose]['nativeBone']['depth']={'url':url,'width':16,'height':48,
            'channels':['attenuatedMass','massTimesDepthMm','massTimesDepthSquaredMm2'],
            'tileWidthPx':20,'tileHeightPx':16,'convention':'first tissue intersection per ray; attenuation-weighted ROI moments',
            'model':'bone-ray-depth-rms-v1'}
        means=values[:,:,:,1].sum((1,2))/values[:,:,:,0].sum((1,2))
        print(pose,'depth range mm',float(means.min()),float(means.max()),'bytes',len(raw),flush=True)
    meta['depthGeneratorHash']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    path.write_text(json.dumps(meta,indent=2)+'\n',encoding='utf-8')

if __name__=='__main__':main()
