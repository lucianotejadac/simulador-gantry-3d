const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const assetFetch=require('./asset_fetch.cjs');
const downloads=[];const fetch=url=>{downloads.push(url);return assetFetch(url);};
const html=fs.readFileSync('index.html','utf8');
const data=JSON.parse(html.match(/window.GANTRY_MDP_DATA=(.*?);<\/script>/)[1]);
const icrp=JSON.parse(html.match(/window.GANTRY_ICRP_DATA=(.*?);\n/)[1]);
const ctx=vm.createContext({window:{GANTRY_MDP_DATA:data,GANTRY_ICRP_DATA:icrp},document:{getElementById:()=>null},Float32Array,Float64Array,Uint8Array,Uint16Array,Uint32Array,Blob,Response,DecompressionStream,fetch});
vm.runInContext(fs.readFileSync('scripts/icrp_live.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('scripts/mdp.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('scripts/bone_acquisition.js','utf8'),ctx);
const M=ctx.window.GANTRY_MDP;
assert.deepEqual(data.angles,Array.from({length:360},(_,i)=>i),'one skeletal projection per degree');
for(let t=0;t<=10800;t+=.25){
  for(const voiding of [false,true]){
    const f=M.fractions(t,voiding);
    assert(f.weights.every(v=>v>=0&&Number.isFinite(v)));
    assert(Math.abs(f.weights.reduce((a,b)=>a+b,0)+f.excreted-f.decay)<1e-12,'mass and decay balance');
  }
}
assert.equal(M.fractions(0).blood,1);assert.equal(M.fractions(0).bone,0);
assert(Math.abs(M.fractions(3600).blood/M.fractions(3600).decay-.10)<.015);
assert(Math.abs(M.fractions(7200).blood/M.fractions(7200).decay-.05)<.005);
assert(M.fractions(10800).bone/M.fractions(10800).decay>.48);
assert(M.fractions(7199).bladder>.3);assert.equal(M.fractions(7200).bladder,0);
assert(M.fractions(10800).bladder>0);assert(M.fractions(7200,false).bladder>.3);
assert.equal(M.fractions(300).vascularContrast,1,'retain early blood-pool contrast');
assert.equal(M.fractions(1050).vascularContrast,.5,'smooth transition at 17.5 minutes');
for(const seconds of [1800,3600,7200,10800]){
 const f=M.fractions(seconds);
 for(const c of [1,5,6,7])assert.equal(f.weights[c],0,'no focal cardiac/vascular component after 30 min');
 assert(f.blood>0,'blood activity has not been deleted');
 assert.equal(f.diffuseBlood,f.blood);
 assert(Math.abs(f.weights[2]-f.soft-f.blood)<1e-12,'residual blood appears as diffuse background');
}
const metrics={contrast:1,countFactor:1,haloAlpha:0,haloBlur:0};
(async()=>{
 const sums={};
 for(const name of ['down','up']){
  const [loaded]=await Promise.all([M.load(name),M.load(name)]);const p=M.geometry(name),n=128,h=Math.ceil(p.height/p.width*n);
  assert.equal(loaded[0].frames.length,360);
  assert(loaded.slice(1).every(c=>c.frames.length===36),'compact background bases');
  const hashes=loaded[0].frames.map(f=>require('node:crypto').createHash('sha256').update(f).digest('hex'));
  assert.equal(new Set(hashes).size,360,'all skeletal projections distinct');
  const crop={x:0,y:0,w:p.width,h:p.height};
  function boneAt(angle){
   const cache={};M.field({...p,angles:[angle]},{lo:0,hi:0,mix:0},crop,n,h,false,false,metrics,1,name,cache,10800);
   return cache.bases[0];
  }
  const a0=boneAt(0),a1=boneAt(1),a10=boneAt(10),a359=boneAt(359),a360=boneAt(360),seam=boneAt(359.5);
  assert.deepEqual(a360,a0,'360 closes at 0');
  assert(a1.some((v,i)=>Math.abs(v-(a0[i]*.9+a10[i]*.1))>1e-8),'1 degree is a real projection, not interpolated from 0 and 10');
  for(let i=0;i<seam.length;i++)assert(Math.abs(seam[i]-(a359[i]+a0[i])/2)<1e-9,'continuous 359 to 0 interpolation');
  sums[name]={};
  for(const angle of [0,90,180,270]){
   const i=p.angles.indexOf(angle),cache={};
   const f=seconds=>M.field(p,{lo:i,hi:i,mix:0},crop,n,h,false,false,metrics,1,name,cache,seconds);
   const early=f(0),late=f(10800);
   assert(early.sum>0&&late.sum>0);assert(late.sum<2000000);
   assert(late.values.some((v,j)=>Math.abs(v-early.values[j])>1));
   assert(Math.abs(late.cdf.at(-1)-late.sum)<1e-6);
   const cached=cache.bases;f(3600);assert.equal(cache.bases,cached,'reuse spatial bases while changing time');
   const r1=late.sum*370*100/2000000,r2=late.sum*M.rate/2000000;
   assert(Math.abs(r2/r1-2)<1e-12,'activity scaling is linear');
   sums[name][angle]={initialCps:early.sum*M.rate/2000000,threeHourCps:r2};
  }
 }
 assert.equal(downloads.length,4,'two compact payloads per selected pose, deduplicated');
 for(const name of ['down','up'])for(const key of ['bone','organs'])assert.equal(downloads.filter(u=>u===data.poses[name][key].url).length,1);
 // Integrating a changing distribution is different from multiplying a single late frame.
 const n=128,bases=Array.from({length:8},(_,c)=>{const a=new Float32Array(n*n);a[c]=1;return a;});
 const field=M.mix(bases),session=new ctx.window.GANTRY_BONE_CORE.Acquisition(n,'time',30);
 const earlyPool=M.mix(bases,300),latePool=M.mix(bases,1800);
 assert(earlyPool.values[1]>0&&latePool.values[1]===0,'late image has no cardiac-blood-only pixel');
 assert(latePool.values[2]>0,'late circulating counts remain in diffuse tissue pixels');
 const persistence=new ctx.window.GANTRY_ICRP.Persistence(n,n);
 persistence.step(field,M.rate,.1,.1,.75);const first=persistence.total;
 persistence.step(field,M.rate,.1,.1,.75);assert.equal(persistence.total,first,'nested renders do not duplicate live events');
 persistence.reset();assert.equal(persistence.lastStepTime,-Infinity);
 M.step(session,[field,field],30);
 assert(session.finished);assert(session.heads.every(h=>h.elapsed===30));assert.equal(M.seconds,7230);
 assert(session.heads.every(h=>h.total>0&&h.counts[0]>h.counts[1]));
 M.advance(10800-M.seconds-2);
 const limited=new ctx.window.GANTRY_BONE_CORE.Acquisition(n,'time',60);
 M.step(limited,[field,field],60);assert(limited.finished&&limited.mdpLimit);
 assert.equal(M.seconds,10800);assert(limited.heads.every(h=>h.elapsed===2));
 const saveCtx=vm.createContext({window:{},structuredClone,crypto:{randomUUID:()=> 'mdp-test'}});
 vm.runInContext(fs.readFileSync('scripts/bone_acquisition_store.js','utf8'),saveCtx);
 limited.mdpStart={activityMBq:740,seconds:10798};limited.mdpEnd=M.metadata();
 const saved=saveCtx.window.GANTRY_BONE_STORAGE.snapshot(limited,['AP','PA'],{study:'bone'});
 assert.equal(saved.mdp.end.seconds,10800);assert(saved.mdp.limit);
 limited.mdpStart.activityMBq=1;assert.equal(saved.mdp.start.activityMBq,740);
 // Production acquisition controller, including the live view's advance-on-render
 // contract. Catch re-entrant acquisition updates and double simulation clocks.
 vm.runInContext(fs.readFileSync('scripts/mdp.js','utf8'),ctx);
 const model=ctx.window.GANTRY_MDP,els=new Map(),timers=[];let now=0,updates=0;
 const context2d={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData(){},drawImage(){},clearRect(){}};
 const element=id=>({id,value:'',textContent:'',hidden:false,disabled:false,classList:{toggle(){}},width:128,height:128,getContext:()=>context2d,focus(){}});
 const document={hidden:false,getElementById(id){if(!els.has(id))els.set(id,element(id));return els.get(id);},createElement:()=>element('canvas'),addEventListener(){}};
 const el=id=>document.getElementById(id);
 const window={GANTRY_MDP:model,GANTRY:{G:{}},GANTRY_LIVE:{settings:{study:'bone',matrix:128},update(){assert(++updates<20,'recursive live updates');window.GANTRY_BONE_ACQ.advance();window.GANTRY_BONE_ACQ.sync('bone',[field,field],model.rate);}}};
 const ui=vm.createContext({window,document,performance:{now:()=>now},setInterval:f=>timers.push(f),setTimeout});
 vm.runInContext(fs.readFileSync('scripts/bone_acquisition.js','utf8'),ui);
 el('boneAcqName1').value='MDP AP';el('boneAcqName2').value='MDP PA';
 el('boneAcqCriterion').value='time';el('boneAcqTarget').value='60';el('boneAcqSetup').onsubmit({preventDefault(){}});
 now=1000;timers[0]();assert.equal(model.seconds,7201);
 el('boneAcqSpeed').value='10';el('boneAcqSpeed').onchange();now=2000;timers[0]();assert.equal(model.seconds,7211);
 el('boneAcqPause').onclick();now=5000;timers[0]();assert.equal(model.seconds,7211);
 await el('boneAcqInstant').onclick();assert.equal(model.seconds,7260);assert(window.GANTRY_BONE_ACQ.state.finished);
 assert(window.GANTRY_BONE_ACQ.state.heads.every(h=>h.elapsed===60));
 fs.writeFileSync('assets/icrp145/mdp-verification.json',JSON.stringify({result:'OK',checks:['nonnegative compartments','mass plus physical decay','blood anchors','voiding','both poses and four angles','spatial cache reuse','linear activity response','changing acquisition','three hour boundary','immutable saved metadata'],wholeBodyExpectedCps:sums},null,2)+'\n');
 console.log('OK: MDP kinetics, real ICRP organ bases, activity/count response, temporal acquisition and saved metadata.');
})().catch(e=>{console.error(e);process.exitCode=1;});
