/* Geometric training feedback. Metres internally; conservative detector boxes.
 * Patient triangles are cached per pose and indexed along the table axis.
 * No tissue forces, injury prediction, deformation or clinical collision model.
 */
(function(){
  'use strict';
  const MARGIN=.0025, TRAINING_DEPTH=.010, BIN=.05;
  function indexed(triangles){
    const bins=new Map();
    triangles.forEach((t,i)=>{
      const xs=t.p.map(p=>p[0]);
      for(let k=Math.floor(Math.min(...xs)/BIN);k<=Math.floor(Math.max(...xs)/BIN);k++){
        if(!bins.has(k))bins.set(k,[]);bins.get(k).push(i);
      }
    });
    return {triangles,bins,seen:new Uint32Array(triangles.length),stamp:0};
  }
  function candidates(mesh,lo,hi){
    if(++mesh.stamp===4294967295){mesh.seen.fill(0);mesh.stamp=1;}
    const out=[];
    for(let k=Math.floor(lo/BIN);k<=Math.floor(hi/BIN);k++)for(const i of mesh.bins.get(k)||[]){
      if(mesh.seen[i]!==mesh.stamp){mesh.seen[i]=mesh.stamp;out.push(mesh.triangles[i]);}
    }
    return out;
  }
  // Clip a triangle against the longitudinal/tangential footprint of a part.
  // This catches a face crossing the field even when all its vertices are out.
  function clip(poly,axis,bound,sign){
    const out=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],da=(a[axis]-bound)*sign,db=(b[axis]-bound)*sign;
      if(da>=0)out.push(a);
      if((da>=0)!==(db>=0)){
        const f=da/(da-db);out.push(a.map((v,j)=>v+(b[j]-v)*f));
      }
    }
    return out;
  }
  function support(triangles,boxes,project){
    let best={required:-Infinity,region:null,point:null,part:null};
    for(const t of triangles){
      const pts=t.p.map(project);
      const xmin=Math.min(...pts.map(p=>p[0])),xmax=Math.max(...pts.map(p=>p[0]));
      const zmin=Math.min(...pts.map(p=>p[2])),zmax=Math.max(...pts.map(p=>p[2]));
      for(const b of boxes){
        if(xmax<b.min[0]||xmin>b.max[0]||zmax<b.min[2]||zmin>b.max[2])continue;
        let poly=pts;
        if(xmin<b.min[0])poly=clip(poly,0,b.min[0],1);
        if(xmax>b.max[0])poly=clip(poly,0,b.max[0],-1);
        if(zmin<b.min[2])poly=clip(poly,2,b.min[2],1);
        if(zmax>b.max[2])poly=clip(poly,2,b.max[2],-1);
        for(const p of poly){
          const required=p[1]-b.min[1];
          if(required>best.required)best={required,region:t.region,point:p,part:b.name};
        }
      }
    }
    return best;
  }
  function boxTriangles(min,max,region){
    const p=[];for(let i=0;i<8;i++)p.push([i&1?max[0]:min[0],i&2?max[1]:min[1],i&4?max[2]:min[2]]);
    return [[0,1,3],[0,3,2],[4,6,7],[4,7,5],[0,4,5],[0,5,1],[2,3,7],[2,7,6],[0,2,6],[0,6,4],[1,5,7],[1,7,3]].map(ids=>({p:ids.map(i=>p[i]),region}));
  }
  function query(mesh,boxes,s,detector,physical){
    const th=(s.rot+(detector===2?(s.detectorSeparation??180):0))*Math.PI/180,c=Math.cos(th),n=Math.sin(th);
    const slideX=physical.feetX0+s.tableZ/200*physical.travel,top=s.tableH/100;
    const project=p=>[p[0],c*(p[1]-physical.iso)+n*p[2],-n*(p[1]-physical.iso)+c*p[2]];
    const toWorld=p=>[slideX+(physical.headFirst?-physical.length-p[0]:p[0]),
      top+(physical.prone?physical.bodyH-p[1]:p[1]),
      (physical.headFirst?-1:1)*(physical.prone?-p[2]:p[2])];
    const xmin=Math.min(...boxes.map(b=>b.min[0])),xmax=Math.max(...boxes.map(b=>b.max[0]));
    const lo=physical.headFirst?slideX-physical.length-xmax:xmin-slideX;
    const hi=physical.headFirst?slideX-physical.length-xmin:xmax-slideX;
    const body=support(candidates(mesh,lo,hi),boxes,p=>project(toWorld(p)));
    const L=Math.max(2.2+(s.arms==='up'?.3:0),slideX+.25-physical.tail);
    const table=support(boxTriangles([slideX+.25-L,top-.05,-.28],[slideX+.25,top,.28],'camilla'),boxes,project);
    const distance=s['detDist'+detector]/100;
    for(const hit of [body,table]){
      hit.gap=distance-hit.required;
      if(hit.point){const [x,r,t]=hit.point;hit.point=[x,physical.iso+c*r-n*t,n*r+c*t];}
    }
    return {detector,body,table,limit:Math.max(.12,body.required+MARGIN,table.required+MARGIN)};
  }
  function worsens(next,prior,training,contact=false){
    for(let i=0;i<2;i++)for(const surface of ['body','table','equipment']){
      if(!next[i][surface]||!prior[i][surface])continue;
      const threshold=contact?0:surface==='body'&&training?-TRAINING_DEPTH:MARGIN;
      if(next[i][surface].gap<threshold-1e-8 && next[i][surface].gap<prior[i][surface].gap-1e-8)
        return {detector:i+1,surface,hit:next[i][surface]};
    }
    return null;
  }
  function sweep(from,to,evaluate,training=false,contact=false){
    let angle=((to.rot-from.rot+540)%360)-180;
    const separation=(to.detectorSeparation??180)-(from.detectorSeparation??180);
    const count=Math.max(1,Math.ceil((Math.abs(angle)+Math.abs(separation))/.25),...['tableH','tableZ','detDist1','detDist2'].map(k=>Math.ceil(Math.abs(to[k]-from[k])/.1)));
    const at=t=>{const s={...from};for(const k of ['tableH','tableZ','detDist1','detDist2'])s[k]=from[k]+(to[k]-from[k])*t;s.rot=(from.rot+angle*t+360)%360;if('detectorSeparation' in from||'detectorSeparation' in to)s.detectorSeparation=(from.detectorSeparation??180)+separation*t;return s;};
    let last=from,prior=evaluate(from),f=0;
    for(let i=1;i<=count;i++){
      const next=at(i/count),hits=evaluate(next),blocked=worsens(hits,prior,training,contact);
      if(blocked){
        let lo=f,hi=i/count;
        for(let j=0;j<9;j++){const m=(lo+hi)/2;if(worsens(evaluate(at(m)),prior,training,contact))hi=m;else lo=m;}
        return {state:at(lo),blocked};
      }
      last=next;prior=hits;f=i/count;
    }
    return {state:last,blocked:null};
  }
  // Separating-axis test for the two simple detector housings in the YZ plane.
  // Their longitudinal extents overlap; include housings and supports.
  function detectorGap(s,boxes1,boxes2){
    const angle1=s.rot*Math.PI/180,angle2=(s.rot+(s.detectorSeparation??180))*Math.PI/180;
    const rectangle=(b,angle,distance)=>{
      const c=Math.cos(angle),n=Math.sin(angle),radial=[c,n],tangent=[-n,c];
      const r=distance/100+(b.min[1]+b.max[1])/2,t=(b.min[2]+b.max[2])/2;
      return {center:[c*r-n*t,n*r+c*t],axes:[radial,tangent],half:[(b.max[1]-b.min[1])/2,(b.max[2]-b.min[2])/2]};
    };
    let gap=Infinity;
    for(const a of boxes1)for(const b of boxes2){
      if(a.max[0]<b.min[0]||b.max[0]<a.min[0])continue;
      const A=rectangle(a,angle1,s.detDist1),B=rectangle(b,angle2,s.detDist2),d=B.center.map((v,i)=>v-A.center[i]);
      const dot=(u,v)=>u[0]*v[0]+u[1]*v[1];
      const project=(R,axis)=>R.axes.reduce((sum,u,i)=>sum+Math.abs(dot(u,axis))*R.half[i],0);
      gap=Math.min(gap,Math.max(...[...A.axes,...B.axes].map(axis=>Math.abs(dot(d,axis))-project(A,axis)-project(B,axis))));
    }
    return gap;
  }
  window.GANTRY_COLLISION_CORE={indexed,support,boxTriangles,query,sweep,worsens,detectorGap,MARGIN,TRAINING_DEPTH};

  window.createGantryCollision=function({THREE,scene,flip,dummy,getModel,setArms,getState,equipment,physical}){
    const mode=document.getElementById('collisionMode'),sound=document.getElementById('collisionSound');
    const message=document.getElementById('collisionMessage'),log=document.getElementById('collisionLog');
    const outputs=[1,2].map(i=>document.getElementById('collisionD'+i));
    const frame=document.getElementById('gantryWin');
    const poses=new Map(),results=new Map(),episodes=[null,null],records=[];
    let source=null,lastKey='',lastAlarm=0,audio=null;
    let lastShock=-Infinity;
    function shock(){
      // One short impact per episode; paired detectors and held controls must
      // not restart the animation every frame. Only CSS moves the viewport.
      if(!frame||performance.now()-lastShock<1000)return;
      lastShock=performance.now();
      frame.classList.add('collision-shock');
      setTimeout(()=>frame.classList.remove('collision-shock'),950);
    }
    const markers=[1,2].map(()=>{
      const m=new THREE.Mesh(new THREE.SphereGeometry(.022,12,8),new THREE.MeshBasicMaterial({color:0xffc857,transparent:true,opacity:.8,depthTest:false}));
      m.visible=false;m.renderOrder=35;scene.add(m);return m;
    });
    function region(bone,x){
      const b=bone.toLowerCase().replace(/[^a-z]/g,'');
      const side=b.endsWith('l')?' izquierdo':b.endsWith('r')?' derecho':'';
      const feminine=side.replace(/o$/,'a');
      if(/finger|thumb|palm|hand/.test(b))return 'mano'+feminine;
      if(/lowerarm/.test(b))return 'antebrazo'+side;
      if(/upperarm/.test(b))return 'brazo'+side;
      if(/shoulder|clavicle/.test(b))return 'hombro'+side;
      if(/head|neck|jaw|eye/.test(b))return 'cabeza y cuello';
      if(/foot|toe/.test(b))return 'pie'+side;
      if(/leg|thigh|shin|calf/.test(b))return 'pierna'+feminine;
      if(x<-1.48)return 'cabeza y cuello';if(x<-1.05)return 'tórax';
      if(x<-.72)return 'abdomen y pelvis';if(x<-.20)return 'piernas';return 'pies';
    }
    function pose(arms){
      const model=getModel()||dummy;
      if(model!==source){source=model;poses.clear();results.clear();}
      if(poses.has(arms))return poses.get(arms);
      setArms(arms==='up');scene.updateMatrixWorld(true);
      const inverse=new THREE.Matrix4().copy(flip.matrixWorld).invert(),matrix=new THREE.Matrix4(),v=new THREE.Vector3();
      const triangles=[];
      model.traverse(o=>{
        if(!o.isMesh||!o.geometry?.attributes.position)return;
        if(o.skeleton)o.skeleton.update();
        matrix.multiplyMatrices(inverse,o.matrixWorld);
        const g=o.geometry,points=[],labels=[],pos=g.attributes.position,si=g.attributes.skinIndex,sw=g.attributes.skinWeight;
        for(let i=0;i<pos.count;i++){
          if(o.getVertexPosition)o.getVertexPosition(i,v);else v.fromBufferAttribute(pos,i);
          v.applyMatrix4(matrix);points.push([v.x,v.y,v.z]);
          let bone='',weight=-1;
          if(si&&sw&&o.skeleton)for(let j=0;j<4;j++)if(sw.getComponent(i,j)>weight){weight=sw.getComponent(i,j);bone=o.skeleton.bones[si.getComponent(i,j)]?.name||'';}
          labels.push(region(bone,v.x));
        }
        const count=g.index?g.index.count:pos.count;
        for(let i=0;i+2<count;i+=3){const ids=[0,1,2].map(j=>g.index?g.index.getX(i+j):i+j);
          triangles.push({p:ids.map(j=>points[j]),region:labels[ids[0]]===labels[ids[1]]?labels[ids[0]]:labels[ids[2]]});}
      });
      setArms(getState().arms==='up');scene.updateMatrixWorld(true);
      const mesh=indexed(triangles);poses.set(arms,mesh);return mesh;
    }
    const simple=[{name:'colimador y carcasa',min:[-.28,0,-.36],max:[.28,.24,.36]},
      {name:'soporte',min:[-.13,.19,-.19],max:[.13,.39,.19]}];
    function boxes(detector){
      if(equipment.enabled&&equipment.metadata?.components?.some(c=>c.bounds))return equipment.metadata.components
        .filter(c=>c.group==='Detector'+detector).map(c=>({name:c.name.startsWith('SPECT')?'soporte':'carcasa/colimador',min:c.bounds[0],max:c.bounds[1]}));
      return simple;
    }
    function evaluate(s,physicalOverride){
      const mesh=pose(s.arms),p={...physical(),...physicalOverride},key=JSON.stringify([s.rot,s.detectorSeparation??180,s.tableH,s.tableZ,s.detDist1,s.detDist2,s.arms,p.headFirst,p.prone,p.bodyH,equipment.enabled]);
      if(results.has(key))return results.get(key);
      const hits=[1,2].map(d=>query(mesh,boxes(d),s,d,p));
      const gap=detectorGap(s,boxes(1),boxes(2));
      hits.forEach(h=>h.equipment={gap,region:'otro detector',point:null});
      if(results.size>256)results.clear();results.set(key,hits);return hits;
    }
    function alarm(){
      if(!sound.checked||performance.now()-lastAlarm<1800)return;
      lastAlarm=performance.now();
      try{const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
        audio||=new Audio();audio.resume().catch(()=>{});
        const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.frequency.value=660;
        gain.gain.setValueAtTime(.07,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.18);
        oscillator.connect(gain);gain.connect(audio.destination);oscillator.start();oscillator.stop(audio.currentTime+.2);
      }catch(_){}
    }
    function event(detector,hit,kind){
      const peak=Math.max(0,-hit.gap*1000),i=detector-1;
      if(!episodes[i]||episodes[i].kind!==kind){
        const row=document.createElement('li');row.style.marginBottom='3px';log.prepend(row);
        episodes[i]={kind,peak,row,time:new Date().toLocaleTimeString('es-CL'),region:hit.region};records.unshift(episodes[i]);
        if(records.length>30)records.pop().row.remove();
        alarm();shock();
      }
      const e=episodes[i];if(peak>=e.peak){e.peak=peak;e.region=hit.region;}
      e.row.textContent=e.time+' · D'+detector+' · '+kind+' · '+e.region+(e.peak>0?' · máximo '+e.peak.toFixed(1)+' mm':'');
    }
    function update(s){
      const hits=evaluate(s),training=mode.value==='training';
      frame?.classList.toggle('collision-contact',hits.some(h=>Math.min(h.body.gap,h.table.gap,h.equipment.gap)<=0));
      hits.forEach((h,i)=>{
        const hit=[h.body,h.table,h.equipment].reduce((a,b)=>a.gap<=b.gap?a:b),mm=hit.gap*1000;
        const critical=mm<=0,near=mm<50;
        outputs[i].textContent='D'+(i+1)+' · '+(!Number.isFinite(mm)?'Sin paciente/camilla delante':
          (critical?'CONTACTO · penetración '+Math.max(0,-mm).toFixed(1)+' mm':mm<=2.6?'Límite de seguridad · '+mm.toFixed(1)+' mm':mm.toFixed(0)+' mm libres')+' · '+hit.region);
        outputs[i].style.color=critical?'#ff7979':near?'#ffcf69':'#91e6b4';
        markers[i].visible=near&&!!hit.point;
        if(markers[i].visible){markers[i].position.set(...hit.point);markers[i].material.color.set(critical?0xff4141:0xffc857);}
        if(critical)event(i+1,hit,training&&hit===h.body?'Compresión simulada':'Contacto detectado');
        else if(mm>5)episodes[i]=null;
      });
      const key=JSON.stringify(hits.map(h=>[h.body.gap<0,h.table.gap<0,h.equipment.gap<0]));
      if(key!==lastKey){lastKey=key;message.textContent=hits.some(h=>Math.min(h.body.gap,h.table.gap,h.equipment.gap)<0)?'Retira el detector o la camilla para liberar el contacto.':training?'Entrenamiento: penetración geométrica máxima de 10 mm; no representa fuerza ni daño.':mode.value==='sentinel'?'Centinela activo: el contacto en movimiento rápido cancela el examen.':'Protección activa · margen de 2,5 mm.';}
      return hits;
    }
    function move(from,to,{fast=false}={}){
      const sentinel=mode.value==='sentinel'&&fast&&!window.GANTRY_EXAM?.blocked;
      const result=sweep(from,to,evaluate,mode.value==='training',sentinel);
      lastKey='';
      update(result.state);
      if(result.blocked){
        const {detector,hit,surface}=result.blocked;
        message.textContent='Movimiento detenido · D'+detector+' · '+hit.region+' · '+(mode.value==='training'&&surface==='body'?'límite de compresión simulada (10 mm).':'contacto evitado.');
        event(detector,evaluate(result.state)[detector-1][surface],sentinel?'Evento centinela simulado':mode.value==='training'&&surface==='body'?'Compresión simulada':'Contacto evitado');
        if(hit.point){markers[detector-1].visible=true;markers[detector-1].position.set(...hit.point);markers[detector-1].material.color.set(0xff4141);}
      }
      if(sentinel&&result.blocked){
        const {detector,surface,hit}=result.blocked;
        // The swept path has crossed zero clearance, not merely the safety margin.
        window.GANTRY_EXAM?.cancel({detector,surface,region:hit.region,axis:'movimiento rápido'});
        message.textContent='Evento centinela simulado · examen cancelado. Retira el contacto y reinicia el examen.';
        shock();
      }
      return result;
    }
    mode.addEventListener('change',()=>{lastKey='';update(getState());});
    sound.addEventListener('change',()=>{if(sound.checked){lastAlarm=-Infinity;alarm();}});
    return {evaluate,update,move,guard:(from,to)=>sweep(from,to,evaluate,false),
      canPose(from,to,physicalOverride){
        const blocked=worsens(evaluate(to,physicalOverride),evaluate(from),false);
        if(blocked){message.textContent='Cambio de postura bloqueado · D'+blocked.detector+' · '+blocked.hit.region+'. Aleja los detectores.';alarm();shock();}
        return !blocked;
      },
      invalidate(){poses.clear();results.clear();lastKey='';},
      limits(s){const h=evaluate(s);return {d1:Math.ceil(h[0].limit*100),d2:Math.ceil(h[1].limit*100)};},
      get training(){return mode.value==='training';},get ready(){return source!==null;}};
  };
})();
