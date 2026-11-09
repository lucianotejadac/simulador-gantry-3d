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
      delayed:valid.filter(r=>r.acquisition.kind==='static'&&seconds(r)>=7200&&seconds(r)<=14400),
      whole:valid.filter(r=>r.acquisition.kind==='whole'&&seconds(r)>=7200&&seconds(r)<=14400&&
        r.scan?.physicalPosition?.decubitus==='supine'&&r.scan?.physicalPosition?.headFirst===false&&
        r.scan?.startZ>=200-1e-3&&r.scan?.endZ<=16+1e-3&&r.scan?.travel>=175-1e-3)
    };
  }
  function evaluate(s){
    const v=s.viewer||{},seen=s.seen||{},p=phases(v.records),reg=s.registration;
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
      [check('prepare','MDP trifásico preparado antes de inyectar',seen.prepared),check('position','Encuadre de ambos pies revisado por ti',seen.position)],
      [check('camera','Cambiaste matriz y zoom o ventana',seen.camera),check('protocol','Restableciste LEHR, 140 keV y ventana de 15–20 %',seen.protocol)],
      [check('flow','Dinámica completa con señal en ambos detectores, iniciada entre 0 y 10 s',p.flow.length),check('playback','Fotogramas revisados',v.seen?.playback)],
      [check('pool','Estática completa con inicio entre 1 y menos de 10 min',p.pool.length)],
      [check('whole','Cuerpo completo de ambos detectores, de cráneo a pies, con inicio entre 2 y 4 h',p.whole.length)],
      [check('delayed','Estática dirigida completa con inicio entre 2 y 4 h',p.delayed.length)],
      [check('analysis','Visualización / Análisis abierta sobre este caso',v.seen?.analysis),check('display','Ventana, nivel o inversión ajustados',v.seen?.display)],
      [check('header','Encabezado establecido',v.header),check('images','Ambos detectores de flujo, pool, cuerpo completo tardío y tardía dirigida colocados',hasPhase(p.flow)&&hasPhase(p.pool)&&hasPhase(p.delayed)&&hasPhase(p.whole)),check('layout','Composición revisada: sin cuadros solapados ni dinámica incompleta',relevantPages.length&&!relevantPages.some(page=>page.overlaps||page.incomplete))],
      [check('export','Todas las páginas del caso exportadas en su versión actual',relevantPages.length&&relevantPages.every(page=>page.exported))]
    ];
  }
  const api={normalize,phases,evaluate,caseId};
  root.GANTRY_TUTORIAL_MODEL=api;
  if(typeof module!=='undefined')module.exports=api;
})(typeof window==='undefined'?globalThis:window);
