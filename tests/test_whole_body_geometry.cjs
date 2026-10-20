const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8'),packed=JSON.parse(html.match(/window.GANTRY_ICRP_DATA=(.*?);\n/)[1]);
const ctx=vm.createContext({window:{GANTRY_ICRP_DATA:packed},document:{getElementById:()=>null},
  Blob,Response,DecompressionStream,fetch:require('./asset_fetch.cjs'),atob,performance,setTimeout});
for(const file of ['icrp_live','bone_whole_body','bone_acquisition'])vm.runInContext(fs.readFileSync('scripts/'+file+'.js','utf8'),ctx);
const W=ctx.window,api=W.GANTRY_BONE_WHOLE;
function expectation(pose,n,size,angle){
  const idx=pose.angles.indexOf(angle);
  const f=W.GANTRY_ICRP.field(pose,{lo:idx,hi:idx,mix:0},size.crop,n,size.height,false,false,
    {contrast:1,countFactor:1,haloAlpha:0},0);
  let sum=0;
  for(let y=0;y<size.height;y++){
    const exposure=api.exposure(size.crop.y+(y+.5)*size.crop.h/size.height,pose.headRow,pose.footRow,280/3,1050);
    for(let x=0;x<n;x++)if(Math.abs((x+.5)/n-.5)*size.crop.w<=280/3)sum+=f.values[y*n+x]*exposure;
  }
  return sum;
}
(async()=>{
  await W.GANTRY_ICRP.ready;
  for(const name of ['down','up']){
    const pose=W.GANTRY_ICRP.poses[name];
    const original={height:pose.height,crop:{x:0,y:0,w:pose.width,h:pose.height}};
    for(const angle of [0,180]){
      const old=expectation(pose,pose.width,original,angle),values=[];
      for(const n of [64,128,256,512]){
        const g=api.geometry(pose,n);
        assert.equal(g.height,4*n);
        assert(Math.abs(g.pixelMm*n-613.7855834960896)<1e-8);
        assert(Math.abs(g.crop.w/n-g.crop.h/g.height)<1e-12);
        assert.equal(g.crop.y+g.crop.h/2,pose.height/2);
        assert(g.crop.y<=0&&g.crop.y+g.crop.h>=pose.height,'No cranio-caudal anatomy clipped');
        const scan=new api.Scan(n,10,pose,200);
        assert.equal(scan.target*60/scan.velocity,1050,'Matrix does not change physical scan time');
        const total=expectation(pose,n,g,angle);values.push(total);
        assert(Math.abs(total/old-1)<.025,`${name} ${angle} ${n}: counts changed by ${100*(total/old-1)}%`);
      }
      assert(Math.max(...values)/Math.min(...values)<1.025,'Expected counts invariant across matrices');
      console.log(name,angle,'expected count ratios vs original:',values.map(v=>(v/old).toFixed(5)).join(', '));
    }
  }
  console.log('OK: 1:4 matrices, square calibrated pixels, centered padding, original count expectations and unchanged scan duration.');
})().catch(e=>{console.error(e);process.exitCode=1;});
