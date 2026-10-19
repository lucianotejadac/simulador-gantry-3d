/* Generic detector presets. Angles describe the actual heads, not image labels. */
(function(){
  'use strict';
  const presets=[
    {id:'lateral',label:'1 · Paralelos laterales',rot:90,separation:180,setup:'normal'},
    {id:'standing1',label:'2 · D1 exterior · paciente de pie',rot:90,separation:180,setup:'standing1',park:true},
    {id:'standing2',label:'3 · D2 exterior · paciente de pie',rot:90,separation:180,setup:'standing2',park:true},
    {id:'ct',label:'5 · Isocentro CT · detectores 90° posterior',rot:135,separation:90,setup:'ct',park:true},
    {id:'ap',label:'6 · Paralelos superior / inferior',rot:0,separation:180,setup:'normal'},
    {id:'90a',label:'7 · 90° anterior',rot:315,separation:90,setup:'normal'},
    {id:'90p',label:'8 · 90° posterior',rot:135,separation:90,setup:'normal'},
    {id:'76a',label:'9 · 76° anterior',rot:322,separation:76,setup:'normal'},
    {id:'76p',label:'10 · 76° posterior',rot:142,separation:76,setup:'normal'}
  ];
  const wrap=v=>(v%360+360)%360;
  const delta=(a,b)=>wrap(b-a+180)-180;
  const approach=(a,b,step)=>a+Math.sign(b-a)*Math.min(Math.abs(b-a),step);
  const clone=value=>JSON.parse(JSON.stringify(value));
  function interpolateMotion(step,t){
    // Quintic easing starts and stops each mechanical manoeuvre at zero speed.
    const u=t*t*t*(10+t*(-15+6*t)),s={...step.from};
    for(const k of ['rot','detectorSeparation','tableH','tableZ','detDist1','detDist2','setupPatientOffset']){
      const a=step.from[k]??(k==='detectorSeparation'?180:0),b=step.to[k]??a;
      s[k]=a+(k==='rot'?delta(a,b):b-a)*u;
    }
    if(step.from.setupHeads&&step.to.setupHeads)s.setupHeads=step.from.setupHeads.map((h,i)=>{
      const end=step.to.setupHeads[i];return {...h,position:h.position.map((v,j)=>v+(end.position[j]-v)*u),angle:h.angle+(end.angle-h.angle)*u,yaw:h.yaw+(end.yaw-h.yaw)*u};
    });
    return t>=1?clone(step.to):s;
  }
  function externalPlan(initial,target,home,physical={}){
    const steps=[];let state=clone(initial);
    function add(label,patch,duration=0){const to={...clone(state),...clone(patch)};steps.push({label,from:clone(state),to,duration});state=to;}
    function pose(label,change){
      const heads=state.setupHeads.map((h,i)=>({...h,...change(h,i)}));
      let seconds=.5;
      heads.forEach((h,i)=>{const a=state.setupHeads[i];
        h.angle=a.angle+Math.atan2(Math.sin(h.angle-a.angle),Math.cos(h.angle-a.angle));
        seconds=Math.max(seconds,1.875*Math.hypot(...h.position.map((v,j)=>v-a.position[j]))/.25,
          1.875*Math.max(Math.abs(h.angle-a.angle),Math.abs(h.yaw-a.yaw))/(Math.PI/6));
      });
      add(label,{setupHeads:heads},seconds);
    }
    const leaving=state.setup==='external';
    if(state.setup==='normal'||!state.setup){
      add('Retirando la camilla con el paciente',{tableZ:-50},Math.max(1,1.875*Math.abs(state.tableZ+50)/20));
      add('Estacionando detectores a ambos lados',{rot:270,detectorSeparation:180},Math.max(1,1.875*Math.max(Math.abs(delta(state.rot,270)),Math.abs((state.detectorSeparation??180)-180))/24));
    }else{
      add('Retirando paciente y camilla de la zona de maniobra',{setupPatientOffset:-2.2},1.875*2.2/.35);
      if(!leaving)add('Estacionando detectores a ambos lados',{rot:270,detectorSeparation:180},Math.max(1,1.875*Math.abs(delta(state.rot,270))/24));
    }
    add('Preparación fuera del campo · traslado entre camillas',{setupTransition:true,setupHeads:window.GANTRY_SETUP.geometry(state,physical).heads.map(h=>({position:h.position,angle:h.angle,yaw:h.yaw||0}))});
    add('Preparación fuera del campo · traslado entre camillas',{},1.5);
    pose('Desplazando cabezales al frente del gantry',h=>({position:[-.65,h.position[1],h.position[2]]}));
    const side=i=>i===0?-1:1;
    if(!leaving){
      pose('Elevando cabezales con separación de seguridad',(h,i)=>({position:[-.65,1.53,side(i)*.65]}));
      pose('Basculando las caras detectoras hacia abajo',()=>({angle:0,yaw:-Math.PI/2}));
      pose('Alineando detectores sobre el eje transversal',(h,i)=>({position:[-.65,1.53,side(i)*.34]}));
      pose('Acoplando detectores en posición transversal',h=>({position:[0,h.position[1],h.position[2]]}));
      add('Preparando camilla externa fuera del campo',{setup:'external',rot:0,detectorSeparation:0,tableH:80,arms:'down',setupAnchorZ:state.tableZ,setupHeads:null,setupPatientOffset:-2.2},0);
      add('Preparación de camilla externa · traslado del paciente',{},1.5);
      add('Ingresando camilla externa perpendicular',{setupTransition:false});
      add('Ingresando camilla externa perpendicular',{setupPatientOffset:0},1.875*2.2/.35);
    }else{
      pose('Separando cabezales antes de bascular',(h,i)=>({position:[-.65,1.53,side(i)*.65]}));
      pose('Orientando detectores hacia el isocentro',(h,i)=>({angle:side(i)*Math.PI/2,yaw:0}));
      pose('Bajando cabezales a posición lateral',(h,i)=>({position:[-.65,1.03,side(i)*.50]}));
      pose('Acoplando cabezales al eje del gantry',h=>({position:[0,h.position[1],h.position[2]]}));
      add('Preparando camilla del equipo fuera del campo',{setup:'normal',rot:270,detectorSeparation:180,tableH:home?.tableH??80,tableZ:-50,arms:home?.arms??'down',setupHeads:null,setupPatientOffset:0});
      add('Preparación de camilla del equipo · traslado del paciente',{},1.5);
      if(target.setup==='normal')add('Orientando detectores antes del ingreso',{rot:target.rot,detectorSeparation:target.separation},Math.max(1,1.875*Math.max(Math.abs(delta(270,target.rot)),Math.abs(180-target.separation))/24));
      add('Ingresando camilla del equipo',{setupTransition:false});
      add('Ingresando camilla del equipo',{tableZ:home?.tableZ??200},Math.max(1,1.875*Math.abs((home?.tableZ??200)+50)/20));
    }
    return steps;
  }
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
  window.GANTRY_POSITION_CORE={presets,nextState,externalPlan,interpolateMotion};
  const host=document.getElementById('gantryViewControls');if(!host)return;
  const panel=document.createElement('div');panel.id='gantryAutomaticPositions';
  panel.style.cssText='flex-basis:100%;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 0;font-size:13px';
  panel.innerHTML='<label for="gantryPositionMenu">Posición automática </label><select id="gantryPositionMenu" aria-label="Posición automática de detectores"><option value="">Seleccionar posición…</option>'+presets.map(p=>'<option value="'+p.id+'">'+p.label+'</option>').join('')+'<option value="stop">Detener movimiento</option><option value="resume">Reanudar movimiento</option></select><span id="gantryPositionStatus" role="status">D1 0° · D2 180° · separación 180°</span>';
  host.append(panel);
  const menu=document.getElementById('gantryPositionMenu'),status=document.getElementById('gantryPositionStatus');
  let target=null,phase='',timer=null,last=0,finishedLabel='',lastGeometry='',initial=null,home=null;
  let route=null,routeIndex=0,routeElapsed=0,routePaused=false,pauseReason='';
  const phases={retract:'Retirando detectores',normalize:'Preparando configuración',rotate:'Orientando detectores',approach:'Acercando detectores'};
  function sync(){
    const G=window.GANTRY?.G;if(!G)return;
    const geometry=JSON.stringify([G.setup,G.setupTransition,G.rot,G.detectorSeparation??180,G.detDist1,G.detDist2]);
    if(!target&&lastGeometry&&geometry!==lastGeometry)finishedLabel='';
    lastGeometry=geometry;
    const special={standing1:'D1 hacia exterior · D2 hacia isocentro · paciente de pie',standing2:'D1 hacia isocentro · D2 hacia exterior · paciente de pie',external:'Ambos hacia abajo · camilla transversal',ct:'Isocentro CT · detectores 90° posterior · fuera del campo SPECT'};
    status.textContent=(route?(routePaused?'Pausado · '+pauseReason+' · selecciona Reanudar movimiento · ':'')+route[routeIndex].label+' · ':target?phases[phase]+(G.setupTransition?' · paciente fuera del campo':'')+' · ':finishedLabel?finishedLabel+' · ':'')+
      (G.setupHeads?'Cabezas en reconfiguración':special[G.setup]||'D1 '+Math.round(wrap(G.rot))+'° · D2 '+Math.round(wrap(G.rot+(G.detectorSeparation??180)))+'° · separación '+Math.round(G.detectorSeparation??180)+'°');
  }
  function stop(message='Movimiento detenido'){
    if(route){clearInterval(timer);timer=null;routePaused=true;pauseReason=message;sync();return;}
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
    if(route){
      const stage=route[routeIndex];routeElapsed+=dt;
      const t=stage.duration?Math.min(1,routeElapsed/stage.duration):1;
      const next=interpolateMotion(stage,t);
      const result=stage.duration?view.collision.guard(api.G,next):{state:next};
      Object.assign(api.G,result.state);api.render();
      if(result.blocked){stop('Contacto evitado con '+result.blocked.hit.region);return;}
      if(t===1){
        routeIndex++;routeElapsed=0;
        if(routeIndex===route.length){
          route=null;routePaused=false;
          if(target.setup!=='normal'&&target.setup!=='external'){const id=target.id;target=null;start(id);return;}
          phase='approach';
        }
      }
      sync();return;
    }
    const {next,done}=nextState(api.G,target,phase,dt,view.limits,api.LIM);
    const result=view.collision.guard(api.G,next);
    Object.assign(api.G,result.state);window.GANTRY_VALUE_FEEDBACK?.changed();api.render();
    if(result.blocked){stop((phase==='approach'?'Orientación alcanzada; acercamiento detenido':'Movimiento detenido')+' · contacto evitado con '+result.blocked.hit.region);return;}
    if(done){
      if(phase==='retract'){
        if((api.G.setup||'normal')!==target.setup&&(api.G.setup==='external'||target.setup==='external')){
          route=externalPlan(api.G,target,home,view.setupLayout?.().physical);routeIndex=0;routeElapsed=0;routePaused=false;
        }else phase=api.G.setupTransition?'normalize':'rotate';
      }
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
    if(id==='resume'){
      if(routePaused){routePaused=false;last=performance.now();timer=setInterval(tick,25);sync();return true;}return false;
    }
    if(route){stop();status.textContent='Reanuda la maniobra pendiente antes de seleccionar otra posición.';return false;}
    const p=presets.find(p=>p.id===id);if(!p)return false;
    if(window.GANTRY_BONE_ACQ?.active||window.GANTRY_MAG3?.state&&!window.GANTRY_MAG3.state.finished){stop('Finaliza la adquisición antes de cambiar la configuración');return false;}
    if(window.GANTRY_EXAM?.blocked){stop('Reinicia el examen antes de posicionar automáticamente');return false;}
    if(!window.GANTRY3D?.collision?.ready){stop('Preparando geometría del paciente');return false;}
    if(target)stop();
    const G=window.GANTRY.G;initial={...G,setup:G.setup||'normal'};
    if((G.setup||'normal')!==p.setup){
      if((G.setup||'normal')==='normal')home={tableZ:G.tableZ,tableH:G.tableH,arms:G.arms};
      if(G.setup!=='external'&&p.setup!=='external')G.setupTransition=true;
      window.GANTRY.render();
    }
    clearInterval(timer);target=p;phase='retract';last=performance.now();finishedLabel='';
    timer=setInterval(tick,25);sync();return true;
  }
  menu.addEventListener('change',()=>start(menu.value));
  // A manual command takes over immediately. It never competes with an automatic motor.
  const manual=event=>{if(target&&event.target.closest('#mando button,#changePatientPosition,.armbtn')){
    if(route){event.preventDefault();event.stopImmediatePropagation();stop();}else stop('Movimiento manual');
  }};
  document.addEventListener('pointerdown',manual,true);
  document.addEventListener('click',manual,true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&target)stop();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&target)stop();});
  function reset(){clearInterval(timer);timer=null;route=null;routePaused=false;target=null;home=null;initial=null;
    Object.assign(window.GANTRY.G,{setupHeads:null,setupPatientOffset:0,setupTransition:false});
  }
  window.GANTRY_AUTO={start,stop,sync,reset,get busy(){return !!target;},get transferring(){return !!route;}};
  sync();
})();
