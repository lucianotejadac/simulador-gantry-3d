const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const env={window:{},document:{getElementById:()=>null,readyState:'loading',addEventListener(){}},setTimeout,clearTimeout,performance,console,structuredClone,crypto:require('node:crypto').webcrypto};
vm.createContext(env);
for(const file of ['icrp_live','bone_acquisition','bone_acquisition_store','bone_whole_body','final_preview','pixel_grid'])vm.runInContext(fs.readFileSync('scripts/'+file+'.js','utf8'),env);
const {GANTRY_ICRP:icrp,GANTRY_BONE_CORE:core,GANTRY_FINAL_PREVIEW:preview,GANTRY_PIXEL_GRID:grid,GANTRY_BONE_STORAGE:storage,GANTRY_BONE_WHOLE:whole}=env.window;
const frame=Float32Array.from({length:64*64},(_,i)=>Math.exp(-(((i%64)-32)**2+(Math.floor(i/64)-32)**2)/180)+.02);
const pose={width:64,height:64,frames:[frame],scale:1,window:1},pair={lo:0,hi:0,mix:0},crop={x:0,y:0,w:64,h:64};
const metrics={contrast:1,countFactor:.7,haloAlpha:.1,haloBlur:2};
const f256=icrp.field(pose,pair,crop,256,256,false,false,metrics,2);
(async()=>{
for(const n of [64,512]){
 const f=icrp.field(pose,pair,crop,n,n,false,false,metrics,2*n/256),factor=Math.max(1,(n/256)**2);
 assert.equal(f.values.length,n*n);assert(Math.abs(f.sum/f256.sum-1)<1e-7,'Matrix must preserve sensitivity');
 const goal=core.suggestedGoal('bone','Torax',7200,n),base=core.suggestedGoal('bone','Torax',7200,256);
 assert.equal(goal.counts,base.counts*factor);assert.equal(goal.time,base.time*factor);
 const predicted=preview.predict([f],{mode:'counts',target:goal.counts,rate:4000})[0];
 const normal=preview.predict([f256],{mode:'counts',target:base.counts,rate:4000})[0];
 assert(Math.abs(predicted.elapsed/normal.elapsed-factor)<1e-5);
 const fixed=preview.predict([f],{mode:'counts',target:base.counts,rate:4000})[0];
 assert(Math.abs(fixed.elapsed/normal.elapsed-1)<1e-6,'Same total counts means same duration');
 const result=await preview.sample(predicted,n);
 assert.equal(result.total,goal.counts);assert.equal(result.counts.reduce((a,b)=>a+b,0),goal.counts);
 assert(Math.abs(result.counts.reduce((a,b)=>a+b,0)/(n*n)-goal.counts/(n*n))<1e-6);
 const session=new core.Acquisition(n,'counts',goal.counts);session.heads.forEach(h=>{h.counts=result.counts.slice();h.total=result.total;h.elapsed=result.elapsed;h.done=true});session.finished=true;
 const saved=storage.snapshot(session,['Anterior','Posterior'],{study:'bone'},1,'matrix-'+n);storage.validate(saved);assert.equal(saved.n,n);assert.equal(saved.heads[0].counts.length,n*n);
 const patch=grid.compare(result.counts,n,n);assert.equal(patch.coarse.reduce((a,b)=>a+b),patch.fine.reduce((a,b)=>a+b));
 const scan=new whole.Scan(n,10/factor,{width:256,height:640,headRow:30,footRow:615});assert.equal(scan.velocity,10/factor);assert.equal(scan.heads[0].counts.length,n*scan.height);
 console.log(n+' verified: native counts, conserved cps, '+factor+'x goal/time, storage, matrix analysis, whole-body dimensions');
}
assert.throws(()=>new core.Acquisition(1024,'counts',1000));
assert.throws(()=>new whole.Scan(1024,10,{width:256,height:640,headRow:30,footRow:615}));
const page=fs.readFileSync('index.html','utf8');
assert(page.includes('id="liveMatrix64"'));assert(!page.includes('liveMatrix1024'));
assert(fs.readFileSync('scripts/console_menus.js','utf8').includes("['liveMatrix64','liveMatrix128','liveMatrix256','liveMatrix512']"));
// High-goal sampler: both removal and append branches must conserve totals and spatial probability.
const sparse=new Float64Array(512*512);sparse[0]=.25;sparse[sparse.length-1]=.75;
let totalFirst=0;
for(let seed=1;seed<=12;seed++){
 const r=await preview.sample({values:sparse,sum:1,mode:'counts',target:250001,reached:true,elapsed:1},seed);
 assert.equal(r.total,250001);assert.equal(r.counts[0]+r.counts.at(-1),250001);totalFirst+=r.counts[0];
}
assert(Math.abs(totalFirst/(250001*12)-.25)<.002);
assert.equal(await preview.sample({values:sparse,sum:1,mode:'counts',target:250001,reached:true},1,()=>true),null);
console.log('OK: high-matrix sampler statistics and cancellation');
})().catch(e=>{console.error(e);process.exitCode=1});
