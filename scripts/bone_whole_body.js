/* Whole-body projection adapter: linear ICRP activity, square physical pixels. */
(function(){
  'use strict';
  // WB_scanspeed.dcm: Siemens NM Encore2, 256 columns × 1024 rows,
  // PixelSpacing 2.3975999355316 mm. Other matrices are proportional
  // teaching layouts, not additional verified scanner acquisition formats.
  const REFERENCE_PIXEL_MM=2.3975999355316;
  const FIELD_WIDTH_MM=256*REFERENCE_PIXEL_MM;
  function eligibility(G,physical,declared){
    if(G?.setup&&G.setup!=='normal')return {ok:false,reason:'Para el barrido usa la camilla del equipo: selecciona la posición 1 o 6.'};
    if(!physical||physical.headFirst!==false)return {ok:false,reason:'Coloca al paciente con los pies hacia adentro (Cambiar posición de paciente).'};
    if(declared?.headFirst!==false)return {ok:false,reason:'En Adquisición, declara Pies adentro / Cabeza afuera.'};
    if(!Number.isFinite(G?.tableZ))return {ok:false,reason:'Posición de camilla no disponible.'};
    if(G.tableZ<=16)return {ok:false,reason:'La camilla ya alcanzó el final del recorrido hacia los pies.'};
    return {ok:true,reason:'Inicio en posición actual · detectores automáticos · pies hacia adentro'};
  }
  function geometry(pose,n,settings={},detector=1){
    const sourcePixelMm=pose.pixelMm||3;
    const zoom=settings.zoom??1,fieldWidth=FIELD_WIDTH_MM/zoom;
    const width=fieldWidth/sourcePixelMm,height=4*width;
    // Centers use fractions of the unzoomed 560 mm live detector field.
    const center=settings.centers?.[detector]||{x:0,y:0};
    const offsetX=(center.x||0)*560/sourcePixelMm,offsetY=(center.y||0)*560/sourcePixelMm;
    return {width:n,height:4*n,pixelMm:fieldWidth/n,sourcePixelMm,zoom,offsetY,
      sampling:{pixelMm:fieldWidth/n,widthMm:fieldWidth,heightMm:4*fieldWidth,
        reference:'WB_scanspeed.dcm · SIEMENS NM Encore2 · 256×1024',
        proportional:n!==256||zoom!==1},
      crop:{x:(pose.width-width)/2+offsetX,y:(pose.height-height)/2+offsetY,w:width,h:height}};
  }
  // Exact exposure of a source row while a finite detector window translates.
  function exposure(row,from,to,half,seconds){
    if(to===from)return Math.abs(row-from)<=half?seconds:0;
    return seconds*Math.max(0,Math.min(to,row+half)-Math.max(from,row-half))/(to-from);
  }
  class Scan {
    constructor(n,velocity,pose,startZ=200,random=Math.random,settings={}){
      if(![64,128,256,512].includes(n)||!Number.isFinite(velocity)||velocity<.1||velocity>60)throw Error('Introduce una velocidad entre 0,1 y 60 cm/min.');
      if(!Number.isFinite(startZ)||startZ<=16)throw Error('No queda recorrido hacia los pies desde esta posición.');
      Object.assign(this,geometry(pose,n,settings));
      this.frames=[1,2].map(detector=>geometry(pose,n,settings,detector));
      this.n=n;this.kind='whole';this.mode='scan';this.velocity=velocity;this.startZ=startZ;this.endZ=16;
      this.target=(startZ-this.endZ)*175/184;this.travel=0;this.finished=false;this.phase='positioning';this.random=random;
      this.fromRow=pose.headRow+(200-startZ)/184*(pose.footRow-pose.headRow);this.toRow=pose.footRow;
      this.heads=[1,2].map(detector=>({detector,counts:new Uint32Array(n*this.height),total:0,elapsed:0,done:false}));
    }
    get tableZ(){return this.travel>=this.target?this.endZ:this.startZ-(this.startZ-this.endZ)*this.travel/this.target;}
    get row(){return this.fromRow+(this.toRow-this.fromRow)*this.travel/this.target;}
    step(fields,rate,seconds){
      if(this.finished||!(seconds>0))return;
      const dt=Math.min(seconds,(this.target-this.travel)*60/this.velocity),from=this.row;
      const travel=Math.min(this.target,this.travel+dt*this.velocity/60);
      const to=this.fromRow+(this.toRow-this.fromRow)*travel/this.target;
      const half=280/(this.sourcePixelMm*this.zoom),poisson=window.GANTRY_BONE_CORE.poisson;
      fields.forEach((f,j)=>{
        const {crop,offsetY}=this.frames[j];
        const h=this.heads[j];if(f.values.length!==h.counts.length)throw Error('Campo incompatible con el barrido');
        for(let y=0;y<this.height;y++){
          const row=crop.y+(y+.5)*crop.h/this.height;
          const dtRow=exposure(row,from+offsetY,to+offsetY,half,dt);if(!dtRow)continue;
          for(let x=0;x<this.n;x++){
            // Same active field and electronic zoom as the live detector.
            if(Math.abs((x+.5)/this.n-.5)*crop.w>half)continue;
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
  function create(velocity,contours='auto'){
    if(!['auto','fixed'].includes(contours))throw Error('Modo de contornos no válido.');
    const status=position();if(!status.ok)throw Error(status.reason);
    const G=window.GANTRY.G;
    const pose=window.GANTRY_MDP?.geometry(G.arms==='up'?'up':'down')||window.GANTRY_ICRP.poses[G.arms==='up'?'up':'down'];
    const scan=new Scan(window.GANTRY_LIVE.settings.matrix,velocity,pose,G.tableZ,Math.random,window.GANTRY_LIVE.settings);
    scan.contours=contours;
    if(contours==='fixed')scan.fixedDistances={detDist1:G.detDist1,detDist2:G.detDist2};
    // Both 0/360 and 180 put the detector faces parallel to the patient.
    scan.targetRot=Math.round(G.rot/180)*180;
    if(Math.abs((G.detectorSeparation??180)-180)>.001)scan.rotationClearance={detDist1:window.GANTRY.LIM.detDist1[1],detDist2:window.GANTRY.LIM.detDist2[1]};
    else if(Math.abs(G.rot-scan.targetRot)>.001)scan.rotationClearance=rotationTargets(G,scan.targetRot,window.GANTRY3D.limits,window.GANTRY.LIM);
    const required=safeTargets({...G,rot:scan.targetRot,detectorSeparation:180},scan.endZ,window.GANTRY3D.limits,window.GANTRY.LIM);
    if(contours==='fixed'&&['detDist1','detDist2'].some(k=>G[k]<required[k]-.001))
      throw Error('Distancia fija insuficiente para todo el recorrido. Aleja los detectores: D1 al menos '+required.detDist1.toFixed(1)+' cm y D2 '+required.detDist2.toFixed(1)+' cm del isocentro, o activa los contornos automáticos.');
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
    const targets=scan.contours==='fixed'?scan.fixedDistances:safeTargets(G,nextZ,window.GANTRY3D.limits,window.GANTRY.LIM);
    if(['detDist1','detDist2'].some(k=>Math.abs(G[k]-targets[k])>.001)){
      const next={...G};for(const k of ['detDist1','detDist2'])next[k]=approach(next[k],targets[k],dt);
      guard(next);Object.assign(G,next);
      scan.phase='positioning';if(render)window.GANTRY.render();return;
    }
    guard({...G,tableZ:nextZ});
    const mdp=window.GANTRY_MDP;
    const exposureDt=Math.min(dt,(scan.target-scan.travel)*60/scan.velocity);
    scan.step(fields(G,mdp?mdp.seconds+exposureDt/2:undefined).fields,rate,exposureDt);G.tableZ=scan.tableZ;if(render)window.GANTRY.render();
  }
  // Sum expected exposure, then sample once: sums of independent Poisson
  // acquisitions are Poisson too. Work scales with spatial quadrature, not
  // thousands of real-time movement/painting ticks.
  async function instant(scan,rate){
    const G=window.GANTRY.G,mdp=window.GANTRY_MDP;
    if(scan.finished)return;
    if(signature()!==scan.geometrySignature||Math.abs(G.tableZ-scan.tableZ)>.001)throw Error('Cambió la posición o la configuración. Finaliza el barrido antes de reposicionar.');
    const originalSignature=signature(),originalZ=G.tableZ;
    const check=()=>{
      if(window.GANTRY_EXAM?.blocked||scan.cancelled)throw Error('Adquisición cancelada.');
      if(signature()!==originalSignature||G.tableZ!==originalZ)throw Error('Cambió la configuración durante el cálculo.');
    };
    const guard=(from,to,swept=false)=>{
      const collision=window.GANTRY3D?.collision,core=window.GANTRY_COLLISION_CORE;
      // There is no physical transit in an instant acquisition. The table
      // envelope is checked separately at 1 cm with 1 cm radial clearance.
      // Validate its virtual placements directly instead of replaying the
      // manual control's millimetre-by-millimetre animation collision sweep.
      // Angular alignment still uses the full swept collision check.
      const result=!swept&&collision?.evaluate&&core?.worsens?
        {blocked:core.worsens(collision.evaluate(to),collision.evaluate(from),false,false)}:
        collision?.guard(from,to);
      if(result?.blocked)throw Error('Barrido detenido: riesgo de contacto en D'+result.blocked.detector+' · '+result.blocked.hit.region+'. Retira el detector antes de continuar.');
    };
    let virtual={...G};
    if(Math.abs(virtual.rot-scan.targetRot)>.001||Math.abs((virtual.detectorSeparation??180)-180)>.001){
      const retracted={...virtual,...scan.rotationClearance};
      guard(virtual,retracted);virtual=retracted;
      const start={...virtual},steps=Math.max(1,Math.ceil(Math.max(Math.abs(start.rot-scan.targetRot),Math.abs((start.detectorSeparation??180)-180))));
      for(let i=1;i<=steps;i++){
        const next={...virtual,rot:start.rot+(scan.targetRot-start.rot)*i/steps,detectorSeparation:(start.detectorSeparation??180)+(180-(start.detectorSeparation??180))*i/steps};
        guard(virtual,next,true);virtual=next;
      }
    }
    const startSeconds=mdp?.seconds||0;
    const duration=Math.min((scan.target-scan.travel)*60/scan.velocity,mdp?.remaining??Infinity);
    const expected=scan.heads.map(h=>new Float64Array(h.counts.length));
    const projectionCaches=[new Map(),new Map()];
    let elapsed=0,lastYield=performance.now();
    while(elapsed<duration-1e-9){
      check();
      const t=startSeconds+elapsed;
      // At most 5 cm per spatial segment; resolve early uptake and the void
      // discontinuity separately. Exposure at both detector edges is exact.
      const quantum=t<60?1:t<600?5:30,next=(Math.floor((t+1e-7)/quantum)+1)*quantum;
      let dt=Math.min(duration-elapsed,300/scan.velocity,next-t);
      if(t<7200&&t+dt>7200)dt=7200-t;
      const travel=scan.travel+elapsed*scan.velocity/60;
      const nextTravel=Math.min(scan.target,travel+dt*scan.velocity/60);
      const nextZ=nextTravel>=scan.target?scan.endZ:scan.startZ-(scan.startZ-scan.endZ)*nextTravel/scan.target;
      const targets=scan.contours==='fixed'?scan.fixedDistances:safeTargets(virtual,nextZ,window.GANTRY3D.limits,window.GANTRY.LIM);
      const positioned={...virtual,...targets};
      guard(virtual,positioned);
      const end={...positioned,tableZ:nextZ};
      // Collision checks retain centimetre spatial checks even when rendering
      // and count sampling no longer follow the movement clock.
      const steps=Math.max(1,Math.ceil(Math.abs(nextZ-virtual.tableZ)));
      let previous=positioned;
      for(let i=1;i<=steps;i++){
        const next={...end,tableZ:virtual.tableZ+(nextZ-virtual.tableZ)*i/steps};
        guard(previous,next);previous=next;
      }
      const sample=fields({...positioned,tableZ:(virtual.tableZ+nextZ)/2},t+dt/2,projectionCaches).fields;
      const from=scan.fromRow+(scan.toRow-scan.fromRow)*travel/scan.target;
      const to=scan.fromRow+(scan.toRow-scan.fromRow)*nextTravel/scan.target;
      for(let j=0;j<2;j++)for(let y=0;y<scan.height;y++){
        const {crop,offsetY}=scan.frames[j],half=280/(scan.sourcePixelMm*scan.zoom);
        const row=crop.y+(y+.5)*crop.h/scan.height;
        const weight=exposure(row,from+offsetY,to+offsetY,half,dt)*(mdp?.rate??rate)/2000000;
        if(!weight)continue;
        for(let x=0;x<scan.n;x++){
          if(Math.abs((x+.5)/scan.n-.5)*crop.w>half)continue;
          const i=y*scan.n+x;
          expected[j][i]+=sample[j].values[i]*weight;
        }
      }
      virtual=end;elapsed+=dt;
      if(performance.now()-lastYield>24){await new Promise(resolve=>setTimeout(resolve,0));lastYield=performance.now();}
    }
    check();
    const increments=expected.map(values=>{
      const counts=new Uint32Array(values.length);let total=0;
      for(let i=0;i<values.length;i++){counts[i]=window.GANTRY_BONE_CORE.poisson(values[i],scan.random);total+=counts[i];}
      return {counts,total};
    });
    // Commit together; cancelled or unsafe calculations leave the exam intact.
    scan.heads.forEach((h,j)=>{
      for(let i=0;i<h.counts.length;i++)h.counts[i]+=increments[j].counts[i];
      h.total+=increments[j].total;h.elapsed+=elapsed;
    });
    scan.travel=Math.min(scan.target,scan.travel+elapsed*scan.velocity/60);
    const complete=scan.target-scan.travel<1e-8;
    if(complete)scan.travel=scan.target;
    scan.finished=complete||!!mdp&&duration>=mdp.remaining;
    scan.mdpLimit=!!mdp&&!complete&&duration>=mdp.remaining;
    scan.heads.forEach(h=>h.done=complete);
    scan.phase=scan.finished?'complete':'scanning';
    Object.assign(G,virtual);
    scan.geometrySignature=signature();
    if(mdp){mdp.advance(elapsed,false);scan.mdpEnd=mdp.metadata();}
  }
  function fields(G=window.GANTRY.G,seconds=window.GANTRY_MDP?.seconds,projectionCaches=null){
    const live=window.GANTRY_LIVE,settings=live.settings;
    const pose=window.GANTRY_MDP?.geometry(G.arms==='up'?'up':'down')||window.GANTRY_ICRP?.poses[G.arms==='up'?'up':'down'];
    if(!pose)throw Error('Preparando el fantoma óseo');
    const sizes=[1,2].map(detector=>geometry(pose,settings.matrix,settings,detector)),size=sizes[0];
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
    const nextKey=JSON.stringify([G.arms,sizes,pairs,metrics,flipX,seconds,mdp?.metadata().voidAt120]);
    if(nextKey!==key){
      cached={...size,fields:pairs.map((pair,i)=>{
        const size=sizes[i];
        const signature=JSON.stringify([G.arms,size,pair,metrics[i],flipX]);
        if(mdp){
          let cache=projectionCaches?.[i].get(signature)||(!projectionCaches&&detectorFields[i]?.mdpCache)||{};
          if(projectionCaches&&!projectionCaches[i].has(signature)){
            projectionCaches[i].set(signature,cache);
            // The scan owns this bounded response cache; discard it afterward.
            if(projectionCaches[i].size>8)projectionCaches[i].delete(projectionCaches[i].keys().next().value);
          }
          detectorFields[i]={key:signature,mdpCache:cache,field:mdp.field(pose,pair,size.crop,size.width,size.height,flipX,false,metrics[i],metrics[i].blur*size.width/240*size.zoom,G.arms==='up'?'up':'down',cache,seconds)};
        }else if(detectorFields[i]?.key!==signature)detectorFields[i]={key:signature,
          field:window.GANTRY_ICRP.field(pose,pair,size.crop,size.width,size.height,flipX,false,metrics[i],metrics[i].blur*size.width/240*size.zoom)};
        return detectorFields[i].field;
      })};
      key=nextKey;
    }
    return cached;
  }
  window.GANTRY_BONE_WHOLE={eligibility,geometry,position,fields,Scan,exposure,approach,safeTargets,rotationTargets,create,advance,instant};
})();
