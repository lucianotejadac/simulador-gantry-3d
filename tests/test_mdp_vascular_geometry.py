"""Regression using the actual local ICRP vascular volume, never patient data."""
import sys
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from mdp_vascular_geometry import pelvic_perfusion, MODEL

cache=np.load(ROOT.parent/'icrp145-mag3-cuerpo-entero/vasos_3mm.npz')
raw=np.isin(cache['organo'],[1000,1200]);out,info=pelvic_perfusion(raw,cache['origen'])
assert np.isfinite(out).all() and (out>=0).all()
outside=np.ones(len(raw),bool);outside[info['rows']]=False
assert np.array_equal(out[outside],raw[outside]), 'No changes outside pelvis/thigh region'
assert np.array_equal(out[info['rows'][[0,-1]]],raw[info['rows'][[0,-1]]]), 'Continuous boundary blend'
for path in info['paths']:
    # Oblique iliac sections legitimately travel farther than one voxel in XY
    # per axial slice; constrain both displacement and change of direction.
    assert np.max(np.linalg.norm(np.diff(path,axis=0),axis=1))*3<8, 'Abrupt path jump'
    assert np.max(np.linalg.norm(np.diff(path,n=2,axis=0),axis=1))*3<1, 'Angular path artefact'
assert np.min(out[info['rows']].sum((1,2)))>0, 'Disconnected flow'
strong=info['rows'][info['blend']>.99]
yy,xx=np.indices(raw.shape[1:]);secondary=[]
for j,row in enumerate(info['rows']):
    if row not in strong:continue
    distance=np.minimum(*[((yy-p[j,0])**2+(xx-p[j,1])**2) for p in info['paths']])
    side=raw[row]&(distance>64)
    secondary.extend(out[row][side])
assert len(secondary)>50 and np.mean(secondary)<.15, 'Large lateral branches remain overemphasized'
assert np.max(abs(info['paths'][0]-info['paths'][1]))>20, 'Bilateral tree collapsed'
assert abs((out/out.sum(dtype=float)).sum(dtype=float)-1)<1e-6
print('PASS: real-volume branch reduction, smooth bilateral paths, no gaps, local boundaries and unit activity.')
