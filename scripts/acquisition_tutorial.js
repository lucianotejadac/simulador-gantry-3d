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
      actions:['Abre Página flexible. El encabezado se completa automáticamente con el nombre, RUT y examen ingresados al crear la adquisición. Verifica esos datos; no necesitas volver a escribirlos ni establecer un encabezado.','En la primera página agrega sólo la secuencia de flujo de D1. Ajusta el mosaico, por ejemplo a 30 imágenes, incluyendo todos los frames.','Crea otra página y repite con el flujo de D2. Los dos detectores deben conservarse separados.','En una tercera página agrega las cuatro imágenes del pool: anterior/posterior D1/D2 y laterales D1/D2. Usa «Ordenar página» y ajusta rótulos, tamaño, centrado y contraste.','En una cuarta página agrega las cuatro tardías dirigidas: anterior/posterior D1/D2 y laterales D1/D2. Ordénalas igual que las del pool para facilitar la comparación.','En una quinta página agrega las dos imágenes de cuerpo completo tardío, D1 y D2. Colócalas una al lado de la otra, conservando la proporción 256 × 1024 y el cuerpo entero visible.','Los cuadros se agregan amontonados. Mueve el cuadro por su barra de título; arrastrar su interior desplaza la imagen.'],
      expected:'Cinco páginas: flujo D1, flujo D2, pool con laterales, tardías dirigidas con laterales y cuerpo completo tardío D1/D2. Se comprueba presencia de ambas imágenes de las seis adquisiciones, cobertura de frames y ausencia de solapamientos. Revisa tú la legibilidad y el encuadre.',
      question:'¿Un mosaico de 30 imágenes significa que se adquirieron 30 frames?',answer:'No necesariamente. Una secuencia de 60 frames puede mostrarse sumada de dos en dos. Comprueba los intervalos y que no se omitieron frames.',
      targets:[['Página flexible','mode-flex','flex'],['Agregar imágenes','flex-add-images','flex'],['Ordenar página','flex-arrange','flex']]},
    {title:'11. Revisar, exportar y comparar protocolos',text:'Comprueba cada página antes de entregar el trabajo. Al final encontrarás cómo habría cambiado el procedimiento para un estudio sólo tardío.',
      actions:['Recorre las páginas: identidad, región, fase, proyección y rótulos legibles; imágenes sin recortes ni superposiciones.','Selecciona cada página y pulsa Exportar PNG. Repite para todas las páginas del caso.','Abre los PNG descargados para comprobar el resultado. Si cambias una página, expórtala de nuevo.','En Herramientas puedes guardar también una copia del proyecto. El PNG corresponde a la página seleccionada.'],
      expected:'Cada página del caso tiene una exportación de su composición actual. La guía detecta la preparación del PNG; comprueba en Descargas que el navegador lo guardó.',
      question:'¿Qué entregarías para demostrar que se completó el protocolo?',answer:'El flujo de ambos detectores, el pool anterior/posterior y lateral, el cuerpo completo tardío y las estáticas tardías anterior/posterior y lateral, identificados y con tiempos coherentes. El cuerpo completo pertenece a la fase tardía; no es una cuarta fase.',
      targets:[['Exportar PNG','flex-export','flex'],['Herramientas','processingFileMenu','frame']],
      alternative:{title:'Si el estudio no hubiera sido trifásico',
        text:'Para una indicación que requiere sólo imágenes óseas tardías, como una evaluación de metástasis, el recorrido habría sido el siguiente:',
        actions:['Identificación y registro: consultarías la pulsera y la orden igual que antes. Al agregar la primera adquisición, elegirías «Nueva adquisición cuerpo entero» e ingresarías nombre, RUT y «Cintigrama óseo», sin añadir «trifásico». La decisión depende de los antecedentes, no sólo del nombre genérico de la orden.','Radiofármaco y espera: seleccionarías «99mTc-MDP · Óseo», registrarías la dosis administrada y el tiempo desde la inyección. Las imágenes tardías se obtienen habitualmente a las 2–4 h; para practicar aquí, usarías 180 min. En este modo del simulador ese intervalo representa una administración ya realizada. No programarías dinámica de flujo ni imágenes de pool.','Posición: observarías la orientación inicial aleatoria y usarías «Cambiar posición de paciente» si hace falta para dejarlo en supino, cabeza afuera. Declararías esa misma posición en cámara y llevarías la camilla hasta centrar el cráneo bajo los detectores antes del barrido (Z 200 cm). No sería necesario centrar primero los pies para una dinámica.','Adquisición tardía: aplicarías los parámetros docentes del paso 7 —matriz 256 × 1024, zoom 1×, LEHR, 140 keV, ventana 20 %, 10 cm/min y contornos automáticos— y adquirirías cuerpo entero anterior y posterior. Revisarías que ambos detectores incluyan desde el cráneo hasta los pies.','Vistas complementarias: agregarías estáticas dirigidas, incluidas laterales u oblicuas, cuando la indicación o los hallazgos requieran aclarar una región. No se exigen automáticamente todas las tomas de pies de este ejercicio ni laterales de pool. Cada toma conservaría la misma administración y el tiempo transcurrido.','Revisión y página flexible: ajustarías ventana y nivel, comprobarías los datos y agregarías las dos imágenes de cuerpo entero y las vistas complementarias obtenidas. Identificarías sus proyecciones, ordenarías los cuadros y exportarías cada página. No habría páginas de flujo ni de pool.'],
        takeaway:'Las imágenes tardías muestran la distribución ósea; no permiten recuperar retrospectivamente el flujo y el pool que no se adquirieron. En el caso de Matías se eligió el protocolo trifásico por sus antecedentes: esta comparación final no requiere borrar ni repetir el trabajo realizado.'}}
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
    if(s.alternative){
      const section=el('section');section.id='acquisitionTutorialAlternative';
      section.append(el('h2',s.alternative.title),el('p',s.alternative.text));
      const actions=el('ol');for(const text of s.alternative.actions)actions.append(el('li',text));section.append(actions,el('p',s.alternative.takeaway));
      const reference=el('a','Referencia: SNMMI · Bone Scintigraphy 4.0');reference.href=source;reference.target='_blank';reference.rel='noopener noreferrer';section.append(reference);body.append(section);
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
