const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8').replace(/\r\n/g,'\n'),script=fs.readFileSync('scripts/gantry_collision.js','utf8').replace(/\r\n/g,'\n');
const ctx={window:{},console,performance,TextDecoder,TextEncoder,ArrayBuffer,Uint8Array,Int8Array,Uint16Array,Uint32Array,Float32Array,Float64Array,DataView,URL,Blob,fetch,AbortController,Request,Response};
vm.createContext(ctx);vm.runInContext(script,ctx);
const C=ctx.window.GANTRY_COLLISION_CORE;
const near=(a,b,t=1e-5)=>assert(Math.abs(a-b)<t,`${a} != ${b}`);
const boxes=[{name:'face',min:[-.28,0,-.36],max:[.28,.20,.36]}];
const p={iso:1.03,feetX0:0,travel:2,length:1.75,bodyH:.30,tail:-1.43,headFirst:false,prone:false};
const state={rot:0,tableH:90,tableZ:100,detDist1:30,detDist2:30,arms:'down'};
// Actual triangle/footprint intersection, with no vertex inside the footprint.
const crossing=[{p:[[-1,.2,-1],[1,.2,-1],[0,.2,1]],region:'crossing face'}];
near(C.support(crossing,boxes,p=>p).required,.2);
assert.equal(C.support(crossing,[{name:'empty',min:[2,0,-.3],max:[3,.1,.3]}],p=>p).required,-Infinity);
const body=C.indexed([
 ...C.boxTriangles([-1.2,0,-.16],[-.9,.30,.16],'tórax'),
 ...C.boxTriangles([-1.74,.01,-.09],[-1.5,.18,.09],'cabeza'),
 ...C.boxTriangles([-.15,0,-.10],[0,.09,.10],'pies')
]);
let h=C.query(body,boxes,state,1,p);near(h.body.gap,.13);assert.equal(h.body.region,'tórax');
const head=C.query(body,boxes,{...state,tableZ:170},1,p);assert.equal(head.body.region,'cabeza');assert(head.body.gap>h.body.gap);
assert.equal(C.query(body,boxes,{...state,tableZ:-50},1,p).body.required,-Infinity);
// Head-first and prone transform both the location and the axial surface.
assert.equal(C.query(body,boxes,{...state,tableZ:10},1,{...p,headFirst:true}).body.region,'cabeza');
near(C.query(body,boxes,state,1,{...p,prone:true}).body.gap,h.body.gap);
near(C.query(body,boxes,{...state,rot:90},1,p).body.gap,.14);
near(C.query(body,boxes,{...state,rot:90},2,p).body.gap,.14);
const raised=C.indexed(C.boxTriangles([-2,.03,-.24],[-1.8,.22,.24],'manos elevadas'));
assert.equal(C.query(raised,boxes,{...state,tableZ:190},1,p).body.region,'manos elevadas');
// Wider housing lip can contact a part of the body outside the collimator.
const side=C.indexed(C.boxTriangles([-1.1,0,.37],[-1,.4,.42],'brazo derecho'));
const outer=[...boxes,{name:'housing lip',min:[-.35,.02,-.45],max:[.35,.3,.45]}];
assert.equal(C.query(side,boxes,state,1,p).body.required,-Infinity);
assert.equal(C.query(side,outer,state,1,p).body.part,'housing lip');
const evaluate=s=>[1,2].map(detector=>C.query(body,boxes,s,detector,p));
let r=C.sweep(state,{...state,detDist1:12},evaluate,false);
assert(r.blocked);near(evaluate(r.state)[0].body.gap,C.MARGIN,3e-6);
r=C.sweep(state,{...state,detDist1:12},evaluate,true);
// Body required radius .17: 10 mm training depth is reached at 16 cm.
assert(r.blocked);near(evaluate(r.state)[0].body.gap,-.010,3e-6);
const repeated=C.sweep(r.state,{...r.state,detDist1:12},evaluate,true);
assert(repeated.blocked);near(repeated.state.detDist1,r.state.detDist1,1e-4);
const release=C.sweep(r.state,{...r.state,detDist1:35},evaluate,false);
assert(!release.blocked);near(release.state.detDist1,35);
const tableBlocked=C.sweep(state,{...state,detDist2:12},evaluate,true);
assert.equal(tableBlocked.blocked.surface,'table');assert(evaluate(tableBlocked.state)[1].table.gap>=C.MARGIN-1e-8);
// Both endpoints clear, obstruction in between: translation and rotation.
function synthetic(s){const gap=Math.abs(s.tableZ-50)/100-.04;return [{body:{gap},table:{gap:1}},{body:{gap:1},table:{gap:1}}];}
const traverse=C.sweep({...state,tableZ:40},{...state,tableZ:60},synthetic);
assert(traverse.blocked);assert(traverse.state.tableZ<50);
const rotate=C.sweep({...state,rot:0},{...state,rot:30},s=>synthetic({...s,tableZ:s.rot+35}));
assert(rotate.blocked);assert(rotate.state.rot<15);
const wrap=C.sweep({...state,rot:359},{...state,rot:2},s=>[{body:{gap:1},table:{gap:1}},{body:{gap:1},table:{gap:1}}]);near(wrap.state.rot,2);

// Use the real bundled Three.js and patient GLB to exercise posed-mesh capture,
// production rig arm transforms, contact records and mode changes (no browser).
const bundleURL=html.match(/<script src="(assets\/runtime\/three-bundle\.[\w.]+)"><\/script>/)?.[1];
const bundle=bundleURL?fs.readFileSync(bundleURL,'utf8'):[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).find(s=>s.includes('window.GANTRY_THREE={'));
assert(bundle);vm.runInContext(bundle,ctx);
const {THREE,GLTFLoader}=ctx.window.GANTRY_THREE;
const elements={};for(const id of ['collisionMode','collisionSound','collisionMessage','collisionLog','collisionD1','collisionD2'])elements[id]={value:'safe',style:{},checked:false,rows:[],addEventListener(k,f){this[k]=f;},prepend(row){this.rows.unshift(row);}};
ctx.document={getElementById:id=>elements[id],createElement:()=>({style:{},remove(){}})};
const bytes=fs.readFileSync('assets/runtime/patient.dad8fa3ca2bc7760.glb');
new GLTFLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'',gltf=>{
 try{
  const scene=new THREE.Scene(),flip=new THREE.Group(),model=gltf.scene;scene.add(flip);flip.add(model);
  const bounds=new THREE.Box3().setFromObject(model),size=new THREE.Vector3();bounds.getSize(size);
  model.scale.setScalar(1.75/size.y);model.rotation.set(-Math.PI/2,0,Math.PI/2);scene.updateMatrixWorld(true);
  const b=new THREE.Box3().setFromObject(model);model.position.x-=b.max.x;model.position.y-=b.min.y;model.position.z-=(b.min.z+b.max.z)/2;scene.updateMatrixWorld(true);
  const bones={};model.traverse(o=>{if(o.isBone)bones[o.name.replace(/[^a-z]/gi,'').toLowerCase()]=o;});
  const rig={pairs:['l','r'].map(side=>{const upper=bones['upperarm'+side],lower=bones['lowerarm'+side];return {upper,lower,q0u:upper.quaternion.clone(),q0l:lower.quaternion.clone(),side:Math.sign(upper.getWorldPosition(new THREE.Vector3()).z)||1};})};
  const start=html.indexOf('  function aimBone('),end=html.indexOf('  /* ---------- estado y',start);
  Object.assign(ctx,{THREE,scene,flip,rig,dummyArms:[],_mi:new THREE.Matrix4(),_t:new THREE.Vector3(),_a:new THREE.Vector3(),_p:new THREE.Vector3(),_dir:new THREE.Vector3()});
  vm.runInContext(html.slice(start,end),ctx);
  const s={...state,tableZ:175,arms:'up'},equipment={enabled:true,metadata:JSON.parse(fs.readFileSync('assets/symbia-equipment/manifest.json'))};
  const api=ctx.window.createGantryCollision({THREE,scene,flip,dummy:new THREE.Group(),getModel:()=>model,setArms:ctx.setArms,getState:()=>s,equipment,physical:()=>p});
  const startTime=performance.now();
  const up=api.evaluate(s);assert(up[0].body.point);assert(Number.isFinite(up[0].limit));
  for(const pose of ['up','down'])for(const rot of [0,30,90,180,270])for(const z of [16,80,150,205]){
    const hits=api.evaluate({...s,arms:pose,rot,tableZ:z});assert(hits.every(h=>Number.isFinite(h.limit)));
  }
  assert([0,30,90,180,270].some(rot=>Math.abs(api.evaluate({...s,arms:'up',rot,tableZ:190})[0].body.required-api.evaluate({...s,arms:'down',rot,tableZ:190})[0].body.required)>.001),'Raised arms must change real mesh contacts');
  const elapsed=performance.now()-startTime;
  let move=api.move(s,{...s,detDist1:12});assert(move.blocked);Object.assign(s,move.state);
  elements.collisionMode.value='training';elements.collisionMode.change();
  move=api.move(s,{...s,detDist1:12});Object.assign(s,move.state);api.update(s);
  assert(api.evaluate(s)[0].body.gap>=-.010001);assert(elements.collisionD1.textContent.includes('CONTACTO'));
  assert(api.guard(s,{...s,detDist1:s.detDist1-.1}).blocked,'Automatic guard stays protected even in training mode');
  const logs=elements.collisionLog.rows.length;
  for(let i=0;i<4;i++){move=api.move(s,{...s,detDist1:12});Object.assign(s,move.state);api.update(s);}
  assert.equal(elements.collisionLog.rows.length,logs,'Holding the button must not duplicate contact episodes');
  assert(!elements.collisionLog.rows.some(row=>/máximo 1[1-9]/.test(row.textContent)),'Log only actual admitted depth');
  elements.collisionMode.value='safe';elements.collisionMode.change();
  move=api.move(s,{...s,detDist1:45});Object.assign(s,move.state);api.update(s);
  assert(!move.blocked);assert(!elements.collisionD1.textContent.includes('CONTACTO'));
  assert(elements.collisionMessage.textContent.includes('Protección activa'));
  assert(!api.canPose(s,{...s,detDist1:12}),'Instant pose/configuration changes cannot worsen contact');
  let tones=0;
  ctx.window.AudioContext=class {constructor(){this.currentTime=0;}resume(){return Promise.resolve();}createOscillator(){return {frequency:{value:0},connect(){},start(){tones++;},stop(){}};}createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}};}};
  elements.collisionSound.checked=true;elements.collisionSound.change();assert.equal(tones,1,'Optional alarm is activated by a user gesture');
  assert(html.includes(script),'Embedded runtime is current');
  console.log(JSON.stringify({result:'OK',finite_footprints:true,triangle_crossings:true,regional_mesh:true,postures_and_flips:true,housing_overhang:true,swept_motion:true,training_cap_and_retreat:true,table_always_protected:true,real_patient_GLTF:true,contact_episode_log:true,real_mesh_80_queries_ms:Math.round(elapsed)},null,2));
 }catch(e){console.error(e);process.exitCode=1;}
},error=>{console.error(error);process.exitCode=1;});
