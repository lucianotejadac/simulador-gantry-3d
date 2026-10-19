/* Whole-body projection adapter: linear ICRP activity, native aspect ratio. */
(function(){
  'use strict';
  function eligibility(G,physical,declared){
    if(G?.setup&&G.setup!=='normal')return {ok:false,reason:'Para el barrido usa la camilla del equipo: selecciona la posición 1 o 6.'};
    if(!physical||physical.headFirst!==false)return {ok:false,reason:'Coloca al paciente con los pies hacia adentro (Cambiar posición de paciente).'};
    if(declared?.headFirst!==false)return {ok:false,reason:'En Adquisición, declara Pies adentro / Cabeza afuera.'};
    if(!Number.isFinite(G?.tableZ))return {ok:false,reason:'Posición de camilla no disponible.'};
    if(G.tableZ<=16)return {ok:false,reason:'La camilla ya alcanzó el final del recorrido hacia los pies.'};
    return {ok:true,reason:'Inicio en posición actual · detectores automáticos · pies hacia adentro'};
  }
  function geometry(pose,n){
    // 56 cm transverse coverage at the same physical pixel size in both axes.
    // Include the entire source volume, including raised hands and soles.
    const width=Math.max(560/3,pose.width),height=pose.height;
    return {width:n,height:Math.ceil(height/width*n),crop:{x:(pose.width-width)/2,y:0,w:width,h:height}};
  }
  // Exact exposure of a source row while a finite detector window translates.
  function exposure(row,from,to,half,seconds){
    if(to===from)return Math.abs(row-from)<=half?seconds:0;
    return seconds*Math.max(0,Math.min(to,row+half)-Math.max(from,row-half))/(to-from);
  }
  class Scan {
    constructor(n,velocity,pose,startZ=200,random=Math.random){
      if(![128,256].includes(n)||!Number.isFinite(velocity)||velocity<1||velocity>60)throw Error('Introduce una velocidad entre 1 y 60 cm/min.');
      if(!Number.isFinite(startZ)||startZ<=16)throw Error('No queda recorrido hacia los pies desde esta posición.');
      Object.assign(this,geometry(pose,n));
      this.n=n;this.kind='whole';this.mode='scan';this.velocity=velocity;this.startZ=startZ;this.endZ=16;
      this.target=(startZ-this.endZ)*175/184;this.travel=0;this.finished=false;this.phase='positioning';this.random=random;
      this.fromRow=pose.headRow+(200-startZ)/184*(pose.footRow-pose.headRow);this.toRow=pose.footRow;
      this.heads=[1,2].map(detector=>({detector,counts:new Uint32Array(n*this.height),total:0,elapsed:0,done:false}));
    }
    get tableZ(){return this.finished?this.endZ:this.startZ-(this.startZ-this.endZ)*this.travel/this.target;}
    get row(){return this.fromRow+(this.toRow-this.fromRow)*this.travel/this.target;}
    step(fields,rate,seconds){
      if(this.finished||!(seconds>0))return;
      const dt=Math.min(seconds,(this.target-this.travel)*60/this.velocity),from=this.row;
      const travel=Math.min(this.target,this.travel+dt*this.velocity/60);
      const to=this.fromRow+(this.toRow-this.fromRow)*travel/this.target;
      const half=560/3/2,poisson=window.GANTRY_BONE_CORE.poisson;
      fields.forEach((f,j)=>{
        const h=this.heads[j];if(f.values.length!==h.counts.length)throw Error('Campo incompatible con el barrido');
        for(let y=0;y<this.height;y++){
          const row=this.crop.y+(y+.5)*this.crop.h/this.height;
          const dtRow=exposure(row,from,to,half,dt);if(!dtRow)continue;
          for(let x=0;x<this.n;x++){
            // Same 56 cm transverse field as the live detector at zoom 1.
            if(Math.abs((x+.5)/this.n-.5)*this.crop.w>half)continue;
            const i=y*this.n+x,v=poisson(f.values[i]*rate*dtRow/2000000,this.random);
            h.counts[i]+=v;h.total+=v;
          }
        }
        h.elapsed+=dt;
      });
      this.travel=travel;this.finished=this.target-travel<1e-8;
      if(this.finished){this.travel=this.target;this.heads.forEach(h=>h.done=true);}
      this.phase=this.finished?'complete':'scanning';
    }
  }
  function approach(current,target,seconds){return current+Math.sign(target-current)*Math.min(Math.abs(target-current),8*seconds);}
  function rotationTargets(G,targetRot,limits,range){
    // Retract before rotating: reserve clearance for the entire angular path.
    const result={detDist1:G.detDist1,detDist2:G.detDist2};
    const steps=Math.max(1,Math.ceil(Math.abs(targetRot-G.rot)));
    for(let i=0;i<=steps;i++){
      const L=limits({...G,rot:G.rot+(targetRot-G.rot)*i/steps});
      result.detDist1=Math.max(result.detDist1,L.d1+1,range.detDist1[0]);
      result.detDist2=Math.max(result.detDist2,L.d2+1,range.detDist2[0]);
    }
    if(['detDist1','detDist2'].some(k=>!Number.isFinite(result[k])||result[k]>range[k][1]))throw Error('No hay espacio seguro para alinear los detectores. Ajusta la altura de la camilla.');
    return result;
  }
  function safeTargets(G,nextZ,limits,range){
    let d1=range.detDist1[0],d2=range.detDist2[0];
    const steps=Math.max(1,Math.ceil(Math.abs(nextZ-G.tableZ)));
    for(let i=0;i<=steps;i++){
      const L=limits({...G,tableZ:G.tableZ+(nextZ-G.tableZ)*i/steps});
      d1=Math.max(d1,L.d1+1);d2=Math.max(d2,L.d2+1);
    }
    if(!Number.isFinite(d1)||!Number.isFinite(d2)||d1>range.detDist1[1]||d2>range.detDist2[1])throw Error('No hay espacio seguro para el barrido. Finaliza y ajusta la altura de la camilla.');
    return {detDist1:d1,detDist2:d2};
  }
  let key='',cached=null;
  const detectorFields=[null,null];
  function position(){
    const live=window.GANTRY_LIVE;
    if(!window.GANTRY3D?.limits)return {ok:false,reason:'Preparando posicionamiento automático del gantry…'};
    return eligibility(window.GANTRY?.G,window.GANTRY_PATIENT3D,live?.settings,live?.settings.centers,window.GANTRY?.SCAN);
  }
  function signature(){
    const G=window.GANTRY.G,s=window.GANTRY_LIVE.settings;
    return JSON.stringify([G.arms,G.rot,G.detectorSeparation??180,G.tableH,window.GANTRY_PATIENT3D?.headFirst,s.headFirst,s.decubitus,document.getElementById('pos')?.value,s.matrix,s.zoom,s.centers,s.collimator,s.energyCenter,s.windowWidth,window.GANTRY3D?.equipment?.enabled]);
  }
  function create(velocity){
    const status=position();if(!status.ok)throw Error(status.reason);
    const G=window.GANTRY.G;
    window.GANTRY_LIVE.setZoom(1);window.GANTRY_LIVE.resetImageCenter();
    const pose=window.GANTRY_MDP?.geometry(G.arms==='up'?'up':'down')||window.GANTRY_ICRP.poses[G.arms==='up'?'up':'down'];
    const scan=new Scan(window.GANTRY_LIVE.settings.matrix,velocity,pose,G.tableZ);
    // Both 0/360 and 180 put the detector faces parallel to the patient.
    scan.targetRot=Math.round(G.rot/180)*180;
    if(Math.abs((G.detectorSeparation??180)-180)>.001)scan.rotationClearance={detDist1:window.GANTRY.LIM.detDist1[1],detDist2:window.GANTRY.LIM.detDist2[1]};
    else if(Math.abs(G.rot-scan.targetRot)>.001)scan.rotationClearance=rotationTargets(G,scan.targetRot,window.GANTRY3D.limits,window.GANTRY.LIM);
    safeTargets({...G,rot:scan.targetRot,detectorSeparation:180},scan.endZ,window.GANTRY3D.limits,window.GANTRY.LIM);
    scan.geometrySignature=signature();scan.initialGeometry={...G};
    return scan;
  }
  function advance(scan,rate,seconds,render=true){
    const G=window.GANTRY.G;
    const guard=next=>{
      const result=window.GANTRY3D?.collision?.guard(G,next);
      if(result?.blocked)throw Error('Barrido detenido: riesgo de contacto en D'+result.blocked.detector+' · '+result.blocked.hit.region+'. Retira el detector antes de continuar.');
    };
    if(signature()!==scan.geometrySignature||Math.abs(G.tableZ-scan.tableZ)>.001)throw Error('Cambió la posición o la configuración. Finaliza el barrido antes de reposicionar.');
    const dt=Math.min(.5,seconds);
    if(!(dt>0)||scan.finished)return;
    if(Math.abs(G.rot-scan.targetRot)>.001||Math.abs((G.detectorSeparation??180)-180)>.001){
      const targets=scan.rotationClearance;
      if(['detDist1','detDist2'].some(k=>G[k]<targets[k]-.001)){
        const next={...G};for(const k of ['detDist1','detDist2'])if(next[k]<targets[k])next[k]=approach(next[k],targets[k],dt);
        guard(next);Object.assign(G,next);
        scan.phase='retracting';
      }else{
        const next={...G,rot:G.rot+Math.sign(scan.targetRot-G.rot)*Math.min(Math.abs(scan.targetRot-G.rot),12*dt)};
        if('detectorSeparation' in G)next.detectorSeparation=(G.detectorSeparation??180)+Math.sign(180-(G.detectorSeparation??180))*Math.min(Math.abs(180-(G.detectorSeparation??180)),12*dt);
        guard(next);Object.assign(G,next);
        scan.geometrySignature=signature();scan.phase='aligning';
      }
      if(render)window.GANTRY.render();return;
    }
    const nextZ=Math.max(scan.endZ,G.tableZ-dt*scan.velocity/60*184/175);
    const targets=safeTargets(G,nextZ,window.GANTRY3D.limits,window.GANTRY.LIM);
    if(['detDist1','detDist2'].some(k=>Math.abs(G[k]-targets[k])>.001)){
      const next={...G};for(const k of ['detDist1','detDist2'])next[k]=approach(next[k],targets[k],dt);
      guard(next);Object.assign(G,next);
      scan.phase='positioning';if(render)window.GANTRY.render();return;
    }
    guard({...G,tableZ:nextZ});
    scan.step(fields().fields,rate,dt);G.tableZ=scan.tableZ;if(render)window.GANTRY.render();
  }
  function fields(){
    const live=window.GANTRY_LIVE,G=window.GANTRY.G,settings=live.settings;
    const pose=window.GANTRY_MDP?.geometry(G.arms==='up'?'up':'down')||window.GANTRY_ICRP?.poses[G.arms==='up'?'up':'down'];
    if(!pose)throw Error('Preparando el fantoma óseo');
    const size=geometry(pose,settings.matrix);
    const gaps=window.GANTRY3D?.surfaceGaps(G);
    const physicalProne=(document.getElementById('pos')?.value||'').toLowerCase().startsWith('pron');
    const raw=G.rot+(physicalProne?180:0);
    const pairs=[live.framePair(raw),live.framePair(raw+(G.detectorSeparation??180))];
    // The local skin distance varies continuously along the body. Reuse a PSF
    // within 5 mm distance bins instead of rebuilding the entire atlas field
    // for submillimetre changes. Collision checks keep their full precision.
    const metrics=[1,2].map(n=>{
      const cm=Math.max(0,gaps?.['d'+n]?.cm??G['detDist'+n]);
      return live.distanceMetrics(Math.round(cm*2)/2,'bone',settings.collimator,settings.energyCenter,settings.windowWidth);
    });
    const flipX=physicalProne!==(settings.decubitus==='prone');
    const mdp=window.GANTRY_MDP;
    const nextKey=JSON.stringify([G.arms,size,pairs,metrics,flipX,mdp?.seconds,mdp?.metadata().voidAt120]);
    if(nextKey!==key){
      cached={...size,fields:pairs.map((pair,i)=>{
        const signature=JSON.stringify([G.arms,size,pair,metrics[i],flipX]);
        if(mdp){
          const cache=detectorFields[i]?.mdpCache||{};
          detectorFields[i]={key:signature,mdpCache:cache,field:mdp.field(pose,pair,size.crop,size.width,size.height,flipX,false,metrics[i],metrics[i].blur*size.width/240,G.arms==='up'?'up':'down',cache)};
        }else if(detectorFields[i]?.key!==signature)detectorFields[i]={key:signature,
          field:window.GANTRY_ICRP.field(pose,pair,size.crop,size.width,size.height,flipX,false,metrics[i],metrics[i].blur*size.width/240)};
        return detectorFields[i].field;
      })};
      key=nextKey;
    }
    return cached;
  }
  window.GANTRY_BONE_WHOLE={eligibility,geometry,position,fields,Scan,exposure,approach,safeTargets,rotationTargets,create,advance};
})();
