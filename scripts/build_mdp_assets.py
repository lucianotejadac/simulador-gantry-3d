"""MDP spatial bases: ICRP skeleton plus existing normalized organ projections.

Kinetics are supplied separately by mdp.js. Never normalize individual views:
attenuation and angle-dependent sensitivity must survive mixing.
"""
from pathlib import Path
import sys, re, json, zlib, hashlib
import numpy as np
from scipy.ndimage import gaussian_filter
from numba import set_num_threads
from bone_emission import bone_emission, PARAMETERS

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT.parent
sys.path.insert(0, str(WORK/'icrp145-multitrazador-ap-pa'))
from generar_mibi_360 import project
set_num_threads(6)

def main():
    html = (ROOT/'index.html').read_text(encoding='utf-8')
    mag = json.loads(re.search(r'window.GANTRY_MAG3_DATA=(.*?);\n', html)[1])
    full = np.load(WORK/'simulador-renograma-mc/salida_osea/cuerpo.npz')
    reg = full['reg'].copy(); mu = full['mu'].copy(); hu = full['hu']
    lesion = reg == 11
    reg[lesion & (hu > 500)] = 2
    reg[lesion & (hu >= 0) & (hu <= 500)] = 3
    reg[lesion & (hu < 0)] = 4; reg[reg == 12] = 1
    correction = np.load(WORK/'icrp145-oseo-360/correccion_huesos_largos.npz')['organo']
    cortical = np.isin(correction, [1600,3100]); marrow = np.isin(correction,[1800,3300])
    reg[cortical] = 2; reg[marrow] = 4
    mu[cortical] = .2732992; mu[marrow] = .1537*.981
    def coarse(v): return v.reshape(375,2,52,2,160,2).sum((1,3,5))
    meta = {k: mag[k] for k in ['width','height','pixelMm','angles','headRow','footRow']}
    meta.update(angles=list(range(360)), organAngles=mag['angles'],
                components=['bone','blood','soft','kidneys','bladder','central','lungs','arteries'], poses={}, boneEmission=PARAMETERS)
    for pose in ['down','up']:
        if pose == 'up':
            vol = np.load(WORK/'icrp145-oseo-360/brazos-arriba/volumen_articulado.npz')
            r, m = vol['reg'], vol['mu']
            v = np.zeros((750,104,320),np.float32)
            v[:,:,:319] = bone_emission(r)
            a = coarse(v)
            v.fill(0); v[:,:,:319] = m
        else:
            v = np.zeros((750,104,320),np.float32)
            v[:594,:,63:256] = bone_emission(reg)
            a = coarse(v)
            v.fill(0); v[:594,:,63:256] = mu
        attenuation = coarse(v)/8*2  # projector's 3 mm step, volume now 6 mm
        bone = []
        for angle in meta['angles']:
            bone.append(gaussian_filter(project(a,attenuation,np.deg2rad(angle),160,384)/.3,6/2.35482/6))
            if angle % 60 == 0: print(pose, angle+1, '/ 360 projections', flush=True)
        old = np.frombuffer(zlib.decompress((ROOT/mag['urls'][pose]).read_bytes()),'<u2').reshape(15,36,384,160)
        old = old.astype(np.float32)*np.array(mag['scales'][pose],np.float32)[:,None,None,None]
        # Each organ basis contains one unit of administered activity before attenuation.
        kidney = .45*(old[0]+old[2])+.05*(old[1]+old[3])
        # Keep the 360 real skeletal projections separate from the existing
        # seven organ bases: no tenfold duplication of background data in RAM.
        meta['poses'][pose] = {}
        groups = {'bone':np.array(bone)[None], 'organs':np.stack([old[7],old[8],kidney,old[6],old[10],old[11],.5*(old[12]+old[13])])}
        for group, frames in groups.items():
            scales = frames.max(axis=(1,2,3))/65535
            raw = zlib.compress(np.rint(frames/scales[:,None,None,None]).astype('<u2').tobytes(),9)
            name = 'assets/runtime/mdp-'+group+'-'+pose+'.'+hashlib.sha256(raw).hexdigest()[:16]+'.bin'
            (ROOT/name).write_bytes(raw)
            meta['poses'][pose][group] = {'url':name,'scales':scales.tolist()}
            print(pose, group, len(raw), 'bytes', flush=True)
    meta['sensitivityCpsPerMBq'] = 100
    meta['halfLifeMinutes'] = 6.0067*60
    meta['sources'] = [
        'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=3c91d0d8-6cc5-834c-bda0-aa83a873b9fb',
        'https://pmc.ncbi.nlm.nih.gov/articles/PMC4932135/']
    meta['limitations'] = 'Educational kinetics and assumed 100 cps/MBq LEHR sensitivity before attenuation; not a measured camera calibration. ICRP anatomy, not ICRP pharmacokinetics. Continuous skeletal-envelope emission is an educational visual model, not measured regional uptake. 6 mm spatial sampling. Bone: 360 independently projected 1 degree views. Other organ bases retain 10 degree sampling with angular interpolation. Synthetic articulated arms.'
    meta['sourceHashes'] = {str(p.relative_to(WORK)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [WORK/'simulador-renograma-mc/salida_osea/cuerpo.npz', WORK/'icrp145-oseo-360/brazos-arriba/volumen_articulado.npz', WORK/'icrp145-oseo-360/correccion_huesos_largos.npz', ROOT/'scripts/bone_emission.py', ROOT/mag['urls']['down'], ROOT/mag['urls']['up']]}
    (ROOT/'assets/icrp145/mdp-provenance.json').write_text(json.dumps(meta,indent=2),encoding='utf-8')

if __name__ == '__main__': main()
