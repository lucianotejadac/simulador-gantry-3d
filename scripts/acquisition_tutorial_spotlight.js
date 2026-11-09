/* A viewport spotlight works across the same-origin Examen iframe. */
(function(){
  'use strict';
  const ns='http://www.w3.org/2000/svg';let active=null,raf=0;
  const node=(tag,attrs={})=>{const n=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);return n;};
  const intersect=(a,b)=>({left:Math.max(a.left,b.left),top:Math.max(a.top,b.top),right:Math.min(a.right,b.right),bottom:Math.min(a.bottom,b.bottom)});
  function screenRect(target){
    if(!target.isConnected||!target.getClientRects().length)return null;
    let win=target.ownerDocument.defaultView,r=target.getBoundingClientRect();
    // Respect scroll panels: the hole must not expose an unrelated control.
    for(let p=target.parentElement;p;p=p.parentElement){
      const s=win.getComputedStyle(p);if(/auto|scroll|hidden|clip/.test(s.overflow+s.overflowX+s.overflowY))r=intersect(r,p.getBoundingClientRect());
    }
    r=intersect(r,{left:0,top:0,right:win.innerWidth,bottom:win.innerHeight});
    if(win!==window){
      const f=win.frameElement;if(!f?.getClientRects().length)return null;
      const b=f.getBoundingClientRect(),sx=b.width/f.offsetWidth,sy=b.height/f.offsetHeight;
      r={left:b.left+(f.clientLeft+r.left)*sx,right:b.left+(f.clientLeft+r.right)*sx,top:b.top+(f.clientTop+r.top)*sy,bottom:b.top+(f.clientTop+r.bottom)*sy};
    }
    r=intersect(r,{left:0,top:0,right:innerWidth,bottom:innerHeight});
    return r.right>r.left&&r.bottom>r.top?r:null;
  }
  function hide(){
    if(!active)return;
    cancelAnimationFrame(raf);active.events.abort();active.svg.remove();
    active.target.classList.remove('acquisition-tutorial-highlight');
    active.animation?.cancel();
    const panel=document.getElementById('acquisitionTutorialPanel');
    panel.classList.remove('tutorial-collapsing');
    if(!document.getElementById('acquisitionTutorialCompact').hidden)panel.hidden=true;
    document.getElementById('acquisitionTutorialCompact').removeAttribute('style');active=null;
  }
  function edge(r,point){
    const x=(r.left+r.right)/2,y=(r.top+r.bottom)/2,dx=point.x-x,dy=point.y-y;
    const scale=1/Math.max(Math.abs(dx)/Math.max(1,(r.right-r.left)/2),Math.abs(dy)/Math.max(1,(r.bottom-r.top)/2),1);
    return {x:x+dx*scale,y:y+dy*scale};
  }
  function show(target,minimize){
    hide();
    const panel=document.getElementById('acquisitionTutorialPanel'),compact=document.getElementById('acquisitionTutorialCompact'),origin=panel.getBoundingClientRect();
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    minimize();
    const destination=compact.getBoundingClientRect();
    const svg=node('svg',{id:'acquisitionTutorialSpotlight','aria-hidden':'true'}),shade=node('path',{'fill-rule':'evenodd',fill:'#020b16',opacity:'.76'}),ring=node('rect',{rx:5,fill:'none',stroke:'#ffd84d','stroke-width':3}),route=node('path',{fill:'none',stroke:'#ffd84d','stroke-width':2,opacity:'.25','stroke-dasharray':'6 7'});
    const trail=node('g'),head=node('path',{d:'M -17 -8 L 1 0 L -17 8 L -11 0 Z',fill:'#fff2a2',stroke:'#ffce35','stroke-width':2});
    const tails=Array.from({length:14},(_,i)=>{const p=node('path',{fill:'none',stroke:'#ffdc58','stroke-width':2+i*.24,opacity:.07+i*.065,'stroke-linecap':'round'});trail.append(p);return p;});
    svg.append(shade,ring,route,trail,head);document.body.append(svg);
    const events=new AbortController(),start=performance.now();active={svg,target,events};target.classList.add('acquisition-tutorial-highlight');
    if(!reduced){
      panel.hidden=false;panel.classList.add('tutorial-collapsing');
      const animation=panel.animate([{transform:'none',opacity:1},{transform:`translate(${destination.left-origin.left}px,${destination.top-origin.top}px) scale(${destination.width/origin.width},${destination.height/origin.height})`,opacity:0}],{duration:420,easing:'ease-in',fill:'forwards'});
      active.animation=animation;
      animation.finished.then(()=>{panel.hidden=true;panel.classList.remove('tutorial-collapsing');animation.cancel();}).catch(()=>{});
    }
    for(const doc of new Set([document,target.ownerDocument])){
      doc.addEventListener('pointerdown',hide,{capture:true,signal:events.signal});
      doc.addEventListener('keydown',hide,{capture:true,signal:events.signal});
    }
    function tick(now){
      if(!active)return;
      const r=screenRect(target);if(!r||now-start>8000){hide();return;}
      const pad=7,x=Math.max(1,r.left-pad),y=Math.max(1,r.top-pad),w=Math.min(innerWidth-1,r.right+pad)-x,h=Math.min(innerHeight-1,r.bottom+pad)-y;
      svg.setAttribute('viewBox',`0 0 ${innerWidth} ${innerHeight}`);
      shade.setAttribute('d',`M0 0H${innerWidth}V${innerHeight}H0Z M${x} ${y}H${x+w}V${y+h}H${x}Z`);
      for(const [k,v] of Object.entries({x,y,width:w,height:h}))ring.setAttribute(k,v);
      let bar=compact.getBoundingClientRect();
      if(Math.min(bar.right,r.right)>Math.max(bar.left,r.left)&&Math.min(bar.bottom,r.bottom)>Math.max(bar.top,r.top)){
        compact.style.right='auto';compact.style.left='14px';bar=compact.getBoundingClientRect();
        if(Math.min(bar.right,r.right)>Math.max(bar.left,r.left)&&Math.min(bar.bottom,r.bottom)>Math.max(bar.top,r.top)){compact.style.bottom='auto';compact.style.top='45px';bar=compact.getBoundingClientRect();}
      }
      const t=reduced?1:Math.min(1,(now-start)/420),from={};
      for(const k of ['left','right','top','bottom'])from[k]=origin[k]+(bar[k]-origin[k])*t;
      const a=edge(from,{x:(r.left+r.right)/2,y:(r.top+r.bottom)/2}),b=edge({left:x,top:y,right:x+w,bottom:y+h},a),bend=(a.x+b.x)/2;
      route.setAttribute('d',`M${a.x} ${a.y} C${bend} ${a.y},${bend} ${b.y},${b.x} ${b.y}`);
      const length=route.getTotalLength(),progress=reduced?1:Math.min(1,((now-start)%1900)/1300),end=length*progress,tail=Math.min(130,length*.3);
      for(let i=0;i<tails.length;i++){
        const p=route.getPointAtLength(Math.max(0,end-tail*(14-i)/14)),q=route.getPointAtLength(Math.max(0,end-tail*(13-i)/14));
        tails[i].setAttribute('d',`M${p.x} ${p.y}L${q.x} ${q.y}`);
      }
      const p=route.getPointAtLength(end),q=route.getPointAtLength(Math.max(0,end-2)),angle=Math.atan2(p.y-q.y,p.x-q.x)*180/Math.PI;
      head.setAttribute('transform',`translate(${p.x} ${p.y}) rotate(${angle})`);
      raf=requestAnimationFrame(tick);
    }
    raf=requestAnimationFrame(tick);
  }
  window.GANTRY_TUTORIAL_SPOTLIGHT={show,hide};
})();
