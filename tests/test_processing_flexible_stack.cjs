const fs=require('node:fs'),assert=require('node:assert/strict'),{JSDOM,VirtualConsole}=require('jsdom');
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(fs.readFileSync('processing/index.html','utf8'),{url:'http://local/processing/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
 w.TextDecoder=TextDecoder;w.TextEncoder=TextEncoder;w.structuredClone=structuredClone;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.HTMLCanvasElement.prototype.getContext=()=>({createImageData:(x,y)=>({data:new w.Uint8ClampedArray(x*y*4)}),putImageData(){},drawImage(){},fillRect(){},clearRect(){},save(){},restore(){},setTransform(){},scale(){},translate(){},rotate(){},strokeRect(){},fillText(){},beginPath(){},rect(){},clip(){},measureText:()=>({width:10})});
 w.HTMLCanvasElement.prototype.toDataURL=()=>'';
}}),w=dom.window,$=id=>w.document.getElementById(id);
try{
 w.eval(`flex.assets=[['square',64,64,'static'],['whole-small',128,512,'whole'],['whole-large',256,1024,'whole']].map(([id,cols,rows,kind])=>({
   id,uid:id,study:'study',series:id,kind,seriesName:id,filename:id,frame:0,meta:{patient:'Simulado',exam:'Prueba',date:'',institution:''},
   data:new Uint32Array(cols*rows).fill(10),cols,rows,spacing:[1,1],projection:'AP',window:20,level:10,mono1:false,duration:1000,sum:cols*rows*10}));
   openFlexible();`);
 $('header-close').click();
 const pages=()=>JSON.parse(w.eval('JSON.stringify(flex.pages)'));
 const add=ids=>{
  $('flex-add-images').click();
  for(const box of $('flex-picker-list').querySelectorAll('input')){box.checked=ids.includes(box.value);box.dispatchEvent(new w.Event('change'));}
  $('flex-pick-submit').click();
 };
 assert.equal(pages()[0].items.length,0);
 add(['square','whole-small','whole-large']);
 const initial=pages()[0].items;
 assert.deepEqual(initial.map(i=>[i.w,i.h]),[[360,360],[160,640],[160,640]]);
 assert.deepEqual(initial.map(i=>i.x),[24,46,68]);
 assert.equal(w.eval('flex.selected'),initial.at(-1).id,'The top image is selected');
 assert(initial[1].x<initial[0].x+initial[0].w,'Images overlap instead of automatically filling a grid');
 assert(initial.every(i=>i.y>=110&&i.y+i.h<=872),'Frames fit within the page');
 for(let i=0;i<7;i++)add(['square']);
 assert.equal(pages().length,1,'Adding more than eight images keeps the selected page');
 assert.equal(pages()[0].items.length,10);
 assert.deepEqual(pages()[0].items.slice(0,3),initial,'New additions do not resize or rearrange existing images');
 assert.deepEqual(JSON.parse(w.eval('JSON.stringify(flex.assets.map(a=>[a.cols,a.rows,a.sum]))')),[[64,64,40960],[128,512,655360],[256,1024,2621440]],'Page layout does not resample image pixels');
 $('flex-arrange').click();
 assert.notEqual(pages()[0].items[0].x,initial[0].x,'Explicit Arrange still works');
 assert.deepEqual(errors,[]);dom.window.close();
 console.log('OK: manual images stack, square/1:4 frames, no page overflow or automatic grids, originals preserved and explicit Arrange available.');
}catch(error){console.error(error);dom.window.close();process.exitCode=1;}
