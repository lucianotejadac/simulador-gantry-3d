/* Training rule only: a fast-motion contact cancels the current examination. */
(function(){
  'use strict';
  const key='gantry.sentinel-exam.v1',el=id=>document.getElementById(id);
  let record=null,revision=0;
  try{record=JSON.parse(sessionStorage.getItem(key)||'null');}catch(_){}
  const controls=['boneAcqStart','boneAcqBegin','boneAcqInstant','boneAcqPause','boneAcqFinish','boneAcqFast','boneAcqSpeed','boneAcqSave','boneSendProcessing','injectMAG3','injectMAG3Instant','finalPreviewNoise'];
  const disabled=new Map();
  function persist(){try{if(record)sessionStorage.setItem(key,JSON.stringify(record));else sessionStorage.removeItem(key);}catch(_){} }
  function refresh(){
    const banner=el('examSafetyBanner');if(!banner)return;
    banner.hidden=!record;
    el('examSafetyMessage').textContent=record?'EVENTO CENTINELA SIMULADO · Examen cancelado · D'+record.detector+' · '+record.region+'. Nuevas adquisiciones bloqueadas.':'';
    if(record)for(const id of controls){const node=el(id);if(node){if(!disabled.has(node))disabled.set(node,node.disabled);node.disabled=true;}}
    el('examRestart').disabled=!!window.GANTRY_BONE_ACQ?.state?.busy||!!window.GANTRY_MAG3?.state?.busy;
  }
  function cancel(detail){
    if(record)return false;
    record={...detail,time:new Date().toISOString()};revision++;persist();
    window.GANTRY_BONE_ACQ?.cancelExam();
    window.GANTRY_MAG3?.cancelExam();
    window.GANTRY_FINAL_PREVIEW?.cancel();
    // Live positioning remains available; a final predicted image cannot be generated.
    if(window.GANTRY_LIVE?.signal?.mode==='final')window.GANTRY_LIVE.setSignalMode('live');
    refresh();return true;
  }
  function restart(){
    if(!record)return false;
    if(window.GANTRY_BONE_ACQ?.state?.busy||window.GANTRY_MAG3?.state?.busy)return false;
    const hits=window.GANTRY3D?.collision?.evaluate(window.GANTRY.G);
    if(hits?.some(h=>h.body.gap<.0024||h.table.gap<.0024)){
      el('examSafetyHint').textContent='Primero retira el detector o la camilla hasta liberar el contacto y el margen de seguridad.';return false;
    }
    record=null;revision++;persist();
    for(const [node,value] of disabled)node.disabled=value;disabled.clear();
    window.GANTRY_BONE_ACQ?.resetExam();window.GANTRY_MAG3?.resetExam();
    el('examSafetyHint').textContent='Libera el contacto y reinicia para comenzar un nuevo examen. Las adquisiciones anteriores guardadas se conservan.';
    refresh();window.GANTRY_LIVE?.update(window.GANTRY.G);return true;
  }
  window.GANTRY_EXAM={cancel,restart,refresh,get blocked(){return !!record;},get revision(){return revision;},get event(){return record&&{...record};}};
  el('examRestart').addEventListener('click',restart);
  // This also rejects stale button events before an engine's next UI refresh.
  document.addEventListener('click',event=>{
    if(record&&event.composedPath().some(node=>controls.includes(node.id))){event.preventDefault();event.stopImmediatePropagation();refresh();}
  },true);
  if(record)el('collisionMode').value='sentinel';
  refresh();
})();
