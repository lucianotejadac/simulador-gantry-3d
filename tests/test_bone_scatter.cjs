const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fixture,project}=require('./bone_performance_fixture.cjs');
const window={};vm.runInNewContext(fs.readFileSync('scripts/icrp_live.js','utf8'),{window,Math,Float32Array,Float64Array,Int32Array});
const scatter=window.GANTRY_ICRP.redistributeScatter,sum=a=>a.reduce((s,v)=>s+v,0);
// Edge sources, odd sizes and whole-body aspect ratios must conserve accepted
// counts. No new events, negative tails, aliasing-dependent resolution or input mutation.
for(const [w,h] of [[1,1],[7,11],[64,64],[128,128],[256,640],[512,1280]]){
 const input=new Float32Array(w*h);input[0]=50;input[Math.floor(input.length/2)]=150;
 const copy=input.slice(),result=scatter(input,w,h,.25,22*w/614,22*h/(614*h/w));
 assert.deepEqual(input,copy);assert(result.every(v=>Number.isFinite(v)&&v>=0));
 assert(Math.abs(sum(result)/sum(input)-1)<1e-6,`conservation ${w}x${h}`);
 assert.equal(scatter(input,w,h,0,10,10),input);
}
let baseline;
for(const n of [128,256,512]){
 const source=new Float32Array(n*n);source[(n/2)*n+n/2]=1;
 const tail=scatter(source,n,n,1,22*n/614,22*n/614);let second=0;
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)second+=tail[y*n+x]*((x-n/2)*614/n)**2;
 const sigma=Math.sqrt(second);assert(Math.abs(sigma/22-1)<.06,`scatter width in mm at ${n}`);
 baseline??=sigma;assert(Math.abs(sigma/baseline-1)<.06);
}
(async()=>{
 const current=await fixture();
 const off=fs.readFileSync('scripts/mdp.js','utf8').replace('if(!metrics.uncollimated&&Number.isFinite(metrics.psfSigmaMm))','if(false)');
 const previous=await fixture({mdp:off});
 for(const n of [64,128,256,512]){
  const options={n,distance:10,energy:140,width:15};
  const before=project(previous,options),after=project(current,options);
  assert(Math.abs(after.sum/before.sum-1)<1e-6,`production rate unchanged ${n}`);
  const difference=after.values.reduce((s,v,i)=>s+Math.abs(v-before.values[i]),0)/after.sum;
  assert(difference>.04,'spatial change at photopeak must be visible');
  assert(after.projectionResponse.spatialScatterFraction>.30);
  assert(after.projectionResponse.spatialScatterFraction<.35);
 }
 const cache={},a=project(current,{cache,seconds:7200}),bases=a.mdpBases;
 const later=project(current,{cache,seconds:7210});assert.equal(later.mdpBases,bases,'kinetics reuses spatial bases');
 const noCol=project(current,{col:'NONE'});assert.equal(noCol.projectionResponse.spatialScatterFraction,undefined);
 const narrow=project(current,{width:10}),wide=project(current,{width:25});
 assert(wide.projectionResponse.spatialScatterFraction>narrow.projectionResponse.spatialScatterFraction);
 assert(current.GANTRY_MDP.metadata().scatterAppearance.model==='mdp-diffuse-v2-background');
 console.log('OK: scatter tails in physical mm, 64/128/256/512 count conservation, photopeak response, window dependence, no-collimator bypass and kinetic cache.');
})().catch(e=>{console.error(e);process.exitCode=1});
