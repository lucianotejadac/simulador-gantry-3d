/* Compare independent event intervals, never overlapping persistence windows.
   Two Poisson rates condition on the total count to give a binomial test:
   https://stat.ethz.ch/R-manual/R-patched/library/stats/html/poisson.test.html
   Equal-tailed two-sided test; alpha=.025 per detector (Bonferroni, two tests).
   One fixed-duration comparison per adjustment, without repeated significance peeking. */
(function(){
  'use strict';
  const alpha=.025,seconds=5,minSeconds=1,settleMs=350;
  function logGamma(z){
    const c=[676.5203681218851,-1259.1392167224028,771.3234287776531,-176.6150291621406,
      12.507343278686905,-.13857109526572012,9.984369578019572e-6,1.5056327351493116e-7];
    if(z<.5)return Math.log(Math.PI)-Math.log(Math.sin(Math.PI*z))-logGamma(1-z);
    z--;let x=.99999999999980993;
    for(let i=0;i<c.length;i++)x+=c[i]/(z+i+1);
    const t=z+7.5;return .5*Math.log(2*Math.PI)+(z+.5)*Math.log(t)-t+Math.log(x);
  }
  function betaFraction(a,b,x){
    const floor=1e-300,safe=v=>Math.abs(v)<floor?floor:v;
    let c=1,d=1/safe(1-(a+b)*x/(a+1)),h=d;
    for(let m=1;m<=1000;m++){
      let v=m*(b-m)*x/((a+2*m-1)*(a+2*m));
      d=1/safe(1+v*d);c=safe(1+v/c);h*=d*c;
      v=-(a+m)*(a+b+m)*x/((a+2*m)*(a+2*m+1));
      d=1/safe(1+v*d);c=safe(1+v/c);const delta=d*c;h*=delta;
      if(Math.abs(delta-1)<3e-12)return h;
    }
    return NaN; // Never declare a change if numerical convergence fails.
  }
  function beta(x,a,b){
    if(x<=0)return 0;if(x>=1)return 1;
    const t=Math.exp(logGamma(a+b)-logGamma(a)-logGamma(b)+a*Math.log(x)+b*Math.log1p(-x));
    return x<(a+1)/(a+b+2)?t*betaFraction(a,b,x)/a:1-t*betaFraction(b,a,1-x)/b;
  }
  function compare(before,after){
    const n=before.counts+after.counts,k=after.counts;
    if(!(before.seconds>0&&after.seconds>0)||!n)return {kind:'insufficient',before,after};
    const probability=after.seconds/(before.seconds+after.seconds);
    const lower=k===n?1:beta(1-probability,n-k,k+1);
    const upper=k===0?1:beta(probability,k,n-k+1);
    const p=Math.max(0,Math.min(1,2*Math.min(lower,upper)));
    const r0=before.counts/before.seconds,r1=after.counts/after.seconds;
    return {kind:!Number.isFinite(p)?'insufficient':p<alpha?(r1>r0?'increase':'decrease'):'noise',
      before,after,p,rateBefore:r0,rateAfter:r1,percent:r0?100*(r1/r0-1):null};
  }
  const sum=blocks=>blocks.reduce((a,b)=>({counts:a.counts+b.counts,seconds:a.seconds+b.seconds}),{counts:0,seconds:0});
  class Tracker {
    constructor(){this.blocks=[];this.last=null;this.result=null;this.pending=null;}
    unavailable(){this.last=null;this.blocks=[];}
    observe(sample,context,now){
      if(this.context!==context){this.context=context;this.unavailable();this.pending=null;this.result=null;}
      if(!sample||!Number.isFinite(sample.seconds)||!Number.isSafeInteger(sample.counts))return;
      const previous=this.last;
      if(previous?.id===sample.id&&previous.seconds===sample.seconds)return;
      this.last={...sample,at:now};
      if(previous&&now-previous.at>1000){this.blocks=[];return;}
      let block;
      if(previous?.id===sample.id)block={counts:sample.counts-previous.counts,seconds:sample.seconds-previous.seconds};
      else {this.blocks=[];if(sample.seconds<=.3)block={counts:sample.counts,seconds:sample.seconds};}
      if(!block||block.seconds<=0||block.counts<0)return;
      const p=this.pending;
      if(p&&now-p.at<settleMs){this.blocks=[];return;}
      this.blocks.push(block);
      // Keep whole disjoint intervals: never split an observed integer count.
      while(this.blocks.length>1&&sum(this.blocks).seconds-this.blocks[0].seconds>=seconds)this.blocks.shift();
      if(p){
        p.after.counts+=block.counts;p.after.seconds+=block.seconds;
        if(p.after.seconds+1e-9>=p.before.seconds){this.result=compare(p.before,p.after);this.pending=null;}
      }
    }
    changed(now){
      const before=this.pending?.before||(this.last&&now-this.last.at<1000?sum(this.blocks):null);
      this.blocks=[];this.result=null;
      if(!before||before.seconds<minSeconds){this.pending=null;this.result={kind:'baseline'};return;}
      this.pending={before,after:{counts:0,seconds:0},at:now};
    }
  }
  const trackers=[new Tracker(),new Tracker()];
  function active(){const live=window.GANTRY_LIVE;return !!live&&live.signal.mode==='live';}
  function observe(now){
    const live=window.GANTRY_LIVE;
    const context=JSON.stringify([live?.settings.study,live?.signal.mode,window.GANTRY_PATIENT?.id]);
    trackers.forEach((tracker,i)=>{
      if(!active()){tracker.unavailable();tracker.context=null;tracker.result=null;tracker.pending=null;return;}
      if(live.ready===false){tracker.unavailable();return;}
      tracker.observe(live.state?.['d'+(i+1)]?.eventSample,context,now);
    });
  }
  function changed(now){observe(now);if(active())trackers.forEach(t=>t.changed(now));}
  const format=n=>n.toLocaleString('es-CL',{maximumFractionDigits:2});
  // Reuse each detector's disclosure so live repaints preserve its open state.
  const disclosures=new WeakMap();
  function render(host,now){
    observe(now);
    const display=document.getElementById(host.id.replace('liveInfo','liveRate'))||host;
    display.querySelector('.live-count-comparison')?.remove();
    if(!active())return false;
    const tracker=trackers[host.id==='liveInfoD1'?0:1],result=tracker.result,pending=tracker.pending;
    // Do not attach random arrows to the continuously changing live count.
    host.querySelectorAll('.value-change-flash').forEach(span=>span.replaceWith(document.createTextNode(span.textContent)));
    if(!result&&!pending)return true;
    let box=disclosures.get(host);
    if(!box){
      box=document.createElement('details');box.className='live-count-comparison';
      box.append(document.createElement('summary'),document.createElement('div'));
      disclosures.set(host,box);
    }
    const summary=box.firstElementChild,body=box.lastElementChild,lines=[];
    const line=text=>lines.push(text);
    let compact,label;box.removeAttribute('title');
    if(pending){
      compact='…';label='Comparando tasa de cuentas';
      box.dataset.kind='pending';line('Comparando tasa de cuentas…');
      line('Promedio anterior: '+format(pending.before.counts/pending.before.seconds)+' cuentas/s');
      line('Intervalo posterior: '+format(pending.after.seconds)+' / '+format(pending.before.seconds)+' s');
    }else if(result.kind==='baseline'){
      compact='—';label='Sin promedio anterior suficiente';
      box.dataset.kind='baseline';line('Sin promedio anterior suficiente');line('Deja estabilizar la vista antes del próximo ajuste.');
    }else{
      box.dataset.kind=result.kind;
      label=result.kind==='noise'?'Sin diferencia estadísticamente detectable':result.kind==='increase'?
        'Aumento estadísticamente detectable':result.kind==='decrease'?'Descenso estadísticamente detectable':'Sin cuentas suficientes para comparar';
      const percent=result.percent!==undefined&&result.percent!==null?
        (result.percent>0?'+':'')+format(result.percent)+' %':null;
      compact=result.kind==='noise'?'≈':result.kind==='increase'?'⬆':result.kind==='decrease'?'⇩':'—';
      if((result.kind==='increase'||result.kind==='decrease')&&percent!==null)compact+=' '+percent;
      line(result.kind==='noise'?'≈ Compatible con fluctuación estadística':result.kind==='increase'?
        '⬆ Aumento estadísticamente detectable':result.kind==='decrease'?'⇩ Descenso estadísticamente detectable':'Sin cuentas suficientes para comparar');
      line('Tasas medias · cuentas/s');
      line('Promedio anterior: '+format(result.before.counts/result.before.seconds));
      line('Promedio posterior: '+format(result.after.counts/result.after.seconds));
      if(percent!==null)line('Cambio: '+percent);
      box.title='Último ajuste · intervalos independientes: '+format(result.before.seconds)+' s antes y '+format(result.after.seconds)+
        ' s después. Prueba bilateral de tasas Poisson (binomial condicional), p='+
        (Number.isFinite(result.p)?result.p.toPrecision(3):'no calculable')+'. Umbral p < 0,025 por detector (dos detectores, error conjunto ≤ 5% por ajuste). '+
        'Se compara la tasa total; no la media por píxel. Un cambio detectable no demuestra relevancia clínica ni su causa.';
    }
    if(summary.textContent!==compact)summary.textContent=compact;
    summary.title=label+' · Mostrar u ocultar detalles';
    summary.setAttribute('aria-label',label+(compact.includes('%')?' · '+compact:'')+' · Detalles');
    const content=lines.join('\n');
    if(body.textContent!==content)body.textContent=content;
    // Anchor beside the compact rate; older layouts keep the inline placement.
    const br=display===host?host.querySelectorAll('br')[1]:null;if(br)br.after(box);else display.append(box);
    return true;
  }
  window.GANTRY_COUNT_FEEDBACK={changed,render,active,Tracker,compare};
})();
