const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('scripts/exam_safety.js','utf8'),storage=new Map();
function harness(){
 const nodes=new Map(),events={};let contact=false,busy=false,cancels=0,resets=0;
 const el=id=>{if(!nodes.has(id))nodes.set(id,{id,disabled:false,hidden:false,textContent:'',value:'safe',addEventListener(k,f){this[k]=f;}});return nodes.get(id);};
 const window={GANTRY:{G:{}},GANTRY3D:{collision:{evaluate:()=>[{body:{gap:contact?0:.1},table:{gap:1}}]}},
  GANTRY_BONE_ACQ:{get state(){return {busy};},cancelExam(){cancels++;},resetExam(){resets++;}},
  GANTRY_MAG3:{cancelExam(){cancels++;},resetExam(){resets++;}},GANTRY_FINAL_PREVIEW:{cancel(){cancels++;}},
  GANTRY_LIVE:{signal:{mode:'live'},update(){}}};
 const document={getElementById:el,addEventListener(k,f){events[k]=f;}};
 vm.runInNewContext(source,{window,document,sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},Date,JSON,Map});
 return {window,el,events,api:window.GANTRY_EXAM,setContact:v=>contact=v,setBusy:v=>busy=v,get cancels(){return cancels;},get resets(){return resets;}};
}
const a=harness();assert(!a.api.blocked);
assert(a.api.cancel({detector:1,surface:'body',region:'tórax'}));assert.equal(a.cancels,3);
assert(!a.api.cancel({detector:2}));assert.equal(a.cancels,3);
assert(a.el('boneAcqInstant').disabled&&a.el('injectMAG3').disabled&&!a.el('examSafetyBanner').hidden);
let stopped=false;a.events.click({composedPath:()=>[a.el('boneAcqStart')],preventDefault(){},stopImmediatePropagation(){stopped=true;}});assert(stopped);
a.el('collisionMode').value='safe';assert(a.api.blocked,'Changing mode must not unlock');
const reload=harness();assert(reload.api.blocked,'Reload in the same tab must preserve cancellation');
reload.setBusy(true);assert(!reload.api.restart());reload.setBusy(false);
reload.setContact(true);assert(!reload.api.restart());assert(reload.el('examSafetyHint').textContent.includes('retira'));
reload.setContact(false);assert(reload.api.restart());assert(!reload.api.blocked);assert.equal(reload.resets,2);
assert(reload.el('examSafetyBanner').hidden&&!reload.el('boneAcqStart').disabled);
assert(!harness().api.blocked,'Explicit restart clears persistent cancellation');
console.log('OK: exam-wide cancellation, duplicate event suppression, capture guard, persistent lock, safe restart and reset callbacks.');
