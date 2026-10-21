/* Session acquisitions only: no empty type slots or tool tiles in the list.
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
  }
  style.textContent+=' .acquisition-tabs button[data-acquisition-number]::before{content:attr(data-acquisition-number) " · ";font-weight:bold}.acquisition-tabs button{flex-shrink:0}';
  function started(id,config){
    if(order.has(id))return;
    const button=document.createElement('button'),symbol=document.createElement('span'),detail=document.createElement('small');
    button.type='button';button.setAttribute('role','tab');button.setAttribute('aria-controls','acquisition-panel');
    symbol.className='mode-symbol';symbol.textContent=config.kind==='whole'?'▥':'▣';symbol.setAttribute('aria-hidden','true');
    button.append(symbol,document.createTextNode(config.kind==='whole'?'Adquisición cuerpo entero':'Adquisición estática'),detail);
    const names=config.names.join(' / ');detail.textContent=names+' · Adquiriendo';
    button.onclick=()=>window.GANTRY_PROCESSING_EDITOR?.showCurrent(id);
    order.set(id,{button,detail,names});arrange();
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
    for(const [id,entry] of order)entry.button.setAttribute('aria-selected',String(active?id===active:entry.key===currentAcquisition));
    if($('mode-flex'))$('mode-flex').hidden=true;
    return result;
  };
  window.GANTRY_PROCESSING_LIST={started,progress};
  updateModeUI();
})();
