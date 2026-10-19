/* Generic detector presets. Angles describe the actual heads, not image labels. */
(function(){
  'use strict';
  const presets=[
    {id:'lateral',label:'1 · Paralelos laterales',rot:90,separation:180,setup:'normal'},
    {id:'standing1',label:'2 · D1 exterior · paciente de pie',rot:90,separation:180,setup:'standing1',park:true},
    {id:'standing2',label:'3 · D2 exterior · paciente de pie',rot:90,separation:180,setup:'standing2',park:true},
    {id:'external',label:'4 · Ambos hacia abajo · camilla transversal',rot:0,separation:0,setup:'external'},
    {id:'ct',label:'5 · CT · paciente en isocentro CT',rot:90,separation:180,setup:'ct',park:true},
    {id:'ap',label:'6 · Paralelos superior / inferior',rot:0,separation:180,setup:'normal'},
    {id:'90a',label:'7 · 90° anterior',rot:315,separation:90,setup:'normal'},
    {id:'90p',label:'8 · 90° posterior',rot:135,separation:90,setup:'normal'},
    {id:'76a',label:'9 · 76° anterior',rot:322,separation:76,setup:'normal'},
    {id:'76p',label:'10 · 76° posterior',rot:142,separation:76,setup:'normal'}
  ];
  const wrap=v=>(v%360+360)%360;
  const delta=(a,b)=>wrap(b-a+180)-180;
  const approach=(a,b,step)=>a+Math.sign(b-a)*Math.min(Math.abs(b-a),step);
  function nextState(G,target,phase,dt,limits,range){
    const next={...G};
    if(phase==='retract'){
      for(const k of ['detDist1','detDist2'])next[k]=approach(G[k],range[k][1],dt*10);
      return {next,done:['detDist1','detDist2'].every(k=>next[k]===range[k][1])};
    }
    if(phase==='rotate'||phase==='normalize'){
      if(phase==='normalize')target={rot:90,separation:180};
      next.rot=wrap(G.rot+Math.sign(delta(G.rot,target.rot))*Math.min(Math.abs(delta(G.rot,target.rot)),dt*24));
      next.detectorSeparation=approach(G.detectorSeparation??180,target.separation,dt*24);
      return {next,done:Math.abs(delta(next.rot,target.rot))<1e-8&&next.detectorSeparation===target.separation};
    }
    const L=limits(G),pairClearance=target.separation===180||target.setup==='external'?0:36/Math.tan(target.separation*Math.PI/360)+1;
    const goals={detDist1:Math.min(range.detDist1[1],Math.max(range.detDist1[0],L.d1+1.5,pairClearance)),
      detDist2:Math.min(range.detDist2[1],Math.max(range.detDist2[0],L.d2+1.5,pairClearance))};
    for(const k of ['detDist1','detDist2'])next[k]=approach(G[k],goals[k],dt*6);
    return {next,done:['detDist1','detDist2'].every(k=>next[k]===goals[k])};
  }
  window.GANTRY_POSITION_CORE={presets,nextState};
  const host=document.getElementById('gantryViewControls');if(!host)return;
  const panel=document.createElement('div');panel.id='gantryAutomaticPositions';
  panel.style.cssText='flex-basis:100%;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 0;font-size:13px';
  panel.innerHTML='<label for="gantryPositionMenu">Posición automática </label><select id="gantryPositionMenu" aria-label="Posición automática de detectores"><option value="">Seleccionar posición…</option>'+presets.map(p=>'<option value="'+p.id+'">'+p.label+'</option>').join('')+'<option value="stop">Detener movimiento</option></select><span id="gantryPositionStatus" role="status">D1 0° · D2 180° · separación 180°</span>';
  host.append(panel);
  const menu=document.getElementById('gantryPositionMenu'),status=document.getElementById('gantryPositionStatus');
  let target=null,phase='',timer=null,last=0,finishedLabel='',lastGeometry='',initial=null,home=null;
  const phases={retract:'Retirando detectores',normalize:'Preparando configuración',rotate:'Orientando detectores',approach:'Acercando detectores'};
  function sync(){
    const G=window.GANTRY?.G;if(!G)return;
    const geometry=JSON.stringify([G.setup,G.setupTransition,G.rot,G.detectorSeparation??180,G.detDist1,G.detDist2]);
    if(!target&&lastGeometry&&geometry!==lastGeometry)finishedLabel='';
    lastGeometry=geometry;
    const special={standing1:'D1 hacia exterior · D2 hacia isocentro · paciente de pie',standing2:'D1 hacia isocentro · D2 hacia exterior · paciente de pie',external:'Ambos hacia abajo · camilla transversal',ct:'Paciente en isocentro CT · fuera del campo SPECT'};
    status.textContent=(target?phases[phase]+(G.setupTransition?' · paciente fuera del campo':'')+' · ':finishedLabel?finishedLabel+' · ':'')+
      (special[G.setup]||'D1 '+Math.round(wrap(G.rot))+'° · D2 '+Math.round(wrap(G.rot+(G.detectorSeparation??180)))+'° · separación '+Math.round(G.detectorSeparation??180)+'°');
  }
  function stop(message='Movimiento detenido'){
    clearInterval(timer);timer=null;target=null;
    if(window.GANTRY?.G.setupTransition&&initial){Object.assign(window.GANTRY.G,initial,{setupTransition:false});window.GANTRY.render();}
    finishedLabel=message;menu.value='';sync();
  }
  function placePatient(){
    const G=window.GANTRY.G,next={...G,setupTransition:false};
    const unsafe=window.GANTRY3D.collision.evaluate(next).some(h=>Math.min(h.body.gap,h.table.gap,h.equipment?.gap??Infinity)<.0024);
    if(unsafe){stop('Reconfiguración cancelada: no hay espacio seguro para el paciente');return false;}
    Object.assign(G,next);window.GANTRY.render();return true;
  }
  function tick(){
    if(!target)return;
    if(document.hidden||window.GANTRY_EXAM?.blocked){stop();return;}
    const now=performance.now(),dt=Math.min(.1,(now-last)/1000);last=now;
    const api=window.GANTRY,view=window.GANTRY3D;
    const {next,done}=nextState(api.G,target,phase,dt,view.limits,api.LIM);
    const result=view.collision.guard(api.G,next);
    Object.assign(api.G,result.state);window.GANTRY_VALUE_FEEDBACK?.changed();api.render();
    if(result.blocked){stop((phase==='approach'?'Orientación alcanzada; acercamiento detenido':'Movimiento detenido')+' · contacto evitado con '+result.blocked.hit.region);return;}
    if(done){
      if(phase==='retract')phase=api.G.setupTransition?'normalize':'rotate';
      else if(phase==='normalize'){
        Object.assign(api.G,{setup:target.setup,setupAnchorZ:api.G.tableZ});
        if(target.setup==='normal'&&home)Object.assign(api.G,home);
        if(target.setup.startsWith('standing')||target.setup==='external')api.G.arms='down';
        if(target.setup==='external')api.G.tableH=80;
        if(target.setup==='ct')api.G.tableH=(1.03-(view.setupLayout?.().physical.bodyH??.30)/2)*100;
        phase='rotate';api.render();
      }else if(phase==='rotate'){
        if(api.G.setupTransition&&!placePatient())return;
        if(!target.park)phase='approach';else{stop('Posición alcanzada');return;}
      }else{stop('Posición alcanzada');return;}
    }
    sync();
  }
  function start(id){
    if(id==='stop'){stop();return false;}
    const p=presets.find(p=>p.id===id);if(!p)return false;
    if(window.GANTRY_BONE_ACQ?.active||window.GANTRY_MAG3?.state&&!window.GANTRY_MAG3.state.finished){stop('Finaliza la adquisición antes de cambiar la configuración');return false;}
    if(window.GANTRY_EXAM?.blocked){stop('Reinicia el examen antes de posicionar automáticamente');return false;}
    if(!window.GANTRY3D?.collision?.ready){stop('Preparando geometría del paciente');return false;}
    if(target)stop();
    const G=window.GANTRY.G;initial={...G,setup:G.setup||'normal'};
    if((G.setup||'normal')!==p.setup){
      if((G.setup||'normal')==='normal')home={tableZ:G.tableZ,tableH:G.tableH,arms:G.arms};
      G.setupTransition=true;window.GANTRY.render();
    }
    clearInterval(timer);target=p;phase='retract';last=performance.now();finishedLabel='';
    timer=setInterval(tick,50);sync();return true;
  }
  menu.addEventListener('change',()=>start(menu.value));
  // A manual command takes over immediately. It never competes with an automatic motor.
  document.addEventListener('pointerdown',event=>{if(target&&event.target.closest('#mando button,#changePatientPosition,.armbtn'))stop('Movimiento manual');},true);
  document.addEventListener('click',event=>{if(target&&event.target.closest('#mando button,#changePatientPosition,.armbtn'))stop('Movimiento manual');},true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&target)stop();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&target)stop();});
  window.GANTRY_AUTO={start,stop,sync,get busy(){return !!target;}};
  sync();
})();
