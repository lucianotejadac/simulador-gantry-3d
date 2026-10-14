/* Cardiac sestamibi: biological uptake/clearance and physical decay are separate. */
(function(){
  'use strict';
  const data=window.GANTRY_MIBI_DATA,LIMIT=720*60,HALF=360.402,SENSITIVITY=100;
  const state={activityMBq:740,seconds:3600,protocol:'rest',voidEvery120:true,playing:false,speed:60};
  const protocols={rest:{label:'Reposo',minimum:45,reference:60,window:'45–60 min'},exercise:{label:'Ejercicio',minimum:15,reference:20,window:'15–20 min'},pharmacologic:{label:'Estrés farmacológico',minimum:60,reference:60,window:'desde 60 min'}};
  const times=[5,30,60,120,240];
  // Biological percentages from the label's Table 6, NOT its effective column.
  const table={rest:{heart:[1.2,1.1,1.0,1.0,.8],liver:[19.6,12.2,5.6,2.2,.7]},exercise:{heart:[1.5,1.4,1.4,1.2,1.0],liver:[5.9,4.5,2.4,.9,.3]}};
  function curve(t,values,tailHalf){
    if(t<5)return values[0]*(1-Math.exp(-t/.8))/(1-Math.exp(-5/.8))/100;
    for(let i=1;i<times.length;i++)if(t<=times[i])return Math.exp(Math.log(values[i-1])+(Math.log(values[i])-Math.log(values[i-1]))*(t-times[i-1])/(times[i]-times[i-1]))/100;
    return values.at(-1)/100*2**(-(t-240)/tailHalf);
  }
  function fractions(seconds,protocol='rest',voiding=true){
    const t=Math.max(0,Math.min(720,seconds/60)),exercise=protocol==='exercise';
    // No quantitative drug-specific organ table is available: the pharmacologic
    // scenario explicitly uses rest kinetics, with its own timing guidance.
    const tab=table[exercise?'exercise':'rest'];
    const blood=.18*2**(-t/(exercise?1.6:4.3))+.82*2**(-t/.35);
    const heart=curve(t,tab.heart,360),liver=curve(t,tab.liver,30);
    const deliveredBile=(exercise?.08:.23)*(1-Math.exp(-t/.8))+(.34-(exercise?.08:.23))*(1-Math.exp(-t/80));
    const biliary=Math.max(0,deliveredBile-liver),gall=biliary*Math.exp(-Math.max(0,t-10)/30);
    const bowel=biliary-gall,feces=bowel*(1-Math.exp(-Math.max(0,t-120)/900));
    const intestinal=bowel-feces,colonFraction=1-Math.exp(-Math.max(0,t-45)/180);
    const kidneys=.10*(1-Math.exp(-t/1.5))*Math.exp(-t/25)+.025*(1-Math.exp(-t/2))*Math.exp(-t/150);
    const glands=.025*(1-Math.exp(-t))*2**(-t/180);
    const urineAt=m=>.27*(1-Math.exp(-m/180)),urine=urineAt(t);
    const voided=voiding?urineAt(Math.floor((t+1e-9)/120)*120):0;
    const soft=1-blood-heart-liver-gall-bowel-kidneys-glands-urine;
    const decay=2**(-t/HALF);
    const weights=[heart,blood,soft,liver,gall,intestinal*(1-colonFraction),intestinal*colonFraction,kidneys,urine-voided,glands].map(v=>Math.max(0,v)*decay);
    return {weights,decay,biologicalHeart:heart,biologicalLiver:liver,heart:heart*decay,liver:liver*decay,blood:blood*decay,
      bowel:intestinal*decay,kidneys:kidneys*decay,bladder:(urine-voided)*decay,excreted:(voided+feces)*decay};
  }
  function timing(seconds,protocol=state.protocol){
    const p=protocols[protocol],t=seconds/60,current=fractions(seconds,protocol),ref=fractions(p.reference*60,protocol);
    const ratio=current.heart/ref.heart;
    return {label:p.label,window:p.window,ratio,timeFactor:ratio>0?1/ratio:Infinity,
      phase:t<p.minimum?'early':t<=120?'usual':t<=240?'delayed':'prolonged',
      message:t<p.minimum?'Temprana: comprobar fondo sanguíneo y actividad hepática.':t<=120?'Intervalo habitual: comprobar actividad subdiafragmática antes de adquirir.':t<=240?'Adquisición demorada: menos cuentas miocárdicas; el intestino puede seguir interfiriendo.':'Demora prolongada: pérdida de cuentas por decaimiento y aclaramiento; mayor ruido para igual duración.'};
  }
  let poses=null,pending=null;
  function load(){
    if(poses)return Promise.resolve(poses);
    if(!pending)pending=(async()=>{
      const response=await fetch(data.url);if(!response.ok)throw Error('No se pudo cargar MIBI ('+response.status+')');
      const buffer=await new Response(response.body.pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
      const v=new Uint16Array(buffer),n=data.width*data.height;
      if(v.length!==data.components.length*data.angles.length*n)throw Error('Atlas MIBI incompleto');
      poses=data.scales.map((scale,c)=>({width:data.width,height:data.height,scale,window:1,frames:data.angles.map((_,a)=>v.subarray((c*data.angles.length+a)*n,(c*data.angles.length+a+1)*n))}));
      return poses;
    })().catch(e=>{pending=null;throw e;});
    return pending;
  }
  const geometry=()=>window.GANTRY_ICRP_DATA.mibi_up;
  function field(pose,pair,crop,w,h,flipX,flipY,metrics,sigma,cache,seconds=state.seconds){
    const angle=(pose.angles[pair.lo]+((pose.angles[pair.hi]-pose.angles[pair.lo]+360)%360)*pair.mix)%360;
    const a=angle/10,lo=Math.floor(a),angular={lo,hi:(lo+1)%36,mix:a-lo};
    const r=(pose.pixelMm||3)/data.pixelMm;
    const mapped={x:data.width/2+(crop.x-pose.width/2)*r,y:data.headRow+(crop.y-pose.headRow)*r,w:crop.w*r,h:crop.h*r};
    const key=JSON.stringify([angular,mapped,w,h,flipX,flipY,metrics,sigma]);
    if(cache.key!==key){cache.key=key;cache.bases=poses.map(p=>window.GANTRY_ICRP.field(p,angular,mapped,w,h,flipX,flipY,metrics,sigma).values);cache.result=null;}
    const temporal=[seconds,state.protocol,state.voidEvery120].join('|');
    if(!cache.result||cache.temporal!==temporal){cache.result=mix(cache.bases,seconds);cache.temporal=temporal;}
    return cache.result;
  }
  function mix(bases,seconds=state.seconds){
    const weights=fractions(seconds,state.protocol,state.voidEvery120).weights;
    const values=new Float32Array(bases[0].length),cdf=new Float64Array(values.length);
    for(let c=0;c<weights.length;c++)if(weights[c]>0)for(let i=0;i<values.length;i++)values[i]+=bases[c][i]*weights[c]*2000000;
    let sum=0,peak=0;for(let i=0;i<values.length;i++){cdf[i]=sum+=values[i];peak=Math.max(peak,values[i]);}
    return {values,cdf,sum,window:Math.max(1,peak*.8),mibiBases:bases};
  }
  function advance(seconds){state.seconds=Math.min(LIMIT,state.seconds+Math.max(0,seconds));if(state.seconds>=LIMIT)state.playing=false;render();}
  function step(session,fields,seconds){
    let remaining=Math.min(seconds,LIMIT-state.seconds);
    while(remaining>1e-8&&!session.finished){
      const nextVoid=(Math.floor((state.seconds+1e-7)/7200)+1)*7200;
      const dt=Math.min(remaining,state.seconds<60?1:5,state.voidEvery120?nextVoid-state.seconds:Infinity);
      const previous=Math.max(...session.heads.map(h=>h.elapsed));
      session.step(fields.map(f=>mix(f.mibiBases,state.seconds+dt/2)),state.activityMBq*SENSITIVITY,dt);
      const used=Math.max(...session.heads.map(h=>h.elapsed))-previous;
      advance(Math.max(0,used));remaining-=dt;if(!(used>0))break;
    }
    if(state.seconds>=LIMIT&&!session.finished){session.finished=true;session.mibiLimit=true;}
  }
  const el=id=>document.getElementById(id);
  const metadata=()=>({...state,model:'mibi-v1',tracer:'99mTc-sestamibi',sensitivityCpsPerMBq:SENSITIVITY,halfLifeMinutes:HALF});
  function render(){
    if(!el('mibiControls'))return;
    const active=window.GANTRY_LIVE?.settings.study==='mibi',locked=active&&window.GANTRY_BONE_ACQ?.active;
    el('mibiControls').hidden=!active;
    if(active&&el('boneCountRate'))el('boneCountRate').closest('label').hidden=true;
    for(const id of ['mibiActivity','mibiUnit','mibiMinutes','mibiTimeline','mibiProtocol','mibiPlay','mibiSpeed','mibiVoid','mibiUsual','mibiLate'])el(id).disabled=!!locked;
    if(document.activeElement!==el('mibiMinutes'))el('mibiMinutes').value=(state.seconds/60).toFixed(2);
    el('mibiTimeline').value=state.seconds;
    el('mibiPlay').textContent=state.playing?'Pausar evolución':state.seconds>=LIMIT?'Reiniciar desde 0':'Reproducir evolución';
    const f=fractions(state.seconds,state.protocol,state.voidEvery120),p=x=>(100*x).toFixed(2)+'%',seconds=Math.floor(state.seconds+1e-6);
    el('mibiStats').textContent=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+' / 720:00 · VI '+p(f.heart)+' · Hígado '+p(f.liver)+' · Intestino '+p(f.bowel)+' · Riñones '+p(f.kidneys)+' · Vejiga '+p(f.bladder)+' · Eliminado '+p(f.excreted);
    el('mibiDose').textContent=state.activityMBq.toFixed(0)+' MBq / '+(state.activityMBq/37).toFixed(1)+' mCi · Tc-99m restante por decaimiento: '+p(f.decay);
    const info=timing(state.seconds,state.protocol);
    el('mibiTiming').textContent=info.label+' · inicio orientativo: '+info.window+' · '+info.message+' VI: '+Math.round(info.ratio*100)+'% de cuentas respecto a '+protocols[state.protocol].reference+' min'+(info.ratio>0&&info.ratio<1?' · igualar cuentas: ≈'+info.timeFactor.toFixed(1)+'× tiempo':'')+'.';
    el('mibiTiming').dataset.phase=info.phase;
    el('mibiPharmNote').hidden=state.protocol!=='pharmacologic';
  }
  function refresh(){window.GANTRY_LIVE?.clearPersistence();render();}
  function init(){
    if(!el('mibiControls'))return;
    el('mibiActivity').onchange=()=>{const a=Number(el('mibiActivity').value)*(el('mibiUnit').value==='mCi'?37:1);if(Number.isFinite(a)&&a>0&&a<=2000)state.activityMBq=a;else el('mibiActivity').value=state.activityMBq/(el('mibiUnit').value==='mCi'?37:1);refresh();};
    el('mibiActivity').oninput=()=>{if(el('mibiActivity').value&&el('mibiActivity').validity.valid)el('mibiActivity').onchange();};
    el('mibiUnit').onchange=()=>{el('mibiActivity').value=+(state.activityMBq/(el('mibiUnit').value==='mCi'?37:1)).toFixed(2);el('mibiActivity').max=el('mibiUnit').value==='mCi'?2000/37:2000;};
    const setTime=s=>{if(Number.isFinite(s))state.seconds=Math.max(0,Math.min(LIMIT,s));state.playing=false;refresh();};
    el('mibiMinutes').onchange=()=>setTime(Number(el('mibiMinutes').value)*60);
    el('mibiMinutes').oninput=()=>{if(el('mibiMinutes').value&&el('mibiMinutes').validity.valid)setTime(Number(el('mibiMinutes').value)*60);};
    el('mibiTimeline').oninput=()=>setTime(Number(el('mibiTimeline').value));
    el('mibiProtocol').onchange=()=>{state.protocol=el('mibiProtocol').value;refresh();};
    el('mibiUsual').onclick=()=>setTime(protocols[state.protocol].reference*60);
    el('mibiLate').onclick=()=>setTime(360*60);
    el('mibiPlay').onclick=()=>{if(state.seconds>=LIMIT)state.seconds=0;state.playing=!state.playing;render();};
    el('mibiSpeed').onchange=()=>state.speed=Number(el('mibiSpeed').value);
    el('mibiVoid').onchange=()=>{state.voidEvery120=el('mibiVoid').checked;refresh();};
    let last=performance.now();setInterval(()=>{
      const now=performance.now(),dt=Math.min(.5,(now-last)/1000);last=now;
      if(!document.hidden&&state.playing&&window.GANTRY_LIVE?.settings.study==='mibi'&&!window.GANTRY_BONE_ACQ?.active){advance(dt*state.speed);window.GANTRY_LIVE.update(window.GANTRY.G);}
    },100);render();
  }
  window.GANTRY_MIBI={load,geometry,field,mix,fractions,timing,advance,step,render,metadata,
    get rate(){return state.activityMBq*SENSITIVITY;},get seconds(){return state.seconds;},
    begin(){state.playing=false;return metadata();},get remaining(){return LIMIT-state.seconds;}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
