/* Read acquisition snapshots only; never use the current gantry for saved images. */
(function(){
  'use strict';
  const finite=v=>typeof v==='number'&&Number.isFinite(v);
  const number=v=>v.toLocaleString('es-CL',{maximumFractionDigits:3});
  function fields(info,detector=info?.detector||1){
    if(!info?.simulation)return {};
    const a=info.acquisition||{},p=info.processing||{},first=p.first||{},s=first.settings||info.settings||{};
    const g=first.geometry||{},d=first.detectors?.[detector-1],scan=info.scan;
    const angles=first.detectors?.map(d=>d?.rawAngle??d?.angle)||[];
    const difference=angles.length===2&&angles.every(finite)?((angles[1]-angles[0])%360+360)%360:null;
    const separation=finite(g.detectorSeparation)?g.detectorSeparation:difference===null?null:Math.min(difference,360-difference);
    const h=info.heads?.find(h=>h.detector===detector)||(info.detector===detector?info:null);
    const varied=p.varied?' · al inicio':'';
    const out={
      'Programación de cámara':'Óseo · MDP',
      'Órgano':'Sistema óseo',
      'Detectores':'1 y 2 · imagen del detector '+(info.detector||detector),
      'Configuración basada':'Geometría registrada del simulador'+varied,
      'Configuración basada en estudio':'Óseo · MDP',
      'Corrección de uniformidad':p.uniformityApplied===false?'No aplicada · sin mapa de corrección':p.uniformityApplied===true?'Aplicada':'No registrada',
      'Orientación':typeof s.headFirst==='boolean'?(s.headFirst?'Cabeza dentro · pies fuera':'Cabeza fuera · pies dentro')+varied:'No registrada',
      'Posición del cuerpo':['supine','prone'].includes(s.decubitus)?(s.decubitus==='supine'?'Supino':'Prono')+varied:'No registrada',
      'Imagen 1':a.names?.[0], 'Imagen 2':a.names?.[1],
      'Condición registrada':a.mode==='counts'?'Cuentas':a.mode==='time'?'Tiempo':a.mode==='scan'?'Final del recorrido hacia los pies':undefined,
      'Tiempo programado':a.mode==='time'&&finite(a.target)?number(a.target)+' s':'No aplica',
      'Conteos de paro (Kcts)':a.mode==='counts'&&finite(a.target)?number(a.target/1000):'No aplica',
      'Ángulo inicial':finite(d?.rawAngle)?number(d.rawAngle)+'°':finite(d?.angle)?number(d.angle)+'°':undefined,
      'Duración real':finite(h?.elapsed)?number(h.elapsed)+' s':undefined,
      'Configuración de detector':finite(separation)?number(separation)+'°'+varied:undefined
    };
    if(p.stopRule==='independent'){
      out['Paro entre detectores']='Cada detector al alcanzar su objetivo';
      out['Mismos parámetros para detector 2']='Sí';
      out['Primera imagen por conteos']='No aplica · una imagen por detector';
      out['Grupo de ventanas de paro']='Ventana energética configurada';
    }
    if(scan){
      out['Contornos automáticos']=scan.contours==='fixed'?'Desactivados · distancia fija':'Activados';
      out['Pasos']='Uno · barrido continuo';
    }
    return out;
  }
  function timing(info){
    if(!info?.simulation||!finite(info.elapsed))return null;
    const out={elapsed:number(info.elapsed)+' s'};
    if(info.stoppedEarly===false)out.remaining='0 s · finalizada';
    else if(info.stoppedEarly===true){
      const a=info.acquisition||{};
      out.remaining=a.mode==='time'&&finite(a.target)?number(Math.max(0,a.target-info.elapsed))+' s · interrumpida':'Interrumpida';
    }
    return out;
  }
  window.GANTRY_RECORDED_METADATA={fields,timing};
})();
