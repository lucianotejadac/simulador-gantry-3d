/* First-page load gate. Only the selected study/pose is required. */
(function(){
  'use strict';
  const el=id=>document.getElementById(id),dialog=el('startupLoading');
  let finished=false,failed=false,closing=false,poll=null,timeout=null;
  const done=new Set(),watching=new Set();
  const labels={scene:'escena 3D',patient:'paciente',room:'sala',equipment:'equipo',study:'proyecciones'};
  dialog.addEventListener('cancel',event=>event.preventDefault());
  // The HTML is already visible and the application inert before JS executes.
  // Promote the initial open dialog to the modal top layer (keyboard + pointer).
  dialog.removeAttribute('open');dialog.showModal();
  el('startupRetry').addEventListener('click',()=>location.reload());
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
    Promise.resolve(promise).then(()=>{
      if(failed||finished)return;
      if(valid())done.add(key);else fail('No se pudo cargar '+labels[key]+'.');
    },()=>fail('No se pudo cargar '+labels[key]+'.'));
  }
  function tick(){
    if(finished||failed||closing)return;
    const scene=window.GANTRY3D,live=window.GANTRY_LIVE;
    if(scene){
      done.add('scene');
      watch('room',scene.room.ready,()=>!!scene.room.metadata&&scene.room.enabled);
      const simple=new URLSearchParams(location.search).get('equipo')==='simple';
      watch('equipment',scene.equipment.ready,()=>simple||!!scene.equipment.metadata&&scene.equipment.enabled);
      if(scene.patientLoadState==='ready')done.add('patient');
      if(scene.patientLoadState==='error'){fail('No se pudo cargar el paciente.');return;}
    }
    if(live?.loadError){fail('No se pudieron cargar las proyecciones iniciales.');return;}
    // Wait for demo setup, if requested, rather than its transient default study.
    const demo=['oseo-brazos-arriba','mibi-brazos-arriba'].includes(new URLSearchParams(location.search).get('demo'));
    if(live?.ready&&live.state?.d1&&live.state?.d2&&(!demo||window.GANTRY_DEMO_READY))done.add('study');
    else done.delete('study');
    el('startupProgress').value=done.size;
    el('startupDetail').textContent='Preparando '+Object.keys(labels).filter(k=>!done.has(k)).map(k=>labels[k]).join(', ')+'…';
    if(done.size===5){
      closing=true;clearInterval(poll);clearTimeout(timeout);
      el('startupDetail').textContent='Todo listo';
      // Let the newly loaded geometry and first detector images reach a frame.
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        if(failed)return;
        finished=true;const app=el('gantryWin');app.inert=false;app.removeAttribute('aria-busy');
        dialog.close();dialog.remove();el('acquisitionMenuButton')?.focus({preventScroll:true});
      }));
    }
  }
  function start(){
    poll=setInterval(tick,100);
    timeout=setTimeout(()=>fail('La carga está tardando demasiado. Comprueba tu conexión.'),90000);
    tick();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
