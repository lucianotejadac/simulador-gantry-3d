/* Actual packaged viewer in jsdom; canvas rasterization/layout is not tested. */
const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM,VirtualConsole}=require('jsdom');
const errors=[],consoleStub=new VirtualConsole();consoleStub.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(fs.readFileSync('processing/index.html','utf8'),{url:'http://local/processing/',runScripts:'dangerously',virtualConsole:consoleStub,beforeParse(w){
 w.TextDecoder=TextDecoder;w.TextEncoder=TextEncoder;w.structuredClone=structuredClone;
 w.HTMLCanvasElement.prototype.getContext=function(){return {createImageData:(x,y)=>({data:new w.Uint8ClampedArray(x*y*4)}),putImageData(){},drawImage(){},fillRect(){},clearRect(){},save(){},restore(){},setTransform(){},scale(){},translate(){},rotate(){},strokeRect(){},fillText(){},measureText:()=>({width:10})};};
 w.HTMLCanvasElement.prototype.toDataURL=()=>'';w.URL.createObjectURL=()=>'';w.URL.revokeObjectURL=()=>{};
 }}),w=dom.window,$=id=>w.document.getElementById(id);
(async()=>{
 const bytes=fs.readFileSync(require('node:path').join(require('node:os').tmpdir(),'gantry-dynamic-test.dcm'));
 w.testBytes=w.Uint8Array.from(bytes);
 await w.eval("loadFile({name:'dynamic-test.dcm',arrayBuffer:async()=>testBytes.buffer},dicomParser.parseDicom(testBytes))");
 assert.equal(w.eval('currentMode'),'dynamic', $('status-text').textContent);
 assert.equal(w.eval('dynamicSteps.length'),5);assert.equal($('frame-0').options.length,6);assert.equal($('frame-1').options.length,6);
 assert(!$('dynamicCorrection').hidden);assert.equal(w.eval('frameDuration(8)'),4000);
 const original=w.eval('Array.from(pixels)');
 $('dyn-slider').value='2';$('dyn-slider').dispatchEvent(new w.Event('input'));
 assert.equal($('frame-0').value,'4');assert.equal($('frame-1').value,'5');
 $('corrX').value='2';$('corrY').value='-1';$('corrApply').click();
 assert($('caption-0').textContent.includes('corregida'));assert(!$('caption-1').textContent.includes('corregida'));
 assert.deepEqual(w.eval('Array.from(pixels)'),original,'Rendering correction leaves source counts unchanged');
 $('corrView').value='original';$('corrView').dispatchEvent(new w.Event('change'));assert(!$('caption-0').textContent.includes('corregida'));
 $('corrView').value='corrected';$('corrView').dispatchEvent(new w.Event('change'));assert($('caption-0').textContent.includes('corregida'));
 $('corrReset').click();assert(!$('caption-0').textContent.includes('corregida'));
 assert.deepEqual(errors,[]);dom.window.close();console.log('OK: packaged dynamic viewer, dual-head synchronized playback, frame duration, per-frame correction, comparison and immutable originals.');
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});
