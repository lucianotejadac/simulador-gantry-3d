/* Two single-frame simulator instances share a series, not a pixel buffer.
   Display each original instance in its own viewport without merging counts. */
(function(){
  'use strict';
  let pair=[],series='';
  const simulated=ds=>ds?.string('x00110010')==='GANTRY_SIMULATION';
  function renderRecordedTimes(i){
    if(!simulated(dataset))return;
    let info;try{info=JSON.parse(value(dataset,'00111010'));}catch(_){return;}
    const times=window.GANTRY_RECORDED_METADATA.timing(info);
    if(times)for(const row of $('stats-'+i)?.querySelectorAll('.stat')||[]){
      const label=row.querySelector('label')?.textContent,out=row.querySelector('output');
      const text=label==='T. transcurrido'?times.elapsed:label==='T. restante'?times.remaining:undefined;
      if(out&&text!==undefined){out.textContent=text;out.title='Tiempo registrado del detector de esta imagen. Segundos simulados.';}
    }
  }
  const originalBuild=buildPanels,originalRender=render;
  buildPanels=function(){
    pair=[];series='';
    originalBuild();
    if(!simulated(dataset)||currentMode==='dynamic'||!pixels)return;
    const uid=dataset.string('x00080018'),seriesUID=dataset.string('x0020000e');
    if(!seriesUID)return;
    const candidates=Object.values(acquisitionInstances).flatMap(group=>Object.values(group))
      .filter(s=>simulated(s.dataset)&&s.pixels&&s.dataset.string('x0020000e')===seriesUID&&s.dataset.string('x00080018')!==uid);
    candidates.push({dataset,pixels,frameCount,frameSize});
    const unique=new Map(candidates.map(s=>[s.dataset.string('x00080018'),s]));
    const ordered=[...unique.values()].sort((a,b)=>Number(a.dataset.string('x00200013'))-Number(b.dataset.string('x00200013')));
    if(ordered.length!==2||ordered.some(s=>s.frameCount!==1))return;
    pair=ordered;series=seriesUID;
    for(let i=0;i<2;i++){
      const select=$('frame-'+i);select.replaceChildren();
      const empty=document.createElement('option');empty.value='';empty.textContent='Sin imagen';select.append(empty);
      pair.forEach((state,j)=>{
        const option=document.createElement('option');option.value=String(j);
        option.textContent=value(state.dataset,'0008103e')||'Detector '+(j+1);select.append(option);
      });
      select.value=String(i);
    }
  };
  render=function(i){
    const select=$('frame-'+i),index=select?.value;
    if(!pair.length||dataset?.string('x0020000e')!==series||index===''||!pair[Number(index)]){
      const result=originalRender(i);renderRecordedTimes(i);return result;
    }
    const state=pair[Number(index)],before={dataset,pixels,frameCount,frameSize};
    // The existing renderer expects a frame index within one instance.
    // Each detector instance contains exactly one frame, numbered zero.
    try{
      dataset=state.dataset;pixels=state.pixels;frameCount=state.frameCount;frameSize=state.frameSize;
      select.value='0';const result=originalRender(i);
      renderRecordedTimes(i);
      $('detector-'+i).textContent='Detector '+state.dataset.string('x00200013');
      return result;
    }finally{
      ({dataset,pixels,frameCount,frameSize}=before);select.value=index;
    }
  };
  const originalSelect=selectMode;
  selectMode=function(...args){
    const result=originalSelect(...args);
    // A saved single-instance view predates reception of its companion and
    // restores an empty second viewport after buildPanels has paired them.
    if(pair.length===2&&dataset?.string('x0020000e')===series&&$('frame-1')?.value===''){
      $('frame-1').value='1';render(1);
    }
    return result;
  };
})();
