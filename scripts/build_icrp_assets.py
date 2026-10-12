"""Empaqueta ambas series lineales en el HTML autocontenido, sin fetch ni servidor.

python scripts/build_icrp_assets.py --source ../icrp145-oseo-360
Requiere numpy. Las fuentes NPZ quedan fuera del repositorio.
"""
from pathlib import Path
import argparse, base64, hashlib, json, re, zlib
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--source',type=Path,default=ROOT.parent/'icrp145-oseo-360')
parser.add_argument('--mibi-source',type=Path,default=ROOT.parent/'icrp145-multitrazador-ap-pa/mibi-360-brazos-arriba')
args=parser.parse_args()
result={};provenance={}
for name,folder in [('down',args.source),('up',args.source/'brazos-arriba')]:
    path=folder/'proyecciones_lineales.npz'
    data=np.load(path);frames=data['cuentas_esperadas']
    meta=json.loads((folder/'metadatos.json').read_text(encoding='utf-8'))
    scale=float(frames.max())/65535
    raw=np.rint(frames/scale).astype('<u2').tobytes()
    top=meta.get('borde_superior_proyeccion_z_mm',-888.60229+(594+23)*3)
    packed={'angles':data['angulos'].tolist(),'width':frames.shape[2],'height':frames.shape[1],
            'scale':scale,'window':meta['ventana_comun_cuentas'],
            'headRow':(top-881.44478)/3,'footRow':(top+878.60229)/3,
            'deflate':base64.b64encode(zlib.compress(raw,9)).decode('ascii')}
    result[name]=packed
    provenance[name]={**meta,'sha256_proyecciones_lineales':hashlib.sha256(path.read_bytes()).hexdigest(),
                      'error_maximo_cuantizacion':scale/2}
    print(name,frames.shape,'compressed MB',round(len(packed['deflate'])/1e6,2))
# Match the engine's 2 M ANT reference while preserving the MIBI common window.
# The source contains expected counts, never pre-sampled noise.
folder=args.mibi_source;path=folder/'proyecciones_lineales.npz'
data=np.load(path);meta=json.loads((folder/'metadatos.json').read_text(encoding='utf-8'))
frames=data['cuentas_esperadas'];reference_factor=2000000/float(frames[0].sum(dtype=np.float64))
frames=frames*reference_factor
scale=float(frames.max())/65535
raw=np.rint(frames/scale).astype('<u2').tobytes()
nz=meta['postura']['dimensiones_zyx'][0]
top=meta['postura']['origen_lps_mm'][2]+(nz+(frames.shape[1]-nz)//2)*3
result['mibi_up']={'angles':data['angulos'].tolist(),'width':frames.shape[2],'height':frames.shape[1],
    'scale':scale,'window':meta['ventana']*reference_factor,
    'headRow':(top-881.44478)/3,'footRow':(top+878.60229)/3,
    'deflate':base64.b64encode(zlib.compress(raw,9)).decode('ascii')}
provenance['mibi_up']={**meta,'sha256_proyecciones_lineales':hashlib.sha256(path.read_bytes()).hexdigest(),
    'factor_referencia_motor':reference_factor,'error_maximo_cuantizacion':scale/2,
    'ruido_motor':'Eventos de Poisson nuevos a partir de cuentas esperadas; no se importan PNG ruidosos'}
print('mibi_up',frames.shape,'compressed MB',round(len(result['mibi_up']['deflate'])/1e6,2))
assets=ROOT/'assets/icrp145';assets.mkdir(exist_ok=True)
(assets/'procedencia.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2),encoding='utf-8')
(assets/'montaje-brazos-arriba.jpg').write_bytes((args.source/'brazos-arriba/montaje.jpg').read_bytes())
engine=(ROOT/'scripts/icrp_live.js').read_text(encoding='utf-8')
block='<!-- ICRP145_BEGIN -->\n<script>\nwindow.GANTRY_ICRP_DATA='+json.dumps(result,separators=(',',':'))+';\n'+engine+'\n</script>\n<!-- ICRP145_END -->'
page=ROOT/'index.html';html=page.read_text(encoding='utf-8')
if '<!-- ICRP145_BEGIN -->' in html:
    html=re.sub(r'<!-- ICRP145_BEGIN -->.*?<!-- ICRP145_END -->',lambda _:block,html,flags=re.S)
else:
    marker='  const FRAME_W = 480;'
    pos=html.rfind('<script',0,html.index(marker))
    html=html[:pos]+block+'\n'+html[pos:]
page.write_text(html,encoding='utf-8')
print('Embedded linear data and live engine')
