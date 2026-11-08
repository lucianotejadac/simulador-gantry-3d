const assert=require('node:assert/strict');
const model=require('../scripts/acquisition_tutorial_model.js');
const record=(id,kind,seconds)=>({id,patient:{id:'caso-oseo'},study:'bone',acquisition:{kind},administration:{seconds},heads:[{total:2500,done:true},{total:2300,done:true}],dynamic:kind==='dynamic'?{timings:Array(120).fill({})}:undefined});
const flow=record('flow','dynamic',0),pool=record('pool','static',180),late=record('late','static',10800);
assert.deepEqual(model.phases([flow,pool,late]),{flow:[flow],pool:[pool],delayed:[late]});
for(const bad of [
  {...flow,patient:{id:'phantom'}},{...flow,study:'dmsa'},{...flow,stoppedEarly:true},
  {...flow,heads:[{done:true,total:0},{done:true,total:0}]},record('late-flow','dynamic',40),
  record('fake-pool','static',3600),record('fake-late','static',200),
  {...flow,dynamic:{timings:Array(10).fill({})}}
])assert(!model.phases([bad]).flow.length);
assert.equal(model.phases([record('pool-name','static',3600)]).pool.length,0);
assert.equal(model.phases([record('late-name','static',200)]).delayed.length,0);
const assets=[flow,pool,late].flatMap(r=>[1,2].map(d=>({id:r.id+d,acquisitionId:r.id})));
const state={patientId:'caso-oseo',identity:{fullName:'Matías Ignacio Fuentes Araya',rut:'91.000.002-0'},registration:{fullName:'MATIAS IGNACIO FUENTES ARAYA',rut:'91000002-0',examName:'Cintigrafía ósea trifásica'},seen:{band:true,folder:true,prepared:true,position:true,camera:true,protocol:true},viewer:{records:[flow,pool,late],assets,pages:[{items:assets.map(a=>({asset:a.id,acquisitionId:a.acquisitionId})),overlaps:0,incomplete:0,exported:true}],header:true,seen:{playback:true,analysis:true,display:true}}};
assert(model.evaluate(state).flat().every(c=>c.done));
state.viewer.pages[0].overlaps=1;
assert(!model.evaluate(state)[8].find(c=>c.id==='layout').done);
state.viewer.pages[0].overlaps=0;state.viewer.pages[0].incomplete=1;
assert(!model.evaluate(state)[8].find(c=>c.id==='layout').done);
state.viewer.pages[0].incomplete=0;state.viewer.pages[0].exported=false;
assert(!model.evaluate(state)[9][0].done);
state.viewer.records.pop();
assert(!model.evaluate(state)[6][0].done);
assert(!model.evaluate(state)[8].find(c=>c.id==='images').done);
assert(!model.evaluate({viewer:{},seen:{}}).flat().some(c=>c.done));
console.log('OK: tutorial checks identify real phases, completed counts, paired images, layout and current exports.');
