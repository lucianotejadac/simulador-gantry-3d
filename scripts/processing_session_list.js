/* Session acquisitions followed by the permanent flexible-page entry.
   Keep the underlying slots for the viewer's series/pair bookkeeping. */
(function(){
  'use strict';
  const nav=document.querySelector('.acquisition-tabs');
  const empty=nav.querySelector('p')||document.createElement('p');
  empty.id='processingEmptyAcquisitions';
  empty.textContent='Sin adquisiciones. Usa Adquirir para comenzar.';
  nav.append(empty);
  const style=document.createElement('style');
  style.textContent='.acquisition-tabs [hidden]{display:none!important}#processingEmptyAcquisitions{padding:10px 6px;font-size:13px;line-height:1.4;color:#fff;opacity:1}#processingEmptyAcquisitions:not([hidden]){display:block!important}';
  document.head.append(style);
  const order=new Map(),original=updateModeUI;
  function identity(key){
    const ds=modeStates[key]?.dataset||(key===currentAcquisition?dataset:null)||Object.values(acquisitionInstances[key]||{}).find(s=>s.dataset)?.dataset;
    try{const info=JSON.parse(value(ds,'00111010'));return info.processing?.acquisitionId||info.recordId||key;}catch(_){return key;}
  }
  function arrange(){
    let number=0;
    for(const entry of order.values()){
      const button=entry.button;button.hidden=false;
      button.dataset.acquisitionNumber=String(++number);
      nav.insertBefore(button,empty);
    }
    empty.hidden=order.size>0;
    const flexible=$('mode-flex');
    if(flexible){
      flexible.hidden=false;
      nav.append(flexible);
      // Resolve the current handler so draft and analysis wrappers also run.
      flexible.onclick=()=>openFlexible();
    }
  }
  style.textContent+=' .acquisition-tabs button[data-acquisition-number]::before{content:attr(data-acquisition-number) " · ";font-weight:bold}.acquisition-tabs button{flex-shrink:0}';
  let configurationSerial=0;
  function configuration(config,configurationId='draft:'+ ++configurationSerial){
    let entry=order.get(configurationId);
    if(!entry){entry=createEntry(configurationId,config);order.set(configurationId,entry);}
    entry.names=config.names.join(' / ');
    entry.symbol.textContent=config.kind==='whole'?'▥':'▣';
    entry.label.textContent=config.kind==='whole'?'Adquisición cuerpo entero':config.kind==='dynamic'?'Adquisición dinámica':'Adquisición estática';
    entry.detail.textContent=entry.names+' · Configuración';entry.button.title=entry.detail.textContent;
    arrange();return configurationId;
  }
  function cancelConfiguration(configurationId){
    const entry=order.get(configurationId);if(!entry)return;
    entry.button.remove();order.delete(configurationId);arrange();
  }
  function createEntry(id,config){
    const button=document.createElement('button'),symbol=document.createElement('span'),detail=document.createElement('small');
    button.type='button';button.setAttribute('role','tab');button.setAttribute('aria-controls','acquisition-panel');
    symbol.className='mode-symbol';symbol.textContent=config.kind==='whole'?'▥':'▣';symbol.setAttribute('aria-hidden','true');
    const label=document.createTextNode(config.kind==='whole'?'Adquisición cuerpo entero':config.kind==='dynamic'?'Adquisición dinámica':'Adquisición estática');
    button.append(symbol,label,detail);
    const names=config.names.join(' / ');detail.textContent=names+' · Adquiriendo';
    const entry={id,button,symbol,label,detail,names};
    button.onclick=()=>window.GANTRY_PROCESSING_EDITOR?.showCurrent(entry.id);
    return entry;
  }
  function started(id,config,configurationId){
    if(order.has(id))return;
    const entry=order.get(configurationId)||createEntry(id,config);
    entry.id=id;entry.names=config.names.join(' / ');entry.detail.textContent=entry.names+' · Adquiriendo';
    // Promote the configuration tile in place instead of adding a second one.
    const entries=[...order].map(([key,value])=>key===configurationId?[id,entry]:[key,value]);
    order.clear();for(const [key,value] of entries)order.set(key,value);
    order.set(id,entry);arrange();
  }
  function progress(state){
    const entry=order.get(state.id);if(!entry?.detail)return;
    const ratios=state.mode==='scan'?[state.travel/state.target]:state.heads.map(h=>(state.mode==='time'?h.elapsed:h.total)/state.target);
    const percent=Math.floor(Math.max(0,Math.min(1,Math.min(...ratios)))*100);
    const phase=state.cancelled?'Cancelada':state.finished?(state.heads.every(h=>h.total>0)?'Finalizada · preparando imágenes':'Finalizada · sin señal'):state.paused?'En pausa':'Adquiriendo';
    entry.detail.textContent=entry.names+' · '+phase+(state.finished?'':' · '+percent+'%');
    entry.button.title=entry.detail.textContent;
    entry.button.disabled=!!state.cancelled||!!state.finished&&!state.heads.every(h=>h.total>0);
  }
  updateModeUI=function(){
    const draftHeading=window.GANTRY_PROCESSING_EDITOR?.currentId?$('mode-heading').textContent:null;
    const result=original();
    if(draftHeading!==null)$('mode-heading').textContent=draftHeading;
    for(const key of Object.keys(acquisitionKinds)){
      const populated=!!modeStates[key]?.dataset||(key===currentAcquisition&&!!dataset)||Object.values(acquisitionInstances[key]||{}).some(s=>s.dataset);
      const button=$('mode-'+key);
      button.hidden=!populated;
      if(populated){
        const id=identity(key),previous=order.get(id);
        if(previous&&previous.button!==button)previous.button.remove();
        order.set(id,{button,key});
      }
    }
    // One slot contains the two detector instances of a single series.
    // Append acquisitions in arrival order, even when the study type changes.
    arrange();
    const active=window.GANTRY_PROCESSING_EDITOR?.currentId;
    const inFlexible=typeof flex!=='undefined'&&flex.visible;
    for(const [id,entry] of order)entry.button.setAttribute('aria-selected',String(!inFlexible&&(active?id===active:entry.key===currentAcquisition)));
    if($('mode-flex'))$('mode-flex').setAttribute('aria-selected',String(!!inFlexible));
    return result;
  };
  function remove(id){
    const removedUIDs=new Set();
    for(const key of Object.keys(acquisitionKinds))if(identity(key)===id){
      for(const state of Object.values(acquisitionInstances[key]||{}))removedUIDs.add(state.dataset?.string('x00080018'));
      delete acquisitionInstances[key];modeStates[key]=null;$('mode-'+key).hidden=true;
      if(key===currentAcquisition){dataset=null;pixels=null;rows=[];frameCount=0;frameSize=0;defaults={};currentFilename='';}
    }
    const entry=order.get(id);if(entry?.detail)entry.button.remove();order.delete(id);
    const assets=new Set(flex.assets.filter(a=>removedUIDs.has(a.uid)).map(a=>a.id));
    flex.assets=flex.assets.filter(a=>!assets.has(a.id));
    for(const page of flex.pages)page.items=page.items.filter(item=>!assets.has(item.asset));
    flex.selected=null;
    populate();buildPanels();controls(!!pixels);renderAll();showTags();updateModeUI();refreshFlexible();
  }
  function selectLast(){const entry=[...order.values()].at(-1);if(entry)entry.button.click();else updateModeUI();}
  window.GANTRY_PROCESSING_LIST={configuration,cancelConfiguration,started,progress,remove,selectLast};
  updateModeUI();
})();
