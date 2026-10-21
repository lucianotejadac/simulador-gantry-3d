/* Parent controller: lazy iframe, local snapshots, explicit append and ACK. */
(function(){
  'use strict';
  const el=id=>document.getElementById(id);
  let active=false,ready=false,pending=null,loaded=false,catalog=new Map(),request=0,loadTimer,refreshing=false;
  const completed=new Map(),imported=new Set();
  const saving=new Map();let cache;
  const storage=()=>cache||(cache=window.GANTRY_BONE_STORAGE.createStore(window.indexedDB));
  function autoSave(record){
    const key=identity(record);if(saving.has(key))return saving.get(key);
    const task=Promise.resolve().then(()=>storage().save(record)).then(async()=>{
      await window.GANTRY_BONE_ACQ.cacheSaved?.(record.processing?.acquisitionId||record.id);
      frame.contentWindow.postMessage({type:'GANTRY_ACQUIRE_SAVED',version:1,id:record.processing?.acquisitionId||record.id},location.origin);
      return true;
    }).catch(error=>{
      status.textContent='No se pudo guardar automáticamente: '+error.message+'. La adquisición sigue disponible en esta sesión.';
      frame.contentWindow.postMessage({type:'GANTRY_ACQUIRE_SAVED',version:1,id:record.processing?.acquisitionId||record.id,error:status.textContent},location.origin);
      return false;
    });saving.set(key,task);return task;
  }
  const identity=r=>(r.processing?.acquisitionId||r.id)+':'+(r.totals||r.heads.map(h=>h.total)).join(':');
  function remember(record){
    if(record?.study!=='bone'||!record.finished)return;
    autoSave(record);
    if(!record.heads.every(h=>h.total>0))return;
    completed.set(identity(record),record);
    if(active)setTimeout(()=>refresh().then(sync).catch(error=>{status.textContent=error.message;}),0);
  }
  const frame=el('boneProcessingFrame'),status=el('boneProcessingStatus');
  // Auxiliary tools live in the main menu; the right slot belongs to the viewer.
  const tools=document.createElement('details');tools.id='boneProcessingTools';tools.hidden=true;
  const title=document.createElement('summary');title.textContent='Opciones de procesamiento';
  const content=document.createElement('div');content.id='boneProcessingToolsContent';
  content.append(el('boneProcessingToolbar'),el('boneProcessingList').closest('details'),status);
  tools.append(title,content);el('boneProcessingTab').parentElement.append(tools);

  const busy=()=>window.GANTRY_BONE_ACQ?.active||window.GANTRY_MAG3?.state&&!window.GANTRY_MAG3.state.finished;
  function load(){
    loaded=true;status.textContent='Cargando procesador óseo…';el('boneProcessingRetry').hidden=true;
    clearTimeout(loadTimer);frame.src=frame.dataset.src;
    loadTimer=setTimeout(()=>{if(!ready){status.textContent='El procesador no terminó de cargar. Puedes reintentar.';el('boneProcessingRetry').hidden=false;}},45000);
  }
  async function refresh(){
    refreshing=true;
    try{
    const selected=new Set([...el('boneProcessingList').querySelectorAll('input:checked')].map(n=>n.value));
    // Only acquisitions completed in this simulator session. Browsing cached
    // images in Gantry must not repopulate a new processing workspace.
    catalog=new Map(completed);
    el('boneProcessingList').replaceChildren();
    for(const [key,record] of catalog){
      const row=document.createElement('label'),check=document.createElement('input'),text=document.createElement('span');
      check.type='checkbox';check.value=key;check.checked=selected.has(key);
      text.textContent='De esta sesión · '+(record.kind==='whole'?'Cuerpo entero':'Estática')+' · '+record.names.join(' / ')+' · '+new Date(record.createdAt).toLocaleString('es-CL');
      row.append(check,text);el('boneProcessingList').append(row);
    }
    if(!catalog.size)el('boneProcessingList').textContent='Sin adquisiciones en esta sesión. Usa Adquirir para iniciar la primera.';
    el('boneProcessingSend').disabled=!ready||!catalog.size||!!pending;
    }finally{refreshing=false;}
  }
  function sync(){
    if(!active||!ready||pending||refreshing)return;
    const keys=[...catalog].filter(([,r])=>!imported.has(identity(r))).map(([key])=>key).slice(0,1);
    if(keys.length)return send(keys,true);
  }
  async function open(){
    if(busy()&&window.GANTRY_LIVE.settings.study!=='bone'){el('boneProcessingNotice').textContent='Finaliza la adquisición del otro estudio antes de entrar a procesamiento.';return;}
    active=true;tools.hidden=false;el('boneProcessingNotice').textContent='';
    el('acquisitionMenuButton').disabled=true;
    el('gantryLive').hidden=true;el('boneProcessingPane').hidden=false;
    el('boneProcessingTab').setAttribute('aria-selected','true');el('boneGantryTab').setAttribute('aria-selected','false');
    if(!loaded)load();
    try{await refresh();await sync();}catch(error){status.textContent='No se pudo leer el catálogo local: '+error.message;}
  }
  function close(){
    active=false;tools.hidden=true;tools.open=false;el('boneProcessingPane').hidden=true;el('gantryLive').hidden=false;
    el('acquisitionMenuButton').disabled=false;
    el('boneProcessingTab').setAttribute('aria-selected','false');el('boneGantryTab').setAttribute('aria-selected','true');
    if(ready)frame.contentWindow.postMessage({type:'GANTRY_PROCESSING_HIDE',version:1},location.origin);
    window.GANTRY_LIVE?.update(window.GANTRY.G);
  }
  async function send(selectedKeys,automatic=false){
    if(!ready||pending)return;
    const keys=Array.isArray(selectedKeys)?selectedKeys:[...el('boneProcessingList').querySelectorAll('input:checked')].map(n=>n.value);
    if(!keys.length){status.textContent='Selecciona al menos una adquisición.';return;}
    if(keys.length>50){status.textContent='Envía hasta 50 adquisiciones por vez.';return;}
    el('boneProcessingSend').disabled=true;
    const id=++request;
    pending={id,identities:keys.map(key=>identity(catalog.get(key)))};
    try{
      status.textContent='Preparando cuentas originales y metadatos…';
      const files=[];
      for(const key of keys){
        const record=catalog.get(key);
        const studyUID=await window.GANTRY_PROCESSING_DICOM.uid('gantry-bone-phantom:'+new Date(record.processing?.startedAt||record.createdAt).toISOString().slice(0,10));
        files.push(...await window.GANTRY_PROCESSING_DICOM.files(record,studyUID));
      }
      pending.timer=setTimeout(()=>{if(pending?.id===id){pending=null;el('boneProcessingSend').disabled=false;status.textContent='El procesador no confirmó la recepción. Pulsa Actualizar lista para reintentar.';}},30000);
      frame.contentWindow.postMessage({type:'GANTRY_PROCESSING_IMPORT',version:1,id,files,view:automatic?'acquisition':'flex'},location.origin);
      status.textContent='Enviando '+files.length+' imágenes al procesador…';
    }catch(error){pending=null;status.textContent='No se pudo enviar: '+error.message;el('boneProcessingSend').disabled=false;}
  }
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.version!==1)return;
    const data=event.data;
    if(data.type==='GANTRY_PROCESSING_READY'){ready=true;imported.clear();clearTimeout(loadTimer);el('boneProcessingRetry').hidden=true;status.textContent='Procesador listo. Las adquisiciones aparecerán en el menú de la izquierda.';el('boneProcessingSend').disabled=!catalog.size;sync();}
    if(data.type==='GANTRY_PROCESSING_RESULT'&&data.id===pending?.id){
      clearTimeout(pending.timer);if(!data.error)pending.identities.forEach(id=>imported.add(id));pending=null;el('boneProcessingSend').disabled=false;
      status.textContent=data.error?'No se pudo importar: '+data.error:data.images+' imágenes verificadas · '+data.totals.map((n,i)=>'D'+(i%2+1)+': '+n.toLocaleString('es-CL')+' cuentas').join(' · ')+'. Las cuentas originales se conservan.';
      if(!data.error)sync();
    }
  });
  el('boneProcessingTab').onclick=open;el('boneSendProcessing').onclick=open;
  el('boneGantryTab').onclick=close;el('boneProcessingBack').onclick=close;
  el('boneProcessingRefresh').onclick=()=>refresh().then(sync).catch(e=>{status.textContent=e.message;});
  el('boneProcessingSend').onclick=send;
  el('boneProcessingRetry').onclick=()=>{if(!ready)load();};
  async function retake(id){
    if(busy()||pending)throw Error('Espera a que termine la adquisición y su recepción antes de repetirla.');
    const entries=[...completed].filter(([,r])=>(r.processing?.acquisitionId||r.id)===id);
    if(!entries.length)throw Error('La adquisición seleccionada ya no está disponible.');
    const config=window.GANTRY_PROCESSING_CONFIG.fromRecord(entries[0][1]);
    await Promise.all(entries.map(([key])=>saving.get(key)));
    await storage().removeAcquisition(id);
    for(const [key] of entries){completed.delete(key);catalog.delete(key);imported.delete(key);saving.delete(key);}
    window.GANTRY_BONE_ACQ.discardFinished(id);
    await refresh();return config;
  }
  window.GANTRY_PROCESSING={open,close,remember,retake,get active(){return active;}};
  window.GANTRY_PROCESSING_ACQUISITION.attach(frame);
})();
