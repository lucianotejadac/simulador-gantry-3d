const assetFetch=require('./asset_fetch.cjs');
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const src=fs.readFileSync('scripts/bone_whole_body.js','utf8');
assert(html.includes(src));
const engine=fs.readFileSync('scripts/bone_acquisition.js','utf8');
const ctx=vm.createContext({window:{},document:{getElementById:()=>null},Uint32Array});
vm.runInContext(src,ctx);vm.runInContext(engine,ctx);
const {eligibility,geometry,Scan,exposure,safeTargets,approach}=ctx.window.GANTRY_BONE_WHOLE;
const good={tableZ:200},feet={headFirst:false};
assert(eligibility(good,feet,feet).ok);
assert(eligibility({tableZ:184},feet,feet).ok);
assert(!eligibility({tableZ:16},feet,feet).ok);
assert(!eligibility({tableZ:NaN},feet,feet).ok);
assert(!eligibility(good,{headFirst:true},feet).ok);
assert(!eligibility(good,feet,{headFirst:true}).ok);
assert(eligibility(good,feet,feet,{1:{x:0,y:.1}}).ok);
assert(eligibility({tableZ:198},feet,feet).ok);
assert(eligibility({tableZ:120},feet,feet).ok);
assert(eligibility({tableZ:205},feet,feet).ok);
assert.equal(exposure(10,0,20,5,20),10);
assert.equal(exposure(50,0,20,5,20),0);
assert.equal(approach(50,20,.1),49.2);
assert.equal(approach(20,21,1),21);
const range={detDist1:[12,50],detDist2:[12,50]};
const guarded=safeTargets({tableZ:200},190,g=>({d1:g.tableZ<195?35:20,d2:25}),range);
assert.equal(guarded.detDist1,36);assert.equal(guarded.detDist2,26);
assert.throws(()=>safeTargets({tableZ:200},190,()=>({d1:50,d2:12}),range));
assert.throws(()=>new Scan(128,0,{width:256,height:640},200));
const packed=JSON.parse(html.match(/window.GANTRY_ICRP_DATA=(.*?);\n/)[1]);
const linear=vm.createContext({window:{GANTRY_ICRP_DATA:{down:packed.down,up:packed.up}},Uint8Array,Uint16Array,Float32Array,Float64Array,Blob,Response,DecompressionStream,fetch:assetFetch,atob});
vm.runInContext(fs.readFileSync('scripts/icrp_live.js','utf8'),linear);
const {Acquisition}=ctx.window.GANTRY_BONE_CORE;
vm.runInContext(fs.readFileSync('scripts/bone_acquisition_store.js','utf8'),ctx);
function rng(){let seed=123;return ()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)+.5)/4294967296;}
(async()=>{
 await linear.window.GANTRY_ICRP.ready;
 for(const pose of Object.values(linear.window.GANTRY_ICRP.poses)){
  const size=geometry(pose,128),{width,height,crop}=size;
  assert.equal(height,width*4);assert(crop.y<=0);assert(crop.h>=pose.height);
  assert.equal(crop.x+crop.w/2,pose.width/2);
  assert(Math.abs(crop.w/width-crop.h/height)<1e-12,'square physical pixels, not a stretched atlas');
  const fields=[0,pose.angles.indexOf(180)].map(i=>linear.window.GANTRY_ICRP.field(pose,{lo:i,hi:i,mix:0},crop,width,height,false,false,{contrast:1,countFactor:1,haloAlpha:0},.5));
  const a=new Acquisition(128,'time',20,rng(),height);a.step(fields,4000,5);
  assert(!a.finished);a.step(fields,4000,20);assert(a.finished);
  for(const h of a.heads){assert.equal(h.counts.length,width*height);assert.equal(h.total,h.counts.reduce((x,y)=>x+y,0));assert(h.counts.slice(0,width*Math.floor(height/3)).some(v=>v>0));assert(h.counts.slice(width*Math.floor(2*height/3)).some(v=>v>0));}
  const b=new Acquisition(128,'counts',5000,rng(),height);b.step(fields,4000,Infinity);assert(b.heads.every(h=>h.total===5000));
  const record={version:1,id:'test',createdAt:Date.now(),n:128,height,kind:'whole',mode:'counts',target:5000,names:['Anterior','Posterior'],heads:b.heads};
  ctx.window.GANTRY_BONE_STORAGE.validate(record);
  assert.throws(()=>ctx.window.GANTRY_BONE_STORAGE.validate({...record,height:128}));
  const scan=new Scan(128,10,pose,200,rng());
  scan.step(fields,4000,60);assert(Math.abs(scan.travel-10)<1e-9);assert(Math.abs(scan.tableZ-(200-10*184/175))<1e-9);
  assert(scan.heads.every(h=>h.counts.slice(width*Math.floor(height*.7)).every(v=>v===0)),'future legs must remain empty');
  const prior=scan.heads[0].counts.slice();scan.step(fields,4000,10000);
  assert(scan.finished);assert.equal(scan.tableZ,16);assert(Math.abs(scan.heads[0].elapsed-1050)<1e-8);
  assert(scan.heads[0].counts.every((v,i)=>v>=prior[i]));assert(scan.heads.every(h=>h.counts.slice(width*Math.floor(height*.8)).some(v=>v>0)));
  const faster=new Scan(128,20,pose,200,rng());faster.step(fields,4000,10000);
  assert(Math.abs(faster.heads[0].elapsed-525)<1e-8);
  const slowCounts=scan.heads[0].total,fastCounts=faster.heads[0].total;
  assert(Math.abs(slowCounts-2*fastCounts)<7*Math.sqrt(slowCounts+4*fastCounts),'half velocity approximately doubles counts');
  for(const h of scan.heads)assert.equal(h.total,h.counts.reduce((a,b)=>a+b,0));
  ctx.window.GANTRY_BONE_STORAGE.validate({...record,mode:'scan',target:175,heads:scan.heads,scan:{velocity:10,travel:175}});
  // Starting over the torso must never acquire the head that has already passed.
  const partial=new Scan(128,20,pose,120,rng());
  assert.equal(partial.tableZ,120);assert(partial.fromRow>pose.headRow);
  partial.step(fields,4000,10000);
  assert(partial.finished);assert.equal(partial.tableZ,16);
  assert(Math.abs(partial.heads[0].elapsed-(120-16)*175/184*3)<1e-8);
  const pastRows=Math.max(0,Math.floor((partial.fromRow-560/3/2-crop.y)/crop.h*height));
  assert(partial.heads.every(h=>h.counts.slice(0,pastRows*width).every(v=>v===0)));
  assert(partial.heads.every(h=>h.total>0));
  const short=new Scan(128,20,pose,16.5,rng());short.step(fields,4000,100);
  ctx.window.GANTRY_BONE_STORAGE.validate({...record,mode:'scan',target:short.target,heads:short.heads,scan:{velocity:20,travel:short.travel}});
  console.log('Complete phantom:',pose.width,pose.height,'=>',width,height,'counts:',a.heads.map(h=>h.total));
 }
 // Production movement adapter: actual fields plus a conservative changing envelope.
 const W=ctx.window,G={tableZ:120,detDist1:50,detDist2:50,tableH:94,arms:'down',rot:0};
 const settings={matrix:128,zoom:1,centers:{1:{x:0,y:0},2:{x:0,y:0}},headFirst:false,decubitus:'supine',collimator:'LEHR',energyCenter:140,windowWidth:20};
 W.GANTRY={G,LIM:range,SCAN:{zTop:200},render(){}};W.GANTRY_PATIENT3D={headFirst:false};
 W.GANTRY3D={limits:g=>({d1:g.tableZ<100?35:20,d2:25}),surfaceGaps:()=>null};W.GANTRY_ICRP=linear.window.GANTRY_ICRP;
 W.GANTRY_LIVE={settings,setZoom:z=>settings.zoom=z,resetImageCenter(){},framePair(angle){const i=W.GANTRY_ICRP.poses.down.angles.indexOf((angle%360+360)%360);return {lo:i,hi:i,mix:0};},distanceMetrics:()=>({blur:.2,contrast:1,countFactor:1,haloAlpha:0,haloBlur:0})};
 const auto=W.GANTRY_BONE_WHOLE.create(60);W.GANTRY_BONE_WHOLE.advance(auto,1000,.5);
 assert.equal(G.tableZ,120);assert.equal(auto.startZ,120);assert.equal(auto.travel,0);assert.equal(G.detDist1,46);assert.equal(auto.heads[0].total,0);
 for(let steps=0;!auto.finished&&steps<500;steps++){
  W.GANTRY_BONE_WHOLE.advance(auto,1000,.5);
  const L=W.GANTRY3D.limits(G);assert(G.detDist1>=L.d1+1);assert(G.detDist2>=L.d2+1);
 }
 assert(auto.finished);assert.equal(G.tableZ,16);assert(auto.heads[0].total>0);
 // Alignment must finish before table travel or counts, with room reserved
 // for intermediate angles rather than only the final AP/PA position.
 W.GANTRY3D.limits=g=>({d1:20+15*Math.abs(Math.sin(g.rot*Math.PI/90)),d2:25});
 for(const [angle,target] of [[60,0],[140,180],[350,360]]){
  Object.assign(G,{tableZ:120,rot:angle,detDist1:21,detDist2:26});
  const aligned=W.GANTRY_BONE_WHOLE.create(60);
  assert.equal(aligned.targetRot,target);
  let sawRotation=false,sawRetraction=false;
  for(let steps=0;aligned.travel===0&&steps<100;steps++){
   const previous=G.rot;W.GANTRY_BONE_WHOLE.advance(aligned,1000,.5);
   sawRetraction ||= aligned.phase==='retracting';sawRotation ||= G.rot!==previous;
   if(G.rot!==previous){assert(G.detDist1>=W.GANTRY3D.limits(G).d1+1-1e-8);assert(G.detDist2>=26);}
   if(aligned.travel===0){assert.equal(G.tableZ,120);assert(aligned.heads.every(h=>h.total===0&&h.elapsed===0));}
  }
  assert(sawRotation&&sawRetraction);assert.equal(G.rot,target);assert(aligned.travel>0);
 }
 for(const separation of [90,76]){
  Object.assign(G,{tableZ:120,rot:322,detectorSeparation:separation,detDist1:47,detDist2:47});
  const aligned=W.GANTRY_BONE_WHOLE.create(60);
  for(let steps=0;aligned.travel===0&&steps<150;steps++){
   W.GANTRY_BONE_WHOLE.advance(aligned,1000,.5);
   if(G.detectorSeparation!==180)assert.equal(aligned.heads[0].total,0,'No scan counts before heads are opposed');
  }
  assert.equal(G.detectorSeparation,180);assert.equal(G.rot,360);assert(aligned.travel>0);
 }
 delete G.detectorSeparation;
 Object.assign(G,{tableZ:120,rot:60,detDist1:21,detDist2:26});
 const interrupted=W.GANTRY_BONE_WHOLE.create(60);G.rot=61;
 assert.throws(()=>W.GANTRY_BONE_WHOLE.advance(interrupted,1000,.5));
 W.GANTRY3D.limits=()=>({d1:50,d2:25});
 assert.throws(()=>W.GANTRY_BONE_WHOLE.create(60),/espacio seguro/);
 W.GANTRY3D.limits=()=>({d1:20,d2:25});G.rot=0;
 G.tableZ=200;const altered=W.GANTRY_BONE_WHOLE.create(60);G.arms='up';assert.throws(()=>W.GANTRY_BONE_WHOLE.advance(altered,1000,.5));
 Object.assign(G,{tableZ:120,rot:0,detDist1:21,detDist2:26});
 const stopped=W.GANTRY_BONE_WHOLE.create(60);
 W.GANTRY3D.collision={guard:()=>({blocked:{detector:1,hit:{region:'mano derecha'}}})};
 assert.throws(()=>W.GANTRY_BONE_WHOLE.advance(stopped,1000,.5),/riesgo de contacto/);
 assert.equal(stopped.travel,0);assert.equal(G.tableZ,120);assert(stopped.heads.every(h=>h.total===0));
 delete W.GANTRY3D.collision;
 let cm=1.01,builds=0;
 W.GANTRY3D.surfaceGaps=()=>({d1:{cm},d2:{cm:2.02}});
 W.GANTRY_LIVE.distanceMetrics=cm=>({blur:.2+cm*.1,contrast:1,countFactor:1,haloAlpha:0,haloBlur:0});
 const originalField=W.GANTRY_ICRP.field;
 W.GANTRY_ICRP.field=(...args)=>{builds++;return originalField(...args);};
 const first=W.GANTRY_BONE_WHOLE.fields();assert.equal(builds,2);
 cm=1.11;const same=W.GANTRY_BONE_WHOLE.fields();assert.equal(builds,2);assert.equal(first.fields[0],same.fields[0]);
 cm=1.30;const changed=W.GANTRY_BONE_WHOLE.fields();assert.equal(builds,3);assert.equal(first.fields[1],changed.fields[1]);assert.notEqual(first.fields[0],changed.fields[0]);
 W.GANTRY_ICRP.field=originalField;
 console.log('OK: sequential finite-FOV exposure, no future-leg counts, physical velocity, exact endpoint/duration, slower scan increases counts, safe detector approach/path margins, immutable prior counts, real ICRP both arm poses, legacy and scan snapshots.');
})().catch(e=>{console.error(e);process.exitCode=1;});
