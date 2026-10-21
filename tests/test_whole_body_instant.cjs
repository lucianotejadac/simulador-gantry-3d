const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('scripts/bone_whole_body.js','utf8');
function fixture(n=64,startZ=200,velocity=10,contours='auto',camera={}){
  const pose={width:560/3,height:500,headRow:20,footRow:480};
  const G={tableZ:startZ,tableH:88,detDist1:50,detDist2:50,arms:'down',rot:0,detectorSeparation:180};
  const settings={matrix:n,zoom:1,headFirst:false,decubitus:'supine',collimator:'LEHR',energyCenter:140,windowWidth:20,...camera};
  const sampled=[],times=[],distances=[],projections=[],responses=[],stats={fields:0,guards:0,renders:0,yields:0};
  const W={
    GANTRY:{G,LIM:{detDist1:[12,50],detDist2:[12,50]},render(){stats.renders++;}},
    GANTRY_PATIENT3D:{headFirst:false},
    GANTRY_LIVE:{settings,setZoom(){throw Error('Acquisition must not reset zoom');},resetImageCenter(){throw Error('Acquisition must not reset centering');},framePair:a=>({lo:a,hi:a,mix:0}),distanceMetrics:(cm,...args)=>{distances.push(cm);responses.push(args);return {blur:cm/20};}},
    GANTRY3D:{limits:g=>({d1:g.tableZ<100?30:20,d2:25}),surfaceGaps:()=>null,collision:{guard(){stats.guards++;}}},
    GANTRY_MDP:{seconds:7200,rate:100,get remaining(){return 10800-this.seconds;},geometry:()=>pose,
      metadata(){return {seconds:this.seconds,voidAt120:true};},advance(t){this.seconds+=t;},
      field(p,pair,crop,w,h,flipX,flipY,m,s,name,cache,t){
        projections.push({crop:{...crop},w,h,flipX,flipY});
        stats.fields++;times.push(t);return {values:new Float32Array(w*h).fill(pair.lo===0?20000:10000)};
      }},
    GANTRY_BONE_CORE:{poisson:mu=>{sampled.push(mu);return Math.round(mu);}}
  };
  const ctx=vm.createContext({window:W,document:{getElementById:()=>null},performance,structuredClone,
    setTimeout(fn){stats.yields++;return setTimeout(fn,0);}});
  vm.runInContext(source,ctx);
  const api=W.GANTRY_BONE_WHOLE,scan=api.create(velocity,contours);
  return {W,G,api,scan,sampled,times,stats,pose,distances,ctx,projections,responses};
}
function near(a,b){assert(Math.abs(a-b)<1e-6*Math.max(1,Math.abs(b)),`${a} != ${b}`);}
(async()=>{
  // Nonstandard camera settings must survive both entry paths and reach the
  // projection/exposure calculation, not only the saved UI labels.
  const camera={zoom:2,collimator:'HE',energyCenter:97,windowWidth:10,
    centers:{1:{x:.2,y:.1},2:{x:-.15,y:-.25}},decubitus:'prone'};
  for(const instant of [false,true]){
    const f=fixture(128,200,20,'fixed',camera),before=JSON.stringify(f.W.GANTRY_LIVE.settings);
    const base=f.api.geometry(f.pose,128),s=f.scan;
    near(s.crop.w,base.crop.w/2);near(s.crop.h,base.crop.h/2);
    near(s.sampling.pixelMm,base.sampling.pixelMm/2);
    assert.equal(s.height,512);assert.equal(s.velocity,20);
    if(instant)await f.api.instant(s,100);
    else{
      f.api.advance(s,100,.5,false);
      const fields=f.api.fields().fields;
      s.step(fields,100,s.target*60/s.velocity);
    }
    assert.equal(JSON.stringify(f.W.GANTRY_LIVE.settings),before);
    assert(f.responses.every(args=>JSON.stringify(args)===JSON.stringify(['bone','HE',97,10])));
    for(let j=0;j<2;j++){
      const p=f.projections[j],center=camera.centers[j+1];
      near(p.crop.x+p.crop.w/2,f.pose.width/2+center.x*560/3);
      near(p.crop.y+p.crop.h/2,f.pose.height/2+center.y*560/3);
      assert(p.flipX,'Declared orientation reaches projection');
      near(s.heads[j].elapsed,525);
    }
    if(instant){
      for(let j=0;j<2;j++)for(let y=0;y<s.height;y++){
        const frame=s.frames[j],row=frame.crop.y+(y+.5)*frame.crop.h/s.height;
        const expected=f.api.exposure(row,s.fromRow+frame.offsetY,s.toRow+frame.offsetY,280/3/2,525)*(j?.5:1);
        near(f.sampled[j*s.n*s.height+y*s.n+s.n/2],expected);
      }
    }
  }
  for(const n of [64,128,256,512]){
    const f=fixture(n),before=performance.now();await f.api.instant(f.scan,100);
    const s=f.scan;
    assert(s.finished&&s.heads.every(h=>h.done));near(s.heads[0].elapsed,1050);
    near(f.G.tableZ,16);near(f.W.GANTRY_MDP.seconds,8250);
    assert.equal(f.stats.renders,0,'No per-step scene painting');
    assert(f.stats.fields<=72,'Bounded field evaluations instead of 2,100 half-second steps');
    assert(f.stats.guards>180,'Still checks swept collision path');
    assert.equal(f.sampled.length,2*n*s.height,'Exactly one Poisson draw per output pixel');
    for(let j=0;j<2;j++)for(let y=0;y<s.height;y++){
      const row=s.crop.y+(y+.5)*s.crop.h/s.height;
      const expected=f.api.exposure(row,s.fromRow,s.toRow,560/3/2,1050)*(j?0.5:1);
      near(f.sampled[j*n*s.height+y*n+n/2],expected);
    }
    for(const h of s.heads)assert.equal(h.total,h.counts.reduce((a,b)=>a+b,0));
    console.log(`Instant ${n}: ${(performance.now()-before).toFixed(0)} ms; ${f.stats.fields} fields, simulated ${s.heads[0].elapsed}s`);
  }
  // Finishes only the remainder of an already-started scan, retaining counts.
  const partial=fixture(64,150,30),s=partial.scan;
  s.travel=20;partial.G.tableZ=s.tableZ;
  s.heads.forEach(h=>{h.counts[0]=17;h.total=17;h.elapsed=40;});
  await partial.api.instant(s,100);
  near(s.heads[0].elapsed,s.target*2);assert(s.heads[0].counts[0]>=17);
  // Time limit must not teleport a partially covered patient to the endpoint.
  const limit=fixture();limit.W.GANTRY_MDP.seconds=10795;
  await limit.api.instant(limit.scan,100);
  assert(limit.scan.finished&&limit.scan.mdpLimit&&!limit.scan.heads[0].done);
  near(limit.scan.heads[0].elapsed,5);near(limit.G.tableZ,limit.scan.tableZ);assert(limit.G.tableZ>190);
  // Sample on both sides of voiding, never average across the discontinuity.
  const boundary=fixture();boundary.W.GANTRY_MDP.seconds=7195;
  await boundary.api.instant(boundary.scan,100);
  near(boundary.times[0],7197.5);assert(boundary.times[2]>7200);
  // Unsafe path leaves geometry, count buffers and kinetic time untouched.
  const unsafe=fixture(),original={...unsafe.G};
  unsafe.W.GANTRY3D.collision.guard=()=>({blocked:{detector:1,hit:{region:'paciente'}}});
  await assert.rejects(unsafe.api.instant(unsafe.scan,100),/contacto/);
  assert.deepEqual(unsafe.G,original);assert.equal(unsafe.scan.travel,0);
  assert.equal(unsafe.W.GANTRY_MDP.seconds,7200);assert.equal(unsafe.scan.heads[0].total,0);
  // The placement fast path must also reject actual collision-core contacts.
  const placement=fixture();
  vm.runInNewContext(fs.readFileSync('scripts/gantry_collision.js','utf8'),{window:placement.W});
  placement.W.GANTRY3D.collision.evaluate=g=>[1,2].map(detector=>({
    detector,body:{gap:g.detDist1<40?-.01:.1,region:'paciente'},table:{gap:.1}
  }));
  placement.W.GANTRY3D.collision.guard=()=>{throw Error('Unexpected animated sweep');};
  await assert.rejects(placement.api.instant(placement.scan,100),/contacto/);
  assert.equal(placement.G.detDist1,50);assert.equal(placement.scan.travel,0);
  // Sentinel event cannot be bypassed by the instant path.
  const cancelled=fixture();cancelled.W.GANTRY_EXAM={blocked:true};
  await assert.rejects(cancelled.api.instant(cancelled.scan,100),/cancelada/);
  assert.equal(cancelled.scan.heads[0].total,0);
  // No signal still finishes a time-based whole-body scan, with zero counts.
  const zero=fixture();zero.W.GANTRY_MDP.rate=0;
  await zero.api.instant(zero.scan,100);assert(zero.scan.finished);
  assert(zero.scan.heads.every(h=>h.total===0&&h.elapsed===1050));
  // Alignment uses the same guarded angular route without visible animation.
  const aligned=fixture();aligned.G.rot=60;aligned.G.detectorSeparation=90;
  aligned.scan=aligned.api.create(10);await aligned.api.instant(aligned.scan,100);
  assert.equal(aligned.G.rot,0);assert.equal(aligned.G.detectorSeparation,180);
  // Fixed contour mode keeps the chosen radii, including in the instant path,
  // while automatic mode changes them along the same anatomy.
  const fixed=fixture(64,200,10,'fixed'),automatic=fixture();
  await fixed.api.instant(fixed.scan,100);await automatic.api.instant(automatic.scan,100);
  assert.equal(fixed.G.detDist1,50);assert.equal(fixed.G.detDist2,50);
  assert(fixed.distances.every(cm=>cm===50),'Distance-dependent imaging receives fixed radii');
  assert(automatic.distances.some(cm=>cm<50),'Automatic imaging uses closer detector distances');
  near(fixed.scan.heads[0].elapsed,automatic.scan.heads[0].elapsed);
  const realFixed=fixture(64,101,60,'fixed'),realAuto=fixture(64,101,60);
  for(const f of [realFixed,realAuto]){
    for(let i=0;i<100&&f.G.tableZ>95;i++)f.api.advance(f.scan,100,.5,false);
    assert(f.G.tableZ<95);
  }
  assert.equal(realFixed.G.detDist1,50);assert.equal(realFixed.G.detDist2,50);
  assert(realAuto.G.detDist1<50);
  const tooClose=fixture();tooClose.G.detDist1=20;
  assert.throws(()=>tooClose.api.create(10,'fixed'),/Distancia fija insuficiente/);
  const blockedFixed=fixture(64,200,10,'fixed');
  blockedFixed.W.GANTRY3D.collision.guard=()=>({blocked:{detector:1,hit:{region:'paciente'}}});
  assert.throws(()=>blockedFixed.api.advance(blockedFixed.scan,100,.5),/contacto/);
  await assert.rejects(blockedFixed.api.instant(blockedFixed.scan,100),/contacto/);
  assert.equal(blockedFixed.scan.travel,0);
  // Mode and initial fixed radii survive saving and reject malformed metadata.
  vm.runInContext(fs.readFileSync('scripts/bone_acquisition_store.js','utf8'),fixed.ctx);
  const saved=fixed.W.GANTRY_BONE_STORAGE.snapshot(fixed.scan,['D1','D2'],{},1,'fixed-test');
  assert.equal(saved.scan.contours,'fixed');assert.equal(saved.scan.fixedDistances.detDist1,50);
  fixed.W.GANTRY_BONE_STORAGE.validate(saved);
  saved.scan.fixedDistances.detDist1=NaN;
  assert.throws(()=>fixed.W.GANTRY_BONE_STORAGE.validate(saved),/Distancias/);
  console.log('OK: automatic/fixed contours in timed and instant scans, actual imaging distances, unchanged scan duration, clearance/contacts and saved metadata.');
  console.log('OK: analytical exposure, one Poisson sample, partial scan, kinetic limit, void boundary, zero signal, guarded alignment and atomic rejection.');
})().catch(e=>{console.error(e);process.exitCode=1;});
