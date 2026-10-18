/* Motor lineal y ventana de persistencia. Se incrusta en index.html al construir. */
(function(){
  'use strict';
  const poses={},pending={};
  async function decode(packed){
    let source;
    if(packed.url){
      const response=await (window.GANTRY_ASSETS?.fetch||fetch)(packed.url);if(!response.ok)throw Error('No se pudo descargar la serie ('+response.status+')');
      source=response.body;
    }else source=new Blob([Uint8Array.from(atob(packed.deflate),c=>c.charCodeAt(0))]).stream();
    const stream=source.pipeThrough(new DecompressionStream('deflate'));
    const buffer=await new Response(stream).arrayBuffer();
    const values=new Uint16Array(buffer),length=packed.width*packed.height;
    if(values.length!==packed.angles.length*length)throw Error('Serie ICRP incompleta');
    return {...packed,deflate:undefined,frames:packed.angles.map((_,i)=>values.subarray(i*length,(i+1)*length))};
  }
  function load(name){
    if(poses[name])return Promise.resolve(poses[name]);
    if(!pending[name])pending[name]=decode(window.GANTRY_ICRP_DATA[name]).then(pose=>poses[name]=pose).catch(error=>{delete pending[name];throw error;});
    return pending[name];
  }

  function blur(input,w,h,sigma){
    if(sigma<.15)return input;
    const radius=Math.ceil(3*sigma),weights=[];
    for(let k=-radius;k<=radius;k++)weights.push(Math.exp(-k*k/(2*sigma*sigma)));
    const norm=weights.reduce((a,b)=>a+b,0);weights.forEach((v,i)=>weights[i]=v/norm);
    const temp=new Float32Array(input.length),result=new Float32Array(input.length);
    // Keep the exact Gaussian and zero-padded edges. Bound the valid taps once,
    // instead of testing every tap; the wide off-photopeak halo is costly here.
    const first=new Int32Array(w),last=new Int32Array(w);
    for(let x=0;x<w;x++){first[x]=Math.max(-radius,-x);last[x]=Math.min(radius,w-1-x);}
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=y*w+x;let v=0;
      for(let k=first[x];k<=last[x];k++)v+=input[i+k]*weights[k+radius];
      temp[i]=v;
    }
    // Traverse each source row contiguously. Float64 accumulation retains the
    // original tap order/precision, with one Float32 rounding at the end.
    const row=new Float64Array(w);
    for(let y=0;y<h;y++){
      row.fill(0);
      const first=Math.max(-radius,-y),last=Math.min(radius,h-1-y);
      for(let k=first;k<=last;k++){
        const offset=(y+k)*w,weight=weights[k+radius];
        for(let x=0;x<w;x++)row[x]+=temp[offset+x]*weight;
      }
      result.set(row,y*w);
    }
    return result;
  }
  function field(pose,pair,crop,w,h,flipX,flipY,metrics,sigma){
    const a=pose.frames[pair.lo],b=pose.frames[pair.hi],values=new Float32Array(w*h);
    // Cuenta esperada por píxel: conservar área física al cambiar matriz/zoom.
    const area=crop.w*crop.h/(w*h),factor=pose.scale*area;
    function sample(frame,x,y){
      const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
      let v=0;
      for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
        if(ix+dx>=0&&ix+dx<pose.width&&iy+dy>=0&&iy+dy<pose.height)
          v+=frame[(iy+dy)*pose.width+ix+dx]*(dx?fx:1-fx)*(dy?fy:1-fy);
      }
      return v;
    }
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const px=crop.x+((flipX?w-1-x:x)+.5)/w*crop.w-.5;
      const py=crop.y+((flipY?h-1-y:y)+.5)/h*crop.h-.5;
      values[y*w+x]=(pair.mix===0?sample(a,px,py):sample(a,px,py)*(1-pair.mix)+sample(b,px,py)*pair.mix)*factor;
    }
    const sharp=blur(values,w,h,sigma);
    const halo=metrics.haloAlpha>0?blur(values,w,h,sigma+metrics.haloBlur):null;
    const cdf=new Float64Array(values.length);let sum=0;
    for(let i=0;i<sharp.length;i++){
      sharp[i]=(sharp[i]*metrics.contrast+(halo?halo[i]*metrics.haloAlpha:0))*metrics.countFactor;
      cdf[i]=sum+=sharp[i];
    }
    return {values:sharp,cdf,sum,window:pose.window*area};
  }
  class Persistence {
    constructor(w,h,random=Math.random){this.w=w;this.h=h;this.random=random;this.counts=new Uint32Array(w*h);this.reset();}
    reset(){this.counts.fill(0);this.frames=[];this.total=0;this.lastStepTime=-Infinity;}
    expire(now,duration){
      while(this.frames.length&&this.frames[0].time<=now-duration){
        const frame=this.frames.shift();for(const i of frame.events)this.counts[i]--;
        this.total-=frame.events.length;
      }
    }
    step(field,rate,dt,now,duration){
      // A gantry render can re-enter the live view during an automatic scan.
      // Each persistence interval contributes events exactly once.
      if(now<=this.lastStepTime)return;
      this.lastStepTime=now;
      this.expire(now,duration);
      const expected=field.sum/2000000*rate*dt,events=[];
      for(let t=-Math.log(1-this.random());t<expected;t+=-Math.log(1-this.random())){
        const target=this.random()*field.sum;let lo=0,hi=field.cdf.length-1;
        while(lo<hi){const mid=(lo+hi)>>>1;if(field.cdf[mid]>target)hi=mid;else lo=mid+1;}
        this.counts[lo]++;events.push(lo);
      }
      this.frames.push({time:now,events:Uint32Array.from(events)});this.total+=events.length;
    }
    draw(ctx,field,rate,duration,live,gain){
      const image=ctx.createImageData(this.w,this.h),pixels=image.data;
      const window=field.window*(live?rate*duration/2000000:1);
      const values=live?this.counts:field.values;
      for(let i=0;i<values.length;i++){
        const value=Math.round(255*Math.pow(Math.max(0,Math.min(1,values[i]/Math.max(window,1e-12)*gain)),.72));
        const p=i*4;pixels[p]=pixels[p+1]=pixels[p+2]=value;pixels[p+3]=255;
      }
      ctx.putImageData(image,0,0);
    }
  }
  window.GANTRY_ICRP={load,get ready(){return Promise.all(Object.keys(window.GANTRY_ICRP_DATA).map(load));},poses,field,Persistence};
})();
