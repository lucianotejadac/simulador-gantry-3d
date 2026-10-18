const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('scripts/startup_loading.js','utf8');
function harness(search=''){
 const nodes=new Map(),frames=[],timers=[],intervals=[];let reloads=0;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,inert:id==='gantryWin',handlers:{},
  addEventListener(k,f){this.handlers[k]=f;},removeAttribute(k){delete this[k];},setAttribute(k,v){this[k]=v;},
  showModal(){this.open=true;this.modal=true;},close(){this.open=false;},remove(){this.removed=true;},focus(){this.focused=true;}});return nodes.get(id);};
 const window={},ctx=vm.createContext({window,document:{readyState:'complete',getElementById:node},URLSearchParams,
  location:{search,reload(){reloads++;}},requestAnimationFrame:f=>frames.push(f),
  setInterval(f){const t={f};intervals.push(t);return t;},clearInterval:t=>{if(t)t.cleared=true;},
  setTimeout(f){const t={f};timers.push(t);return t;},clearTimeout:t=>{if(t)t.cleared=true;}});
 vm.runInContext(source,ctx);
 return {window,node,frames,timers,intervals,tick:()=>intervals.at(-1).f(),get reloads(){return reloads;}};
}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
const flush=()=>new Promise(r=>setImmediate(r));
(async()=>{
 const h=harness('?demo=oseo-brazos-arriba'),room=deferred(),equipment=deferred();
 assert(h.node('startupLoading').modal&&h.node('gantryWin').inert);
 let canceled=false;h.node('startupLoading').handlers.cancel({preventDefault(){canceled=true;}});assert(canceled,'Escape cannot dismiss loading');
 h.window.GANTRY3D={room:{ready:room.promise},equipment:{ready:equipment.promise},patientLoadState:'loading'};
 h.window.GANTRY_LIVE={ready:true,state:{d1:{},d2:{}}};
 h.tick();room.resolve();equipment.resolve();
 Object.assign(h.window.GANTRY3D.room,{metadata:{},enabled:true});Object.assign(h.window.GANTRY3D.equipment,{metadata:{},enabled:true});
 await flush();h.tick();assert(h.node('gantryWin').inert,'resources alone do not unlock before patient/demo');
 h.window.GANTRY3D.patientLoadState='ready';h.tick();assert.equal(h.frames.length,0,'wait for requested demo study');
 h.window.GANTRY_DEMO_READY=true;h.tick();assert.equal(h.frames.length,1);
 assert(h.node('gantryWin').inert,'wait for painted frame');h.frames.shift()();assert(h.node('gantryWin').inert);h.frames.shift()();
 assert(!h.node('gantryWin').inert&&!h.node('startupLoading').open&&!h.node('startupLoading').removed);
 assert(h.intervals[0].cleared&&h.timers[0].cleared);
 h.window.GANTRY_LIVE.ready=false;h.tick();assert(!h.node('gantryWin').inert,'ordinary parameter updates do not reopen loading');
 const select=(study,ready=false)=>{
  h.window.GANTRY_LOADING.studyChanged(study,study.toUpperCase());
  Object.assign(h.window.GANTRY_LIVE,{ready,loadError:false,settings:{study},state:ready?{d1:{study},d2:{study}}:null});
 };
 // Hidden room/equipment must not block a later study load.
 h.window.GANTRY3D.room.enabled=false;h.window.GANTRY3D.equipment.enabled=false;
 select('dmsa');assert(h.node('gantryWin').inert&&h.node('startupLoading').open);
 assert.equal(h.node('gantryWin')['aria-busy'],'true');h.tick();assert.equal(h.frames.length,0);
 h.window.GANTRY_LIVE.ready=true;h.window.GANTRY_LIVE.state={d1:{study:'bone'},d2:{study:'bone'}};
 h.tick();assert.equal(h.frames.length,0,'old detector render cannot unlock the new study');
 h.window.GANTRY_LIVE.state={d1:{study:'dmsa'},d2:{study:'dmsa'}};
 h.tick();h.frames.shift()();assert(h.node('gantryWin').inert);h.frames.shift()();
 assert(!h.node('gantryWin').inert&&!h.node('startupLoading').open&&h.node('liveStudy').focused);
 // A cached selection still blocks through paint; an obsolete RAF cannot unlock another selection.
 select('bone',true);h.tick();h.frames.shift()();
 const obsolete=h.frames.shift();select('mibi');obsolete();assert(h.node('gantryWin').inert);
 h.window.GANTRY_LIVE.loadError=true;h.tick();assert(!h.node('startupRetry').hidden);
 h.window.GANTRY_LIVE.setStudy=study=>select(study);
 h.node('startupRetry').handlers.click();assert.equal(h.reloads,0,'retry preserves simulator session');
 assert(h.node('startupRetry').hidden&&!h.node('startupSpinner').hidden);
 h.window.GANTRY_LIVE.ready=true;h.window.GANTRY_LIVE.state={d1:{study:'mibi'},d2:{study:'mibi'}};
 h.tick();h.frames.shift()();h.frames.shift()();assert(!h.node('gantryWin').inert);
 select('maa');h.timers.at(-1).f();assert(h.node('gantryWin').inert&&!h.node('startupRetry').hidden);
 for(const failure of ['room','equipment','patient','study','timeout']){
  const x=harness(),good={ready:Promise.resolve(),metadata:{},enabled:true};
  x.window.GANTRY3D={room:{...good},equipment:{...good},patientLoadState:'ready'};
  x.window.GANTRY_LIVE={ready:true,state:{d1:{},d2:{}}};
  if(failure==='room'||failure==='equipment')x.window.GANTRY3D[failure].metadata=null;
  if(failure==='patient')x.window.GANTRY3D.patientLoadState='error';
  if(failure==='study')x.window.GANTRY_LIVE.loadError=true;
  if(failure==='timeout')x.timers[0].f();else{x.tick();await flush();x.tick();}
  assert(x.node('gantryWin').inert&&x.node('startupLoading').open, failure+' must keep application blocked');
  assert(!x.node('startupRetry').hidden&&x.node('startupTitle').textContent.includes('No se pudo'));
  x.node('startupRetry').handlers.click();assert.equal(x.reloads,1);
 }
 const simple=harness();simple.window.GANTRY3D={room:{ready:Promise.resolve(),metadata:{},enabled:true},equipment:{kind:'simple',enabled:false,metadata:null,ready:Promise.resolve()},patientLoadState:'ready'};
 simple.window.GANTRY_LIVE={ready:true,state:{d1:{},d2:{}}};simple.tick();await flush();simple.tick();assert(simple.frames.length,'intentional simple equipment is a ready configuration');
 const html=fs.readFileSync('index.html','utf8');assert(html.includes('id="gantryWin" inert aria-busy="true"'));
 assert(html.indexOf('<dialog id="startupLoading"')<html.indexOf('id="gantryWin" inert'));
 assert(html.includes(source));assert(html.includes("patientLoadState='ready'"));assert(html.includes('get loadError(){return !!activeAtlas().error;}'));
 const studyFn=html.slice(html.indexOf('  function setStudy(study){'),html.indexOf('  function setCollimator'));
 assert(studyFn.indexOf('selectStudy(nextStudy)===false')<studyFn.indexOf('window.GANTRY_LOADING?.studyChanged('));
 assert(studyFn.indexOf('window.GANTRY_LOADING?.studyChanged(')<studyFn.indexOf('acquisition.study=nextStudy'));
 console.log('OK: startup and study gates block through paint, ignore stale renders, preserve lock on errors/timeouts, and retry study loads without reloading the session.');
})().catch(e=>{console.error(e);process.exitCode=1;});
