"""Local 3D display approximation for the coarse ICRP pelvic arterial tree.

Track the dominant connected arterial cross section from each groin, retaining
the source's distinct left/right paths. Smooth their centres and calibres before
projection; retain a faint contribution from secondary branches. This is a
perfusion teaching phantom, not a new anatomical or angiographic reference.
"""
import numpy as np
from scipy.ndimage import label, gaussian_filter1d

MODEL = {'model': 'icrp-pelvic-perfusion-paths-v1',
         'rangeMm': [-260, 220], 'edgeBlendMm': 30,
         'centreSmoothingMm': 12, 'secondaryBranchFraction': .12,
         'limitations': 'Illustrative 3D perfusion appearance; source-derived main paths with reduced secondary branches, not validated vessel anatomy.'}

def pelvic_perfusion(mask, origin, spacing=3):
    """Return relative concentration, preserving the source outside the pelvis/thigh ROI."""
    z=origin[2]+(np.arange(mask.shape[0])+.5)*spacing
    rows=np.flatnonzero((z>=MODEL['rangeMm'][0])&(z<=MODEL['rangeMm'][1]))
    seed=int(np.argmin(abs(z[rows])))
    candidates=[]
    for row in rows:
        lab,n=label(mask[row]); sections=[]
        for i in range(1,n+1):
            p=np.argwhere(lab==i)
            sections.append((p.mean(0),float(len(p))))
        if not sections: raise ValueError('Missing axial vascular section; refusing to invent a vessel')
        candidates.append(sections)
    yy,xx=np.indices(mask.shape[1:]); tubes=np.zeros((len(rows),*mask.shape[1:]),np.float32)
    paths=[]
    for side in [-1,1]:
        start=(np.array([-48.,side*78.])-origin[[1,0]])/spacing-.5
        centres=np.zeros((len(rows),2));areas=np.zeros(len(rows))
        for indices in [range(seed,len(rows)),range(seed,-1,-1)]:
            previous=start.copy()
            for j in indices:
                valid=[(p,a) for p,a in candidates[j]
                       if z[rows[j]]>=180 or (origin[0]+(p[1]+.5)*spacing)*side>0]
                if not valid: raise ValueError('Missing left/right arterial path')
                p,a=min(valid,key=lambda pa:np.sum((pa[0]-previous)**2)-2*np.log1p(pa[1]))
                centres[j]=p;areas[j]=a;previous=p
        sigma=MODEL['centreSmoothingMm']/spacing
        centres=gaussian_filter1d(centres,sigma,axis=0,mode='nearest')
        areas=gaussian_filter1d(areas,sigma,mode='nearest')
        # Smooth cross sections with source-derived area. Unit-density integral
        # remains area; no arbitrary bright pixels at small voxelised branches.
        variance=np.maximum(areas/(2*np.pi),.4)
        for j,(cy,cx) in enumerate(centres):
            tube=areas[j]/(2*np.pi*variance[j])*np.exp(-((yy-cy)**2+(xx-cx)**2)/(2*variance[j]))
            tubes[j]=np.maximum(tubes[j],tube) # merge the two tracks at the aorta
        paths.append(centres)
    blend=np.minimum((z[rows]-z[rows[0]]),(z[rows[-1]]-z[rows]))/MODEL['edgeBlendMm']
    blend=np.clip(blend,0,1);blend=blend*blend*(3-2*blend)
    original=mask.astype(np.float32)
    branch=MODEL['secondaryBranchFraction']
    original[rows]=(1-blend[:,None,None])*original[rows]+blend[:,None,None]*(branch*original[rows]+(1-branch)*tubes)
    return original, {'rows':rows,'paths':paths,'blend':blend}
