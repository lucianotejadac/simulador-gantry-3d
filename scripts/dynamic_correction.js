/* Planar adaptation of the normalized image registration and integer translation
   in cardiaco-movil/correccion.js, Luciano Tejada Castro, MIT (see credits).
   No rotating-head/90-degree assumptions; proposals are reviewed per detector. */
(function(){
  'use strict';
  function shift(image,n,dx,dy){
    if(image.length!==n*n||!Number.isInteger(dx)||!Number.isInteger(dy)||Math.abs(dx)>=n||Math.abs(dy)>=n)throw Error('Desplazamiento no válido');
    const counts=new Float64Array(image.length);let before=0,after=0;
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){
      before+=image[y*n+x];const sx=x-dx,sy=y-dy;
      if(sx>=0&&sx<n&&sy>=0&&sy<n)after+=counts[y*n+x]=image[sy*n+sx];
    }
    return {counts,lost:before-after};
  }
  function reduce(image,n){
    const size=Math.min(n,64),scale=n/size,out=new Float64Array(size*size);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++)out[Math.floor(y/scale)*size+Math.floor(x/scale)]+=image[y*n+x];
    const smooth=new Float64Array(out.length);
    for(let y=1;y<size-1;y++)for(let x=1;x<size-1;x++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)smooth[y*size+x]+=out[(y+dy)*size+x+dx]/9;
    return {values:smooth,size,scale};
  }
  function estimate(reference,image,n){
    const A=reduce(reference,n),B=reduce(image,n),a=A.values,b=B.values,N=A.size,R=6;
    let best=Infinity,second=Infinity,bx=0,by=0;
    if(reference.reduce((s,v)=>s+v,0)<200||image.reduce((s,v)=>s+v,0)<200)return {reliable:false,reason:'Pocas cuentas para estimar movimiento.'};
    for(let dy=-R;dy<=R;dy++)for(let dx=-R;dx<=R;dx++){
      let sa=0,sb=0,saa=0,sbb=0,sab=0,c=0;
      for(let y=R;y<N-R;y++)for(let x=R;x<N-R;x++){
        const p=a[y*N+x],q=b[(y-dy)*N+x-dx];sa+=p;sb+=q;saa+=p*p;sbb+=q*q;sab+=p*q;c++;
      }
      if(sa<=0||sb<=0||saa*c-sa*sa<1e-8||sbb*c-sb*sb<1e-8)continue;
      const error=(saa/(sa*sa)-2*sab/(sa*sb)+sbb/(sb*sb))*c;
      if(error<best){second=best;best=error;bx=dx;by=dy;}else second=Math.min(second,error);
    }
    if(!Number.isFinite(best)||Math.abs(bx)===R||Math.abs(by)===R||second-best<1e-8)return {reliable:false,reason:'Registro ambiguo o fuera del rango de búsqueda. Ajusta manualmente.'};
    return {reliable:true,dx:Math.round(bx*A.scale),dy:Math.round(by*A.scale),error:best};
  }
  window.GANTRY_FRAME_CORRECTION={shift,estimate};
})();
