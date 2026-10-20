const assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture,project}=require('./bone_performance_fixture.cjs');
(async()=>{
 const source=fs.readFileSync('scripts/mdp.js','utf8');
 const current=await fixture();
 const previous=await fixture({mdp:source.replace('boneRedistributionFraction:0.2640939054649198','boneRedistributionFraction:0')});
 for(const n of [64,128,256,512]){
  for(const seconds of [0,300,1050,1800,7200,10800]){
   const options={n,seconds,energy:140,width:15};
   const before=project(previous,options),after=project(current,options);
   assert(Math.abs(after.sum/before.sum-1)<2e-7,`accepted counts ${n}/${seconds}`);
   assert(after.values.every(v=>Number.isFinite(v)&&v>=0));
   if(seconds<=300)assert.deepEqual(after.values,before.values,'first pass unchanged');
   if(seconds===7200){
    assert(after.values.some((v,i)=>Math.abs(v-before.values[i])>1e-5),'late tissue signal changes');
    const weights=current.GANTRY_MDP.fractions(seconds).weights,alpha=current.GANTRY_MDP.metadata().backgroundAppearance.boneRedistributionFraction;
    const bone=after.mdpBases[0],soft=after.mdpBases[2];
    const sum=a=>a.reduce((s,v)=>s+v,0),scale=alpha*sum(bone)/sum(soft);
    let difference=0;
    for(let i=0;i<bone.length;i++){
     const expected=before.values[i]+(-alpha*bone[i]+scale*soft[i])*weights[0]*2000000;
     difference+=Math.abs(expected-after.values[i]);
    }
    assert(difference/after.sum<2e-7,'same redistribution as approved local candidate');
   }
  }
 }
 for(const col of ['NONE'])assert.deepEqual(project(current,{col}).values,project(previous,{col}).values);
 // All temporal consumers re-use the same bases via mix, including fast-forward.
 const cache={},field=project(current,{cache,seconds:7200}),later=project(current,{cache,seconds:7210});
 assert.equal(field.mdpBases,later.mdpBases);
 assert.deepEqual(current.GANTRY_MDP.mix(field.mdpBases,7210).values,later.values);
 assert.deepEqual(current.GANTRY_MDP.mix(field.mdpBases,0).values,project(previous,{seconds:0}).values);
 const meta=current.GANTRY_MDP.metadata();meta.backgroundAppearance.transitionMinutes[0]=999;
 assert.equal(current.GANTRY_MDP.metadata().backgroundAppearance.transitionMinutes[0],5);
 // Rectangular full-body fields in both postures and both detector directions.
 for(const name of ['up','down']){
  await current.GANTRY_MDP.load(name);await previous.GANTRY_MDP.load(name);
  for(const angle of [0,180]){
   const make=W=>{
    const p=W.GANTRY_MDP.geometry(name),metrics=W.metrics(10,'bone','LEHR',139.31,15);
    return W.GANTRY_MDP.field({...p,angles:[angle]},{lo:0,hi:0,mix:0},
     {x:0,y:0,w:p.width,h:p.height},128,320,false,false,metrics,1,name,{},7200);
   };
   const a=make(current),b=make(previous);
   assert(Math.abs(a.sum/b.sum-1)<2e-7,`whole body ${name}/${angle}`);
  }
 }
 console.log('OK: approved tissue redistribution, total counts, early phase, kinetic mixing, both poses, AP/PA, 64–512, no-collimator bypass and metadata.');
})().catch(e=>{console.error(e);process.exitCode=1});
