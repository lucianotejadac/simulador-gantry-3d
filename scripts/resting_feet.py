"""Supine resting feet: gradual external rotation, inspired by case 3.

Coordinates are the padded ICRP 3 mm volume (z,y,x). No patient anatomy is
reconstructed from the PDF. Apply exactly once to original source volumes.
"""
import numpy as np
from scipy.ndimage import map_coordinates

MODEL = dict(model='supine-external-feet-v1',externalRotationDegrees=35,
             fullRotationBelowMm=120,transitionEndMm=336,
             ankleCentersYX=[[70,136],[70,182]],voxelMm=3,
             reference='Case 3, pages 7–9, Mesa_Redonda_1_Musculoesqueletico_2026.pptx.pdf',
             limitation='Illustrative resting posture; angle inferred visually, not measured patient geometry.')

def relax(volume, conserve=False):
    """Rotate lower tissue in XY about each ankle; preserve all upper voxels.

    Slice rotations have unit Jacobian; correct small interpolation error per
    side/slice for emission only. Attenuation coefficients are never normalized.
    """
    result=volume.copy();nz=min(112,volume.shape[0]);ny,nx=volume.shape[1:]
    yy,xx=np.mgrid[:ny,:nx];middle=159
    for side,cx in [(-1,136),(1,182)]:
        source=volume[:nz].copy()
        if side<0:source[:,:,middle:]=0
        else:source[:,:,:middle]=0
        for z in range(nz):
            u=np.clip((z-40)/72,0,1);angle=np.deg2rad(side*35)*(1-u*u*(3-2*u))
            c,s=np.cos(angle),np.sin(angle)
            # Inverse rigid sampling: toes (negative Y) rotate outwards.
            sx=cx+c*(xx-cx)+s*(yy-70);sy=70-s*(xx-cx)+c*(yy-70)
            moved=map_coordinates(source[z],[sy,sx],order=1,mode='constant',prefilter=False)
            if conserve:
                before=source[z].sum(dtype=float);after=moved.sum(dtype=float)
                if after>0:moved*=before/after
            if side<0:result[z]=moved
            else:result[z]+=moved
    return result
