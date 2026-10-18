/* Highlight changed readouts after an operator adjustment, never on clock ticks.
   Only text readouts are observed; no canvas pixels or acquisition data are read. */
(function(){
  'use strict';
  const duration=2500,resultPause=600,states=new WeakMap(),pending=new Map();
  let lastChange=-Infinity,observer,timer;
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
    // Capture the pre-adjustment value, before persistence is cleared to zero.
    // Further adjustments while refilling retain this original baseline.
    document.querySelectorAll(selector).forEach(host=>{
      const baseline=states.get(host)?.values;
      if(baseline?.length&&!pending.has(host))pending.set(host,{
        baseline:baseline.slice(),study:window.GANTRY_LIVE?.settings.study,
        mode:window.GANTRY_LIVE?.signal.mode,readySince:now,
        started:now,waiting:new Set()
      });
      if(pending.has(host))delete pending.get(host).result;
      states.get(host)?.marks.clear();
    });
    lastChange=now;
    schedule();
  }
  function schedule(){
    clearTimeout(timer);
    if(pending.size)timer=setTimeout(()=>{
      observer.disconnect();
      try{for(const host of pending.keys()){
        if(host.isConnected)paint(host);else pending.delete(host);
      }}finally{observe();}
      schedule();
    },100);
  }
  function settledChanges(host,values,now){
    const p=pending.get(host);if(!p)return null;
    const live=window.GANTRY_LIVE;
    if(now-lastChange>30000||p.study!==live?.settings.study||p.mode!==live?.signal.mode){pending.delete(host);return null;}
    const imageReadout=/^liveInfoD[12]$/.test(host.id)||host.matches('.pixel-total,.pixel-panel td');
    if(imageReadout&&live?.ready===false){p.readySince=null;delete p.result;return null;}
    if(p.readySince===null)p.readySince=now;
    const refill=/^liveInfoD[12]$/.test(host.id)&&live?.signal.mode==='live';
    const delay=refill?Math.max(350,(live.signal.duration||.75)*1000+250):350;
    if(now-Math.max(lastChange,p.readySince)<delay)return null;
    // An asynchronous final prediction keeps the old image while calculating.
    if(imageReadout&&window.GANTRY_FINAL_PREVIEW?.active&&
      !document.getElementById('finalPreviewStatus')?.textContent.startsWith('Vista previa')){delete p.result;return null;}
    if(values.length!==p.baseline.length)return null;
    // Keep the yellow feedback briefly after calculation, then hold the result.
    // Preserve its comparison while ordinary live-count noise continues.
    p.result??={at:now,deltas:values.map((value,i)=>numericValue(value)-numericValue(p.baseline[i]))};
    if(now-p.result.at<resultPause)return null;
    pending.delete(host);
    return p.result.deltas;
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
  function pendingMarks(host,values){
    const p=pending.get(host);
    if(!p||values.length!==p.baseline.length)return null;
    values.forEach((value,i)=>{
      if(numericValue(value)!==numericValue(p.baseline[i]))p.waiting.add(i);
    });
    return p;
  }
  function paint(host){
    const list=tokens(host),values=list.map(t=>t.value),old=states.get(host),now=performance.now();
    const state={values,marks:old?.marks||new Map()};
    if(old&&old.values.length!==values.length)state.marks=new Map();
    const deltas=settledChanges(host,values,now);
    deltas?.forEach((delta,i)=>{
      if(delta)state.marks.set(i,{started:now,direction:delta>0?'increase':'decrease'});
    });
    const waiting=pendingMarks(host,values);
    states.set(host,state);
    for(const [i,mark] of state.marks)if(now-mark.started>=duration)state.marks.delete(i);
    if(!state.marks.size&&!waiting?.waiting.size&&!host.querySelector('.value-change-flash'))return;
    // Unwrap our own spans before rebuilding. Application renders may replace
    // text every frame; a negative animation delay preserves the original fade.
    host.querySelectorAll('.value-change-flash').forEach(span=>span.replaceWith(document.createTextNode(span.textContent)));
    host.normalize();
    const fresh=tokens(host);
    for(let i=fresh.length-1;i>=0;i--){
      const mark=waiting?.waiting.has(i)?{started:waiting.started,direction:'pending'}:state.marks.get(i);
      if(!mark)continue;
      const t=fresh[i];t.node.splitText(t.end);
      const number=t.node.splitText(t.start);
      const span=document.createElement('span');span.className='value-change-flash value-change-'+mark.direction;
      span.style.animationDelay=-(now-mark.started)+'ms';
      span.title=mark.direction==='pending'?'Calculando valor final…':mark.direction==='increase'?'Aumentó':'Disminuyó';
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
