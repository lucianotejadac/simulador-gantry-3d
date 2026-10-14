const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const data=name=>JSON.parse(html.match(new RegExp('window.GANTRY_'+name+'_DATA=(.*?);</script>'))[1]);
const ctx=vm.createContext({window:{GANTRY_MDP_DATA:data('MDP'),GANTRY_MIBI_DATA:data('MIBI')},document:{getElementById:()=>null},setTimeout,clearTimeout,Float32Array,Float64Array,Uint32Array});
for(const file of ['mdp','mibi_kinetics','bone_acquisition','final_preview'])vm.runInContext(fs.readFileSync('scripts/'+file+'.js','utf8'),ctx);
const P=ctx.window.GANTRY_FINAL_PREVIEW;
const field={values:Float32Array.from([1,2,3,4]),sum:10};
const near=P.predict([field,field],{mode:'time',target:60,rate:2000000});
const far=P.predict([{values:Float32Array.from([.5,1,1.5,2]),sum:5},field],{mode:'time',target:60,rate:2000000});
assert.equal(near[0].sum,600);assert.equal(far[0].sum,300);
const counted=P.predict([field,{values:Float32Array.from([.5,1,1.5,2]),sum:5}],{mode:'counts',target:1000,rate:2000000});
assert.equal(counted[0].elapsed,100);assert.equal(counted[1].elapsed,200);
const zero=P.predict([{values:new Float32Array(4),sum:0}],{mode:'counts',target:100,rate:1})[0];assert.equal(zero.reached,false);assert.equal(zero.sum,0);
for(const [name,M,count,key,limit] of [['bone',ctx.window.GANTRY_MDP,8,'mdpBases',10800],['mibi',ctx.window.GANTRY_MIBI,10,'mibiBases',43200]]){
 const before=JSON.stringify(M.metadata()),bases=Array.from({length:count},(_,c)=>Float32Array.from({length:count},(_,j)=>j===c?1:0));
 const f={values:new Float32Array(count),sum:0,[key]:bases};
 const w=s=>M.fractions(s).weights;
 const dynamic=P.predict([f,f],{mode:'time',target:60,rate:100,model:name,start:0,limit,weights:w});
 assert(dynamic[0].sum>0);assert.equal(dynamic[0].elapsed,60);assert(dynamic[0].values[0]>0,'uptake develops during exposure');
 const late=P.predict([f,f],{mode:'time',target:60,rate:100,model:name,start:limit-2.1234567,limit,weights:w});
 assert(Math.abs(late[0].elapsed-2.1234567)<1e-6);assert(!late[0].reached);
 const counts=P.predict([f,f],{mode:'counts',target:1000,rate:100,model:name,start:300.123456789,limit,weights:w});
 assert(counts.every(h=>h.reached&&Math.abs(h.sum-1000)<1e-5));
 assert.equal(JSON.stringify(M.metadata()),before,'preview must not advance injection clock or modify settings');
}
(async()=>{
 const sample=await P.sample(counted[0],17);assert.equal(sample.total,1000,'exact requested count total');
 assert.deepEqual(Array.from((await P.sample(counted[0],17)).counts),Array.from(sample.counts),'stable noise until recalculation');
 let total=0;for(let i=0;i<1000;i++)total+=(await P.sample(near[0],i)).total;
 assert(Math.abs(total/1000-600)<4,'time-mode Poisson counts match expectation');
 const canceled=await P.sample({...counted[0],target:100000},1,()=>true);assert.equal(canceled,null);
 assert(html.includes('value="final"'));assert(html.includes('GANTRY_FINAL_PREVIEW?.sync'));
 assert(html.includes('#gantryLive.final-preview .bone-acq-card'));
 console.log('OK: final preview integrates kinetics without mutation, responds to sensitivity, predicts per-head times, samples counts/noise, respects model limits and cancels stale work.');
})().catch(e=>{console.error(e);process.exitCode=1;});
