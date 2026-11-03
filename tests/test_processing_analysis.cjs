/* Packaged DOM and real DICOM integration. Raster buffers are captured at the
   canvas boundary; source data, detector isolation and pointer coordinates are tested. */
const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM,VirtualConsole}=require('jsdom');
const errors=[],raster=new Map(),vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(fs.readFileSync('processing/index.html','utf8'),{url:'http://local/processing/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
 w.TextDecoder=TextDecoder;w.TextEncoder=TextEncoder;w.structuredClone=structuredClone;Object.defineProperty(w,'crypto',{value:require('node:crypto').webcrypto});
 w.HTMLCanvasElement.prototype.getContext=function(){const id=this.id,canvas=this;return {createImageData:(x,y)=>({data:new w.Uint8ClampedArray(x*y*4)}),putImageData(img){canvas.testRaster=img.data.slice();raster.set(id,canvas.testRaster);},drawImage(){},fillRect(){},clearRect(){},save(){},restore(){},setTransform(){},scale(){},translate(){},rotate(){},strokeRect(){},stroke(){},strokeText(){},moveTo(){},lineTo(){},closePath(){},ellipse(){},fillText(){},beginPath(){},rect(){},clip(){},measureText:()=>({width:10})};};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
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
 assert.equal($('roiThresholdSlider').min,'0');assert.equal($('roiThresholdSlider').max,'1000');
 $('analysisWindowSlider').value='50';$('analysisWindowSlider').dispatchEvent(new w.Event('input'));await tick();assert.equal($('analysisWindow').value,'50');
 $('analysisLevel').value='25.5';$('analysisLevel').dispatchEvent(new w.Event('input'));assert.equal($('analysisLevelSlider').value,'25.5');
 $('roiThreshold').value='1000';$('roiThreshold').dispatchEvent(new w.Event('input'));assert.equal($('roiThresholdSlider').max,'1000');assert.equal($('roiThresholdSlider').value,'1000');
 $('roiThresholdSlider').value=String(Math.sqrt(20*Number($('roiThresholdSlider').max)));$('roiThresholdSlider').dispatchEvent(new w.Event('input'));assert.equal($('roiThreshold').value,'20');
 const staticOriginal=w.eval('Array.from(pixels)');$('analysisSelected').getBoundingClientRect=()=>({left:10,top:20,width:128,height:128});
 $('roiMask').click();assert.equal($('roiMode').value,'exclude');assert(!$('roiMaskMode').hidden);
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
 // Polygon clicks persist and threshold masks use native counts, not display brightness.
 $('roiShape').value='polygon';$('roiShape').dispatchEvent(new w.Event('change'));
 for(const [clientX,clientY] of [[10,20],[74,20],[74,84],[10,84]])draw.onpointerdown({clientX,clientY,preventDefault(){}});
 draw.onpointermove({clientX:90,clientY:100});assert($('roiPolygon').querySelector('polyline').getAttribute('points').endsWith('40,40'));assert.equal($('roiPolygon').querySelector('polyline').getAttribute('stroke'),'#ff2020');
 assert(!$('roiPolygon').hasAttribute('hidden'),'SVG trace is visible while drawing');assert(!$('roiFinish').disabled);$('roiFinish').click();assert($('analysisStatus').textContent.startsWith('1 ROI'));
 assert.equal(raster.get('analysisSelected')[0],0);assert(raster.get('analysisSelected')[63*4]>0);
 $('roiUndo').click();$('roiShape').value='threshold';$('roiShape').dispatchEvent(new w.Event('change'));$('roiThreshold').value='101';
 for(const [clientX,clientY] of [[10,20],[74,20],[74,84],[10,84]])draw.onpointerdown({clientX,clientY,preventDefault(){}});
 $('roiFinish').click();assert(raster.get('analysisSelected')[0]>0,'100 counts below threshold stay visible');
 $('roiUndo').click();$('roiThreshold').value='100';
 for(const [clientX,clientY] of [[10,20],[74,20],[74,84],[10,84]])draw.onpointerdown({clientX,clientY,preventDefault(){}});
 $('roiFinish').click();assert.equal(raster.get('analysisSelected')[0],0,'Threshold includes equal counts');assert($('roiSavedOutlines').querySelector('path').getAttribute('d').length>0);
 $('roiThreshold').value='101';$('roiThreshold').dispatchEvent(new w.Event('input'));assert(raster.get('analysisSelected')[0]>0,'Existing ROI reacts to edited threshold');assert.equal($('roiSavedOutlines').querySelector('path').getAttribute('d'),'','No contour when no pixels meet threshold');
 $('roiThresholdSlider').value=String(Math.sqrt(100*Number($('roiThresholdSlider').max)));$('roiThresholdSlider').dispatchEvent(new w.Event('input'));assert.equal(raster.get('analysisSelected')[0],0,'Existing ROI reacts to slider');
 assert.equal($('analysisLevelSlider').min,'-1000');
 assert.deepEqual(w.eval('Array.from(pixels)'),staticOriginal);
 const polygonMask={shape:'threshold',mode:'keep',threshold:50,points:[{x:0,y:0},{x:2,y:0},{x:2,y:2},{x:0,y:2}]};
 assert.deepEqual(Array.from(w.GANTRY_ROI.apply([10,50,100,20],2,2,[polygonMask]).counts),[0,50,100,0]);
 assert(w.GANTRY_ROI.valid(JSON.parse(JSON.stringify(polygonMask)),2,2));
 $('roiUndo').click();$('roiShape').value='rectangle';$('roiShape').dispatchEvent(new w.Event('change'));
 const contourRoi={shape:'threshold',mode:'measure',threshold:3,points:[{x:0,y:0},{x:2,y:0},{x:2,y:2},{x:0,y:2}]};
 const shape=w.GANTRY_ROI.contour([1,2,3,4],2,2,contourRoi);assert.equal((shape.match(/M/g)||[]).length,6,'Two adjacent selected pixels have six exterior edges');assert(!shape.includes('M1 1v1'),'No internal edge between selected pixels');
 assert.equal(w.GANTRY_ROI.contour([1,2,3,4],2,2,{...contourRoi,threshold:5}),'');
 // Named measurement ROI preserves pixels and supports later renaming / use changes.
 $('roiAdd').click();assert.equal($('roiMode').value,'measure');assert($('roiMaskMode').hidden);$('roiName').value='Renal derecha';
 const beforeMeasure=Array.from(raster.get('analysisSelected'));
 draw.onpointerdown({clientX:10,clientY:20,pointerId:3,preventDefault(){}});draw.onpointerup({clientX:74,clientY:84});
 assert.deepEqual(Array.from(raster.get('analysisSelected')),beforeMeasure,'Measuring does not mask image');
 assert($('roiMeasurements').textContent.includes('102.400'));assert($('roiSavedOutlines').textContent.includes('Renal derecha'));
 const colorInput=$('roiMeasurements').querySelector('input[type=color]');colorInput.value='#00cfff';colorInput.dispatchEvent(new w.Event('input'));
 assert.equal($('roiSavedOutlines').querySelector('rect').getAttribute('stroke'),'#00cfff');assert(Object.values(w.localStorage).some(v=>v.includes('#00cfff')));
 const rename=$('roiMeasurements').querySelector('input');rename.value='Renal editada';rename.dispatchEvent(new w.Event('change'));
 assert($('roiSavedOutlines').textContent.includes('Renal editada'));assert(Object.values(w.localStorage).some(v=>v.includes('Renal editada')));
 const metric=w.GANTRY_ROI.measure([1,2,3,4],2,2,{shape:'rectangle',mode:'measure',x0:0,y0:0,x1:2,y1:2},[2,3]);
 assert.equal(metric.total,10);assert.equal(metric.mean,2.5);assert.equal(metric.max,4);assert.equal(metric.pixels,4);assert.equal(metric.areaMm2,24);
 const limited=w.GANTRY_ROI.measure([1,2,3,4],2,2,{...polygonMask,mode:'measure',threshold:3},null);
 assert.equal(limited.total,7);assert.equal(limited.pixels,2);assert.equal(limited.areaMm2,null);
 const use=$('roiMeasurements').querySelector('select');use.value='exclude';use.dispatchEvent(new w.Event('change'));assert.equal(raster.get('analysisSelected')[0],0);
 $('roiUndo').click();$('roiMode').value='exclude';
 // The second ROI traces in its final color and closes once on browser double-click sequence.
 $('roiAdd').click();draw.onpointerdown({clientX:10,clientY:20,detail:1,pointerId:7,preventDefault(){}});draw.onpointerup({clientX:30,clientY:40});
 $('roiShape').value='polygon';$('roiShape').dispatchEvent(new w.Event('change'));
 for(const [clientX,clientY] of [[10,20],[74,20],[74,84]])draw.onpointerdown({clientX,clientY,detail:1,preventDefault(){}});
 const traceColor=$('roiPolygon').querySelector('polyline').getAttribute('stroke');assert.equal(traceColor,'#00cfff');
 draw.onpointerdown({clientX:74,clientY:84,detail:2,preventDefault(){}});draw.ondblclick({clientX:74,clientY:84,detail:2,preventDefault(){}});
 assert($('analysisStatus').textContent.startsWith('2 ROI'));assert($('roiPolygon').hasAttribute('hidden'));
 const finalPolygon=$('roiSavedOutlines').querySelector('polygon');assert.equal(finalPolygon.getAttribute('stroke'),traceColor);assert.equal(finalPolygon.getAttribute('points').split(' ').length,3);
 $('roiReset').click();$('roiShape').value='rectangle';$('roiShape').dispatchEvent(new w.Event('change'));$('roiMask').click();
 const targetROI={shape:'rectangle',mode:'measure',x0:0,y0:0,x1:1,y1:2},bgROI={shape:'rectangle',mode:'background',x0:0,y0:0,x1:2,y1:2};
 const bg=w.GANTRY_ROI.background([10,2,20,4],2,2,targetROI,bgROI,[1,1]);assert.equal(bg.background.pixels,2);assert.equal(bg.background.mean,3);assert.equal(bg.estimated,6);assert.equal(bg.net,24);
 assert.equal(w.GANTRY_ROI.background([10,2,20,4],2,2,targetROI,targetROI,null).net,null,'Empty background must not be treated as zero');
 $('roiBackground').click();assert($('analysisStatus').textContent.includes('Primero'));
 $('roiAdd').click();draw.onpointerdown({clientX:30,clientY:40,pointerId:9,preventDefault(){}});draw.onpointerup({clientX:70,clientY:80});
 $('roiBackground').click();assert($('backgroundCreate').closest('dialog').open);assert.equal($('backgroundReference').options.length,1);$('backgroundCreate').click();
 assert(!$('backgroundCreate').closest('dialog').open);assert($('roiMeasurements').querySelector('[aria-label="ROI de referencia del fondo 2"]'));const initialBand=$('roiSavedOutlines').querySelector('path').getAttribute('d');
 draw.onpointerdown({clientX:40,clientY:50,pointerId:10,preventDefault(){}});draw.onpointermove({clientX:50,clientY:50});draw.onpointerup({clientX:50,clientY:50});assert.notEqual($('roiSavedOutlines').querySelector('path').getAttribute('d'),initialBand);assert(Object.values(w.localStorage).some(v=>v.includes('"dx":5')));
 const band=w.GANTRY_ROI.autoBackground(new Uint32Array(225).fill(10),15,15,{...targetROI,id:'organ',x0:5,y0:5,x1:8,y1:8});assert(w.GANTRY_ROI.valid(JSON.parse(JSON.stringify(band)),15,15));assert(band.cells.length>0);assert(!band.cells.includes(6*15+6));assert.equal(band.targetId,'organ');
 const organ={...targetROI,id:'organ',x0:5,y0:5,x1:8,y1:8},bandImage=new Uint32Array(225).fill(10);
 const crescent=w.GANTRY_ROI.autoBackground(bandImage,15,15,organ,1,2,50,0);
 assert(crescent.cells.length>0&&crescent.cells.length<band.cells.length);assert(crescent.cells.every(i=>i%15+.5>=6.5));assert.equal(crescent.coverage,50);
 const left=w.GANTRY_ROI.autoBackground(bandImage,15,15,organ,1,2,25,180);assert(left.cells.every(i=>i%15+.5<=6.5));assert(left.cells.length<crescent.cells.length);
 $('roiBackground').click();$('backgroundCoverage').value='50';$('backgroundAngle').value='180';$('backgroundCreate').click();assert($('roiSavedOutlines').textContent.includes('Fondo media luna'));
 $('roiReset').click();$('roiMask').click();

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
 // Copy masked processing, not raw pixels, into a manually added flexible-page image.
 $('roiReset').click();maskHotspot();
 $('analysisWindow').value='33';$('analysisLevel').value='9.5';$('analysisWindow').dispatchEvent(new w.Event('input'));await tick();
 $('roiOriginal').checked=true;$('roiOriginal').dispatchEvent(new w.Event('change'));
 w.openFlexible();$('header-close').click();
 const addUID=uid=>{
  $('flex-add-images').click();
  for(const box of $('flex-picker-list').querySelectorAll('input')){box.checked=box.value.startsWith(uid+':');box.dispatchEvent(new w.Event('change'));}
  $('flex-pick-submit').click();
 };
 // Transfer the selected detector without mixing its masks with detector 2.
 const sourceUID=w.eval('flex.assets.filter(a=>a.kind==="whole").find(a=>a.series===dataset.string("x0020000e")&&a.detector===1).uid');
 addUID(sourceUID);
 const item=w.eval('flexItem()'),asset=w.eval('flexAsset(flexItem())');
 assert.equal(item.roiMasks.length,1);assert.equal(item.window,33);assert.equal(item.level,9.5);
 assert(item.roiAnnotations.length>0,'Flexible images include their named ROI contours');
 const savedAnnotations=JSON.stringify(item.roiAnnotations);
 const strokes=[],labels=[],transforms=[];
 const roiContext={save(){},restore(){},translate(...args){transforms.push(args);},scale(...args){transforms.push(args);},beginPath(){},moveTo(){},lineTo(){},closePath(){},ellipse(){},rect(){},stroke(){strokes.push(this.strokeStyle);},strokeText(){},fillText(text){labels.push(text);}};
 w.GANTRY_PROCESSING_ANALYSIS.drawFlexibleRois(roiContext,item,asset,10,20,200,800);
 assert.deepEqual(transforms[0],[10,20]);assert.equal(strokes[0],item.roiAnnotations[0].color);assert.equal(labels[0],item.roiAnnotations[0].name);
 assert.equal(item.invert,false,'Copy the processed display contrast even when Ver original was used temporarily');
 const pageRaster=w.eval('rasterFlexible(flexItem()).testRaster');
 assert.equal(pageRaster[0],0);assert(pageRaster[(400*128+100)*4]>0);
 item.invert=true;
 assert.equal(w.eval('rasterFlexible(flexItem()).testRaster')[0],255,'Inverted masked areas remain white regardless of contrast');
 item.invert=false;
 assert.equal(asset.data[0],1000,'Original asset pixels are unchanged');
 assert.equal(w.eval('projectPages().at(-1).items.at(-1).roiMasks.length'),1,'Project serialization includes the ROI snapshot');
 tabs[1].click();$('roiReset').click();
 assert.equal(item.roiMasks.length,1,'Later analysis edits do not silently rewrite the composed page');
 assert.equal(JSON.stringify(item.roiAnnotations),savedAnnotations,'Page contours remain an independent snapshot');
 w.openFlexible();addUID(sourceUID);
 assert.equal(w.eval('flexItem().roiMasks'),undefined,'Adding after removing ROI uses the original');
 w.eval('Object.assign(flexItem(),{window:33,level:9.5,invert:false})');
 assert(w.eval('rasterFlexible(flexItem()).testRaster')[0]>0,'Raster cache distinguishes masked and original copies');
 // The same handoff applies to square static images.
 for(let i=0;i<files.length;i++)await load(new w.Uint8Array(files[i].bytes),'static-mask-'+i+'.dcm');
 tabs[1].click();$('roiImage').value='0';$('roiImage').dispatchEvent(new w.Event('change'));
 $('analysisSelected').getBoundingClientRect=()=>({left:0,top:0,width:64,height:64});
 draw.onpointerdown({clientX:0,clientY:0,pointerId:6,preventDefault(){}});draw.onpointerup({clientX:32,clientY:32});
 const staticUID=w.eval('flex.assets.find(a=>a.kind==="static"&&a.detector===1).uid');
 w.openFlexible();addUID(staticUID);
 assert.equal(w.eval('flexItem().roiMasks.length'),1);assert.equal(w.eval('rasterFlexible(flexItem()).testRaster')[0],0);
 // Insert the selected acquisition's quantitative snapshot, including both detectors.
 $('flex-add-measurements').click();assert($('flex-measurements-dialog').open);
 assert(!$('flex-measurements-insert').disabled);
 const assets=w.eval('flex.assets.filter(a=>a.acquisitionId==="roi-test")');
 assert.equal(new Set(assets.map(a=>a.acquisitionDetector)).size,2,'Acquisition identity groups the two detector instances');
 const expected=w.GANTRY_PROCESSING_ANALYSIS.measurementRows(assets.find(a=>a.acquisitionDetector===1));
 $('flex-measurements-insert').click();assert(!$('flex-measurements-dialog').open);
 const table=w.eval('flexPage().texts.at(-1)');assert.equal(table.measurementTable.acquisitionId,'roi-test');
 assert(w.eval('flexPage().items.at(-1).roiAnnotations.length>0'),'Summary insertion includes the image with ROI');
 assert.equal(table.measurementTable.rows.find(r=>r.detector===1).total,expected[0].total);
 assert(table.w<=1200&&table.h>0,'Table fits the printable page');
 assert.equal($('flex-text-remove').textContent,'Quitar tabla');assert($('flex-text-edit').disabled);
 assert(w.eval('projectPages().at(-1).texts.at(-1).measurementTable'),'Project contains the serializable table');
 w.eval('drawFlexible(document.createElement("canvas"),true)');
 const snapshot=JSON.stringify(table.measurementTable);
 tabs[1].click();$('roiReset').click();assert.equal(JSON.stringify(table.measurementTable),snapshot,'Later ROI edits preserve inserted measurements');
 w.openFlexible();$('flex-add-measurements').click();$('flex-measurements-cancel').click();assert(!$('flex-measurements-dialog').open);
 // The acquisition menu opens differential calculation for the selected acquisition.
 tabs[1].click();$('roiAdd').click();$('roiShape').value='rectangle';$('roiShape').onchange();
 for(const x of [2,34]){draw.onpointerdown({clientX:x,clientY:2,pointerId:7,preventDefault(){}});draw.onpointerup({clientX:x+20,clientY:22});}
 const differentialOption=[...$('processingAcquireMenu').options].find(o=>o.value==='differential');assert(differentialOption&&!differentialOption.disabled);
 $('processingAcquireMenu').value='differential';$('processingAcquireMenu').dispatchEvent(new w.Event('change'));assert(!$('differential-dialog').hidden);
 assert.equal($('differential-dialog').tagName,'SECTION');assert.equal($('analysisPreviews').nextElementSibling,$('differential-dialog'),'Calculation is inline below the image and ROI measurements');
 const diffSelects=$('differential-views').querySelectorAll('select');
 diffSelects[0].value='0';diffSelects[0].dispatchEvent(new w.Event('change'));
 diffSelects[1].value=diffSelects[1].options[1].value;diffSelects[1].dispatchEvent(new w.Event('change'));
 diffSelects[3].value=diffSelects[3].options[2].value;diffSelects[3].dispatchEvent(new w.Event('change'));
 $('differential-calculate').click();assert.equal($('differential-error').textContent,'');assert.equal(w.GANTRY_DIFFERENTIAL.lastResult.right,50);
 assert($('differential-result').textContent.includes('Izquierdo: 50 %'));$('differential-close').click();assert($('differential-dialog').hidden);
 $('roiDifferential').click();assert(!$('differential-dialog').hidden);assert(!$('analysisPanel').hidden,'ROI shortcut keeps the analysis workspace open');$('differential-close').click();
 // ROI created after opening the calculation appears without reopening it.
 $('roiReset').click();$('roiDifferential').click();assert.equal($('differential-rois'),null);
 const liveDiff=$('differential-views').querySelectorAll('select');liveDiff[0].value='0';liveDiff[0].dispatchEvent(new w.Event('change'));
 assert.equal(liveDiff[1].options.length,1);
 for(const x of [2,34]){draw.onpointerdown({clientX:x,clientY:2,pointerId:8,preventDefault(){}});draw.onpointerup({clientX:x+20,clientY:22});}
 assert.equal(liveDiff[1].options.length,3,'New ROI immediately populate the open calculation');
 liveDiff[1].value=liveDiff[1].options[1].value;liveDiff[1].dispatchEvent(new w.Event('change'));
 liveDiff[3].value=liveDiff[3].options[2].value;liveDiff[3].dispatchEvent(new w.Event('change'));
 const selectedRight=liveDiff[1].value;
 $('differential-calculate').click();assert.equal(w.GANTRY_DIFFERENTIAL.lastResult.right,50);
 const liveName=$('roiMeasurements').querySelector('input');liveName.value='Renal actualizada';liveName.dispatchEvent(new w.Event('change'));
 assert.equal(liveDiff[1].value,selectedRight,'Editing ROI preserves the renal assignment');
 assert.equal(liveDiff[1].selectedOptions[0].textContent,'Renal actualizada');
 assert.equal($('differential-result').textContent,'','ROI edits invalidate previous results');
 $('roiUndo').click();assert.equal(liveDiff[3].value,'','Deleting an assigned ROI clears its selection');
 assert.equal(liveDiff[1].value,selectedRight);$('differential-close').click();
 const R=w.GANTRY_ROI,image=new w.Float64Array(16).fill(1),ellipse={shape:'ellipse',mode:'keep',x0:0,y0:0,x1:4,y1:4};
 const kept=R.apply(image,4,4,[ellipse]);assert.equal(kept.removed,4);assert.equal(kept.counts[0],0);assert.equal(kept.counts[5],1);assert.equal(image[0],1);
 assert.equal(kept.min,1,'Artificial zeros outside a keep mask are excluded from window statistics');assert.equal(kept.max,1);assert.equal(kept.visiblePixels,12);
 assert.throws(()=>R.apply(image,4,4,[{...ellipse,x1:NaN}]));
 assert.deepEqual(errors,[]);dom.window.close();console.log('OK: analysis tab, all frames, common guides, selection/correction per detector, reversible native-coordinate ROI, persistence and immutable original pixels.');
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});
