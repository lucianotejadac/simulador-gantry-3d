/* Local count inspection. Never changes acquisition arrays or resamples images. */
(function(){
  'use strict';
  const views=new WeakMap(),fmt=v=>v.toLocaleString('es-CL',{maximumFractionDigits:2});
  function compare(counts,w,h,u=.5,v=.5){
    if(![128,256,512,1024].includes(w)||counts.length!==w*h||h<4)throw Error('Matriz incompatible');
    const scale=w/128,cols=Math.floor(w/scale),rows=Math.floor(h/scale);
    const x=Math.max(0,Math.min(cols-2,Math.floor(u*cols)-1));
    const y=Math.max(0,Math.min(rows-2,Math.floor(v*rows)-1));
    const coarse=new Float64Array(4),fine=new Float64Array(16);
    if(w>=256){
      const bin=w/256;
      for(let j=0;j<4;j++)for(let i=0;i<4;i++){
        let value=0;
        for(let dy=0;dy<bin;dy++)for(let dx=0;dx<bin;dx++)value+=counts[(y*scale+j*bin+dy)*w+x*scale+i*bin+dx];
        fine[j*4+i]=value;
        coarse[Math.floor(j/2)*2+Math.floor(i/2)]+=value;
      }
    }else{
      for(let j=0;j<2;j++)for(let i=0;i<2;i++)coarse[j*2+i]=counts[(y+j)*w+x+i];
      for(let j=0;j<4;j++)for(let i=0;i<4;i++)fine[j*4+i]=coarse[Math.floor(j/2)*2+Math.floor(i/2)]/4;
    }
    return {coarse,fine,total:coarse.reduce((a,b)=>a+b,0),x:x*scale,y:y*scale,size:2*scale,w,h};
  }
  function peak(counts,w,h){let at=0;for(let i=1;i<counts.length;i++)if(counts[i]>counts[at])at=i;return [(at%w+.5)/w,(Math.floor(at/w)+.5)/h];}
  function mount(canvas){
    if(views.has(canvas))return views.get(canvas);
    const wrapper=document.createElement('div');wrapper.className='pixel-inspector';
    const picture=document.createElement('div');picture.className='pixel-picture';
    canvas.parentNode.insertBefore(wrapper,canvas);wrapper.append(picture);picture.append(canvas);
    const marker=document.createElement('div');marker.className='pixel-region';marker.hidden=true;picture.append(marker);
    const aside=document.createElement('details');aside.className='pixel-panel';
    aside.setAttribute('aria-label','Cuentas por píxel de '+(canvas.getAttribute('aria-label')||canvas.id));
    aside.innerHTML='<summary>Análisis cuantitativo comparativo de matrices</summary><div class="pixel-content"><strong>Cuentas por píxel</strong><span class="pixel-hint">Misma zona, mismo total</span>'+
      '<div class="pixel-empty">Se mostrará al adquirir.</div><div class="pixel-data" hidden>'+
      '<table><caption></caption><tbody></tbody></table><table><caption></caption><tbody></tbody></table>'+
      '<div class="pixel-total"></div><div class="pixel-note"></div></div>'+
      '<button type="button" class="live-setting">Zona con más cuentas</button><span class="pixel-hint">Clic en la imagen: elegir zona.</span></div>';
    wrapper.append(aside);
    const tables=[...aside.querySelectorAll('table')];
    const cells=tables.map((table,k)=>{
      const n=k?4:2,items=[];
      for(let j=0;j<n;j++){const row=document.createElement('tr');table.tBodies[0].append(row);
        for(let i=0;i<n;i++){const cell=document.createElement('td');row.append(cell);items.push(cell);}}
      return items;
    });
    const view={canvas,wrapper,picture,marker,aside,tables,cells,point:null,data:null};views.set(canvas,view);
    aside.querySelector('button').onclick=()=>{if(!view.data)return;view.point=peak(view.data.counts,view.data.w,view.data.h);paint(view);};
    canvas.addEventListener('click',event=>{
      if(!view.data||document.getElementById('liveRecenter')?.getAttribute('aria-pressed')==='true')return;
      const r=canvas.getBoundingClientRect(),s=Math.min(r.width/view.data.w,r.height/view.data.h);
      const u=(event.clientX-r.left-(r.width-view.data.w*s)/2)/(view.data.w*s);
      const v=(event.clientY-r.top-(r.height-view.data.h*s)/2)/(view.data.h*s);
      if(u<0||u>=1||v<0||v>=1)return;
      view.point=[u,v];paint(view);
    });
    new ResizeObserver(()=>position(view)).observe(picture);
    return view;
  }
  function position(view){
    if(!view.patch)return;
    const {canvas,picture,marker,patch:p}=view,r=canvas.getBoundingClientRect(),box=picture.getBoundingClientRect();
    const s=Math.min(r.width/p.w,r.height/p.h);
    Object.assign(marker.style,{left:(r.left-box.left+(r.width-p.w*s)/2+p.x*s)+'px',top:(r.top-box.top+(r.height-p.h*s)/2+p.y*s)+'px',width:p.size*s+'px',height:p.size*s+'px'});
  }
  function scaleLabel(n){return n+'×'+n;}
  function paint(view){
    const {counts,w,h}=view.data;
    if(!view.point&&counts.some(v=>v>0))view.point=peak(counts,w,h);
    const p=compare(counts,w,h,...(view.point||[.5,.5]));view.patch=p;
    view.aside.querySelector('.pixel-empty').hidden=true;view.aside.querySelector('.pixel-data').hidden=false;
    view.marker.hidden=false;
    view.tables[0].caption.textContent='128 · '+(w===128?'original':'suma '+scaleLabel(w/128));
    view.tables[1].caption.textContent='256 · '+(w===256?'original':w>256?'suma '+scaleLabel(w/256):'ilustrativo');
    [p.coarse,p.fine].forEach((values,k)=>{
      const max=Math.max(1,...values);
      values.forEach((value,i)=>{const cell=view.cells[k][i];cell.textContent=fmt(value);cell.title=value+' cuentas';cell.style.backgroundColor='rgba(45,179,139,'+(.07+.55*value/max)+')';});
    });
    view.aside.querySelector('.pixel-total').textContent='Zona: '+fmt(p.total)+' cuentas\nMedia 128: '+fmt(p.total/4)+' c/píxel\nMedia 256: '+fmt(p.total/16)+' c/píxel'+(w>256?'\nMedia '+w+': '+fmt(p.total/(p.size*p.size))+' c/píxel':'');
    view.aside.querySelector('.pixel-note').textContent=w>256?'Matriz original '+w+'×'+h+'. Las celdas de 128 y 256 suman cuentas reales de la misma zona; no se añade detalle.':w===256?'Cada celda de 128 suma cuatro píxeles de la imagen en 256.':'256 reparte cada cuenta en cuatro partes iguales: ilustración, no una nueva adquisición ni detalle recuperado.';
    position(view);
  }
  function render(canvas,counts,w,h=w){
    const view=mount(canvas);view.data={counts,w,h};paint(view);
  }
  function clear(canvas){
    const view=mount(canvas);view.data=null;view.patch=null;view.point=null;view.marker.hidden=true;
    view.aside.querySelector('.pixel-empty').hidden=false;view.aside.querySelector('.pixel-data').hidden=true;
  }
  window.GANTRY_PIXEL_GRID={compare,render,clear};
})();
