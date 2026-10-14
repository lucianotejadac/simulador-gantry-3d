/* Blocking load gate for startup and accepted study changes. */
(function(){
  'use strict';
  const el=id=>document.getElementById(id),dialog=el('startupLoading');
  let finished=false,failed=false,closing=false,poll=null,timeout=null;
  let initial=true,generation=0,study=null,studyLabel='';
  const done=new Set(),watching=new Set();
  const labels={scene:'escena 3D',patient:'paciente',room:'sala',equipment:'equipo',study:'proyecciones'};
  dialog.addEventListener('cancel',event=>event.preventDefault());
  // The HTML is already visible and the application inert before JS executes.
  // Promote the initial open dialog to the modal top layer (keyboard + pointer).
  dialog.removeAttribute('open');dialog.showModal();
  el('startupRetry').addEventListener('click',()=>{
    if(initial)location.reload();
    else window.GANTRY_LIVE.setStudy(study);
  });
  window.GANTRY_LOADING={studyChanged(next,label){
    // Startup already waits for the selected study, including demo setup.
    if(initial)return;
    generation++;clearInterval(poll);clearTimeout(timeout);
    finished=false;failed=false;closing=false;study=next;studyLabel=label;
    done.clear();watching.clear();
    const app=el('gantryWin');app.inert=true;app.setAttribute('aria-busy','true');
    el('startupTitle').textContent='Cargando…';
    el('startupDetail').textContent='Preparando '+studyLabel+'…';
    el('startupSpinner').hidden=false;el('startupProgress').hidden=false;
    el('startupProgress').max=1;el('startupProgress').value=0;
    el('startupRetry').hidden=true;
    if(!dialog.open)dialog.showModal();
    // setStudy has not applied the new selection yet; inspect it next tick.
    start(false);
  }};
  function fail(detail){
    if(finished||failed)return;
    failed=true;clearInterval(poll);clearTimeout(timeout);
    el('startupTitle').textContent='No se pudo completar la carga';
    el('startupDetail').textContent=detail+' Reintenta la carga para continuar.';
    el('startupSpinner').hidden=true;el('startupProgress').hidden=true;
    el('startupRetry').hidden=false;el('startupRetry').focus();
  }
  function watch(key,promise,valid){
    if(watching.has(key))return;watching.add(key);
    const token=generation;
    Promise.resolve(promise).then(()=>{
      if(token!==generation||failed||finished)return;
      if(valid())done.add(key);else fail('No se pudo cargar '+labels[key]+'.');
    },()=>{if(token===generation)fail('No se pudo cargar '+labels[key]+'.');});
  }
  function studyReady(live){
    if(!live?.ready||!live.state?.d1||!live.state?.d2)return false;
    if(!initial)return live.settings?.study===study&&live.state.d1.study===study&&live.state.d2.study===study;
    const demo=['oseo-brazos-arriba','mibi-brazos-arriba'].includes(new URLSearchParams(location.search).get('demo'));
    return !demo||window.GANTRY_DEMO_READY;
  }
  function tick(){
    if(finished||failed||closing)return;
    const scene=window.GANTRY3D,live=window.GANTRY_LIVE;
    if(initial&&scene){
      done.add('scene');
      watch('room',scene.room.ready,()=>!!scene.room.metadata&&scene.room.enabled);
      const simple=new URLSearchParams(location.search).get('equipo')==='simple';
      watch('equipment',scene.equipment.ready,()=>simple||!!scene.equipment.metadata&&scene.equipment.enabled);
      if(scene.patientLoadState==='ready')done.add('patient');
      if(scene.patientLoadState==='error'){fail('No se pudo cargar el paciente.');return;}
    }
    if(live?.loadError){fail('No se pudieron cargar las proyecciones'+(initial?' iniciales':' de '+studyLabel)+'.');return;}
    // Wait for demo setup, if requested, rather than its transient default study.
    if(studyReady(live))done.add('study');
    else done.delete('study');
    el('startupProgress').value=done.size;
    el('startupDetail').textContent='Preparando '+(initial?Object.keys(labels).filter(k=>!done.has(k)).map(k=>labels[k]).join(', '):studyLabel)+'…';
    if(done.size===(initial?5:1)){
      closing=true;const token=generation;
      el('startupDetail').textContent='Todo listo';
      // Let the newly loaded geometry and first detector images reach a frame.
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if(token!==generation||failed)return;
        if(!studyReady(window.GANTRY_LIVE)){closing=false;return;}
        clearInterval(poll);clearTimeout(timeout);
        finished=true;const app=el('gantryWin');app.inert=false;app.removeAttribute('aria-busy');
        dialog.close();el(initial?'acquisitionMenuButton':'liveStudy')?.focus({preventScroll:true});
        initial=false;
      }));
    }
  }
  function start(immediate=true){
    const token=generation;
    poll=setInterval(tick,100);
    timeout=setTimeout(()=>{if(token===generation)fail('La carga está tardando demasiado. Comprueba tu conexión.');},90000);
    if(immediate)tick();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
