const assert=require('node:assert/strict');
const model=require('../scripts/acquisition_tutorial_model.js');
const record=(id,kind,seconds)=>({id,patient:{id:'caso-oseo'},study:'bone',acquisition:{kind},administration:{seconds},heads:[{total:2500,done:true},{total:2300,done:true}],dynamic:kind==='dynamic'?{timings:Array(120).fill({})}:undefined});
const flow=record('flow','dynamic',0),pool=record('pool','static',180),late=record('late','static',10800);
const whole={...record('whole','whole',10800),scan:{startZ:200,endZ:16,travel:175,physicalPosition:{decubitus:'supine',headFirst:false}}};
assert.deepEqual(model.phases([flow,pool,late,whole]),{flow:[flow],pool:[pool],delayed:[late],whole:[whole]});
for(const bad of [
  {...flow,patient:{id:'phantom'}},{...flow,study:'dmsa'},{...flow,stoppedEarly:true},
  {...flow,heads:[{done:true,total:0},{done:true,total:0}]},record('late-flow','dynamic',40),
  record('fake-pool','static',3600),record('fake-late','static',200),
  {...flow,dynamic:{timings:Array(10).fill({})}}
])assert(!model.phases([bad]).flow.length);
assert.equal(model.phases([record('pool-name','static',3600)]).pool.length,0);
assert.equal(model.phases([record('late-name','static',200)]).delayed.length,0);
for(const bad of [
  {...whole,administration:{seconds:180}},
  {...whole,administration:{seconds:14401}},
  {...whole,stoppedEarly:true},
  {...whole,scan:{...whole.scan,physicalPosition:{decubitus:'prone',headFirst:false}}},
  {...whole,scan:{...whole.scan,physicalPosition:{decubitus:'supine',headFirst:true}}},
  {...whole,scan:{...whole.scan,physicalPosition:undefined}},
  {...whole,heads:[{done:true,total:100},{done:true,total:0}]},
  {...whole,scan:{...whole.scan,startZ:100,endZ:16,travel:80}},
  {...whole,scan:undefined},
  {...whole,scan:{...whole.scan,startZ:200,endZ:16,travel:100}}
])assert.equal(model.phases([bad]).whole.length,0,'A partial or early scan must not complete the late whole-body step');
const assets=[flow,pool,late,whole].flatMap(r=>[1,2].map(d=>({id:r.id+d,acquisitionId:r.id})));
const state={patientId:'caso-oseo',identity:{fullName:'Matías Ignacio FANTOMA COMISION',rut:'91.000.002-0'},registration:{fullName:'MATIAS IGNACIO FANTOMA COMISION',rut:'91000002-0',examName:'Cintigrafía ósea trifásica'},seen:{band:true,folder:true,prepared:true,position:true,camera:true,protocol:true},viewer:{records:[flow,pool,late,whole],assets,pages:[{items:assets.map(a=>({asset:a.id,acquisitionId:a.acquisitionId})),overlaps:0,incomplete:0,exported:true}],header:true,seen:{playback:true,analysis:true,display:true}}};
const done=id=>model.evaluate(state).flat().find(c=>c.id===id).done;
assert.equal(model.evaluate(state).length,11);
assert(model.evaluate(state).flat().every(c=>c.done));
const wholeItem=state.viewer.pages[0].items.pop();
assert(!done('images'),'Both whole-body detector images must be placed');
state.viewer.pages[0].items.push(wholeItem);
state.viewer.pages[0].overlaps=1;
assert(!done('layout'));
state.viewer.pages[0].overlaps=0;state.viewer.pages[0].incomplete=1;
assert(!done('layout'));
state.viewer.pages[0].incomplete=0;state.viewer.pages[0].exported=false;
assert(!done('export'));
state.viewer.records.pop();
assert(!done('whole'));
assert(done('delayed'),'The directed static acquisition is checked separately');
assert(!done('images'));
state.viewer.records.push(whole);state.viewer.records=state.viewer.records.filter(r=>r!==late);
assert(done('whole'));
assert(!done('delayed'),'Whole-body cannot substitute for the directed static');
assert(!done('images'));
assert(!model.evaluate({viewer:{},seen:{}}).flat().some(c=>c.done));
console.log('OK: tutorial checks require late whole-body coverage, directed static, paired images, layout and current exports.');
