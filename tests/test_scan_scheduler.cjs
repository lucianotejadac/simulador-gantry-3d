// Exercise the production scheduler with deterministic work costs and timers.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('scripts/bone_acquisition.js','utf8');
const scheduler=source.slice(source.indexOf('  function advanceScan('),source.indexOf('  function advance(now='));
function fixture(){
  let now=0,nextTimer=0;const queue=new Map(),steps=[],renders=[];
  const state={session:{mode:'scan',countRate:100,finished:false},moving:false,
    scanDebt:6,scanTimer:null,lastScanRender:-Infinity,paused:false,busy:false,note:'',
    document:{hidden:false},performance:{now:()=>now},
    setTimeout:fn=>{queue.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>queue.delete(id)};
  state.window={GANTRY_EXAM:{blocked:false},GANTRY:{render:()=>renders.push(now)},
    GANTRY_MDP:{remaining:100,rate:100,advance(dt,display){assert.equal(display,false);this.remaining-=dt;},metadata(){return {};}}};
  state.whole={advance(session,rate,dt,display){assert.equal(display,false);assert(dt<=.5);steps.push(dt);now+=5;}};
  vm.createContext(state);vm.runInContext(scheduler,state);
  return {state,steps,renders,queue,flush(){let n=0;while(queue.size){assert(++n<100);const [id,fn]=queue.entries().next().value;queue.delete(id);fn();}}};
}
const f=fixture();f.state.drainScan();
assert.equal(f.steps.length,3,'Yield after a small batch instead of blocking for all 12 steps');
assert.equal(f.queue.size,1);f.flush();
assert.equal(f.steps.reduce((a,b)=>a+b,0),6,'Preserve every simulated second at 60x');
assert.equal(f.state.window.GANTRY_MDP.remaining,94);
assert.equal(f.renders.length,1,'Do not render each physical step');
assert.equal(f.state.moving,false);assert.equal(f.state.scanDebt,0);
for(const stop of [s=>s.paused=true,s=>s.document.hidden=true,s=>s.window.GANTRY_EXAM.blocked=true,s=>s.session.finished=true]){
  const f=fixture();f.state.drainScan();const n=f.steps.length;stop(f.state);f.flush();
  assert.equal(f.steps.length,n,'Pending work must stop on pause, hide, cancellation or completion');
  assert.equal(f.state.scanDebt,0);assert.equal(f.queue.size,0);
}
const done=fixture();done.state.whole.advance=(s,r,dt,display)=>{assert.equal(display,false);s.finished=true;};
done.state.drainScan();assert.equal(done.queue.size,0);assert.equal(done.renders.length,1);
const failed=fixture();failed.state.whole.advance=()=>{throw Error('collision');};failed.state.drainScan();
assert(failed.state.paused);assert.equal(failed.state.note,'collision');assert.equal(failed.state.moving,false);assert.equal(failed.queue.size,0);
console.log('OK: 60x work yields, preserves simulated time, batches rendering and stops queued work safely.');
