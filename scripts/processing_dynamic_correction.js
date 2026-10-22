/* Derived display only: original DICOM counts remain immutable. Store offsets,
   not duplicate image sequences, and restore them when revisiting a series. */
(function(){
  'use strict';
  const records=new Map();let active=null;
  const box=document.createElement('details');box.id='dynamicCorrection';box.hidden=true;
  box.innerHTML='<summary>Corrección de movimiento de frames</summary><p>Revisa los cambios de captación antes de aceptar un desplazamiento. Cada detector se corrige por separado. Las imágenes originales se conservan.</p><label>Detector <select id="corrDetector"><option value="0">1</option><option value="1">2</option></select></label> <label>Frame de referencia <input id="corrReference" type="number" min="1" value="1" step="1"></label> <button id="corrEstimate">Proponer desplazamiento</button><br><label>X (píxeles, derecha +) <input id="corrX" type="number" value="0" step="1"></label> <label>Y (píxeles, abajo +) <input id="corrY" type="number" value="0" step="1"></label> <button id="corrApply">Aplicar al frame</button> <button id="corrReset">Restaurar frame</button> <button id="corrResetAll">Restaurar secuencia</button><br><label>Mostrar <select id="corrView"><option value="corrected">Corregida</option><option value="original">Original</option></select></label><p id="corrStatus" role="status"></p><p>Los bordes sin medición quedan en cero. La corrección se guarda en este navegador. El archivo original y la página flexible conservan las cuentas originales.</p>';
  document.querySelector('#acquisition-panel .viewer').append(box);
  const style=document.createElement('style');style.textContent='#dynamicCorrection{padding:8px;border:2px groove #fff;font:12px Arial}#dynamicCorrection input{width:65px}#dynamicCorrection p{line-height:1.4}#dynamicCorrection[hidden]{display:none}';document.head.append(style);
  function info(){try{return JSON.parse(value(dataset,'00111010'));}catch(_){return null;}}
  function state(){
    const metadata=info();if(!pixels||currentMode!=='dynamic'||!metadata?.dynamic)return null;
    const uid=dataset.string('x00080018');let s=records.get(uid);
    if(!s){s={uid,offsets:{}};try{s.offsets=JSON.parse(localStorage.getItem('gantry.correction.'+uid)||'{}');}catch(_){}records.set(uid,s);}
    return s;
  }
  function selected(){return Number($('frame-'+$('corrDetector').value)?.value);}
  function sync(){
    active=state();box.hidden=!active||!!window.GANTRY_PROCESSING_EDITOR?.currentId;if(box.hidden)return;
    const f=selected(),o=active.offsets[f]||{dx:0,dy:0};$('corrX').value=o.dx;$('corrY').value=o.dy;
    const n=num(dataset,'00280011');for(const id of ['corrX','corrY']){$(id).min=1-n;$(id).max=n-1;}
    $('corrReference').max=dynamicSteps.length;
  }
  function persist(){try{localStorage.setItem('gantry.correction.'+active.uid,JSON.stringify(active.offsets));return true;}catch(_){return false;}}
  const originalRender=render;
  render=function(i){
    const s=state(),f=Number($('frame-'+i)?.value),o=s?.offsets[f],original=pixels;
    if(!o||$('corrView').value==='original')return originalRender(i);
    const n=num(dataset,'00280011');
    if(!Number.isInteger(o.dx)||!Number.isInteger(o.dy)||Math.abs(o.dx)>=n||Math.abs(o.dy)>=n)return originalRender(i);
    const start=f*frameSize,raw=original.slice(start,start+frameSize),derived=window.GANTRY_FRAME_CORRECTION.shift(raw,n,o.dx,o.dy);
    // Render one corrected frame with bounded scratch storage, then restore.
    try{pixels.set(derived.counts,start);const result=originalRender(i);$('caption-'+i).textContent+=' · corregida';return result;}
    finally{original.set(raw,start);pixels=original;}
  };
  const originalStep=setDynamicStep;setDynamicStep=function(...args){const result=originalStep(...args);sync();return result;};
  const originalMode=updateModeUI;updateModeUI=function(...args){const r=originalMode(...args);sync();return r;};
  const originalDuration=frameDuration;frameDuration=function(f){const timing=info()?.dynamic?.timings?.[f];return timing?(timing.end-timing.start)*1000:originalDuration(f);};
  $('corrDetector').onchange=sync;$('corrView').onchange=()=>renderAll();
  const act=fn=>()=>{stopDynamic();try{if(!state())return;fn();}catch(e){$('corrStatus').textContent=e.message;}};
  $('corrEstimate').onclick=act(()=>{
    const f=selected(),step=dynamicSteps[Number($('corrReference').value)-1],reference=step?.frames[Number($('corrDetector').value)+1];
    if(reference===undefined||reference===f)throw Error('Elige otro frame de referencia del mismo detector.');
    const n=num(dataset,'00280011'),r=window.GANTRY_FRAME_CORRECTION.estimate(pixels.subarray(reference*frameSize,(reference+1)*frameSize),pixels.subarray(f*frameSize,(f+1)*frameSize),n);
    if(!r.reliable)throw Error(r.reason);
    $('corrX').value=r.dx;$('corrY').value=r.dy;$('corrStatus').textContent='Propuesta: X '+r.dx+', Y '+r.dy+' píxeles. Revisa y pulsa Aplicar al frame.';
  });
  $('corrApply').onclick=act(()=>{
    const f=selected(),dx=Number($('corrX').value),dy=Number($('corrY').value),n=num(dataset,'00280011');
    if(!$('corrX').value||!$('corrY').value)throw Error('Indica X e Y.');
    const result=window.GANTRY_FRAME_CORRECTION.shift(pixels.subarray(f*frameSize,(f+1)*frameSize),n,dx,dy);
    active.offsets[f]={dx,dy};const saved=persist();$('corrView').value='corrected';renderAll();
    $('corrStatus').textContent='Frame '+(f+1)+' corregido · '+result.lost.toLocaleString('es-CL')+' cuentas fuera del campo.'+(saved?' Guardado.':' No se pudo guardar; conserva esta pestaña.');
  });
  $('corrReset').onclick=act(()=>{delete active.offsets[selected()];persist();renderAll();sync();$('corrStatus').textContent='Frame original restaurado.';});
  $('corrResetAll').onclick=act(()=>{active.offsets={};persist();renderAll();sync();$('corrStatus').textContent='Secuencia original restaurada.';});
  window.GANTRY_DYNAMIC_CORRECTION={sync,offset(f){return state()?.offsets[f]||{dx:0,dy:0};}};
})();
