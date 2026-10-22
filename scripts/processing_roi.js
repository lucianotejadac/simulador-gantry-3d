/* Reversible masks in native image coordinates; never alter source counts. */
(function(){
  'use strict';
  function contains(roi,x,y){
    const [x0,x1]=[Math.min(roi.x0,roi.x1),Math.max(roi.x0,roi.x1)],
      [y0,y1]=[Math.min(roi.y0,roi.y1),Math.max(roi.y0,roi.y1)];
    if(roi.shape==='ellipse')return ((x-(x0+x1)/2)/((x1-x0)/2))**2+((y-(y0+y1)/2)/((y1-y0)/2))**2<=1;
    return x>=x0&&x<x1&&y>=y0&&y<y1;
  }
  function valid(roi,w,h){return roi&&['rectangle','ellipse'].includes(roi.shape)&&['exclude','keep'].includes(roi.mode)&&
    ['x0','x1','y0','y1'].every(k=>Number.isFinite(roi[k])&&roi[k]>=0&&roi[k]<=(k[0]==='x'?w:h))&&Math.abs(roi.x1-roi.x0)>=1&&Math.abs(roi.y1-roi.y0)>=1;}
  function visible(rois,x,y){return rois.every(r=>contains(r,x,y)===(r.mode==='keep'));}
  function apply(image,w,h,rois){
    if(image.length!==w*h||!rois.every(r=>valid(r,w,h)))throw Error('ROI no válida');
    const counts=new Float64Array(image);let removed=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(!visible(rois,x+.5,y+.5)){removed+=counts[y*w+x];counts[y*w+x]=0;}
    return {counts,removed};
  }
  window.GANTRY_ROI={valid,visible,apply};
})();
