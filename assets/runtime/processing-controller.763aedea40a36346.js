/* Browser-only, lossless teaching interchange. No screenshots or resampling. */
(function(){
  'use strict';
  const NM='1.2.840.10008.5.1.4.1.1.20',PRIVATE32='2.25.216145721041023267506752105223475669900';
  const encoder=new TextEncoder();
  const concat=parts=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;};
  function element(tag,vr,value){
    let data;
    if(value instanceof Uint8Array)data=value;
    else if(['US','UL','AT'].includes(vr)){
      const values=Array.isArray(value)?value:[value],size=vr==='US'?2:4;
      data=new Uint8Array(size*values.length);const view=new DataView(data.buffer);
      values.forEach((n,i)=>vr==='US'?view.setUint16(i*size,n,true):vr==='AT'?(view.setUint16(i*4,n>>>16,true),view.setUint16(i*4+2,n&65535,true)):view.setUint32(i*size,n,true));
    }else data=encoder.encode(String(vr==='DS'&&typeof value==='number'?Number(value.toPrecision(10)):value??''));
    if(data.length%2)data=concat([data,new Uint8Array([vr==='UI'||vr==='OB'||vr==='OW'?0:32])]);
    const long=['OB','OW','SQ','UT'].includes(vr),header=new Uint8Array(long?12:8),v=new DataView(header.buffer);
    v.setUint16(0,parseInt(tag.slice(0,4),16),true);v.setUint16(2,parseInt(tag.slice(4),16),true);
    header.set(encoder.encode(vr),4);long?v.setUint32(8,data.length,true):v.setUint16(6,data.length,true);
    return concat([header,data]);
  }
  function dataset(elements){return concat(elements.sort((a,b)=>a[0].localeCompare(b[0])).map(e=>element(...e)));}
  function sequence(tag,items){return [tag,'SQ',concat(items.map(elements=>{const body=dataset(elements),header=new Uint8Array(8),v=new DataView(header.buffer);v.setUint16(0,0xfffe,true);v.setUint16(2,0xe000,true);v.setUint32(4,body.length,true);return concat([header,body]);}))];}
  async function uid(text){const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(text)));let n=0n;for(const b of bytes.subarray(0,16))n=n*256n+BigInt(b);return '2.25.'+n;}
  function validate(record){
    window.GANTRY_BONE_STORAGE.validate(record);
    if(record.study!=='bone'||!record.finished||record.heads.some(h=>h.total===0))throw Error('Selecciona una adquisición ósea finalizada con cuentas en ambos detectores.');
  }
  function label(record,j){
    const p=record.processing;
    if(!p)return 'D'+(j+1)+' · orientación no registrada';
    if(p.varied)return 'D'+(j+1)+' · geometría variable';
    const d=(record.kind==='whole'?p.last:p.first)?.detectors?.[j];
    return 'D'+(j+1)+' · '+(d?.view||'orientación no registrada')+(d?.orientationMatched===false?' · posición declarada discordante':'');
  }
  async function files(record,studyUID){
    validate(record);
    const identity=(record.processing?.acquisitionId||record.id)+':'+record.heads.map(h=>h.total+':'+h.elapsed).join(':'),seriesUID=await uid('series:'+identity);
    const settings=record.processing?.first?.settings||record.settings||{},mdp=record.mdp?.start;
    const when=new Date(record.processing?.startedAt||record.createdAt),stamp=when.toISOString().replace(/[-:]/g,''),date=stamp.slice(0,8),time=stamp.slice(9,15);
    const output=[];
    const dynamic=record.kind==='dynamic'?record.dynamic:null;
    for(let j=0;j<(dynamic?1:2);j++){
      const head=dynamic?{...record.heads[0],total:record.heads.reduce((s,h)=>s+h.total,0),counts:(()=>{const out=new Uint32Array(dynamic.frames.length*2*record.n**2);dynamic.frames.forEach((f,i)=>f.heads.forEach((c,d)=>out.set(c,(i*2+d)*record.n**2)));return out;})()}:record.heads[j];
      const orientation=dynamic?'Dos detectores · secuencia temporal':label(record,j),sopUID=await uid(identity+':'+j);
      const pixelMm=record.sampling?.pixelMm||record.processing?.first?.detectors?.[j]?.pixelMm;
      const spacing=Number.isFinite(pixelMm)&&pixelMm>0?String(Number(pixelMm.toPrecision(10))):'';
      let max=0;for(const n of head.counts)max=Math.max(max,n);
      // Standard NM allows 8/16-bit pixels. Preserve rare overflow images with
      // an explicitly private teaching SOP class, never clamp or quantize counts.
      const bits=max<=65535?16:32,sop=bits===16?NM:PRIVATE32;
      const data=new Uint8Array(head.counts.length*bits/8),view=new DataView(data.buffer);
      head.counts.forEach((n,i)=>bits===16?view.setUint16(i*2,n,true):view.setUint32(i*4,n,true));
      const info={simulation:true,recordId:record.id,detector:j+1,total:head.total,elapsed:head.elapsed,
        heads:record.heads.map(h=>({detector:h.detector,elapsed:h.elapsed,total:h.total,done:h.done})),
        acquisition:{kind:record.kind||'static',mode:record.mode,target:record.target,names:record.names},
        ...(dynamic?{dynamic:{phases:dynamic.phases,timings:dynamic.frames.flatMap(f=>[1,2].map(detector=>({detector,phase:f.phase,index:f.index,start:f.start,end:f.end,partial:!!f.partial})))}}:{}),
        mdp:record.mdp||null,settings,processing:record.processing||null,scan:record.scan||null,sampling:record.sampling||null,
        stoppedEarly:!head.done,encoding:bits===16?'NM16':'PRIVATE_GANTRY_COUNTS32'};
      const description=(dynamic?'Dinámica':record.kind==='whole'?'Cuerpo entero':'Estática')+' · '+record.names[j]+' · SIMULADO';
      const tags=[['00080005','CS','ISO_IR 192'],['00080008','CS','DERIVED\\SECONDARY\\'+(dynamic?'DYNAMIC':record.kind==='whole'?'WHOLE BODY':'STATIC')+'\\SIMULATED'],
        ['00080016','UI',sop],['00080018','UI',sopUID],['00080020','DA',date],['00080030','TM',time],['00080022','DA',date],['00080032','TM',time],['00080201','SH','+0000'],['00080050','SH',''],
        ['00080060','CS','NM'],['00080070','LO','Gantry educativo'],['00080080','LO','Simulación docente'],['00080090','PN',''],
        ['00081030','LO','Cintigrafía ósea simulada ICRP 145'],['0008103e','LO',description.slice(0,64)],
        ['00100010','PN','FANTOMA^ICRP145^SIMULADO'],['00100020','LO','GANTRY-ICRP145-SIM'],['00100030','DA',''],['00100040','CS',''],
        ['00111010','UT',JSON.stringify(info)],['00110010','LO','GANTRY_SIMULATION'],
        ['00181020','LO','Gantry processing 1'],['00181242','IS',Math.round(head.elapsed*1000)],
        ['0020000d','UI',studyUID],['0020000e','UI',seriesUID],['00200010','SH','SIMULATED'],['00200011','IS','1'],['00200013','IS',j+1],
        ['00204000','LT','SIMULADO; '+orientation+'; '+head.total+' cuentas; '+(mdp?(mdp.activityMBq/37).toFixed(2)+' mCi; inyección-examen '+(mdp.seconds/60).toFixed(2)+' min; ':'')+(record.processing?.varied?'Parámetros variables durante la adquisición. ':'')+(!head.done?'Adquisición detenida antes de la meta. ':'')+(bits===32?'SOP privado docente de 32 bits; no es NM estándar.':'')],
        ['00280002','US',1],['00280004','CS','MONOCHROME2'],['00280008','IS',1],['00280009','AT',0x00540020],
        ['00280010','US',record.height||record.n],['00280011','US',record.n],['00280030','DS',spacing?spacing+'\\'+spacing:''],
        ['00280100','US',bits],['00280101','US',bits],['00280102','US',bits-1],['00280103','US',0],
        ['00281050','DS',max/2],['00281051','DS',Math.max(1,max)],['00281052','DS','0'],['00281053','DS','1'],
        ['00540020','US',1],['00540021','US',1],
        sequence('00540022',[[['00181180','SH',settings.collimator||''],['00280031','DS',String(settings.zoom||1)+'\\'+String(settings.zoom||1)],
          sequence('00540220',[[['00080100','SH','D'+(j+1)],['00080102','SH','99GANTRY'],['00080104','LO',orientation.slice(0,64)]]])]]),
        ['7fe00010','OW',data]];
      const center=Number(settings.energyCenter),width=Number(settings.windowWidth);
      if(center>0&&width>0)tags.push(['00540010','US',1],['00540011','US',1],sequence('00540012',[[['00540018','SH','99mTc'],sequence('00540013',[[['00540014','DS',center*(1-width/200)],['00540015','DS',center*(1+width/200)]]])]]));
      if(mdp)tags.push(sequence('00540016',[[['00180031','LO','99mTc-MDP'],['00181074','DS',mdp.activityMBq],['00181075','DS',mdp.halfLifeMinutes*60]]]));
      if(record.scan)tags.push(['00181300','DS',record.scan.velocity/6],['00181302','DS',record.scan.travel*10]);
      if(dynamic){
        const replace=(tag,vr,v)=>{const i=tags.findIndex(t=>t[0]===tag);if(i>=0)tags.splice(i,1);tags.push([tag,vr,v]);};
        const timing=info.dynamic.timings;
        replace('00280008','IS',timing.length);replace('00280009','AT',[0x00540020,0x00540030,0x00540100]);
        replace('00540020','US',timing.map(f=>f.detector));replace('00540021','US',2);
        tags.splice(tags.findIndex(t=>t[0]==='00181242'),1);
        tags.splice(tags.findIndex(t=>t[0]==='00540022'),1);
        tags.push(sequence('00540022',[0,1].map(d=>[['00181180','SH',settings.collimator||''],['00280031','DS',String(settings.zoom||1)+'\\'+String(settings.zoom||1)],
          sequence('00540220',[[['00080100','SH','D'+(d+1)],['00080102','SH','99GANTRY'],['00080104','LO',label(record,d).slice(0,64)]]])])));
        tags.push(['00180071','CS','TIME'],['00540030','US',timing.map(f=>f.phase)],['00540031','US',dynamic.phases.length],
          ['00540100','US',timing.map(f=>f.index)],['00540101','US',dynamic.frames.length],
          sequence('00540032',dynamic.phases.map((p,i)=>[['00540033','US',dynamic.frames.filter(f=>f.phase===i+1).length],['00181242','IS',p.seconds*1000],['00540036','IS',0],['00540038','IS',0]])));
      }
      const meta=dataset([['00020001','OB',new Uint8Array([0,1])],['00020002','UI',sop],['00020003','UI',sopUID],['00020010','UI','1.2.840.10008.1.2.1'],['00020012','UI',PRIVATE32],['00020013','SH','GANTRY_SIM_1']]);
      const prefix=new Uint8Array(132);prefix.set(encoder.encode('DICM'),128);
      const bytes=concat([prefix,element('00020000','UL',meta.length),meta,dataset(tags)]);
      output.push({name:'oseo-'+record.id.replace(/[^a-zA-Z0-9-]/g,'').slice(0,48)+'-D'+(j+1)+'.dcm',bytes:bytes.buffer,total:head.total,rows:record.height||record.n,cols:record.n,frames:dynamic?dynamic.frames.length*2:1,uid:sopUID,group:identity,orientation});
    }
    return output;
  }
  window.GANTRY_PROCESSING_DICOM={files,uid,label,validate,PRIVATE32};
})();

/* Shared validation for the viewer's acquisition form and the gantry receiver. */
(function(){
  'use strict';
  function camera(value){
    if(!value||typeof value!=='object')throw Error('Parámetros de cámara incompletos.');
    const c={};
    for(const [key,choices,label] of [['kind',['static','whole','dynamic'],'Tipo de adquisición'],['matrix',value.kind==='whole'?[128,256]:[64,128,256,512],'Matriz'],['zoom',[1,1.5,1.75,2],'Zoom'],['collimator',['LEHR','MELP','HE','NONE'],'Colimador'],['windowWidth',[10,15,20,25],'Ancho de ventana']]){
      if(!choices.includes(value[key]))throw Error(label+' no válido.');c[key]=value[key];
    }
    if(!Number.isInteger(value.energyCenter)||value.energyCenter<80||value.energyCenter>450)throw Error('Centro de energía fuera de rango.');
    c.energyCenter=value.energyCenter;return c;
  }
  function validate(value){
    if(!value||typeof value!=='object')throw Error('Parámetros de adquisición incompletos.');
    const c={};
    const choice=(key,values,label)=>{if(!values.includes(value[key]))throw Error(label+' no válido.');c[key]=value[key];};
    const number=(key,min,max,label,integer=false)=>{
      const n=value[key];
      if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n)))throw Error(label+' fuera de rango.');
      c[key]=n;
    };
    Object.assign(c,camera(value));
    number('activityMci',.1,2000/37,'Actividad (mCi)');number('minutes',0,179.99,'Tiempo inyección–examen (min)');
    if(c.kind==='whole'){
      // Compatibility defaults for the static controls; the scan engine stops
      // at the end of the table travel, never on a static count/time target.
      c.mode='counts';c.target=400000;
    }else if(c.kind==='dynamic'){
      c.phases=phases(value.phases,c.matrix);c.mode='time';c.target=c.phases.reduce((s,p)=>s+p.frames*p.seconds,0);
    }else{
      choice('mode',['counts','time'],'Condición de paro');
      number('target',1,c.mode==='time'?57600:160000000,'Objetivo',true);
    }
    number('velocity',.1,60,'Velocidad de camilla');
    c.contours=value.contours??'auto';
    if(!['auto','fixed'].includes(c.contours))throw Error('Modo de contornos no válido.');
    if(!Array.isArray(value.names)||value.names.length!==2||value.names.some(n=>typeof n!=='string'||!n.trim()||n.trim().length>80))throw Error('Indica un nombre de hasta 80 caracteres para cada detector.');
    c.names=value.names.map(n=>n.trim());
    return c;
  }
  function fromRecord(r){
    const s=r.processing?.first?.settings||r.settings||{},m=r.mdp?.start;
    return validate({kind:r.kind||'static',matrix:r.n,zoom:s.zoom,collimator:s.collimator,energyCenter:s.energyCenter,windowWidth:s.windowWidth,
      activityMci:m?.activityMBq/37,minutes:Math.min(179.99,m?.seconds/60),mode:r.mode,target:r.target,
      velocity:r.scan?.velocity||10,contours:r.scan?.contours||'auto',names:r.names,phases:r.dynamic?.phases});
  }
  function phases(list,n){
    if(!Array.isArray(list)||!list.length||list.length>3)throw Error('Configura entre una y tres fases.');
    const result=list.map(p=>{
      if(!Number.isInteger(p.frames)||p.frames<1||p.frames>240||!Number.isInteger(p.seconds)||p.seconds<1||p.seconds>600)throw Error('Cada fase requiere 1–240 imágenes y 1–600 segundos por imagen.');
      return {frames:p.frames,seconds:p.seconds};
    });
    if(result.reduce((s,p)=>s+p.frames*p.seconds,0)>10800)throw Error('La secuencia no puede superar 180 minutos.');
    if(result.reduce((s,p)=>s+p.frames,0)*n*n*8>64*1024*1024)throw Error('La secuencia supera 64 MB de cuentas. Reduce la matriz o el número de imágenes.');
    return result;
  }
  window.GANTRY_PROCESSING_CONFIG={validate,fromRecord,camera,phases};
})();

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

/* Parent controller: lazy iframe, local snapshots, explicit append and ACK. */
(function(){
  'use strict';
  const el=id=>document.getElementById(id);
  let active=false,ready=false,pending=null,loaded=false,catalog=new Map(),request=0,loadTimer,refreshing=false;
  const completed=new Map(),imported=new Set();
  const saving=new Map();let cache;
  const storage=()=>cache||(cache=window.GANTRY_BONE_STORAGE.createStore(window.indexedDB));
  function autoSave(record){
    const key=identity(record);if(saving.has(key))return saving.get(key);
    const task=Promise.resolve().then(()=>storage().save(record)).then(async()=>{
      await window.GANTRY_BONE_ACQ.cacheSaved?.(record.processing?.acquisitionId||record.id);
      frame.contentWindow.postMessage({type:'GANTRY_ACQUIRE_SAVED',version:1,id:record.processing?.acquisitionId||record.id},location.origin);
      return true;
    }).catch(error=>{
      status.textContent='No se pudo guardar automáticamente: '+error.message+'. La adquisición sigue disponible en esta sesión.';
      frame.contentWindow.postMessage({type:'GANTRY_ACQUIRE_SAVED',version:1,id:record.processing?.acquisitionId||record.id,error:status.textContent},location.origin);
      return false;
    });saving.set(key,task);return task;
  }
  const identity=r=>(r.processing?.acquisitionId||r.id)+':'+(r.totals||r.heads.map(h=>h.total)).join(':');
  function remember(record){
    if(record?.study!=='bone'||!record.finished)return;
    autoSave(record);
    if(!record.heads.every(h=>h.total>0))return;
    completed.set(identity(record),record);
    if(active)setTimeout(()=>refresh().then(sync).catch(error=>{status.textContent=error.message;}),0);
  }
  const frame=el('boneProcessingFrame'),status=el('boneProcessingStatus');
  // Auxiliary tools live in the main menu; the right slot belongs to the viewer.
  const tools=document.createElement('details');tools.id='boneProcessingTools';tools.hidden=true;
  const title=document.createElement('summary');title.textContent='Opciones de procesamiento';
  const content=document.createElement('div');content.id='boneProcessingToolsContent';
  content.append(el('boneProcessingToolbar'),el('boneProcessingList').closest('details'),status);
  tools.append(title,content);el('boneProcessingTab').parentElement.append(tools);

  const busy=()=>window.GANTRY_BONE_ACQ?.active||window.GANTRY_MAG3?.state&&!window.GANTRY_MAG3.state.finished;
  function load(){
    loaded=true;status.textContent='Cargando procesador óseo…';el('boneProcessingRetry').hidden=true;
    clearTimeout(loadTimer);frame.src=frame.dataset.src;
    loadTimer=setTimeout(()=>{if(!ready){status.textContent='El procesador no terminó de cargar. Puedes reintentar.';el('boneProcessingRetry').hidden=false;}},45000);
  }
  async function refresh(){
    refreshing=true;
    try{
    const selected=new Set([...el('boneProcessingList').querySelectorAll('input:checked')].map(n=>n.value));
    // Only acquisitions completed in this simulator session. Browsing cached
    // images in Gantry must not repopulate a new processing workspace.
    catalog=new Map(completed);
    el('boneProcessingList').replaceChildren();
    for(const [key,record] of catalog){
      const row=document.createElement('label'),check=document.createElement('input'),text=document.createElement('span');
      check.type='checkbox';check.value=key;check.checked=selected.has(key);
      text.textContent='De esta sesión · '+(record.kind==='whole'?'Cuerpo entero':record.kind==='dynamic'?'Dinámica':'Estática')+' · '+record.names.join(' / ')+' · '+new Date(record.createdAt).toLocaleString('es-CL');
      row.append(check,text);el('boneProcessingList').append(row);
    }
    if(!catalog.size)el('boneProcessingList').textContent='Sin adquisiciones en esta sesión. Usa Adquirir para iniciar la primera.';
    el('boneProcessingSend').disabled=!ready||!catalog.size||!!pending;
    }finally{refreshing=false;}
  }
  function sync(){
    if(!active||!ready||pending||refreshing)return;
    const keys=[...catalog].filter(([,r])=>!imported.has(identity(r))).map(([key])=>key).slice(0,1);
    if(keys.length)return send(keys,true);
  }
  async function open(){
    if(busy()&&window.GANTRY_LIVE.settings.study!=='bone'){el('boneProcessingNotice').textContent='Finaliza la adquisición del otro estudio antes de entrar a procesamiento.';return;}
    active=true;tools.hidden=false;el('boneProcessingNotice').textContent='';
    el('acquisitionMenuButton').disabled=true;
    el('gantryLive').hidden=true;el('boneProcessingPane').hidden=false;
    el('boneProcessingTab').setAttribute('aria-selected','true');el('boneGantryTab').setAttribute('aria-selected','false');
    if(!loaded)load();
    if(ready)frame.contentWindow.postMessage({type:'GANTRY_PROCESSING_SHOW',version:1},location.origin);
    try{await refresh();await sync();}catch(error){status.textContent='No se pudo leer el catálogo local: '+error.message;}
  }
  function close(){
    window.GANTRY_PROCESSING_ACQUISITION?.releasePreview?.();
    active=false;tools.hidden=true;tools.open=false;el('boneProcessingPane').hidden=true;el('gantryLive').hidden=false;
    el('acquisitionMenuButton').disabled=false;
    el('boneProcessingTab').setAttribute('aria-selected','false');el('boneGantryTab').setAttribute('aria-selected','true');
    if(ready)frame.contentWindow.postMessage({type:'GANTRY_PROCESSING_HIDE',version:1},location.origin);
    window.GANTRY_LIVE?.update(window.GANTRY.G);
  }
  async function send(selectedKeys,automatic=false){
    if(!ready||pending)return;
    const keys=Array.isArray(selectedKeys)?selectedKeys:[...el('boneProcessingList').querySelectorAll('input:checked')].map(n=>n.value);
    if(!keys.length){status.textContent='Selecciona al menos una adquisición.';return;}
    if(keys.length>50){status.textContent='Envía hasta 50 adquisiciones por vez.';return;}
    el('boneProcessingSend').disabled=true;
    const id=++request;
    pending={id,identities:keys.map(key=>identity(catalog.get(key)))};
    try{
      status.textContent='Preparando cuentas originales y metadatos…';
      const files=[];
      for(const key of keys){
        const record=catalog.get(key);
        const studyUID=await window.GANTRY_PROCESSING_DICOM.uid('gantry-bone-phantom:'+new Date(record.processing?.startedAt||record.createdAt).toISOString().slice(0,10));
        files.push(...await window.GANTRY_PROCESSING_DICOM.files(record,studyUID));
      }
      pending.timer=setTimeout(()=>{if(pending?.id===id){pending=null;el('boneProcessingSend').disabled=false;status.textContent='El procesador no confirmó la recepción. Pulsa Actualizar lista para reintentar.';}},30000);
      frame.contentWindow.postMessage({type:'GANTRY_PROCESSING_IMPORT',version:1,id,files,view:automatic?'acquisition':'flex'},location.origin);
      status.textContent='Enviando '+files.length+' imágenes al procesador…';
    }catch(error){pending=null;status.textContent='No se pudo enviar: '+error.message;el('boneProcessingSend').disabled=false;}
  }
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.version!==1)return;
    const data=event.data;
    if(data.type==='GANTRY_PROCESSING_READY'){ready=true;imported.clear();clearTimeout(loadTimer);el('boneProcessingRetry').hidden=true;status.textContent='Procesador listo. Las adquisiciones aparecerán en el menú de la izquierda.';el('boneProcessingSend').disabled=!catalog.size;sync();}
    if(data.type==='GANTRY_PROCESSING_RESULT'&&data.id===pending?.id){
      clearTimeout(pending.timer);if(!data.error)pending.identities.forEach(id=>imported.add(id));pending=null;el('boneProcessingSend').disabled=false;
      status.textContent=data.error?'No se pudo importar: '+data.error:data.images+' imágenes verificadas · '+data.totals.map((n,i)=>'D'+(i%2+1)+': '+n.toLocaleString('es-CL')+' cuentas').join(' · ')+'. Las cuentas originales se conservan.';
      if(!data.error)sync();
    }
  });
  el('boneProcessingTab').onclick=open;el('boneSendProcessing').onclick=open;
  el('boneGantryTab').onclick=close;el('boneProcessingBack').onclick=close;
  el('boneProcessingRefresh').onclick=()=>refresh().then(sync).catch(e=>{status.textContent=e.message;});
  el('boneProcessingSend').onclick=send;
  el('boneProcessingRetry').onclick=()=>{if(!ready)load();};
  async function removeAcquisition(id,repeat=false){
    if(busy()||pending)throw Error('Espera a que termine la adquisición y su recepción antes de repetirla.');
    const entries=[...completed].filter(([,r])=>(r.processing?.acquisitionId||r.id)===id);
    if(!entries.length)throw Error('La adquisición seleccionada ya no está disponible.');
    const config=repeat?window.GANTRY_PROCESSING_CONFIG.fromRecord(entries[0][1]):null;
    await Promise.all(entries.map(([key])=>saving.get(key)));
    await storage().removeAcquisition(id);
    for(const [key] of entries){completed.delete(key);catalog.delete(key);imported.delete(key);saving.delete(key);}
    window.GANTRY_BONE_ACQ.discardFinished(id);
    await refresh();return config;
  }
  window.GANTRY_PROCESSING={open,close,remember,retake:id=>removeAcquisition(id,true),removeAcquisition,get active(){return active;}};
  window.GANTRY_PROCESSING_ACQUISITION.attach(frame);
})();
