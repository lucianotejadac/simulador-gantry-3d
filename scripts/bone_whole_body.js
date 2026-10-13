/* Whole-body projection adapter: linear ICRP activity, native aspect ratio. */
(function(){
  'use strict';
  function eligibility(G,physical,declared,centers,scan={zTop:200}){
    if(!physical||physical.headFirst!==false)return {ok:false,reason:'Coloca al paciente con los pies hacia adentro (Cambiar posición de paciente).'};
    if(declared?.headFirst!==false)return {ok:false,reason:'En Adquisición, declara Pies adentro / Cabeza afuera.'};
    if(!Number.isFinite(G?.tableZ)||Math.abs(G.tableZ-scan.zTop)>2)return {ok:false,reason:'Centra en cráneo: camilla Z '+scan.zTop+' cm (tolerancia ±2 cm).'};
    if(centers&&Object.values(centers).some(c=>Math.abs(c.x)>0.02||Math.abs(c.y)>0.02))return {ok:false,reason:'Pulsa Centro original para centrar las imágenes en cráneo.'};
    return {ok:true,reason:'Cráneo centrado · pies hacia adentro · listo para cuerpo entero'};
  }
  function geometry(pose,n){
    // 56 cm transverse coverage at the same physical pixel size in both axes.
    // Include the entire source volume, including raised hands and soles.
    const width=Math.max(560/3,pose.width),height=pose.height;
    return {width:n,height:Math.ceil(height/width*n),crop:{x:(pose.width-width)/2,y:0,w:width,h:height}};
  }
  let key='',cached=null;
  function position(){
    const live=window.GANTRY_LIVE;
    return eligibility(window.GANTRY?.G,window.GANTRY_PATIENT3D,live?.settings,live?.settings.centers,window.GANTRY?.SCAN);
  }
  function fields(){
    const live=window.GANTRY_LIVE,G=window.GANTRY.G,settings=live.settings;
    const pose=window.GANTRY_ICRP?.poses[G.arms==='up'?'up':'down'];
    if(!pose)throw Error('Preparando el fantoma óseo');
    const size=geometry(pose,settings.matrix);
    const gaps=window.GANTRY3D?.surfaceGaps(G);
    const physicalProne=(document.getElementById('pos')?.value||'').toLowerCase().startsWith('pron');
    const raw=G.rot+(physicalProne?180:0);
    const pairs=[live.framePair(raw),live.framePair(raw+180)];
    const metrics=[1,2].map(n=>live.distanceMetrics(Math.max(0,gaps?.['d'+n]?.cm??G['detDist'+n]),'bone',settings.collimator,settings.energyCenter,settings.windowWidth));
    const flipX=physicalProne!==(settings.decubitus==='prone');
    const nextKey=JSON.stringify([G.arms,size,pairs,metrics,flipX]);
    if(nextKey!==key){
      cached={...size,fields:pairs.map((pair,i)=>window.GANTRY_ICRP.field(pose,pair,size.crop,size.width,size.height,flipX,false,metrics[i],metrics[i].blur*size.width/240))};
      key=nextKey;
    }
    return cached;
  }
  window.GANTRY_BONE_WHOLE={eligibility,geometry,position,fields};
})();
