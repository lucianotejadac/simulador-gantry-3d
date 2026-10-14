const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('scripts/startup_loading.js','utf8');
function harness(search=''){
 const nodes=new Map(),frames=[],timers=[],intervals=[];let reloads=0;
 const node=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,inert:id==='gantryWin',handlers:{},
  addEventListener(k,f){this.handlers[k]=f;},removeAttribute(k){delete this[k];},
  showModal(){this.open=true;this.modal=true;},close(){this.open=false;},remove(){this.removed=true;},focus(){this.focused=true;}});return nodes.get(id);};
 const window={},ctx=vm.createContext({window,document:{readyState:'complete',getElementById:node},URLSearchParams,
  location:{search,reload(){reloads++;}},requestAnimationFrame:f=>frames.push(f),
  setInterval(f){const t={f};intervals.push(t);return t;},clearInterval:t=>{if(t)t.cleared=true;},
  setTimeout(f){const t={f};timers.push(t);return t;},clearTimeout:t=>{if(t)t.cleared=true;}});
 vm.runInContext(source,ctx);
 return {window,node,frames,timers,intervals,tick:()=>intervals[0].f(),get reloads(){return reloads;}};
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
 assert(!h.node('gantryWin').inert&&h.node('startupLoading').removed);
 assert(h.intervals[0].cleared&&h.timers[0].cleared);
 h.window.GANTRY_LIVE.ready=false;h.tick();assert(!h.node('gantryWin').inert,'subsequent study loads do not reopen initial modal');
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
 const simple=harness('?equipo=simple');simple.window.GANTRY3D={room:{ready:Promise.resolve(),metadata:{},enabled:true},equipment:{ready:Promise.resolve()},patientLoadState:'ready'};
 simple.window.GANTRY_LIVE={ready:true,state:{d1:{},d2:{}}};simple.tick();await flush();simple.tick();assert(simple.frames.length,'intentional simple equipment is a ready configuration');
 const html=fs.readFileSync('index.html','utf8');assert(html.includes('id="gantryWin" inert aria-busy="true"'));
 assert(html.indexOf('<dialog id="startupLoading"')<html.indexOf('id="gantryWin" inert'));
 assert(html.includes(source));assert(html.includes("patientLoadState='ready'"));assert(html.includes('get loadError(){return !!activeAtlas().error;}'));
 console.log('OK: modal starts before app, blocks Escape, waits for all initial assets and paint, stays closed after startup, preserves lock on errors/timeouts and offers retry.');
})().catch(e=>{console.error(e);process.exitCode=1;});
