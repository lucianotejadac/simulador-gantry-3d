/* Organ-based 99mTc-MDP kinetics, normalized to activity at injection. */
(function(){
  'use strict';
  const data=window.GANTRY_MDP_DATA,poses={},pending={},nativeChunks=new Map(),nativePending=new Map();
  const wrap=a=>(a%360+360)%360;
  const scatterAppearance=Object.freeze({model:'mdp-diffuse-v2-background',oddsMultiplier:6,sigmaMm:30,maxFraction:.55});
  const backgroundAppearance=Object.freeze({model:'mdp-tissue-balance-v1',boneRedistributionFraction:0.2640939054649198,transitionMinutes:Object.freeze([5,30])});
  // First-pass decay retained; a small residual is fitted on the acquisition
  // clock (dynamic start = injection, supplied by the user). This redistributes
  // circulating activity spatially; it does not change systemic clearance.
  // Rise and post-120 s fade are smooth display constraints, not measured kinetics.
  const vascularAppearance=Object.freeze({model:'mdp-triphase-oseos-v2',arterialTransitSeconds:9,
    residualFraction:.0393,residualRiseStartSeconds:10,residualRiseEndSeconds:40,
    residualFadeStartSeconds:120,residualFadeEndSeconds:600,
    reference:'assets/physics/mdp-temporal-calibration.json'});
  const smooth=(s,a,b)=>{const u=Math.max(0,Math.min(1,(s-a)/(b-a)));return u*u*(3-2*u);};
  const backgroundEligible=new WeakSet(),backgroundBones=new WeakMap();
  function neededChunks(name,angles){
    const d=data.poses[name].nativeBone;if(!d)return [];
    return [...new Set(angles.flatMap(a=>[Math.floor(wrap(a)),(Math.floor(wrap(a))+1)%360]).map(a=>Math.floor(a/d.chunkSize)))];
  }
  function hasAngles(name,angles){
    return !data.poses[name].nativeBone||neededChunks(name,angles).every(i=>nativeChunks.has(name+':'+i));
  }
  async function ensureAngles(name,angles){
    const d=data.poses[name].nativeBone;if(!d)return;
    const needed=neededChunks(name,angles),keep=new Set(needed.map(i=>name+':'+i));
    await Promise.all(needed.map(i=>{
      const key=name+':'+i;
      if(nativeChunks.has(key)){const item=nativeChunks.get(key);nativeChunks.delete(key);nativeChunks.set(key,item);return;}
      if(!nativePending.has(key))nativePending.set(key,(async()=>{
        const chunk=d.chunks[i],r=await (window.GANTRY_ASSETS?.fetch||fetch)(chunk.url);
        if(!r.ok)throw Error('No se pudo cargar la proyección ósea nativa ('+r.status+')');
        const buffer=await new Response(r.body.pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
        const values=new Uint16Array(buffer),n=d.width*d.height;
        if(values.length!==chunk.count*n)throw Error('Proyección ósea nativa incompleta');
        const bone=poses[name][0];
        for(let j=0;j<chunk.count;j++)bone.frames[chunk.first+j]=values.subarray(j*n,(j+1)*n);
        nativeChunks.set(key,{name,first:chunk.first,count:chunk.count});
      })().finally(()=>nativePending.delete(key)));
      return nativePending.get(key);
    }));
    // Eight chunks globally: <=48 MiB of decoded bone views, not both 360-view atlases.
    for(const [key,item] of nativeChunks){
      if(nativeChunks.size<=8)break;
      if(keep.has(key)||item.first===0||item.first===180)continue;
      for(let j=0;j<item.count;j++)poses[item.name][0].frames[item.first+j]=undefined;
      nativeChunks.delete(key);
    }
  }
  const state={activityMBq:740,seconds:7200,playing:false,speed:60,voidAt120:true};
  const LIMIT=10800,HALF=360.402,SENSITIVITY=100;
  // Blood anchors ~9.4% at 1 h and 5.1% at 2 h (before physical decay).
  // Remaining activity is partitioned conservatively; timing is illustrative.
  function fractions(seconds,voidAt120=true){
    const t=Math.max(0,Math.min(180,seconds/60));
    function biological(t){
      const blood=.78*Math.exp(-t/2)+.14*Math.exp(-t/45)+.08*Math.exp(-t/180);
      const bone=(1-blood)*.5*(1-Math.exp(-t/12));
      const rest=1-blood-bone;
      const renal=rest*.12*Math.exp(-t/40);
      const urine=rest*(1-Math.exp(-Math.max(0,t-.25)/45))*.98;
      return {blood,bone,renal,urine,soft:rest-renal-urine};
    }
    const b=biological(t),excreted=voidAt120&&t>=120?biological(120).urine:0;
    const s=t*60,central=Math.exp(-s/6),lungs=(1-central)*Math.exp(-s/12);
    const fast=Math.exp(-s/vascularAppearance.arterialTransitSeconds);
    const residual=vascularAppearance.residualFraction*smooth(s,vascularAppearance.residualRiseStartSeconds,vascularAppearance.residualRiseEndSeconds)
      *(1-smooth(s,vascularAppearance.residualFadeStartSeconds,vascularAppearance.residualFadeEndSeconds));
    const arteries=(1-central-lungs)*(fast+(1-fast)*residual),decay=2**(-t/HALF);
    // The inherited vascular basis strongly emphasizes the cardiac chambers.
    // Retain it for first pass/pool, then replace its spatial contrast with
    // diffuse background. This is a teaching display model, not zero blood
    // activity at 30 min. Preserve total circulating activity and bone/renal kinetics.
    const u=Math.max(0,Math.min(1,(t-5)/25)),vascularContrast=1-u*u*(3-2*u);
    const visibleBlood=b.blood*vascularContrast,diffuseBlood=b.blood-visibleBlood;
    const weights=[b.bone,visibleBlood*(1-central-lungs-arteries),b.soft+diffuseBlood,b.renal,b.urine-excreted,visibleBlood*central,visibleBlood*lungs,visibleBlood*arteries].map(x=>Math.max(0,x)*decay);
    return {weights,decay,vascularContrast,diffuseBlood:diffuseBlood*decay,excreted:excreted*decay,blood:b.blood*decay,bone:b.bone*decay,renal:b.renal*decay,soft:b.soft*decay,bladder:(b.urine-excreted)*decay};
  }
  async function load(name){
    if(pending[name])return pending[name];
    if(poses[name]){await ensureAngles(name,[0,180]);return poses[name];}
    if(!pending[name])pending[name]=(async()=>{
      const p=data.poses[name],n=data.width*data.height;
      const groups=await Promise.all([['bone',data.angles,1],['organs',data.organAngles,7]].map(async([key,angles,count])=>{
        if(key==='bone'&&p.nativeBone){
          const b=p.nativeBone;let depth=null;
          if(b.depth){
            const response=await (window.GANTRY_ASSETS?.fetch||fetch)(b.depth.url);
            if(!response.ok)throw Error('No se pudo cargar la profundidad ósea');
            const buffer=await new Response(response.body.pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
            const values=new Float32Array(buffer);
            if(values.length!==360*b.depth.width*b.depth.height*3)throw Error('Profundidad ósea incompleta');
            depth={...b.depth,values};
          }
          return [{...b,depth,angles:data.angles,window:1,nativeSampling:true,frames:new Array(360)}];
        }
        const payload=p[key],response=await (window.GANTRY_ASSETS?.fetch||fetch)(payload.url);
        if(!response.ok)throw Error('No se pudo cargar MDP ('+response.status+')');
        const buffer=await new Response(response.body.pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
        const values=new Uint16Array(buffer);
        if(payload.scales.length!==count||values.length!==count*angles.length*n)throw Error('Atlas MDP incompleto');
        return payload.scales.map((scale,c)=>({width:data.width,height:data.height,pixelMm:data.pixelMm,scale,window:1,angles,
          frames:angles.map((_,a)=>values.subarray((c*angles.length+a)*n,(c*angles.length+a+1)*n))}));
      }));
      poses[name]=groups.flat();
      await ensureAngles(name,[0,180]);
      return poses[name];
    })().catch(e=>{delete pending[name];throw e;});
    return pending[name];
  }
  function geometry(name){return window.GANTRY_ICRP_DATA[name];}
  function depthResponse(source,pair,crop,metrics){
    const d=source.depth;
    if(!d?.values||!window.GANTRY_CAMERA?.withDepth||!Number.isFinite(metrics.psfSigmaMm))return metrics;
    let mass=0,first=0,second=0;const stride=d.width*d.height*3;
    for(let y=0;y<d.height;y++)for(let x=0;x<d.width;x++){
      const overlap=Math.max(0,Math.min((x+1)*d.tileWidthPx,crop.x+crop.w)-Math.max(x*d.tileWidthPx,crop.x))*
        Math.max(0,Math.min((y+1)*d.tileHeightPx,crop.y+crop.h)-Math.max(y*d.tileHeightPx,crop.y));
      if(!overlap)continue;
      const k=(y*d.width+x)*3,lo=pair.lo*stride+k,hi=pair.hi*stride+k;
      const v=c=>(d.values[lo+c]*(1-pair.mix)+d.values[hi+c]*pair.mix)*overlap;
      mass+=v(0);first+=v(1);second+=v(2);
    }
    return mass>0?window.GANTRY_CAMERA.withDepth(metrics,first/mass,second/mass):metrics;
  }
  // Keep the existing 3 mm detector coordinate convention, while mapping into
  // independently normalized 6 mm organ atlases. No fixed late bone image mixing.
  function field(pose,pair,crop,w,h,flipX,flipY,metrics,sigma,name,cache,seconds=state.seconds){
    const oldAngles=pose.angles,angle=(oldAngles[pair.lo]+(((oldAngles[pair.hi]-oldAngles[pair.lo])+360)%360)*pair.mix)%360;
    const ratio=(pose.pixelMm||3)/data.pixelMm;
    const mapped={x:data.width/2+(crop.x-pose.width/2)*ratio,y:data.headRow+(crop.y-pose.headRow)*ratio,w:crop.w*ratio,h:crop.h*ratio};
    const key=JSON.stringify([name,angle,mapped,w,h,flipX,flipY,metrics,sigma]);
    if(cache.key!==key){
      // Late MDP has no focal vascular activity. Project only the components
      // requested by the kinetics, retaining lazy access for clock rewinds,
      // subsequent bladder filling and acquisition/final-image integration.
      const bases=new Array(poses[name].length),spatialMetrics={...metrics};
      if(!metrics.uncollimated&&Number.isFinite(metrics.psfSigmaMm)){
        // Phenomenological MDP appearance, informed by local planar comparison;
        // not a measured Siemens scatter fraction. Retain the existing spectral
        // window dependence, with a nonzero diffuse component at the photopeak.
        // 6 odds multiplier -> ~33% at a centred 15% Tc-99m window.
        const spectral=Math.max(0,Math.min(1,metrics.energy?.scatterFraction||0));
        const odds=scatterAppearance.oddsMultiplier;
        spatialMetrics.spatialScatterFraction=Math.min(scatterAppearance.maxFraction,odds*spectral/(1+(odds-1)*spectral));
        spatialMetrics.spatialScatterSigmaMm=scatterAppearance.sigmaMm;
        spatialMetrics.scatterModel=scatterAppearance.model;
      }
      poses[name].forEach((p,c)=>{
        const pos=angle*p.angles.length/360,lo=Math.floor(pos),angular={lo,hi:(lo+1)%p.angles.length,mix:pos-lo};
        // Retain frame references so later kinetic mixing is safe after LRU eviction.
        const source=p.nativeSampling?{...p,frames:[p.frames[angular.lo],p.frames[angular.hi]]}:p;
        const pair=p.nativeSampling?{lo:0,hi:1,mix:angular.mix}:angular;
        if(p.nativeSampling&&(!source.frames[0]||!source.frames[1]))throw Error('Preparando ángulo óseo nativo');
        const ratio=(pose.pixelMm||3)/(p.pixelMm||data.pixelMm);
        const local=p.nativeSampling?{x:p.width/2+(crop.x-pose.width/2)*ratio,
          y:p.headRow+(crop.y-pose.headRow)*ratio,w:crop.w*ratio,h:crop.h*ratio}:mapped;
        const response=p.nativeSampling?depthResponse(p,angular,local,spatialMetrics):spatialMetrics;
        if(c===0)cache.projectionResponse=response;
        Object.defineProperty(bases,c,{enumerable:true,configurable:true,get(){
        const value=window.GANTRY_ICRP.field(source,pair,local,w,h,flipX,flipY,response,sigma).values;
        Object.defineProperty(bases,c,{value,enumerable:true,configurable:true});
        return value;
      }});});
      cache.key=key;cache.bases=bases;
      if(!metrics.uncollimated&&Number.isFinite(metrics.psfSigmaMm))backgroundEligible.add(bases);
      cache.result=null;
    }
    if(!cache.result||cache.seconds!==seconds||cache.voidAt120!==state.voidAt120){
      cache.result=mix(cache.bases,seconds);cache.seconds=seconds;cache.voidAt120=state.voidAt120;
    }
    cache.result.projectionResponse=cache.projectionResponse;
    return cache.result;
  }
  function mix(bases,seconds=state.seconds){
    const weights=fractions(seconds,state.voidAt120).weights;
    const values=new Float32Array(bases[0].length),cdf=new Float64Array(values.length);
    // Visual tissue balance fitted at 120 min, not a change to organ activity.
    // Keep the first pass unchanged; introduce the late appearance smoothly.
    const [start,end]=backgroundAppearance.transitionMinutes;
    const u=Math.max(0,Math.min(1,(seconds/60-start)/(end-start)));
    const blend=backgroundEligible.has(bases)?u*u*(3-2*u):0;
    let adjustedBone=null;
    if(blend>0&&weights[0]>0){
      if(!backgroundBones.has(bases)){
        const bone=bases[0],soft=bases[2];let boneSum=0,softSum=0;
        for(let i=0;i<bone.length;i++){boneSum+=bone[i];softSum+=soft[i];}
        if(softSum>0&&boneSum>0){
          const alpha=backgroundAppearance.boneRedistributionFraction;
          const adjusted=new Float32Array(bone.length),scale=alpha*boneSum/softSum;
          for(let i=0;i<bone.length;i++)adjusted[i]=bone[i]*(1-alpha)+soft[i]*scale;
          backgroundBones.set(bases,adjusted);
        }else backgroundBones.set(bases,bone);
      }
      adjustedBone=backgroundBones.get(bases);
    }
    for(let c=0;c<8;c++)if(weights[c]>0){
      const base=c===0&&adjustedBone&&blend===1?adjustedBone:bases[c];
      if(c===0&&adjustedBone&&blend<1){
        for(let i=0;i<values.length;i++)values[i]+=(base[i]*(1-blend)+adjustedBone[i]*blend)*weights[c]*2000000;
      }else for(let i=0;i<values.length;i++)values[i]+=base[i]*weights[c]*2000000;
    }
    let sum=0,peak=0;for(let i=0;i<values.length;i++){cdf[i]=sum+=values[i];peak=Math.max(peak,values[i]);}
    return {values,cdf,sum,window:Math.max(1,peak*.8),mdpBases:bases};
  }
  function advance(seconds,display=true){state.seconds=Math.min(LIMIT,state.seconds+Math.max(0,seconds));if(state.seconds===LIMIT)state.playing=false;if(display)render();}
  function step(session,fields,seconds){
    let remaining=Math.min(seconds,LIMIT-state.seconds);
    while(remaining>1e-8&&!session.finished){
      const frameRemaining=session.dynamic?session.dynamic.schedule[session.dynamic.frames.length].end-session.heads[0].elapsed:Infinity;
      const previous=Math.max(...session.heads.map(h=>h.elapsed));
      const quantum=state.seconds<60?1:5,next=(Math.floor((state.seconds+1e-7)/quantum)+1)*quantum;
      const targetRemaining=session.mode==='time'?session.target-previous:Infinity;
      const dt=Math.min(remaining,next-state.seconds,frameRemaining,targetRemaining, state.voidAt120&&state.seconds<7200?7200-state.seconds:Infinity);
      if(!(dt>0))break;
      session.step(fields.map(f=>mix(f.mdpBases,state.seconds+dt/2)),state.activityMBq*SENSITIVITY,dt);
      const used=Math.max(...session.heads.map(h=>h.elapsed))-previous;
      advance(Math.max(0,used));remaining-=dt;
      if(!(used>0))break;
    }
    if(state.seconds>=LIMIT&&!session.finished){session.finished=true;session.mdpLimit=true;}
  }
  const el=id=>document.getElementById(id);
  function metadata(){return {...state,scatterAppearance:{...scatterAppearance},backgroundAppearance:{...backgroundAppearance,transitionMinutes:[...backgroundAppearance.transitionMinutes]},vascularAppearance:{...vascularAppearance},vascularPhantom:data.vascularModel?.model||null,model:'mdp-v3-triphase',projectionModel:data.nativeBoneModel||'coarse-6mm',boneDepthModel:data.poses.up.nativeBone?.depth?.model||null,vascularFadeMinutes:[5,30],sensitivityCpsPerMBq:SENSITIVITY,halfLifeMinutes:HALF};}
  function render(){
    if(!el('mdpControls'))return;
    const active=window.GANTRY_LIVE?.settings.study==='bone',locked=active&&window.GANTRY_BONE_ACQ?.active;
    el('mdpControls').hidden=!active;
    if(el('boneCountRate'))el('boneCountRate').closest('label').hidden=true;
    for(const id of ['mdpActivity','mdpUnit','mdpMinutes','mdpTimeline','mdpPlay','mdpSpeed','mdpVoid'])el(id).disabled=!!locked;
    if(window.GANTRY_LIVE?.signal?.mode==='final')el('mdpPlay').disabled=true;
    if(window.GANTRY_RF?.pending('bone'))el('mdpPlay').disabled=true;
    if(document.activeElement!==el('mdpMinutes'))el('mdpMinutes').value=(state.seconds/60).toFixed(2);
    el('mdpTimeline').value=state.seconds;
    el('mdpSpeed').value=String(state.speed);
    el('mdpPlay').textContent=state.playing?'Pausar evolución':state.seconds>=LIMIT?'Reiniciar desde 0':'Reproducir evolución';
    const f=fractions(state.seconds,state.voidAt120),p=x=>(100*x).toFixed(1)+'%',clock=Math.floor(state.seconds+1e-6);
    el('mdpStats').textContent=(state.seconds<60?'Vascular':state.seconds<600?'Pool / captación':'Captación ósea')+' · '+Math.floor(clock/60)+':'+String(clock%60).padStart(2,'0')+' / 180:00 · Sangre '+p(f.blood)+' · Hueso '+p(f.bone)+' · Tejidos '+p(f.soft)+' · Riñones '+p(f.renal)+' · Vejiga '+p(f.bladder)+' · Eliminado '+p(f.excreted);
    el('mdpDose').textContent=state.activityMBq.toFixed(0)+' MBq / '+(state.activityMBq/37).toFixed(1)+' mCi · actividad corporal '+(f.weights.reduce((a,b)=>a+b,0)*state.activityMBq).toFixed(0)+' MBq · '+data.angles.length+' proyecciones óseas (1°)';
  }
  function refresh(){window.GANTRY_LIVE?.clearPersistence();render();}
  function init(){
    if(!el('mdpControls'))return;
    el('mdpActivity').onchange=()=>{const a=Number(el('mdpActivity').value)*(el('mdpUnit').value==='mCi'?37:1);if(Number.isFinite(a)&&a>0&&a<=2000)state.activityMBq=a;else el('mdpActivity').value=state.activityMBq/(el('mdpUnit').value==='mCi'?37:1);refresh();};
    el('mdpActivity').oninput=()=>{if(el('mdpActivity').value&&el('mdpActivity').validity.valid)el('mdpActivity').onchange();};
    el('mdpUnit').onchange=()=>{el('mdpActivity').value=+(state.activityMBq/(el('mdpUnit').value==='mCi'?37:1)).toFixed(2);el('mdpActivity').max=el('mdpUnit').value==='mCi'?2000/37:2000;};
    const setTime=s=>{if(Number.isFinite(s))state.seconds=Math.max(0,Math.min(LIMIT,s));state.playing=false;refresh();};
    el('mdpMinutes').onchange=()=>setTime(Number(el('mdpMinutes').value)*60);
    el('mdpMinutes').oninput=()=>{if(el('mdpMinutes').value&&el('mdpMinutes').validity.valid)setTime(Number(el('mdpMinutes').value)*60);};
    el('mdpTimeline').oninput=()=>setTime(Number(el('mdpTimeline').value));
    el('mdpPlay').onclick=()=>{if(state.seconds>=LIMIT)state.seconds=0;state.playing=!state.playing;render();};
    el('mdpSpeed').onchange=()=>state.speed=Number(el('mdpSpeed').value);
    el('mdpVoid').onchange=()=>{state.voidAt120=el('mdpVoid').checked;refresh();};
    let last=performance.now();setInterval(()=>{
      const now=performance.now(),dt=Math.min(.5,(now-last)/1000);last=now;
      if(!document.hidden&&state.playing&&!window.GANTRY_RF?.pending('bone')&&window.GANTRY_LIVE?.settings.study==='bone'&&!window.GANTRY_BONE_ACQ?.active){advance(dt*state.speed);window.GANTRY_LIVE.update(window.GANTRY.G);}
    },100);
    render();
  }
  function configure(activityMBq,seconds,playing=false){
    if(window.GANTRY_BONE_ACQ?.active||!Number.isFinite(activityMBq)||activityMBq<=0||activityMBq>2000||!Number.isFinite(seconds)||seconds<0||seconds>LIMIT)return false;
    Object.assign(state,{activityMBq,seconds,playing,speed:playing?1:state.speed});
    if(el('mdpActivity'))el('mdpActivity').value=+(activityMBq/(el('mdpUnit').value==='mCi'?37:1)).toFixed(3);
    refresh();return true;
  }
  window.GANTRY_MDP={load,geometry,field,mix,fractions,advance,step,render,metadata,configure,ensureAngles,hasAngles,hasPose:name=>!!poses[name],
    get rate(){return state.activityMBq*SENSITIVITY;},get seconds(){return state.seconds;},
    begin(){state.playing=false;return metadata();},get remaining(){return LIMIT-state.seconds;}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
