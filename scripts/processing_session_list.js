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
  style.textContent='.acquisition-tabs [hidden]{display:none!important}#processingEmptyAcquisitions{padding:10px 6px;font-size:13px;line-height:1.4}#processingEmptyAcquisitions:not([hidden]){display:block!important}';
  document.head.append(style);
  const order=new Map(),original=updateModeUI;
  updateModeUI=function(){
    const result=original();
    for(const key of Object.keys(acquisitionKinds)){
      const populated=!!modeStates[key]?.dataset||(key===currentAcquisition&&!!dataset)||Object.values(acquisitionInstances[key]||{}).some(s=>s.dataset);
      const button=$('mode-'+key);
      button.hidden=!populated;
      if(populated&&!order.has(key))order.set(key,button);
    }
    // One slot contains the two detector instances of a single series.
    // Append acquisitions in arrival order, even when the study type changes.
    for(const button of order.values())nav.insertBefore(button,empty);
    empty.hidden=order.size>0;
    if($('mode-flex'))$('mode-flex').hidden=true;
    return result;
  };
  updateModeUI();
})();
