"""Compare new MDP bases with pre-correction f83e6d2, at a shared display window."""
from pathlib import Path
import json, zlib, subprocess
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
old = json.loads(subprocess.check_output(
    ['git', 'show', 'f83e6d2:assets/icrp145/mdp-provenance.json'], cwd=ROOT))
new = json.loads((ROOT/'assets/icrp145/mdp-provenance.json').read_text())
canvas = Image.new('RGB', (1280, 790), '#0e1820')
draw = ImageDraw.Draw(canvas)
for pi, pose in enumerate(['down', 'up']):
    pair = []
    for meta in [old, new]:
        p = meta['poses'][pose]
        raw = np.frombuffer(zlib.decompress((ROOT/p['url']).read_bytes()), '<u2').reshape(8,36,384,160)
        pair.append(raw.astype(np.float32)*np.array(p['scales'])[:,None,None,None])
    np.testing.assert_array_equal(pair[0][1:], pair[1][1:])
    assert np.isfinite(pair[1]).all() and pair[1].min() >= 0
    # Retain real angular attenuation and anatomical asymmetry.
    assert not np.allclose(pair[1][0,0], pair[1][0,18], atol=1e-9)
    cap = np.quantile(pair[0][0][pair[0][0] > 0], .997)
    for j, a in enumerate(pair):
        col = pi*2+j
        img = Image.fromarray((np.clip(a[0,0]/cap,0,1)**.72*255).astype('uint8')).resize((320,768))
        canvas.paste(img,(col*320,22))
        label = ('Brazos al costado' if pose == 'down' else 'Brazos arriba')
        draw.text((col*320+10,5), label+(' - ANTES' if j == 0 else ' - CORREGIDO'), fill='white')
canvas.save(ROOT/'assets/icrp145/bone-uniformity-comparison.png')
print('Both poses: non-bone bases identical; 36 finite views; angle dependence retained.')
