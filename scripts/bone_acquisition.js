/* Independent Poisson accumulation from linear detector fields, never screenshots. */
(function(){
  'use strict';
  const logFactorial=[0];
  for(let k=1;k<256;k++)logFactorial[k]=logFactorial[k-1]+Math.log(k);
  function logFact(k){
    if(k<256)return logFactorial[k];
    const x=k+1;return (x-.5)*Math.log(x)-x+.9189385332046727+1/(12*x)-1/(360*x*x*x);
  }
  function poisson(mu,random){
    if(!(mu>0))return 0;
    if(mu<30){let p=1,k=0,limit=Math.exp(-mu);do{k++;p*=1-random();}while(p>limit);return k-1;}
    // PTRS transformed rejection: constant expected cost at high count rates.
    const b=.931+2.53*Math.sqrt(mu),a=-.059+.02483*b,alpha=1.1239+1.1328/(b-3.4),vr=.9277-3.6224/(b-2);
    for(;;){
      const u=random()-.5,v=random(),us=.5-Math.abs(u);
      if(us===0)continue;
      const k=Math.floor((2*a/us+b)*u+mu+.43);
      if(k<0)continue;
      if(us>=.07&&v<=vr)return k;
      if(us<.013&&v>us)continue;
      if(Math.log(v*alpha/(a/(us*us)+b))<=-mu+k*Math.log(mu)-logFact(k))return k;
    }
  }
  function pixel(field,random){
    const value=random()*field.sum;let lo=0,hi=field.cdf.length-1;
    while(lo<hi){const mid=(lo+hi)>>>1;if(field.cdf[mid]>value)hi=mid;else lo=mid+1;}
    return lo;
  }
  class Acquisition {
    constructor(n,mode,target,random=Math.random){
      if(![128,256].includes(n)||!['counts','time'].includes(mode)||!Number.isFinite(target)||target<1||target>(mode==='counts'?10000000:3600)||!Number.isInteger(target))throw Error('Objetivo no válido');
      this.n=n;this.mode=mode;this.target=target;this.random=random;this.finished=false;
      this.heads=[1,2].map(detector=>({detector,counts:new Uint32Array(n*n),total:0,elapsed:0,done:false}));
    }
    step(fields,rate,seconds,eventLimit=Infinity){
      for(let j=0;j<2;j++){
        const h=this.heads[j],f=fields[j];if(h.done)continue;
        if(!f||f.values.length!==h.counts.length)throw Error('Campo o matriz incompatible');
        const cps=f.sum*rate/2000000;
        if(this.mode==='time'){
          const dt=Math.min(seconds,this.target-h.elapsed),factor=rate*dt/2000000;
          for(let i=0;i<h.counts.length;i++){const v=poisson(f.values[i]*factor,this.random);h.counts[i]+=v;h.total+=v;}
          h.elapsed+=dt;h.done=h.elapsed>=this.target-1e-9;
        }else if(cps>0){
          let t=0,events=0;
          for(;;){
            const next=t-Math.log(Math.max(Number.MIN_VALUE,1-this.random()))/cps;
            if(next>seconds){t=seconds;break;}
            t=next;h.counts[pixel(f,this.random)]++;h.total++;events++;
            if(h.total>=this.target){h.done=true;break;}
            if(events>=eventLimit)break;
          }
          h.elapsed+=t;
        }else if(Number.isFinite(seconds))h.elapsed+=seconds;
      }
      this.finished=this.heads.every(h=>h.done);
    }
  }
  window.GANTRY_BONE_CORE={Acquisition,poisson};
  const el=id=>document.getElementById(id),bar=el('boneAcqControls');
  if(!bar)return;
  let session=null,fields=null,rate=4000,study='',clock=performance.now(),speed=1,paused=false,busy=false;
  let note='',lastPaint=0;
  const canvases=[el('boneAcqD1'),el('boneAcqD2')];
  const buffers=canvases.map(()=>document.createElement('canvas'));
  const format=n=>n.toLocaleString('es-CL');
  const time=t=>Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');
  function advance(now=performance.now()){
    const dt=Math.max(0,(now-clock)/1000);clock=now;
    if(session&&!session.finished&&!paused&&!busy&&study==='bone'&&!document.hidden&&fields&&dt>0)session.step(fields,rate,dt*speed);
  }
  function draw(h,j){
    const buffer=buffers[j];if(buffer.width!==session.n)buffer.width=buffer.height=session.n;
    const ctx=buffer.getContext('2d'),im=ctx.createImageData(session.n,session.n);
    let peak=1;for(const v of h.counts)if(v>peak)peak=v;
    for(let i=0;i<h.counts.length;i++){
      const value=Math.round(255*Math.pow(h.counts[i]/peak,.72));
      im.data[i*4]=im.data[i*4+1]=im.data[i*4+2]=value;im.data[i*4+3]=255;
    }
    ctx.putImageData(im,0,0);const out=canvases[j].getContext('2d');out.imageSmoothingEnabled=false;
    out.drawImage(buffer,0,0,canvases[j].width,canvases[j].height);
  }
  function paint(force=false){
    const active=study==='bone',running=!!session&&!session.finished;
    el('gantryLive').classList.toggle('bone-acquisition',active);bar.hidden=!active;
    el('boneAcqStart').disabled=running||!fields;
    el('boneAcqPause').hidden=el('boneAcqFinish').hidden=el('boneAcqInstant').hidden=!running;
    el('boneAcqPause').textContent=paused?'Reanudar adquisición':'Pausar adquisición';
    for(const id of ['boneAcqPause','boneAcqFinish','boneAcqSpeed','boneAcqInstant'])el(id).disabled=busy;
    el('boneAcqSpeed').disabled=!running||busy;
    el('liveMatrix128').disabled=el('liveMatrix256').disabled=active&&running;
    if(!session){el('boneAcqStatus').textContent=fields?'Listo para adquirir ambos detectores':'Preparando proyecciones óseas…';return;}
    const state=busy?'Completando instantánea':session.finished?'Finalizada':paused?'Pausada':'Adquiriendo';
    el('boneAcqStatus').textContent=state+' · '+(session.mode==='counts'?format(session.target)+' cuentas por detector':time(session.target)+' por detector')+(note?' · '+note:'');
    if(!active)return;
    const now=performance.now();if(!force&&now-lastPaint<180)return;lastPaint=now;
    session.heads.forEach((h,j)=>{
      draw(h,j);
      el('boneAcqInfo'+(j+1)).textContent=format(h.total)+' cuentas · '+time(h.elapsed)+' · '+(h.done?'Meta alcanzada':state);
      el('boneAcqProgress'+(j+1)).max=session.target;
      el('boneAcqProgress'+(j+1)).value=session.mode==='counts'?h.total:h.elapsed;
    });
  }
  function sync(nextStudy,nextFields,nextRate){
    if(busy)return;
    if(study==='bone'&&nextStudy!=='bone'&&session&&!session.finished){paused=true;note='Cambio de estudio; reanuda al volver a óseo';}
    study=nextStudy;fields=nextStudy==='bone'&&nextFields.every(Boolean)?nextFields:null;rate=nextRate;
    paint();
  }
  function settings(){
    const mode=el('boneAcqCriterion').value,target=Number(el('boneAcqTarget').value);
    return {mode,target};
  }
  function start(){
    if(!fields||busy||(session&&!session.finished))return;
    const {mode,target}=settings();
    try{session=new Acquisition(window.GANTRY_LIVE.settings.matrix,mode,target);}
    catch(error){el('boneAcqSetupError').textContent=mode==='counts'?'Introduce entre 1 y 10.000.000 cuentas enteras.':'Introduce entre 1 y 3.600 segundos enteros.';return;}
    clock=performance.now();speed=1;paused=false;note='';el('boneAcqSpeed').value='1';
    el('boneAcqSetup').hidden=true;el('boneAcqSetupError').textContent='';paint(true);
  }
  async function instant(){
    if(!session||session.finished||busy||!fields)return;
    advance();const snapshot=fields,currentRate=rate;
    if(session.mode==='counts'&&session.heads.some((h,i)=>!h.done&&!(snapshot[i].sum*currentRate>0))){
      note='Sin señal en un detector: mueve el campo o ajusta la energía';paint(true);return;
    }
    busy=true;note='Posición actual';paint(true);
    try{
      await new Promise(resolve=>setTimeout(resolve,0));
      if(session.mode==='time')session.step(snapshot,currentRate,session.target);
      else while(!session.finished){session.step(snapshot,currentRate,Infinity,20000);paint();await new Promise(resolve=>setTimeout(resolve,0));}
    }finally{busy=false;clock=performance.now();window.GANTRY_LIVE?.update(window.GANTRY.G);paint(true);}
  }
  el('boneAcqStart').onclick=()=>{el('boneAcqSetup').hidden=false;el('boneAcqTarget').focus();};
  el('boneAcqCancel').onclick=()=>{el('boneAcqSetup').hidden=true;};
  el('boneAcqSetup').onsubmit=event=>{event.preventDefault();start();};
  el('boneAcqCriterion').onchange=()=>{
    const counts=el('boneAcqCriterion').value==='counts';
    el('boneAcqTarget').value=counts?'100000':'60';el('boneAcqTarget').max=counts?'10000000':'3600';
    el('boneAcqUnits').textContent=counts?'cuentas por detector':'segundos por detector';el('boneAcqSetupError').textContent='';
  };
  el('boneAcqSpeed').onchange=()=>{advance();speed=Number(el('boneAcqSpeed').value);paint(true);};
  el('boneAcqPause').onclick=()=>{advance();paused=!paused;note='';paint(true);};
  el('boneAcqFinish').onclick=()=>{advance();session.finished=true;paused=true;note='Detenida por el operador';paint(true);};
  el('boneAcqInstant').onclick=instant;
  canvases.forEach((canvas,i)=>canvas.onclick=event=>window.GANTRY_LIVE.recenterFromCanvas(i+1,event));
  document.addEventListener('visibilitychange',()=>{clock=performance.now();});
  window.GANTRY_BONE_ACQ={advance,sync,
    get active(){return !!session&&!session.finished;},get matrix(){return session?.n;},
    get state(){return session&&{mode:session.mode,target:session.target,matrix:session.n,finished:session.finished,paused,speed,busy,heads:session.heads.map(({total,elapsed,done})=>({total,elapsed,done}))};}};
  setInterval(()=>{advance();paint();},100);
  window.GANTRY_LIVE?.update(window.GANTRY.G);
})();
