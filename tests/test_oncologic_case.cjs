const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {fixture}=require('./bone_performance_fixture.cjs');
(async()=>{
 const W=await fixture(),M=W.GANTRY_MDP;
 const d=W.GANTRY_ONCOLOGIC_CASE_DATA=JSON.parse(fs.readFileSync('assets/physics/oncologic-case.json','utf8'));
 W.GANTRY_PATIENT={id:'phantom'};
 const atlas=await M.loadCase(d.id);
 assert.equal(d.lesions.length,7);assert(d.lesions.every(l=>l.voxels>8));
 assert.notDeepEqual(atlas.down[0].frames[9],atlas.up[0].frames[9],'arm position changes lateral attenuation');
 vm.runInNewContext(fs.readFileSync('scripts/final_preview.js','utf8'),{window:W,document:{getElementById:()=>null}});
 const sums=[];
 for(const pose of ['down','up']){
  await M.load(pose);const p=M.geometry(pose);
  for(const angle of [0,45,90,180,270]){
   await M.ensureAngles(pose,[angle]);const cache={},metrics=W.metrics(15,'bone','LEHR',140,20);
   const crop={x:p.width/2-160,y:p.headRow-d.headRow,w:320,h:768};
   const field=t=>M.field({...p,angles:[angle]},{lo:0,hi:0,mix:0},crop,160,384,false,false,metrics,1,pose,cache,t);
   for(const seconds of [0,15,150,7200,14400,28800]){
    W.GANTRY_PATIENT.id='phantom';const normal=field(seconds);
    W.GANTRY_PATIENT.id=d.id;const lesion=field(seconds);
    assert(lesion.values.every(x=>Number.isFinite(x)&&x>=0));
    for(let c=1;c<8;c++)assert.deepEqual(lesion.mdpBases[c],normal.mdpBases[c],'normal organs and early vascular/pool distribution preserved');
    if(!seconds)assert.deepEqual(lesion.values,normal.values,'no tracer before injection');
    else assert.notDeepEqual(lesion.values,normal.values);
    if(seconds===7200&&pose==='down'&&[0,180].includes(angle)){
     // Each focus must increase counts over its own normal skeletal region.
     for(const focus of d.lesions){
      const [x,,z]=focus.centroidLpsMm;
      const nativeX=63+(x+296.95757)/3-.5;
      const cx=(angle===0?nativeX:319-nativeX)/2,cy=(758-((z+888.60229)/3-.5))/2;
      let a=0,b=0;
      for(let y=Math.round(cy)-6;y<=Math.round(cy)+6;y++)for(let xx=Math.round(cx)-6;xx<=Math.round(cx)+6;xx++){
       a+=lesion.values[y*160+xx];b+=normal.values[y*160+xx];
      }
      assert(a>b*1.05,`${focus.label}: visible uptake at ${angle}°, ratio ${a/b}`);
      sums.push({angle,focus:focus.label,ratio:a/b});
     }
    }
    W.GANTRY_PATIENT.id='phantom';assert.deepEqual(M.mix(lesion.mdpBases,seconds).values,lesion.values,'saved case survives patient changes');
    assert.deepEqual(field(seconds).values,normal.values,'baseline restored');
    if(process.env.ONCOLOGIC_PREVIEW&&seconds===7200&&[0,45,180].includes(angle))
     fs.writeFileSync(process.env.ONCOLOGIC_PREVIEW+`/${pose}-${angle}.json`,JSON.stringify({width:160,height:384,values:Array.from(lesion.values),baseline:Array.from(normal.values)}));
   }
   if(pose==='down'&&angle===0){
    W.GANTRY_PATIENT.id=d.id;const f=field(7200),duration=40,rate=M.rate;
    const predicted=W.GANTRY_FINAL_PREVIEW.predict([f],{mode:'time',target:duration,rate,model:'bone',start:7200,weights:t=>M.fractions(t).weights})[0];
    const expected=new Float64Array(f.values.length);
    for(let t=7200;t<7240;t+=5){const live=M.mix(f.mdpBases,t+2.5);for(let i=0;i<expected.length;i++)expected[i]+=live.values[i]*rate*5/2000000;}
    const error=expected.reduce((s,v,i)=>s+Math.abs(v-predicted.values[i]),0)/predicted.sum;
    assert(error<1e-6,'instant and timed acquisitions integrate the same spatial/temporal model');
   }
  }
 }
 console.log('OK: seven skeletal foci, both arm poses, five angles, continuous MDP kinetics, unchanged organ bases, patient isolation, instant/live parity.');
 console.log(JSON.stringify(sums));
})().catch(e=>{console.error(e);process.exitCode=1;});
