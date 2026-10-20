const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
function fixture(){
  const nodes=new Map(),events={},messages=[],timers=new Map();let serial=0;
  const node=id=>({id,hidden:false,children:[],dataset:{src:'processing/index.html'},textContent:'',
    append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},
    setAttribute(){},querySelectorAll(){return [];},closest(){return node('details');}});
  const el=id=>{if(!nodes.has(id))nodes.set(id,node(id));return nodes.get(id);};
  el('boneProcessingTab').parentElement=node('menubar');
  const frame=el('boneProcessingFrame');frame.contentWindow={postMessage:m=>messages.push(m)};
  const window={GANTRY_BONE_STORAGE:{createStore(){throw Error('Must not read previous sessions');}},
    GANTRY_BONE_ACQ:{active:false,processingCurrent(){throw Error('Do not import selected archived images');}},
    GANTRY_LIVE:{settings:{study:'bone'},update(){}},GANTRY:{G:{}},
    GANTRY_PROCESSING_ACQUISITION:{attach(){}},
    GANTRY_PROCESSING_DICOM:{uid:async()=> 'study',files:async r=>[1,2].map(d=>({record:r.id,detector:d}))},
    addEventListener:(name,fn)=>events[name]=fn};
  const context=vm.createContext({window,document:{getElementById:el,createElement:node},location:{origin:'http://local'},
    setTimeout(fn,ms){if(ms===0){queueMicrotask(fn);return 0;}timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(fs.readFileSync('scripts/processing_bridge.js','utf8'),context);
  const receive=data=>events.message({origin:'http://local',source:frame.contentWindow,data:{version:1,...data}});
  return {api:window.GANTRY_PROCESSING,el,messages,receive};
}
const record=id=>({id,study:'bone',finished:true,createdAt:1700000000000,kind:'whole',names:['AP','PA'],
  processing:{acquisitionId:id},heads:[{total:100},{total:90}]});
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
(async()=>{
  const f=fixture();await f.api.open();f.receive({type:'GANTRY_PROCESSING_READY'});await flush();
  assert.equal(f.messages.length,0);assert.match(f.el('boneProcessingList').textContent,/Sin adquisiciones/);
  f.api.remember(record('first'));f.api.remember(record('second'));await flush();
  assert.equal(f.messages.length,1);assert.equal(f.messages[0].files.length,2,'One acquisition, two detectors');
  assert.equal(f.messages[0].files[0].record,'first');
  f.receive({type:'GANTRY_PROCESSING_RESULT',id:f.messages[0].id,images:2,totals:[100,90]});await flush();
  assert.equal(f.messages.length,2);assert.equal(f.messages[1].files[0].record,'second');
  f.receive({type:'GANTRY_PROCESSING_RESULT',id:f.messages[1].id,images:2,totals:[100,90]});await flush();
  f.api.remember({...record('first'),id:'saved-copy'});await flush();
  // Saved copies retain the original acquisition identity.
  f.api.close();await f.api.open();await flush();assert.equal(f.messages.filter(m=>m.type==='GANTRY_PROCESSING_IMPORT').length,2);
  const fresh=fixture();await fresh.api.open();fresh.receive({type:'GANTRY_PROCESSING_READY'});await flush();
  assert.equal(fresh.messages.length,0,'Reload creates an empty session');

  const nodes=new Map(),order=[];
  const el=id=>{if(!nodes.has(id))nodes.set(id,{id,hidden:false});return nodes.get(id);};
  const empty={};const nav={querySelector:()=>empty,append(){},insertBefore(button){const old=order.indexOf(button.id);if(old>=0)order.splice(old,1);order.push(button.id);}};
  const s={document:{querySelector:()=>nav,createElement:()=>({}),head:{append(){}}},$:el,
    acquisitionKinds:{whole:'whole',static:'static',dynamic:'dynamic'},modeStates:{},acquisitionInstances:{},
    currentAcquisition:'whole',dataset:null,updateModeUI(){}};
  vm.createContext(s);vm.runInContext(fs.readFileSync('scripts/processing_session_list.js','utf8'),s);
  assert(['whole','static','dynamic','flex'].every(k=>el('mode-'+k).hidden));assert(!empty.hidden);
  s.modeStates.static={dataset:{}};s.acquisitionInstances.static={D1:{dataset:{}},D2:{dataset:{}}};s.updateModeUI();
  assert.deepEqual(order,['mode-static']);assert(empty.hidden);
  s.modeStates.whole={dataset:{}};s.updateModeUI();
  assert.deepEqual(order,['mode-static','mode-whole'],'Chronological, not grouped by type');
  s.acquisitionKinds['static-2']='static';s.modeStates['static-2']={dataset:{}};s.updateModeUI();s.updateModeUI();
  assert.deepEqual(order,['mode-static','mode-whole','mode-static-2']);
  console.log('OK: zero initial acquisitions, no cache import, FIFO per detector pair, deduplication, reopening retains session, reload starts empty and no placeholder/tool tiles.');
})().catch(e=>{console.error(e);process.exitCode=1;});
