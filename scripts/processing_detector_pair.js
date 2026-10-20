/* Two single-frame simulator instances share a series, not a pixel buffer.
   Display each original instance in its own viewport without merging counts. */
(function(){
  'use strict';
  let pair=[],series='';
  const simulated=ds=>ds?.string('x00110010')==='GANTRY_SIMULATION';
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
        option.textContent=state.dataset.string('x0008103e')||'Detector '+(j+1);select.append(option);
      });
      select.value=String(i);
    }
  };
  render=function(i){
    const select=$('frame-'+i),index=select?.value;
    if(!pair.length||dataset?.string('x0020000e')!==series||index===''||!pair[Number(index)])return originalRender(i);
    const state=pair[Number(index)],before={dataset,pixels,frameCount,frameSize};
    // The existing renderer expects a frame index within one instance.
    // Each detector instance contains exactly one frame, numbered zero.
    try{
      dataset=state.dataset;pixels=state.pixels;frameCount=state.frameCount;frameSize=state.frameSize;
      select.value='0';return originalRender(i);
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
