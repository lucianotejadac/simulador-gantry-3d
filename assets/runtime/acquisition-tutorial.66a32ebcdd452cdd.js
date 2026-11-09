/* Read-only checks for the acquisition tutorial. No patient or engine mutations. */
(function(root){
  'use strict';
  const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const caseId='caso-oseo';
  const forCase=r=>r?.patient?.id===caseId&&r.study==='bone';
  const complete=r=>forCase(r)&&!r.stoppedEarly&&r.heads?.length===2&&r.heads.every(h=>h.done&&h.total>0);
  const seconds=r=>Number(r.administration?.seconds);
  function phases(records=[]){
    const valid=records.filter(complete);
    return {
      flow:valid.filter(r=>r.acquisition.kind==='dynamic'&&seconds(r)>=0&&seconds(r)<=10&&r.dynamic?.timings?.length>=60),
      pool:valid.filter(r=>r.acquisition.kind==='static'&&seconds(r)>=60&&seconds(r)<600),
      delayed:valid.filter(r=>r.acquisition.kind==='static'&&seconds(r)>=7200&&seconds(r)<=14400)
    };
  }
  function evaluate(s){
    const v=s.viewer||{},seen=s.seen||{},p=phases(v.records),reg=s.registration;
    const validIdentity=!!reg&&normalize(reg.fullName)===normalize(s.identity?.fullName)&&normalize(reg.rut)===normalize(s.identity?.rut);
    const ids=new Set([...p.flow,...p.pool,...p.delayed].map(r=>r.id));
    const placed=new Set((v.pages||[]).flatMap(page=>page.items.map(i=>i.asset)));
    const hasPhase=records=>records.some(r=>{
      const assets=(v.assets||[]).filter(a=>a.acquisitionId===r.id);
      return assets.length>=2&&assets.every(a=>placed.has(a.id));
    });
    const relevantPages=(v.pages||[]).filter(page=>page.items.some(i=>ids.has(i.acquisitionId)));
    const check=(id,text,done)=>({id,text,done:!!done});
    return [
      [check('case','Matías Ignacio Fuentes Araya seleccionado',s.patientId===caseId),check('band','Pulsera consultada',seen.band),check('folder','Orden médica consultada',seen.folder)],
      [check('identity','Nombre y RUT coinciden con la pulsera',validIdentity),check('exam','Examen óseo trifásico registrado',normalize(reg?.examName).includes('ose')&&normalize(reg?.examName).includes('trif')),check('draft','Primera adquisición agregada',v.config?.kind==='dynamic'||p.flow.length)],
      [check('prepare','MDP trifásico preparado antes de inyectar',seen.prepared),check('position','Encuadre de ambos pies revisado por ti',seen.position)],
      [check('camera','Cambiaste matriz y zoom o ventana',seen.camera),check('protocol','Restableciste LEHR, 140 keV y ventana de 15–20 %',seen.protocol)],
      [check('flow','Dinámica completa con señal en ambos detectores, iniciada entre 0 y 10 s',p.flow.length),check('playback','Fotogramas revisados',v.seen?.playback)],
      [check('pool','Estática completa con inicio entre 1 y menos de 10 min',p.pool.length)],
      [check('delayed','Estática completa con inicio entre 2 y 4 h',p.delayed.length)],
      [check('analysis','Visualización / Análisis abierta sobre este caso',v.seen?.analysis),check('display','Ventana, nivel o inversión ajustados',v.seen?.display)],
      [check('header','Encabezado establecido',v.header),check('images','Ambos detectores de flujo, pool y tardía colocados',hasPhase(p.flow)&&hasPhase(p.pool)&&hasPhase(p.delayed)),check('layout','Composición revisada: sin cuadros solapados ni dinámica incompleta',relevantPages.length&&!relevantPages.some(page=>page.overlaps||page.incomplete))],
      [check('export','Todas las páginas del caso exportadas en su versión actual',relevantPages.length&&relevantPages.every(page=>page.exported))]
    ];
  }
  const api={normalize,phases,evaluate,caseId};
  root.GANTRY_TUTORIAL_MODEL=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);

/* A viewport spotlight works across the same-origin Examen iframe. */
(function(){
  'use strict';
  const ns='http://www.w3.org/2000/svg';let active=null,raf=0;
  const node=(tag,attrs={})=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
  const intersect=(a,b)=>({left:Math.max(a.left,b.left),top:Math.max(a.top,b.top),right:Math.min(a.right,b.right),bottom:Math.min(a.bottom,b.bottom)});
  function screenRect(target){
    if(!target.isConnected||!target.getClientRects().length)return null;
    let win=target.ownerDocument.defaultView,r=target.getBoundingClientRect();
    // Respect scroll panels: the hole must not expose an unrelated control.
    for(let p=target.parentElement;p;p=p.parentElement){
      const s=win.getComputedStyle(p);if(/auto|scroll|hidden|clip/.test(s.overflow+s.overflowX+s.overflowY))r=intersect(r,p.getBoundingClientRect());
    }
    r=intersect(r,{left:0,top:0,right:win.innerWidth,bottom:win.innerHeight});
    if(win!==window){
      const f=win.frameElement;if(!f?.getClientRects().length)return null;
      const b=f.getBoundingClientRect(),sx=b.width/f.offsetWidth,sy=b.height/f.offsetHeight;
      r={left:b.left+(f.clientLeft+r.left)*sx,right:b.left+(f.clientLeft+r.right)*sx,top:b.top+(f.clientTop+r.top)*sy,bottom:b.top+(f.clientTop+r.bottom)*sy};
    }
    r=intersect(r,{left:0,top:0,right:innerWidth,bottom:innerHeight});
    return r.right>r.left&&r.bottom>r.top?r:null;
  }
  function hide(){
    if(!active)return;
    cancelAnimationFrame(raf);active.events.abort();active.svg.remove();
    active.target.classList.remove('acquisition-tutorial-highlight');
    active.animation?.cancel();
    const panel=document.getElementById('acquisitionTutorialPanel');
    panel.classList.remove('tutorial-collapsing');
    if(!document.getElementById('acquisitionTutorialCompact').hidden)panel.hidden=true;
    document.getElementById('acquisitionTutorialCompact').removeAttribute('style');active=null;
  }
  function edge(r,point){
    const x=(r.left+r.right)/2,y=(r.top+r.bottom)/2,dx=point.x-x,dy=point.y-y;
    const scale=1/Math.max(Math.abs(dx)/Math.max(1,(r.right-r.left)/2),Math.abs(dy)/Math.max(1,(r.bottom-r.top)/2),1);
    return {x:x+dx*scale,y:y+dy*scale};
  }
  function show(target,minimize){
    hide();
    const panel=document.getElementById('acquisitionTutorialPanel'),compact=document.getElementById('acquisitionTutorialCompact'),origin=panel.getBoundingClientRect();
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    minimize();
    const destination=compact.getBoundingClientRect();
    const svg=node('svg',{id:'acquisitionTutorialSpotlight','aria-hidden':'true'}),shade=node('path',{'fill-rule':'evenodd',fill:'#020b16',opacity:'.76'}),ring=node('rect',{rx:5,fill:'none',stroke:'#ffd84d','stroke-width':3}),route=node('path',{fill:'none',stroke:'#ffd84d','stroke-width':2,opacity:'.25','stroke-dasharray':'6 7'});
    const trail=node('g'),head=node('path',{d:'M -17 -8 L 1 0 L -17 8 L -11 0 Z',fill:'#fff2a2',stroke:'#ffce35','stroke-width':2});
    const tails=Array.from({length:14},(_,i)=>{const p=node('path',{fill:'none',stroke:'#ffdc58','stroke-width':2+i*.24,opacity:.07+i*.065,'stroke-linecap':'round'});trail.append(p);return p;});
    svg.append(shade,ring,route,trail,head);document.body.append(svg);
    const events=new AbortController(),start=performance.now();active={svg,target,events};target.classList.add('acquisition-tutorial-highlight');
    if(!reduced){
      panel.hidden=false;panel.classList.add('tutorial-collapsing');
      const animation=panel.animate([{transform:'none',opacity:1},{transform:`translate(${destination.left-origin.left}px,${destination.top-origin.top}px) scale(${destination.width/origin.width},${destination.height/origin.height})`,opacity:0}],{duration:420,easing:'ease-in',fill:'forwards'});
      active.animation=animation;
      animation.finished.then(()=>{panel.hidden=true;panel.classList.remove('tutorial-collapsing');animation.cancel();}).catch(()=>{});
    }
    for(const doc of new Set([document,target.ownerDocument])){
      doc.addEventListener('pointerdown',hide,{capture:true,signal:events.signal});
      doc.addEventListener('keydown',hide,{capture:true,signal:events.signal});
    }
    function tick(now){
      if(!active)return;
      const r=screenRect(target);if(!r||now-start>8000){hide();return;}
      const pad=7,x=Math.max(1,r.left-pad),y=Math.max(1,r.top-pad),w=Math.min(innerWidth-1,r.right+pad)-x,h=Math.min(innerHeight-1,r.bottom+pad)-y;
      svg.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);
      shade.setAttribute('d',`M0 0H${innerWidth}V${innerHeight}H0Z M${x} ${y}H${x+w}V${y+h}H${x}Z`);
      for(const [k,v] of Object.entries({x,y,width:w,height:h}))ring.setAttribute(k,v);
      let bar=compact.getBoundingClientRect();
      if(Math.min(bar.right,r.right)>Math.max(bar.left,r.left)&&Math.min(bar.bottom,r.bottom)>Math.max(bar.top,r.top)){
        compact.style.right='auto';compact.style.left='14px';bar=compact.getBoundingClientRect();
        if(Math.min(bar.right,r.right)>Math.max(bar.left,r.left)&&Math.min(bar.bottom,r.bottom)>Math.max(bar.top,r.top)){compact.style.bottom='auto';compact.style.top='45px';bar=compact.getBoundingClientRect();}
      }
      const t=reduced?1:Math.min(1,(now-start)/420),from={};
      for(const k of ['left','right','top','bottom'])from[k]=origin[k]+(bar[k]-origin[k])*t;
      const a=edge(from,{x:(r.left+r.right)/2,y:(r.top+r.bottom)/2}),b=edge({left:x,top:y,right:x+w,bottom:y+h},a),bend=(a.x+b.x)/2;
      route.setAttribute('d',`M${a.x} ${a.y} C${bend} ${a.y},${bend} ${b.y},${b.x} ${b.y}`);
      const length=route.getTotalLength(),progress=reduced?1:Math.min(1,((now-start)%1900)/1300),end=length*progress,tail=Math.min(130,length*.3);
      for(let i=0;i<tails.length;i++){
        const p=route.getPointAtLength(Math.max(0,end-tail*(14-i)/14)),q=route.getPointAtLength(Math.max(0,end-tail*(13-i)/14));
        tails[i].setAttribute('d',`M${p.x} ${p.y}L${q.x} ${q.y}`);
      }
      const p=route.getPointAtLength(end),q=route.getPointAtLength(Math.max(0,end-2)),angle=Math.atan2(p.y-q.y,p.x-q.x)*180/Math.PI;
      head.setAttribute('transform',`translate(${p.x} ${p.y}) rotate(${angle})`);
      raf=requestAnimationFrame(tick);
    }
    raf=requestAnimationFrame(tick);
  }
  window.GANTRY_TUTORIAL_SPOTLIGHT={show,hide};
})();

/* Guided practice beside the simulator. Only explicit locate buttons navigate. */
(function(){
  'use strict';
  const model=window.GANTRY_TUTORIAL_MODEL,$=id=>document.getElementById(id);
  const source='https://snmmi.org/common/Uploaded%20files/Web/Clinical%20Practice/Procedure%20Standards/2023/Bone%20Scintigraphy_UPDATED2024.pdf';
  const steps=[
    {title:'1. Paciente y orden médica',text:'Vamos a estudiar los pies y tobillos de Matías Ignacio Fuentes Araya. Las imágenes se generarán con tus decisiones en el simulador.',
      actions:['Selecciona «Matías Ignacio Fuentes Araya» en Paciente, debajo de la escena 3D.','Acércate y pulsa directamente la pulsera en la muñeca del paciente 3D; ciérrala con ×. En el paso 2 volverás a pulsar la muñeca para ingresar los datos; ahora no necesitas anotarlos. No hay botón de pulsera.','Abre Carpeta. Lee la orden y los antecedentes: qué región se solicita y qué se quiere investigar.','Todas las órdenes dicen deliberadamente «cintigrama oseo». Ese nombre genérico no determina las fases. Tú debes decidir, según el caso y sus antecedentes, si corresponde añadir «trifásico» al registrar el examen.'],
      expected:'Reconoces la pulsera y el nombre genérico de la orden. Para este paciente, la duda de compromiso óseo frente a partes blandas se abordará con flujo, pool y tardías: registrarás un cintigrama óseo trifásico.',
      question:'¿Todas las órdenes de cintigrama óseo implican un estudio trifásico?',answer:'No. La orden mantiene un nombre genérico como parte del ejercicio. Revisa el motivo y los antecedentes para decidir las fases. Aquí se practican las tres; en el caso oncológico se practican imágenes tardías de cuerpo entero y vistas dirigidas. La pulsera identifica al paciente y no decide el protocolo.',
      targets:[['Paciente','gantryPatient'],['Escena 3D y muñeca','g3dStage'],['Vistas de la sala','gantryViewControls'],['Carpeta','[aria-label="Abrir carpeta del paciente"]']]},
    {title:'2. Ingresar los datos',text:'El registro aparece al agregar la primera adquisición de este paciente. Las siguientes usarán la misma identificación.',
      actions:['Examen se abre por defecto. En el menú «Adquirir…», elige «Nueva adquisición dinámica».','Con el formulario abierto a la derecha, vuelve a pulsar la pulsera en la muñeca del paciente 3D. Puedes girar o acercar la vista para encontrarla. Copia el nombre completo y el RUT mientras consultas la pulsera.','La orden sólo dice «cintigrama oseo». Tras decidir las fases por los antecedentes de este caso, escribe «Cintigrama óseo trifásico» en Nombre del examen y pulsa «Guardar y continuar». El simulador no añade «trifásico» por ti.','Si necesitas corregirlos después, pulsa ▾ junto a Paciente, Estudio o los datos de Información de serie. Confirma «Sí, modificar datos», corrige y guarda.'],
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
    $('acquisitionTutorialCaseNotice').textContent='Esta guía corresponde a «Matías Ignacio Fuentes Araya». Selecciónalo para continuar; tus otras adquisiciones se conservan.';
    if(step===4){
      const delayed=(s.viewer.records||[]).find(r=>r.patient?.id===model.caseId&&r.acquisition.kind==='dynamic'&&Number(r.administration?.seconds)>10);
      $('acquisitionTutorialRuntime').textContent=delayed?'Hay una dinámica iniciada '+Math.round(delayed.administration.seconds)+' s después de la inyección. No cumple el inicio temprano de este ejercicio. Prepara otra práctica desde 0 min; las imágenes actuales se conservan.':'';
    }
  }
  function render(){
    const s=steps[step],body=$('acquisitionTutorialBody');body.replaceChildren();
    body.append(el('h2',s.title),el('p',s.text));
    const list=el('ol');for(const line of s.actions)list.append(el('li',line));body.append(list);
    if(step===0){
      const navigation=el('details');navigation.open=true;navigation.append(el('summary','Cómo moverte y navegar por la sala 3D'));
      const tips=el('ul');for(const text of ['Arrastra con el botón izquierdo sobre la escena para girar alrededor del paciente.','Gira la rueda del ratón para acercarte o alejarte. Arrastra con el botón derecho para desplazar el encuadre lateral o verticalmente.','En pantalla táctil, un dedo gira la vista; dos dedos permiten desplazarla y hacer zoom con un gesto de pinza.','Vista sala recupera la vista general. Los botones 3D, Axial, Lateral y Superior recuperan vistas predefinidas; Mostrar/Ocultar sala cambia la visibilidad de las paredes y el mobiliario.','Estos gestos mueven la cámara, no al paciente ni a los detectores. Para mover el equipo usa el mando CONTROL GANTRY.','Para leer la pulsera, gira y acerca la vista hasta ver la muñeca sin que un detector la tape. Haz un clic breve sobre la pulsera; arrastrar no la abre.'])tips.append(el('li',text));
      navigation.append(tips);body.append(navigation);
    }
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
    const panel=el('aside');panel.id='acquisitionTutorialPanel';panel.hidden=true;panel.setAttribute('aria-label','Tutorial de adquisición · Matías Ignacio Fuentes Araya');
    panel.innerHTML='<header><strong>Tutorial · Matías Fuentes</strong><button type="button" id="acquisitionTutorialMinimize">Minimizar</button><button type="button" id="acquisitionTutorialClose" aria-label="Cerrar tutorial">×</button></header><div class="tutorial-navigation"><label>Paso <select id="acquisitionTutorialStep"></select></label><progress id="acquisitionTutorialProgress" max="10" value="0"></progress><span id="acquisitionTutorialProgressText"></span><p id="acquisitionTutorialCaseNotice"></p></div><div id="acquisitionTutorialBody"></div><footer><p id="acquisitionTutorialMessage" role="status"></p><div><button type="button" id="acquisitionTutorialPrevious">← Anterior</button><button type="button" id="acquisitionTutorialNext">Siguiente →</button></div><small>Puedes avanzar para leer; las marcas ✓ comprueban lo realizado. Minimizar conserva el paso.</small></footer>';
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
      if(event.target.closest('[aria-label="Abrir carpeta del paciente"]'))seen.folder=true;
    });
    window.addEventListener('gantry-patient-record-open',event=>{
      if(open&&event.detail?.patientId===model.caseId&&event.detail.view==='band'){seen.band=true;refresh();}
    });
    window.addEventListener('message',event=>{
      if(event.origin===location.origin&&event.source===frame()?.contentWindow&&event.data?.type==='GANTRY_TUTORIAL_OPEN'&&event.data.version===1)toggle(true);
    });
    window.GANTRY_ACQUISITION_TUTORIAL={open:()=>toggle(true),snapshot};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
