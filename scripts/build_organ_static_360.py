"""Project organ-seeded ICRP uptake models, never image-derived atlases.

Source defaults to the sibling icrp145-multitrazador-ap-pa project. Original
float frames stay there; only compressed angular weights enter the simulator.
"""
from pathlib import Path
import argparse
import copy
import hashlib
import json
import math
import re
import sys
import zlib
import numpy as np
from scipy.ndimage import gaussian_filter
from numba import set_num_threads
from externalize_assets import asset
from share_mibi_model import share_mibi_model

ROOT = Path(__file__).resolve().parents[1]
CASES = {'thyroid':'pertecnetato', 'exploration':'i131',
         'parathyroid':'mibi', 'dmsa':'dmsa', 'maa':'maa'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=ROOT.parent/'icrp145-multitrazador-ap-pa')
    parser.add_argument('--studies', nargs='+', choices=CASES, default=list(CASES))
    args = parser.parse_args()
    sys.path.insert(0, str(args.source.resolve()))
    import generar as source
    from generar_mibi_360 import project
    set_num_threads(6)
    if any(name!='parathyroid' for name in args.studies):
        reg, mu, organs, origin = source.load_volume()
    angles = list(range(0, 360, 5))
    provenance_path = ROOT/'assets/icrp145/organ-static-provenance.json'
    provenance = json.loads(provenance_path.read_text(encoding='utf-8')) if provenance_path.exists() else {}
    descriptors = {}
    for name in args.studies:
        if name == 'parathyroid':
            continue  # Shared cardiac MIBI atlas, including its modified LV.
        case = copy.deepcopy(next(c for c in source.CASES if c['id'] == CASES[name]))
        activity = source.uptake(case, reg, organs, origin)
        # Same approximate energy scaling as the existing I-131 AP/PA model.
        attenuation_factor = .70 if case['energy'] == 364 else 1.
        attenuation = mu*attenuation_factor
        frames = []
        for i, angle in enumerate(angles):
            frames.append(gaussian_filter(project(activity, attenuation, math.radians(angle)), case['fwhm']/2.35482/3))
            if i % 12 == 0:
                print(f'{name}: {i+1}/72', flush=True)
        frames = np.stack(frames)
        factor = 2_000_000/float(frames[0].sum())
        frames *= factor
        # Independent AP/PA implementation validates angle convention and registration.
        pair = source.project_pair(activity, attenuation)
        pair = np.stack([gaussian_filter(f, case['fwhm']/2.35482/3) for f in pair])*factor
        cardinal_errors = []
        for index, expected in zip([0, 36], pair):
            # For odd voxel widths the rotated grid and legacy PA placement differ
            # by one column. Align that known grid offset only for this comparison.
            actual = frames[index]
            shifts = [0] if index == 0 else [-1, 0, 1]
            error = min(float(np.abs(np.roll(actual, shift, axis=1)-expected).sum()/expected.sum()) for shift in shifts)
            assert error < .001, (name, index, error)
            cardinal_errors.append(error)
        scale = float(frames.max())/65535
        quant = np.rint(frames.astype(np.float64)/scale).astype('<u2')
        top = float(origin[2])+(activity.shape[0]+(640-activity.shape[0])//2)*3
        descriptors[name] = dict(angles=angles, width=256, height=640, scale=scale,
            window=float(np.percentile(frames[frames>frames.max()*.015], 99.5)),
            headRow=(top-881.44478)/3, footRow=(top+878.60229)/3, pixelMm=3,
            source='ICRP 145 · captación simulada por órganos',
            url=asset(zlib.compress(quant.tobytes(), 9), 'icrp-'+name, 'deflate'))
        provenance[name] = dict(case=case, angles=angles, posture='arms down',
            anatomy='ICRP 145 MRCP_AM; original 3 mm organ labels',
            organ_sha256=hashlib.sha256((args.source/'organos_3mm.npz').read_bytes()).hexdigest(),
            uptake_source_sha256=hashlib.sha256((args.source/'generar.py').read_bytes()).hexdigest(),
            builder_source_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            projector_source_sha256=hashlib.sha256((args.source/'generar_mibi_360.py').read_bytes()).hexdigest(),
            normalization='One factor for all angles; anterior reference 2 M arbitrary expected counts',
            transport='Parallel rays, 3 mm step, bilinear interpolation, Gaussian PSF; no scatter or Monte Carlo',
            attenuation=dict(reference_keV=140, energy_keV=case['energy'], factor=attenuation_factor,
                method='Original 140 keV mu, scaled by 0.70 for I-131 as in the previous AP/PA model; approximate, not material-specific at 364 keV'),
            limitation='Educational relative uptake model, not a validated clinical or dosimetric simulation',
            cardinal_relative_l1_errors=cardinal_errors, source_urls=source.SOURCES,
            descriptor=descriptors[name])
        out = args.source/(name+'-360')
        out.mkdir(exist_ok=True)
        np.savez_compressed(out/'proyecciones_lineales.npz', cuentas_esperadas=frames, angulos=angles, pixel_mm=3)
        (out/'metadatos.json').write_text(json.dumps(provenance[name], ensure_ascii=False, indent=2), encoding='utf-8')
        print(name, descriptors[name]['url'], flush=True)
    # Read at the end so independent UI edits during projection are retained.
    page = ROOT/'index.html'
    html = page.read_text(encoding='utf-8')
    match = re.search(r'window.GANTRY_ICRP_DATA=(.*?);\n', html)
    data = json.loads(match[1])
    data.update(descriptors)
    html = html[:match.start(1)]+json.dumps(data, separators=(',', ':'))+html[match.end(1):]
    provenance_path.write_text(json.dumps(provenance, ensure_ascii=False, indent=2), encoding='utf-8')
    page.write_text(share_mibi_model(html), encoding='utf-8', newline='\n')


if __name__ == '__main__':
    main()
