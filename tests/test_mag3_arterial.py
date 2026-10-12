"""Numerical and image checks for the simulated first vascular passage."""
from pathlib import Path
import sys,json,re,base64,zlib
import numpy as np
from PIL import Image,ImageDraw,ImageFont

root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'scripts'))
from mag3_arterial import first_pass
src=np.load(root.parent/'icrp145-mag3-cuerpo-entero/basal/dinamica.npz')
t=src['t_s'];original=src['actividad_relativa'];A,meta=first_pass(t,original)
assert np.max(abs(A.sum(0)-original.sum(0)))<1e-12
assert np.array_equal(A[:10,t>=60],original[:,t>=60])
assert np.all(np.diff(meta['actual_peak_s'])>0),meta
assert np.all(A[10:,t>=60]==0)
assert np.all(A[:,0]==0)
assert A[0,t==15]>original[0,t==15]
html=(root/'index.html').read_text(encoding='utf-8')
data=json.loads(re.search(r'window.GANTRY_MAG3_DATA=(.*?);\n',html)[1])
assert len(data['components'])==15
cumulative=np.array(data['integral']);assert (np.diff(cumulative,axis=0)>=-1e-8).all()
assert data['edges'][:31]==list(range(0,61,2))
shape=(15,36,data['height'],data['width'])
atlas=np.frombuffer(zlib.decompress(base64.b64decode(data['packed']['down'])),dtype='<u2').reshape(shape)
bases=atlas[:,18].astype(float)*np.array(data['scales']['down'])[:,None,None]
assert all(b.sum()>0 for b in bases[10:])
# First-pass aortic activity rises then falls; cannot be explained by diffuse background alone.
rate=np.diff(cumulative,axis=0)/data['dt']
arterial=rate[:,13]
assert 8<t[np.argmax(arterial)]<18
assert arterial[int(30/data['dt'])]<arterial.max()*.02
starts=[0,4,8,10,12,14,18,30,58]
frames=[]
for start in starts:
    weights=cumulative[int((start+2)/data['dt'])]-cumulative[int(start/data['dt'])]
    frames.append(np.einsum('c,cyx->yx',weights,bases))
frames=np.array(frames)
window=np.percentile(frames[frames>0],99.6)
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',15)
sheet=Image.new('RGB',(len(starts)*170,365),'#0b1420');draw=ImageDraw.Draw(sheet)
for j,(start,frame) in enumerate(zip(starts,frames)):
    gray=np.uint8(255*np.clip(frame/window,0,1)**.72)
    im=Image.fromarray(gray).crop((0,int(data['headRow'])-5,160,int(data['footRow'])+2))
    sheet.paste(im,(j*170+5,32));draw.text((j*170+9,7),f'{start}-{start+2} s',font=font,fill='white')
draw.text((9,341),'MAG3 sintetico - primer paso - posterior - cuentas esperadas, escala comun',font=font,fill='white')
sheet.save(root/'assets/icrp145/mag3-fase-arterial.png')
report={'result':'OK','mass_balance_max_error':meta['mass_balance_max_error'],
        'sequential_peak_s':meta['actual_peak_s'],'late_kinetics_unchanged_after_s':60,
        'aortic_peak_s':float(t[np.argmax(arterial)]),'components':15,'initial_frame_duration_s':2}
(root/'assets/icrp145/mag3-arterial-verificacion.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
