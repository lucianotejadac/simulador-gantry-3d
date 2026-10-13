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
    constructor(n,mode,target,random=Math.random,height=n){
      if(![128,256].includes(n)||!['counts','time'].includes(mode)||!Number.isFinite(target)||target<1||target>(mode==='counts'?10000000:3600)||!Number.isInteger(target))throw Error('Objetivo no válido');
      if(!Number.isInteger(height)||height<n||height>n*6)throw Error('Altura de matriz no válida');
      this.n=n;this.height=height;this.kind=height===n?'static':'whole';this.mode=mode;this.target=target;this.random=random;this.finished=false;
      this.heads=[1,2].map(detector=>({detector,counts:new Uint32Array(n*height),total:0,elapsed:0,done:false}));
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
  let note='',lastPaint=0,moving=false,lockedNodes=null;
  let names=['Detector 1','Detector 2'],archive=null,saving=false,loadingSaved=false,selection=0;
  const sessions=new Map();
  const labels={bone:'Óseo',mibi:'MIBI',thyroid:'Tiroides',exploration:'I-131',parathyroid:'Paratiroides',dmsa:'DMSA',maa:'MAA'};
  const supported=value=>Object.hasOwn(labels,value);
  const storage=window.GANTRY_BONE_STORAGE;
  const store=storage?.createStore(window.indexedDB);
  const canvases=[el('boneAcqD1'),el('boneAcqD2')];
  const buffers=canvases.map(()=>document.createElement('canvas'));
  const format=n=>n.toLocaleString('es-CL');
  const time=t=>Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');
  const whole=window.GANTRY_BONE_WHOLE;
  const kind=()=>study==='bone'&&el('boneAcqType').value==='whole'?'whole':'static';
  const position=()=>whole?.position()||{ok:false,reason:'Preparando posición del paciente'};
  function lockScan(locked){
    if(!document.querySelectorAll)return;
    if(locked&&!lockedNodes){
      const selector='.mb[data-g],.armbtn,#changePatientPosition,#gReset,#pos,#acqSupine,#acqProne,#acqHeadIn,#acqHeadOut,#liveStudy,#liveCollimator,#liveEnergyCenter,#liveWindowWidth,#liveZoom1,#liveZoom15,#liveZoom175,#liveZoom2,#liveRecenter,#liveResetCenter,#boneCountRate';
      lockedNodes=Array.from(document.querySelectorAll(selector),node=>({node,disabled:node.disabled,tab:node.getAttribute('tabindex'),aria:node.getAttribute('aria-disabled'),pointer:node.style.pointerEvents}));
      for(const {node} of lockedNodes){node.disabled=true;node.setAttribute('aria-disabled','true');node.setAttribute('tabindex','-1');node.style.pointerEvents='none';}
    }else if(!locked&&lockedNodes){
      for(const {node,disabled,tab,aria,pointer} of lockedNodes){node.disabled=disabled;node.style.pointerEvents=pointer;for(const [k,v] of [['tabindex',tab],['aria-disabled',aria]])if(v===null)node.removeAttribute(k);else node.setAttribute(k,v);}
      lockedNodes=null;
    }
  }
  function acquisitionFields(){
    if(session?.kind!=='whole')return fields;
    const status=position();
    if(!status.ok){paused=true;note=status.reason;return null;}
    const result=whole.fields();
    if(result.height!==session.height){paused=true;note='Restablece la postura de brazos inicial para reanudar.';return null;}
    return result.fields;
  }
  function advance(now=performance.now()){
    if(moving)return;
    const dt=Math.max(0,(now-clock)/1000);clock=now;
    if(session&&!session.finished&&!paused&&!busy&&supported(study)&&!document.hidden&&fields&&dt>0){
      if(session.mode==='scan'){
        moving=true;
        try{whole.advance(session,session.countRate,dt);}catch(error){paused=true;note=error.message;}
        finally{moving=false;}
      }else {const current=acquisitionFields();if(current)session.step(current,rate,dt*speed);}
    }
  }
  function draw(h,j,n,height=n){
    const buffer=buffers[j];if(buffer.width!==n||buffer.height!==height){buffer.width=n;buffer.height=height;}
    const canvas=canvases[j];if(canvas.width!==n||canvas.height!==height){canvas.width=n;canvas.height=height;}
    canvas.style&&(canvas.style.aspectRatio=n+' / '+height);
    const ctx=buffer.getContext('2d'),im=ctx.createImageData(n,height);
    let peak=1;for(const v of h.counts)if(v>peak)peak=v;
    for(let i=0;i<h.counts.length;i++){
      const value=Math.round(255*Math.pow(h.counts[i]/peak,.72));
      im.data[i*4]=im.data[i*4+1]=im.data[i*4+2]=value;im.data[i*4+3]=255;
    }
    ctx.putImageData(im,0,0);const out=canvases[j].getContext('2d');out.imageSmoothingEnabled=false;
    out.drawImage(buffer,0,0,canvases[j].width,canvases[j].height);
    if(!archive&&session?.mode==='scan'&&!session.finished){
      const y=(session.row-session.crop.y)/session.crop.h*height;
      out.strokeStyle='#58dcb4';out.lineWidth=1;out.beginPath();out.moveTo(0,y);out.lineTo(n,y);out.stroke();
    }
  }
  function paint(force=false){
    const active=supported(study),running=!!session&&!session.finished;
    const displayWhole=(archive||session)?.kind==='whole'||(!archive&&!session&&kind()==='whole');
    el('gantryLive').classList.toggle('bone-whole-body',active&&displayWhole);
    const check=position(),wantWhole=kind()==='whole';
    el('boneAcqTypeWrap').hidden=study!=='bone';
    const scanning=running&&session.mode==='scan';
    lockScan(scanning);
    el('boneAcqPosition').textContent=scanning?'Barrido desde posición inicial → pies · detectores automáticos':wantWhole?check.reason:'';
    for(const id of ['boneAcqCriterionWrap','boneAcqTargetWrap','boneAcqUnits'])el(id).hidden=wantWhole;
    el('boneAcqCriterion').disabled=el('boneAcqTarget').disabled=wantWhole;
    el('boneAcqVelocityWrap').hidden=!wantWhole;el('boneAcqVelocity').disabled=!wantWhole;
    el('boneAcqSpeedWrap').hidden=wantWhole||scanning;
    el('boneAcqType').disabled=running||busy||saving||loadingSaved;
    el('boneAcqBegin').disabled=wantWhole&&!check.ok;
    el('gantryLive').classList.toggle('bone-acquisition',active);bar.hidden=!active;
    el('boneAcqStart').disabled=running||!fields||saving||loadingSaved||(wantWhole&&!check.ok);
    el('boneAcqPause').hidden=el('boneAcqFinish').hidden=el('boneAcqInstant').hidden=!running;
    if(scanning)el('boneAcqInstant').hidden=true;
    el('boneAcqPause').textContent=paused?'Reanudar adquisición':'Pausar adquisición';
    for(const id of ['boneAcqPause','boneAcqFinish','boneAcqSpeed','boneAcqInstant'])el(id).disabled=busy;
    el('boneAcqSpeed').disabled=!running||busy;
    for(const id of ['boneAcqPause','boneAcqFinish','boneAcqSpeed','boneAcqInstant'])if(archive||loadingSaved)el(id).disabled=true;
    el('boneAcqSave').disabled=!store||!session||busy||saving||!!archive||loadingSaved;
    el('boneAcqSave').textContent=saving?'Guardando…':'Guardar adquisición';
    el('boneAcqSaved').disabled=busy||loadingSaved;
    el('liveMatrix128').disabled=el('liveMatrix256').disabled=active&&running;
    if(!session&&!archive){
      el('boneAcqStatus').textContent=fields?'Listo para adquirir ambos detectores':'Preparando proyecciones…';
      if(force)canvases.forEach((canvas,j)=>{
        canvas.width=window.GANTRY_LIVE.settings.matrix;canvas.height=wantWhole?Math.round(canvas.width*2.5):canvas.width;
        canvas.style&&(canvas.style.aspectRatio=canvas.width+' / '+canvas.height);
        canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
        el('boneAcqTitle'+(j+1)).textContent='ADQUISICIÓN · DETECTOR '+(j+1);
        el('boneAcqInfo'+(j+1)).textContent='Esperando adquisición';el('boneAcqProgress'+(j+1)).value=0;
      });
      return;
    }
    const shown=archive||session,shownNames=archive?archive.names:names;
    if(!session)el('boneAcqStatus').textContent='Sin adquisición actual';
    else {
    const state=busy?'Completando instantánea':session.finished?'Finalizada':paused?'Pausada':session.mode==='scan'&&session.phase==='positioning'?'Acercando detectores':'Adquiriendo';
    el('boneAcqStatus').textContent=state+' · '+(session.mode==='scan'?session.velocity+' cm/min · '+session.travel.toFixed(1)+' / '+session.target.toFixed(1)+' cm':session.mode==='counts'?format(session.target)+' cuentas por detector':time(session.target)+' por detector')+(note?' · '+note:'');
    }
    if(archive)el('boneAcqStatus').textContent='Viendo guardada · '+new Date(archive.createdAt).toLocaleString('es-CL')+(running?' · actual en pausa':'');
    if(!active)return;
    const now=performance.now();if(!force&&now-lastPaint<180)return;lastPaint=now;
    shown.heads.forEach((h,j)=>{
      draw(h,j,shown.n,shown.height||shown.n);
      const title=el('boneAcqTitle'+(j+1));title.textContent=(archive?'GUARDADA':'ADQUISICIÓN')+' D'+(j+1)+' · '+shownNames[j]+' · '+(labels[shown.study||shown.settings?.study||'bone']||'Estudio')+(shown.kind==='whole'?' · CUERPO ENTERO':'');title.title=title.textContent;
      el('boneAcqInfo'+(j+1)).textContent=format(h.total)+' cuentas · '+time(h.elapsed)+' · '+(archive?'Guardada · M'+shown.n:h.done?'Meta alcanzada':shown.finished?'Finalizada':paused?'Pausada':'Adquiriendo')+(shown.kind==='whole'?' · '+shown.n+'×'+shown.height:'');
      el('boneAcqProgress'+(j+1)).max=shown.target;
      el('boneAcqProgress'+(j+1)).value=shown.mode==='scan'?(shown.scan?.travel??shown.travel):shown.mode==='counts'?h.total:h.elapsed;
    });
  }
  function selectStudy(nextStudy){
    if(nextStudy===study)return true;
    if(busy||saving||loadingSaved||(session?.mode==='scan'&&!session.finished))return false;
    advance();
    if(session&&!session.finished){paused=true;note='Adquisición en pausa tras cambiar de estudio';}
    if(study)sessions.set(study,{session,names,archive,paused,note,speed,type:el('boneAcqType').value});
    const saved=sessions.get(nextStudy);
    study=nextStudy;session=saved?.session||null;names=saved?.names||['Detector 1','Detector 2'];
    archive=saved?.archive||null;paused=saved?.paused||false;note=saved?.note||'';speed=saved?.speed||1;
    fields=null;clock=performance.now();selection++;
    el('boneAcqSetup').hidden=true;el('boneAcqSaved').value=archive?.id||'current';
    el('boneAcqType').value=saved?.type||'static';el('boneAcqSpeed').value=String(speed);
    el('boneAcqCacheStatus').textContent=session?'Adquisición del estudio conservada':'';
    paint(true);
    return true;
  }
  function sync(nextStudy,nextFields,nextRate){
    if(busy)return;
    if(!selectStudy(nextStudy))return;
    fields=supported(nextStudy)&&nextFields.every(Boolean)?nextFields:null;rate=nextRate;
    paint();
  }
  function settings(){
    const mode=el('boneAcqCriterion').value,target=Number(el('boneAcqTarget').value);
    return {mode,target};
  }
  function start(){
    if(!fields||busy||saving||loadingSaved||(session&&!session.finished))return;
    const nextNames=[el('boneAcqName1').value.trim(),el('boneAcqName2').value.trim()];
    if(nextNames.some(n=>!n||n.length>80)){el('boneAcqSetupError').textContent='Escribe un nombre para cada detector (máximo 80 caracteres).';return;}
    const {mode,target}=settings();
    if(kind()==='whole'&&!position().ok){el('boneAcqSetupError').textContent=position().reason;paint();return;}
    if(kind()==='whole'){
      try{session=whole.create(Number(el('boneAcqVelocity').value));session.countRate=rate;}
      catch(error){el('boneAcqSetupError').textContent=error.message;return;}
    }else try{session=new Acquisition(window.GANTRY_LIVE.settings.matrix,mode,target);}
    catch(error){el('boneAcqSetupError').textContent=mode==='counts'?'Introduce entre 1 y 10.000.000 cuentas enteras.':'Introduce entre 1 y 3.600 segundos enteros.';return;}
    session.study=study;
    names=nextNames;archive=null;selection++;el('boneAcqSaved').value='current';
    el('boneAcqCacheStatus').textContent='Adquisición actual sin guardar';
    clock=performance.now();speed=1;paused=false;note='';el('boneAcqSpeed').value='1';
    el('boneAcqSetup').hidden=true;el('boneAcqSetupError').textContent='';paint(true);
  }
  async function instant(){
    if(!session||session.finished||busy||!fields||session.mode==='scan')return;
    advance();const snapshot=acquisitionFields(),currentRate=rate;if(!snapshot){paint(true);return;}
    if(session.mode==='counts'&&session.heads.some((h,i)=>!h.done&&!(snapshot[i].sum*currentRate>0))){
      note='Sin señal en un detector: mueve el campo o ajusta la energía';paint(true);return;
    }
    busy=true;note=session.kind==='whole'?'Cuerpo entero':'Posición actual';paint(true);
    try{
      await new Promise(resolve=>setTimeout(resolve,0));
      if(session.mode==='time')session.step(snapshot,currentRate,session.target);
      else while(!session.finished){
        if(session.kind==='whole'&&!position().ok){paused=true;note=position().reason;break;}
        session.step(snapshot,currentRate,Infinity,20000);paint();await new Promise(resolve=>setTimeout(resolve,0));
      }
    }finally{busy=false;clock=performance.now();window.GANTRY_LIVE?.update(window.GANTRY.G);paint(true);}
  }
  el('boneAcqStart').onclick=()=>{el('boneAcqSetup').hidden=false;(kind()==='whole'?el('boneAcqVelocity'):el('boneAcqTarget')).focus();};
  el('boneAcqType').onchange=()=>{el('boneAcqSetupError').textContent='';paint(true);};
  el('boneAcqCancel').onclick=()=>{el('boneAcqSetup').hidden=true;};
  el('boneAcqSetup').onsubmit=event=>{event.preventDefault();start();};
  el('boneAcqCriterion').onchange=()=>{
    const counts=el('boneAcqCriterion').value==='counts';
    el('boneAcqTarget').value=counts?'100000':'60';el('boneAcqTarget').max=counts?'10000000':'3600';
    el('boneAcqUnits').textContent=counts?'cuentas por detector':'segundos por detector';el('boneAcqSetupError').textContent='';
  };
  el('boneAcqSpeed').onchange=()=>{advance();speed=Number(el('boneAcqSpeed').value);paint(true);};
  el('boneAcqPause').onclick=()=>{advance();paused=!paused;note='';clock=performance.now();paint(true);};
  el('boneAcqFinish').onclick=()=>{advance();session.finished=true;paused=true;note='Detenida por el operador';paint(true);};
  el('boneAcqInstant').onclick=instant;
  async function refreshSaved(){
    if(!store)return;
    const records=await store.list(),menu=el('boneAcqSaved'),value=menu.value||'current';
    menu.replaceChildren();const current=document.createElement('option');current.value='current';current.textContent='Adquisición actual';menu.append(current);
    for(const item of records){const option=document.createElement('option');option.value=item.id;option.textContent=(labels[item.study||'bone']||'Estudio')+' · '+item.names.join(' / ')+(item.kind==='whole'?' · Cuerpo entero':'')+' · '+new Date(item.createdAt).toLocaleString('es-CL');menu.append(option);}
    menu.value=records.some(r=>r.id===value)?value:'current';
  }
  el('boneAcqSave').onclick=async()=>{
    if(!session||archive||busy||saving||!store)return;
    advance();
    saving=true;el('boneAcqCacheStatus').textContent='Guardando en este navegador…';paint();
    try{const record=storage.snapshot(session,names,{...window.GANTRY_LIVE.settings,rate,geometry:window.GANTRY.G});await store.save(record);await refreshSaved();el('boneAcqCacheStatus').textContent='Adquisición guardada en este navegador';}
    catch(error){el('boneAcqCacheStatus').textContent='No se pudo guardar: '+(error.name==='QuotaExceededError'?'almacenamiento lleno':error.message)+'. La adquisición actual se conserva.';}
    finally{saving=false;paint();}
  };
  el('boneAcqSaved').onchange=async()=>{
    const id=el('boneAcqSaved').value,token=++selection;
    if(id==='current'){archive=null;el('boneAcqCacheStatus').textContent='Mostrando adquisición actual';paint(true);return;}
    advance();if(session&&!session.finished)paused=true;
    loadingSaved=true;paint();
    try{const record=await store.get(id);if(token===selection){archive=record;el('boneAcqCacheStatus').textContent='Copia guardada; selecciona Adquisición actual para volver';}}
    catch(error){el('boneAcqCacheStatus').textContent='No se pudo abrir: '+error.message;el('boneAcqSaved').value=archive?.id||'current';}
    finally{loadingSaved=false;paint(true);}
  };
  refreshSaved().catch(error=>{el('boneAcqCacheStatus').textContent='Guardado local no disponible: '+error.message;});
  canvases.forEach((canvas,i)=>canvas.onclick=event=>{if(!archive&&session?.kind!=='whole')window.GANTRY_LIVE.recenterFromCanvas(i+1,event);});
  document.addEventListener('visibilitychange',()=>{clock=performance.now();});
  window.GANTRY_BONE_ACQ={advance,sync,selectStudy,
    get scanning(){return session?.mode==='scan'&&!session.finished;},
    get active(){return !!session&&!session.finished;},get matrix(){return session?.n;},
    get state(){return session&&{study:session.study,kind:session.kind,height:session.height,mode:session.mode,phase:session.phase,travel:session.travel,velocity:session.velocity,target:session.target,matrix:session.n,finished:session.finished,paused,speed,busy,heads:session.heads.map(({total,elapsed,done})=>({total,elapsed,done}))};}};
  setInterval(()=>{advance();paint();},100);
  window.GANTRY_LIVE?.update(window.GANTRY.G);
})();
