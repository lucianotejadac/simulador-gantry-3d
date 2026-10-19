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
  const uncollimatedSources=new WeakMap();
  function uncollimatedField(pose,pair,crop,w,h,flipX,flipY,metrics){
    // Educational planar fluence, not a reconstructed anatomical image.
    // Integrate the entire attenuated atlas, including sources outside the crop.
    // Coarse source cells and a fixed physical sampling grid bound the work even
    // at high matrices. The response is z/(2*pi*r^3), including incidence angle.
    const mm=pose.pixelMm||3,cm=mm/10,cols=8,rows=32;
    const signature=pair.lo+':'+pair.hi+':'+pair.mix;
    let sourceCache=uncollimatedSources.get(pose);
    if(!sourceCache){sourceCache=new Map();uncollimatedSources.set(pose,sourceCache);}
    let cached=sourceCache.get(signature);
    if(!cached){
    const mass=new Float64Array(cols*rows),sx=new Float64Array(mass.length),sy=new Float64Array(mass.length);
    const a=pose.frames[pair.lo],b=pose.frames[pair.hi];
    for(let y=0;y<pose.height;y++)for(let x=0;x<pose.width;x++){
      const i=y*pose.width+x,v=(a[i]*(1-pair.mix)+b[i]*pair.mix)*pose.scale;
      if(!v)continue;
      const k=Math.min(rows-1,Math.floor(y*rows/pose.height))*cols+Math.min(cols-1,Math.floor(x*cols/pose.width));
      mass[k]+=v;sx[k]+=v*(x+.5)*cm;sy[k]+=v*(y+.5)*cm;
    }
    const sources=[];
    for(let k=0;k<mass.length;k++)if(mass[k]>0)sources.push([mass[k],sx[k]/mass[k],sy[k]/mass[k]]);
    cached={sources};
    if(sourceCache.size>=2)sourceCache.delete(sourceCache.keys().next().value);
    sourceCache.set(signature,cached);
    }
    const sources=cached.sources;
    // An effective 10 cm source depth approximates internal activity; no new
    // ray-traced tissue attenuation or camera-specific dead-time is claimed.
    const depth=Math.max(0,metrics.detectorDistanceCm||0)+10,z2=depth*depth;
    const nx=16,ny=Math.max(8,Math.min(64,Math.round(nx*crop.h/crop.w)));
    const grid=new Float64Array((nx+1)*(ny+1));
    for(let y=0;y<=ny;y++)for(let x=0;x<=nx;x++){
      const px=(crop.x+x/nx*crop.w)*cm,py=(crop.y+y/ny*crop.h)*cm;let total=0;
      for(const [m,cx,cy] of sources){const r2=(px-cx)**2+(py-cy)**2+z2;total+=m*depth/(2*Math.PI*r2*Math.sqrt(r2));}
      grid[y*(nx+1)+x]=total;
    }
    const values=new Float32Array(w*h),cdf=new Float64Array(w*h);
    const area=crop.w*crop.h*cm*cm/(w*h),gain=area*metrics.countFactor;let sum=0,peak=0;
    const xi=new Int32Array(w),xf=new Float64Array(w),row=new Float64Array(nx+1);
    for(let x=0;x<w;x++){const u=((flipX?w-1-x:x)+.5)/w*nx;xi[x]=Math.floor(u);xf[x]=u-xi[x];}
    for(let y=0;y<h;y++){
      const v=((flipY?h-1-y:y)+.5)/h*ny,iy=Math.floor(v),fy=v-iy,k=iy*(nx+1);
      for(let x=0;x<=nx;x++)row[x]=(grid[k+x]*(1-fy)+grid[k+nx+1+x]*fy)*gain;
      for(let x=0;x<w;x++){
        const i=y*w+x;values[i]=row[xi[x]]*(1-xf[x])+row[xi[x]+1]*xf[x];
        cdf[i]=sum+=values[i];if(values[i]>peak)peak=values[i];
      }
    }
    return {values,cdf,sum,window:Math.max(1e-12,peak*.8)};
  }
  // Sample the same detector response more finely, without inventing PSF detail.
  // Filtering stays bounded at the source's useful sampling; total rate is preserved.
  function finerField(base,bw,bh,w,h){
    const values=new Float32Array(w*h),cdf=new Float64Array(w*h);
    const area=bw*bh/(w*h);let sum=0;
    for(let y=0;y<h;y++){
      const sy=Math.max(0,Math.min(bh-1,(y+.5)*bh/h-.5)),y0=Math.floor(sy),fy=sy-y0,y1=Math.min(bh-1,y0+1);
      for(let x=0;x<w;x++){
        const sx=Math.max(0,Math.min(bw-1,(x+.5)*bw/w-.5)),x0=Math.floor(sx),fx=sx-x0,x1=Math.min(bw-1,x0+1);
        const v=((base.values[y0*bw+x0]*(1-fx)+base.values[y0*bw+x1]*fx)*(1-fy)+(base.values[y1*bw+x0]*(1-fx)+base.values[y1*bw+x1]*fx)*fy)*area;
        values[y*w+x]=v;sum+=values[y*w+x];
      }
    }
    const norm=sum>0?base.sum/sum:0;sum=0;
    for(let i=0;i<values.length;i++){values[i]*=norm;cdf[i]=sum+=values[i];}
    return {values,cdf,sum,window:base.window*area*norm};
  }
  function field(pose,pair,crop,w,h,flipX,flipY,metrics,sigma){
    if(w>256){const ratio=w/256,bh=Math.round(h/ratio);
      return finerField(field(pose,pair,crop,256,bh,flipX,flipY,metrics,sigma/ratio),256,bh,w,h);
    }
    if(metrics.uncollimated)return uncollimatedField(pose,pair,crop,w,h,flipX,flipY,metrics);
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
      const values=live?this.counts:field.values,lut=new Map([[0,0]]);
      for(let i=0;i<values.length;i++){
        let value=live?lut.get(values[i]):undefined;
        if(value===undefined){value=Math.round(255*Math.pow(Math.max(0,Math.min(1,values[i]/Math.max(window,1e-12)*gain)),.72));if(live)lut.set(values[i],value);}
        const p=i*4;pixels[p]=pixels[p+1]=pixels[p+2]=value;pixels[p+3]=255;
      }
      ctx.putImageData(image,0,0);
    }
  }
  window.GANTRY_ICRP={load,get ready(){return Promise.all(Object.keys(window.GANTRY_ICRP_DATA).map(load));},poses,field,Persistence};
})();
