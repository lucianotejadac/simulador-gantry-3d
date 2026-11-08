const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const window={};
vm.runInNewContext(fs.readFileSync('scripts/live_count_feedback.js','utf8'),{window});
const {compare,Tracker}=window.GANTRY_COUNT_FEEDBACK;
const pair=(n0,n1,t0=5,t1=5)=>compare({counts:n0,seconds:t0},{counts:n1,seconds:t1});
assert.equal(pair(1000,1000).kind,'noise');
assert.equal(pair(1000,1100).kind,'noise','two-detector correction prevents a marginal 5% result');
assert.equal(pair(1000,1200).kind,'increase');
assert.equal(pair(1200,1000).kind,'decrease');
assert.equal(pair(100,200,5,10).kind,'noise','compare rates, not raw unequal-exposure totals');
assert.equal(pair(0,0).kind,'insufficient');
assert(Math.abs(pair(0,5).p-.0625)<1e-12);
assert.equal(pair(0,10).kind,'increase','exact low-count test includes a zero-count reference');
assert.equal(pair(10,0).kind,'decrease');
assert.equal(pair(1e6,1005000).kind,'increase');
// Reference values checked independently with scipy.stats.binom, equal-tailed test.
assert(Math.abs(pair(0,10).p-.001953125)<1e-12);
assert(Math.abs(pair(1000,1100).p-.030720707864242493)<1e-9);
assert(Math.abs(pair(17799,18380).p-.0022933315428429945)<1e-9);
assert(Math.abs(pair(1e6,1005000).p-.0004149032657181196)<1e-9);

let tracker=new Tracker(),now=0,cumulative=0,exposure=0,id=1;
function sample(events=100,dt=.1,repeat=1){
  now+=dt*1000;cumulative+=events;exposure+=dt;
  for(let i=0;i<repeat;i++)tracker.observe({id,counts:cumulative,seconds:exposure},'bone',now);
}
for(let i=0;i<60;i++)sample();
tracker.changed(now);
assert(Math.abs(tracker.pending.before.counts/tracker.pending.before.seconds-1000)<1e-8);
const baseline={...tracker.pending.before};
// Matrix replacement resets persistence. Neither expiration nor repeated renders
// may duplicate counts; discard the first transient intervals after an adjustment.
id++;cumulative=0;exposure=0;
for(let i=0;i<3;i++)sample(0);
tracker.changed(now); // rapid second adjustment keeps the original stable baseline
assert.equal(tracker.pending.before.counts,baseline.counts);
for(let i=0;i<3;i++)sample(0);
for(let i=0;i<52;i++)sample(50,.1,20);
assert.equal(tracker.result.kind,'decrease');
assert.equal(tracker.result.before.counts,baseline.counts);
assert(Math.abs(tracker.result.rateAfter-500)<1e-8);
assert(tracker.result.after.counts<2700,'twenty repaints still contribute one event interval');
const frozen=JSON.stringify(tracker.result);
for(let i=0;i<10;i++)sample(200);
assert.equal(JSON.stringify(tracker.result),frozen,'result and direction stay tied to the displayed posterior mean');
tracker.changed(now);assert(tracker.pending.before.counts>0);
tracker.observe({id,counts:++cumulative,seconds:++exposure},'new-patient',now+100);
assert.equal(tracker.pending,null);assert.equal(tracker.result,null,'never compare different patients/studies');
tracker=new Tracker();tracker.changed(now);assert.equal(tracker.result.kind,'baseline');

// Instrumentation must not change generated counts and must survive display expiration.
vm.runInNewContext(fs.readFileSync('scripts/icrp_live.js','utf8'),{window});
const p=new window.GANTRY_ICRP.Persistence(1,1,()=>.5),field={sum:2000000,cdf:[2000000]};
p.step(field,10,1,1,.75);const initial=p.eventSample;
assert.equal(p.windowSeconds,1);
p.step(field,10,1,1,.75);assert.equal(p.eventSample.counts,initial.counts);
p.expire(2,.75);assert.equal(p.total,0);assert.equal(p.eventSample.counts,initial.counts);
assert.equal(p.windowSeconds,0);
assert.equal(p.eventSample.seconds,1);p.reset();assert.notEqual(p.eventSample.id,initial.id);
assert.equal(p.eventSample.counts,0);assert.equal(p.eventSample.seconds,0);
console.log('OK: conditional Poisson comparison, unequal exposure, low counts, independent samples, resets, noise and frozen result.');
