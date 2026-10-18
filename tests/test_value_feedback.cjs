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
  .replace('window.GANTRY_VALUE_FEEDBACK={changed};','window.GANTRY_VALUE_FEEDBACK={changed,settledChanges,pendingMarks,states,pending};');
vm.runInNewContext(source,context);
const api=context.window.GANTRY_VALUE_FEEDBACK;
function begin(values=['1.000']){
  now+=40000;api.pending.clear();live.ready=true;live.signal.mode='live';live.signal.duration=.75;
  context.window.GANTRY_FINAL_PREVIEW.active=false;
  api.states.set(host,{values,marks:new Map()});api.changed();
}
function sample(values,elapsed){now+=elapsed;return api.settledChanges(host,values,now);}
for(const [end,delta] of [['600',-400],['1.400',400],['1.000',0],['0',-1000]]){
  begin();assert.equal(api.pendingMarks(host,['1.000']).waiting.size,0,'unchanged initial value does not blink');
  assert.equal(sample(['0'],100),null,'ignore cleared window');
  assert(api.pendingMarks(host,['0']).waiting.has(0),'zero immediately enters yellow pending state');
  assert.equal(sample(['200'],400),null,'ignore partial refill');
  assert(api.pendingMarks(host,['200']).waiting.has(0),'yellow persists while refilling');
  assert.equal(sample([end],600)[0],delta,'compare final to pre-adjustment value');
  assert.equal(api.pendingMarks(host,[end]),null,'yellow ends when the final value is known');
  assert.equal(sample(['900'],200),null,'ordinary subsequent noise cannot trigger another flash');
}
begin();sample(['0'],100);api.states.get(host).values=['0'];
api.changed();assert.equal(sample(['600'],1100)[0],-400,'rapid second adjustment preserves the original baseline');
begin();live.signal.duration=5;assert.equal(sample(['200'],2000),null);
assert.equal(sample(['700'],3300)[0],-300,'wait for the configured persistence duration');
begin();live.ready=false;assert.equal(sample(['0'],2000),null);
live.ready=true;assert.equal(sample(['50'],100),null);
assert.equal(sample(['600'],1100)[0],-400,'loading completion starts a full refill interval');
begin(['2:59','24,4']);live.signal.mode='final';api.pending.clear();api.changed();
context.window.GANTRY_FINAL_PREVIEW.active=true;status='Calculando imagen final…';
assert.equal(sample(['2:59','24,4'],2000),null,'retain baseline while async result is pending');
status='Vista previa';const deltas=sample(['3:00','6,1'],100);
assert.equal(deltas[0],1);assert(Math.abs(deltas[1]+18.3)<1e-9);
begin();live.settings.study='mibi';assert.equal(sample(['800'],1100),null,'do not compare unrelated studies');
console.log('OK: zero/refill ignored; lower, higher, equal and true-zero outcomes; repeated adjustments; long persistence; loading; async preview; ordinary noise excluded.');
