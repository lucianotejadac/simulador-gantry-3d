const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {fixture,project}=require('./bone_performance_fixture.cjs');
const sources=Object.fromEntries(['icrp_live','mdp'].map(name=>[name,execFileSync('git',['show','4049011:scripts/'+name+'.js'],{encoding:'utf8'})]));
function blur(source){
  const code=source.slice(source.indexOf('  function blur('),source.indexOf('  function field('));
  return vm.runInNewContext(code+';blur',{Math,Float32Array,Float64Array,Int32Array});
}
(async()=>{
  const previousBlur=blur(sources.icrp_live),currentBlur=blur(fs.readFileSync('scripts/icrp_live.js','utf8'));
  for(const [w,h] of [[1,1],[7,11],[128,128],[256,256]])for(const sigma of [.1,.15,1.7,5,15]){
    const input=Float32Array.from({length:w*h},(_,i)=>Math.sin(i*.723)**2*13);
    assert.deepEqual(currentBlur(input,w,h,sigma),previousBlur(input,w,h,sigma),'Gaussian pixels and zero padding unchanged');
  }
  const before=await fixture(sources),after=await fixture();
  let cases=0;
  for(const energy of [80,120,140,200,450])for(const width of [10,15,20,25])for(const col of ['LEHR','MELP','HE']){
    const options={n:32,energy,width,col,angle:cases%2?180:33.5,move:cases%3};
    const a=project(before,options),b=project(after,options);
    assert.deepEqual(b.values,a.values,'unchanged counts per pixel '+JSON.stringify(options));
    assert.equal(b.sum,a.sum);assert.deepEqual(b.cdf,a.cdf);cases++;
  }
  const cache={},oldCache={},original=after.GANTRY_ICRP.field;let projected=0;
  after.GANTRY_ICRP.field=(...args)=>{projected++;return original(...args);};
  let first=true;
  for(const seconds of [7200,7201,0,30,10800,7200]){
    const options={n:128,energy:100,width:10,col:'HE',seconds};
    const b=project(after,{...options,cache}),a=project(before,{...options,cache:oldCache});
    assert.deepEqual(b.values,a.values,'time evolution and rewinds retain every component');
    if(first){assert.equal(projected,3,'only active late components are projected');first=false;}
    if(seconds===7201)assert.equal(projected,4,'bladder materializes when needed');
  }
  assert.equal(projected,8,'each component is projected at most once for unchanged geometry');
  project(after,{n:128,energy:100,width:10,col:'HE',seconds:7200,move:3,cache});
  assert.equal(projected,11,'movement computes only the three nonzero late components');
  assert(project(after,{energy:140}).sum>project(after,{energy:450}).sum,'off-peak count loss is retained');
  console.log('PASS: exact Gaussian pixels; '+cases+' energy/width/collimator combinations; lazy components, movement, clock rewind and count loss');
})().catch(e=>{console.error(e);process.exitCode=1;});
