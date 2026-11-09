/* Guided practice beside the simulator. Only explicit locate buttons navigate. */
(function(){
  'use strict';
  const model=window.GANTRY_TUTORIAL_MODEL,$=id=>document.getElementById(id);
  const source='https://snmmi.org/common/Uploaded%20files/Web/Clinical%20Practice/Procedure%20Standards/2023/Bone%20Scintigraphy_UPDATED2024.pdf';
  const steps=[
    {title:'1. Paciente y orden médica',text:'Vamos a realizar el examen de Caso óseo: estudio trifásico de pies y tobillos. Las imágenes se generarán con tus decisiones en el simulador.',
      actions:['Selecciona «Caso óseo» en Paciente, debajo de la escena 3D.','Abre Pulsera para revisar la identificación y ciérrala con ×. En el paso 2 volverás a abrirla para ingresar los datos; ahora no necesitas anotarlos.','Abre Carpeta. Lee la orden y los antecedentes: qué región se solicita y qué se quiere investigar.'],
      expected:'Reconoces la pulsera y la orden de cintigrafía ósea trifásica de pies y tobillos. Los datos se ingresarán en el siguiente paso.',
      question:'¿Por qué debes consultar la pulsera y la orden antes de agregar adquisiciones?',answer:'La pulsera identifica al paciente; la orden define el examen y la región. El nombre del caso en el selector no sustituye esos datos.',
      targets:[['Paciente','gantryPatient'],['Pulsera','[aria-label="Ver pulsera del paciente"]'],['Carpeta','[aria-label="Abrir carpeta del paciente"]']]},
    {title:'2. Ingresar los datos',text:'El registro aparece al agregar la primera adquisición de este paciente. Las siguientes usarán la misma identificación.',
      actions:['Abre Examen y el menú «Adquirir…». Elige «Nueva adquisición dinámica».','En el formulario pulsa «Ver pulsera» para volver a abrirla en la escena 3D. Copia allí el nombre completo y el RUT.','En Nombre del examen escribe «Cintigrafía ósea trifásica». Pulsa «Guardar y continuar».','Si necesitas corregirlos después, pulsa ▾ junto a Paciente, Estudio o los datos de Información de serie. Confirma «Sí, modificar datos», corrige y guarda.'],
      expected:'Aparece el primer cuadro de adquisición dinámica en la columna izquierda. El registro pide nombre, RUT y examen.',
      question:'¿Agregar una adquisición ya produce una imagen?',answer:'No. Crea una configuración pendiente; la imagen se obtiene al iniciar la adquisición. El cuadro permanece aunque consultes otro.',
      targets:[['Examen','boneProcessingTab'],['Menú Adquirir','processingAcquireMenu','frame']]},
    {title:'3. Preparar y posicionar',text:'Prepara el campo antes de inyectar. En este ejercicio se compararán ambos pies y tobillos.',
      actions:['Selecciona «99mTc-MDP · Óseo trifásico». Para este ejercicio docente usa 20 mCi (740 MBq) y tiempo 0 min.','Si ya figura Inyectado, termina cualquier adquisición y usa «Reiniciar inyección» para practicar un nuevo inicio.','Con el mando ajusta camilla, giro y distancia hasta incluir ambos pies y tobillos. Comprueba el encuadre en la escena 3D; todavía no habrá señal.','En Parámetros de cámara revisa la posición declarada: debe coincidir con la postura y entrada reales. Marca la revisión visual al terminar.'],
      expected:'MDP trifásico pendiente de inyección, dosis preparada y campo centrado en la región. La vista en vivo permanece sin señal hasta Inyectar.',
      question:'¿Cambiar la posición declarada mueve al paciente?',answer:'No. La declaración orienta las imágenes. La posición física se modifica con el paciente y el mando del gantry.',
      targets:[['Radiofármaco','rfSelect'],['Dosis y tiempo','rfDose'],['Mando','mando'],['Posición declarada','gantryDraft-position-decubitus','camera']],manual:true},
    {title:'4. Ajustar la cámara',text:'Practica el cambio de parámetros antes de fijar la toma. La vista en vivo utiliza esos parámetros, pero seguirá negra mientras no hayas inyectado.',
      actions:['En Parámetros de cámara cambia la matriz y luego el zoom o el ancho de ventana. Despliega «Parámetros de cámara» en la vista en vivo para comprobar los valores activos.','Para el flujo de este ejercicio deja matriz 128 × 128, zoom 1×, programa Óseo · MDP, LEHR, centro 140 keV y ventana 20 %.','Abre Condiciones de paro: una fase, 60 imágenes de 1 s. Nombra las imágenes «Flujo · D1» y «Flujo · D2».','Después de inyectar podrás comparar la señal y las cuentas/s. En el pool y las tardías repite la prueba de parámetros y restablece los valores elegidos antes de adquirir.'],
      expected:'Dinámica preparada; los parámetros coinciden con los de la vista en vivo. Deja la guía lista en el siguiente paso antes de inyectar.',
      question:'¿Una matriz mayor debe aumentar las cuentas totales?',answer:'Con igual campo, tiempo y sensibilidad, cambia el reparto de cuentas entre píxeles. Las variaciones aleatorias del conteo no son por sí solas una ganancia de sensibilidad.',
      targets:[['Parámetros de cámara','gantryDraft-matrix','camera'],['Condiciones de paro','gantryDraft-phaseFrames0','stop'],['Cámara en vivo','liveCameraSettings']]},
    {title:'5. Adquirir el flujo',text:'Lee el paso completo antes de pulsar Inyectar. En este simulador la inyección y el inicio de adquisición son dos acciones independientes.',
      actions:['Comprueba que la dinámica está configurada. Mantén visibles Inyectar e Iniciar adquisición.','Pulsa «Inyectar» y acto seguido «Iniciar adquisición». El programa actual exige este orden y prepara las proyecciones antes de comenzar; inyectar no inicia la captura por ti.','Observa el cambio de frame. Deja terminar la secuencia; puedes usar Avance rápido después de comprobar los primeros frames.','Selecciona la dinámica finalizada y usa Reproducir o el selector de fotograma para revisar la llegada de señal.'],
      expected:'Una secuencia por detector. La comprobación pide al menos 30 frames por detector, señal en ambos y un inicio registrado dentro de los primeros 10 s. Es una tolerancia docente; un inicio tardío puede perder el flujo inicial.',
      question:'¿La imagen mostrada durante la dinámica es la suma de toda la adquisición?',answer:'No. Se muestra el frame en curso. Los frames quedan registrados por separado para reproducirlos y corregir movimiento.',
      targets:[['Inyectar','rfInject'],['Iniciar adquisición','[data-acquire="start"]','frame'],['Revisar frames','dyn-play','frame']]},
    {title:'6. Adquirir el pool',text:'Crea otra adquisición para conservar el flujo. Usa la misma inyección.',
      actions:['Elige «Nueva adquisición estática». Pon «Pool · D1» y «Pool · D2» en Condiciones de paro.','Para practicar: matriz 256 × 256, zoom 1,75× si incluye ambos pies, LEHR, 140 keV y 20 %. Si recorta la región, ajusta el zoom y el centrado.','Ajusta Inyección–examen a 3 min en el simulador. No pulses Reiniciar inyección.','En Condiciones de paro elige Tiempo por detector y 180 s. Inicia la toma. Puedes usar Avance rápido o Adquisición instantánea para completar el tiempo simulado.'],
      expected:'Una nueva estática completa. Se verifica el tiempo guardado al inicio (entre 1 y menos de 10 min), aunque hayas escrito otro nombre. Revisa las cuentas/s al cambiar parámetros antes de iniciar.',
      question:'¿Por qué no reiniciar la inyección para el pool?',answer:'Flujo, pool y tardías representan momentos del mismo estudio. Reiniciar situaría el modelo de nuevo en el momento inicial.',
      targets:[['Agregar estática','processingAcquireMenu','frame'],['Tiempo desde inyección','rfTime'],['Condición de paro','gantryDraft-mode','stop']]},
    {title:'7. Adquirir las tardías',text:'Conserva las adquisiciones previas y cambia el momento del estudio simulado.',
      actions:['Agrega una nueva estática y nombra sus imágenes «Tardía · D1» y «Tardía · D2».','Ajusta Inyección–examen a 180 min (3 h), sin reiniciar la inyección. Comprueba la unidad.','Revisa encuadre y parámetros. Para practicar el otro criterio de paro, selecciona Cuentas totales por detector y 200.000 cuentas.','Adquiere hasta completar la meta. Cada detector puede necesitar un tiempo distinto. Puedes completar con Adquisición instantánea.'],
      expected:'Flujo, pool y tardía aparecen como adquisiciones distintas. La tardía se identifica por un inicio registrado entre 2 y 4 h.',
      question:'¿Se puede cambiar la matriz de una imagen ya adquirida desde su ficha?',answer:'Los parámetros registrados están congelados. Para una toma distinta agrega una adquisición; «Adquirir de nuevo» sustituye las imágenes del cuadro seleccionado y pide confirmación.',
      targets:[['Nueva adquisición','processingAcquireMenu','frame'],['Tiempo desde inyección','rfTime'],['Meta de cuentas','gantryDraft-target','stop']]},
    {title:'8. Revisar las imágenes',text:'Revisa las imágenes adquiridas y sus datos antes de componer la entrega.',
      actions:['Selecciona la estática de pool o tardía y entra en «Visualización / Análisis».','Ajusta ventana, nivel e inversión. Compara ambos detectores sin interpretar el brillo como una medida directa de captación.','Revisa en Adquisición los parámetros congelados y los tiempos utilizados.','Opcional: agrega una ROI con nombre para medir. Enmascarar es una acción distinta; conserva visible la región de interés.'],
      expected:'La presentación cambia y las cuentas originales se conservan. Las ROI y el enmascaramiento pueden acompañar a la imagen en la página flexible.',
      question:'¿Ajustar ventana y nivel cambia la actividad adquirida?',answer:'No. Cambia cómo se muestran las cuentas. Las mediciones se hacen sobre los datos originales.',
      targets:[['Visualización / Análisis','[aria-controls="analysisPanel"]','frame'],['Ventana y nivel','analysisWindow','analysis'],['ROI opcional','roiAdd','analysis']]},
    {title:'9. Componer la página flexible',text:'La página comienza vacía. Agrega las imágenes que quieres presentar y ordénalas.',
      actions:['Abre Página flexible y «Agregar encabezado…». Verifica nombre, RUT y examen; aplica el encabezado.','En la primera página agrega sólo la secuencia de flujo de D1. Ajusta el mosaico, por ejemplo a 30 imágenes, incluyendo todos los frames.','Crea otra página y repite con el flujo de D2. Los dos detectores deben conservarse separados.','En una tercera página agrega las cuatro estáticas: pool D1/D2 y tardía D1/D2. Usa «Ordenar página» y ajusta rótulos, tamaño, centrado y contraste.','Los cuadros se agregan amontonados. Mueve el cuadro por su barra de título; arrastrar su interior desplaza la imagen.'],
      expected:'Tres páginas: flujo D1, flujo D2 y comparación pool/tardía. Se comprueba presencia de ambas imágenes por adquisición, cobertura de frames y ausencia de solapamientos. Revisa tú la legibilidad y el encuadre.',
      question:'¿Un mosaico de 30 imágenes significa que se adquirieron 30 frames?',answer:'No necesariamente. Una secuencia de 60 frames puede mostrarse sumada de dos en dos. Comprueba los intervalos y que no se omitieron frames.',
      targets:[['Página flexible','mode-flex','flex'],['Encabezado','flex-add-header','flex'],['Agregar imágenes','flex-add-images','flex'],['Ordenar página','flex-arrange','flex']]},
    {title:'10. Revisar y exportar',text:'Comprueba cada página antes de entregar el trabajo.',
      actions:['Recorre las páginas: identidad, región, fase, proyección y rótulos legibles; imágenes sin recortes ni superposiciones.','Selecciona cada página y pulsa Exportar PNG. Repite para todas las páginas del caso.','Abre los PNG descargados para comprobar el resultado. Si cambias una página, expórtala de nuevo.','En Herramientas puedes guardar también una copia del proyecto. El PNG corresponde a la página seleccionada.'],
      expected:'Cada página del caso tiene una exportación de su composición actual. La guía detecta la preparación del PNG; comprueba en Descargas que el navegador lo guardó.',
      question:'¿Qué entregarías para demostrar que se completaron las tres fases?',answer:'El flujo de ambos detectores y las imágenes de pool y tardías, identificadas y con tiempos coherentes. La composición debe permitir seguir el estudio sin confundir fases.',
      targets:[['Exportar PNG','flex-export','flex'],['Herramientas','processingFileMenu','frame']]}
  ];
  let open=false,minimized=false,step=0,seen={},timer,focusedBefore;
  const changed=new Set();let frameDocument;
  try{step=Math.max(0,Math.min(steps.length-1,Number(sessionStorage.getItem('gantry-acquisition-tutorial-step'))||0));}catch(_){}
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const button=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=fn;return b;};
  const frame=()=>$('boneProcessingFrame');
  const view=()=>frame()?.contentWindow?.GANTRY_TUTORIAL_VIEW;
  function observeFrame(){
    const doc=frame()?.contentDocument;if(!doc||doc===frameDocument)return;
    frameDocument=doc;
    const style=doc.createElement('style');style.textContent='.acquisition-tutorial-highlight{outline:3px solid #ffbf00!important;outline-offset:2px;box-shadow:0 0 0 5px #17499b!important}';doc.head.append(style);
    doc.addEventListener('change',event=>{
      if(window.GANTRY_PATIENT?.id!==model.caseId||event.target.disabled)return;
      const key=event.target.id?.replace('gantryDraft-','');
      if(['matrix','zoom','windowWidth'].includes(key))changed.add(key);
      if(changed.has('matrix')&&(changed.has('zoom')||changed.has('windowWidth')))seen.camera=true;
    });
  }
  function snapshot(){
    observeFrame();
    const patientId=window.GANTRY_PATIENT?.id,rf=window.GANTRY_RF,admin=rf?.metadata(),viewer=view()?.snapshot()||{};
    if(patientId===model.caseId){
      if(rf?.selected==='bone3'&&rf.pending()&&admin?.activityMBq>0&&admin.seconds<=.1)seen.prepared=true;
      const c=viewer.config;
      if(seen.camera&&c?.study==='bone'&&c.collimator==='LEHR'&&c.energyCenter===140&&[15,20].includes(c.windowWidth))seen.protocol=true;
    }
    const record=window.GANTRY_PATIENT_RECORD_DATA?.patients?.[model.caseId];
    return {patientId,registration:window.GANTRY_PATIENT_REGISTRATION?.current(model.caseId),
      identity:record?{fullName:[...record.givenNames,...record.surnames].join(' '),rut:record.rut}:null,seen,viewer};
  }
  function refresh(){
    if(!open)return;
    const s=snapshot(),checks=model.evaluate(s),done=checks.filter(group=>group.every(c=>c.done)).length;
    $('acquisitionTutorialProgress').value=done;
    $('acquisitionTutorialProgressText').textContent=done+' / '+steps.length+' pasos comprobados';
    for(let i=0;i<steps.length;i++)$('acquisitionTutorialStep').options[i].textContent=(checks[i].every(c=>c.done)?'✓ ':'')+steps[i].title;
    const list=$('acquisitionTutorialChecks');list.replaceChildren();
    for(const c of checks[step]){const li=el('li',(c.done?'✓ ':'○ ')+c.text);li.dataset.check=c.id;li.dataset.done=String(c.done);list.append(li);}
    $('acquisitionTutorialCaseNotice').hidden=s.patientId===model.caseId;
    $('acquisitionTutorialCaseNotice').textContent='Esta guía corresponde a «Caso óseo». Selecciónalo para continuar; tus otras adquisiciones se conservan.';
    if(step===4){
      const delayed=(s.viewer.records||[]).find(r=>r.patient?.id===model.caseId&&r.acquisition.kind==='dynamic'&&Number(r.administration?.seconds)>10);
      $('acquisitionTutorialRuntime').textContent=delayed?'Hay una dinámica iniciada '+Math.round(delayed.administration.seconds)+' s después de la inyección. No cumple el inicio temprano de este ejercicio. Prepara otra práctica desde 0 min; las imágenes actuales se conservan.':'';
    }
  }
  function render(){
    const s=steps[step],body=$('acquisitionTutorialBody');body.replaceChildren();
    body.append(el('h2',s.title),el('p',s.text));
    const list=el('ol');for(const line of s.actions)list.append(el('li',line));body.append(list);
    const targets=el('div',undefined,'tutorial-locate-buttons');
    for(const [label,id,scope] of s.targets)targets.append(button('Señalar '+label,()=>locate(id,scope)));
    body.append(targets);
    if(s.manual){const label=el('label',undefined,'tutorial-visual-check'),input=el('input');input.type='checkbox';input.checked=!!seen.position;input.onchange=()=>{seen.position=input.checked;refresh();};label.append(input,el('span','Revisé que ambos pies y tobillos queden en el campo'));body.append(label);}
    const expected=el('div',undefined,'tutorial-expected');expected.append(el('strong','Qué debería aparecer'),el('p',s.expected));body.append(expected);
    body.append(el('h3','Comprobación en el simulador'));
    const checks=el('ul');checks.id='acquisitionTutorialChecks';checks.setAttribute('aria-label','Comprobaciones del paso');body.append(checks);
    const runtime=el('p');runtime.id='acquisitionTutorialRuntime';body.append(runtime);
    const question=el('details');question.append(el('summary',s.question));const answer=el('details');answer.append(el('summary','Comprobar'),el('p',s.answer));question.append(el('p','Piensa tu respuesta antes de comprobarla.'),answer);body.append(question);
    if([2,3,4,5,6].includes(step)){
      const note=el('details');note.append(el('summary','Fundamento y valores del ejercicio'));
      note.append(el('p','Ejercicio docente con parámetros propuestos, no una prescripción individual. La guía SNMMI contempla flujo de 30–60 tomas de 1–3 s, pool precoz dentro de 10 min y tardías a las 2–4 h. El caso y su distribución son simulados.'));
      const a=el('a','SNMMI · Bone Scintigraphy 4.0');a.href=source;a.target='_blank';a.rel='noopener noreferrer';note.append(a);body.append(note);
    }
    $('acquisitionTutorialStep').value=String(step);$('acquisitionTutorialPrevious').disabled=step===0;
    $('acquisitionTutorialNext').disabled=step===steps.length-1;
    $('acquisitionTutorialCompactText').textContent=s.title;
    body.scrollTop=0;refresh();
    try{sessionStorage.setItem('gantry-acquisition-tutorial-step',String(step));}catch(_){}
  }
  function navigate(delta){step=Math.max(0,Math.min(steps.length-1,step+delta));render();}
  function clearHighlights(){window.GANTRY_TUTORIAL_SPOTLIGHT?.hide();for(const doc of [document,frameDocument])doc?.querySelectorAll('.acquisition-tutorial-highlight').forEach(n=>n.classList.remove('acquisition-tutorial-highlight'));}
  async function locate(selector,scope){
    try{
      let doc=document;
      if(scope){
        await window.GANTRY_PROCESSING.open();
        const deadline=Date.now()+15000;
        while(!view()&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,100));
        doc=frame()?.contentDocument;observeFrame();
        if(scope==='camera'||scope==='stop')doc?.getElementById('tab-'+scope)?.click();
        if(scope==='flex')doc?.getElementById('mode-flex')?.click();
        if(scope==='analysis')doc?.querySelector('[aria-controls="analysisPanel"]')?.click();
      }
      const target=doc?.querySelector(selector.startsWith('[')?selector:'#'+selector);
      for(let ancestor=target?.parentElement;ancestor;ancestor=ancestor.parentElement)if(ancestor.tagName==='DETAILS')ancestor.open=true;
      if(!target||!target.getClientRects().length){$('acquisitionTutorialMessage').textContent='Abre primero la adquisición o pestaña indicada en este paso. El control aún no está visible.';return;}
      clearHighlights();target.scrollIntoView({block:'center',inline:'nearest'});
      target.focus({preventScroll:true});$('acquisitionTutorialCompactText').textContent=steps[step].title+' · Control señalado';
      window.GANTRY_TUTORIAL_SPOTLIGHT.show(target,()=>setMinimized(true));
    }catch(_){$('acquisitionTutorialMessage').textContent='Espera a que termine la carga y vuelve a señalar el control.';}
  }
  function setMinimized(value){
    if(!value)clearHighlights();
    minimized=value;$('acquisitionTutorialPanel').hidden=!open||minimized;$('acquisitionTutorialCompact').hidden=!open||!minimized;
    if(open&&!minimized)$('acquisitionTutorialStep').focus();
  }
  function toggle(value){
    open=value;$('acquisitionTutorialOpen').setAttribute('aria-expanded',String(open));
    clearInterval(timer);
    if(open){focusedBefore=document.activeElement;setMinimized(false);render();timer=setInterval(refresh,1000);}
    else{setMinimized(false);clearHighlights();(focusedBefore?.isConnected?focusedBefore:$('acquisitionTutorialOpen')).focus();}
  }
  function init(){
    const trigger=button('Tutorial de adquisición',()=>toggle(true));trigger.id='acquisitionTutorialOpen';trigger.className='rights-trigger';trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls','acquisitionTutorialPanel');$('boneProcessingTab').parentElement.append(trigger);
    const panel=el('aside');panel.id='acquisitionTutorialPanel';panel.hidden=true;panel.setAttribute('aria-label','Tutorial de adquisición · Caso óseo');
    panel.innerHTML='<header><strong>Tutorial · Caso óseo</strong><button type="button" id="acquisitionTutorialMinimize">Minimizar</button><button type="button" id="acquisitionTutorialClose" aria-label="Cerrar tutorial">×</button></header><div class="tutorial-navigation"><label>Paso <select id="acquisitionTutorialStep"></select></label><progress id="acquisitionTutorialProgress" max="10" value="0"></progress><span id="acquisitionTutorialProgressText"></span><p id="acquisitionTutorialCaseNotice"></p></div><div id="acquisitionTutorialBody"></div><footer><p id="acquisitionTutorialMessage" role="status"></p><div><button type="button" id="acquisitionTutorialPrevious">← Anterior</button><button type="button" id="acquisitionTutorialNext">Siguiente →</button></div><small>Puedes avanzar para leer; las marcas ✓ comprueban lo realizado. Minimizar conserva el paso.</small></footer>';
    document.body.append(panel);
    const compact=el('div');compact.id='acquisitionTutorialCompact';compact.hidden=true;compact.append(el('span','',null));compact.firstChild.id='acquisitionTutorialCompactText';
    compact.append(button('Retomar guía',()=>setMinimized(false)),button('×',()=>toggle(false)));compact.lastChild.setAttribute('aria-label','Cerrar tutorial');document.body.append(compact);
    for(let i=0;i<steps.length;i++){const o=el('option',steps[i].title);o.value=String(i);$('acquisitionTutorialStep').append(o);}
    $('acquisitionTutorialStep').onchange=event=>{step=Number(event.target.value);$('acquisitionTutorialMessage').textContent='';render();};
    $('acquisitionTutorialPrevious').onclick=()=>navigate(-1);$('acquisitionTutorialNext').onclick=()=>navigate(1);
    $('acquisitionTutorialMinimize').onclick=()=>setMinimized(true);$('acquisitionTutorialClose').onclick=()=>toggle(false);
    panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();setMinimized(true);$('acquisitionTutorialOpen').focus();}});
    document.addEventListener('click',event=>{
      if(!open||window.GANTRY_PATIENT?.id!==model.caseId)return;
      if(event.target.closest('[aria-label="Ver pulsera del paciente"]'))seen.band=true;
      if(event.target.closest('[aria-label="Abrir carpeta del paciente"]'))seen.folder=true;
    });
    window.addEventListener('message',event=>{
      if(event.origin===location.origin&&event.source===frame()?.contentWindow&&event.data?.type==='GANTRY_TUTORIAL_OPEN'&&event.data.version===1)toggle(true);
    });
    window.GANTRY_ACQUISITION_TUTORIAL={open:()=>toggle(true),snapshot};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
