/* Non-destructive prediction at fixed detector geometry, including tracer evolution. */
(function(){
  'use strict';
  const supported=new Set(['bone','mibi','thyroid','exploration','parathyroid','dmsa','maa']);
  function predict(fields,{mode,target,rate,model=null,start=0,limit=Infinity,weights=null}){
    if(!['time','counts'].includes(mode)||!Number.isFinite(target)||(mode==='counts'&&!Number.isInteger(target))||target<=0||target>(mode==='time'?57600:160000000)||!Number.isFinite(rate)||rate<0)throw Error('Objetivo no válido');
    return fields.map(field=>{
      const bases=model?field[model==='bone'?'mdpBases':'mibiBases']:[field.values];
      if(!bases?.length)throw Error('Preparando bases del estudio');
      // Do not materialize absent late-MDP components merely to sum them.
      const sums=new Array(bases.length),sumAt=c=>sums[c]??(sums[c]=bases[c].reduce((a,v)=>a+v,0));
      const coeff=new Float64Array(bases.length);
      const horizon=Math.max(0,limit-start);let elapsed=0,total=0;
      if(!model){
        const cps=field.sum*rate/2000000;
        elapsed=mode==='time'?target:cps>0?target/cps:0;
        coeff[0]=rate*elapsed/2000000;total=cps*elapsed;
      }else{
        while(elapsed<horizon-1e-8&&(mode==='time'?elapsed<target-1e-8:total<target-1e-7)){
          // Split at clock/void boundaries, with short steps during first pass.
          const current=start+elapsed,quantum=current<60?1:5;
          const next=(Math.floor((current+1e-7)/quantum)+1)*quantum;
          let dt=Math.min(next-current,horizon-elapsed,mode==='time'?target-elapsed:Infinity);
          const w=weights(current+dt/2),cps=rate*w.reduce((a,v,c)=>v?a+v*sumAt(c):a,0);
          if(mode==='counts'&&cps>0)dt=Math.min(dt,(target-total)/cps);
          for(let c=0;c<coeff.length;c++)coeff[c]+=w[c]*rate*dt;
          total+=cps*dt;elapsed+=dt;
        }
      }
      const values=new Float64Array(field.values.length);let sum=0;
      for(let c=0;c<bases.length;c++)if(coeff[c]){
        const base=bases[c];
        for(let i=0;i<values.length;i++)values[i]+=base[i]*coeff[c];
      }
      for(const v of values)sum+=v;
      return {values,sum,elapsed,reached:mode==='time'?elapsed>=target-1e-6:total>=target-1e-6,mode,target};
    });
  }
  function random(seed){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
  async function sample(result,seed,cancel=()=>false){
    const counts=new Uint32Array(result.values.length),rng=random(seed);
    if(result.mode==='counts'&&result.reached&&result.sum>0&&result.target>200000&&counts.length>=512*512){
      // Independent Poisson samples are iid multinomial conditional on their sum.
      // Append iid events or thin uniformly to reach the exact requested total.
      let total=0;const cdf=new Float64Array(counts.length);let sum=0;
      for(let i=0;i<counts.length;i++){
        counts[i]=window.GANTRY_BONE_CORE.poisson(result.values[i]*result.target/result.sum,rng);
        total+=counts[i];cdf[i]=sum+=result.values[i];
        if(i%32768===32767){await new Promise(r=>setTimeout(r,0));if(cancel())return null;}
      }
      if(total>result.target){
        const tree=new Float64Array(counts.length+1);
        for(let i=1;i<tree.length;i++)tree[i]=counts[i-1];
        for(let i=1;i<tree.length;i++){const p=i+(i&-i);if(p<tree.length)tree[p]+=tree[i];}
        let bit=1;while(bit*2<tree.length)bit*=2;
        while(total>result.target){
          let rank=Math.floor(rng()*total),at=0;
          for(let step=bit;step;step>>=1){const next=at+step;if(next<tree.length&&tree[next]<=rank){rank-=tree[next];at=next;}}
          counts[at]--;for(let k=at+1;k<tree.length;k+=k&-k)tree[k]--;total--;
        }
      }else while(total<result.target){
        const value=rng()*sum;let lo=0,hi=cdf.length-1;
        while(lo<hi){const mid=(lo+hi)>>>1;if(cdf[mid]>value)hi=mid;else lo=mid+1;}
        counts[lo]++;total++;
      }
      return {...result,counts,total};
    }
    if(result.mode==='counts'&&result.reached&&result.sum>0){
      const cdf=new Float64Array(counts.length);let sum=0;
      for(let i=0;i<cdf.length;i++)cdf[i]=sum+=result.values[i];
      for(let n=0;n<result.target;n++){
        const value=rng()*sum;let lo=0,hi=cdf.length-1;
        while(lo<hi){const mid=(lo+hi)>>>1;if(cdf[mid]>value)hi=mid;else lo=mid+1;}
        counts[lo]++;
        if(n%20000===19999){await new Promise(r=>setTimeout(r,0));if(cancel())return null;}
      }
    }else for(let i=0;i<counts.length;i++)counts[i]=window.GANTRY_BONE_CORE.poisson(result.values[i],rng);
    return {...result,counts,total:counts.reduce((a,v)=>a+v,0)};
  }
  const el=id=>document.getElementById(id);
  let key='',token=0,timer=null,display=null,latest=null,noise=1,wasActive=false;
  const painted=new WeakMap();
  const active=()=>!window.GANTRY_EXAM?.blocked&&window.GANTRY_LIVE?.signal.mode==='final'&&supported.has(window.GANTRY_LIVE.settings.study);
  const clock=s=>Number.isFinite(s)?Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'):'—';
  function controls(){
    if(!el('finalPreviewControls'))return;
    const on=active();el('finalPreviewControls').hidden=!on;el('gantryLive').classList.toggle('final-preview',on);
    if(el('liveDisplayMode'))el('liveDisplayMode').textContent=on?'IMAGEN FINAL PREVISTA':'IMAGEN EN VIVO';
    for(let i=1;i<=2;i++)el('liveD'+i)?.setAttribute('aria-label',(on?'Imagen final prevista':'Proyección en vivo')+' del detector '+i);
    if(on&&!wasActive){
      el('finalPreviewCriterion').value=el('boneAcqCriterion').value||'time';
      el('finalPreviewTarget').value=el('boneAcqTarget').value||60;
      units();
    }
    document.querySelectorAll('.live-card:not(.bone-acq-card) .bone-card-title').forEach((node,i)=>node.textContent=(on?'IMAGEN FINAL PREVISTA':'EN VIVO')+' · DETECTOR '+(i+1));
    wasActive=on;
    if(!on){token++;clearTimeout(timer);key='';display=null;latest=null;}
  }
  function units(){const counts=el('finalPreviewCriterion').value==='counts';el('finalPreviewTarget').max=counts?'160000000':'57600';el('finalPreviewUnits').textContent=counts?'cuentas totales por detector':'segundos por detector';}
  function prepare(images,state){
    return images.map((result,j)=>{
      const n=Math.round(Math.sqrt(result.counts.length)),buffer=document.createElement('canvas');buffer.width=buffer.height=n;
      const out=buffer.getContext('2d'),im=out.createImageData(n,n);let peak=1;
      for(const v of result.counts)peak=Math.max(peak,v);
      for(let i=0;i<result.counts.length;i++){const v=Math.round(255*(result.counts[i]/peak)**.72);im.data[i*4]=im.data[i*4+1]=im.data[i*4+2]=v;im.data[i*4+3]=255;}
      out.putImageData(im,0,0);
      const meta=state?.['d'+(j+1)];
      const mean=(result.total/result.counts.length).toLocaleString('es-CL',{maximumSignificantDigits:3});
      const caption='Total: '+result.total.toLocaleString('es-CL')+' cuentas simuladas · '+clock(result.elapsed)+(result.mode==='counts'?' estimados':'')+
        '\nMedia: '+mean+' cuentas/píxel · matriz '+n+'×'+n+' completa'+
        (meta?' · a piel '+meta.effectiveDistance.toFixed(1)+' cm':'')+(!result.reached?' · objetivo no alcanzable dentro del modelo':'');
      return {buffer,caption,counts:result.counts,n};
    });
  }
  function draw(){
    if(!active()||!latest)return;
    latest.targets.forEach((target,j)=>{
      const canvas=target.canvas,frame=display?.[j];
      target.info.title='Media = total dividido por todos los píxeles de la imagen, incluidos fondo y ceros. No es una medida de un órgano ni de un píxel particular.';
      if(!frame){target.info.textContent=el('finalPreviewStatus').textContent;return;}
      const previous=painted.get(canvas);
      if(previous?.frame!==frame||previous.width!==canvas.width||previous.height!==canvas.height){
        const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=false;
        // Fully opaque buffers replace both detectors in one synchronous turn.
        // Never blank the visible canvas while a replacement is pending.
        ctx.drawImage(frame.buffer,0,0,canvas.width,canvas.height);
        window.GANTRY_PIXEL_GRID?.render(canvas,frame.counts,frame.n);
        painted.set(canvas,{frame,width:canvas.width,height:canvas.height});
      }
      target.info.textContent=frame.caption;
    });
  }
  function sync(study,targets,rate,state){
    if(window.GANTRY_EXAM?.blocked){token++;clearTimeout(timer);key='';return;}
    controls();if(!active())return;
    latest={targets,state};
    if(!window.GANTRY_LIVE.ready||targets.some(t=>!t.linearField)){token++;clearTimeout(timer);key='';el('finalPreviewStatus').textContent='Preparando proyecciones…'+(display?' Se mantiene la última imagen.':'');draw();return;}
    const model=study==='bone'?window.GANTRY_MDP:study==='mibi'?window.GANTRY_MIBI:null,m=model?.metadata();
    const mode=el('finalPreviewCriterion').value,target=Number(el('finalPreviewTarget').value);
    const nextKey=JSON.stringify([study,window.GANTRY_LIVE.settings,state?.state,rate,m,mode,target,noise]);
    if(nextKey!==key){
      key=nextKey;clearTimeout(timer);const current=++token;
      const fields=targets.map(t=>t.linearField);
      el('finalPreviewStatus').textContent='Calculando imagen final…'+(display?' Se mantiene la última imagen.':'');
      timer=setTimeout(async()=>{
        try{
          const options={mode,target,rate,model:model?study:null,start:m?.seconds||0,limit:model?(study==='bone'?10800:43200):Infinity,
            weights:model?(s=>study==='bone'?model.fractions(s,m.voidAt120).weights:model.fractions(s,m.protocol,m.voidEvery120).weights):null};
          const expected=predict(fields,options),images=[];
          for(let j=0;j<expected.length;j++){const image=await sample(expected[j],noise*104729+j*7919,()=>current!==token||window.GANTRY_EXAM?.blocked);if(!image||current!==token||window.GANTRY_EXAM?.blocked)return;images.push(image);}
          if(current!==token||window.GANTRY_EXAM?.blocked)return;display=prepare(images,state);
          el('finalPreviewStatus').textContent='Vista previa · posición fija · '+(m?'evolución del RF incluida · ':'')+'no inicia ni guarda una adquisición';draw();
        }catch(error){if(current===token){el('finalPreviewStatus').textContent=error.message;draw();}}
      },150);
    }
    draw();
  }
  function refresh(){key='';window.GANTRY_LIVE?.update(window.GANTRY.G);}
  function init(){if(!el('finalPreviewControls'))return;
    el('finalPreviewCriterion').onchange=()=>{const goal=window.GANTRY_BONE_ACQ?.suggestedGoal?.()||{counts:100000,time:60};el('finalPreviewTarget').value=String(goal[el('finalPreviewCriterion').value]);units();refresh();};
    el('finalPreviewTarget').oninput=refresh;el('finalPreviewTarget').onchange=refresh;
    el('finalPreviewNoise').onclick=()=>{noise++;refresh();};controls();
  }
  window.GANTRY_FINAL_PREVIEW={matrixChanged(previous,next){
    if(!active())return;
    const factor=n=>Math.max(1,(n/256)**2),input=el('finalPreviewTarget');
    input.value=String(Math.min(el('finalPreviewCriterion').value==='counts'?160000000:57600,Math.max(1,Math.round(Number(input.value)*factor(next)/factor(previous)))));
    units();key='';
  },cancel(){token++;clearTimeout(timer);key='';controls();},predict,sample,sync,controls,get active(){return active();}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
