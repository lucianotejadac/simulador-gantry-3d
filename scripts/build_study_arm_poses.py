"""Additional arm poses from transported activity and tissue attenuation, not image filters.

Preserves the original reference normalization across poses and projection angles.
Source volumes remain outside the repository.
"""
from pathlib import Path
import copy, json, math, re, sys, zlib
import numpy as np
from scipy.ndimage import gaussian_filter
from numba import set_num_threads
from externalize_assets import asset

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT.parent/'icrp145-multitrazador-ap-pa'
sys.path.insert(0,str(SRC))
import generar as source
from generar_mibi_360 import project
from arm_posture import elevate

def main():
    set_num_threads(6)
    reg,mu,org,origin=source.load_volume()
    angles=list(range(0,360,5));descriptors={};report={}
    out=SRC/'all-study-arm-poses';out.mkdir(exist_ok=True)
    for name,case_id in [('thyroid','pertecnetato'),('exploration','i131'),('dmsa','dmsa'),('maa','maa'),('mibi','mibi')]:
        case=copy.deepcopy(next(c for c in source.CASES if c['id']==case_id))
        activity=source.uptake(case,reg,org,origin)
        if name=='mibi':
            # Keep exactly the approved LV emitter and central organ activity.
            original=np.load(SRC/'mibi-360-brazos-arriba/volumen_mibi_brazos_arriba.npz')['actividad']
            arm=np.load(source.BASE/'brazos-arriba/mascara_brazos_original.npz')['brazos']
            activity[~arm]=original[:reg.shape[0],:,63:63+reg.shape[2]][~arm]
            case['fwhm']=15
        if name=='mibi':
            volume=np.load(SRC/'mibi-360-brazos-arriba/volumen_mibi_brazos_arriba.npz')
            raised,raised_mu=volume['actividad'],volume['mu']
            metadata={'method':'Same central activity and original arms-down tissue; raised reference is the established MIBI volume'}
        else:raised,raised_mu,metadata=elevate(activity,reg,mu,org,origin)
        energy_factor=.7 if case['energy']==364 else 1.
        sigma=case['fwhm']/2.35482/3
        # MIBI's existing reference is arms up; the other references are down.
        ref=project(raised,raised_mu*energy_factor,0,320,768) if name=='mibi' else project(activity,mu*energy_factor,0)
        factor=2_000_000/float(gaussian_filter(ref,sigma).sum())
        pose='down' if name=='mibi' else 'up'
        a,m,width,height=(activity,mu,256,640) if pose=='down' else (raised,raised_mu,320,768)
        frames=[]
        for i,angle in enumerate(angles):
            frames.append(gaussian_filter(project(a,m*energy_factor,math.radians(angle),width,height),sigma)*factor)
            if i%12==0:print(name,pose,i+1,'/72',flush=True)
        frames=np.stack(frames);scale=float(frames.max())/65535
        top=float(origin[2])+(a.shape[0]+(height-a.shape[0])//2)*3
        key=name+'_'+pose
        descriptors[key]=dict(angles=angles,width=width,height=height,pixelMm=3,scale=scale,
            headRow=(top-881.44478)/3,footRow=(top+878.60229)/3,
            window=float(np.percentile(frames[frames>frames.max()*.015],99.5)),
            source='ICRP 145 · postura articulada simulada · atenuación por tejidos',
            url=asset(zlib.compress(np.rint(frames/scale).astype('<u2').tobytes(),9),'icrp-'+key,'deflate'))
        report[key]=dict(posture=metadata,referencePose='up' if name=='mibi' else 'down',
            normalizationFactor=factor,energyFactor=energy_factor,
            transport='Parallel rays; exp(-integral mu ds) for each source voxel and angle; no per-view renormalization',
            angularTotals=frames.sum(axis=(1,2)).tolist(),descriptor=descriptors[key])
        np.savez_compressed(out/(key+'.npz'),frames=frames)
    page=ROOT/'index.html';html=page.read_text(encoding='utf-8')
    match=re.search(r'window.GANTRY_ICRP_DATA=(.*?);\n',html)
    data=json.loads(match[1]);data.update(descriptors)
    page.write_text(html[:match.start(1)]+json.dumps(data,separators=(',',':'))+html[match.end(1):],encoding='utf-8')
    (ROOT/'assets/icrp145/arm-poses-provenance.json').write_text(json.dumps(report,indent=2),encoding='utf-8')

if __name__=='__main__':main()
