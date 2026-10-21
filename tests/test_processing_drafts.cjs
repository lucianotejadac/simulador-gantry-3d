// DOM integration test. Requires jsdom (resolve through NODE_PATH if installed separately).
const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const html=fs.readFileSync('processing/index.html','utf8');
const dom=new JSDOM(html,{url:'http://local/processing/',runScripts:'outside-only'}),w=dom.window;
const messages=[],parent={postMessage:m=>messages.push(m)};
Object.defineProperty(w,'parent',{value:parent});
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
w.HTMLDialogElement.prototype.close=function(){this.open=false;};
w.eval(`
var $=id=>document.getElementById(id),dataset=null,modeStates={},acquisitionInstances={},currentAcquisition='static',currentMode='static',selectedDetector=0;
var acquisitionKinds={whole:'whole',static:'static',dynamic:'dynamic'},rows=[],pixels=null,frameCount=0,frameSize=0,defaults={},currentFilename='';
var flex={assets:[],pages:[]};
function value(ds){return JSON.stringify(ds.info);}
function field(label,val){const row=document.createElement('div');row.className='field';const l=document.createElement('label'),i=document.createElement('input');l.textContent=label;i.value=val;row.append(l,i);return row;}
function updateModeUI(){}
function selectMode(key){currentAcquisition=key;currentMode=acquisitionKinds[key];dataset=modeStates[key]?.dataset||null;populate();updateModeUI();}
function loadFile(){} function openFlexible(){} function closeFlexible(){} function stopDynamic(){} function saveMode(){}
function populate(){} function renderDetectorConditions(){} function group(){} function buildPanels(){} function controls(){} function renderAll(){} function showTags(){} function refreshFlexible(){}
function status(text){$('status').textContent=text;}
`);
for(const button of w.document.querySelectorAll('.tabs button'))button.onclick=()=>{
  for(const b of w.document.querySelectorAll('.tabs button'))b.setAttribute('aria-selected',String(b===button));
};
for(const name of ['processing_acquisition_config','processing_acquisition_actions','processing_session_list','processing_acquisition_editor'])w.eval(fs.readFileSync('scripts/'+name+'.js','utf8'));
const $=id=>w.document.getElementById(id),list=()=>[...w.document.querySelectorAll('.acquisition-tabs button[data-acquisition-number]')].filter(b=>!b.hidden);
const config={kind:'static',matrix:256,zoom:1,collimator:'LEHR',energyCenter:140,windowWidth:20,activityMci:20,minutes:120,mode:'time',target:2,velocity:10,contours:'auto',names:['D1','D2']};
const receive=data=>w.dispatchEvent(new w.MessageEvent('message',{source:parent,origin:'http://local',data:{version:1,...data}}));
const menu=action=>{$('processingAcquireMenu').value=action;$('processingAcquireMenu').dispatchEvent(new w.Event('change'));};
const prepare=kind=>{menu(kind);const request=messages.at(-1);assert.equal(request.type,'GANTRY_ACQUIRE_CONFIG');receive({type:request.type,request:request.request,config:{...config,kind}});};
const edit=(id,val)=>{$('gantryDraft-'+id).value=String(val);$('gantryDraft-'+id).dispatchEvent(new w.Event('input'));};
prepare('static');assert.equal(list().length,1);const first=list()[0];
assert.equal(messages.at(-1).type,'GANTRY_CAMERA_PREVIEW','Opening a draft updates the live camera');
for(const [key,value] of [['matrix',128],['zoom',2],['collimator','HE'],['energyCenter',180],['windowWidth',25]]){
  edit(key,value);assert.equal(messages.at(-1).type,'GANTRY_CAMERA_PREVIEW');assert.equal(messages.at(-1).config[key],value);
}
const countBeforeInvalid=messages.length;edit('energyCenter','');assert.equal(messages.length,countBeforeInvalid,'Incomplete numeric input leaves last valid live settings');edit('energyCenter',140);
edit('matrix',128);edit('target',7);edit('name1','Primera AP');$('tab-stop').click();
prepare('whole');assert.equal(list().length,2,'New configuration must not replace the first');const second=list()[1];
edit('velocity',8);edit('contours','fixed');
first.click();assert.equal($('gantryDraft-matrix').value,'128');assert.equal($('gantryDraft-target').value,'7');assert.equal($('gantryDraft-name1').value,'Primera AP');
assert.equal(messages.at(-1).type,'GANTRY_CAMERA_PREVIEW');assert.equal(messages.at(-1).config.collimator,'HE','Returning to a draft restores its live preview');
assert.equal($('tab-stop').getAttribute('aria-selected'),'true');
second.click();assert.equal($('gantryDraft-velocity').value,'8');assert.equal($('gantryDraft-contours').value,'fixed');
assert.equal(list().length,2);
// Leaving the draft to inspect an acquired slot must not discard it.
w.GANTRY_PROCESSING_EDITOR.finish();w.selectMode('static');assert.equal(list().length,2);
second.click();assert.equal($('gantryDraft-velocity').value,'8');
menu('delete');assert($('retakeConfirmation').open);$('retakeCancel').click();assert.equal(list().length,2);
menu('delete');$('retakeConfirm').click();assert.equal(list().length,1);assert.equal(list()[0],first);
assert.equal($('gantryDraft-target').value,'7','Deleting the second draft restores the first with its settings');
assert(!messages.some(m=>m.type==='GANTRY_ACQUIRE_DELETE'),'Unacquired configurations are removed locally');
// Starting promotes exactly the selected pending tile.
prepare('whole');const third=list()[1];first.click();menu('start');const start=messages.at(-1);
assert.equal(start.type,'GANTRY_ACQUIRE_START');assert.equal(start.config.target,7);
receive({type:'GANTRY_ACQUIRE_STARTED',request:start.request,id:'acquired-first'});
assert.equal(list().length,2);assert.equal(list()[0],first);assert.equal(list()[1],third);
assert(!list()[0].textContent.includes('Configuración'));
w.GANTRY_PROCESSING_EDITOR.finish();assert.equal(list().length,2);
third.click();assert.equal($('gantryDraft-velocity').value,'10');
assert(w.document.querySelector('[data-acquire="delete"]').disabled,'Deletion blocked while another acquisition runs');
w.GANTRY_PROCESSING_EDITOR.finish();
receive({type:'GANTRY_ACQUIRE_PROGRESS',state:{id:'acquired-first',finished:true,heads:[{total:10,elapsed:7},{total:9,elapsed:7}],mode:'time',target:7},images:[]});
const info={processing:{acquisitionId:'acquired-first'},acquisition:{kind:'static',mode:'time'},settings:{}};
const ds={info,string:tag=>tag==='x00110010'?'GANTRY_SIMULATION':tag==='x00080018'?'image-first':''};
w.GANTRY_RECORDED_METADATA={fields:()=>({})};
w.modeStates.static={dataset:ds};w.acquisitionInstances.static={D1:{dataset:ds}};
w.selectMode('static');assert.equal(list().length,2);
menu('delete');$('retakeConfirm').click();const deletion=messages.at(-1);
assert.equal(deletion.type,'GANTRY_ACQUIRE_DELETE');assert.equal(deletion.id,'acquired-first');
receive({type:'GANTRY_ACQUIRE_ERROR',request:deletion.request,error:'Cache unavailable'});
assert.equal(list().length,2,'Failed delete must keep the acquired tile');
menu('delete');$('retakeConfirm').click();const retried=messages.at(-1);
receive({type:'GANTRY_ACQUIRE_DELETE',request:retried.request,id:'acquired-first'});
assert.equal(list().length,1);assert.equal(list()[0],third,'Deleting an acquired tile preserves the pending configuration');
assert.equal($('gantryDraft-velocity').value,'10');
dom.window.close();
console.log('OK: multiple pending tiles, edited settings and tab retained across navigation, explicit delete/cancel, selected-tile promotion and running lock.');
