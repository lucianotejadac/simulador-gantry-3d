const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const src=fs.readFileSync('scripts/bone_whole_body.js','utf8');
assert(html.includes(src));
const engine=fs.readFileSync('scripts/bone_acquisition.js','utf8');
const ctx=vm.createContext({window:{},document:{getElementById:()=>null},Uint32Array});
vm.runInContext(src,ctx);vm.runInContext(engine,ctx);
const {eligibility,geometry}=ctx.window.GANTRY_BONE_WHOLE;
const good={tableZ:200},feet={headFirst:false};
assert(eligibility(good,feet,feet).ok);
assert(!eligibility({tableZ:184},feet,feet).ok);
assert(!eligibility({tableZ:16},feet,feet).ok);
assert(!eligibility({tableZ:NaN},feet,feet).ok);
assert(!eligibility(good,{headFirst:true},feet).ok);
assert(!eligibility(good,feet,{headFirst:true}).ok);
assert(!eligibility(good,feet,feet,{1:{x:0,y:.1}}).ok);
assert(eligibility({tableZ:198},feet,feet).ok);
assert(!eligibility({tableZ:197.9},feet,feet).ok);
const packed=JSON.parse(html.match(/window.GANTRY_ICRP_DATA=(.*?);\n/)[1]);
const linear=vm.createContext({window:{GANTRY_ICRP_DATA:{down:packed.down,up:packed.up}},Uint8Array,Uint16Array,Float32Array,Float64Array,Blob,Response,DecompressionStream,atob});
vm.runInContext(fs.readFileSync('scripts/icrp_live.js','utf8'),linear);
const {Acquisition}=ctx.window.GANTRY_BONE_CORE;
vm.runInContext(fs.readFileSync('scripts/bone_acquisition_store.js','utf8'),ctx);
function rng(){let seed=123;return ()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)+.5)/4294967296;}
(async()=>{
 await linear.window.GANTRY_ICRP.ready;
 for(const pose of Object.values(linear.window.GANTRY_ICRP.poses)){
  const size=geometry(pose,128),{width,height,crop}=size;
  assert(height>width);assert(crop.y<=0);assert(crop.h>=pose.height);
  assert(crop.x<=0);assert(crop.x+crop.w>=pose.width);
  const fields=[0,pose.angles.indexOf(180)].map(i=>linear.window.GANTRY_ICRP.field(pose,{lo:i,hi:i,mix:0},crop,width,height,false,false,{contrast:1,countFactor:1,haloAlpha:0},.5));
  const a=new Acquisition(128,'time',20,rng(),height);a.step(fields,4000,5);
  assert(!a.finished);a.step(fields,4000,20);assert(a.finished);
  for(const h of a.heads){assert.equal(h.counts.length,width*height);assert.equal(h.total,h.counts.reduce((x,y)=>x+y,0));assert(h.counts.slice(0,width*Math.floor(height/3)).some(v=>v>0));assert(h.counts.slice(width*Math.floor(2*height/3)).some(v=>v>0));}
  const b=new Acquisition(128,'counts',5000,rng(),height);b.step(fields,4000,Infinity);assert(b.heads.every(h=>h.total===5000));
  const record={version:1,id:'test',createdAt:Date.now(),n:128,height,kind:'whole',mode:'counts',target:5000,names:['Anterior','Posterior'],heads:b.heads};
  ctx.window.GANTRY_BONE_STORAGE.validate(record);
  assert.throws(()=>ctx.window.GANTRY_BONE_STORAGE.validate({...record,height:128}));
  console.log('Complete phantom:',pose.width,pose.height,'=>',width,height,'counts:',a.heads.map(h=>h.total));
 }
 console.log('OK: feet-first and cranial gates, offset rejection, rectangular real ICRP projections, both arm poses, skull/feet counts, count/time goals and saved dimensions.');
})().catch(e=>{console.error(e);process.exitCode=1;});
