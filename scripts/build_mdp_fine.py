"""Reproject native 3 mm ICRP volumes; no coarse averaging or baked camera PSF.
Only the educational skeletal emission is regenerated. Organ bases retain their
documented 6 mm sampling. Cache intermediate floats outside the Git repository.
"""
from pathlib import Path
import sys,json,zlib,hashlib,time,argparse
import numpy as np
from numba import set_num_threads
from bone_emission import bone_emission, PARAMETERS
ROOT=Path(__file__).resolve().parents[1];WORK=ROOT.parent
sys.path.insert(0,str(WORK/'icrp145-multitrazador-ap-pa'))
from generar_mibi_360 import project

def volume(pose):
    if pose=='up':
        f=np.load(WORK/'icrp145-oseo-360/brazos-arriba/volumen_articulado.npz')
        a=bone_emission(f['reg']);m=f['mu']
        activity=np.zeros((750,104,320),np.float32);mu=np.zeros_like(activity)
        activity[:,:,:319]=a;mu[:,:,:319]=m
    else:
        f=np.load(WORK/'simulador-renograma-mc/salida_osea/cuerpo.npz')
        reg=f['reg'].copy();m=f['mu'].copy();hu=f['hu'];lesion=reg==11
        reg[lesion&(hu>500)]=2;reg[lesion&(hu>=0)&(hu<=500)]=3
        reg[lesion&(hu<0)]=4;reg[reg==12]=1
        correction=np.load(WORK/'icrp145-oseo-360/correccion_huesos_largos.npz')['organo']
        cortical=np.isin(correction,[1600,3100]);marrow=np.isin(correction,[1800,3300])
        reg[cortical]=2;reg[marrow]=4;m[cortical]=.2732992;m[marrow]=.1537*.981
        activity=np.zeros((750,104,320),np.float32);mu=np.zeros_like(activity)
        activity[:594,:,63:256]=bone_emission(reg);mu[:594,:,63:256]=m
    return activity,mu

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--pose',choices=['down','up','both'],default='both')
    args=parser.parse_args();set_num_threads(6)
    meta=json.loads((ROOT/'assets/icrp145/mdp-provenance.json').read_text(encoding='utf-8'))
    cache=WORK/'icrp145-mdp-native';cache.mkdir(exist_ok=True)
    for pose in (['down','up'] if args.pose=='both' else [args.pose]):
        activity,mu=volume(pose);start=time.time()
        frames=np.lib.format.open_memmap(cache/(pose+'.npy'),mode='w+',dtype=np.float32,shape=(360,768,320))
        for angle in range(360):
            frames[angle]=project(activity,mu,np.deg2rad(angle),320,768)/.3
            if angle%15==0: print(pose,angle+1,'/360',round(time.time()-start,1),'s',flush=True)
        frames.flush();scale=float(frames.max())/65535;chunks=[];size=12
        sums=frames.sum(axis=(1,2),dtype=np.float64)
        for first in range(0,360,size):
            q=np.rint(frames[first:first+size]/scale).astype('<u2')
            raw=zlib.compress(q.tobytes(),7)
            url='assets/runtime/mdp-native-'+pose+'-'+str(first).zfill(3)+'.'+hashlib.sha256(raw).hexdigest()[:16]+'.bin'
            (ROOT/url).write_bytes(raw)
            chunks.append({'first':first,'count':len(q),'url':url,'bytes':len(raw)})
        meta['poses'][pose]['nativeBone']={'width':320,'height':768,'pixelMm':3,
            'headRow':meta['headRow']*2,'footRow':meta['footRow']*2,'scale':scale,'chunkSize':size,
            'angles':list(range(360)),'chunks':chunks,'viewSums':sums.tolist(),
            'cameraPsfBakedMm':0,'emissionModel':PARAMETERS,'anatomicalVoxelMm':3}
        print(pose,'complete',sum(c['bytes'] for c in chunks),'compressed bytes',flush=True)
    meta['nativeBoneModel']='native-volume-3mm-no-camera-psf-v1'
    meta['limitations']+=' Native skeletal projections regenerated directly at 3 mm without the previous 6 mm downsampling or baked 6 mm camera PSF. Organ backgrounds remain 6 mm. Camera response applied at runtime; no submillimetre anatomy is claimed.'
    meta['nativeGeneratorHash']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    (ROOT/'assets/icrp145/mdp-provenance.json').write_text(json.dumps(meta,indent=2)+'\n',encoding='utf-8')
if __name__=='__main__':main()
