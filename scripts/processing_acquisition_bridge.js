/* Same-origin commands from the native processing fields to the existing engine. */
(function(){
  'use strict';
  const el=id=>document.getElementById(id);
  function attach(frame){
    let preparing=false,owned=null,sending=false,finalSent=null,lastPosition='',lastAdministration='';
    const live=()=>window.GANTRY_LIVE,engine=()=>window.GANTRY_BONE_ACQ;
    const post=(data,transfer=[])=>frame.contentWindow.postMessage({...data,version:1},location.origin,transfer);
    const otherBusy=()=>engine().active||window.GANTRY_MAG3?.state&&!window.GANTRY_MAG3.state.finished;
    const cameraSetters=[['matrix','setMatrix'],['zoom','setZoom'],['collimator','setCollimator'],['energyCenter','setEnergyCenter'],['windowWidth','setWindowWidth']];
    let independentCamera=null,previewing=false;
    function retainLiveCamera(){
      if(!independentCamera)independentCamera={study:live().settings.study,...Object.fromEntries(cameraSetters.map(([key])=>[key,live().settings[key]]))};
    }
    function restoreLiveCamera(){
      if(!independentCamera||previewing||preparing||otherBusy())return;
      const settings=independentCamera;independentCamera=null;
      if(settings.study!==live().settings.study)return;
      for(const [key,setter] of cameraSetters)if(live().settings[key]!==settings[key])live()[setter](settings[key]);
      live().clearPersistence?.();live().update(window.GANTRY.G);
    }
    function releasePreview(){previewing=false;restoreLiveCamera();}
    // Leaving the processor ends the temporary preview, even while its iframe is hidden.
    window.GANTRY_PROCESSING_ACQUISITION.releasePreview=releasePreview;
    function positionState(){
      const declared=window.GANTRY_ACQUISITION||{};
      return {decubitus:declared.decubitus==='prone'?'prone':'supine',entry:declared.headFirst?'headIn':'headOut',
        locked:!!preparing||!!otherBusy()||!!window.GANTRY_EXAM?.blocked};
    }
    function defaults(kind){
      const s=live().settings,mdp=window.GANTRY_MDP.metadata();
      return {kind,matrix:kind==='whole'?Math.max(128,Math.min(256,s.matrix)):s.matrix,zoom:s.zoom,collimator:s.collimator,energyCenter:140,windowWidth:20,
        activityMci:mdp.activityMBq/37,minutes:Math.min(179.99,mdp.seconds/60),mode:'counts',target:400000,
        velocity:10,contours:el('boneAcqContours')?.value||'auto',names:['Detector 1','Detector 2'],phases:[{frames:60,seconds:1}],
        position:positionState(),geometry:el('g3dHud').textContent.trim(),...(s.study==='bone'?{energyCenter:s.energyCenter,windowWidth:s.windowWidth}:{})};
    }
    const change=(id,value)=>{const node=el(id);node.value=String(value);node.dispatchEvent(new Event('change',{bubbles:true}));};
    function applyCamera(c){
      if(live().settings.study!=='bone')live().setStudy('bone');
      if(live().settings.study!=='bone')throw Error('No se pudo seleccionar el estudio óseo.');
      retainLiveCamera();
      if(live().signal.mode!=='live')live().setSignalMode('live');
      for(const [key,setter] of cameraSetters){
        if(live().settings[key]!==c[key])live()[setter](c[key]);
      }
      live().update(window.GANTRY.G);
    }
    async function start(raw,instant){
      const c=window.GANTRY_PROCESSING_CONFIG.validate(raw);
      if(preparing||otherBusy())throw Error('Finaliza la adquisición activa antes de iniciar otra.');
      if(window.GANTRY_EXAM?.blocked)throw Error('Examen cancelado por colisión. Libera el contacto y reinicia desde el gantry.');
      if(window.GANTRY_AUTO?.busy)throw Error('Espera a que termine el posicionamiento automático.');
      if(window.GANTRY_RF?.pending('bone'))throw Error('Pulsa Inyectar en la vista 3D antes de adquirir.');
      preparing=true;
      try{
        applyCamera(c);
        if(window.GANTRY_RF){
          const m=window.GANTRY_MDP.metadata();c.activityMci=m.activityMBq/37;c.minutes=Math.min(179.99,m.seconds/60);
        }else{change('mdpUnit','mCi');change('mdpActivity',c.activityMci);change('mdpMinutes',c.minutes);}
        live().update(window.GANTRY.G);
        const deadline=performance.now()+45000;
        while(!live().ready||!engine().readyForProcessing){
          if(live().loadError||performance.now()>deadline)throw Error('No se pudieron preparar las proyecciones. Reintenta cuando termine la carga.');
          if(!window.GANTRY_PROCESSING.active)throw Error('Inicio cancelado al salir de procesamiento.');
          await new Promise(resolve=>setTimeout(resolve,100));
        }
        if(!window.GANTRY_PROCESSING.active)throw Error('Inicio cancelado al salir de procesamiento.');
        owned=engine().startConfigured(c);
        previewing=false;
        if(instant)engine().controlFromProcessing('instant').catch(error=>post({type:'GANTRY_ACQUIRE_ERROR',error:error.message}));
        return owned;
      }finally{preparing=false;}
    }
    window.addEventListener('message',async event=>{
      if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.version!==1||!window.GANTRY_PROCESSING.active)return;
      const d=event.data;
      if(!['GANTRY_ACQUIRE_CONFIG','GANTRY_ACQUIRE_START','GANTRY_ACQUIRE_ACTION','GANTRY_ACQUIRE_POSITION','GANTRY_ACQUIRE_RETAKE','GANTRY_ACQUIRE_DELETE','GANTRY_CAMERA_PREVIEW','GANTRY_CAMERA_PREVIEW_END','GANTRY_ADMINISTRATION_UPDATE'].includes(d.type))return;
      try{
        if(d.type==='GANTRY_CAMERA_PREVIEW_END'){
          releasePreview();
        }else if(d.type==='GANTRY_ADMINISTRATION_UPDATE'){
          if(preparing||otherBusy()||window.GANTRY_EXAM?.blocked)throw Error('Finaliza la adquisición antes de cambiar la administración.');
          if(typeof d.activityMci!=='number'||typeof d.minutes!=='number'||d.minutes>=180||!window.GANTRY_MDP.configure(d.activityMci*37,d.minutes*60))throw Error('Dosis o tiempo no válidos.');
          live().clearPersistence();live().update(window.GANTRY.G);
          post({type:'GANTRY_ADMINISTRATION_STATE',activityMci:d.activityMci,minutes:d.minutes});
        }else if(d.type==='GANTRY_CAMERA_PREVIEW'){
          const c=window.GANTRY_PROCESSING_CONFIG.camera(d.config);
          if(preparing||otherBusy()||window.GANTRY_EXAM?.blocked)throw Error('Finaliza la adquisición activa o reinicia el examen antes de cambiar la cámara en vivo.');
          previewing=true;applyCamera(c);
          if(window.GANTRY_RF){const m=window.GANTRY_MDP.metadata();post({type:'GANTRY_ADMINISTRATION_STATE',activityMci:m.activityMBq/37,minutes:Math.min(179.99,m.seconds/60)});}
          post({type:'GANTRY_CAMERA_PREVIEW_RESULT',preview:d.preview});
        }else if(d.type==='GANTRY_ACQUIRE_RETAKE'||d.type==='GANTRY_ACQUIRE_DELETE'){
          if(preparing||otherBusy())throw Error('Finaliza la adquisición activa antes de repetir otra.');
          if(typeof d.id!=='string')throw Error('Adquisición no válida.');
          preparing=true;
          try{const config=await (d.type==='GANTRY_ACQUIRE_DELETE'?window.GANTRY_PROCESSING.removeAcquisition(d.id):window.GANTRY_PROCESSING.retake(d.id));if(owned===d.id)owned=null;post({type:d.type,request:d.request,id:d.id,config});}
          finally{preparing=false;}
        }else if(d.type==='GANTRY_ACQUIRE_CONFIG'){
          if(!['static','whole','dynamic'].includes(d.kind))throw Error('Tipo de adquisición no válido.');
          if(preparing||otherBusy())throw Error('Finaliza la adquisición activa antes de preparar otra.');
          if(d.kind==='dynamic'&&window.GANTRY_RF?.selected!=='bone3')window.GANTRY_RF?.select('bone3');
          post({type:'GANTRY_ACQUIRE_CONFIG',request:d.request,config:defaults(d.kind)});
        }else if(d.type==='GANTRY_ACQUIRE_POSITION'){
          const p=positionState();
          if(p.locked)throw Error('Finaliza la adquisición o reinicia el examen antes de cambiar la posición declarada.');
          const choices={decubitus:{supine:'acqSupine',prone:'acqProne'},entry:{headIn:'acqHeadIn',headOut:'acqHeadOut'}};
          const id=Object.hasOwn(choices,d.field)&&Object.hasOwn(choices[d.field],d.value)?choices[d.field][d.value]:null;
          if(!id)throw Error('Posición declarada no válida.');
          const control=el(id);
          if(!control||control.disabled)throw Error('Posición declarada no disponible.');
          control.click();
          post({type:'GANTRY_ACQUIRE_POSITION',request:d.request,position:positionState()});
        }else if(d.type==='GANTRY_ACQUIRE_START'){
          const id=await start(d.config,d.instant===true);
          post({type:'GANTRY_ACQUIRE_STARTED',request:d.request,id});
        }else{
          if(!owned||engine().state?.id!==owned||d.id!==owned)throw Error('Esta adquisición ya no es la actual.');
          if(!['pause','stop','fast','instant','save'].includes(d.action))throw Error('Acción no válida.');
          await engine().controlFromProcessing(d.action);
          post({type:'GANTRY_ACQUIRE_ACTION_DONE',request:d.request,action:d.action});
        }
      }catch(error){post(d.type==='GANTRY_ADMINISTRATION_UPDATE'?{type:'GANTRY_ADMINISTRATION_ERROR',error:error.message}:d.type==='GANTRY_CAMERA_PREVIEW'?{type:'GANTRY_CAMERA_PREVIEW_RESULT',preview:d.preview,error:error.message}:{type:'GANTRY_ACQUIRE_ERROR',request:d.request,error:error.message});}
    });
    // Thumbnails are only for progress display. Final DICOM keeps original counts.
    const previews=[document.createElement('canvas'),document.createElement('canvas')];
    setInterval(()=>{
      restoreLiveCamera();
      if(!window.GANTRY_PROCESSING.active||sending)return;
      const m=window.GANTRY_MDP.metadata(),administration={activityMci:m.activityMBq/37,minutes:Math.min(179.99,m.seconds/60)};
      const administrationKey=JSON.stringify(administration);
      if(administrationKey!==lastAdministration){lastAdministration=administrationKey;post({type:'GANTRY_ADMINISTRATION_STATE',...administration});}
      const position=positionState(),signature=JSON.stringify(position);
      if(signature!==lastPosition){lastPosition=signature;post({type:'GANTRY_POSITION_STATE',position});}
      if(!owned)return;
      const state=engine().state;if(!state||state.id!==owned||state.finished&&finalSent===owned)return;
      engine().refreshPreview?.();
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
