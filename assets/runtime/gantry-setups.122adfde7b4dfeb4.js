/* Shared physical layout for rendering, collisions and planar source framing. */
(function(){
  'use strict';
  const defaults={iso:1.03,length:1.75,bodyH:.30,travel:1.75/.92,feetX0:-.08*(1.75/.92),tail:-1.43};
  const mode=s=>s.setup||'normal';
  function headPose(h){
    const c=Math.cos(h.angle),n=Math.sin(h.angle),cy=Math.cos(h.yaw||0),sy=Math.sin(h.yaw||0);
    return {...h,axes:[[1,0,0],[0,c,n],[0,-n,c]].map(v=>[cy*v[0]+sy*v[2],v[1],-sy*v[0]+cy*v[2]])};
  }
  function geometry(s,parameters={}){
    const p={...defaults,...parameters},m=mode(s),standing=m==='standing1'||m==='standing2';
    const side=m==='standing2'?-1:1,top=s.tableH/100;
    const tableOffset=(s.tableZ-(s.setupAnchorZ??s.tableZ))/200*p.travel;
    let feet=p.feetX0+s.tableZ/200*p.travel;
    if(m==='external')feet=p.length/2+tableOffset;
    if(m==='ct')feet=.60+p.length/2+tableOffset;
    // The external stretcher crosses the original (X) bed axis along world Z.
    const yaw=m==='external'?-Math.PI/2:0;
    const turn=v=>m==='external'?[-v[2],v[1],v[0]]:v;
    let heads=[1,2].map(n=>{
      const radial=(s.rot+(n===2?(s.detectorSeparation??180):0))*Math.PI/180;
      const outward=(m==='standing1'&&n===1)||(m==='standing2'&&n===2);
      const angle=radial+(outward?Math.PI:0),distance=s['detDist'+n]/100;
      const c=Math.cos(angle),sn=Math.sin(angle);
      return {n,angle,radial,outward,yaw,axes:[[1,0,0],[0,c,sn],[0,-sn,c]].map(turn),position:turn([m==='external'?(n===1?-.34:.34):m==='ct'?-1.20:0,p.iso+Math.cos(radial)*distance,Math.sin(radial)*distance])};
    });
    if(s.setupHeads)heads=s.setupHeads.map((h,i)=>headPose({...h,n:i+1}));
    // Column vectors transform the original lying patient's feet-based coordinates.
    const columns=standing?[[0,-1,0],[0,0,-side],[side,0,0]]:
      [[p.headFirst?-1:1,0,0],[0,p.prone?-1:1,0],[0,0,(p.headFirst?-1:1)*(p.prone?-1:1)]].map(turn);
    const origin=standing?[0,.075,side*(.50+p.bodyH+.02)]:turn([feet-(p.headFirst?p.length:0),top+(p.prone?p.bodyH:0),0]);
    const world=v=>origin.map((a,i)=>a+columns.reduce((sum,c,j)=>sum+c[i]*v[j],0));
    const table=standing?null:m==='external'?{min:[-.32,top-.07,feet-p.length-.15],max:[.32,top,feet+.15],region:'camilla externa'}:
      {min:[Math.min(p.tail,feet+.25-2.2-(s.arms==='up'?.30:0)),top-.05,-.28],max:[feet+.25,top,.28],region:'camilla'};
    const bedPosition=turn([feet-p.length/2,top,0]),offset=s.setupPatientOffset||0;
    origin[0]+=offset;bedPosition[0]+=offset;
    if(table){table.min[0]+=offset;table.max[0]+=offset;}
    return {mode:m,standing,heads,columns,origin,world,table,feet,yaw,bedPosition,hidden:!!s.setupTransition,physical:p};
  }
  function signal(s,detector,physical={}){
    const m=mode(s);
    if(s.setupHeads||s.setupPatientOffset)return {empty:true,angle:0,progress:-10,label:'Preparando posición · adquisición suspendida'};
    if(m==='normal'&&!s.setupTransition)return null;
    if(s.setupTransition||m==='ct')return {empty:true,angle:0,progress:-10,label:s.setupTransition?'Reconfigurando equipo':'Paciente en CT · fuera del campo SPECT'};
    if(m==='standing1'||m==='standing2'){
      const active=detector===(m==='standing1'?1:2);
      return {empty:!active,angle:0,progress:1-(1.03-.075)/1.75,label:active?'Paciente de pie · detector exterior':'Detector interior · sin campo sobre el paciente'};
    }
    if(m==='external'){
      const g=geometry(s),h=g.heads[detector-1];
      const progress=(h.position[2]-(g.feet-1.75))/1.75;
      return {empty:false,angle:physical.prone?180:0,progress:physical.headFirst?1-progress:progress,label:'Camilla externa · '+(detector===1?'campo 1':'campo 2')};
    }
    return null;
  }
  window.GANTRY_SETUP={geometry,signal,mode,headPose};
})();
