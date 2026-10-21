/* Shared administration controls in the gantry column. The existing kinetic
   engines remain the source of dose and elapsed-time data. */
(function(){
  'use strict';
  const profiles={
    bone:{study:'bone',label:'99mTc-MDP · Óseo'},
    bone3:{study:'bone',label:'99mTc-MDP · Óseo trifásico',dynamic:true},
    mag3:{study:'mag3',label:'99mTc-MAG3 · Renograma',dynamic:true},
    thyroid:{study:'thyroid',label:'99mTc-pertecnetato · Tiroides'},
    dmsa:{study:'dmsa',label:'99mTc-DMSA · Renal'},
    maa:{study:'maa',label:'99mTc-MAA · Perfusión pulmonar'},
    mibi:{study:'mibi',label:'99mTc-MIBI · Miocardio'},
    parathyroid:{study:'parathyroid',label:'99mTc-MIBI · Paratiroides'},
    exploration:{study:'exploration',label:'I-131 oral · Postratamiento'}
  };
  let selected=null,injecting=false,unit='mCi',timeUnit='min',lastStudy=null;
  const injected={bone3:false},el=id=>document.getElementById(id);
  const live=()=>window.GANTRY_LIVE;
  const busy=()=>!!window.GANTRY_BONE_ACQ?.active||!!window.GANTRY_MAG3?.state&&!window.GANTRY_MAG3.state.finished;
  const model=id=>profiles[id]?.study==='bone'?window.GANTRY_MDP:id==='mibi'?window.GANTRY_MIBI:null;
  const timeFactor=()=>({min:1,h:60,d:1440}[timeUnit]);
  function metadata(id=selected){return (id==='mag3'&&window.GANTRY_MAG3?.administration)||model(id)?.metadata()||window.GANTRY_ACTIVITY?.metadata(profiles[id]?.study);}
  function pending(study=live()?.settings.study){
    if(study==='mag3')return !window.GANTRY_MAG3?.injected;
    return study==='bone'&&selected==='bone3'&&!injected.bone3;
  }
  function blank(target){
    const ctx=target.canvas.getContext('2d');ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#000';ctx.fillRect(0,0,target.canvas.width,target.canvas.height);ctx.restore();
    target.linearField=null;
    target.info.textContent='DETECTOR '+target.n+' · Sin inyección · 0 cuentas/s';
    return {detector:target.n,study:live()?.settings.study,expectedRate:0,windowCounts:0,view:'Sin inyección',segment:''};
  }
  function refresh(){
    live()?.clearPersistence();live()?.update(window.GANTRY.G);render();
  }
  function select(id){
    if(!profiles[id]||busy()||injecting||window.GANTRY_EXAM?.blocked)throw Error('Finaliza la adquisición antes de cambiar el radiofármaco.');
    const previous=selected;selected=id;
    live().setStudy(profiles[id].study);
    if(live().settings.study!==profiles[id].study){selected=previous;throw Error('No se pudo cambiar el estudio.');}
    lastStudy=profiles[id].study;
    if(id==='bone3'&&previous!=='bone3'&&!injected.bone3){
      const m=metadata();window.GANTRY_MDP.configure(m.activityMBq,0);
    }
    timeUnit=id==='exploration'?'d':'min';
    if(profiles[id].dynamic)live().setSignalMode('live');
    if(pending())for(const n of [1,2]){
      const canvas=el('liveD'+n);if(canvas)blank({n,canvas,info:el('liveInfoD'+n)||{}});
    }
    refresh();
  }
  function configure(dose,minutes,doseUnit=unit){
    if(busy()||injecting||window.GANTRY_EXAM?.blocked)throw Error('No se puede cambiar la administración durante una adquisición.');
    if(selected==='mag3'&&window.GANTRY_MAG3?.injected)throw Error('La dosis ya fue inyectada; reinicia el examen para cambiar la administración.');
    const mbq=Number(dose)*(doseUnit==='mCi'?37:1),seconds=Number(minutes)*60;
    const id=profiles[selected]?.study,max=id==='bone'?180:id==='mibi'?720:id==='mag3'?19.99:id==='exploration'?43200:1440;
    if(dose===''||minutes===''||!Number.isFinite(mbq)||mbq<=0||!Number.isFinite(seconds)||seconds<0||seconds>max*60||id!=='exploration'&&mbq>2000)
      throw Error('Indica una dosis positiva y un tiempo entre 0 y '+max+' minutos.');
    if(model(selected)){
      if(!model(selected).configure(mbq,seconds))throw Error('No se pudo aplicar la administración.');
    }else{
      if(id==='exploration'&&![50,100,150,200].some(v=>Math.abs(v*37-mbq)<1e-6))throw Error('Selecciona 50, 100, 150 o 200 mCi.');
      if(!window.GANTRY_ACTIVITY.setActivity(id,mbq,'MBq')||!window.GANTRY_ACTIVITY.setMinutes(id,seconds/60))throw Error('No se pudo aplicar la administración.');
      window.GANTRY_ACTIVITY.render();
    }
    refresh();return true;
  }
  async function inject(){
    if(injecting||busy()||window.GANTRY_EXAM?.blocked||window.GANTRY_AUTO?.busy)throw Error('Espera a que termine la adquisición o el movimiento del equipo.');
    if(!profiles[selected]?.dynamic||!pending())return;
    if(!live().ready)throw Error('Espera a que termine la carga del estudio.');
    injecting=true;render();
    try{
      if(selected==='mag3'){
        await window.GANTRY_MAG3.inject();
        if(!window.GANTRY_MAG3.injected)throw Error('No se pudo iniciar la inyección.');
      }else{
        const m=metadata();
        injected.bone3=true;
        if(!window.GANTRY_MDP.configure(m.activityMBq,m.seconds,true)){injected.bone3=false;throw Error('No se pudo iniciar la inyección.');}
      }
    }finally{injecting=false;refresh();}
  }
  function render(){
    if(!el('rfPanel')||!live())return;
    const study=live().settings.study;
    if(study!==lastStudy){
      selected=profiles[selected]?.study===study?selected:study;lastStudy=study;
      timeUnit=study==='exploration'?'d':'min';
    }
    if(!profiles[selected])return;
    const m=metadata();if(!m)return;
    const oral=selected==='exploration',locked=busy()||injecting||!!window.GANTRY_EXAM?.blocked;
    el('rfSelect').value=selected;el('rfSelect').disabled=locked;
    el('rfUnit').value=unit;el('rfTimeUnit').value=timeUnit;
    el('rfDose').hidden=oral;el('rfDosePreset').hidden=!oral;
    el('rfDoseLabel').textContent=oral?'Actividad oral':'Dosis administrada';
    el('rfTimeLabel').textContent=oral?'Administración–examen':'Inyección–examen';
    for(const id of ['rfDose','rfDosePreset','rfUnit','rfTime','rfTimeUnit'])el(id).disabled=locked;
    if(selected==='mag3'&&window.GANTRY_MAG3?.injected)for(const id of ['rfDose','rfTime'])el(id).disabled=true;
    if(document.activeElement!==el('rfDose'))el('rfDose').value=+(m.activityMBq/(unit==='mCi'?37:1)).toFixed(3);
    const preset=el('rfDosePreset');for(const o of preset.options)o.textContent=String(Number(o.value)*(unit==='mCi'?1:37));preset.value=String(Math.round(m.activityMBq/37));
    if(document.activeElement!==el('rfTime'))el('rfTime').value=+(m.seconds/60/timeFactor()).toFixed(3);
    el('rfInject').hidden=!profiles[selected].dynamic;
    el('rfInject').disabled=locked||!pending()||!live().ready||!!window.GANTRY_AUTO?.busy;
    el('rfStatus').textContent=profiles[selected].dynamic?(injecting?'Inyectando…':pending()?'Sin inyección · señal en vivo: 0':'Inyectado · señal en vivo activa'+(busy()?' · adquiriendo':' · adquisición independiente')):(oral?'Vía oral':'Vía intravenosa');
  }
  function resetExam(){injected.bone3=false;refresh();}
  function init(){
    const host=el('gantryViewControls');if(!host||el('rfPanel'))return;
    const panel=document.createElement('section');panel.id='rfPanel';panel.setAttribute('aria-label','Radiofármaco y administración');
    panel.innerHTML=`<label class="rf-study">Radiofármaco <select id="rfSelect"></select></label>
      <label><span id="rfDoseLabel">Dosis administrada</span> <input id="rfDose" type="number" min="0.001" step="any" required aria-label="Dosis administrada">
      <select id="rfDosePreset" hidden aria-label="Actividad oral"><option value="50">50</option><option value="100">100</option><option value="150">150</option><option value="200">200</option></select>
      <select id="rfUnit" aria-label="Unidad de dosis"><option>mCi</option><option>MBq</option></select></label>
      <label><span id="rfTimeLabel">Inyección–examen</span> <input id="rfTime" type="number" min="0" step="any" required aria-label="Tiempo inyección examen">
      <select id="rfTimeUnit" aria-label="Unidad de tiempo"><option value="min">min</option><option value="h">h</option><option value="d">días</option></select></label>
      <button id="rfInject" type="button" hidden>Inyectar</button><span id="rfStatus" role="status"></span><span id="rfError" role="alert"></span>`;
    host.prepend(panel);
    for(const [id,p] of Object.entries(profiles)){const o=document.createElement('option');o.value=id;o.textContent=p.label;el('rfSelect').append(o);}
    const action=fn=>async()=>{try{el('rfError').textContent='';await fn();}catch(e){el('rfError').textContent=e.message;render();}};
    el('rfSelect').onchange=action(()=>select(el('rfSelect').value));
    const apply=()=>configure(selected==='exploration'?Number(el('rfDosePreset').value)*(unit==='mCi'?1:37):el('rfDose').value,el('rfTime').value===''?'':Number(el('rfTime').value)*timeFactor());
    for(const id of ['rfDose','rfDosePreset','rfTime'])el(id).onchange=action(apply);
    el('rfUnit').onchange=()=>{unit=el('rfUnit').value;render();};
    el('rfTimeUnit').onchange=()=>{timeUnit=el('rfTimeUnit').value;render();};
    el('rfInject').onclick=action(async()=>{apply();await inject();});
    render();setInterval(render,250);
  }
  window.GANTRY_RF={profiles,select,configure,inject,pending,blank,render,metadata,resetExam,
    didInject(){render();},get selected(){return selected;}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
