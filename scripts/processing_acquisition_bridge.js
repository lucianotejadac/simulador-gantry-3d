/* Same-origin commands from the native processing fields to the existing engine. */
(function(){
  'use strict';
  const el=id=>document.getElementById(id);
  function attach(frame){
    let preparing=false,owned=null,sending=false,finalSent=null;
    const live=()=>window.GANTRY_LIVE,engine=()=>window.GANTRY_BONE_ACQ;
    const post=(data,transfer=[])=>frame.contentWindow.postMessage({...data,version:1},location.origin,transfer);
    const otherBusy=()=>engine().active||window.GANTRY_MAG3?.state&&!window.GANTRY_MAG3.state.finished;
    function defaults(kind){
      const s=live().settings,mdp=window.GANTRY_MDP.metadata();
      return {kind,matrix:kind==='whole'?Math.max(128,Math.min(256,s.matrix)):s.matrix,zoom:s.zoom,collimator:s.collimator,energyCenter:140,windowWidth:20,
        activityMci:mdp.activityMBq/37,minutes:Math.min(179.99,mdp.seconds/60),mode:'counts',target:400000,
        velocity:10,names:['Detector 1','Detector 2'],
        geometry:el('g3dHud').textContent.trim(),...(s.study==='bone'?{energyCenter:s.energyCenter,windowWidth:s.windowWidth}:{})};
    }
    const change=(id,value)=>{const node=el(id);node.value=String(value);node.dispatchEvent(new Event('change',{bubbles:true}));};
    async function start(raw,instant){
      const c=window.GANTRY_PROCESSING_CONFIG.validate(raw);
      if(preparing||otherBusy())throw Error('Finaliza la adquisición activa antes de iniciar otra.');
      if(window.GANTRY_EXAM?.blocked)throw Error('Examen cancelado por colisión. Libera el contacto y reinicia desde el gantry.');
      if(window.GANTRY_AUTO?.busy)throw Error('Espera a que termine el posicionamiento automático.');
      preparing=true;
      try{
        if(live().settings.study!=='bone')live().setStudy('bone');
        if(live().settings.study!=='bone')throw Error('No se pudo seleccionar el estudio óseo.');
        live().setSignalMode('live');live().setMatrix(c.matrix);live().setZoom(c.zoom);
        live().setCollimator(c.collimator);live().setEnergyCenter(c.energyCenter);live().setWindowWidth(c.windowWidth);
        change('mdpUnit','mCi');change('mdpActivity',c.activityMci);change('mdpMinutes',c.minutes);
        live().update(window.GANTRY.G);
        const deadline=performance.now()+45000;
        while(!live().ready||!engine().readyForProcessing){
          if(live().loadError||performance.now()>deadline)throw Error('No se pudieron preparar las proyecciones. Reintenta cuando termine la carga.');
          if(!window.GANTRY_PROCESSING.active)throw Error('Inicio cancelado al salir de procesamiento.');
          await new Promise(resolve=>setTimeout(resolve,100));
        }
        if(!window.GANTRY_PROCESSING.active)throw Error('Inicio cancelado al salir de procesamiento.');
        owned=engine().startConfigured(c);
        if(instant)engine().controlFromProcessing('instant').catch(error=>post({type:'GANTRY_ACQUIRE_ERROR',error:error.message}));
        return owned;
      }finally{preparing=false;}
    }
    window.addEventListener('message',async event=>{
      if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.version!==1||!window.GANTRY_PROCESSING.active)return;
      const d=event.data;
      if(!['GANTRY_ACQUIRE_CONFIG','GANTRY_ACQUIRE_START','GANTRY_ACQUIRE_ACTION'].includes(d.type))return;
      try{
        if(d.type==='GANTRY_ACQUIRE_CONFIG'){
          if(!['static','whole'].includes(d.kind))throw Error('Tipo de adquisición no válido.');
          if(preparing||otherBusy())throw Error('Finaliza la adquisición activa antes de preparar otra.');
          post({type:'GANTRY_ACQUIRE_CONFIG',request:d.request,config:defaults(d.kind)});
        }else if(d.type==='GANTRY_ACQUIRE_START'){
          const id=await start(d.config,d.instant===true);
          post({type:'GANTRY_ACQUIRE_STARTED',request:d.request,id});
        }else{
          if(!owned||engine().state?.id!==owned||d.id!==owned)throw Error('Esta adquisición ya no es la actual.');
          if(!['pause','stop','fast','instant','save'].includes(d.action))throw Error('Acción no válida.');
          await engine().controlFromProcessing(d.action);
          post({type:'GANTRY_ACQUIRE_ACTION_DONE',request:d.request,action:d.action});
        }
      }catch(error){post({type:'GANTRY_ACQUIRE_ERROR',request:d.request,error:error.message});}
    });
    // Thumbnails are only for progress display. Final DICOM keeps original counts.
    const previews=[document.createElement('canvas'),document.createElement('canvas')];
    setInterval(()=>{
      if(!owned||!window.GANTRY_PROCESSING.active||sending)return;
      const state=engine().state;if(!state||state.id!==owned||state.finished&&finalSent===owned)return;
      sending=true;
      try{
        const images=previews.map((out,i)=>{
          const source=el('boneAcqD'+(i+1));out.width=128;out.height=Math.round(128*(state.height||state.matrix)/state.matrix);
          const ctx=out.getContext('2d');ctx.drawImage(source,0,0,out.width,out.height);
          return {width:out.width,height:out.height,rgba:ctx.getImageData(0,0,out.width,out.height).data.buffer};
        });
        post({type:'GANTRY_ACQUIRE_PROGRESS',state,images,message:el('boneAcqStatus').textContent},images.map(i=>i.rgba));
        if(state.finished)finalSent=owned;
      }finally{sending=false;}
    },500);
  }
  window.GANTRY_PROCESSING_ACQUISITION={attach};
})();
