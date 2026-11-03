"""Eleva los brazos y transporta su actividad MIBI con el tejido original."""
import json
import numpy as np
from scipy.ndimage import affine_transform
from scipy.spatial.transform import Rotation
import generar as source

def rotation_between(a,b):
    a=a/np.linalg.norm(a);b=b/np.linalg.norm(b)
    axis=np.cross(a,b);s=np.linalg.norm(axis)
    return Rotation.from_rotvec(axis/s*np.arctan2(s,np.dot(a,b))).as_matrix()

def elevate(activity,reg,mu,org,origin):
    cache=source.BASE/'brazos-arriba'/'mascara_brazos_original.npz'
    arm=np.load(cache)['brazos']
    assert arm.shape==reg.shape
    # No cardiac or other visceral organ may be included in the arm mask.
    protected=np.isin(org,[8700,8800,9500,8900,9200,9700,9900,13200])
    assert not np.any(arm&protected)
    shape=(750,reg.shape[1],319)
    labels_out=np.zeros(shape,np.uint8)
    activity_out=np.zeros(shape,np.float32);mu_out=np.zeros(shape,np.float32)
    moved=np.zeros(shape,bool)
    new_origin=origin-np.array([189,0,0])
    central=(slice(0,reg.shape[0]),slice(None),slice(63,63+reg.shape[2]))
    labels_out[central]=np.where(arm,0,reg)
    activity_out[central]=np.where(arm,0,activity)
    mu_out[central]=np.where(arm,0,mu)
    z,y,x=np.ogrid[:reg.shape[0],:reg.shape[1],:reg.shape[2]]
    world_x=origin[0]+(x+.5)*3;world_z=origin[2]+(z+.5)*3
    joints=[];conservation=[]
    for side,S,E,W in [(-1,[-184,20,570],[-211,85,291],[-241,84,30]),
                       (1,[190,20,574],[199,83,291],[226,80,30])]:
        S,E,W=map(lambda p:np.array(p,dtype=float),(S,E,W))
        upper=rotation_between(E-S,np.array([.60*side,0,.80]))
        lower=rotation_between(W-E,np.array([-.60*side,0,.80]))
        elbow=S+upper@(E-S);wrist=elbow+lower@(W-E)
        joints.append({'lado':side,'hombro_mm':S.tolist(),'codo_mm':elbow.tolist(),'muneca_mm':wrist.tolist()})
        for name,R,pivot,dest,is_upper in [('humero',upper,S,S,True),('antebrazo_mano',lower,E,elbow,False)]:
            mask=arm&(world_x*side>0)&((world_z>=E[2]) if is_upper else (world_z<E[2]))
            occupied=np.argwhere(mask)
            corners=np.array(np.meshgrid(*zip(occupied.min(0),occupied.max(0)),indexing='ij')).reshape(3,-1).T
            xyz=origin+(corners[:,::-1]+.5)*3
            posed=(xyz-pivot)@R.T+dest
            indices=(posed-new_origin)/3-.5
            lo=np.maximum(0,np.floor(indices.min(0)[::-1]-3).astype(int))
            hi=np.minimum(shape,np.ceil(indices.max(0)[::-1]+4).astype(int))
            matrix=R.T[::-1,::-1]
            offset=((pivot+R.T@(new_origin+(lo[::-1]+.5)*3-dest)-origin)/3-.5)[::-1]
            kw={'matrix':matrix,'offset':offset,'output_shape':tuple(hi-lo),'prefilter':False}
            labels=affine_transform(np.where(mask,reg,0),order=0,**kw)
            acts=affine_transform(np.where(mask,activity,0),order=1,**kw)
            mus=affine_transform(np.where(mask,mu,0),order=1,**kw)
            region=tuple(slice(a,b) for a,b in zip(lo,hi))
            target=labels_out[region];take=(labels>0)&((target==0)|np.isin(labels,[2,3,4]))
            before=float(activity[mask].sum(dtype=np.float64));after=float(acts[take].sum(dtype=np.float64))
            factor=before/after if after else 1.
            assert .90<factor<1.10
            acts*=factor # correct small resampling loss within this arm segment
            target[take]=labels[take];activity_out[region][take]=acts[take];mu_out[region][take]=mus[take]
            moved[region][take]=True
            conservation.append({'lado':side,'segmento':name,'actividad_antes':before,
                'actividad_depositada':float(acts[take].sum(dtype=np.float64)),
                'correccion_remuestreo':factor,'voxeles_antes':int(mask.sum()),'voxeles_depositados':int(take.sum())})
    # Adjacent remapped segments can overlap at elbows/shoulders. Restore the
    # total after the last compositing step, scaling only the moved arm tissue.
    total_before=float(activity.sum(dtype=np.float64))
    retained=float(activity_out[~moved].sum(dtype=np.float64))
    moved_total=float(activity_out[moved].sum(dtype=np.float64))
    overlap_factor=(total_before-retained)/moved_total if moved_total else 1.
    assert .99<overlap_factor<1.01
    activity_out[moved]*=overlap_factor
    assert np.array_equal(activity_out[central][protected],activity[protected])
    assert np.array_equal(mu_out[central][protected],mu[protected])
    coords=np.argwhere(labels_out>0)
    assert coords[:,0].max()<shape[0]-2 and coords[:,2].min()>1 and coords[:,2].max()<shape[2]-2
    metadata={'postura_oficial_icrp':False,
        'metodo':'Rearticulación sintética 3D de húmero y antebrazo/mano; tejidos, actividad MIBI y atenuación se trasladan juntos',
        'articulaciones':joints,'conservacion_por_segmento':conservation,
        'correccion_final_solapamiento_solo_brazos':overlap_factor,
        'actividad_total_antes':float(activity.sum(dtype=np.float64)),
        'actividad_total_despues':float(activity_out.sum(dtype=np.float64)),
        'organos_centrales_captacion_atenuacion_identicas':True,
        'origen_lps_mm':new_origin.tolist(),'dimensiones_zyx':list(shape),'limite':'Postura docente aproximada; clavículas y escápulas conservadas, sin biomecánica ni deformación muscular.'}
    return activity_out,mu_out,metadata
