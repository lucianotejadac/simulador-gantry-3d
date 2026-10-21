/* Shared validation for the viewer's acquisition form and the gantry receiver. */
(function(){
  'use strict';
  function camera(value){
    if(!value||typeof value!=='object')throw Error('Parámetros de cámara incompletos.');
    const c={};
    for(const [key,choices,label] of [['kind',['static','whole'],'Tipo de adquisición'],['matrix',value.kind==='whole'?[128,256]:[64,128,256,512],'Matriz'],['zoom',[1,1.5,1.75,2],'Zoom'],['collimator',['LEHR','MELP','HE','NONE'],'Colimador'],['windowWidth',[10,15,20,25],'Ancho de ventana']]){
      if(!choices.includes(value[key]))throw Error(label+' no válido.');c[key]=value[key];
    }
    if(!Number.isInteger(value.energyCenter)||value.energyCenter<80||value.energyCenter>450)throw Error('Centro de energía fuera de rango.');
    c.energyCenter=value.energyCenter;return c;
  }
  function validate(value){
    if(!value||typeof value!=='object')throw Error('Parámetros de adquisición incompletos.');
    const c={};
    const choice=(key,values,label)=>{if(!values.includes(value[key]))throw Error(label+' no válido.');c[key]=value[key];};
    const number=(key,min,max,label,integer=false)=>{
      const n=value[key];
      if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max||(integer&&!Number.isInteger(n)))throw Error(label+' fuera de rango.');
      c[key]=n;
    };
    Object.assign(c,camera(value));
    number('activityMci',.1,2000/37,'Actividad (mCi)');number('minutes',0,179.99,'Tiempo inyección–examen (min)');
    if(c.kind==='whole'){
      // Compatibility defaults for the static controls; the scan engine stops
      // at the end of the table travel, never on a static count/time target.
      c.mode='counts';c.target=400000;
    }else{
      choice('mode',['counts','time'],'Condición de paro');
      number('target',1,c.mode==='time'?57600:160000000,'Objetivo',true);
    }
    number('velocity',.1,60,'Velocidad de camilla');
    c.contours=value.contours??'auto';
    if(!['auto','fixed'].includes(c.contours))throw Error('Modo de contornos no válido.');
    if(!Array.isArray(value.names)||value.names.length!==2||value.names.some(n=>typeof n!=='string'||!n.trim()||n.trim().length>80))throw Error('Indica un nombre de hasta 80 caracteres para cada detector.');
    c.names=value.names.map(n=>n.trim());
    return c;
  }
  function fromRecord(r){
    const s=r.processing?.first?.settings||r.settings||{},m=r.mdp?.start;
    return validate({kind:r.kind||'static',matrix:r.n,zoom:s.zoom,collimator:s.collimator,energyCenter:s.energyCenter,windowWidth:s.windowWidth,
      activityMci:m?.activityMBq/37,minutes:Math.min(179.99,m?.seconds/60),mode:r.mode,target:r.target,
      velocity:r.scan?.velocity||10,contours:r.scan?.contours||'auto',names:r.names});
  }
  window.GANTRY_PROCESSING_CONFIG={validate,fromRecord,camera};
})();
