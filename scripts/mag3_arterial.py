"""Illustrative first-pass transit; organ anatomy from ICRP, timings synthetic."""
import numpy as np

COMPONENTS = ['cortex_i','pelvis_i','cortex_d','pelvis_d','ureter_i','ureter_d',
              'bladder','blood','background','liver','central_blood','lungs',
              'upper_arteries','abdominal_arteries','leg_arteries']
REFERENCE = 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6020824/'

def first_pass(t, original):
    """Redistribute circulating activity, never add a second injected dose.

    Renal tissue/excretion curves are preserved. A short vascular component is
    added within the kidney masks, distinct temporally from retained activity.
    After 60 s all instantaneous components equal the previous basal model.
    """
    t=np.asarray(t)
    peaks=np.array([4.,7.,10.,12.,15.,18.])
    widths=np.array([2.5,2.5,2.5,2.5,3.,3.5])
    route=np.exp(-.5*((t[None,:]-peaks[:,None])/widths[:,None])**2)
    route/=np.maximum(route.sum(0),1e-300)
    fade=np.clip((60-t)/30,0,1)
    fraction=.95*np.exp(-np.maximum(t-18,0)/6)*fade
    pool=original[7:10].sum(0)
    transfer=route*(pool*fraction)[None,:]
    result=np.zeros((len(COMPONENTS),len(t)))
    result[:10]=original
    result[7:10]*=1-fraction
    result[10:14]=transfer[:4]
    result[0]+=transfer[4]*.49
    result[2]+=transfer[4]*.51
    result[14]=transfer[5]
    assert np.all(result>=0)
    assert np.allclose(result.sum(0),original.sum(0),atol=1e-12)
    assert np.array_equal(result[:10,t>=60],original[:,t>=60])
    meta={'method':'Mass-conserving redistribution of circulating activity; synthetic transit, not measured haemodynamics',
          'routes':['central_blood','lungs','upper_arteries','abdominal_arteries','renal_perfusion','leg_arteries'],
          'nominal_peak_s':peaks.tolist(),'width_s':widths.tolist(),
          'actual_peak_s':[float(t[np.argmax(c)]) for c in transfer],
          'end_s':60,'mass_balance_max_error':float(np.max(abs(result.sum(0)-original.sum(0)))),
          'reference':REFERENCE}
    return result,meta

def vascular_labels(work, full):
    """Voxelize genuine trunk/limb arterial and venous labels missing in cache."""
    from pathlib import Path
    import sys,pandas as pd
    cache=work/'icrp145-mag3-cuerpo-entero/vasos_3mm.npz'
    if cache.exists():
        saved=np.load(cache)
        if saved['organo'].shape==full['reg'].shape and np.array_equal(saved['origen'],full['origen']):
            return saved['organo']
    sys.path.insert(0,str(work/'simulador-renograma-mc/src'))
    from icrp145 import _voxelizar
    parts=[]
    source=work/'icrp145/Phantom_data/MRCP_AM/MRCP_AM.ele'
    for frame in pd.read_csv(source,sep=r'\s+',skiprows=1,header=None,usecols=[1,2,3,4,5],dtype=np.int32,chunksize=500000):
        a=frame.to_numpy();parts.append(a[np.isin(a[:,4],[900,910,1000,1010,1100,1110,1200,1210])])
    tet=np.concatenate(parts);nodes=np.load(work/'icrp145-oseo-360/nodos.npy')
    org=np.zeros(full['reg'].shape,np.uint16)
    _voxelizar(np.ascontiguousarray(nodes),np.ascontiguousarray(tet[:,:4]),tet[:,4].astype(np.uint16),
               full['origen']/10,.3,*org.shape,org)
    np.savez_compressed(cache,organo=org,origen=full['origen'])
    return org
