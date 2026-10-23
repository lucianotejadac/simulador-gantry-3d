const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const source=fs.readFileSync('processing/index.html','utf8');
const parserCode=source.slice(source.indexOf('<script>')+8,source.indexOf('const DICT='));
const parserEnv=vm.createContext({module:{exports:{}},exports:{},require,Uint8Array,ArrayBuffer,DataView,console});
vm.runInContext(parserCode,parserEnv);const parser=parserEnv.module.exports;
const env=vm.createContext({window:{},crypto:webcrypto,TextEncoder,Uint8Array,Uint32Array,DataView,structuredClone});
for(const file of ['bone_acquisition_store.js','processing_dicom.js'])vm.runInContext(fs.readFileSync('scripts/'+file,'utf8'),env);
const api=env.window.GANTRY_PROCESSING_DICOM;
function record(n=128,height=n,peak=50){
 const heads=[1,2].map(detector=>{const counts=Uint32Array.from({length:n*height},(_,i)=>i%137===0?peak:i%5);return {detector,counts,total:counts.reduce((a,b)=>a+b,0),elapsed:detector*61.23,done:true};});
 const first={settings:{collimator:'LEHR',energyCenter:140,windowWidth:20,zoom:1.5},detectors:[{view:'OAD 45 grados',angle:45,orientationMatched:true},{view:'PA',angle:180,orientationMatched:true}]};
 return {version:1,id:'test-'+n+'-'+height+'-'+peak,createdAt:1700000000000,n,height,kind:height===n?'static':'whole',study:'bone',finished:true,mode:'counts',target:400000,names:['Cráneo oblicuo','Posterior'],heads,
   mdp:{start:{activityMBq:740,seconds:7200,halfLifeMinutes:360.402}},processing:{first,last:first,varied:false}};
}
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gantry-processing-')),checks=[];
 const wholeBody=[64,128,256,512].map(n=>({...record(n,4*n),sampling:{
   pixelMm:2.3975999355316*256/n,widthMm:2.3975999355316*256,heightMm:2.3975999355316*1024}}));
 for(const recordData of [record(64),record(64,160),record(),record(256),record(512),record(1024),record(128,320),record(128,128,100000),...wholeBody]){
  const before=recordData.heads.map(h=>h.counts.slice()),files=await api.files(recordData,await api.uid('study'));
  const repeat=await api.files(recordData,await api.uid('study'));assert.equal(repeat[0].uid,files[0].uid);
  files.forEach((file,j)=>{
   assert.deepEqual(recordData.heads[j].counts,before[j]);
   const ds=parser.parseDicom(new Uint8Array(file.bytes)),bits=ds.uint16('x00280100'),pixel=ds.elements.x7fe00010;
   assert.equal(ds.uint16('x00280010'),recordData.height);assert.equal(ds.uint16('x00280011'),recordData.n);
   if(recordData.sampling)for(const p of ds.string('x00280030').split('\\'))assert(Math.abs(Number(p)-recordData.sampling.pixelMm)<1e-8);
   assert.equal(Number(ds.string('x00181242')),Math.round(recordData.heads[j].elapsed*1000));
   assert.equal(ds.string('x00080018'),file.uid);
   const metadata=JSON.parse(ds.string('x00111010'));
   assert.equal(metadata.acquisition.mode,recordData.mode);assert.equal(metadata.acquisition.target,recordData.target);
   assert.deepEqual(metadata.heads,recordData.heads.map(h=>({detector:h.detector,elapsed:h.elapsed,total:h.total,done:h.done})));
   const v=new DataView(ds.byteArray.buffer,ds.byteArray.byteOffset+pixel.dataOffset,pixel.length);
   for(let i=0;i<before[j].length;i++)assert.equal(bits===16?v.getUint16(i*2,true):v.getUint32(i*4,true),before[j][i]);
   assert.equal(bits,recordData.id.endsWith('100000')?32:16);
   if(bits===32)assert.equal(ds.string('x00080016'),api.PRIVATE32);
   const filename=path.join(tmp,recordData.id+'-'+j+'.dcm');fs.writeFileSync(filename,new Uint8Array(file.bytes));
   checks.push({filename,total:file.total,rows:file.rows,cols:file.cols,bits,elapsed:recordData.heads[j].elapsed,pixelMm:recordData.sampling?.pixelMm});
  });
 }
 const legacy=record();delete legacy.processing;assert.match(api.label(legacy,0),/no registrada/);
 const moved=record();moved.processing.varied=true;assert.match(api.label(moved,0),/variable/);
 const incomplete=record();incomplete.finished=false;await assert.rejects(()=>api.files(incomplete,'2.25.1'));
 const corrupt=record();corrupt.heads[0].total++;await assert.rejects(()=>api.files(corrupt,'2.25.1'));
 const wrong=record();wrong.study='mibi';await assert.rejects(()=>api.files(wrong,'2.25.1'));
 // Independent decoder, and byte-exact restoration through the existing project format.
 const project={format:'nuclear-dicom-project',version:1,files:checks.map(c=>({name:path.basename(c.filename),data:fs.readFileSync(c.filename).toString('base64')})),pages:[]};
 for(let i=0;i<checks.length;i++)assert.deepEqual(Buffer.from(JSON.parse(JSON.stringify(project)).files[i].data,'base64'),fs.readFileSync(checks[i].filename));
 // Exercise the actual openProject function independently of browser upload permissions.
 const restored=[],nodes=new Map(),state={assets:[],pages:[],cache:new Map()};
 const projectEnv={console,Uint8Array,File,atob,dicomParser:parser,DICT:{},flex:state,
  acquisitionKinds:{whole:'whole',static:'static',dynamic:'dynamic'},modeStates:{},acquisitionInstances:{},
  projectUnsaved:()=>false,stopDynamic(){},copyFlexHeader:h=>h?structuredClone(h):null,
  flexAsset:i=>state.assets.find(a=>a.id===i.asset),openFlexible(){},projectSignature:()=>JSON.stringify(state.pages),
  $:id=>{if(!nodes.has(id))nodes.set(id,{textContent:''});return nodes.get(id);},alert:message=>{throw Error(message);},
  async loadFile(file){const ds=parser.parseDicom(new Uint8Array(await file.arrayBuffer()));restored.push(ds);state.assets.push({id:ds.string('x00080018')+':0'});}};
 project.pages=[{id:1,texts:[],items:checks.map((c,i)=>({id:i+1,asset:parser.parseDicom(new Uint8Array(fs.readFileSync(c.filename))).string('x00080018')+':0',window:90,level:45}))}];project.page=1;
 const projectContext=vm.createContext(projectEnv);
 vm.runInContext(source.slice(source.indexOf('async function openProject(file)'),source.indexOf('const projectActions=')),projectContext);
 await projectContext.openProject(new File([JSON.stringify(project)],'test.dicomproject'));
 assert.equal(restored.length,checks.length);assert.equal(state.pages[0].items[0].window,90);assert.equal(nodes.get('project-message').textContent,'Proyecto recuperado.');
 if(process.argv[2]){await projectContext.openProject(new File([fs.readFileSync(process.argv[2])],'browser.dicomproject'));assert.equal(state.pages.length,2);assert.equal(state.pages.reduce((n,p)=>n+p.items.length,0),4);}
 const result=spawnSync('python',['-c',`import json,sys,pydicom
for item in json.loads(sys.stdin.read()):
 d=pydicom.dcmread(item['filename'])
 assert int(d.pixel_array.sum())==item['total']
 assert d.pixel_array.shape==(item['rows'],item['cols'])
 assert d.BitsAllocated==item['bits']
 if item.get('pixelMm'):
  assert all(abs(float(p)-item['pixelMm'])<1e-8 for p in d.PixelSpacing)
 assert int(d.ActualFrameDuration)==round(item['elapsed']*1000)
 assert float(d.RadiopharmaceuticalInformationSequence[0].RadionuclideTotalDose)==740
 assert 'SIMULADO' in str(d.PatientName)
print('pydicom: pixel totals, dimensions, duration and dose verified')`],{input:JSON.stringify(checks),encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);console.log(result.stdout.trim());
 // Run the actual receiver against the actual parser with a minimal viewer shell.
 const imports=[],listeners={},replies=[],parent={postMessage:m=>replies.push(m)};
 const selectedModes=[];
 const globals={window:{addEventListener:(n,fn)=>listeners[n]=fn},parent,location:{origin:'http://local'},dicomParser:parser,ArrayBuffer,Uint8Array,DataView,File,
   acquisitionInstances:{static:{}},selectMode:(...args)=>selectedModes.push(args),
   flex:{assets:[],pages:[],serial:0,header:null},PAGE:{top:100},$:()=>({textContent:''}),stopDynamic(){},openFlexible(){},refreshFlexible(){},arrangeFlexible(){},
   async loadFile(file,ds){imports.push(file);globals.acquisitionInstances.static[ds.string('x00080018')]={};globals.flex.assets.push({uid:ds.string('x00080018'),id:ds.string('x00080018')+':0',rows:ds.uint16('x00280010'),cols:ds.uint16('x00280011'),window:50,level:25});},
   flexNewPage(){const p={id:globals.flex.pages.length+1,items:[]};globals.flex.pages.push(p);return p;}};
 vm.runInContext(fs.readFileSync('scripts/processing_receiver.js','utf8'),vm.createContext(globals));
 const files=await api.files(record(1024),await api.uid('study')),event={source:parent,origin:'http://local',data:{type:'GANTRY_PROCESSING_IMPORT',version:1,id:1,files}};
 await listeners.message({...event,origin:'http://foreign'});assert.equal(imports.length,0);
 await listeners.message({...event,source:{}});assert.equal(imports.length,0);
 await listeners.message(event);assert.equal(replies.at(-1).images,2);assert.equal(globals.flex.pages.length,0,'Import alone must not compose images');
 await listeners.message({...event,data:{...event.data,view:'acquisition'}});
 assert.deepEqual(selectedModes.at(-1),['static',files[0].uid],'Automatic imports open the acquisition menu, not the flexible page');
 assert.equal(globals.flex.pages.length,0,'Completed acquisitions stay available without filling the flexible page');
 const compose={...event,data:{...event.data,view:'flex'}};
 await listeners.message(compose);assert.equal(globals.flex.pages.length,1,'Explicit composition still works');
 await listeners.message(compose);assert.equal(globals.flex.pages.length,1,'Repeat must not duplicate pages');
 const composed=JSON.stringify(globals.flex.pages);
 const nextFiles=await api.files({...record(128),id:'another-acquisition'},await api.uid('study'));
 await listeners.message({...event,data:{...event.data,files:nextFiles,view:'acquisition'}});
 assert.equal(JSON.stringify(globals.flex.pages),composed,'Later acquisitions must not alter a manually composed page');
 const bad=structuredClone(event.data);bad.files[0].total++;
 await listeners.message({...event,data:bad});assert.match(replies.at(-1).error,/cuentas/);
 const external=structuredClone(event.data),bytes=new Uint8Array(external.files[0].bytes);
 const creator=Buffer.from(bytes).indexOf(Buffer.from('GANTRY_SIMULATION'));assert(creator>=0);
 bytes[creator]=88;
 const previousImports=imports.length;
 await listeners.message({...event,data:external});
 assert.match(replies.at(-1).error,/simulador/);assert.equal(imports.length,previousImports);
 const html=fs.readFileSync('index.html','utf8');assert.match(html,/<iframe id="boneProcessingFrame"[^>]*data-src=/);
 assert(!/<iframe id="boneProcessingFrame"[^>]*\ssrc=/.test(html),'Viewer must not load at startup');
 console.log('OK: lossless 128/256 and rectangular images, 32-bit overflow, orientation, immutable originals, project bytes, receiver source/origin checks, totals, deduplication, lazy loading.');
})().catch(e=>{console.error(e);process.exitCode=1;});
