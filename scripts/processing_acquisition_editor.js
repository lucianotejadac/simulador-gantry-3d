/* Acquisition drafts use the viewer's existing patient/camera/stop panes. */
(function(){
  'use strict';
  let draft=null,serial=0,waiting=null,lastConfig=null,lastId=null,lastState=null,previousBadge='',actionModel=null,positionState=null;
  const retained=new Map(),inputs=new Map(),configurations=new Map();
  const cameraKeys=['matrix','zoom','collimator','energyCenter','windowWidth'];let previewSerial=0;
  function previewCamera(){
    if(!draft||draft.id||lastId&&lastState?.finished!==true)return;
    const config={kind:draft.config.kind};
    for(const key of cameraKeys){
      const node=inputs.get(key);if(!node||!node.checkValidity())return;
      config[key]=key==='collimator'?node.value:Number(node.value);
    }
    try{window.GANTRY_PROCESSING_CONFIG.camera(config);}catch(_){return;}
    send({type:'GANTRY_CAMERA_PREVIEW',preview:++previewSerial,config});
  }
  function updateAdministration(){
    if(!draft||draft.id)return;
    const dose=inputs.get('activityMci'),time=inputs.get('minutes');
    if(!dose?.value||!time?.value||!dose.checkValidity()||!time.checkValidity())return;
    send({type:'GANTRY_ADMINISTRATION_UPDATE',activityMci:Number(dose.value),minutes:Number(time.value)});
  }
  const panes=['patient','summary','series','camera','stop','images'];
  const menu=document.createElement('select');menu.id='processingAcquireMenu';menu.setAttribute('aria-label','Adquirir');
  document.querySelector('.application-bar').prepend(menu);
  const style=document.createElement('style');style.textContent=`
    #processingAcquireMenu{max-width:290px;height:30px;font-size:12px;margin-right:6px}
    body.gantry-acquisition-draft .field :is(input:not([readonly]),select){background:#ffffe1;color:#000;width:100%;min-width:0;border:2px inset #eee;padding:3px;font:inherit;box-sizing:border-box}
    body.gantry-acquisition-draft :is(#static-overview,#acquisition-instance-wrap,.metadata,.viewer>.toolbar){display:none!important}
    body.gantry-acquisition-draft #acquisition-thumbnails{display:none}
    body.gantry-acquisition-draft #consoleSummary{display:none}
    .draft-image{display:flex;flex-direction:column;min-height:0}.draft-image .scan{background:#000;min-height:120px}
    .draft-image canvas{width:100%;height:100%;object-fit:contain}.draft-counts{font-size:12px;padding:6px;background:#eee}
    .draft-progress{width:100%;height:8px}.draft-help{font-size:12px;line-height:1.4;margin:8px 0}
  `;document.head.append(style);
  const consoleBar=document.createElement('section');consoleBar.id='acquisitionConsole';
  consoleBar.setAttribute('aria-label','Control de adquisición');
  consoleBar.innerHTML=`
    <div class="console-summary" id="consoleSummary">Prepara una adquisición para configurar la cámara y las condiciones de paro.</div>
    <div class="console-state" id="consoleState" role="status"></div>
    <div class="console-prepare">
      <button type="button" data-acquire="add">Agregar adquisición</button>
      <button type="button" data-acquire="retake">Adquirir de nuevo</button>
      <button type="button" data-acquire="delete" hidden>Eliminar adquisición</button></div>
    <div class="console-transport">
      <button type="button" data-acquire="start" title="Iniciar adquisición"><b aria-hidden="true">▶</b> Iniciar</button>
      <button type="button" data-acquire="pause"><b aria-hidden="true">Ⅱ</b> <span>Pausar</span></button>
      <button type="button" data-acquire="stop"><b aria-hidden="true">■</b> Finalizar</button>
    </div>
    <div class="console-secondary">
      <button type="button" data-acquire="fast">▶▶ Avance rápido · 1×</button>
      <button type="button" data-acquire="instant">Adquisición instantánea</button>
    </div><div id="acquisitionSaveStatus" role="status"></div>`;
  document.querySelector('#acquisition-panel .viewer').append(consoleBar);
  consoleBar.addEventListener('click',e=>{
    const button=e.target.closest('button[data-acquire]');
    if(button&&!button.disabled)performAction(button.dataset.acquire);
  });
  const saved=new Map();
  const retakeDialog=document.createElement('dialog');retakeDialog.id='retakeConfirmation';
  retakeDialog.setAttribute('aria-labelledby','retakeTitle');
  retakeDialog.innerHTML='<h2 id="retakeTitle">¿Adquirir de nuevo?</h2><p>Se borrarán las imágenes de ambos detectores de la adquisición seleccionada y su copia guardada en este navegador. Las demás adquisiciones se conservarán.</p><p>Se mantendrán el tipo de adquisición y sus parámetros para preparar la nueva toma.</p><button type="button" id="retakeCancel">Cancelar</button> <button type="button" id="retakeConfirm">Borrar imágenes y preparar nueva toma</button>';
  document.body.append(retakeDialog);
  style.textContent+='#retakeConfirmation{max-width:440px;background:#c0c0c0;border:3px outset #eee;padding:16px;font:14px Arial;color:#000}#retakeConfirmation::backdrop{background:#0008}#retakeConfirmation h2{font-size:18px;color:#000080}#retakeConfirmation p{line-height:1.4}#retakeConfirmation button{padding:8px;margin-top:8px}';
  $('retakeCancel').onclick=()=>retakeDialog.close();
  const retakeDescription=retakeDialog.querySelectorAll('p');
  function confirmAction(action,id){
    const deleting=action==='delete',pending=configurations.has(id);
    retakeDialog.dataset.acquisitionId=id;retakeDialog.dataset.action=action;
    $('retakeTitle').textContent=deleting?'¿Eliminar adquisición?':'¿Adquirir de nuevo?';
    retakeDescription[0].textContent=deleting&&pending?'Se eliminará la configuración seleccionada de la lista. Todavía no tiene imágenes adquiridas.':'Se borrarán las imágenes de ambos detectores de la adquisición seleccionada y su copia guardada en este navegador. Las demás adquisiciones se conservarán.';
    retakeDescription[1].textContent=deleting?'Las demás adquisiciones y configuraciones pendientes se conservarán.':'Se mantendrán el tipo de adquisición y sus parámetros para preparar la nueva toma.';
    $('retakeConfirm').textContent=deleting?'Eliminar adquisición':'Borrar imágenes y preparar nueva toma';
    retakeDialog.showModal();$('retakeCancel').focus();
  }
  $('retakeConfirm').onclick=()=>{
    const id=retakeDialog.dataset.acquisitionId,action=retakeDialog.dataset.action;retakeDialog.close();
    if(action==='delete'&&configurations.has(id)){
      if(draft?.listId===id)finish(false);
      configurations.delete(id);window.GANTRY_PROCESSING_LIST.cancelConfiguration(id);
      window.GANTRY_PROCESSING_LIST.selectLast();status('Adquisición eliminada.');
    }else request(action==='delete'?'GANTRY_ACQUIRE_DELETE':'GANTRY_ACQUIRE_RETAKE',{id});
    setMenu();
  };
  const send=data=>parent.postMessage({...data,version:1},location.origin);
  function request(type,extra={}){const id=++serial;waiting=id;send({type,request:id,...extra});return id;}
  function setMenu(){
    const info=recorded(),selectedId=info?.processing?.acquisitionId||info?.recordId;
    const kind=draft?.config.kind||info?.acquisition?.kind||lastConfig?.kind||'static';
    actionModel=window.GANTRY_ACQUISITION_ACTIONS.model({draftId:draft?.id,hasDraft:!!draft,lastId,state:lastState,waiting:!!waiting,kind,selectedId});
    const {running,ready,type,phase,actions}=actionModel;
    const caption=(draft||lastId||selectedId?type+' · ':'')+phase+'…';
    const signature=JSON.stringify([caption,actions]);
    if(menu.dataset.signature!==signature){
      const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=caption;placeholder.disabled=true;
      menu.replaceChildren(placeholder);
      for(const name of ['Configuración','Adquisición','Resultados']){
        const group=document.createElement('optgroup');group.label=name;
        for(const a of actions.filter(a=>a.group===name)){
          const o=document.createElement('option');o.value=a.id;o.textContent=a.label;o.disabled=!a.enabled;group.append(o);
        }
        menu.append(group);
      }
      menu.value='';menu.dataset.signature=signature;
    }
    menu.disabled=!!waiting;
    $('consoleState').textContent=(draft||lastId||selectedId?type+' · ':'')+phase;
    for(const button of consoleBar.querySelectorAll('button[data-acquire]')){
      const id=button.dataset.acquire,a=actions.find(a=>a.id===id);
      button.disabled=!a?.enabled;
      if(a){
        button.title=a.label;button.setAttribute('aria-label',a.label);
        if(button.querySelector('b')){
          const icon=button.querySelector('b');button.replaceChildren(icon,document.createTextNode(' '+a.label));
        }else button.textContent=a.label;
      }
      if(id==='retake'||id==='add')button.hidden=!!draft||!selectedId||running;
      if(id==='add')button.title='Conserva las imágenes anteriores y agrega otra adquisición '+(kind==='whole'?'de cuerpo entero':'estática')+' a la lista.';
      if(id==='delete')button.hidden=!ready&&(!selectedId||running);
    }
    $('acquisitionSaveStatus').textContent=!draft&&selectedId?(saved.get(selectedId)||'Guardada en esta sesión · guardado automático en el navegador') : '';
  }
  function finish(preserve=true){
    if(!draft)return;
    if(!draft.id&&preserve){
      const config=read(false),tab=document.querySelector('.tabs button[aria-selected="true"]')?.id;
      configurations.set(draft.listId,{config,tab});window.GANTRY_PROCESSING_LIST.configuration(config,draft.listId);
    }
    for(const [id,nodes] of retained)$(id).replaceChildren(...nodes);
    retained.clear();inputs.clear();draft=null;document.body.classList.remove('gantry-acquisition-draft','gantry-whole-draft');
    $('modality').textContent=previousBadge;
    updateModeUI();setMenu();
  }
  const originalSelect=selectMode;
  selectMode=function(...args){if(waiting)return;finish();const result=originalSelect(...args);setMenu();return result;};
  const originalLoadFile=loadFile;
  loadFile=async function(...args){finish();return originalLoadFile(...args);};
  const originalFlexible=openFlexible;
  openFlexible=function(...args){finish();return originalFlexible(...args);};
  // Recorded simulator settings remain read-only after acquisition; external
  // DICOM files are never populated from the current gantry configuration.
  function recorded(){
    if(dataset?.string('x00110010')!=='GANTRY_SIMULATION')return null;
    try{return JSON.parse(value(dataset,'00111010'));}catch(_){return null;}
  }
  function stopMetadata(){
    if(draft)return;const info=recorded(),a=info?.acquisition;if(!a)return;
    const fields=window.GANTRY_RECORDED_METADATA.fields(info,currentMode==='whole'?info.detector:selectedDetector+1);
    for(const id of ['camera','summary','series','stop','static-overview'])for(const n of $(id)?.querySelectorAll('input[data-label]')||[]){
      const v=fields[n.dataset.label];
      if(v!==undefined){n.value=v;n.classList.remove('missing');n.title='Información del registro de esta adquisición simulada; no usa los ajustes actuales del gantry.';}
    }
    for(const radio of $('stop').querySelectorAll('input[name="termination-mode"]'))radio.checked=radio.value===(a.mode==='time'?'TIME':a.mode==='counts'?'CNTS':'');
    for(const hint of $('stop').querySelectorAll('.hint'))hint.textContent='Parámetros y tiempos registrados al adquirir. Los tiempos corresponden al examen simulado, incluso si se utilizó avance rápido o adquisición instantánea.';
  }
  const originalConditions=renderDetectorConditions;
  renderDetectorConditions=function(){originalConditions();stopMetadata();};
  const originalPopulate=populate;
  populate=function(){
    originalPopulate();if(draft)return;
    const info=recorded();if(!info)return;
    const s=info.settings||{};
    group($('camera'),'Detector y ventana registrados',[
      ['Colimador',s.collimator==='NONE'?'Sin colimador':s.collimator||'','Configuración registrada al adquirir'],
      ['Centro de energía (keV)',s.energyCenter??'','Configuración registrada al adquirir'],
      ['Ancho de ventana (%)',s.windowWidth??'','Configuración registrada al adquirir']]);
    if(info.mdp?.start)group($('series'),'Tiempo registrado',[
      ['Inyección–examen (min)',(info.mdp.start.seconds/60).toLocaleString('es-CL'),'Tiempo al iniciar esta adquisición']]);
    if(info.scan)group($('camera'),'Barrido registrado',[
      ['Contornos automáticos',info.scan.contours==='fixed'?'Desactivados · distancia fija':'Activados','Configuración registrada al adquirir']]);
    stopMetadata();
    setMenu();
  };
  function input(key,label,value,choices=null,opts={}){
    const row=field(label,value,'Parámetro de la nueva adquisición simulada.');
    const old=row.querySelector('input'),node=document.createElement(choices?'select':'input');
    node.id='gantryDraft-'+key;row.querySelector('label').htmlFor=node.id;
    node.setAttribute('aria-label',label);node.dataset.label=label;
    if(choices)for(const entry of choices){const [val,text]=Array.isArray(entry)?entry:[entry,String(entry)];const option=document.createElement('option');option.value=String(val);option.textContent=text;node.append(option);}
    else{node.type=opts.type||'number';Object.assign(node,opts);node.required=true;}
    node.value=String(value);old.replaceWith(node);inputs.set(key,node);return row;
  }
  function section(host,title,rows){const box=document.createElement('fieldset');box.className='group';const legend=document.createElement('legend');legend.textContent=title;const fields=document.createElement('div');fields.className='fields';fields.append(...rows);box.append(legend,fields);$(host).append(box);}
  function help(host,text){const p=document.createElement('p');p.className='draft-help';p.textContent=text;$(host).append(p);}
  function syncPosition(p){
    if(p)positionState=p;
    if(!positionState)return;
    for(const key of ['decubitus','entry']){
      const select=$('gantryDraft-position-'+key);if(!select)continue;
      select.value=positionState[key];select.disabled=!!waiting||positionState.locked;
    }
  }
  function positionControl(config){
    const p=positionState||config.position||{decubitus:'supine',entry:'headOut',locked:true};
    const rows=[
      ['decubitus','Decúbito',[['supine','Supino'],['prone','Prono']]],
      ['entry','Orientación',[['headIn','Cabeza dentro'],['headOut','Cabeza fuera']]]
    ].map(([key,label,options])=>{
      const row=field(label,''),select=document.createElement('select');
      select.id='gantryDraft-position-'+key;select.setAttribute('aria-label',label);
      row.querySelector('label').htmlFor=select.id;
      for(const [value,text] of options){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);}
      row.querySelector('input').replaceWith(select);
      select.onchange=()=>{request('GANTRY_ACQUIRE_POSITION',{field:key,value:select.value});setMenu();syncPosition();};
      return row;
    });
    section('camera','Posición declarada del paciente',rows);
    help('camera','Define la orientación de las imágenes, igual que Adquisición → Posición de paciente. No mueve al paciente ni a los detectores.');
    syncPosition(p);
  }
  function render(config,resume=false,listId=null){
    if(!resume&&config.kind==='whole'&&![128,256].includes(config.matrix))config={...config,matrix:config.matrix<128?128:256};
    finish();stopDynamic();closeFlexible();saveMode();
    for(const id of panes){retained.set(id,Array.from($(id).childNodes));$(id).replaceChildren();}
    draft={config,id:resume?lastId:null,listId};document.body.classList.add('gantry-acquisition-draft');
    document.body.classList.toggle('gantry-whole-draft',config.kind==='whole');
    previousBadge=$('modality').textContent;$('modality').textContent='SIMULADO';
    const kindLabel=config.kind==='whole'?'cuerpo entero':config.kind==='dynamic'?'dinámica':'estática';
    $('mode-heading').textContent='Nueva adquisición '+kindLabel+' · SIMULADA';
    $('patient').append(field('Paciente','Fantoma ICRP 145 · SIMULADO'),field('Estudio','Cintigrama óseo · 99mTc-MDP'),field('Serie','Nueva · '+kindLabel));
    const range=(min,max,step='any')=>({min:String(min),max:String(max),step});
    section('camera','Parámetros de cámara',[
      input('matrix','Tamaño de matriz',config.matrix,(config.kind==='whole'?[128,256]:[64,128,256,512]).map(n=>[n,config.kind==='whole'?n+' × '+(n*4)+' · cuerpo entero':n+' × '+n])),
      input('zoom','Zoom',config.zoom,[[1,'1×'],[1.5,'1,5×'],[1.75,'1,75×'],[2,'2×']]),
      field('Programación de cámara','Óseo · MDP'),field('Detectores','1 y 2'),
      input('collimator','Colimador',config.collimator,[['LEHR','LEHR'],['MELP','MELP'],['HE','HE'],['NONE','Sin colimador']]),
      input('energyCenter','Centro de energía (keV)',config.energyCenter,null,range(80,450,'1')),
      input('windowWidth','Ancho de ventana (%)',config.windowWidth,[10,15,20,25])]);
    positionControl(config);
    help('camera',config.kind==='whole'?'El barrido comienza donde está la camilla y alinea los detectores. Configura el seguimiento del contorno en «Condiciones de paro».':'La posición y distancia de los detectores se toman del gantry visible a la izquierda.');
    section('series','Radiofármaco',[field('Isótopo','99mTc'),field('Fármaco','MDP'),
      input('activityMci','Actividad inyectada (mCi)',config.activityMci,null,range(.1,2000/37)),
      input('minutes','Inyección–examen (min)',config.minutes,null,range(0,179.99))]);
    help('series','El reloj del MDP avanza durante la adquisición hasta el límite de 180 minutos.');
    if(config.kind==='dynamic'){
      section('stop','Secuencia dinámica',[input('phaseCount','Número de fases',(config.phases||[]).length||1,[1,2,3])]);
      for(let i=0;i<3;i++){
        const phase=config.phases?.[i]||{frames:30,seconds:2};
        section('stop','Fase '+(i+1),[input('phaseFrames'+i,'Imágenes · fase '+(i+1),phase.frames,null,range(1,240,'1')),
          input('phaseSeconds'+i,'Segundos por imagen · fase '+(i+1),phase.seconds,null,range(1,600,'1'))]);
      }
      const syncPhases=()=>{for(let i=0;i<3;i++){const enabled=i<Number(inputs.get('phaseCount').value);for(const key of ['phaseFrames','phaseSeconds']){const node=inputs.get(key+i);node.disabled=!enabled;node.closest('fieldset').hidden=!enabled;}}};
      inputs.get('phaseCount').onchange=syncPhases;syncPhases();
      help('stop','La secuencia termina al completar las fases. Inyectar y adquirir son acciones independientes. Las imágenes originales se conservan para revisar y corregir movimiento después.');
    }else section('stop',config.kind==='whole'?'Barrido de cuerpo entero':'Condiciones de paro',config.kind==='whole'?[
      input('velocity','Velocidad (cm/min)',config.velocity,null,range(.1,60)),
      input('contours','Contornos automáticos',config.contours||'auto',[['auto','Activados'],['fixed','Desactivados · distancia fija']]),
      field('Fin del barrido','Final del recorrido hacia los pies')]:[
      input('mode','Terminar por',config.mode,[['counts','Cuentas totales por detector'],['time','Tiempo por detector']]),
      input('target',config.mode==='time'?'Tiempo programado (s)':'Cuentas objetivo',config.target,null,range(1,config.mode==='time'?57600:160000000,'1')),
      field('Paro entre detectores','Cada detector al alcanzar su objetivo')]);
    if(config.kind==='whole')help('stop','Activados: los detectores siguen el contorno. Desactivados: mantienen las distancias actuales al isocentro durante el barrido. Deben dejar espacio seguro para todo el recorrido; la protección contra colisiones permanece activa.');
    section('stop','Nombres de imágenes',[
      input('name1','Imagen 1',config.names[0],null,{type:'text',maxLength:80}),
      input('name2','Imagen 2',config.names[1],null,{type:'text',maxLength:80})]);
    if(inputs.has('mode'))inputs.get('mode').onchange=()=>{
      const timed=inputs.get('mode').value==='time',target=inputs.get('target');target.max=timed?'57600':'160000000';target.value=timed?'300':'400000';
      const label=timed?'Tiempo programado (s)':'Cuentas objetivo';target.setAttribute('aria-label',label);target.parentElement.querySelector('label').textContent=label;
    };
    section('summary','Nueva adquisición',[field('Tipo',kindLabel),field('Origen','Gantry · fantoma ICRP 145')]);
    help('summary',config.kind==='whole'?
      'Fija los parámetros de cámara, la actividad y la velocidad de la camilla. El barrido termina al final del recorrido hacia los pies; no utiliza un límite de cuentas ni un tiempo programado.':
      'Fija los parámetros en «Parámetros de cámara», la actividad en «Información de serie» y el objetivo en «Condiciones de paro». Luego elige Iniciar adquisición en el menú Adquirir.');
    for(let i=0;i<2;i++){
      const panel=document.createElement('div');panel.className='draft-image';
      const title=document.createElement('div');title.className='image-head';title.textContent='Detector '+(i+1);
      const scan=document.createElement('div');scan.className='scan';const canvas=document.createElement('canvas');canvas.id='gantryDraftImage'+i;canvas.width=128;canvas.height=config.kind==='whole'?512:128;scan.append(canvas);
      const stats=document.createElement('div');stats.id='gantryDraftStats'+i;stats.className='draft-counts';stats.textContent='Pendiente de iniciar';
      const progress=document.createElement('progress');progress.id='gantryDraftProgress'+i;progress.className='draft-progress';progress.max=1;progress.value=0;
      panel.append(title,scan,progress,stats);$('images').append(panel);
    }
    if(resume)for(const node of inputs.values())node.disabled=true;
    $('tab-camera').click();status(resume?'Adquisición en curso.':'Nueva adquisición: configura estas casillas y selecciona Iniciar adquisición.');setMenu();
    const updateSummary=()=>{
      const get=key=>inputs.get(key)?.value;
      $('consoleSummary').textContent=`Parámetros de cámara · ${get('matrix')} · Zoom ${get('zoom')}× · ${get('collimator')} · ${get('energyCenter')} keV / ${get('windowWidth')}% · Ambos detectores`;
    };
    for(const node of inputs.values())node.addEventListener('input',updateSummary);
    updateSummary();
    if(!resume){
      draft.listId=window.GANTRY_PROCESSING_LIST?.configuration(config,listId||undefined);
      configurations.set(draft.listId,{config});
      for(const key of ['name1','name2'])inputs.get(key).addEventListener('input',()=>window.GANTRY_PROCESSING_LIST?.configuration(read(false),draft.listId));
      for(const key of cameraKeys)inputs.get(key).addEventListener('input',previewCamera);
      for(const key of ['activityMci','minutes'])inputs.get(key).addEventListener('input',updateAdministration);
      previewCamera();
    }
    updateModeUI();
  }
  function read(validate=true){
    const c={...draft.config};
    for(const [key,node] of inputs){if(validate&&!node.checkValidity()){node.reportValidity();throw Error('Revisa '+node.getAttribute('aria-label')+'.');}if(!key.startsWith('name'))c[key]=['collimator','mode','contours'].includes(key)?node.value:Number(node.value);}
    c.names=[inputs.get('name1').value,inputs.get('name2').value];
    if(c.kind==='dynamic')c.phases=Array.from({length:c.phaseCount},(_,i)=>({frames:c['phaseFrames'+i],seconds:c['phaseSeconds'+i]}));
    return validate?window.GANTRY_PROCESSING_CONFIG.validate(c):c;
  }
  function performAction(action){
    if(waiting)return;
    if(!actionModel?.actions.find(a=>a.id===action)?.enabled)return;
    try{
      if(action==='static'||action==='whole'||action==='dynamic'){
        request('GANTRY_ACQUIRE_CONFIG',{kind:action});
      }
      else if(action==='add'){
        const kind=recorded()?.acquisition?.kind;
        if(!['static','whole','dynamic'].includes(kind))throw Error('Selecciona una adquisición para agregar otra del mismo tipo.');
        request('GANTRY_ACQUIRE_CONFIG',{kind});
        status('Las adquisiciones anteriores se conservan. La nueva toma se agregará debajo en la lista.');
      }
      else if(action==='retake'||action==='delete'){
        const info=recorded(),id=draft&&!draft.id?draft.listId:info?.processing?.acquisitionId||info?.recordId;
        if(!id)throw Error('Selecciona la adquisición que quieres repetir.');
        confirmAction(action,id);
      }
      else if(action==='current')render(lastConfig,true);
      else if((action==='start'||action==='instant')&&draft&&!draft.id){
        const config=read();lastConfig=config;request('GANTRY_ACQUIRE_START',{config,instant:action==='instant'});
        for(const node of inputs.values())node.disabled=true;status('Preparando adquisición con los parámetros indicados…');
      }else request('GANTRY_ACQUIRE_ACTION',{action,id:lastId});
    }catch(error){status(error.message,'error');}
    setMenu();
  }
  menu.onchange=()=>{const action=menu.value;menu.value='';performAction(action);};
  window.addEventListener('message',event=>{
    if(event.source!==parent||event.origin!==location.origin||event.data?.version!==1)return;
    const d=event.data;
    if(d.type==='GANTRY_ADMINISTRATION_ERROR')status(d.error,'error');
    if(d.type==='GANTRY_ADMINISTRATION_STATE'&&draft&&!draft.id){
      for(const key of ['activityMci','minutes']){
        const node=inputs.get(key);
        if(node&&document.activeElement!==node&&Number.isFinite(d[key])){node.value=String(d[key]);draft.config[key]=d[key];}
      }
    }
    if(d.type==='GANTRY_CAMERA_PREVIEW_RESULT'&&d.preview===previewSerial&&d.error)status(d.error,'error');
    if(d.type==='GANTRY_POSITION_STATE')syncPosition(d.position);
    if(d.type==='GANTRY_ACQUIRE_POSITION'&&d.request===waiting){waiting=null;setMenu();syncPosition(d.position);}
    if(d.type==='GANTRY_ACQUIRE_CONFIG'&&d.request===waiting){waiting=null;render(d.config);}
    if(d.type==='GANTRY_ACQUIRE_RETAKE'&&d.request===waiting){
      waiting=null;finish();window.GANTRY_PROCESSING_LIST.remove(d.id);saved.delete(d.id);
      if(lastId===d.id){lastId=null;lastState=null;}render(d.config);
      status('Imágenes anteriores eliminadas. Revisa la posición del gantry y los parámetros antes de adquirir de nuevo.');
    }
    if(d.type==='GANTRY_ACQUIRE_DELETE'&&d.request===waiting){
      waiting=null;finish();window.GANTRY_PROCESSING_LIST.remove(d.id);saved.delete(d.id);
      if(lastId===d.id){lastId=null;lastState=null;}
      window.GANTRY_PROCESSING_LIST.selectLast();setMenu();status('Adquisición eliminada.');
    }
    if(d.type==='GANTRY_ACQUIRE_SAVED'){saved.set(d.id,d.error||'Guardada automáticamente en este navegador');setMenu();}
    if(d.type==='GANTRY_ACQUIRE_STARTED'&&d.request===waiting){
      waiting=null;lastId=d.id;lastState=null;const listId=draft?.listId;
      if(draft)draft.id=d.id;configurations.delete(listId);
      window.GANTRY_PROCESSING_LIST?.started(d.id,lastConfig,listId);updateModeUI();status('Adquiriendo desde el gantry…');setMenu();
    }
    if(d.type==='GANTRY_ACQUIRE_ERROR'&&(!d.request||d.request===waiting)){
      waiting=null;if(draft&&!draft.id)for(const node of inputs.values())node.disabled=false;status(d.error,'error');setMenu();syncPosition();
    }
    if(d.type==='GANTRY_ACQUIRE_ACTION_DONE'&&d.request===waiting){waiting=null;if(d.action==='save')status('Adquisición guardada en la caché de este navegador.');setMenu();}
    if(d.type==='GANTRY_ACQUIRE_PROGRESS'&&d.state?.id===lastId){
      lastState=d.state;window.GANTRY_PROCESSING_LIST?.progress(d.state);setMenu();if(!draft||draft.id!==lastId)return;
      d.state.heads.forEach((h,i)=>{
        const image=d.images[i],canvas=$('gantryDraftImage'+i);canvas.width=image.width;canvas.height=image.height;
        canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(image.rgba),image.width,image.height),0,0);
        const stats=$('gantryDraftStats'+i);stats.replaceChildren();
        const clock=seconds=>{const s=Math.max(0,Math.ceil(seconds));return Math.floor(s/3600).toString().padStart(2,'0')+':'+Math.floor(s/60%60).toString().padStart(2,'0')+':'+(s%60).toString().padStart(2,'0');};
        const remaining=d.state.mode==='time'?Math.max(0,d.state.target-h.elapsed):
          d.state.mode==='counts'&&h.total>0&&h.elapsed>0?Math.max(0,d.state.target-h.total)/(h.total/h.elapsed):null;
        const rows=[['Conteos',h.total.toLocaleString('es-CL')],['T. transcurrido',clock(Math.floor(h.elapsed))],
          ['T. restante'+(d.state.mode==='counts'?' estimado':''),h.done?'00:00:00':remaining===null?'—':clock(remaining)],
          ['Estado',h.done?'Meta alcanzada':d.state.paused?'En pausa':'Adquiriendo']];
        for(const [label,text] of rows){const row=document.createElement('div');row.className='stat';const caption=document.createElement('span');caption.textContent=label;const output=document.createElement('output');output.textContent=text;row.append(caption,output);stats.append(row);}
        const p=$('gantryDraftProgress'+i);p.max=d.state.target;p.value=d.state.mode==='scan'?d.state.travel:d.state.mode==='counts'?h.total:h.elapsed;
      });
      status(d.message+' · '+d.state.speed+'×'+(d.state.finished&&!d.state.heads.every(h=>h.total>0)?' · Sin señal en uno de los detectores; no se importa al procesador.':''));
    }
  });
  window.GANTRY_PROCESSING_EDITOR={finish,get currentId(){return draft?.id||draft?.listId;},showCurrent(id){
    if(waiting||draft?.listId===id||draft?.id===id)return;
    const pending=configurations.get(id);
    if(pending){render(pending.config,false,id);if(pending.tab)$(pending.tab)?.click();}
    else if(id===lastId)render(lastConfig,true);
    updateModeUI();
  }};setMenu();
})();
