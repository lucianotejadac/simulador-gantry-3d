const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {fixture}=require('./bone_performance_fixture.cjs');
(async()=>{
 const W=await fixture(),M=W.GANTRY_MDP;
 W.GANTRY_CELLULITIS_CASE_DATA=JSON.parse(fs.readFileSync('assets/physics/cellulitis-case.json','utf8'));
 W.GANTRY_PATIENT={id:'phantom'};
 await M.loadCase('caso-oseo-2');
 vm.runInNewContext(fs.readFileSync('scripts/final_preview.js','utf8'),{window:W,document:{getElementById:()=>null}});
 const results=[];
 for(const pose of ['down','up']){
  await M.load(pose);const p=M.geometry(pose);
  for(const angle of [0,45,90,180,270]){
   await M.ensureAngles(pose,[angle]);const cache={},metrics=W.metrics(15,'bone','LEHR',140,20);
   const crop={x:p.width/2-80,y:p.headRow+(350-84.492155)*2,w:160,h:100};
   const field=t=>M.field({...p,angles:[angle]},{lo:0,hi:0,mix:0},crop,160,100,false,false,metrics,1,pose,cache,t);
   for(const seconds of [0,15,150,300,900,7200,14400]){
    W.GANTRY_PATIENT.id='phantom';const normal=field(seconds);
    W.GANTRY_PATIENT.id='caso-oseo-2';const lesion=field(seconds);
    assert(lesion.values.every(x=>Number.isFinite(x)&&x>=0));
    assert.deepEqual(lesion.mdpBases[0],normal.mdpBases[0],'no pathological skeletal component');
    assert.deepEqual(lesion.mdpBases[2],normal.mdpBases[2],'late background uses unchanged tissue distribution');
    if(!seconds)assert.deepEqual(lesion.values,normal.values,'no uptake before arrival of the tracer');
    else if(seconds<=300)assert(lesion.sum>normal.sum*1.1,'early regional hyperemia and pool');
    else if(seconds>=7200)assert(Math.abs(lesion.sum/normal.sum-1)<.01,'late distribution returns to baseline');
    // Saved spatial bases keep their patient kinetics after selection changes.
    W.GANTRY_PATIENT.id='phantom';assert.deepEqual(M.mix(lesion.mdpBases,seconds).values,lesion.values);
    assert.deepEqual(field(seconds).values,normal.values);
    results.push({pose,angle,seconds,ratio:lesion.sum/normal.sum});
    if(process.env.CELLULITIS_PREVIEW&&pose==='down'&&[0,180].includes(angle)&&[15,150,7200].includes(seconds))
     fs.writeFileSync(process.env.CELLULITIS_PREVIEW+`/cellulitis-${angle}-${seconds}.json`,JSON.stringify({width:160,height:100,values:Array.from(lesion.values),baseline:Array.from(normal.values)}));
   }
   if(pose==='down'&&angle===0){
    W.GANTRY_PATIENT.id='caso-oseo-2';const f=field(140),duration=40,rate=M.rate;
    const predicted=W.GANTRY_FINAL_PREVIEW.predict([f],{mode:'time',target:duration,rate,model:'bone',start:140,weights:t=>M.fractions(t).weights})[0];
    const expected=new Float64Array(f.values.length);
    for(let t=140;t<180;t+=5){const live=M.mix(f.mdpBases,t+2.5);for(let i=0;i<expected.length;i++)expected[i]+=live.values[i]*rate*5/2000000;}
    const error=expected.reduce((s,v,i)=>s+Math.abs(v-predicted.values[i]),0)/predicted.sum;
    assert(error<1e-6,'instant exposure must integrate the same distribution as live/timed acquisition');
    assert.equal(predicted.elapsed,duration);
   }
  }
 }
 console.log('OK: isolated cellulitis, both poses/five views, early perfusion/pool, late baseline, patient isolation and instant/live parity.');
 console.log(JSON.stringify(results.filter(r=>r.pose==='down'&&[0,180].includes(r.angle))));
})().catch(e=>{console.error(e);process.exitCode=1;});
