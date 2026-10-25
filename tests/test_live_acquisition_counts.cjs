// Compare actual atlas fields and both independent counting implementations.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {fixture,project}=require('./bone_performance_fixture.cjs');
const rng=(seed)=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed+.5)/4294967296;};
(async()=>{
  const W=await fixture(),M=W.GANTRY_MDP;
  vm.runInNewContext(fs.readFileSync('scripts/bone_acquisition.js','utf8'),{window:W,document:{getElementById:()=>null}});
  await M.ensureAngles('up',[0]);
  for(const energy of [140,180])for(const col of ['LEHR','HE']){
    M.configure(740,7200);
    const f=project(W,{n:128,energy,col,distance:16,seconds:M.seconds}),expected=f.sum*M.rate/2000000;
    const live=new W.GANTRY_ICRP.Persistence(128,128,rng(145));
    // A stationary one-second persistence window, matching one acquired second.
    for(let i=1;i<=10;i++)live.step(f,M.rate,.1,i/10,1);
    const acquisition=new W.GANTRY_BONE_CORE.Acquisition(128,'time',1,rng(146));
    M.step(acquisition,[f,f],1);
    for(const total of [live.total,...acquisition.heads.map(h=>h.total)])
      assert(Math.abs(total-expected)<7*Math.sqrt(expected)+2,`${energy} ${col}: ${total} vs ${expected}`);
    assert(acquisition.finished);
    // Integration must retain the same spatial detector field, not reconstruct
    // a higher-count projection when acquisition begins.
    const mixed=M.mix(f.mdpBases,7200.5);
    assert(Math.abs(mixed.sum/f.sum-1)<.001);
    console.log(`${energy} keV ${col}: expected ${expected.toFixed(1)} cps; live ${live.total}; acquisition ${acquisition.heads[0].total}`);
  }
  console.log('OK: live and acquisition share photon rates, camera response and Poisson statistics at equal exposure.');
})().catch(error=>{console.error(error);process.exitCode=1;});
