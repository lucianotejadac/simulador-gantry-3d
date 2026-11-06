/* Highlight changed readouts after an operator adjustment, never on clock ticks.
   Only text readouts are observed; no canvas pixels or acquisition data are read. */
(function(){
  'use strict';
  const duration=2500,resultPause=600,averageWindow=5000,states=new WeakMap(),histories=new WeakMap(),pending=new Map();
  let lastChange=-Infinity,observer,timer;
  const selector=[
    '#liveInfoD1','#liveInfoD2','#liveCameraSettings','#boneAcqInfo1','#boneAcqInfo2',
    '#boneAcqEstimate','#g3dHud','#liveEnergyValue','#bonePersistenceValue',
    '#mdpStats','#mdpDose','#mibiStats','#mibiDose','#mibiTiming',
    '#studyActivityInfo','.pixel-total','.pixel-panel td'
  ].join(',');
  const roots=[];
  function numericValue(text){
    if(typeof text==='number')return text;
    text=text.replace('−','-');
    if(text.includes(':'))return text.split(':').reduce((sum,part)=>sum*60+Number(part),0);
    // Readouts mix es-CL formatting with toFixed decimals (distance, energy).
    if(text.includes(','))return Number(text.replaceAll('.','').replace(',','.'));
    if(/^[+-]?[1-9]\d{0,2}(?:\.\d{3})+$/.test(text))return Number(text.replaceAll('.',''));
    return Number(text);
  }
  function historyContext(host){
    return JSON.stringify([window.GANTRY_LIVE?.settings.study,window.GANTRY_LIVE?.signal.mode,
      (host.textContent||'').replace(/[+−-]?\d+(?:[.,:]\d+)*/g,'#')]);
  }
  function trimHistory(samples,now){
    // Retain the value that was already on screen at the window's left edge.
    while(samples.length>1&&samples[1].at<=now-averageWindow)samples.shift();
  }
  function isImageReadout(host){return /^liveInfoD[12]$/.test(host.id)||host.matches('.pixel-total,.pixel-panel td');}
  function recordHistory(host,values,now){
    if(pending.has(host)||(isImageReadout(host)&&window.GANTRY_LIVE?.ready===false)){histories.delete(host);return;}
    const numbers=values.map(numericValue),context=historyContext(host);
    if(!numbers.length||!numbers.every(Number.isFinite)){histories.delete(host);return;}
    let history=histories.get(host);
    if(!history||history.context!==context||history.samples[0].values.length!==numbers.length){
      history={context,samples:[]};histories.set(host,history);
    }
    const samples=history.samples,last=samples.at(-1);
    if(last?.at===now)last.values=numbers;
    else if(!last||numbers.some((value,i)=>value!==last.values[i]))samples.push({at:now,values:numbers});
    trimHistory(samples,now);
  }
  function previousAverage(host,now){
    const history=histories.get(host);
    if(!history||history.context!==historyContext(host)||(isImageReadout(host)&&window.GANTRY_LIVE?.ready===false))return null;
    const samples=history.samples;trimHistory(samples,now);
    const start=Math.max(now-averageWindow,samples[0].at),elapsed=now-start;
    if(elapsed<=0)return null;
    const sums=samples[0].values.map(()=>0);
    samples.forEach((sample,i)=>{
      const weight=Math.max(0,(samples[i+1]?.at??now)-Math.max(start,sample.at));
      sample.values.forEach((value,j)=>{sums[j]+=value*weight;});
    });
    return {values:sums.map(sum=>sum/elapsed),elapsed};
  }
  function averageLabel(value,template){
    if(Math.abs(value-numericValue(template))<1e-10)return template;
    if(template.includes(':')){
      let seconds=Math.round(value*100)/100;
      const parts=template.split(':'),result=[];
      for(let i=parts.length-1;i>0;i--){
        const unit=60**i,whole=Math.floor(seconds/unit);seconds-=whole*unit;
        result.push(String(whole).padStart(parts[parts.length-1-i].length,'0'));
      }
      result.push(seconds.toLocaleString('es-CL',{minimumIntegerDigits:2,maximumFractionDigits:2}));
      return result.join(':');
    }
    const decimals=template.includes(',')?template.split(',')[1].length:
      template.includes('.')&&numericValue(template)===Number(template)?template.split('.')[1].length:0;
    return value.toLocaleString('es-CL',{maximumFractionDigits:Math.min(6,Math.max(2,decimals))});
  }
  function changed(){
    const now=performance.now();
    // Freeze the time-weighted mean before the adjustment clears persistence.
    // Repaints do not add weight; rapid adjustments retain the same prior mean.
    document.querySelectorAll(selector).forEach(host=>{
      const values=states.get(host)?.values,average=previousAverage(host,now);
      if(values?.length&&!pending.has(host))pending.set(host,{
        baseline:average?.values||values.map(numericValue),averageMs:average?.elapsed||0,
        previousLabels:average?.values.map((value,i)=>averageLabel(value,values[i])),
        study:window.GANTRY_LIVE?.settings.study,
        mode:window.GANTRY_LIVE?.signal.mode,readySince:now,
        started:now,waiting:new Set()
      });
      histories.delete(host);
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
    const imageReadout=isImageReadout(host);
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
    p.result??={at:now,deltas:values.map((value,i)=>p.averageMs?numericValue(value)-p.baseline[i]:0)};
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
    const comparison=pending.get(host),deltas=settledChanges(host,values,now);
    deltas?.forEach((delta,i)=>{
      if(delta)state.marks.set(i,{started:now,direction:delta>0?'increase':'decrease',
        previous:comparison.previousLabels[i],averageMs:comparison.averageMs});
    });
    recordHistory(host,values,now);
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
      if(mark.direction!=='pending'){
        span.dataset.previousLabel='promedio anterior: '+mark.previous;
        span.title+=' · '+span.dataset.previousLabel+' · Media temporal de los '+
          (mark.averageMs/1000).toLocaleString('es-CL',{maximumFractionDigits:2})+' s previos al cambio';
      }
      span.textContent=number.data;number.replaceWith(span);
      if(mark.direction!=='pending'){
        // Generated content keeps the old number out of the observed readout.
        // Fit the caption beside the arrow, inside its panel even near an edge.
        const bounds=(host.closest('.live-info,#liveCameraSettings,.pixel-panel')||host).getBoundingClientRect();
        if(!mark.caption||mark.caption.panelWidth!==bounds.width){
          const rect=span.getBoundingClientRect(),gap=(parseFloat(getComputedStyle(span).fontSize)||13)*.85,center=(rect.left+rect.right)/2;
          const left=center-gap-bounds.left-3,right=bounds.right-center-gap-3,width=parseFloat(getComputedStyle(span,'::before').width);
          const onLeft=right<width&&left>right;
          mark.caption={panelWidth:bounds.width,onLeft,room:Math.max(40,onLeft?left:right)};
        }
        span.classList.toggle('value-change-label-left',mark.caption.onLeft);
        span.style.setProperty('--value-label-max-width',mark.caption.room+'px');
      }
    }
  }
  function observe(){for(const root of roots)observer.observe(root,{childList:true,subtree:true,characterData:true});}
  function init(){
    const panel=document.getElementById('gantryLive'),hud=document.getElementById('g3dHud');
    if(!panel)return;
    roots.push(panel);if(hud)roots.push(hud);
    const monitors=document.getElementById('gantryLiveMonitors');
    if(monitors&&!panel.contains(monitors))roots.push(monitors);
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
    const parameter=/^(live(Collimator|EnergyCenter|WindowWidth)|bone(Persistence|CountRate|AcqCriterion|AcqTarget|AcqVelocity)|finalPreview(Criterion|Target)|mdp(Activity|Minutes|Timeline|Void)|mibi(Activity|Minutes|Timeline|Protocol|Void)|studyActivity|rf(Dose|DosePreset|Time|Select))$/;
    function input(event){
      const node=event.target;if(!parameter.test(node.id))return;
      // Administration fields commit on change; typing alone does not alter dose.
      if(node.id.startsWith('rf')&&event.type!=='change')return;
      if(node.disabled||node.checkValidity&&!node.checkValidity())return;
      const value=node.type==='checkbox'?node.checked:node.value;
      if(inputs.has(node)&&inputs.get(node)===value)return;
      inputs.set(node,value);changed();
    }
    document.addEventListener('input',input,true);document.addEventListener('change',input,true);
    document.addEventListener('click',event=>{
      const button=event.target.closest('button');
      if(button&&!button.disabled&&(
        (/^live(Zoom|Matrix)/.test(button.id)&&button.getAttribute('aria-pressed')!=='true')||
        ['liveResetCenter','changePatientPosition','mibiUsual','mibiLate','boneAcqSuggested',
          'acqSupine','acqProne','acqHeadIn','acqHeadOut','rfInject','rfResetInjection'].includes(button.id)||
        button.matches('.armbtn,.pixel-panel button')))changed();
      if(event.target.matches('#liveD1,#liveD2')&&document.getElementById('liveRecenter')?.getAttribute('aria-pressed')==='true')changed();
    },true);
  }
  window.GANTRY_VALUE_FEEDBACK={changed};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
