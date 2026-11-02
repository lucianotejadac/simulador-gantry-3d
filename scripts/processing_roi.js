/* Reversible masks in native image coordinates; never alter source counts. */
(function(){
  'use strict';
  function contains(roi,x,y){
    if(roi.points){let inside=false;const pts=roi.points;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const a=pts[i],b=pts[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
    const [x0,x1]=[Math.min(roi.x0,roi.x1),Math.max(roi.x0,roi.x1)],
      [y0,y1]=[Math.min(roi.y0,roi.y1),Math.max(roi.y0,roi.y1)];
    if(roi.shape==='ellipse')return ((x-(x0+x1)/2)/((x1-x0)/2))**2+((y-(y0+y1)/2)/((y1-y0)/2))**2<=1;
    return x>=x0&&x<x1&&y>=y0&&y<y1;
  }
  function valid(roi,w,h){
    if(roi&&['polygon','threshold'].includes(roi.shape))return ['exclude','keep','measure'].includes(roi.mode)&&Array.isArray(roi.points)&&roi.points.length>=3&&roi.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=w&&p.y>=0&&p.y<=h)&&Math.abs(roi.points.reduce((a,p,i)=>{const q=roi.points[(i+1)%roi.points.length];return a+p.x*q.y-q.x*p.y;},0))>=2&&(roi.shape!=='threshold'||Number.isFinite(roi.threshold)&&roi.threshold>=0);
    return roi&&['rectangle','ellipse'].includes(roi.shape)&&['exclude','keep','measure'].includes(roi.mode)&&
    ['x0','x1','y0','y1'].every(k=>Number.isFinite(roi[k])&&roi[k]>=0&&roi[k]<=(k[0]==='x'?w:h))&&Math.abs(roi.x1-roi.x0)>=1&&Math.abs(roi.y1-roi.y0)>=1;}
  function visible(rois,x,y,count=0){return rois.every(r=>r.mode==='measure'||(contains(r,x,y)&&(r.shape!=='threshold'||count>=r.threshold))===(r.mode==='keep'));}
  function apply(image,w,h,rois){
    if(image.length!==w*h||!rois.every(r=>valid(r,w,h)))throw Error('ROI no válida');
    const counts=new Float64Array(image);let removed=0,min=Infinity,max=-Infinity,visiblePixels=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=y*w+x;
      if(!visible(rois,x+.5,y+.5,counts[i])){removed+=counts[i];counts[i]=0;}
      else{min=Math.min(min,counts[i]);max=Math.max(max,counts[i]);visiblePixels++;}
    }
    return {counts,removed,min:visiblePixels?min:0,max:visiblePixels?max:0,visiblePixels};
  }
  function measure(image,w,h,roi,spacing){
    if(image.length!==w*h||!valid(roi,w,h))throw Error('ROI no valida');
    let total=0,pixels=0,max=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){const count=image[y*w+x];if(contains(roi,x+.5,y+.5)&&(roi.shape!=='threshold'||count>=roi.threshold)){total+=count;pixels++;max=Math.max(max,count);}}
    const areaMm2=Array.isArray(spacing)&&spacing.length===2&&spacing.every(v=>Number.isFinite(v)&&v>0)?pixels*spacing[0]*spacing[1]:null;
    return {total,pixels,mean:pixels?total/pixels:0,max,areaMm2};
  }
  // Exact boundary of the selected native pixels, including holes and separate islands.
  function contour(image,w,h,roi){
    if(image.length!==w*h||!valid(roi,w,h))throw Error('ROI no valida');
    const selected=new Uint8Array(w*h),edges=[];
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)selected[y*w+x]=contains(roi,x+.5,y+.5)&&(roi.shape!=='threshold'||image[y*w+x]>=roi.threshold)?1:0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=y*w+x;if(!selected[i])continue;
      if(y===0||!selected[i-w])edges.push(`M${x} ${y}h1`);
      if(x===w-1||!selected[i+1])edges.push(`M${x+1} ${y}v1`);
      if(y===h-1||!selected[i+w])edges.push(`M${x} ${y+1}h1`);
      if(x===0||!selected[i-1])edges.push(`M${x} ${y}v1`);
    }
    return edges.join('');
  }
  window.GANTRY_ROI={valid,visible,apply,measure,contour};
})();
