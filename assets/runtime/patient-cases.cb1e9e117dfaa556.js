/* Patient identity is captured at acquisition start; completed images stay intact. */
(function(){
  'use strict';
  const patients={phantom:{id:'phantom',name:'Fantoma ICRP 145 · SIMULADO'},
    'caso-oseo':{id:'caso-oseo',name:'Caso óseo',model:'case3-right-hindfoot-v1'},
    'caso-oseo-2':{id:'caso-oseo-2',name:'Caso óseo 2',model:'cellulitis-right-foot-v1'},
    'caso-oseo-3':{id:'caso-oseo-3',name:'Caso óseo 3',model:'osteoblastic-metastases-v1'}};
  let id='phantom',loading=false;
  const busy=()=>!!window.GANTRY_BONE_ACQ?.active||!!(window.GANTRY_MAG3?.state&&!window.GANTRY_MAG3.state.finished);
  async function select(next){
    if(!patients[next])throw Error('Paciente no válido');
    if(busy()||loading)throw Error('Finaliza la adquisición antes de cambiar de paciente.');
    loading=true;render();
    try{
      if(next!=='phantom')await window.GANTRY_MDP.loadCase(next);
      if(busy())throw Error('Finaliza la adquisición antes de cambiar de paciente.');
      id=next;
      window.GANTRY_LIVE?.clearPersistence();window.GANTRY_LIVE?.update(window.GANTRY.G);
      window.dispatchEvent(new CustomEvent('gantry-patient-change',{detail:metadata()}));
    }finally{loading=false;render();}
  }
  function metadata(){return {...patients[id]};}
  function render(){
    const node=document.getElementById('gantryPatient');if(!node)return;
    node.value=id;node.disabled=loading||busy();
    document.getElementById('gantryPatientStatus').textContent=loading?'Cargando paciente…':id==='caso-oseo'?'Caso óseo · patrón trifásico en pie derecho · modelo docente':id==='caso-oseo-2'?'Caso óseo 2 · celulitis de pie y tobillo derechos · modelo docente':id==='caso-oseo-3'?'Caso óseo 3 · oncológico · metástasis osteoblásticas · modelo docente. MDP tardío (2–4 h); cuerpo entero y vistas dirigidas.':'';
  }
  function init(){
    const host=document.getElementById('gantryViewControls');if(!host)return;
    const panel=document.createElement('section');panel.id='gantryPatientPanel';
    panel.style.cssText='flex-basis:100%;padding:8px;background:#16232d;color:#d4e8ee;font:12px Arial';
    panel.innerHTML='<label>Paciente <select id="gantryPatient" aria-label="Paciente"><option value="phantom">Fantoma ICRP 145</option><option value="caso-oseo">Caso óseo</option><option value="caso-oseo-2">Caso óseo 2</option><option value="caso-oseo-3">Caso óseo 3 · Oncológico</option></select></label><span id="gantryPatientStatus" role="status" style="display:block;margin-top:4px"></span>';
    const administration=document.getElementById('rfPanel');
    if(administration)administration.prepend(panel);else host.before(panel);
    window.GANTRY_PATIENT_RECORDS?.mountControls(panel);
    document.getElementById('gantryPatient').onchange=async event=>{try{await select(event.target.value);}catch(error){render();document.getElementById('gantryPatientStatus').textContent=error.message;}};
    setInterval(render,500);
  }
  window.GANTRY_PATIENT={select,metadata,get id(){return id;}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
