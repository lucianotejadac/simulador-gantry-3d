// Regression: a cleared persistence window must not become the comparison baseline.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let now=0,status='Vista previa';
const host={id:'liveInfoD1',matches:()=>false,isConnected:true};
const live={settings:{study:'bone'},signal:{mode:'live',duration:.75},ready:true};
const context={window:{GANTRY_LIVE:live,GANTRY_FINAL_PREVIEW:{active:false}},
  performance:{now:()=>now},setTimeout(){return 1;},clearTimeout(){},
  document:{readyState:'loading',addEventListener(){},querySelectorAll:()=>[host],
    getElementById:()=>({textContent:status})}};
const source=fs.readFileSync('scripts/value_feedback.js','utf8')
  .replace('window.GANTRY_VALUE_FEEDBACK={changed};','window.GANTRY_VALUE_FEEDBACK={changed,settledChanges,pendingMarks,states,pending,histories,recordHistory,previousAverage,averageLabel};');
vm.runInNewContext(source,context);
const api=context.window.GANTRY_VALUE_FEEDBACK;
function begin(values=['1.000'],mode='live'){
  now+=40000;api.pending.clear();api.histories.delete(host);live.ready=true;live.signal.mode=mode;live.signal.duration=.75;
  context.window.GANTRY_FINAL_PREVIEW.active=false;
  api.states.set(host,{values,marks:new Map()});api.recordHistory(host,values,now-1000);api.changed();
}
function sample(values,elapsed){now+=elapsed;return api.settledChanges(host,values,now);}
function finish(values,elapsed){
  assert.equal(sample(values,elapsed),null,'keep yellow briefly after calculation');
  assert.equal(sample(values,599),null,'do not switch to the result too soon');
  return sample(values,1);
}
for(const [end,delta] of [['600',-400],['1.400',400],['1.000',0],['0',-1000]]){
  begin();assert.equal(api.pendingMarks(host,['1.000']).waiting.size,0,'unchanged initial value does not blink');
  assert.equal(sample(['0'],100),null,'ignore cleared window');
  assert(api.pendingMarks(host,['0']).waiting.has(0),'zero immediately enters yellow pending state');
  assert.equal(sample(['200'],400),null,'ignore partial refill');
  assert(api.pendingMarks(host,['200']).waiting.has(0),'yellow persists while refilling');
  assert.equal(finish([end],600)[0],delta,'compare final to pre-adjustment value');
  assert.equal(api.pendingMarks(host,[end]),null,'yellow ends when the final value is known');
  assert.equal(sample(['900'],200),null,'ordinary subsequent noise cannot trigger another flash');
}
begin();sample(['0'],100);api.states.get(host).values=['0'];
api.changed();assert.equal(finish(['600'],1100)[0],-400,'rapid second adjustment preserves the original baseline');
begin();live.signal.duration=5;assert.equal(sample(['200'],2000),null);
assert.equal(finish(['700'],3300)[0],-300,'wait for the configured persistence duration');
begin();live.ready=false;assert.equal(sample(['0'],2000),null);
live.ready=true;assert.equal(sample(['50'],100),null);
assert.equal(finish(['600'],1100)[0],-400,'loading completion starts a full refill interval');
begin(['2:59','24,4'],'final');
context.window.GANTRY_FINAL_PREVIEW.active=true;status='Calculando imagen final…';
assert.equal(sample(['2:59','24,4'],2000),null,'retain baseline while async result is pending');
status='Vista previa';const deltas=finish(['3:00','6,1'],100);
assert.equal(deltas[0],1);assert(Math.abs(deltas[1]+18.3)<1e-9);
begin();assert.equal(sample(['600'],1100),null);api.changed();
assert.equal(finish(['1.400'],1100)[0],400,'a new adjustment cancels the old delayed result');
begin();live.settings.study='mibi';assert.equal(sample(['800'],1100),null,'do not compare unrelated studies');

// A true temporal mean, independent of DOM update frequency and the last sample.
api.pending.clear();api.histories.delete(host);now=1000000;
api.recordHistory(host,['20','0,0020','2:59'],now);
api.recordHistory(host,['100','0,0100','3:01'],now+4000);
for(let i=1;i<20;i++)api.recordHistory(host,['100','0,0100','3:01'],now+4000+i*40);
now+=5000;
let mean=api.previousAverage(host,now);
assert.equal(mean.elapsed,5000);assert.equal(mean.values[0],36,'20 for 4 seconds and 100 for 1 second averages 36, not 100 or 60');
assert(Math.abs(mean.values[1]-.0036)<1e-12);
assert.equal(api.averageLabel(mean.values[1],'0,0100'),'0,0036');
assert.equal(api.averageLabel(mean.values[2],'3:01'),'2:59,4');
api.states.set(host,{values:['100','0,0100','3:01'],marks:new Map()});api.changed();
assert.equal(api.pending.get(host).previousLabels[0],'36');
assert.equal(finish(['60','0,0060','3:00'],1100)[0],24,'Arrow compares against the mean: 60 rises from mean 36 despite being lower than last sample 100');

api.pending.clear();api.histories.delete(host);now+=10000;
api.recordHistory(host,['999'],now-10000);
api.recordHistory(host,['20'],now-6000);
api.recordHistory(host,['100'],now-1000);
assert.equal(api.previousAverage(host,now).values[0],36,'Clip the average to the most recent 5 seconds');
api.states.set(host,{values:['100'],marks:new Map()});api.changed();
api.recordHistory(host,['0'],now+100);
assert.equal(api.previousAverage(host,now+100),null,'Transient cleared windows never enter history');
api.changed();assert.equal(finish(['60'],1100)[0],24,'Rapid adjustments retain the frozen mean');
api.recordHistory(host,['60'],now);now+=2000;
assert.equal(api.previousAverage(host,now).values[0],60,'The next parameter state starts its own history');
assert.equal(api.previousAverage(host,now).elapsed,2000,'Report the shorter available interval accurately');
host.textContent='Different readout';assert.equal(api.previousAverage(host,now),null,'Do not average unrelated readout fields');
api.histories.delete(host);api.states.set(host,{values:['60'],marks:new Map()});api.changed();
assert.equal(finish(['90'],1100)[0],0,'Without prior history, do not invent an average from the last reading');
console.log('OK: temporal averages, 5-second clipping, unequal sampling, precision, mean-based direction, no-data handling; zero/refill, repeated adjustments, loading and preview regressions.');
