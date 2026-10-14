/* Organ-based 99mTc-MDP kinetics, normalized to activity at injection. */
(function(){
  'use strict';
  const data=window.GANTRY_MDP_DATA,poses={},pending={};
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
    const arteries=(1-central-lungs)*Math.exp(-s/25),decay=2**(-t/HALF);
    const weights=[b.bone,b.blood*(1-central-lungs-arteries),b.soft,b.renal,b.urine-excreted,b.blood*central,b.blood*lungs,b.blood*arteries].map(x=>Math.max(0,x)*decay);
    return {weights,decay,excreted:excreted*decay,blood:b.blood*decay,bone:b.bone*decay,renal:b.renal*decay,soft:b.soft*decay,bladder:(b.urine-excreted)*decay};
  }
  async function load(name){
    if(poses[name])return poses[name];
    if(!pending[name])pending[name]=(async()=>{
      const p=data.poses[name],response=await fetch(p.url);
      if(!response.ok)throw Error('No se pudo cargar MDP ('+response.status+')');
      const buffer=await new Response(response.body.pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
      const values=new Uint16Array(buffer),n=data.width*data.height;
      if(values.length!==8*data.angles.length*n)throw Error('Atlas MDP incompleto');
      poses[name]=p.scales.map((scale,c)=>({width:data.width,height:data.height,scale,window:1,
        frames:data.angles.map((_,a)=>values.subarray((c*data.angles.length+a)*n,(c*data.angles.length+a+1)*n))}));
      return poses[name];
    })().catch(e=>{delete pending[name];throw e;});
    return pending[name];
  }
  function geometry(name){return window.GANTRY_ICRP_DATA[name];}
  // Keep the existing 3 mm detector coordinate convention, while mapping into
  // independently normalized 6 mm organ atlases. No fixed late bone image mixing.
  function field(pose,pair,crop,w,h,flipX,flipY,metrics,sigma,name,cache,seconds=state.seconds){
    const oldAngles=pose.angles,angle=(oldAngles[pair.lo]+(((oldAngles[pair.hi]-oldAngles[pair.lo])+360)%360)*pair.mix)%360;
    const pos=angle/10,lo=Math.floor(pos),angular={lo,hi:(lo+1)%36,mix:pos-lo};
    const ratio=(pose.pixelMm||3)/data.pixelMm;
    const mapped={x:data.width/2+(crop.x-pose.width/2)*ratio,y:data.headRow+(crop.y-pose.headRow)*ratio,w:crop.w*ratio,h:crop.h*ratio};
    const key=JSON.stringify([name,angular,mapped,w,h,flipX,flipY,metrics,sigma]);
    if(cache.key!==key){
      const bases=poses[name].map(p=>window.GANTRY_ICRP.field(p,angular,mapped,w,h,flipX,flipY,metrics,sigma).values);
      cache.key=key;cache.bases=bases;
      cache.result=null;
    }
    if(!cache.result||cache.seconds!==seconds||cache.voidAt120!==state.voidAt120){
      cache.result=mix(cache.bases,seconds);cache.seconds=seconds;cache.voidAt120=state.voidAt120;
    }
    return cache.result;
  }
  function mix(bases,seconds=state.seconds){
    const weights=fractions(seconds,state.voidAt120).weights;
    const values=new Float32Array(bases[0].length),cdf=new Float64Array(values.length);
    for(let c=0;c<8;c++)if(weights[c]>0)for(let i=0;i<values.length;i++)values[i]+=bases[c][i]*weights[c]*2000000;
    let sum=0,peak=0;for(let i=0;i<values.length;i++){cdf[i]=sum+=values[i];peak=Math.max(peak,values[i]);}
    return {values,cdf,sum,window:Math.max(1,peak*.8),mdpBases:bases};
  }
  function advance(seconds){state.seconds=Math.min(LIMIT,state.seconds+Math.max(0,seconds));if(state.seconds===LIMIT)state.playing=false;render();}
  function step(session,fields,seconds){
    let remaining=Math.min(seconds,LIMIT-state.seconds);
    while(remaining>1e-8&&!session.finished){
      const dt=Math.min(remaining,state.seconds<60?1:5, state.voidAt120&&state.seconds<7200?7200-state.seconds:Infinity);
      const previous=Math.max(...session.heads.map(h=>h.elapsed));
      session.step(fields.map(f=>mix(f.mdpBases,state.seconds+dt/2)),state.activityMBq*SENSITIVITY,dt);
      const used=Math.max(...session.heads.map(h=>h.elapsed))-previous;
      advance(Math.max(0,used));remaining-=dt;
      if(!(used>0))break;
    }
    if(state.seconds>=LIMIT&&!session.finished){session.finished=true;session.mdpLimit=true;}
  }
  const el=id=>document.getElementById(id);
  function metadata(){return {...state,model:'mdp-v1',sensitivityCpsPerMBq:SENSITIVITY,halfLifeMinutes:HALF};}
  function render(){
    if(!el('mdpControls'))return;
    const active=window.GANTRY_LIVE?.settings.study==='bone',locked=active&&window.GANTRY_BONE_ACQ?.active;
    el('mdpControls').hidden=!active;
    if(el('boneCountRate'))el('boneCountRate').closest('label').hidden=active||(window.GANTRY_LIVE?.settings.study==='mibi'&&!!window.GANTRY_MIBI);
    for(const id of ['mdpActivity','mdpUnit','mdpMinutes','mdpTimeline','mdpPlay','mdpSpeed','mdpVoid'])el(id).disabled=!!locked;
    if(document.activeElement!==el('mdpMinutes'))el('mdpMinutes').value=(state.seconds/60).toFixed(2);
    el('mdpTimeline').value=state.seconds;
    el('mdpPlay').textContent=state.playing?'Pausar evolución':state.seconds>=LIMIT?'Reiniciar desde 0':'Reproducir evolución';
    const f=fractions(state.seconds,state.voidAt120),p=x=>(100*x).toFixed(1)+'%',clock=Math.floor(state.seconds+1e-6);
    el('mdpStats').textContent=(state.seconds<60?'Vascular':state.seconds<600?'Pool / captación':'Captación ósea')+' · '+Math.floor(clock/60)+':'+String(clock%60).padStart(2,'0')+' / 180:00 · Sangre '+p(f.blood)+' · Hueso '+p(f.bone)+' · Tejidos '+p(f.soft)+' · Riñones '+p(f.renal)+' · Vejiga '+p(f.bladder)+' · Eliminado '+p(f.excreted);
    el('mdpDose').textContent=state.activityMBq.toFixed(0)+' MBq / '+(state.activityMBq/37).toFixed(1)+' mCi · actividad corporal '+(f.weights.reduce((a,b)=>a+b,0)*state.activityMBq).toFixed(0)+' MBq';
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
      if(!document.hidden&&state.playing&&window.GANTRY_LIVE?.settings.study==='bone'&&!window.GANTRY_BONE_ACQ?.active){advance(dt*state.speed);window.GANTRY_LIVE.update(window.GANTRY.G);}
    },100);
    render();
  }
  window.GANTRY_MDP={load,geometry,field,mix,fractions,advance,step,render,metadata,
    get rate(){return state.activityMBq*SENSITIVITY;},get seconds(){return state.seconds;},
    begin(){state.playing=false;return metadata();},get remaining(){return LIMIT-state.seconds;}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
