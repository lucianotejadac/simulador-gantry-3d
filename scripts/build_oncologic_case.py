"""Synthetic osteoblastic metastatic teaching case, projected from bone voxels.

Locations, extents and uptake weights are illustrative, not patient measurements.
The unchanged ICRP anatomy supplies both the skeletal support and attenuation.
"""
from pathlib import Path
import hashlib, json, sys, zlib
import numpy as np
from numba import set_num_threads
from build_mdp_fine import volume, project

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT.parent/'icrp145-oseo-360'
sys.path.insert(0, str(BASE))
from reparar_volumen import fill

# LPS millimetres; organ IDs verified against MRCP_AM.material.
LESIONS = [
    ('Columna dorsal', [4900,5000], [-5,40,465], [13,12,16], 1.2),
    ('Columna lumbar', [5100,5200], [0,30,240], [14,13,12], 1.0),
    ('Sacro', [5300,5400], [-15,75,100], [15,12,15], .85),
    ('Ilíaco izquierdo', [4100,4200], [110,35,80], [17,14,19], 1.4),
    ('Fémur proximal derecho', [2800,2900,3000], [-105,20,-30], [12,12,20], .75),
    ('Costilla derecha posterior', [4300,4400], [-110,60,490], [15,12,8], .55),
    ('Costilla izquierda lateral', [4300,4400], [110,-15,365], [14,14,8], .65),
]


def lesion_volume():
    source = np.load(ROOT.parent/'simulador-renograma-mc/salida_osea/cuerpo.npz')
    origin, shape = source['origen'], source['reg'].shape
    cache = ROOT.parent/'icrp145-oncologic-case'
    cache.mkdir(exist_ok=True)
    path = cache/'skeletal-organs.npz'
    if path.exists():
        organs = np.load(path)['organs']
    else:
        nodes, tet = np.load(BASE/'nodos.npy'), np.load(BASE/'tetraedros_oseos.npy')
        tet = tet[np.isin(tet[:,4], sorted({i for _,ids,*_ in LESIONS for i in ids}))]
        organs = fill(nodes, np.ascontiguousarray(tet[:,:4]), tet[:,4], origin/10, shape)
        np.savez_compressed(path, organs=organs)
    activity = np.zeros(shape, np.float32)
    metadata = []
    for label, ids, center, sigma, weight in LESIONS:
        coords = np.argwhere(np.isin(organs,ids))
        xyz = origin+(coords[:,::-1]+.5)*3
        distance = np.sum(((xyz-center)/sigma)**2,axis=1)
        selected = distance < 4
        coords, xyz, distance = coords[selected], xyz[selected], distance[selected]
        assert len(coords) > 8, (label, len(coords))
        values = np.exp(-.5*distance)
        activity[tuple(coords.T)] += weight*values/values.sum()
        metadata.append(dict(label=label,organIds=ids,centerLpsMm=center,sigmaMm=sigma,
            relativeWeight=weight,voxels=len(coords),centroidLpsMm=np.average(xyz,axis=0,weights=values).tolist()))
        print(label, len(coords), 'bone voxels', flush=True)
    assert not np.any(activity[organs==0])
    activity /= activity.sum(dtype=np.float64)
    padded = np.zeros((750,104,320),np.float32)
    padded[:594,:,63:256] = activity
    return padded, metadata


def main():
    set_num_threads(6)
    activity, lesions = lesion_volume()
    geometry = json.loads((ROOT/'assets/icrp145/mdp-provenance.json').read_text(encoding='utf-8'))
    poses = {}
    for pose in ['down','up']:
        _, mu = volume(pose)
        frames = []
        for angle in range(0,360,10):
            frames.append(project(activity,mu,np.deg2rad(angle),320,768)/.3)
        frames = np.asarray(frames)
        scale = float(frames.max())/65535
        payload = zlib.compress(np.rint(frames/scale).astype('<u2').tobytes(),9)
        url = 'assets/runtime/oncologic-case-'+pose+'.'+hashlib.sha256(payload).hexdigest()[:16]+'.bin'
        (ROOT/url).write_bytes(payload)
        poses[pose] = dict(url=url,scales=[scale])
        print(pose, '36 attenuated views,', len(payload), 'bytes', flush=True)
    meta = dict(id='caso-oseo-3',name='Caso óseo 3',model='osteoblastic-metastases-v1',
        diagnosis='Synthetic prostate cancer with multifocal osteoblastic skeletal metastases',
        sources=['https://pmc.ncbi.nlm.nih.gov/articles/PMC4932135/',
                 'https://sites.snmmi.org/Web/Clinical-Practice/Procedure-Standards/Standards/Bone-Scintigraphy-4-0'],
        limitations='Teaching distribution, not reconstructed patient data. Lesion sizes, sites and weights are illustrative. MDP uptake represents bone formation and is not specific to malignancy.',
        suggestedProtocol=dict(tracer='99mTc-MDP',phase='delayed',minutesAfterInjection=[120,240],
                               acquisition='whole-body with optional static/oblique views',requiresTriphasic=False),
        width=320,height=768,pixelMm=3,nativeSampling=True,headRow=geometry['headRow']*2,
        angles=list(range(0,360,10)),poses=poses,components=['bone'],
        redistribution=[.065,0,0,0,0,0,0,0],lesions=lesions,
        kinetics='Same continuous bone-binding and physical decay as normal skeletal MDP; no added perfusion or blood-pool lesion component.',
        attenuation='Same source distribution projected through the corresponding arms-down or arms-up attenuation volume.')
    (ROOT/'assets/physics/oncologic-case.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')


if __name__ == '__main__':
    main()
