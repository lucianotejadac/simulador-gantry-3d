// Exercise the packaged viewer with real simulator DICOMs and parent messages.
const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM,VirtualConsole}=require('jsdom');
const errors=[],messages=[],parent={postMessage:m=>messages.push(m)},vc=new VirtualConsole();
vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(fs.readFileSync('processing/index.html','utf8'),{url:'http://local/processing/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
 w.TextDecoder=TextDecoder;w.TextEncoder=TextEncoder;w.structuredClone=structuredClone;
 Object.defineProperty(w,'crypto',{value:require('node:crypto').webcrypto});
 w.HTMLCanvasElement.prototype.getContext=()=>({createImageData:(x,y)=>({data:new w.Uint8ClampedArray(x*y*4)}),putImageData(){},drawImage(){},fillRect(){},clearRect(){},save(){},restore(){},setTransform(){},scale(){},translate(){},rotate(){},strokeRect(){},fillText(){},measureText:()=>({width:10})});
 w.HTMLCanvasElement.prototype.toDataURL=()=>'';w.URL.createObjectURL=()=>'';w.URL.revokeObjectURL=()=>{};
}}),w=dom.window,$=id=>w.document.getElementById(id);
Object.defineProperty(w,'parent',{value:parent});
const receive=data=>w.dispatchEvent(new w.MessageEvent('message',{source:parent,origin:'http://local',data:{version:1,...data}}));
const menu=action=>{$('processingAcquireMenu').value=action;$('processingAcquireMenu').dispatchEvent(new w.Event('change'));};
const form=()=>Object.fromEntries(['patient','camera','series','stop','summary'].map(id=>[id,[...$(id).querySelectorAll('.field')].map(row=>[row.querySelector('label').textContent,row.querySelector('input,select').value])]));
async function load(file){w.testBytes=new w.Uint8Array(file.bytes);await w.eval('loadFile({name:"test.dcm",arrayBuffer:async()=>testBytes.buffer},dicomParser.parseDicom(testBytes))');}
(async()=>{
 for(const name of ['bone_acquisition_store','processing_dicom'])w.eval(fs.readFileSync('scripts/'+name+'.js','utf8'));
 const saved=[];
 for(const [i,kind] of ['static','whole','dynamic'].entries()){
  const config={kind,matrix:kind==='whole'?128:64,zoom:1.5,collimator:'HE',energyCenter:137,windowWidth:15,
   activityMci:12,minutes:2,mode:'time',target:7,velocity:8,contours:'fixed',names:['AP prueba','PA prueba'],
   position:{decubitus:'prone',entry:'headIn',locked:false},phases:[{frames:2,seconds:1},{frames:1,seconds:5}]};
  receive({type:'GANTRY_POSITION_STATE',position:config.position});
  menu(kind);const req=messages.at(-1);
  receive({type:'GANTRY_ACQUIRE_CONFIG',request:req.request,config});
  $('tab-summary').click();const before=form();
  menu('start');const start=messages.at(-1),id='frozen-'+kind;
  assert.equal(start.type,'GANTRY_ACQUIRE_START');
  receive({type:'GANTRY_ACQUIRE_STARTED',request:start.request,id});
  assert($('gantryDraft-position-decubitus').disabled);
  // The physical gantry can report a different position without rewriting the form.
  receive({type:'GANTRY_POSITION_STATE',position:{decubitus:'supine',entry:'headOut',locked:false}});
  assert.equal($('gantryDraft-position-decubitus').value,'prone');
  w.testConfig=config;w.testId=id;
  w.eval(`var c=testConfig,n=c.matrix,h=c.kind==='whole'?4*n:n;
   var testRecord={version:1,id:testId,createdAt:1700000000000+${i},n,height:h,kind:c.kind,study:'bone',finished:true,
    mode:c.kind==='whole'?'scan':'time',target:c.kind==='whole'?160:7,names:c.names,
    heads:[1,2].map(detector=>({detector,counts:new Uint32Array(n*h).fill(3),total:n*h*3,elapsed:7,done:true})),
    mdp:{start:{activityMBq:c.activityMci*37,seconds:c.minutes*60}},
    processing:{acquisitionId:testId,first:{settings:{...c,decubitus:'prone',headFirst:true},detectors:[{view:'AP'},{view:'PA'}]}}};
   if(c.kind==='whole')testRecord.scan={velocity:8,contours:'fixed',travel:160,fixedDistances:{detDist1:25,detDist2:25}};
   if(c.kind==='dynamic')testRecord.dynamic={phases:c.phases,frames:[{phase:1,index:1,start:0,end:1},{phase:1,index:2,start:1,end:2},{phase:2,index:1,start:2,end:7}].map(f=>({...f,heads:[new Uint32Array(n*n).fill(1),new Uint32Array(n*n).fill(1)]}))};`);
  const files=await w.GANTRY_PROCESSING_DICOM.files(w.testRecord,'2.25.551');
  // loadFile is the same final-image path used by the receiver.
  for(const file of files)await load(file);
  receive({type:'GANTRY_ACQUIRE_PROGRESS',state:{id,finished:true,heads:[{total:10,elapsed:7},{total:9,elapsed:7}],mode:'time',target:7},images:[]});
  assert(w.document.body.classList.contains('gantry-acquisition-frozen'));
  assert.deepEqual(form(),before,kind+': the same fields and recorded values survive completion');
  assert.equal($('tab-summary').getAttribute('aria-selected'),'true','Completion preserves the selected tab');
  for(const pane of ['patient','camera','series','stop','summary'])for(const node of $(pane).querySelectorAll('input,select'))assert(node.readOnly||node.disabled,kind+' '+node.id);
  assert(!$('camera').textContent.includes('Calibraciones'));
  assert(!$('camera').textContent.includes('Detector y ventana registrados'));
  const frozen=form(),messageCount=messages.length;
  receive({type:'GANTRY_ADMINISTRATION_STATE',activityMci:25,minutes:179});
  receive({type:'GANTRY_POSITION_STATE',position:{decubitus:'supine',entry:'headOut',locked:false}});
  w.eval('renderDetectorConditions()');
  assert.deepEqual(form(),frozen,'Live updates do not rewrite acquired parameters');
  assert.equal(messages.length,messageCount,'Recorded forms never preview or send camera settings');
  $('gantryApplyCameraLive').click();
  const preview=messages.at(-1);assert.equal(preview.type,'GANTRY_CAMERA_PREVIEW');
  for(const key of ['kind','matrix','zoom','collimator','energyCenter','windowWidth'])assert.equal(preview.config[key],config[key]);
  assert.deepEqual(form(),frozen,'Explicitly copying camera parameters to live never modifies the acquired image metadata');
  const selectedKey=w.eval('currentAcquisition');
  menu(kind);const pending=messages.at(-1);receive({type:'GANTRY_ACQUIRE_CONFIG',request:pending.request,config});
  w.selectMode(selectedKey);
  assert(w.document.body.classList.contains('gantry-acquisition-frozen'),'Reselecting the same saved tile restores its frozen layout');
  assert.deepEqual(form(),frozen);
  saved.push({file:files[0],fields:frozen});
 }
 // Return to an earlier acquisition and reconstruct it from persisted DICOM metadata.
 await load(saved[0].file);assert.deepEqual(form(),saved[0].fields);
 $('tab-stop').click();await load(saved[1].file);await load(saved[0].file);
 assert.equal($('tab-stop').getAttribute('aria-selected'),'true');
 assert.deepEqual(errors,[]);dom.window.close();
 console.log('OK: static/whole/dynamic forms freeze unchanged, preserve tabs, reject live updates and restore recorded fields on reselection.');
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});
