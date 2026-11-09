/* Read-only checks for the acquisition tutorial. No patient or engine mutations. */
(function(root){
  'use strict';
  const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const caseId='caso-oseo';
  const forCase=r=>r?.patient?.id===caseId&&r.study==='bone';
  const complete=r=>forCase(r)&&!r.stoppedEarly&&r.heads?.length===2&&r.heads.every(h=>h.done&&h.total>0);
  const seconds=r=>Number(r.administration?.seconds);
  const scanPose=p=>p?.decubitus==='supine'&&p?.headFirst===false;
  function projectionPair(record,lateral=false){
    const expected=lateral?[90,270]:[0,180];
    const near=(a,b)=>Number.isFinite(a)&&Math.abs(((a-b+540)%360+360)%360-180)<=5;
    const matches=sample=>sample?.detectors?.length===2&&expected.every(angle=>
      sample.detectors.some(d=>near(d?.rawAngle,angle)));
    // Use recorded physical angles, never the editable image names or declared view.
    return matches(record.processing?.first)&&matches(record.processing?.last);
  }
  function phases(records=[]){
    const valid=records.filter(complete);
    return {
      flow:valid.filter(r=>r.acquisition.kind==='dynamic'&&seconds(r)>=0&&seconds(r)<=10&&r.dynamic?.timings?.length>=60),
      pool:valid.filter(r=>r.acquisition.kind==='static'&&seconds(r)>=60&&seconds(r)<600),
      delayed:valid.filter(r=>r.acquisition.kind==='static'&&seconds(r)>=7200&&seconds(r)<=14400),
      whole:valid.filter(r=>r.acquisition.kind==='whole'&&seconds(r)>=7200&&seconds(r)<=14400&&
        r.scan?.physicalPosition?.decubitus==='supine'&&r.scan?.physicalPosition?.headFirst===false&&
        r.scan?.startZ>=200-1e-3&&r.scan?.endZ<=16+1e-3&&r.scan?.travel>=175-1e-3)
    };
  }
  function evaluate(s){
    const v=s.viewer||{},seen=s.seen||{},p=phases(v.records),reg=s.registration;
    const pool=p.pool.filter(r=>projectionPair(r)),poolLateral=p.pool.filter(r=>projectionPair(r,true));
    const delayed=p.delayed.filter(r=>projectionPair(r)),delayedLateral=p.delayed.filter(r=>projectionPair(r,true));
    const validIdentity=!!reg&&normalize(reg.fullName)===normalize(s.identity?.fullName)&&normalize(reg.rut)===normalize(s.identity?.rut);
    const ids=new Set([...p.flow,...p.pool,...p.delayed,...p.whole].map(r=>r.id));
    const placed=new Set((v.pages||[]).flatMap(page=>page.items.map(i=>i.asset)));
    const hasPhase=records=>records.some(r=>{
      const assets=(v.assets||[]).filter(a=>a.acquisitionId===r.id);
      return assets.length>=2&&assets.every(a=>placed.has(a.id));
    });
    const relevantPages=(v.pages||[]).filter(page=>page.items.some(i=>ids.has(i.acquisitionId)));
    const check=(id,text,done)=>({id,text,done:!!done});
    return [
      [check('case','Matías Ignacio FANTOMA COMISION seleccionado',s.patientId===caseId),check('band','Pulsera consultada',seen.band),check('folder','Orden médica consultada',seen.folder)],
      [check('identity','Nombre y RUT coinciden con la pulsera',validIdentity),check('exam','Examen óseo trifásico registrado',normalize(reg?.examName).includes('ose')&&normalize(reg?.examName).includes('trif')),check('draft','Primera adquisición agregada',v.config?.kind==='dynamic'||p.flow.length)],
      [check('prepare','MDP trifásico preparado antes de inyectar',seen.prepared),check('physicalPosition','Paciente físico en supino y cabeza afuera para el barrido posterior',scanPose(s.physicalPosition)),check('declaredPosition','Cámara declarada en supino y cabeza afuera, igual que el paciente',scanPose(s.physicalPosition)&&scanPose(s.declaredPosition)),check('position','Encuadre de ambos pies revisado por ti',seen.position)],
      [check('camera','Cambiaste matriz y zoom o ventana',seen.camera),check('protocol','Restableciste LEHR, 140 keV y ventana de 15–20 %',seen.protocol)],
      [check('flow','Dinámica completa con señal en ambos detectores, iniciada entre 0 y 10 s',p.flow.length),check('playback','Fotogramas revisados',v.seen?.playback)],
      [check('pool','Pool anterior/posterior completo, iniciado entre 1 y menos de 10 min',pool.length),check('poolLateral','Pool lateral de ambos detectores completo, iniciado entre 1 y menos de 10 min',poolLateral.length)],
      [check('whole','Cuerpo completo de ambos detectores, de cráneo a pies, con inicio entre 2 y 4 h',p.whole.length)],
      [check('delayed','Tardía dirigida anterior/posterior completa, iniciada entre 2 y 4 h',delayed.length),check('delayedLateral','Tardía lateral de ambos detectores completa, iniciada entre 2 y 4 h',delayedLateral.length)],
      [check('analysis','Visualización / Análisis abierta sobre este caso',v.seen?.analysis),check('display','Ventana, nivel o inversión ajustados',v.seen?.display)],
      [check('header','Encabezado establecido',v.header),check('images','Ambos detectores de flujo, pool anterior/posterior y lateral, cuerpo completo y tardías anterior/posterior y lateral colocados',[p.flow,pool,poolLateral,p.whole,delayed,delayedLateral].every(hasPhase)),check('layout','Composición revisada: sin cuadros solapados ni dinámica incompleta',relevantPages.length&&!relevantPages.some(page=>page.overlaps||page.incomplete))],
      [check('export','Todas las páginas del caso exportadas en su versión actual',relevantPages.length&&relevantPages.every(page=>page.exported))]
    ];
  }
  const api={normalize,phases,projectionPair,evaluate,caseId};
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
    {title:'1. Paciente y orden médica',text:'Vamos a estudiar los pies y tobillos de Matías Ignacio FANTOMA COMISION. Las imágenes se generarán con tus decisiones en el simulador.',
      actions:['Selecciona «Matías Ignacio FANTOMA COMISION» en Paciente, debajo de la escena 3D.','Acércate y pulsa directamente la pulsera en la muñeca del paciente 3D; ciérrala con ×. En el paso 2 volverás a pulsar la muñeca para ingresar los datos; ahora no necesitas anotarlos. No hay botón de pulsera.','Abre Carpeta. Lee la orden y los antecedentes: qué región se solicita y qué se quiere investigar.','Todas las órdenes dicen deliberadamente «cintigrama oseo». Ese nombre genérico no determina las fases. Tú debes decidir, según el caso y sus antecedentes, si corresponde añadir «trifásico» al registrar el examen.'],
      expected:'Reconoces la pulsera y el nombre genérico de la orden. Para este paciente, la duda de compromiso óseo frente a partes blandas se abordará con flujo, pool y tardías, incluyendo cuerpo completo y vistas dirigidas: registrarás un cintigrama óseo trifásico.',
      question:'¿Todas las órdenes de cintigrama óseo implican un estudio trifásico?',answer:'No. La orden mantiene un nombre genérico como parte del ejercicio. Revisa el motivo y los antecedentes para decidir las fases. Aquí se practican las tres; en el caso oncológico se practican imágenes tardías de cuerpo entero y vistas dirigidas. La pulsera identifica al paciente y no decide el protocolo.',
      targets:[['Paciente','gantryPatient'],['Escena 3D y muñeca','g3dStage'],['Vistas de la sala','gantryViewControls'],['Carpeta','[aria-label="Abrir carpeta del paciente"]']]},
    {title:'2. Ingresar los datos',text:'El registro aparece al agregar la primera adquisición de este paciente. Las siguientes usarán la misma identificación.',
      actions:['Examen se abre por defecto. En el menú «Adquirir…», elige «Nueva adquisición dinámica».','Con el formulario abierto a la derecha, vuelve a pulsar la pulsera en la muñeca del paciente 3D. Puedes girar o acercar la vista para encontrarla. Copia el nombre completo y el RUT mientras consultas la pulsera.','La orden sólo dice «cintigrama oseo». Tras decidir las fases por los antecedentes de este caso, escribe «Cintigrama óseo trifásico» en Nombre del examen y pulsa «Guardar y continuar». El simulador no añade «trifásico» por ti.','Si necesitas corregirlos después, pulsa ▾ junto a Paciente, Estudio o los datos de Información de serie. Confirma «Sí, modificar datos», corrige y guarda.'],
      expected:'Aparece el primer cuadro de adquisición dinámica en la columna izquierda. El registro pide nombre, RUT y examen.',
      question:'¿Agregar una adquisición ya produce una imagen?',answer:'No. Crea una configuración pendiente; la imagen se obtiene al iniciar la adquisición. El cuadro permanece aunque consultes otro.',
      targets:[['Examen','boneProcessingTab'],['Menú Adquirir','processingAcquireMenu','frame']]},
    {title:'3. Preparar y posicionar',text:'Deja al paciente orientado desde el principio para el futuro barrido de cuerpo entero: supino, cabeza afuera y pies adentro. La dinámica inicial sólo incluirá los pies y tobillos.',
      actions:['La orientación inicial es aleatoria: la cabeza puede estar adentro o afuera. Observa al paciente en la escena 3D; no deduzcas su posición a partir de la declaración de cámara, que también puede ser distinta.','Antes de inyectar, con la camilla retirada y espacio libre alrededor del paciente, usa «Cambiar posición de paciente» si la cabeza está adentro. El botón invierte cabeza/pies. Déjalo con la cabeza afuera, los pies hacia el gantry y acostado boca arriba (supino). Si ya está así, conserva la posición; no lo inviertas sólo por pulsar el botón. Si el movimiento queda bloqueado por contacto, retira la camilla y aleja los detectores antes de intentarlo.','En Parámetros de cámara declara Supino y Cabeza afuera, de acuerdo con la escena 3D. Cambiar estos menús no mueve al paciente.','Selecciona «99mTc-MDP · Óseo trifásico». Para este ejercicio docente usa 20 mCi (740 MBq) y tiempo 0 min. Si ya figura Inyectado, termina cualquier adquisición y usa «Reiniciar inyección».','Mantén al paciente en esa orientación y usa el mando para centrar sólo ambos pies y tobillos bajo los detectores opuestos en 0° y 180°. Ajusta camilla, altura y distancia sin contacto; revisa el encuadre en la escena 3D, pues todavía no habrá señal. Marca la revisión visual al terminar.','Esta preparación permite el barrido posterior, pero aún no se barre: ahora se adquiere el flujo de los pies. En la fase tardía, sin invertir al paciente, moverás la camilla para comenzar el cuerpo completo con el cráneo bajo los detectores.'],
      expected:'Paciente en supino y cabeza afuera, con la misma posición declarada en cámara; MDP trifásico pendiente de inyección y pies/tobillos centrados para la dinámica. La vista en vivo permanece sin señal hasta Inyectar.',
      question:'¿Dejar al paciente listo para el cuerpo entero obliga a incluir todo el cuerpo en la dinámica?',answer:'No. La orientación del paciente se prepara desde el inicio, pero el campo depende de la camilla y los detectores. La dinámica registra sólo los pies; el cuerpo entero se inicia después desde el cráneo, manteniendo supino y cabeza afuera.',
      targets:[['Cambiar posición de paciente','changePatientPosition'],['Escena 3D','g3dStage'],['Posición declarada','gantryDraft-position-decubitus','camera'],['Radiofármaco','rfSelect'],['Dosis y tiempo','rfDose'],['Mando','mando']],manual:true},
    {title:'4. Ajustar la cámara',text:'Practica el cambio de parámetros antes de fijar la toma. La vista en vivo utiliza esos parámetros, pero seguirá negra mientras no hayas inyectado.',
      actions:['En Parámetros de cámara cambia la matriz y luego el zoom o el ancho de ventana. Despliega «Parámetros de cámara» en la vista en vivo para comprobar los valores activos.','Para el flujo de este ejercicio deja matriz 128 × 128, zoom 1×, programa Óseo · MDP, LEHR, centro 140 keV y ventana 20 %.','Abre Condiciones de paro: una fase, 60 imágenes de 1 s. Nombra las imágenes «Flujo · D1» y «Flujo · D2».','Después de inyectar podrás comparar la señal y las cuentas/s. En el pool y las tardías repite la prueba de parámetros y restablece los valores elegidos antes de adquirir.'],
      expected:'Dinámica preparada; los parámetros coinciden con los de la vista en vivo. Deja la guía lista en el siguiente paso antes de inyectar.',
      question:'¿Una matriz mayor debe aumentar las cuentas totales?',answer:'Con igual campo, tiempo y sensibilidad, cambia el reparto de cuentas entre píxeles. Las variaciones aleatorias del conteo no son por sí solas una ganancia de sensibilidad.',
      targets:[['Parámetros de cámara','gantryDraft-matrix','camera'],['Condiciones de paro','gantryDraft-phaseFrames0','stop'],['Cámara en vivo','liveCameraSettings']]},
    {title:'5. Adquirir el flujo',text:'Lee el paso completo antes de pulsar Inyectar. En este simulador la inyección y el inicio de adquisición son dos acciones independientes.',
      actions:['Comprueba que la dinámica está configurada y que el campo incluye sólo ambos pies y tobillos. Mantén al paciente en supino y cabeza afuera, preparado para el barrido posterior. Mantén visibles Inyectar e Iniciar adquisición.','Pulsa «Inyectar» y acto seguido «Iniciar adquisición». El programa actual exige este orden y prepara las proyecciones antes de comenzar; inyectar no inicia la captura por ti.','Observa el cambio de frame. Deja terminar la secuencia; puedes usar Avance rápido después de comprobar los primeros frames.','Selecciona la dinámica finalizada y usa Reproducir o el selector de fotograma para revisar la llegada de señal.'],
      expected:'Una secuencia por detector. La comprobación pide al menos 30 frames por detector, señal en ambos y un inicio registrado dentro de los primeros 10 s. Es una tolerancia docente; un inicio tardío puede perder el flujo inicial.',
      question:'¿La imagen mostrada durante la dinámica es la suma de toda la adquisición?',answer:'No. Se muestra el frame en curso. Los frames quedan registrados por separado para reproducirlos y corregir movimiento.',
      targets:[['Inyectar','rfInject'],['Iniciar adquisición','[data-acquire="start"]','frame'],['Revisar frames','dyn-play','frame']]},
    {title:'6. Adquirir el pool',text:'Adquiere el pool en anterior/posterior y también en laterales de los pies y tobillos. Conserva el flujo y usa la misma inyección.',
      actions:['Elige «Nueva adquisición estática». Con el paciente en supino, coloca los detectores opuestos en 0° y 180° para anterior/posterior. Nombra las imágenes «Pool anterior/posterior · D1» y «Pool anterior/posterior · D2».','Para practicar: matriz 256 × 256, zoom 1,75× si incluye la región, LEHR, 140 keV y 20 %. Si recorta, ajusta el zoom y el centrado.','Ajusta Inyección–examen a 3 min en el simulador. No pulses Reiniciar inyección.','En Condiciones de paro elige Tiempo por detector y 180 s. Completa la toma; puedes usar Avance rápido o Adquisición instantánea.','Agrega otra estática para «Pool lateral · D1» y «Pool lateral · D2». Retira los detectores lo necesario para girar sin contacto y usa Giro en CONTROL GANTRY hasta situarlos en 90° y 270°. Revisa el encuadre de pies y tobillos en ambas imágenes en vivo. El botón de vista Lateral sólo mueve la cámara 3D y no obtiene una proyección lateral.','Conserva los parámetros y adquiere las laterales durante 180 s por detector. El reloj estará aproximadamente en 6 min tras el primer pool: no lo retrocedas ni reinicies la inyección. Ambas adquisiciones deben comenzar antes de 10 min.'],
      expected:'Dos adquisiciones de pool completas: anterior/posterior y lateral, cada una con ambos detectores. Se comprueban el inicio entre 1 y menos de 10 min y los ángulos físicos registrados (tolerancia de 5°), no sólo los nombres.',
      question:'¿Por qué no reiniciar la inyección para el pool?',answer:'Flujo, pool y tardías representan momentos del mismo estudio. Reiniciar situaría el modelo de nuevo en el momento inicial.',
      targets:[['Agregar estática','processingAcquireMenu','frame'],['Tiempo desde inyección','rfTime'],['Giro de detectores','mando'],['Condición de paro','gantryDraft-mode','stop']]},
    {title:'7. Cuerpo completo tardío',text:'El protocolo de este tutorial incluye un barrido de cuerpo completo en la fase tardía, además de las vistas dirigidas de pies y tobillos. Conserva la misma inyección.',
      actions:['Elige «Nueva adquisición cuerpo entero». Ajusta Inyección–examen a 180 min (3 h), sin reiniciar la inyección. Comprueba la unidad.','Para adquirir todo el cuerpo, el paciente debe estar físicamente en supino y con la cabeza afuera (pies adentro). Compruébalo en la escena 3D y usa «Cambiar posición de paciente» si hace falta. En Parámetros de cámara declara también Supino y Cabeza afuera; la declaración por sí sola no mueve al paciente.','Antes de iniciar, lleva la camilla hasta centrar el cráneo bajo los detectores (Z 200 cm en este simulador). El barrido comienza en la posición actual y avanza hacia los pies; si partes desde los pies, no obtendrás un cuerpo completo.','En Parámetros de cámara configura matriz 256 × 1024, zoom 1×, programa Óseo · MDP, LEHR, 140 keV y ventana 20 %. Comprueba el centrado y que el ancho del campo incluya el cuerpo.','En Condiciones de paro usa 10 cm/min y contornos automáticos activados para este ejercicio. Nombra las imágenes «Cuerpo completo tardío · D1» y «Cuerpo completo tardío · D2». El barrido termina al completar el recorrido; no usa una meta de cuentas.','Inicia la adquisición y deja completar el barrido. Puedes usar Adquisición instantánea. Revisa que ambas imágenes incluyan desde el cráneo hasta los pies.'],
      expected:'Una adquisición de cuerpo entero en supino y cabeza afuera con los dos detectores, iniciada entre 2 y 4 h y con recorrido completo desde el cráneo hasta los pies. Se conserva junto al flujo y al pool.',
      question:'¿El cuerpo completo sustituye las imágenes tardías dirigidas?',answer:'En este protocolo docente se realizan ambos: el cuerpo completo aporta la vista general y las estáticas permiten revisar específicamente los pies y tobillos. Añádelas como adquisiciones distintas.',
      targets:[['Agregar cuerpo entero','processingAcquireMenu','frame'],['Tiempo desde inyección','rfTime'],['Mando','mando'],['Parámetros de cámara','gantryDraft-matrix','camera'],['Velocidad del barrido','gantryDraft-velocity','stop']]},
    {title:'8. Tardías dirigidas',text:'Después del cuerpo completo, adquiere anterior/posterior y laterales de los pies y tobillos sin borrar ninguna toma previa.',
      actions:['Agrega una nueva estática. Revisa los detectores opuestos en 0° y 180° y nombra las imágenes «Tardía anterior/posterior · D1» y «Tardía anterior/posterior · D2».','Conserva el tiempo transcurrido tras el cuerpo completo: debe seguir entre 2 y 4 h. No reinicies la inyección ni vuelvas el reloj a 180 min.','Vuelve a centrar ambos pies y tobillos. Revisa matriz 256 × 256, zoom 1,75× si permite incluir la región, LEHR, 140 keV y ventana 20 %. Para practicar el otro criterio de paro, selecciona Cuentas totales por detector y 200.000 cuentas.','Adquiere hasta completar la meta. Cada detector puede necesitar un tiempo distinto. Puedes completar con Adquisición instantánea.','Agrega otra estática para «Tardía lateral · D1» y «Tardía lateral · D2». Aleja los detectores antes de girarlos con el mando a 90° y 270°; comprueba el encuadre y ajusta su distancia sin contacto. Conserva los parámetros y completa otras 200.000 cuentas por detector, con inicio también entre 2 y 4 h.','Compara las laterales tardías con las del pool y las vistas anterior/posterior entre sí. Revisa la región y la orientación de cada imagen.'],
      expected:'Seis adquisiciones distintas: flujo, pool anterior/posterior, pool lateral, cuerpo completo tardío, tardía anterior/posterior y tardía lateral. Las vistas dirigidas tardías deben comenzar entre 2 y 4 h y registrar los ángulos correspondientes.',
      question:'¿Se puede cambiar la matriz de una imagen ya adquirida desde su ficha?',answer:'Los parámetros registrados están congelados. Para una toma distinta agrega una adquisición; «Adquirir de nuevo» sustituye las imágenes del cuadro seleccionado y pide confirmación.',
      targets:[['Nueva adquisición','processingAcquireMenu','frame'],['Tiempo desde inyección','rfTime'],['Giro de detectores','mando'],['Meta de cuentas','gantryDraft-target','stop']]},
    {title:'9. Revisar las imágenes',text:'Revisa las imágenes adquiridas y sus datos antes de componer la entrega.',
      actions:['Selecciona sucesivamente el pool anterior/posterior, el pool lateral, el cuerpo completo y ambas estáticas tardías; entra en «Visualización / Análisis». Comprueba el cuerpo completo de cráneo a pies en ambos detectores y el encuadre de las vistas dirigidas.','Ajusta ventana, nivel e inversión. Compara ambos detectores sin interpretar el brillo como una medida directa de captación.','Revisa en Adquisición los parámetros congelados, los ángulos y los tiempos utilizados. Compara pool y tardías en proyecciones equivalentes.','Opcional: agrega una ROI con nombre para medir. Enmascarar es una acción distinta; conserva visible la región de interés.'],
      expected:'La presentación cambia y las cuentas originales se conservan. Las ROI y el enmascaramiento pueden acompañar a la imagen en la página flexible.',
      question:'¿Ajustar ventana y nivel cambia la actividad adquirida?',answer:'No. Cambia cómo se muestran las cuentas. Las mediciones se hacen sobre los datos originales.',
      targets:[['Visualización / Análisis','[aria-controls="analysisPanel"]','frame'],['Ventana y nivel','analysisWindow','analysis'],['ROI opcional','roiAdd','analysis']]},
    {title:'10. Componer la página flexible',text:'La página comienza vacía. Agrega las imágenes que quieres presentar y ordénalas.',
      actions:['Abre Página flexible y «Agregar encabezado…». Verifica nombre, RUT y examen; aplica el encabezado.','En la primera página agrega sólo la secuencia de flujo de D1. Ajusta el mosaico, por ejemplo a 30 imágenes, incluyendo todos los frames.','Crea otra página y repite con el flujo de D2. Los dos detectores deben conservarse separados.','En una tercera página agrega las cuatro imágenes del pool: anterior/posterior D1/D2 y laterales D1/D2. Usa «Ordenar página» y ajusta rótulos, tamaño, centrado y contraste.','En una cuarta página agrega las cuatro tardías dirigidas: anterior/posterior D1/D2 y laterales D1/D2. Ordénalas igual que las del pool para facilitar la comparación.','En una quinta página agrega las dos imágenes de cuerpo completo tardío, D1 y D2. Colócalas una al lado de la otra, conservando la proporción 256 × 1024 y el cuerpo entero visible.','Los cuadros se agregan amontonados. Mueve el cuadro por su barra de título; arrastrar su interior desplaza la imagen.'],
      expected:'Cinco páginas: flujo D1, flujo D2, pool con laterales, tardías dirigidas con laterales y cuerpo completo tardío D1/D2. Se comprueba presencia de ambas imágenes de las seis adquisiciones, cobertura de frames y ausencia de solapamientos. Revisa tú la legibilidad y el encuadre.',
      question:'¿Un mosaico de 30 imágenes significa que se adquirieron 30 frames?',answer:'No necesariamente. Una secuencia de 60 frames puede mostrarse sumada de dos en dos. Comprueba los intervalos y que no se omitieron frames.',
      targets:[['Página flexible','mode-flex','flex'],['Encabezado','flex-add-header','flex'],['Agregar imágenes','flex-add-images','flex'],['Ordenar página','flex-arrange','flex']]},
    {title:'11. Revisar y exportar',text:'Comprueba cada página antes de entregar el trabajo.',
      actions:['Recorre las páginas: identidad, región, fase, proyección y rótulos legibles; imágenes sin recortes ni superposiciones.','Selecciona cada página y pulsa Exportar PNG. Repite para todas las páginas del caso.','Abre los PNG descargados para comprobar el resultado. Si cambias una página, expórtala de nuevo.','En Herramientas puedes guardar también una copia del proyecto. El PNG corresponde a la página seleccionada.'],
      expected:'Cada página del caso tiene una exportación de su composición actual. La guía detecta la preparación del PNG; comprueba en Descargas que el navegador lo guardó.',
      question:'¿Qué entregarías para demostrar que se completó el protocolo?',answer:'El flujo de ambos detectores, el pool anterior/posterior y lateral, el cuerpo completo tardío y las estáticas tardías anterior/posterior y lateral, identificados y con tiempos coherentes. El cuerpo completo pertenece a la fase tardía; no es una cuarta fase.',
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
      physicalPosition:{headFirst:window.GANTRY_PATIENT3D?.headFirst,decubitus:($('pos')?.value||'').toLowerCase().startsWith('pron')?'prone':'supine'},
      declaredPosition:{headFirst:window.GANTRY_ACQUISITION?.headFirst,decubitus:window.GANTRY_ACQUISITION?.decubitus},
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
    $('acquisitionTutorialCaseNotice').textContent='Esta guía corresponde a «Matías Ignacio FANTOMA COMISION». Selecciónalo para continuar; tus otras adquisiciones se conservan.';
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
    if([2,3,4,5,6,7].includes(step)){
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
    const panel=el('aside');panel.id='acquisitionTutorialPanel';panel.hidden=true;panel.setAttribute('aria-label','Tutorial de adquisición · Matías Ignacio FANTOMA COMISION');
    panel.innerHTML='<header><strong>Tutorial · Matías FANTOMA COMISION</strong><button type="button" id="acquisitionTutorialMinimize">Minimizar</button><button type="button" id="acquisitionTutorialClose" aria-label="Cerrar tutorial">×</button></header><div class="tutorial-navigation"><label>Paso <select id="acquisitionTutorialStep"></select></label><progress id="acquisitionTutorialProgress" max="10" value="0"></progress><span id="acquisitionTutorialProgressText"></span><p id="acquisitionTutorialCaseNotice"></p></div><div id="acquisitionTutorialBody"></div><footer><p id="acquisitionTutorialMessage" role="status"></p><div><button type="button" id="acquisitionTutorialPrevious">← Anterior</button><button type="button" id="acquisitionTutorialNext">Siguiente →</button></div><small>Puedes avanzar para leer; las marcas ✓ comprueban lo realizado. Minimizar conserva el paso.</small></footer>';
    document.body.append(panel);$('acquisitionTutorialProgress').max=steps.length;
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
