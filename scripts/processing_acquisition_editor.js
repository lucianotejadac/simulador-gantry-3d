/* Acquisition drafts use the viewer's existing patient/camera/stop panes. */
(function(){
  'use strict';
  let draft=null,serial=0,waiting=null,lastConfig=null,lastId=null,lastState=null,previousBadge='';
  const retained=new Map(),inputs=new Map();
  const panes=['patient','summary','series','camera','stop','images'];
  const menu=document.createElement('select');menu.id='processingAcquireMenu';menu.setAttribute('aria-label','Adquirir');
  document.querySelector('.application-bar').prepend(menu);
  const style=document.createElement('style');style.textContent=`
    #processingAcquireMenu{max-width:235px;height:27px;font-size:12px;margin-right:6px}
    body.gantry-acquisition-draft .field :is(input:not([readonly]),select){background:#ffffe1;color:#000;width:100%;min-width:0;border:2px inset #eee;padding:3px;font:inherit;box-sizing:border-box}
    body.gantry-acquisition-draft :is(#static-overview,#acquisition-instance-wrap,.metadata,.viewer>.toolbar){display:none!important}
    body.gantry-acquisition-draft #acquisition-thumbnails{display:none}
    .draft-image{display:flex;flex-direction:column;min-height:0}.draft-image .scan{background:#000;min-height:120px}
    .draft-image canvas{width:100%;height:100%;object-fit:contain}.draft-counts{font-size:12px;padding:6px;background:#eee}
    .draft-progress{width:100%;height:8px}.draft-help{font-size:12px;line-height:1.4;margin:8px 0}
  `;document.head.append(style);
  const consoleBar=document.createElement('section');consoleBar.id='acquisitionConsole';
  consoleBar.setAttribute('aria-label','Control de adquisición');
  consoleBar.innerHTML=`
    <div class="console-summary" id="consoleSummary">Prepara una adquisición para configurar la cámara y las condiciones de paro.</div>
    <div class="console-prepare"><label for="consoleKind">Adquisición</label>
      <select id="consoleKind"><option value="static">Estática</option><option value="whole">Cuerpo entero</option></select>
      <button type="button" data-acquire="prepare">Preparar adquisición</button></div>
    <div class="console-transport">
      <button type="button" data-acquire="start" title="Iniciar adquisición"><b aria-hidden="true">▶</b> Iniciar</button>
      <button type="button" data-acquire="pause"><b aria-hidden="true">Ⅱ</b> <span>Pausar</span></button>
      <button type="button" data-acquire="stop"><b aria-hidden="true">■</b> Finalizar</button>
    </div>
    <div class="console-secondary">
      <button type="button" data-acquire="fast">▶▶ Avance rápido · 1×</button>
      <button type="button" data-acquire="instant">Adquisición instantánea</button>
      <button type="button" data-acquire="save">Guardar adquisición</button>
    </div>`;
  document.querySelector('#acquisition-panel .viewer').append(consoleBar);
  consoleBar.addEventListener('click',e=>{
    const button=e.target.closest('button[data-acquire]');
    if(button&&!button.disabled)performAction(button.dataset.acquire==='prepare'?$('consoleKind').value:button.dataset.acquire);
  });
  const send=data=>parent.postMessage({...data,version:1},location.origin);
  function request(type,extra={}){const id=++serial;waiting=id;send({type,request:id,...extra});return id;}
  function setMenu(){
    const running=!!lastId&&lastState?.finished!==true;
    const items=[['','Adquirir…'],['static','Nueva adquisición estática'],['whole','Nueva adquisición cuerpo entero']];
    if(draft&&!draft.id)items.push(['start','Iniciar adquisición'],['instant','Adquisición instantánea'],['cancel','Cancelar configuración']);
    if(lastId){
      if(!draft)items.push(['current','Ver adquisición actual']);
      if(running)items.push(['pause',lastState?.paused?'Reanudar':'Pausar'],['fast','Avance rápido · '+(lastState?.speed||1)+'×'],['instant','Adquisición instantánea'],['stop','Finalizar adquisición']);
      else if(!lastState?.cancelled)items.push(['save','Guardar adquisición en caché']);
    }
    const signature=JSON.stringify([items,running]);
    if(menu.dataset.signature!==signature){
      menu.replaceChildren(...items.map(([value,text])=>{const o=document.createElement('option');o.value=value;o.textContent=text;o.disabled=!value||(running&&['static','whole'].includes(value));return o;}));menu.value='';menu.dataset.signature=signature;
    }
    menu.disabled=!!waiting;
    const ready=!!draft&&!draft.id;
    for(const button of consoleBar.querySelectorAll('button[data-acquire]')){
      const action=button.dataset.acquire;
      const allowed=action==='prepare'?!running:action==='start'?ready:
        action==='instant'?(ready||running):action==='save'?(!!lastId&&!running&&!lastState?.cancelled):running;
      button.disabled=!!waiting||!allowed;
    }
    $('consoleKind').disabled=!!waiting||running;
    consoleBar.querySelector('[data-acquire="pause"] span').textContent=lastState?.paused?'Reanudar':'Pausar';
    consoleBar.querySelector('[data-acquire="fast"]').textContent='▶▶ Avance rápido · '+(lastState?.speed||1)+'×';
    if(draft)$('consoleKind').value=draft.config.kind;
  }
  function finish(){
    if(!draft)return;
    for(const [id,nodes] of retained)$(id).replaceChildren(...nodes);
    retained.clear();inputs.clear();draft=null;document.body.classList.remove('gantry-acquisition-draft');
    $('modality').textContent=previousBadge;
    updateModeUI();setMenu();
  }
  const originalSelect=selectMode;
  selectMode=function(...args){finish();return originalSelect(...args);};
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
    for(const n of $('stop').querySelectorAll('input[data-label]')){
      const v=n.dataset.label==='Tiempo programado'&&a.mode==='time'?a.target+' s':
        n.dataset.label==='Conteos de paro (Kcts)'&&a.mode==='counts'?(a.target/1000).toLocaleString('es-CL'):
        n.dataset.label==='Condición registrada'?(a.mode==='counts'?'Cuentas':a.mode==='time'?'Tiempo':'Barrido'):null;
      if(v!==null){n.value=v;n.classList.remove('missing');n.title='Parámetro registrado por el simulador al adquirir.';}
    }
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
    stopMetadata();
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
  function render(config,resume=false){
    finish();stopDynamic();closeFlexible();saveMode();
    for(const id of panes){retained.set(id,Array.from($(id).childNodes));$(id).replaceChildren();}
    draft={config,id:resume?lastId:null};document.body.classList.add('gantry-acquisition-draft');
    previousBadge=$('modality').textContent;$('modality').textContent='SIMULADO';
    $('mode-heading').textContent='Nueva adquisición '+(config.kind==='whole'?'cuerpo entero':'estática')+' · SIMULADA';
    $('patient').append(field('Paciente','Fantoma ICRP 145 · SIMULADO'),field('Estudio','Cintigrama óseo · 99mTc-MDP'),field('Serie',config.kind==='whole'?'Nueva · cuerpo entero':'Nueva · estática'));
    const range=(min,max,step='any')=>({min:String(min),max:String(max),step});
    section('camera','Parámetros de cámara',[
      input('matrix','Tamaño de matriz',config.matrix,[64,128,256,512].map(n=>[n,config.kind==='whole'?n+' columnas · cuerpo entero':n+' × '+n])),
      input('zoom','Zoom',config.zoom,[[1,'1×'],[1.5,'1,5×'],[1.75,'1,75×'],[2,'2×']]),
      field('Programación de cámara','Óseo · MDP'),field('Detectores','1 y 2'),
      input('collimator','Colimador',config.collimator,[['LEHR','LEHR'],['MELP','MELP'],['HE','HE'],['NONE','Sin colimador']]),
      input('energyCenter','Centro de energía (keV)',config.energyCenter,null,range(80,450,'1')),
      input('windowWidth','Ancho de ventana (%)',config.windowWidth,[10,15,20,25])]);
    section('camera','Calibraciones',[field('Corrección de uniformidad','Sin mapa de corrección')]);
    section('camera','Orientación',[field('Posición del cuerpo','Posición actual del gantry'),field('Configuración basada','Geometría actual del simulador')]);
    help('camera',config.kind==='whole'?'La matriz fija las columnas; las filas dependen del recorrido. El barrido comienza donde está la camilla y posiciona los detectores automáticamente.':'La posición y distancia de los detectores se toman del gantry visible a la izquierda.');
    section('series','Radiofármaco',[field('Isótopo','99mTc'),field('Fármaco','MDP'),
      input('activityMci','Actividad inyectada (mCi)',config.activityMci,null,range(.1,2000/37)),
      input('minutes','Inyección–examen (min)',config.minutes,null,range(0,179.99))]);
    help('series','El reloj del MDP avanza durante la adquisición hasta el límite de 180 minutos.');
    section('stop','Condiciones de paro',config.kind==='whole'?[
      input('velocity','Velocidad (cm/min)',config.velocity,null,range(.1,60)),field('Contornos automáticos','Activados'),field('Fin del barrido','Final del recorrido hacia los pies')]:[
      input('mode','Terminar por',config.mode,[['counts','Cuentas totales por detector'],['time','Tiempo por detector']]),
      input('target',config.mode==='time'?'Tiempo programado (s)':'Cuentas objetivo',config.target,null,range(1,config.mode==='time'?57600:160000000,'1')),
      field('Paro entre detectores','Cada detector al alcanzar su objetivo')]);
    section('stop','Nombres de imágenes',[
      input('name1','Imagen 1',config.names[0],null,{type:'text',maxLength:80}),
      input('name2','Imagen 2',config.names[1],null,{type:'text',maxLength:80})]);
    if(inputs.has('mode'))inputs.get('mode').onchange=()=>{
      const timed=inputs.get('mode').value==='time',target=inputs.get('target');target.max=timed?'57600':'160000000';target.value=timed?'300':'400000';
      const label=timed?'Tiempo programado (s)':'Cuentas objetivo';target.setAttribute('aria-label',label);target.parentElement.querySelector('label').textContent=label;
    };
    section('summary','Nueva adquisición',[field('Tipo',config.kind==='whole'?'Cuerpo entero':'Estática'),field('Origen','Gantry · fantoma ICRP 145')]);
    help('summary','Fija los parámetros en «Parámetros de cámara», la actividad en «Información de serie» y el objetivo en «Condiciones de paro». Luego elige Iniciar adquisición en el menú Adquirir.');
    for(let i=0;i<2;i++){
      const panel=document.createElement('div');panel.className='draft-image';
      const title=document.createElement('div');title.className='image-head';title.textContent='Detector '+(i+1);
      const scan=document.createElement('div');scan.className='scan';const canvas=document.createElement('canvas');canvas.id='gantryDraftImage'+i;canvas.width=128;canvas.height=config.kind==='whole'?320:128;scan.append(canvas);
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
  }
  function read(){
    const c={...draft.config};
    for(const [key,node] of inputs){if(!node.checkValidity()){node.reportValidity();throw Error('Revisa '+node.getAttribute('aria-label')+'.');}if(!key.startsWith('name'))c[key]=key==='collimator'||key==='mode'?node.value:Number(node.value);}
    c.names=[inputs.get('name1').value,inputs.get('name2').value];
    return window.GANTRY_PROCESSING_CONFIG.validate(c);
  }
  function performAction(action){
    if(waiting)return;
    try{
      if(action==='static'||action==='whole'){request('GANTRY_ACQUIRE_CONFIG',{kind:action});}
      else if(action==='cancel')finish();
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
    if(d.type==='GANTRY_ACQUIRE_CONFIG'&&d.request===waiting){waiting=null;render(d.config);}
    if(d.type==='GANTRY_ACQUIRE_STARTED'&&d.request===waiting){waiting=null;lastId=d.id;lastState=null;if(draft)draft.id=d.id;status('Adquiriendo desde el gantry…');setMenu();}
    if(d.type==='GANTRY_ACQUIRE_ERROR'&&(!d.request||d.request===waiting)){
      waiting=null;if(draft&&!draft.id)for(const node of inputs.values())node.disabled=false;status(d.error,'error');setMenu();
    }
    if(d.type==='GANTRY_ACQUIRE_ACTION_DONE'&&d.request===waiting){waiting=null;if(d.action==='save')status('Adquisición guardada en la caché de este navegador.');setMenu();}
    if(d.type==='GANTRY_ACQUIRE_PROGRESS'&&d.state?.id===lastId){
      lastState=d.state;setMenu();if(!draft||draft.id!==lastId)return;
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
  window.GANTRY_PROCESSING_EDITOR={finish};setMenu();
})();
