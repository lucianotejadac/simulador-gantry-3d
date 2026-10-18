/* Menu-only acquisition console. Existing controls remain the authoritative
   commands, including their validation, collision locks and acquisition state. */
(function(){
  'use strict';
  const groups=[
    ['Zoom',['liveZoom1','liveZoom15','liveZoom175','liveZoom2'],'choice'],
    ['Matriz',['liveMatrix128','liveMatrix256'],'choice'],
    ['Centrado',['liveRecenter','liveResetCenter']],
    ['Imagen en vivo',['bonePause','boneClear']],
    ['MAG3',['injectMAG3','injectMAG3Instant']],
    ['Evolución MDP',['mdpPlay']],
    ['Evolución MIBI',['mibiPlay','mibiUsual','mibiLate']],
    ['Imagen final',['finalPreviewNoise']],
    ['Acciones de adquisición',['boneAcqStart','boneAcqInstant','boneAcqPause','boneAcqFinish','boneAcqFast','boneAcqSave','boneSendProcessing']],
    ['Confirmar adquisición',['boneAcqBegin','boneAcqSuggested','boneAcqCancel']],
    ['Examen',['examRestart']],
    ['Adquisición MAG3',['pause','finish','fast','instant']],
    ['Exportar MAG3',['png','export']]
  ];
  const reserved=new Set(groups.flatMap(g=>g[1])),bindings=[],roots=new Set();
  const handled=new WeakSet(),installed=new WeakMap();
  const labels={liveEnergyCenter:'Centro de ventana energética',bonePersistence:'Persistencia',
    boneAcqTarget:'Objetivo de adquisición',boneAcqVelocity:'Velocidad de camilla',
    boneAcqName1:'Nombre detector 1',boneAcqName2:'Nombre detector 2',
    mdpVoid:'Micción MDP',mibiVoid:'Micción MIBI',gain:'Ganancia MAG3'};
  function open(select){
    try{return select.matches(':open');}catch(_){return select.getRootNode().activeElement===select;}
  }
  function hide(node){node.classList.add('console-menu-source');node.setAttribute('aria-hidden','true');node.tabIndex=-1;}
  function menu(label,anchor){
    const select=document.createElement('select');select.className='console-menu live-study';
    select.setAttribute('aria-label',label);select.title=label;
    if(anchor.id)select.id=anchor.id+'Menu';
    anchor.before(select);return select;
  }
  function options(select,items){
    const signature=JSON.stringify(items);
    if(select.dataset.options===signature)return;
    select.replaceChildren(...items.map(([value,label,disabled=false])=>{
      const option=document.createElement('option');option.value=value;option.textContent=label;option.disabled=disabled;return option;
    }));select.dataset.options=signature;
  }
  function available(button){return button&&!button.hidden;}
  function buttonGroup(root,label,ids,kind,anchor){
    const select=menu(label,anchor);
    const getButtons=()=>ids.map(id=>root.getElementById(id)).filter(Boolean);
    const sync=()=>{
      const all=getButtons();all.forEach(hide);
      const buttons=all.filter(available);
      select.hidden=!buttons.length;
      if(label==='Imagen en vivo'&&window.GANTRY_LIVE?.signal.mode==='final')select.hidden=true;
      select.disabled=!buttons.some(b=>!b.disabled);
      if(open(select))return;
      const items=buttons.map(b=>[b.id,b.textContent.trim(),b.disabled]);
      if(kind!=='choice')items.unshift(['',label+'…',true]);
      options(select,items);
      select.value=kind==='choice'?(buttons.find(b=>b.getAttribute('aria-pressed')==='true')?.id||''):'';
    };
    select.addEventListener('change',()=>{
      const button=getButtons().find(b=>b.id===select.value);
      if(available(button)&&!button.disabled)button.click();
      syncAll();
    });
    bindings.push({select,sync});sync();
  }
  function standalone(button){
    const label=button.closest('.pixel-panel')?'Zona de cuentas':button.textContent.trim();
    const select=menu(label,button);hide(button);handled.add(button);
    const sync=()=>{select.hidden=button.hidden;select.disabled=button.disabled;if(open(select))return;
      options(select,[['',label+'…',true],['run',button.textContent.trim(),button.disabled]]);select.value='';};
    select.addEventListener('change',()=>{if(!button.disabled&&!button.hidden)button.click();syncAll();});
    bindings.push({select,sync});sync();
  }
  function numericChoices(input){
    const id=input.id,min=Number(input.min||0),max=Number(input.max||1e7);
    let list;
    if(input.type==='range'){
      const step=Number(input.step)||1,count=Math.round((max-min)/step);
      list=Array.from({length:Math.min(count+1,500)},(_,i)=>Number((min+i*step).toFixed(6)));
    }else if(/Activity$/.test(id)){
      list=[.1,.5,1,2,3,5,10,15,20,25,30,40,50];
      const unit=document.getElementById(id==='mdpActivity'?'mdpUnit':id==='mibiActivity'?'mibiUnit':'studyActivityUnit');
      if(unit?.value==='MBq')list=list.map(v=>v*37);
    }else if(/Minutes$/.test(id))list=[0,1,5,10,15,20,30,45,60,90,120,150,180,240,360,480,720];
    else if(id==='boneAcqVelocity')list=[1,2,3,5,7.5,10,12,15,20,25,30,40,50,60];
    else list=max<=3600?[1,5,10,15,30,60,120,180,300,600,900,1200,1800,3600]:[1000,10000,50000,100000,200000,400000,500000,1000000,2000000,5000000,10000000];
    list.push(Number(input.value));
    return [...new Set(list.filter(v=>Number.isFinite(v)&&v>=min&&v<=max))].sort((a,b)=>a-b);
  }
  function customValue(source,label){
    return new Promise(resolve=>{
      const dialog=document.createElement('dialog');dialog.className='console-custom-dialog';
      dialog.setAttribute('aria-label','Valor personalizado');
      const form=document.createElement('form'),title=document.createElement('h3');title.textContent=label;
      const field=document.createElement('label');field.textContent='Nuevo valor ';
      const input=source.cloneNode(false);input.removeAttribute('id');input.removeAttribute('class');
      input.removeAttribute('aria-hidden');input.removeAttribute('style');input.hidden=false;input.disabled=false;input.tabIndex=0;
      input.value=source.value;input.required=true;input.setAttribute('aria-label','Nuevo valor');field.append(input);
      const error=document.createElement('p');error.className='console-custom-error';error.setAttribute('role','alert');
      const action=document.createElement('select');action.className='console-menu';action.setAttribute('aria-label','Confirmar valor personalizado');
      options(action,[['','Seleccionar acción…',true],['apply','Aplicar'],['cancel','Cancelar']]);action.value='';
      function finish(value){dialog.close();dialog.remove();resolve(value);}
      function apply(){
        if(!input.value.trim()||!input.checkValidity()){
          error.textContent=input.validationMessage||'Introduce un valor válido.';action.value='';input.focus();return;
        }
        finish(input.value);
      }
      action.onchange=()=>action.value==='cancel'?finish(null):apply();
      form.onsubmit=e=>{e.preventDefault();apply();};
      dialog.oncancel=e=>{e.preventDefault();finish(null);};
      form.append(title,field,error,action);dialog.append(form);document.body.append(dialog);dialog.showModal();input.focus();input.select();
    });
  }
  function inputMenu(input){
    handled.add(input);hide(input);
    // The time menu replaces both the numeric input and its duplicate timeline.
    if(['mdpTimeline','mibiTimeline'].includes(input.id))return;
    const label=labels[input.id]||input.getAttribute('aria-label')||input.id;
    const select=menu(label,input);
    const sync=()=>{
      select.hidden=input.hidden;select.disabled=input.disabled;
      if(open(select))return;
      let items;
      if(input.type==='checkbox')items=[['yes','Sí'],['no','No']];
      else if(input.type==='text')items=[...new Set([input.value,'Detector 1','Detector 2','Anterior','Posterior','Lateral derecha','Lateral izquierda'])].filter(Boolean).map(v=>[v,v]);
      else items=numericChoices(input).map(v=>[String(v),v.toLocaleString('es-CL',{maximumFractionDigits:6})]);
      if(input.type!=='checkbox'&&input.type!=='range')items.push(['custom','Personalizado…']);
      options(select,items);
      select.value=input.type==='checkbox'?(input.checked?'yes':'no'):input.type==='text'?input.value:String(Number(input.value));
    };
    select.addEventListener('change',async()=>{
      if(input.disabled||input.hidden){sync();return;}
      const old=input.value;
      let value=select.value;
      if(value==='custom'){
        value=await customValue(input,label);
        if(value===null){sync();return;}
      }
      if(input.disabled||input.hidden){sync();return;}
      if(input.type==='checkbox')input.checked=value==='yes';
      else{
        input.value=value;
        if(!input.value.trim()||!input.checkValidity()||(input.maxLength>0&&input.value.length>input.maxLength)){
          input.value=old;sync();return;
        }
      }
      input.dispatchEvent(new Event(input.type==='range'?'input':'change',{bubbles:true}));
      syncAll();
    });
    bindings.push({select,sync});sync();
  }
  function discover(root){
    let done=installed.get(root);if(!done){done=new Set();installed.set(root,done);}
    for(const [label,ids,kind] of groups){
      if(done.has(label))continue;
      const anchor=ids.map(id=>root.getElementById(id)).find(Boolean);
      if(anchor){buttonGroup(root,label,ids,kind,anchor);done.add(label);}
    }
    const scope=root===document?document.getElementById('gantryLive'):root;
    scope.querySelectorAll('button').forEach(button=>{if(!reserved.has(button.id)&&!handled.has(button))standalone(button);});
    scope.querySelectorAll('input').forEach(input=>{if(!handled.has(input)&&input.type!=='hidden')inputMenu(input);});
  }
  function syncAll(){
    for(let i=bindings.length-1;i>=0;i--){if(!bindings[i].select.isConnected)bindings.splice(i,1);else bindings[i].sync();}
  }
  function refresh(){
    if(document.hidden)return;
    const shadow=document.getElementById('mag3Acquisition')?.shadowRoot;
    if(shadow){
      roots.add(shadow);
      if(!shadow.querySelector('link[data-console-menus]')){
        const link=document.querySelector('link[data-console-menus]').cloneNode();shadow.append(link);
      }
      // MAG3 replaces its shadow contents for each examination.
      if(!shadow.querySelector('.console-menu'))installed.delete(shadow);
    }
    for(const root of roots)discover(root);syncAll();
  }
  function init(){
    if(!document.getElementById('gantryLive'))return;
    roots.add(document);refresh();
    // Also mirrors property-only updates (values/checked) from the kinetic clock.
    setInterval(refresh,250);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
