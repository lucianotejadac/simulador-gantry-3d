/* Parent controller: lazy iframe, local snapshots, explicit append and ACK. */
(function(){
  'use strict';
  const el=id=>document.getElementById(id),store=window.GANTRY_BONE_STORAGE.createStore(window.indexedDB);
  let active=false,ready=false,pending=null,loaded=false,catalog=new Map(),current=null,request=0,loadTimer;
  const frame=el('boneProcessingFrame'),status=el('boneProcessingStatus');
  const busy=()=>window.GANTRY_BONE_ACQ?.active||window.GANTRY_MAG3?.state&&!window.GANTRY_MAG3.state.finished;
  function load(){
    loaded=true;status.textContent='Cargando procesador óseo…';el('boneProcessingRetry').hidden=true;
    clearTimeout(loadTimer);frame.src=frame.dataset.src;
    loadTimer=setTimeout(()=>{if(!ready){status.textContent='El procesador no terminó de cargar. Puedes reintentar.';el('boneProcessingRetry').hidden=false;}},45000);
  }
  async function refresh(){
    const selected=new Set([...el('boneProcessingList').querySelectorAll('input:checked')].map(n=>n.value));
    catalog=new Map();current=window.GANTRY_BONE_ACQ.processingCurrent();
    if(current?.study==='bone'&&current.finished&&current.heads.every(h=>h.total>0))catalog.set('current',current);
    const saved=await store.list();
    for(const record of saved){
      const same=record.id===current?.id||(record.processing?.acquisitionId&&record.processing.acquisitionId===current?.processing?.acquisitionId&&record.totals?.every((n,i)=>n===current.heads[i].total));
      if(record.study==='bone'&&record.finished&&record.totals?.every(n=>n>0)&&!same)catalog.set(record.id,record);
    }
    el('boneProcessingList').replaceChildren();
    for(const [key,record] of catalog){
      const row=document.createElement('label'),check=document.createElement('input'),text=document.createElement('span');
      check.type='checkbox';check.value=key;check.checked=selected.has(key)||(!selected.size&&key==='current');
      text.textContent=(key==='current'?'Actual / seleccionada':'Guardada')+' · '+(record.kind==='whole'?'Cuerpo entero':'Estática')+' · '+record.names.join(' / ')+' · '+new Date(record.createdAt).toLocaleString('es-CL');
      row.append(check,text);el('boneProcessingList').append(row);
    }
    if(!catalog.size)el('boneProcessingList').textContent='Finaliza una adquisición ósea con cuentas en ambos detectores. También aparecerán aquí las adquisiciones guardadas.';
    el('boneProcessingSend').disabled=!ready||!catalog.size||!!pending;
  }
  async function open(){
    if(busy()){el('boneProcessingNotice').textContent='Finaliza la adquisición activa antes de entrar a procesamiento.';return;}
    active=true;el('boneProcessingNotice').textContent='';
    el('acquisitionMenuButton').disabled=true;
    el('gantryWorkspace').hidden=true;el('boneProcessingPane').hidden=false;
    el('boneProcessingTab').setAttribute('aria-selected','true');el('boneGantryTab').setAttribute('aria-selected','false');
    window.GANTRY_MDP?.begin();window.GANTRY_MIBI?.begin();window.GANTRY3D?.pause();
    if(!loaded)load();
    try{await refresh();}catch(error){status.textContent='No se pudo leer el catálogo local: '+error.message;}
  }
  function close(){
    active=false;el('boneProcessingPane').hidden=true;el('gantryWorkspace').hidden=false;
    el('acquisitionMenuButton').disabled=false;
    el('boneProcessingTab').setAttribute('aria-selected','false');el('boneGantryTab').setAttribute('aria-selected','true');
    if(ready)frame.contentWindow.postMessage({type:'GANTRY_PROCESSING_HIDE',version:1},location.origin);
    window.GANTRY3D?.resume();window.GANTRY_LIVE?.update(window.GANTRY.G);
  }
  async function send(){
    if(!ready||pending)return;
    const keys=[...el('boneProcessingList').querySelectorAll('input:checked')].map(n=>n.value);
    if(!keys.length){status.textContent='Selecciona al menos una adquisición.';return;}
    if(keys.length>50){status.textContent='Envía hasta 50 adquisiciones por vez.';return;}
    el('boneProcessingSend').disabled=true;
    const id=++request;
    try{
      status.textContent='Preparando cuentas originales y metadatos…';
      const files=[];
      for(const key of keys){
        const record=key==='current'?current:await store.get(key);
        const studyUID=await window.GANTRY_PROCESSING_DICOM.uid('gantry-bone-phantom:'+new Date(record.processing?.startedAt||record.createdAt).toISOString().slice(0,10));
        files.push(...await window.GANTRY_PROCESSING_DICOM.files(record,studyUID));
      }
      pending={id,timer:setTimeout(()=>{if(pending?.id===id){pending=null;el('boneProcessingSend').disabled=false;status.textContent='El procesador no confirmó la recepción. Puedes volver a enviar; las imágenes repetidas se omiten.';}},30000)};
      frame.contentWindow.postMessage({type:'GANTRY_PROCESSING_IMPORT',version:1,id,files},location.origin);
      status.textContent='Enviando '+files.length+' imágenes al procesador…';
    }catch(error){status.textContent='No se pudo enviar: '+error.message;el('boneProcessingSend').disabled=false;}
  }
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.version!==1)return;
    const data=event.data;
    if(data.type==='GANTRY_PROCESSING_READY'){ready=true;clearTimeout(loadTimer);el('boneProcessingRetry').hidden=true;status.textContent='Procesador listo. Selecciona adquisiciones y pulsa Enviar.';el('boneProcessingSend').disabled=!catalog.size;}
    if(data.type==='GANTRY_PROCESSING_RESULT'&&data.id===pending?.id){
      clearTimeout(pending.timer);pending=null;el('boneProcessingSend').disabled=false;
      status.textContent=data.error?'No se pudo importar: '+data.error:data.images+' imágenes verificadas · '+data.totals.map((n,i)=>'D'+(i%2+1)+': '+n.toLocaleString('es-CL')+' cuentas').join(' · ')+'. Las cuentas originales se conservan.';
    }
  });
  el('boneProcessingTab').onclick=open;el('boneSendProcessing').onclick=open;
  el('boneGantryTab').onclick=close;el('boneProcessingBack').onclick=close;
  el('boneProcessingRefresh').onclick=()=>refresh().catch(e=>{status.textContent=e.message;});
  el('boneProcessingSend').onclick=send;
  el('boneProcessingRetry').onclick=()=>{if(!ready)load();};
  window.GANTRY_PROCESSING={open,close,get active(){return active;}};
})();
