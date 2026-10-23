/* Packaged DOM and real DICOM integration. Raster buffers are captured at the
   canvas boundary; source data, detector isolation and pointer coordinates are tested. */
const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM,VirtualConsole}=require('jsdom');
const errors=[],raster=new Map(),vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(fs.readFileSync('processing/index.html','utf8'),{url:'http://local/processing/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
 w.TextDecoder=TextDecoder;w.TextEncoder=TextEncoder;w.structuredClone=structuredClone;Object.defineProperty(w,'crypto',{value:require('node:crypto').webcrypto});
 w.HTMLCanvasElement.prototype.getContext=function(){const id=this.id;return {createImageData:(x,y)=>({data:new w.Uint8ClampedArray(x*y*4)}),putImageData(img){raster.set(id,img.data.slice());},drawImage(){},fillRect(){},clearRect(){},save(){},restore(){},setTransform(){},scale(){},translate(){},rotate(){},strokeRect(){},fillText(){},measureText:()=>({width:10})};};
 w.HTMLCanvasElement.prototype.toDataURL=()=>'';w.URL.createObjectURL=()=>'';w.URL.revokeObjectURL=()=>{};
}}),w=dom.window,$=id=>w.document.getElementById(id),tick=()=>new Promise(r=>setTimeout(r,5));
async function load(bytes,name){w.testBytes=w.Uint8Array.from(bytes);await w.eval(`loadFile({name:${JSON.stringify(name)},arrayBuffer:async()=>testBytes.buffer},dicomParser.parseDicom(testBytes))`);await tick();}
(async()=>{
 const tabs=w.document.querySelectorAll('.analysis-tab');assert.equal(tabs.length,2);tabs[1].click();assert(!$('analysisPanel').hidden);assert(!$('analysisEmpty').hidden);
 await load(fs.readFileSync(require('node:path').join(require('node:os').tmpdir(),'gantry-dynamic-test.dcm')),'dynamic.dcm');
 assert(!$('analysisContent').hidden);assert.equal($('dynamicCorrection').parentNode.id,'analysisDynamic');
 assert.equal($('analysisFrames').children.length,5);assert.equal($('analysisFrames').querySelectorAll('.guide-x').length,5);
 $('analysisX').value='16';$('analysisX').dispatchEvent(new w.Event('input'));assert.equal($('analysisPanel').style.getPropertyValue('--guide-x'),'25%');
 $('analysisFrames').children[2].click();assert.equal($('frame-0').value,'4');assert.equal($('frame-1').value,'5');
 const original=w.eval('Array.from(pixels)');
 $('corrX').value='2';$('corrY').value='0';$('corrApply').click();await tick();
 assert(raster.get('analysisSelected')[0]===0,'Translated edge is blank');assert.deepEqual(w.eval('Array.from(pixels)'),original);
 assert($('analysisFrames').children[2].textContent.includes('X 2 / Y 0'));
 $('corrDetector').value='1';$('corrDetector').dispatchEvent(new w.Event('change'));await tick();
 assert($('analysisSelectedLabel').textContent.includes('D2'));assert($('analysisFrames').children[2].textContent.includes('X 0 / Y 0'),'D1 shift does not leak into D2');
 tabs[0].click();assert($('analysisPanel').hidden);assert(!$('acquisition-panel').hidden);tabs[1].click();
 // Produce two real single-frame instances, one per detector.
 for(const name of ['bone_acquisition_store','processing_dicom'])w.eval(fs.readFileSync('scripts/'+name+'.js','utf8'));
 w.eval(`var staticRecord={version:1,id:'roi-test',createdAt:1700000000000,n:64,height:64,kind:'static',study:'bone',finished:true,mode:'time',target:60,names:['AP','PA'],
 heads:[1,2].map(detector=>({detector,counts:new Uint32Array(4096).fill(100),total:409600,elapsed:60,done:true})),
 mdp:{start:{activityMBq:740,seconds:7200}},processing:{first:{settings:{collimator:'LEHR',energyCenter:140,windowWidth:20,zoom:1},detectors:[{view:'AP'},{view:'PA'}]}}};`);
 const files=await w.GANTRY_PROCESSING_DICOM.files(w.staticRecord,'2.25.555');
 files.forEach((file,i)=>fs.writeFileSync(require('node:path').join(require('node:os').tmpdir(),'gantry-static-roi-'+i+'.dcm'),new w.Uint8Array(file.bytes)));
 for(let i=0;i<files.length;i++)await load(new w.Uint8Array(files[i].bytes),'static-'+i+'.dcm');
 assert.equal(w.eval('currentMode'),'static');assert(!$('analysisStatic').hidden);assert($('analysisFrames').hidden);assert.equal($('roiImage').options.length,2);
 $('roiImage').value='0';$('roiImage').dispatchEvent(new w.Event('change'));
 const staticOriginal=w.eval('Array.from(pixels)');$('analysisSelected').getBoundingClientRect=()=>({left:10,top:20,width:128,height:128});
 const draw=$('analysisDraw');draw.onpointerdown({clientX:10,clientY:20,pointerId:1,preventDefault(){}});draw.onpointermove({clientX:74,clientY:84});draw.onpointerup({clientX:74,clientY:84});
 assert($('analysisStatus').textContent.startsWith('1 ROI'));assert($('analysisStatus').textContent.includes('102.400'));
 assert.equal(raster.get('analysisSelected')[0],0);assert(raster.get('analysisSelected')[63*4]>0);
 assert.deepEqual(w.eval('Array.from(pixels)'),staticOriginal,'Mask never modifies original acquired counts');
 $('roiImage').value='1';$('roiImage').dispatchEvent(new w.Event('change'));assert($('analysisStatus').textContent.startsWith('0 ROI'));assert(raster.get('analysisSelected')[0]>0);
 $('roiImage').value='0';$('roiImage').dispatchEvent(new w.Event('change'));assert.equal(raster.get('analysisSelected')[0],0);
 $('roiOriginal').checked=true;$('roiOriginal').dispatchEvent(new w.Event('change'));assert(raster.get('analysisSelected')[0]>0);
 $('roiOriginal').checked=false;$('roiOriginal').dispatchEvent(new w.Event('change'));assert.equal(raster.get('analysisSelected')[0],0);
 tabs[0].click();tabs[1].click();assert($('analysisStatus').textContent.startsWith('1 ROI'),'Reopening preserves mask');
 assert(Object.keys(w.localStorage).some(k=>k.startsWith('gantry.roi.')));
 $('roiUndo').click();assert($('analysisStatus').textContent.startsWith('0 ROI'));assert(raster.get('analysisSelected')[0]>0);
 // Whole-body images use rectangular native coordinates, with independent masks per detector.
 w.eval(`var wholeRecord={...staticRecord,id:'whole-mask-test',kind:'whole',n:128,height:512,mode:'scan',target:160,
 scan:{velocity:10,contours:'auto',travel:160},
 heads:[1,2].map(detector=>({detector,counts:new Uint32Array(128*512).fill(100),total:128*512*100,elapsed:960,done:true}))};`);
 const wholeFiles=await w.GANTRY_PROCESSING_DICOM.files(w.wholeRecord,'2.25.556');
 for(let i=0;i<wholeFiles.length;i++)await load(new w.Uint8Array(wholeFiles[i].bytes),'whole-'+i+'.dcm');
 assert.equal(w.eval('currentMode'),'whole');assert(!$('analysisStatic').hidden);
 assert.equal($('roiImage').options.length,2);
 $('roiImage').value='0';$('roiImage').dispatchEvent(new w.Event('change'));
 const wholeOriginal=w.eval('Array.from(pixels)');
 $('analysisSelected').getBoundingClientRect=()=>({left:10,top:20,width:256,height:1024});
 draw.onpointerdown({clientX:10,clientY:20,pointerId:2,preventDefault(){}});
 draw.onpointermove({clientX:138,clientY:532});draw.onpointerup({clientX:138,clientY:532});
 assert.equal(raster.get('analysisSelected')[0],0);
 assert(raster.get('analysisSelected')[(511*128+127)*4]>0,'Lower end of the scan remains visible');
 assert($('analysisStatus').textContent.includes('1.638.400'),'Mask uses 64 by 256 native pixels');
 $('roiImage').value='1';$('roiImage').dispatchEvent(new w.Event('change'));
 assert($('analysisStatus').textContent.startsWith('0 ROI'));assert(raster.get('analysisSelected')[0]>0);
 $('roiImage').value='0';$('roiImage').dispatchEvent(new w.Event('change'));
 assert.equal(raster.get('analysisSelected')[0],0);
 $('roiOriginal').checked=true;$('roiOriginal').dispatchEvent(new w.Event('change'));assert(raster.get('analysisSelected')[0]>0);
 $('roiOriginal').checked=false;$('roiOriginal').dispatchEvent(new w.Event('change'));
 tabs[0].click();tabs[1].click();assert.equal(raster.get('analysisSelected')[0],0);
 $('roiUndo').click();assert(raster.get('analysisSelected')[0]>0);
 $('roiShape').value='ellipse';$('roiMode').value='keep';
 draw.onpointerdown({clientX:10,clientY:20,pointerId:3,preventDefault(){}});
 draw.onpointerup({clientX:266,clientY:1044});
 assert.equal(raster.get('analysisSelected')[0],0);assert(raster.get('analysisSelected')[(256*128+64)*4]>0);
 $('roiReset').click();assert(raster.get('analysisSelected')[0]>0);
 assert.deepEqual(w.eval('Array.from(pixels)'),wholeOriginal,'Whole-body originals stay immutable');
 // A hot region must stop dominating the display window once masked.
 w.eval(`var contrastRecord={...wholeRecord,id:'whole-mask-contrast',heads:[1,2].map(detector=>{
  const counts=new Uint32Array(128*512).fill(10*detector);counts[0]=1000*detector;counts[counts.length-1]=0;
  return {detector,counts,total:counts.reduce((a,b)=>a+b,0),elapsed:960,done:true};})};`);
 const contrastFiles=await w.GANTRY_PROCESSING_DICOM.files(w.contrastRecord,'2.25.557');
 for(let i=0;i<contrastFiles.length;i++)await load(new w.Uint8Array(contrastFiles[i].bytes),'contrast-'+i+'.dcm');
 $('roiImage').value='0';$('roiImage').dispatchEvent(new w.Event('change'));
 assert.equal(Number($('analysisWindow').value),1001);
 const dimPixel=raster.get('analysisSelected')[(400*128+100)*4];
 $('analysisSelected').getBoundingClientRect=()=>({left:0,top:0,width:128,height:512});
 $('roiShape').value='rectangle';$('roiMode').value='exclude';
 const maskHotspot=()=>{draw.onpointerdown({clientX:0,clientY:0,pointerId:4,preventDefault(){}});draw.onpointerup({clientX:64,clientY:256});};
 maskHotspot();
 assert.equal(Number($('analysisWindow').value),11);assert.equal(Number($('analysisLevel').value),5);
 assert(raster.get('analysisSelected')[(400*128+100)*4]>dimPixel,'Visible tissue brightens after excluding the hot region');
 $('analysisWindow').value='50';$('analysisWindow').dispatchEvent(new w.Event('input'));await tick();
 assert.equal(Number($('analysisWindow').value),50,'Manual changes survive redraws while the mask is unchanged');
 $('roiOriginal').checked=true;$('roiOriginal').dispatchEvent(new w.Event('change'));assert.equal(Number($('analysisWindow').value),1001);
 $('roiOriginal').checked=false;$('roiOriginal').dispatchEvent(new w.Event('change'));assert.equal(Number($('analysisWindow').value),11);
 $('roiImage').value='1';$('roiImage').dispatchEvent(new w.Event('change'));assert.equal(Number($('analysisWindow').value),2001);
 $('roiImage').value='0';$('roiImage').dispatchEvent(new w.Event('change'));assert.equal(Number($('analysisWindow').value),11);
 $('roiUndo').click();assert.equal(Number($('analysisWindow').value),1001);
 maskHotspot();$('roiReset').click();assert.equal(Number($('analysisWindow').value),1001);
 draw.onpointerdown({clientX:0,clientY:0,pointerId:5,preventDefault(){}});draw.onpointerup({clientX:128,clientY:512});
 assert.equal(Number($('analysisWindow').value),1);assert.equal(Number($('analysisLevel').value),.5);
 assert.equal(raster.get('analysisSelected')[0],0,'Fully hidden images do not turn white or produce invalid levels');
 const R=w.GANTRY_ROI,image=new w.Float64Array(16).fill(1),ellipse={shape:'ellipse',mode:'keep',x0:0,y0:0,x1:4,y1:4};
 const kept=R.apply(image,4,4,[ellipse]);assert.equal(kept.removed,4);assert.equal(kept.counts[0],0);assert.equal(kept.counts[5],1);assert.equal(image[0],1);
 assert.equal(kept.min,1,'Artificial zeros outside a keep mask are excluded from window statistics');assert.equal(kept.max,1);assert.equal(kept.visiblePixels,12);
 assert.throws(()=>R.apply(image,4,4,[{...ellipse,x1:NaN}]));
 assert.deepEqual(errors,[]);dom.window.close();console.log('OK: analysis tab, all frames, common guides, selection/correction per detector, reversible native-coordinate ROI, persistence and immutable original pixels.');
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});
