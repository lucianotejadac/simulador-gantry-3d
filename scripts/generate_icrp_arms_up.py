"""Postura articulada derivada de ICRP 145; no es una postura oficial ICRP.

Rotaciones rígidas independientes de húmero y antebrazo/mano, en 3D.
Conserva huesos y tejidos originales; vuelve a proyectar emisión y atenuación.
"""
from pathlib import Path
import json, math, hashlib
import numpy as np
from scipy.ndimage import distance_transform_edt, affine_transform, gaussian_filter
from scipy.spatial.transform import Rotation
from PIL import Image, ImageDraw
from numba import set_num_threads, njit
import argparse, sys
parser=argparse.ArgumentParser()
parser.add_argument('--source',type=Path,default=Path(__file__).resolve().parents[2]/'icrp145-oseo-360')
args=parser.parse_args()
ROOT=args.source.resolve()
sys.path.insert(0,str(ROOT))
import generar as base
from reparar_volumen import fill
OUT=ROOT/'brazos-arriba'
OUT.mkdir(exist_ok=True)

def rotation_between(a,b):
    a=a/np.linalg.norm(a);b=b/np.linalg.norm(b)
    axis=np.cross(a,b);s=np.linalg.norm(axis)
    return Rotation.from_rotvec(axis/s*math.atan2(s,np.dot(a,b))).as_matrix()

def make_volume():
    source=np.load(base.SOURCE)
    reg=source['reg'].copy();mu=source['mu'].copy();hu=source['hu']
    lesion=reg==11
    reg[lesion & (hu>500)]=2;reg[lesion & (hu>=0) & (hu<=500)]=3
    reg[lesion & (hu<0)]=4;reg[reg==12]=1
    correction=np.load(ROOT/'correccion_huesos_largos.npz')['organo']
    cortical=np.isin(correction,[1600,3100]);medullary=np.isin(correction,[1800,3300])
    reg[cortical]=2;reg[medullary]=4
    mu[cortical]=.1537+(.2860-.1537)*.904;mu[medullary]=.1537*.981
    origin=source['origen'];new_origin=origin-np.array([63*3,0,0])
    nodes=np.load(ROOT/'nodos.npy');tets=np.load(ROOT/'tetraedros_oseos.npy')
    tets=tets[(tets[:,4]>=1300)&(tets[:,4]<=2300)]
    limb=fill(nodes,np.ascontiguousarray(tets[:,:4]),tets[:,4],origin/10,reg.shape)>0
    bone=np.isin(reg,[2,3,4])
    # La frontera de tejidos blandos sigue el hueso más cercano. Evita arrastrar
    # costillas y órganos con los brazos; el tejido se mueve junto al miembro.
    d_arm=distance_transform_edt(~limb)
    d_body=distance_transform_edt(~(bone & ~limb))
    z,y,x=np.ogrid[:reg.shape[0],:reg.shape[1],:reg.shape[2]]
    world_x=origin[0]+(x+.5)*3;world_z=origin[2]+(z+.5)*3
    arm=(d_arm<d_body)&(reg>0)&(np.abs(world_x)>135)&(world_z<625)&(d_arm<24)
    arm|=limb
    output=np.zeros((750,reg.shape[1],319),np.uint8)
    attenuation=np.zeros(output.shape,np.float32)
    output[:reg.shape[0],:,63:63+reg.shape[2]]=np.where(arm,0,reg)
    attenuation[:reg.shape[0],:,63:63+reg.shape[2]]=np.where(arm,0,mu)
    joints=[];conservation=[]
    for side,S,E,W in [(-1,[-184,20,570],[-211,85,291],[-241,84,30]),
                        (1,[190,20,574],[199,83,291],[226,80,30])]:
        S,E,W=map(lambda a:np.array(a,dtype=float),(S,E,W))
        upper=rotation_between(E-S,np.array([.60*side,0,.80]))
        lower=rotation_between(W-E,np.array([-.60*side,0,.80]))
        new_elbow=S+upper@(E-S);new_wrist=new_elbow+lower@(W-E)
        joints.append({'lado':side,'hombro_mm':S.tolist(),'codo_mm':new_elbow.tolist(),
                       'muneca_mm':new_wrist.tolist(),'codo_original_mm':E.tolist()})
        for name,R,pivot,dest,is_upper in [('humero',upper,S,S,True),('antebrazo_mano',lower,E,new_elbow,False)]:
            mask=arm&(world_x*side>0)&((world_z>=E[2]) if is_upper else (world_z<E[2]))
            occupied=np.argwhere(mask)
            corners=np.array(np.meshgrid(*zip(occupied.min(0),occupied.max(0)),indexing='ij')).reshape(3,-1).T
            xyz=origin+(corners[:,::-1]+.5)*3
            posed=(xyz-pivot)@R.T+dest
            indices=(posed-new_origin)/3-.5
            lo=np.maximum(0,np.floor(indices.min(0)[::-1]-3).astype(int))
            hi=np.minimum(output.shape,np.ceil(indices.max(0)[::-1]+4).astype(int))
            out_shape=tuple(hi-lo)
            # Inverse mapping from output voxel centers to original coordinates.
            matrix=R.T[::-1,::-1]
            offset=((pivot+R.T@(new_origin+(lo[::-1]+.5)*3-dest)-origin)/3-.5)[::-1]
            labels=affine_transform(np.where(mask,reg,0),matrix,offset,output_shape=out_shape,order=0,prefilter=False)
            mus=affine_transform(np.where(mask,mu,0),matrix,offset,output_shape=out_shape,order=1,prefilter=False)
            region=tuple(slice(a,b) for a,b in zip(lo,hi))
            target=output[region];target_mu=attenuation[region]
            take=(labels>0)&((target==0)|np.isin(labels,[2,3,4]))
            target[take]=labels[take];target_mu[take]=mus[take]
            before=int(np.count_nonzero(mask & bone));after=int(np.count_nonzero(np.isin(labels,[2,3,4])))
            conservation.append({'lado':side,'segmento':name,'voxeles_oseos_antes':before,'despues':after})
            print(side,name,before,after,flush=True)
    np.savez_compressed(OUT/'volumen_articulado.npz',reg=output,mu=attenuation,origen=new_origin,iso=3)
    np.savez_compressed(OUT/'mascara_brazos_original.npz',brazos=arm)
    return output,attenuation,new_origin,joints,conservation

def main():
    set_num_threads(6)
    reg,mu,origin,joints,conservation=make_volume()
    # Compilar sin caché compartida: no cambiar el ejecutable del proyector
    # original (256 x 640) al usar las dimensiones de brazos elevados.
    base.W=320;base.H=768
    project=njit(parallel=True,cache=False)(base.project.py_func)
    activity=np.array([base.WEIGHTS[i] for i in range(11)],np.float32)[reg]
    bone=np.isin(reg,[2,3]).astype(np.float32)
    expected=[]
    for i,angle in enumerate(base.ANGLES):
        e,_=project(activity,mu,bone,math.radians(angle))
        expected.append(gaussian_filter(e,sigma=6/2.35482/3))
        if i%16==0:print('Projection',i+1,'/80',flush=True)
    expected=np.stack(expected)
    expected*=2000000/expected[0].sum()
    window=float(np.percentile(expected[expected>0],99.5))
    (OUT/'suave').mkdir(exist_ok=True)
    for angle,frame in zip(base.ANGLES,expected):
        Image.fromarray(np.uint8(np.clip(frame/window,0,1)**.72*255)).resize((640,1536),Image.Resampling.LANCZOS).save(OUT/'suave'/('oseo_'+base.token(angle)+'.png'))
    np.savez_compressed(OUT/'proyecciones_lineales.npz',cuentas_esperadas=expected,angulos=base.ANGLES,pixel_mm=3)
    # Pixel-edge coordinates of original skull top and plantar surface.
    top=origin[2]+(reg.shape[0]+(base.H-reg.shape[0])//2)*3
    meta={'modelo':'ICRP 145 MRCP_AM derivado; brazos elevados mediante articulación sintética 3D',
          'postura_oficial_icrp':False,'voxel_mm':3,'ancho_alto_pixeles_nativos':[320,768],
          'angulos':base.ANGLES,'ventana_comun_cuentas':window,'gamma_visualizacion':.72,
          'cuentas_esperadas_vista_0':2000000,'origen_lps_mm':origin.tolist(),
          'borde_superior_proyeccion_z_mm':top,'craneo_fila':(top-881.44478)/3,
          'planta_fila':(top+878.60229)/3,'articulaciones':joints,'conservacion_hueso':conservation,
          'metodo_postura':'Rotación rígida 3D por húmero y antebrazo/mano; codos compartidos. Tejido blando asignado al hueso más cercano. Clavículas y escápulas quedan en posición original.',
          'limites':['Rearticulación docente aproximada: no simula biomecánica escapulohumeral ni deformación muscular.',
                     'Remuestreo a 3 mm; captación sintética, atenuación paralela y PSF fija de 6 mm.',
                     'No son datos de pacientes ni una postura validada/certificada por ICRP.'],
          'referencia':'https://www.icrp.org/publication.asp?id=ICRP+Publication+145'}
    (OUT/'metadatos.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
    sheet=Image.new('RGB',(8*160,2*412),'#eaf0f6');draw=ImageDraw.Draw(sheet)
    for i in range(16):
        angle=i*22.5;im=Image.open(OUT/'suave'/('oseo_'+base.token(angle)+'.png')).convert('RGB').resize((160,384))
        x,y=i%8*160,i//8*412;sheet.paste(im,(x,y+28));draw.text((x+8,y+6),str(angle)+' deg',fill='#162b3d')
    sheet.save(OUT/'montaje.jpg',quality=95)
    print('DONE',OUT,flush=True)

if __name__=='__main__':main()
