/* Getting around a big tree:
   - Hover a branch line: it lights up and a note says who it joins (parents above, children below).
   - Click a branch line: a small menu lets you jump to anyone on it.
   - Hover a person: their own lines light up.
   - Magnifier: when zoomed out, a lens beside the pointer shows that spot at full size.
   - Map: a mini picture of the whole tree in the corner; the box is where you are, click or drag it to move. */
export function makeExplore(o){
  // o: {stage, canvas, svg, getL, getScale, CW, CH, name(id), label(id), go(id)}
  const store={get:(k,d)=>{try{const v=localStorage.getItem(k);return v===null?d:v==='1';}catch(e){return d;}},set:(k,v)=>{try{localStorage.setItem(k,v?'1':'0');}catch(e){}}};
  let lensOn=store.get('gft-lens',true), mapOn=store.get('gft-map',true);
  const el=(tag,attrs,html)=>{const e=document.createElement(tag);for(const[k,v]of Object.entries(attrs||{}))e.setAttribute(k,v);if(html!=null)e.innerHTML=html;return e;};
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  const tip=el('div',{id:'brTip',role:'status'});tip.hidden=true;
  const pop=el('div',{id:'brPop',role:'dialog','aria-label':'Go to someone on this branch'});pop.hidden=true;
  const lens=el('div',{id:'lens','aria-hidden':'true'},'<div class="lens-in"></div><i class="lens-dot"></i><div class="lens-cap"></div>');lens.hidden=true;
  const mm=el('div',{id:'minimap'},'<div class="mm-head"><span>Map</span><label class="mm-tog"><input type="checkbox"> Magnifier</label><button class="mm-x" aria-label="Hide map">×</button></div><div class="mm-body"><canvas></canvas><div class="mm-view"></div></div>');
  const mmShow=el('button',{id:'mmShow',class:'btn small'},'Show map');
  document.body.append(tip,pop,lens,mm,mmShow);
  const lensIn=lens.querySelector('.lens-in'),lensCap=lens.querySelector('.lens-cap');
  const mmBody=mm.querySelector('.mm-body'),mmCanvas=mm.querySelector('canvas'),mmView=mm.querySelector('.mm-view'),lensBox=mm.querySelector('input');
  lensBox.checked=lensOn;
  lensBox.onchange=()=>{lensOn=lensBox.checked;store.set('gft-lens',lensOn);if(!lensOn)lens.hidden=true;};
  mm.querySelector('.mm-x').onclick=()=>{mapOn=false;store.set('gft-map',false);layoutMap();};
  mmShow.onclick=()=>{mapOn=true;store.set('gft-map',true);layoutMap();};

  let clone=null, mmScale=1, active=null; // active = currently lit branch {key,parents,kids}
  const hits=()=>[...o.svg.querySelectorAll('path.hit')];
  const inTree=id=>!!o.getL()?.nodes.get(id);

  /* ----- which branch a line belongs to ----- */
  function groupOf(d){
    if(d.k){const parents=(d.p||'').split(',').filter(Boolean);
      const kids=[...new Set(hits().filter(e=>e.dataset.p===d.p).map(e=>e.dataset.k))];
      return {key:'p:'+d.p,parents,kids,couple:false};}
    const parents=[d.a,d.b];
    const kids=[...new Set(hits().filter(e=>{const ps=(e.dataset.p||'').split(',');return e.dataset.k&&ps.includes(d.a)&&ps.includes(d.b);}).map(e=>e.dataset.k))];
    return {key:'c:'+[d.a,d.b].sort().join('|'),parents,kids,couple:true};}
  const pathInGroup=(d,g)=>{
    if(d.k){const ps=(d.p||'').split(',');return g.parents.length&&g.parents.every(p=>ps.includes(p))&&ps.length===g.parents.length;}
    return d.a&&g.parents.includes(d.a)&&g.parents.includes(d.b);};
  function paint(g,cls){
    for(const root of [o.canvas,clone].filter(Boolean)){
      root.querySelectorAll('.'+cls).forEach(e=>e.classList.remove(cls));
      if(!g)continue;const ids=new Set([...g.parents,...g.kids]);
      root.querySelectorAll('svg path:not(.hit),svg circle').forEach(e=>{if(g.person?personLine(e.dataset,g.person):pathInGroup(e.dataset,g))e.classList.add(cls);});
      root.querySelectorAll('.card').forEach(c=>{if(ids.has(c.dataset.id))c.classList.add(cls+'-on');else c.classList.remove(cls+'-on');});}
    drawMap();}
  const personLine=(d,id)=>d.k===id||(d.k&&(d.p||'').split(',').includes(id))||d.a===id||d.b===id;
  function clearPaint(cls){for(const root of [o.canvas,clone].filter(Boolean)){root.querySelectorAll('.'+cls).forEach(e=>e.classList.remove(cls));root.querySelectorAll('.'+cls+'-on').forEach(e=>e.classList.remove(cls+'-on'));}}

  const list=(ids,max)=>{const n=ids.map(id=>esc(o.name(id)));return n.length>max?n.slice(0,max).join(', ')+` and ${n.length-max} more`:n.join(n.length===2?' & ':', ');};
  function tipHtml(g){
    const top=g.couple?'Couple':'Family branch';
    const parents=g.parents.length?`<div><span class="ar">↑</span> ${g.couple?'':'Parents: '}${list(g.parents,4)}</div>`:'';
    const kids=g.kids.length?`<div><span class="ar">↓</span> ${g.kids.length===1?'Child':'Children ('+g.kids.length+')'}: ${list(g.kids,5)}</div>`:(g.couple?'<div class="mut">No children listed</div>':'');
    return `<b>${top}</b>${parents}${kids}<div class="mut">${matchMedia('(hover:hover)').matches?'Click the line to go to any of them':'Tap a name to go there'}</div>`;}
  function place(box,x,y){box.style.left='0px';box.style.top='0px';const r=box.getBoundingClientRect();
    let L=x+16,T=y+16;if(L+r.width>innerWidth-8)L=x-16-r.width;if(T+r.height>innerHeight-8)T=y-16-r.height;
    box.style.left=Math.max(8,L)+'px';box.style.top=Math.max(8,T)+'px';}

  /* ----- branch hover + click ----- */
  o.svg.addEventListener('pointerover',e=>{const t=e.target;if(!t.classList?.contains('hit')||!pop.hidden)return;
    const g=groupOf(t.dataset);active=g;paint(g,'br');tip.innerHTML=tipHtml(g);tip.hidden=false;place(tip,e.clientX,e.clientY);});
  o.svg.addEventListener('pointermove',e=>{if(!tip.hidden)place(tip,e.clientX,e.clientY);});
  o.svg.addEventListener('pointerout',e=>{if(!e.target.classList?.contains('hit'))return;tip.hidden=true;if(pop.hidden){active=null;clearPaint('br');drawMap();}});
  let down=null;
  o.svg.addEventListener('pointerdown',e=>{if(e.target.classList?.contains('hit'))down={x:e.clientX,y:e.clientY};});
  o.svg.addEventListener('click',e=>{const t=e.target;if(!t.classList?.contains('hit'))return;
    if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>5)return;e.stopPropagation();openPop(groupOf(t.dataset),e.clientX,e.clientY);});
  function openPop(g,x,y){active=g;paint(g,'br');tip.hidden=true;lens.hidden=true;
    const row=(id,dir)=>`<button data-go="${esc(id)}"${inTree(id)?'':' disabled'}><span class="ar">${dir}</span><span><b>${esc(o.name(id))}</b><small>${esc(o.label(id))}</small></span></button>`;
    pop.innerHTML=`<div class="pop-h">${g.couple?'Go to this couple or their children':'Go to someone on this branch'}<button class="pop-x" aria-label="Close">×</button></div>`+
      (g.parents.length?`<div class="pop-g">${g.couple?'Couple':'Parents'}</div>`+g.parents.map(id=>row(id,'↑')).join(''):'')+
      (g.kids.length?`<div class="pop-g">Children</div>`+g.kids.map(id=>row(id,'↓')).join(''):'');
    pop.hidden=false;place(pop,x,y);pop.querySelector('button[data-go]:not([disabled])')?.focus({preventScroll:true});}
  function closePop(){if(pop.hidden)return;pop.hidden=true;active=null;clearPaint('br');drawMap();}
  pop.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
    if(b.classList.contains('pop-x'))return closePop();
    const id=b.dataset.go;if(id){closePop();o.go(id);}});
  document.addEventListener('pointerdown',e=>{if(!pop.hidden&&!pop.contains(e.target)&&!e.target.classList?.contains('hit'))closePop();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closePop();lens.hidden=true;}});

  /* ----- hover a person: light their own lines ----- */
  o.canvas.addEventListener('pointerover',e=>{const c=e.target.closest?.('.card');if(!c||!pop.hidden)return;paint({person:c.dataset.id,parents:[],kids:[]},'pl');});
  o.canvas.addEventListener('pointerout',e=>{const c=e.target.closest?.('.card');if(!c||c.contains(e.relatedTarget))return;clearPaint('pl');});

  /* ----- magnifier ----- */
  const LW=340,LH=230;
  function ensureClone(){if(clone)return;
    clone=o.canvas.cloneNode(true);clone.removeAttribute('id');clone.style.transform='';clone.classList.add('lens-canvas');
    const s=clone.querySelector('svg');if(s){s.removeAttribute('id');s.querySelectorAll('path.hit').forEach(p=>p.remove());}
    clone.querySelectorAll('button,[tabindex]').forEach(b=>b.setAttribute('tabindex','-1'));
    lensIn.replaceChildren(clone);if(active)paint(active,'br');}
  function nearest(cx,cy){const L=o.getL();let best=null,bd=Infinity;
    for(const n of L.nodes.values()){const dx=Math.max(n.x-cx,0,cx-(n.x+o.CW)),dy=Math.max(n.y-cy,0,cy-(n.y+o.CH));const d=dx*dx+dy*dy;if(d<bd){bd=d;best=n;}}
    return best;}
  o.stage.addEventListener('pointermove',e=>{
    if(e.pointerType!=='mouse'||!lensOn||!pop.hidden||o.stage.classList.contains('dragging')){lens.hidden=true;return;}
    const sc=o.getScale(),L=o.getL();if(!L||sc>=0.85){lens.hidden=true;return;}
    const r=o.canvas.getBoundingClientRect(),cx=(e.clientX-r.left)/sc,cy=(e.clientY-r.top)/sc;
    if(cx<0||cy<0||cx>L.w||cy>L.h){lens.hidden=true;return;}
    ensureClone();const M=1;
    lensIn.firstChild.style.transform=`translate(${LW/2-cx*M}px,${LH/2-cy*M}px) scale(${M})`;
    const n=nearest(cx,cy);lensCap.textContent=n?'Near '+o.name(n.id):'';
    // sit above the pointer (the branch note sits below it); flip below if there is no room
    lens.hidden=false;let x=e.clientX-LW/2,y=e.clientY-LH-24-36;if(y<8)y=e.clientY+150;x=Math.min(Math.max(8,x),innerWidth-LW-8);
    lens.style.left=Math.max(8,x)+'px';lens.style.top=Math.max(8,y)+'px';});
  o.stage.addEventListener('pointerleave',()=>{lens.hidden=true;});
  o.stage.addEventListener('pointerdown',()=>{lens.hidden=true;});
  o.stage.addEventListener('wheel',()=>{lens.hidden=true;},{passive:true});

  /* ----- mini-map ----- */
  const cssv=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function needMap(){const L=o.getL();if(!L)return false;const sc=o.getScale();return L.w*sc>o.stage.clientWidth*1.05||L.h*sc>o.stage.clientHeight*1.05;}
  function layoutMap(){const show=needMap();mm.hidden=!(show&&mapOn);mmShow.hidden=!(show&&!mapOn);
    const sr=o.stage.getBoundingClientRect();
    for(const b of [mm,mmShow]){b.style.right=Math.max(8,innerWidth-sr.right+16)+'px';b.style.bottom=Math.max(8,innerHeight-sr.bottom+16)+'px';}
    if(!mm.hidden){const L=o.getL();const maxW=innerWidth<700?150:240,maxH=Math.max(110,Math.min(innerWidth<700?150:320,o.stage.clientHeight*0.45));
      mmScale=Math.min(maxW/L.w,maxH/L.h);const w=Math.max(60,Math.round(L.w*mmScale)),h=Math.max(40,Math.round(L.h*mmScale));
      const dpr=devicePixelRatio||1;mmCanvas.width=w*dpr;mmCanvas.height=h*dpr;mmCanvas.style.width=w+'px';mmCanvas.style.height=h+'px';mmBody.style.width=w+'px';mmBody.style.height=h+'px';
      drawMap();viewBox();}}
  function drawMap(){if(mm.hidden)return;const L=o.getL();if(!L)return;const ctx=mmCanvas.getContext('2d');const dpr=devicePixelRatio||1;
    ctx.setTransform(dpr*mmScale,0,0,dpr*mmScale,0,0);ctx.clearRect(0,0,L.w,L.h);
    ctx.strokeStyle=cssv('--wood-line');ctx.lineWidth=1.5/mmScale*0.6;
    ctx.beginPath();for(const p of o.svg.querySelectorAll('path:not(.hit)')){const nums=(p.getAttribute('d')||'').match(/-?[\d.]+/g);if(!nums)continue;
      // paths are M x y then H/V steps; trace them
      const segs=p.getAttribute('d').match(/[MHV][^MHV]*/g);let x=0,y=0;
      for(const s of segs){const v=s.slice(1).trim().split(/[\s,]+/).map(Number);if(s[0]==='M'){x=v[0];y=v[1];ctx.moveTo(x,y);}else if(s[0]==='H'){x=v[0];ctx.lineTo(x,y);}else{y=v[0];ctx.lineTo(x,y);}}}
    ctx.stroke();
    const lit=active?new Set([...active.parents,...active.kids]):null;const acc=cssv('--accent'),mut=cssv('--muted');
    for(const c of o.canvas.querySelectorAll('.card')){const n=L.nodes.get(c.dataset.id);if(!n)continue;
      const ln=(c.className.match(/\bln-(\d+)/)||[])[1];let col=c.classList.contains('k-direct')?cssv('--l0'):ln!=null&&+ln>=0?cssv('--l'+(+ln%5)):cssv('--wood-line');
      ctx.globalAlpha=lit&&!lit.has(n.id)?0.3:(c.classList.contains('k-married')?0.55:1);
      if(lit&&lit.has(n.id))col=acc;if(c.classList.contains('focus')){col=cssv('--ink');ctx.globalAlpha=1;}
      ctx.fillStyle=col;ctx.fillRect(n.x,n.y,o.CW,o.CH);
      if(c.classList.contains('focus')||c.classList.contains('sel')){ctx.globalAlpha=1;ctx.strokeStyle=acc;ctx.lineWidth=3/mmScale;ctx.strokeRect(n.x-14/mmScale*0.5,n.y-14/mmScale*0.5,o.CW+14/mmScale,o.CH+14/mmScale);}}
    ctx.globalAlpha=1;}
  function viewBox(){if(mm.hidden)return;const sc=o.getScale(),st=o.stage;
    const x=st.scrollLeft/sc*mmScale,y=st.scrollTop/sc*mmScale,w=st.clientWidth/sc*mmScale,h=st.clientHeight/sc*mmScale;
    Object.assign(mmView.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px'});}
  let raf=0;o.stage.addEventListener('scroll',()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;viewBox();});},{passive:true});
  let mdrag=false;
  const jump=(e,smooth)=>{const r=mmBody.getBoundingClientRect(),sc=o.getScale();const cx=(e.clientX-r.left)/mmScale,cy=(e.clientY-r.top)/mmScale;
    o.stage.scrollTo({left:cx*sc-o.stage.clientWidth/2,top:cy*sc-o.stage.clientHeight/2,behavior:smooth?'smooth':'auto'});};
  mmBody.addEventListener('pointerdown',e=>{mdrag=true;mmBody.setPointerCapture(e.pointerId);jump(e,false);e.preventDefault();});
  mmBody.addEventListener('pointermove',e=>{if(mdrag)jump(e,false);});
  mmBody.addEventListener('pointerup',()=>{mdrag=false;});
  window.addEventListener('resize',()=>layoutMap());
  if(window.ResizeObserver)new ResizeObserver(()=>layoutMap()).observe(o.stage);

  return {
    openGroup(g,x,y){openPop({couple:false,...g},x,y);},
    rendered(){clone=null;lensIn.replaceChildren();closePop();tip.hidden=true;lens.hidden=true;layoutMap();},
    rescaled(){lens.hidden=true;layoutMap();},
    refreshMarks(){if(clone){clone=null;lensIn.replaceChildren();}drawMap();}
  };
}
