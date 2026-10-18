/* Highlight changed readouts after an operator adjustment, never on clock ticks.
   Only text readouts are observed; no canvas pixels or acquisition data are read. */
(function(){
  'use strict';
  const duration=1100,states=new WeakMap();
  let revision=0,lastChange=-Infinity,observer;
  const selector=[
    '#liveInfoD1','#liveInfoD2','#boneAcqInfo1','#boneAcqInfo2',
    '#boneAcqEstimate','#g3dHud','#liveEnergyValue','#bonePersistenceValue',
    '#mdpStats','#mdpDose','#mibiStats','#mibiDose','#mibiTiming',
    '#studyActivityInfo','.pixel-total','.pixel-panel td'
  ].join(',');
  const roots=[];
  function numericValue(text){
    text=text.replace('−','-');
    if(text.includes(':'))return text.split(':').reduce((sum,part)=>sum*60+Number(part),0);
    // Readouts mix es-CL formatting with toFixed decimals (distance, energy).
    if(text.includes(','))return Number(text.replaceAll('.','').replace(',','.'));
    if(/^[+-]?[1-9]\d{0,2}(?:\.\d{3})+$/.test(text))return Number(text.replaceAll('.',''));
    return Number(text);
  }
  function changed(){
    const now=performance.now();
    // A slider drag or held remote key is one adjustment, not many flashes.
    if(now-lastChange>350)revision++;
    lastChange=now;
  }
  function tokens(host){
    const walker=document.createTreeWalker(host,NodeFilter.SHOW_TEXT),result=[];
    while(walker.nextNode()){
      const node=walker.currentNode;
      for(const match of node.data.matchAll(/[+−-]?\d+(?:[.,:]\d+)*/g))
        result.push({node,start:match.index,end:match.index+match[0].length,value:match[0]});
    }
    return result;
  }
  function paint(host){
    const list=tokens(host),values=list.map(t=>t.value),old=states.get(host),now=performance.now();
    const state={values,revision:old?.revision??revision,marks:old?.marks||new Map()};
    if(old&&old.values.length===values.length&&state.revision!==revision&&now-lastChange<(window.GANTRY_FINAL_PREVIEW?.active?30000:1800)){
      const changedIndices=values.map((v,i)=>v!==old.values[i]?i:-1).filter(i=>i>=0);
      if(changedIndices.length){
        state.revision=revision;
        for(const i of changedIndices){
          const delta=numericValue(values[i])-numericValue(old.values[i]);
          if(delta)state.marks.set(i,{started:now,direction:delta>0?'increase':'decrease'});
        }
      }
    }else if(!old||old.values.length!==values.length){
      state.revision=revision;state.marks=new Map();
    }
    states.set(host,state);
    for(const [i,mark] of state.marks)if(now-mark.started>=duration)state.marks.delete(i);
    if(!state.marks.size&&!host.querySelector('.value-change-flash'))return;
    // Unwrap our own spans before rebuilding. Application renders may replace
    // text every frame; a negative animation delay preserves the original fade.
    host.querySelectorAll('.value-change-flash').forEach(span=>span.replaceWith(document.createTextNode(span.textContent)));
    host.normalize();
    const fresh=tokens(host);
    for(let i=fresh.length-1;i>=0;i--){
      const mark=state.marks.get(i);
      if(!mark)continue;
      const t=fresh[i];t.node.splitText(t.end);
      const number=t.node.splitText(t.start);
      const span=document.createElement('span');span.className='value-change-flash value-change-'+mark.direction;
      span.style.animationDelay=-(now-mark.started)+'ms';
      span.title=mark.direction==='increase'?'Aumentó':'Disminuyó';
      span.textContent=number.data;number.replaceWith(span);
    }
  }
  function observe(){for(const root of roots)observer.observe(root,{childList:true,subtree:true,characterData:true});}
  function init(){
    const panel=document.getElementById('gantryLive'),hud=document.getElementById('g3dHud');
    if(!panel)return;
    roots.push(panel);if(hud)roots.push(hud);
    document.querySelectorAll(selector).forEach(paint);
    observer=new MutationObserver(records=>{
      const hosts=new Set();
      for(const record of records){
        const node=record.target.nodeType===1?record.target:record.target.parentElement;
        const host=node?.closest(selector);if(host)hosts.add(host);
        // Pixel inspectors are mounted lazily on the first acquired image.
        for(const added of record.addedNodes)if(added.nodeType===1){
          if(added.matches(selector))hosts.add(added);
          added.querySelectorAll(selector).forEach(el=>hosts.add(el));
        }
      }
      if(!hosts.size)return;
      observer.disconnect();
      try{hosts.forEach(host=>{if(host.isConnected)paint(host);});}finally{observe();}
    });
    observe();
    const inputs=new WeakMap();
    const parameter=/^(live(Collimator|EnergyCenter|WindowWidth)|bone(Persistence|CountRate|AcqCriterion|AcqTarget|AcqVelocity)|finalPreview(Criterion|Target)|mdp(Activity|Minutes|Timeline|Void)|mibi(Activity|Minutes|Timeline|Protocol|Void)|studyActivity)$/;
    function input(event){
      const node=event.target;if(!parameter.test(node.id))return;
      const value=node.type==='checkbox'?node.checked:node.value;
      if(inputs.has(node)&&inputs.get(node)===value)return;
      inputs.set(node,value);changed();
    }
    document.addEventListener('input',input,true);document.addEventListener('change',input,true);
    document.addEventListener('click',event=>{
      const button=event.target.closest('button');
      if(button&&!button.disabled&&(
        (/^live(Zoom|Matrix)/.test(button.id)&&button.getAttribute('aria-pressed')!=='true')||
        ['liveResetCenter','changePatientPosition','mibiUsual','mibiLate','boneAcqSuggested'].includes(button.id)||
        button.matches('.armbtn,.pixel-panel button')))changed();
      if(event.target.matches('#liveD1,#liveD2')&&document.getElementById('liveRecenter')?.getAttribute('aria-pressed')==='true')changed();
    },true);
  }
  window.GANTRY_VALUE_FEEDBACK={changed};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
