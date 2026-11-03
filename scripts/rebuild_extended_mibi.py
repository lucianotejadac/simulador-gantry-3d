"""Repose the existing MIBI emitter without replacing its central-organ model."""
from pathlib import Path
import sys, json
import numpy as np
from scipy.ndimage import gaussian_filter
from numba import set_num_threads

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT.parent/'icrp145-multitrazador-ap-pa'
sys.path.insert(0,str(SRC))
import generar as source
from generar_mibi_360 import project
from arm_posture import elevate

def main():
    set_num_threads(6)
    folder=SRC/'mibi-360-brazos-arriba'
    path=folder/'volumen_mibi_brazos_arriba.npz'
    with np.load(path) as old:
        contents={k:old[k] for k in old.files}
    reg,mu,org,origin=source.load_volume()
    case=next(c for c in source.CASES if c['id']=='mibi')
    activity=source.uptake(case,reg,org,origin)
    arm=np.load(source.BASE/'brazos-arriba/mascara_brazos_original.npz')['brazos']
    central_tissue=(~arm)&(reg>0)
    activity[central_tissue]=contents['actividad'][:reg.shape[0],:,63:63+reg.shape[2]][central_tissue]
    raised,attenuation,metadata=elevate(activity,reg,mu,org,origin)
    contents.update(actividad=raised,mu=attenuation,reg=np.load(source.BASE/'brazos-arriba/volumen_articulado.npz')['reg'])
    np.savez_compressed(path,**contents)
    frames=[]
    for angle in range(0,360,5):
        frames.append(gaussian_filter(project(raised,attenuation,np.deg2rad(angle),320,768),15/2.35482/3))
        if angle%60==0:print('MIBI extended',angle,flush=True)
    frames=np.stack(frames);frames*=250000/frames[0].sum()
    np.savez_compressed(folder/'proyecciones_lineales.npz',cuentas_esperadas=frames,angulos=list(range(0,360,5)),pixel_mm=3)
    meta=json.loads((folder/'metadatos.json').read_text(encoding='utf-8'))
    meta.update(postura=metadata,ventana=float(np.percentile(frames[frames>frames.max()*.015],99.5)),cuentas_por_proyeccion=frames.sum(axis=(1,2)).tolist())
    (folder/'metadatos.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')

if __name__=='__main__':main()
