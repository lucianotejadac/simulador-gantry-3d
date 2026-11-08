/* Same-origin read-only tutorial snapshot. Pixel arrays never leave the viewer. */
(function(){
  'use strict';
  const cache=new WeakMap(),seen={},exported=new Map();
  const info=ds=>{
    if(!ds)return null;
    if(!cache.has(ds)){
      try{const r=JSON.parse(value(ds,'00111010'));cache.set(ds,{...r,id:r.processing?.acquisitionId||r.recordId});}
      catch(_){cache.set(ds,null);}
    }
    return cache.get(ds);
  };
  const isCase=()=>info(dataset)?.patient?.id==='caso-oseo';
  // Dynamic tiles contain pixel buffers. Compare their composition, not the buffers.
  const signature=page=>JSON.stringify([flex.header,page.header,page.items,page.texts],(key,value)=>
    key==='tiles'?value.map(t=>({id:t.id,label:t.label,sourceFrames:t.sourceFrames})):value);
  let exporting=null;
  document.addEventListener('click',event=>{
    const node=event.target.closest?.('button,input');if(!node)return;
    if(node.id==='flex-export'&&flexPage())exporting={id:flexPage().id,signature:signature(flexPage())};
    if(!isCase())return;
    if(['dyn-play','dyn-next','dyn-prev'].includes(node.id))seen.playback=true;
    if(node.getAttribute('aria-controls')==='analysisPanel')seen.analysis=true;
  },true);
  document.addEventListener('input',event=>{
    if(!isCase())return;
    if(event.target.id==='dyn-slider')seen.playback=true;
    if(['analysisWindow','analysisLevel','analysisInvert'].includes(event.target.id))seen.display=true;
  });
  document.addEventListener('change',event=>{
    if(isCase()&&['analysisWindow','analysisLevel','analysisInvert'].includes(event.target.id))seen.display=true;
  });
  window.addEventListener('gantry-flex-exported',()=>{if(exporting){exported.set(exporting.id,exporting.signature);exporting=null;}});
  const menu=$('processingFileMenu'),option=document.createElement('option');
  option.value='acquisition-tutorial';option.textContent='Tutorial de adquisición · Caso óseo';menu.append(option);
  menu.addEventListener('change',()=>{
    if(menu.value!=='acquisition-tutorial')return;
    menu.value='';parent.postMessage({type:'GANTRY_TUTORIAL_OPEN',version:1},location.origin);
  },true);
  window.GANTRY_TUTORIAL_VIEW={
    reset(){for(const key of Object.keys(seen))delete seen[key];exported.clear();},
    snapshot(){
      const records=new Map();
      for(const states of Object.values(acquisitionInstances))for(const state of Object.values(states||{})){
        const r=info(state.dataset);if(r)records.set(r.id,r);
      }
      for(const state of [...Object.values(modeStates),{dataset}]){const r=info(state?.dataset);if(r)records.set(r.id,r);}
      if(isCase()&&window.GANTRY_PROCESSING_ANALYSIS?.opened)seen.analysis=true;
      const assets=flex.assets.map(a=>({id:a.id,acquisitionId:a.acquisitionId,kind:a.kind,frames:a.dynamicFrames?.length||0}));
      const pages=flex.pages.map(page=>{
        let overlaps=0,incomplete=0;
        for(let i=0;i<page.items.length;i++){
          const a=page.items[i],asset=flex.assets.find(x=>x.id===a.asset);
          if(asset?.dynamicFrames){const included=new Set((a.dynamic?.tiles||[]).flatMap(t=>t.sourceFrames));if(asset.dynamicFrames.some(f=>!included.has(f.frame)))incomplete++;}
          for(const b of page.items.slice(i+1))if(Math.min(a.x+a.w,b.x+b.w)>Math.max(a.x,b.x)+1&&Math.min(a.y+a.h,b.y+b.h)>Math.max(a.y,b.y)+1)overlaps++;
        }
        return {id:page.id,items:page.items.map(i=>({asset:i.asset,acquisitionId:assets.find(a=>a.id===i.asset)?.acquisitionId})),overlaps,incomplete,exported:exported.get(page.id)===signature(page)};
      });
      return {records:[...records.values()],assets,pages,header:!!flex.header,seen:{...seen},config:window.GANTRY_PROCESSING_EDITOR.tutorialConfig()};
    }
  };
})();
