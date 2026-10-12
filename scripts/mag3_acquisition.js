/* Basal MAG3: detector-coordinate accumulation, independent of anatomical ROI. */
(function(){
  'use strict';
  const data=window.GANTRY_MAG3_DATA,poses={},button=document.getElementById('injectMAG3');
  let session=null,panel=null,ready=false;
  const pixels=data.width*data.height;
  const loading=Promise.all(['down','up'].map(async name=>{
    const bytes=Uint8Array.from(atob(data.packed[name]),c=>c.charCodeAt(0));
    const buffer=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
    const values=new Uint16Array(buffer);if(values.length!==10*data.angles.length*pixels)throw Error('Serie MAG3 incompleta');
    poses[name]=Array.from({length:10},(_,c)=>({width:data.width,height:data.height,scale:data.scales[name][c],window:1,
      frames:data.angles.map((_,a)=>values.subarray((c*data.angles.length+a)*pixels,(c*data.angles.length+a+1)*pixels))}));
  })).then(()=>{ready=true;button.disabled=false;button.title='Iniciar basal de 20 minutos desde la posición actual';window.dispatchEvent(new Event('mag3ready'));})
    .catch(e=>{button.title='No se pudo cargar MAG3: '+e.message;console.error(e);});
  function coefficients(t){const position=Math.max(0,Math.min(data.duration,t))/data.dt,lo=Math.floor(position),hi=Math.min(data.integral.length-1,lo+1),f=position-lo;
    return data.integral[lo].map((v,c)=>v*(1-f)+data.integral[hi][c]*f);}
  function instantaneous(t){const a=coefficients(Math.max(0,t-.25)),b=coefficients(Math.min(data.duration,t+.25)),dt=Math.min(data.duration,t+.25)-Math.max(0,t-.25);return a.map((v,c)=>(b[c]-v)/Math.max(dt,1e-6));}
  function fields(geometry,n,cache){
    const key=JSON.stringify([geometry,n]);if(cache.key===key)return cache.fields;
    const angle=((geometry.rawAngle%360)+360)%360,position=angle/10,lo=Math.floor(position),pair={lo,hi:(lo+1)%36,mix:position-lo};
    cache.key=key;cache.fields=poses[geometry.arms==='up'?'up':'down'].map(p=>window.GANTRY_ICRP.field(p,pair,geometry.crop,n,n,geometry.flipX,geometry.flipY,geometry.metrics,geometry.blur*n/240).values);
    return cache.fields;
  }
  function mix(bases,weights){const out=new Float32Array(bases[0].length);for(let c=0;c<10;c++)if(weights[c]>0)for(let i=0;i<out.length;i++)out[i]+=bases[c][i]*weights[c];return out;}
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
      const stop=Math.min(end,data.edges[s.frameIndex+1]),a=coefficients(s.time),b=coefficients(stop),lambda=mix(bases,a.map((v,c)=>b[c]-v));
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
    if(!session||session.finished)return;advance();
    const geometry=window.GANTRY_LIVE.mag3Geometry(session.detector,G);
    if(JSON.stringify(geometry)!==JSON.stringify(session.geometry)){session.geometry=geometry;session.history.push({time:session.time,geometry});}
  }
  const html=`<style>
  :host{color-scheme:dark;font-family:system-ui;background:#0b1420;color:#edf4fa}*{box-sizing:border-box}.screen{padding:16px}h1{font-size:25px;margin:0}p{color:#aec1d1;line-height:1.5}button,select,input{font:inherit}button,select{background:#203a4d;color:#edf4fa;border:1px solid #4b6b82;border-radius:6px;padding:8px}.bar{display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin:18px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}canvas{width:100%;height:auto;background:black}article{border:1px solid #294557;border-radius:8px;padding:14px}h2{font-size:16px;margin-top:0}.stats{color:#7fdfc8;font-size:20px}small{color:#a9bdce}.notice{border-left:2px solid #7fdfc8;padding-left:12px}@media(max-width:650px){.grid{grid-template-columns:1fr}}</style><div class="screen">
  <button id="back" type="button">Volver a vista 3D</button>
  <h1>MAG3 · adquisición basal</h1><p id="detector"></p><div class="stats" id="stats"></div>
  <div class="bar"><button id="pause">Pausar</button><button id="finish">Finalizar</button><label>Velocidad <select id="speed"><option value="1">1×</option><option value="10">10×</option><option value="30">30×</option><option value="60">60×</option></select></label><label>Ganancia <input id="gain" type="range" min=".3" max="3" step=".1" value="1"></label></div>
  <div class="grid"><article><h2>Suma de toda la adquisición</h2><canvas id="sum" width="512" height="512"></canvas></article><article><h2>Cuadro dinámico</h2><select id="frame"><option value="current">En curso</option></select><canvas id="current" width="512" height="512"></canvas><small id="frameStatus"></small></article></div>
  <p id="geometry"></p><p class="notice">Se suman todos los eventos recibidos por el cabezal elegido al inyectar. Moverlo cambia las cuentas siguientes y deja intactas las anteriores. No se recorta una ROI renal ni se corrige el movimiento.</p>
  <p>Basal de 20 min: cuadros de 2 s hasta 1 min, 10 s hasta 5 min y 30 s después. La matriz queda fijada al inyectar; los demás ajustes y movimientos actúan sobre las cuentas nuevas. Imagen en escala automática para visualizar; las cuentas guardadas son enteras sin reescalado.</p>
  <div class="bar"><button id="png">Guardar suma PNG</button><button id="export">Descargar adquisición JSON</button></div><small>ICRP 145 · cinética MAG3 sintética · sin poscaptopril. Puedes volver a la vista 3D mientras continúa la adquisición.</small></div>`;
  function labelTime(t){return Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');}
  function refresh(){
    if(!session||!panel||panel.hidden)return;const s=session,d=panel.shadowRoot,g=s.geometry,gain=Number(d.getElementById('gain').value);
    d.getElementById('stats').textContent=labelTime(s.time)+' / 20:00 · '+s.total.toLocaleString('es-CL')+' cuentas'+(s.finished?' · Finalizada':s.paused?' · Pausada':' · Adquiriendo');
    d.getElementById('pause').textContent=s.paused?'Reanudar':'Pausar';d.getElementById('pause').disabled=s.finished;
    d.getElementById('detector').textContent='Cabezal '+s.detector+' · posterior al inicio · matriz '+s.n+' × '+s.n;
    d.getElementById('geometry').textContent='Ahora: '+Math.round(g.rawAngle)+'° · '+g.collimator+' · '+g.energyCenter+' keV · zoom '+g.zoom+'× · camilla '+g.tableZ+' cm. Cuentas esperadas: '+Math.round(s.expectedTotal).toLocaleString('es-CL');
    const select=d.getElementById('frame');while(select.options.length<s.frames.length+1){const i=select.options.length-1,o=document.createElement('option');o.value=i;o.textContent=(i+1)+' · '+labelTime(s.frames[i].start)+'–'+labelTime(s.frames[i].end);select.append(o);}
    const f=select.value==='current'?null:s.frames[Number(select.value)];
    draw(d.getElementById('sum'),s.counts,s.n,gain);draw(d.getElementById('current'),f?f.counts:s.frameCounts,s.n,gain);
    d.getElementById('frameStatus').textContent=f?'Cuadro guardado sin corrección de movimiento':s.finished?'Adquisición terminada; selecciona un cuadro guardado':'Cuadro '+(s.frameIndex+1)+' en curso';
  }
  function saveJSON(){const s=session,object={tracer:'99mTc-MAG3',study:'basal',duration:s.time,detector:s.detector,matrix:s.n,total:s.total,
    sum:Array.from(s.counts),frames:s.frames.map(f=>({...f,counts:Array.from(f.counts)})),partial:{start:data.edges[s.frameIndex],end:s.time,counts:Array.from(s.frameCounts)},
    geometryHistory:s.history,coordinateSystem:'Detector pixels, no motion correction',reference:data.reference};
    const url=URL.createObjectURL(new Blob([JSON.stringify(object)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='mag3_basal_adquisicion.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const viewButton=document.createElement('button');
  viewButton.id='viewMAG3';viewButton.type='button';viewButton.className='live-setting';
  viewButton.textContent='Ver adquisición MAG3';viewButton.hidden=true;
  viewButton.setAttribute('aria-controls','mag3Screen');viewButton.setAttribute('aria-expanded','false');
  button.insertAdjacentElement('afterend',viewButton);
  function ensurePanel(){
    if(panel)return;
    panel=document.createElement('section');panel.id='mag3Screen';panel.hidden=true;
    panel.setAttribute('aria-label','Adquisición MAG3 basal');
    panel.style.cssText='position:absolute;inset:0;z-index:20;overflow:auto;background:#0b1420;';
    panel.attachShadow({mode:'open'});
    for(const event of ['pointerdown','pointerup','click','wheel','keydown'])panel.addEventListener(event,e=>e.stopPropagation());
    document.getElementById('g3dStage').append(panel);
  }
  function showPanel(){
    if(!session)return;panel.hidden=false;viewButton.hidden=false;
    viewButton.setAttribute('aria-expanded','true');refresh();panel.shadowRoot.getElementById('back').focus();
  }
  function hidePanel(){
    panel.hidden=true;viewButton.setAttribute('aria-expanded','false');viewButton.focus();
  }
  viewButton.onclick=showPanel;
  function inject(){
    if(!ready)return;if(session&&!session.finished){showPanel();return;}
    ensurePanel();panel.shadowRoot.innerHTML=html;
    const G=window.GANTRY.G,g1=window.GANTRY_LIVE.mag3Geometry(1,G),g2=window.GANTRY_LIVE.mag3Geometry(2,G),distance=g=>Math.abs(((g.rawAngle-180+540)%360)-180),detector=distance(g1)<distance(g2)?1:2;
    const n=window.GANTRY_LIVE.settings.matrix,geometry=detector===1?g1:g2;
    session={detector,n,geometry,cache:{},time:0,lastClock:performance.now(),speed:1,paused:false,finished:false,
      counts:new Uint32Array(n*n),frameCounts:new Uint32Array(n*n),expected:new Float64Array(n*n),total:0,expectedTotal:0,frameIndex:0,frames:[],history:[{time:0,geometry}]};
    const d=panel.shadowRoot;
    d.getElementById('back').onclick=hidePanel;
    d.getElementById('pause').onclick=()=>{advance();session.paused=!session.paused;refresh();};
    d.getElementById('finish').onclick=()=>{advance();session.finished=true;session.paused=true;refresh();};
    d.getElementById('speed').onchange=e=>{advance();session.speed=Number(e.target.value);};
    d.getElementById('gain').oninput=refresh;d.getElementById('frame').onchange=refresh;d.getElementById('export').onclick=saveJSON;
    d.getElementById('png').onclick=()=>{const a=document.createElement('a');a.href=d.getElementById('sum').toDataURL();a.download='mag3_basal_suma.png';a.click();};
    window.GANTRY_LIVE.setStudy('mag3');document.getElementById('mag3Status').textContent='MAG3 basal · adquiriendo en cabezal '+detector;showPanel();
  }
  const liveCaches=[{},{}];
  function renderHead(target,G){
    const g=window.GANTRY_LIVE.mag3Geometry(target.n,G),n=window.GANTRY_LIVE.settings.matrix,time=session?session.time:0;
    const values=mix(fields(g,n,liveCaches[target.n-1]),instantaneous(time));draw(target.canvas,values,n);
    target.info.textContent='DETECTOR '+target.n+' · MAG3 basal · '+Math.round(g.rawAngle)+'° · '+labelTime(time)+' · señal esperada';
    return {detector:target.n,rawAngle:g.rawAngle,angle:g.rawAngle,study:'mag3',arms:G.arms,crop:g.crop,expectedRate:values.reduce((a,b)=>a+b,0)};
  }
  button.onclick=inject;
  window.GANTRY_MAG3={loading,get ready(){return ready;},inject,stateChanged,renderHead,
    get state(){return session&&{time:session.time,total:session.total,expectedTotal:session.expectedTotal,detector:session.detector,frames:session.frames.length,paused:session.paused,finished:session.finished,matrix:session.n};},
    // Pure numerical entry points used by offline acquisition tests.
    coefficients,fields,mix,accumulate,poissonEvents,data};
  setInterval(()=>{if(!session)return;
    advance();refresh();if(window.GANTRY_LIVE.settings.study==='mag3')window.GANTRY_LIVE.update(window.GANTRY.G);
    document.getElementById('mag3Status').textContent='MAG3 basal · '+labelTime(session.time)+' · '+session.total.toLocaleString('es-CL')+' cuentas'+(session.finished?' · finalizada':session.paused?' · pausada':'');
  },100);
})();
