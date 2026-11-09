const assert=require('node:assert/strict');
const model=require('../scripts/acquisition_tutorial_model.js');
const projection=angles=>({detectors:angles.map(rawAngle=>({rawAngle}))});
const record=(id,kind,seconds,angles=[0,180])=>({id,patient:{id:'caso-oseo'},study:'bone',acquisition:{kind},administration:{seconds},heads:[{total:2500,done:true},{total:2300,done:true}],processing:{first:projection(angles),last:projection(angles)},dynamic:kind==='dynamic'?{timings:Array(120).fill({})}:undefined});
const flow=record('flow','dynamic',0),pool=record('pool','static',180),late=record('late','static',10800);
const poolLateral=record('pool-lateral','static',360,[90,270]),lateLateral=record('late-lateral','static',12000,[270,90]);
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
assert(model.projectionPair(poolLateral,true));assert(model.projectionPair(lateLateral,true));
assert(model.projectionPair(record('slightly-off','static',180,[95,275]),true));
for(const r of [pool,record('oblique','static',180,[60,240]),record('same-side','static',180,[90,90]),
  {...poolLateral,processing:null},{...poolLateral,processing:{first:projection([90,270]),last:projection([0,180])}},
  {...pool,acquisition:{kind:'static',names:['Pool lateral','Lateral']}}])assert(!model.projectionPair(r,true));
assert(!model.projectionPair(poolLateral),'A lateral must not satisfy the anterior/posterior requirement');
const records=[flow,pool,poolLateral,late,lateLateral,whole];
const assets=records.flatMap(r=>[1,2].map(d=>({id:r.id+d,acquisitionId:r.id})));
const state={patientId:'caso-oseo',identity:{fullName:'Matías Ignacio FANTOMA COMISION',rut:'91.000.002-0'},registration:{fullName:'MATIAS IGNACIO FANTOMA COMISION',rut:'91000002-0',examName:'Cintigrafía ósea trifásica'},seen:{band:true,folder:true,prepared:true,position:true,camera:true,protocol:true},viewer:{records:records.slice(),assets,pages:[{items:assets.map(a=>({asset:a.id,acquisitionId:a.acquisitionId})),overlaps:0,incomplete:0,exported:true}],header:true,seen:{playback:true,analysis:true,display:true}}};
const done=id=>model.evaluate(state).flat().find(c=>c.id===id).done;
state.physicalPosition={decubitus:'supine',headFirst:false};
state.declaredPosition={decubitus:'supine',headFirst:false};
assert.equal(model.evaluate(state).length,11);
assert(model.evaluate(state).flat().every(c=>c.done));
for(const bad of [{decubitus:'supine',headFirst:true},{decubitus:'prone',headFirst:false},undefined]){
  state.physicalPosition=bad;
  assert(!done('physicalPosition'));assert(!done('declaredPosition'),'Correct declaration does not reposition the patient');
  state.physicalPosition={decubitus:'supine',headFirst:false};state.declaredPosition=bad;
  assert(done('physicalPosition'));assert(!done('declaredPosition'),'The camera declaration must match the physical scan pose');
  state.declaredPosition={decubitus:'supine',headFirst:false};
}
for(const [lateral,id] of [[poolLateral,'poolLateral'],[lateLateral,'delayedLateral']]){
  state.viewer.records=records.filter(r=>r!==lateral);
  assert(!done(id),'Each phase requires its own lateral acquisition');assert(!done('images'));
  state.viewer.records=records.slice();
  const item=state.viewer.pages[0].items.find(i=>i.acquisitionId===lateral.id);
  state.viewer.pages[0].items=state.viewer.pages[0].items.filter(i=>i!==item);
  assert(done(id));assert(!done('images'),'Both lateral detectors must also be placed on a flexible page');
  state.viewer.pages[0].items.splice(state.viewer.pages[0].items.length-2,0,item);
}
state.viewer.records=records.map(r=>r===poolLateral?{...r,administration:{seconds:600}}:r);
assert(!done('poolLateral'),'A lateral outside the pool timing window must not pass');state.viewer.records=records.slice();
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
console.log('OK: tutorial checks require anterior/posterior and lateral pairs in pool and delayed phases, actual angles, phase timing, complete whole-body, placed images and current exports.');
