"""Depth moments must describe exactly the existing attenuated projections."""
import sys,json,zlib,math
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from build_bone_depth import moments
from numba import set_num_threads
set_num_threads(4)
meta=json.loads((ROOT/'assets/icrp145/mdp-provenance.json').read_text())
for pose in ['down','up']:
    b=meta['poses'][pose]['nativeBone'];d=b['depth']
    m=np.frombuffer(zlib.decompress((ROOT/d['url']).read_bytes()),dtype='<f4').reshape(360,48,16,3).astype(float)
    assert np.all(m>=0) and np.isfinite(m).all()
    np.testing.assert_allclose(m[:,:,:,0].sum((1,2)),b['viewSums'],rtol=2e-6)
    nonzero=m[:,:,:,0]>1e-15
    mean=m[:,:,:,1][nonzero]/m[:,:,:,0][nonzero]
    second=m[:,:,:,2][nonzero]/m[:,:,:,0][nonzero]
    assert np.all(second+1e-2>=mean**2)
# Known isolated source at 15 mm below the anterior slab surface.
a=np.zeros((2,20,320),np.float32);mu=np.zeros_like(a)
mu[:,:,140:180]=0
mu[:,5:15,140:180]=.15;a[:,10,160]=1
ap=moments(a,mu,0).sum((0,1));pa=moments(a,mu,math.pi).sum((0,1))
assert abs(ap[1]/ap[0]-15)<.01
assert abs(pa[1]/pa[0]-12)<.01
print('OK: 720 depth maps preserve projected attenuated mass; positive variance; known AP/PA source depth.')
