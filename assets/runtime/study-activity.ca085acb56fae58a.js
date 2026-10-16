/* Activity scaling for existing static atlases; MAG3 uses its dynamic bases.
   Reference CPS are teaching calibration, not measured device sensitivity. */
(function(){
  'use strict';
  const profiles={
    thyroid:{tracer:'99mTc-pertecnetato',mCi:5,minutes:20,atlasMinutes:20,route:'Intravenosa',typical:'1–10 mCi'},
    dmsa:{tracer:'99mTc-DMSA',mCi:3,minutes:180,atlasMinutes:180,route:'Intravenosa',typical:'2–6 mCi'},
    maa:{tracer:'99mTc-MAA',mCi:3,minutes:5,atlasMinutes:5,route:'Intravenosa',typical:'1–4 mCi'},
    parathyroid:{tracer:'99mTc-MIBI',mCi:20,minutes:60,atlasMinutes:60,route:'Intravenosa',typical:'20–30 mCi'},
    exploration:{tracer:'I-131',mCi:100,minutes:7*1440,atlasMinutes:5*1440,halfLifeMinutes:8.02*1440,route:'Oral',choices:[50,100,150,200]},
    mag3:{tracer:'99mTc-MAG3',mCi:5,minutes:0,atlasMinutes:0,route:'Intravenosa · bolo',typical:'5–10 mCi'}
  };
  const states=Object.fromEntries(Object.entries(profiles).map(([id,p])=>[id,{activityMBq:p.mCi*37,unit:'mCi'}]));
  const el=id=>document.getElementById(id);
  const selected=()=>window.GANTRY_LIVE?.settings.study;
  function metadata(id){
    const p=profiles[id],s=states[id];if(!p)return null;
    return {model:'atlas-activity-v1',tracer:p.tracer,route:p.route,activityMBq:s.activityMBq,activityMCi:s.activityMBq/37,
      seconds:p.minutes*60,referenceActivityMBq:p.mCi*37,atlasReferenceSeconds:p.atlasMinutes*60,
      halfLifeMinutes:p.halfLifeMinutes||360.402,
      distribution:id==='mag3'?'dynamic-mag3':'fixed-atlas',referenceRate:id==='mag3'?null:4000};
  }
  function factor(id){
    const m=metadata(id);return m?m.activityMBq/m.referenceActivityMBq*2**(-(m.seconds-m.atlasReferenceSeconds)/(60*m.halfLifeMinutes)):1;
  }
  function rate(id){return profiles[id]&&id!=='mag3'?4000*factor(id):null;}
  function locked(id){return id==='mag3'?!!window.GANTRY_MAG3?.state&&!window.GANTRY_MAG3.state.finished:!!window.GANTRY_BONE_ACQ?.active;}
  function setActivity(id,value,unit='mCi'){
    const p=profiles[id],mbq=Number(value)*(unit==='mCi'?37:1);
    if(!p||locked(id)||!Number.isFinite(mbq)||mbq<=0||mbq>2000&&id!=='exploration')return false;
    if(p.choices&&!p.choices.some(x=>Math.abs(x*37-mbq)<1e-7))return false;
    states[id].activityMBq=mbq;return true;
  }
  function render(){
    const id=selected(),p=profiles[id],panel=el('studyActivityControls');if(!panel)return;
    panel.hidden=!p;
    if(el('boneCountRate'))el('boneCountRate').closest('label').hidden=true;
    if(!p)return;
    const s=states[id],oral=!!p.choices,divisor=s.unit==='mCi'?37:1;
    el('studyActivityLabel').textContent=oral?'ACTIVIDAD ORAL':'ACTIVIDAD INYECTADA';
    el('studyActivity').hidden=oral;el('studyActivityPreset').hidden=!oral;
    el('studyActivityUnit').value=s.unit;
    if(document.activeElement!==el('studyActivity'))el('studyActivity').value=+(s.activityMBq/divisor).toFixed(3);
    el('studyActivity').max=2000/divisor;
    if(oral){
      const menu=el('studyActivityPreset');
      if(menu.dataset.unit!==s.unit){
        menu.replaceChildren(...p.choices.map(mCi=>{const o=document.createElement('option');o.value=String(mCi);o.textContent=String(mCi*37/divisor);return o;}));menu.dataset.unit=s.unit;
      }
      menu.value=String(s.activityMBq/37);
    }
    for(const key of ['studyActivity','studyActivityPreset','studyActivityUnit'])el(key).disabled=locked(id);
    el('studyActivityInfo').textContent=p.tracer+' · '+p.route+' · '+(id==='mag3'?'Basal desde la inyección':oral?'Adquisición a 7 días':p.minutes>=60?'Adquisición a '+p.minutes/60+' h':'Adquisición a '+p.minutes+' min')+
      ' · '+(s.activityMBq/37).toLocaleString('es-CL')+' mCi = '+s.activityMBq.toLocaleString('es-CL')+' MBq'+(p.typical?' · Referencia adulta: '+p.typical:'');
    el('studyActivityNote').textContent=id==='mag3'?'La actividad se fija al inyectar y escala toda la adquisición basal.':'Distribución fija del atlas; cuentas ajustadas por actividad'+(oral?' y decaimiento físico del día 5 al día 7.':'.');
  }
  function refresh(){render();window.GANTRY_LIVE?.clearPersistence();window.GANTRY_LIVE?.update(window.GANTRY.G);}
  function init(){
    if(!el('studyActivityControls'))return;
    el('studyActivity').onchange=()=>{const id=selected();if(!setActivity(id,el('studyActivity').value,states[id].unit))el('studyActivity').value=states[id].activityMBq/(states[id].unit==='mCi'?37:1);refresh();};
    el('studyActivityPreset').onchange=()=>{setActivity(selected(),el('studyActivityPreset').value);refresh();};
    el('studyActivityUnit').onchange=()=>{states[selected()].unit=el('studyActivityUnit').value;render();};
    render();
  }
  window.GANTRY_ACTIVITY={profiles,metadata,factor,rate,setActivity,render};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
