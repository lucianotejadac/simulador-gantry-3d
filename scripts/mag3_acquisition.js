/* Basal MAG3: detector-coordinate accumulation, independent of anatomical ROI. */
(function(){
  'use strict';
  const data=window.GANTRY_MAG3_DATA,poses={},button=document.getElementById('injectMAG3');
  let session=null,panel=null,ready=false;
  const pixels=data.width*data.height,componentCount=data.scales.down.length;
  let pending=null;
  function load(){
    if(ready)return Promise.resolve();
    if(pending)return pending;
    button.disabled=true;button.textContent='Cargando MAG3…';
    pending=Promise.all([data.integral?Promise.resolve():(window.GANTRY_ASSETS?.fetch||fetch)(data.integralUrl).then(response=>{
      if(!response.ok)throw Error('Cinética MAG3 no disponible ('+response.status+')');return response.json();
    }).then(integral=>{data.integral=integral;}),...['down','up'].map(async name=>{
    if(poses[name])return;
    let source;
    if(data.urls){const response=await (window.GANTRY_ASSETS?.fetch||fetch)(data.urls[name]);if(!response.ok)throw Error('Serie MAG3 no disponible ('+response.status+')');source=response.body;}
    else source=new Blob([Uint8Array.from(atob(data.packed[name]),c=>c.charCodeAt(0))]).stream();
    const buffer=await new Response(source.pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
    const values=new Uint16Array(buffer);if(values.length!==componentCount*data.angles.length*pixels)throw Error('Serie MAG3 incompleta');
    poses[name]=Array.from({length:componentCount},(_,c)=>({width:data.width,height:data.height,scale:data.scales[name][c],window:1,
      frames:data.angles.map((_,a)=>values.subarray((c*data.angles.length+a)*pixels,(c*data.angles.length+a+1)*pixels))}));
  })]).then(()=>{ready=true;button.title='Iniciar basal de 20 minutos desde la posición actual';window.dispatchEvent(new Event('mag3ready'));})
    .catch(e=>{pending=null;button.title='No se pudo cargar MAG3: '+e.message;throw e;})
    .finally(()=>{button.disabled=false;button.textContent='inyectar MAG3';});
    return pending;
  }
  button.disabled=false;
  function coefficients(t){const position=Math.max(0,Math.min(data.duration,t))/data.dt,lo=Math.floor(position),hi=Math.min(data.integral.length-1,lo+1),f=position-lo;
    return data.integral[lo].map((v,c)=>v*(1-f)+data.integral[hi][c]*f);}
  function instantaneous(t){const a=coefficients(Math.max(0,t-.25)),b=coefficients(Math.min(data.duration,t+.25)),dt=Math.min(data.duration,t+.25)-Math.max(0,t-.25);return a.map((v,c)=>(b[c]-v)/Math.max(dt,1e-6));}
  function fields(geometry,n,cache){
    const key=JSON.stringify([geometry,n]);if(cache.key===key)return cache.fields;
    const angle=((geometry.rawAngle%360)+360)%360,position=angle/10,lo=Math.floor(position),pair={lo,hi:(lo+1)%36,mix:position-lo};
    cache.key=key;cache.fields=poses[geometry.arms==='up'?'up':'down'].map(p=>window.GANTRY_ICRP.field(p,pair,geometry.crop,n,n,geometry.flipX,geometry.flipY,geometry.metrics,geometry.blur*n/240).values);
    return cache.fields;
  }
  function mix(bases,weights){const out=new Float32Array(bases[0].length);for(let c=0;c<bases.length;c++)if(weights[c]>0)for(let i=0;i<out.length;i++)out[i]+=bases[c][i]*weights[c];return out;}
  function draw(canvas,values,n,gain=1){
    if(!canvas)return;const ctx=canvas.getContext('2d'),small=document.createElement('canvas');small.width=small.height=n;
    const sc=small.getContext('2d'),im=sc.createImageData(n,n),nonzero=Array.from(values).filter(v=>v>0).sort((a,b)=>a-b);
    const windowValue=Math.max(1,nonzero[Math.floor(nonzero.length*.995)]||1)/gain;
    for(let i=0;i<values.length;i++){const v=Math.round(255*Math.pow(Math.min(1,values[i]/windowValue),.72));im.data[i*4]=im.data[i*4+1]=im.data[i*4+2]=v;im.data[i*4+3]=255;}
    sc.putImageData(im,0,0);ctx.imageSmoothingEnabled=false;ctx.drawImage(small,0,0,canvas.width,canvas.height);
  }
  function poissonEvents(lambda,counts,frame,random=Math.random){
    const cdf=new Float64Array(lambda.length);let total=0;for(let i=0;i<lambda.length;i++)cdf[i]=total+=lambda[i];
    let count=0;if(total<=0)return 0;
    for(let event=-Math.log(1-random());event<total;event+=-Math.log(1-random())){
      const target=random()*total;let lo=0,hi=cdf.length-1;while(lo<hi){const mid=(lo+hi)>>>1;if(cdf[mid]>target)hi=mid;else lo=mid+1;}
      counts[lo]++;frame[lo]++;count++;
    }return count;
  }
  function accumulate(s,end){
    end=Math.min(end,data.duration);const bases=fields(s.geometry,s.n,s.cache);
    while(s.time<end-1e-9){
      const stop=Math.min(end,data.edges[s.frameIndex+1]),a=coefficients(s.time),b=coefficients(stop),lambda=mix(bases,a.map((v,c)=>(b[c]-v)*(s.activityFactor??1)));
      for(let i=0;i<lambda.length;i++)s.expected[i]+=lambda[i];
      s.total+=poissonEvents(lambda,s.counts,s.frameCounts,s.random);s.expectedTotal+=lambda.reduce((a,b)=>a+b,0);
      s.time=stop;
      if(stop>=data.edges[s.frameIndex+1]-1e-9){s.frames.push({start:data.edges[s.frameIndex],end:stop,counts:s.frameCounts.slice()});s.frameCounts.fill(0);s.frameIndex++;}
    }
    if(s.time>=data.duration){s.finished=true;s.paused=true;}
  }
  function advance(now=performance.now()){
    if(!session)return;const dt=Math.max(0,(now-session.lastClock)/1000);session.lastClock=now;
    if(!session.paused&&!session.finished&&dt>0)accumulate(session,session.time+dt*session.speed);
  }
  function stateChanged(G){
    syncPanel();if(!session||session.finished)return;advance();
    const geometry=window.GANTRY_LIVE.mag3Geometry(session.detector,G);
    if(JSON.stringify(geometry)!==JSON.stringify(session.geometry)){session.geometry=geometry;session.history.push({time:session.time,geometry});}
  }
  const html=`<style>
  :host{color-scheme:dark;font:11px Consolas,monospace;color:#b7cadd;display:flex;flex:1;min-height:0;flex-direction:column}:host([hidden]){display:none}:host-context(.recenter-active) canvas{cursor:crosshair}*{box-sizing:border-box}
  .bar{display:flex;gap:7px;align-items:center;flex-wrap:wrap;padding:5px 7px;border-bottom:1px solid #293b4a;flex:none;max-height:90px;overflow:auto}
  button,select,input{font:inherit}button,select{background:#172631;color:#d6e6ef;border:1px solid #42586b;padding:2px 5px}button:focus-visible,select:focus-visible{outline:2px solid #78d9a1}button:disabled{opacity:.5}label{display:flex;gap:4px;align-items:center}input{width:70px}#frame{max-width:145px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:7px;flex:1;min-height:0}article{border:1px solid #293b4a;background:#0b1218;display:flex;flex-direction:column;min-width:0;min-height:0}h2{font-size:11px;margin:4px 7px;font-weight:normal;color:#7fdfc8}canvas{display:block;width:100%;flex:1;min-height:0;object-fit:contain;background:black}small{font-size:10px;padding:3px 7px;color:#a9bdce;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  </style><div class="bar" aria-label="Controles MAG3 basal">
  <button id="pause" type="button">Pausar</button><button id="finish" type="button">Finalizar</button>
  <label>Velocidad <select id="speed"><option value="1">1×</option><option value="10">10×</option><option value="30">30×</option><option value="60">60×</option></select></label>
  <label>Ganancia <input id="gain" type="range" min=".3" max="3" step=".1" value="1"></label>
  <label>Cuadro <select id="frame"><option value="current">En curso</option></select></label>
  <button id="png" type="button">Guardar suma PNG</button><button id="export" type="button">Descargar JSON</button>
  <span id="detector"></span></div>
  <div class="grid"><article><h2>MAG3 BASAL · SUMA ACUMULADA</h2><canvas id="sum" width="512" height="512" aria-label="Suma acumulada MAG3"></canvas><small id="stats"></small></article>
  <article><h2>MAG3 BASAL · CUADRO DINÁMICO</h2><canvas id="current" width="512" height="512" aria-label="Cuadro dinámico MAG3"></canvas><small id="frameStatus"></small></article></div>`;
  function phase(t){return t<60?'Fase vascular / arterial':'Captación y excreción';}
  function labelTime(t){return Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');}
  function refresh(){
    window.GANTRY_ACTIVITY?.render();
    syncPanel();if(!session||!panel||panel.hidden)return;const s=session,d=panel.shadowRoot,g=s.geometry,gain=Number(d.getElementById('gain').value);
    d.getElementById('stats').textContent=phase(s.time)+' · '+labelTime(s.time)+' / 20:00 · '+s.total.toLocaleString('es-CL')+' cuentas'+(s.finished?' · Finalizada':s.paused?' · Pausada':' · Adquiriendo');
    d.getElementById('pause').textContent=s.paused?'Reanudar':'Pausar';d.getElementById('pause').disabled=s.finished;
    d.getElementById('detector').textContent='Cabezal '+s.detector+' · posterior al inicio · matriz '+s.n+' × '+s.n;
    const select=d.getElementById('frame');while(select.options.length<s.frames.length+1){const i=select.options.length-1,o=document.createElement('option');o.value=i;o.textContent=(i+1)+' · '+labelTime(s.frames[i].start)+'–'+labelTime(s.frames[i].end);select.append(o);}
    const f=select.value==='current'?null:s.frames[Number(select.value)];
    draw(d.getElementById('sum'),s.counts,s.n,gain);draw(d.getElementById('current'),f?f.counts:s.frameCounts,s.n,gain);
    d.getElementById('frameStatus').textContent=f?phase(f.start)+' · '+labelTime(f.start)+'–'+labelTime(f.end):s.finished?'Adquisición terminada; selecciona un cuadro guardado':phase(s.time)+' · cuadro '+(s.frameIndex+1)+' en curso';
  }
  function saveJSON(){const s=session,object={tracer:'99mTc-MAG3',study:'basal',administeredActivity:s.administeredActivity,arterialModel:data.arterial,duration:s.time,detector:s.detector,matrix:s.n,total:s.total,
    sum:Array.from(s.counts),frames:s.frames.map(f=>({...f,counts:Array.from(f.counts)})),partial:{start:data.edges[s.frameIndex],end:s.time,counts:Array.from(s.frameCounts)},
    geometryHistory:s.history,coordinateSystem:'Detector pixels, no motion correction',reference:data.reference};
    const url=URL.createObjectURL(new Blob([JSON.stringify(object)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='mag3_basal_adquisicion.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function ensurePanel(){
    if(panel)return;
    const style=document.createElement('style');
    style.textContent='.gantry-live.mag3-acquisition{height:clamp(280px,40vh,350px)}';document.head.append(style);
    panel=document.createElement('section');panel.id='mag3Acquisition';panel.hidden=true;
    panel.setAttribute('aria-label','Adquisición MAG3 basal');panel.attachShadow({mode:'open'});
    document.getElementById('gantryLive').append(panel);
  }
  function syncPanel(){
    if(!panel)return;
    const active=!!session&&window.GANTRY_LIVE.settings.study==='mag3';
    panel.hidden=!active;
    document.getElementById('gantryLive').classList.toggle('mag3-acquisition',active);
    document.querySelector('#gantryLive .gantry-live-grid').style.display=active?'none':'';
  }
  async function inject(){
    if(!ready){try{await load();}catch(error){document.getElementById('mag3Status').textContent='No se pudo cargar MAG3. Pulsa inyectar para reintentar.';console.error(error);return;}}
    if(session&&!session.finished){window.GANTRY_LIVE.setStudy('mag3');refresh();return;}
    ensurePanel();panel.shadowRoot.innerHTML=html;
    const G=window.GANTRY.G,g1=window.GANTRY_LIVE.mag3Geometry(1,G),g2=window.GANTRY_LIVE.mag3Geometry(2,G),distance=g=>Math.abs(((g.rawAngle-180+540)%360)-180),detector=distance(g1)<distance(g2)?1:2;
    const n=window.GANTRY_LIVE.settings.matrix,geometry=detector===1?g1:g2;
    session={detector,n,geometry,cache:{},time:0,lastClock:performance.now(),speed:1,paused:false,finished:false,
      administeredActivity:window.GANTRY_ACTIVITY?.metadata('mag3')||null,activityFactor:window.GANTRY_ACTIVITY?.factor('mag3')??1,
      counts:new Uint32Array(n*n),frameCounts:new Uint32Array(n*n),expected:new Float64Array(n*n),total:0,expectedTotal:0,frameIndex:0,frames:[],history:[{time:0,geometry}]};
    const d=panel.shadowRoot;
    for(const id of ['sum','current']){
      const canvas=d.getElementById(id);
      canvas.title='Recentrar: selecciona un punto para las cuentas siguientes; la suma previa se conserva';
      canvas.onclick=event=>window.GANTRY_LIVE.recenterFromCanvas(session.detector,event);
    }
    d.getElementById('pause').onclick=()=>{advance();session.paused=!session.paused;refresh();};
    d.getElementById('finish').onclick=()=>{advance();session.finished=true;session.paused=true;refresh();};
    d.getElementById('speed').onchange=e=>{advance();session.speed=Number(e.target.value);};
    d.getElementById('gain').oninput=refresh;d.getElementById('frame').onchange=refresh;d.getElementById('export').onclick=saveJSON;
    d.getElementById('png').onclick=()=>{const a=document.createElement('a');a.href=d.getElementById('sum').toDataURL();a.download='mag3_basal_suma.png';a.click();};
    window.GANTRY_LIVE.setStudy('mag3');document.getElementById('mag3Status').textContent='MAG3 basal · adquiriendo en cabezal '+detector;refresh();
  }
  const liveCaches=[{},{}];
  function renderHead(target,G){
    const g=window.GANTRY_LIVE.mag3Geometry(target.n,G),n=window.GANTRY_LIVE.settings.matrix,time=session?session.time:0;
    const factor=session?.activityFactor??window.GANTRY_ACTIVITY?.factor('mag3')??1;
    const values=mix(fields(g,n,liveCaches[target.n-1]),instantaneous(time).map(v=>v*factor));draw(target.canvas,values,n);
    const expectedRate=values.reduce((a,b)=>a+b,0);
    target.info.textContent='DETECTOR '+target.n+' · MAG3 basal · '+Math.round(g.rawAngle)+'° · '+labelTime(time)+' · '+Math.round(expectedRate).toLocaleString('es-CL')+' cuentas/s esperadas';
    return {detector:target.n,rawAngle:g.rawAngle,angle:g.rawAngle,study:'mag3',arms:G.arms,crop:g.crop,expectedRate};
  }
  button.onclick=inject;
  window.GANTRY_MAG3={load,get loading(){return load();},get ready(){return ready;},inject,stateChanged,renderHead,
    get state(){return session&&{time:session.time,total:session.total,expectedTotal:session.expectedTotal,detector:session.detector,frames:session.frames.length,paused:session.paused,finished:session.finished,matrix:session.n,administeredActivity:session.administeredActivity};},
    // Pure numerical entry points used by offline acquisition tests.
    coefficients,fields,mix,accumulate,poissonEvents,data};
  setInterval(()=>{if(!session)return;
    advance();refresh();if(window.GANTRY_LIVE.settings.study==='mag3')window.GANTRY_LIVE.update(window.GANTRY.G);
    document.getElementById('mag3Status').textContent='MAG3 basal · '+labelTime(session.time)+' · '+session.total.toLocaleString('es-CL')+' cuentas'+(session.finished?' · finalizada':session.paused?' · pausada':'');
  },100);
})();
