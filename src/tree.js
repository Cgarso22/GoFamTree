let CTX=null;

let CW=196, CH=120, GX=22, RH=164, CG=70, RG=14, SPI=30, MAXUP=5, MAXDOWN=3;
const S={contacts:new Map(),hiddenContacts:new Map(),people:new Map(),unions:new Map(),loaded:{p:false,u:false},focus:null,sel:null,scale:innerWidth<600?0.8:1,view:(()=>{try{return localStorage.getItem('gft-view')||'centered';}catch(e){return 'centered';}})(),colorBy:(()=>{try{return localStorage.getItem('gft-color')||'relation';}catch(e){return 'relation';}})(),
  side:(()=>{try{return localStorage.getItem('gft-side')||'father';}catch(e){return 'father';}})(),
  cousins:(()=>{try{return +(localStorage.getItem('gft-cousins')??1);}catch(e){return 1;}})(),tab:'person',editing:null,
  db:null,user:null,assets:null,downloads:null,isOwner:false,uid:null,canWrite:null,suggest:[],mine:null,names:{}};
const $=id=>document.getElementById(id);
function h(tag,props,...kids){const el=document.createElement(tag);if(props)for(const[k,v]of Object.entries(props)){
  if(v==null||v===false)continue; if(k==='text')el.textContent=v; else if(k==='class')el.className=v;
  else if(k.startsWith('on'))el.addEventListener(k.slice(2),v); else if(k==='style')el.setAttribute('style',v); else el.setAttribute(k,v===true?'':v);}
  for(const c of kids.flat()){if(c==null||c===false)continue;el.append(c.nodeType?c:document.createTextNode(String(c)));}return el;}
function toast(msg){const t=$('toast');t.textContent=msg;t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>t.hidden=true,2600);}
const P=id=>S.people.get(id);
const nameOf=id=>P(id)?.name||'Unknown';
const joinName=(a,b,c)=>[a,b,c].map(x=>String(x||'').trim()).filter(Boolean).join(' ');
// how a person appears on the tree: real name, with the nickname in quotes when there is one
// full real name (first, middle, last); the nickname goes in quotes after the first name only when "show on tree" is on
const showNick=p=>!!p.nick&&p.showNick!==false;
function cardName(p){if(!p.first&&!p.last)return p.name;return joinName(joinName(p.first,p.middle,showNick(p)?'“'+p.nick+'”':''),'',p.last);}
const isUnknown=p=>!p||/\?/.test(p.name||'')||p.placeholder;
const yearOf=s=>{const m=String(s||'').match(/\b(1[6-9]\d\d|20\d\d)\b/);return m?m[1]:null;};
function lifespan(p){const b=yearOf(p.born),d=yearOf(p.died);
  if(p.deceased||p.died){return (b||'?')+' – '+(d||'?');} return b?'b. '+b:(p.born?'b. '+p.born:'b. ?');}
const clean=s=>String(s||'').trim();
function cardDates(p){if(p._masked)return[p._minor?'Under 18 · private':'Details private'];const b=clean(p.born),d=clean(p.died);
  if(p.deceased||d)return ['b. '+(b||'?'),'d. '+(d||'?')];return ['b. '+(b||'?')];}
function initials(n){return String(n||'?').replace(/[“”"()?]/g,'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()||'?';}
const blob=id=>CTX.url(id);
const STAGES=[['child','Childhood'],['adult','Adult'],['older','Later in life']];
const MILESTONES=['Birth','Baby naming / bris','First birthday','First day of school','Bar Mitzvah','Bat Mitzvah','High school graduation','College graduation','Engagement','Wedding','Birth of a child','Military service','New home','Retirement','Anniversary','Family gathering','Holiday'];
function galleryOf(p){if(Array.isArray(p?.gallery))return p.gallery;const ph=p?.photos||{};return STAGES.filter(([s])=>ph[s]).map(([s])=>({id:ph[s],stage:s}));}
// where to center a photo when it's cropped to a circle: the face, if we know it
function facePos(p,id){const g=galleryOf(p).find(x=>x.id===id);const f=g?.face;return f?`${Math.round(f.x)}% ${Math.round(f.y)}%`:'50% 28%';}
function portraitOf(p){if(p.portrait)return p.portrait;const g=galleryOf(p).filter(x=>!x.notPortrait);return (g.find(x=>x.stage==='adult')||g.find(x=>x.stage==='older')||g[0]||{}).id;}
function photoAge(p,ph){if(ph.age)return String(ph.age);const by=+yearOf(p.born),y=+ph.year;return by&&y&&y>=by?String(y-by):'';}
function photoLine(p,ph){const a=photoAge(p,ph);return [a&&('Age ~'+a),ph.year,ph.milestone].filter(Boolean).join(' · ');}
const PERIODS=[['child','Childhood'],['adult','Adult life'],['older','Later in life'],['general','Any time']];
const periodLabel=k=>(PERIODS.find(x=>x[0]===k)||[,''])[1];
const storiesOf=p=>Array.isArray(p?.stories)?p.stories:[];
function mediaEl(st){if(!st.audioId)return null;return String(st.mediaType||'').startsWith('video/')&&st.isVideo?h('video',{controls:true,preload:'metadata',src:blob(st.audioId)}):h('audio',{controls:true,preload:'metadata',src:blob(st.audioId)});}
const REC={blob:null,rec:null,chunks:[]};
function recorderBox(){REC.blob=null;const status=h('span',{class:'live'});const play=h('div');
  const btn=h('button',{type:'button',class:'btn small',text:'● Record a voice message',onclick:async()=>{
    if(REC.rec&&REC.rec.state==='recording'){REC.rec.stop();return;}
    try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const mime=['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(t=>MediaRecorder.isTypeSupported?.(t))||'';
      REC.chunks=[];REC.rec=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);
      REC.rec.ondataavailable=e=>{if(e.data.size)REC.chunks.push(e.data);};
      REC.rec.onstop=()=>{stream.getTracks().forEach(t=>t.stop());REC.blob=new Blob(REC.chunks,{type:REC.rec.mimeType||'audio/webm'});
        btn.textContent='● Record again';status.textContent='Recorded. Listen back, then save.';play.replaceChildren(h('audio',{controls:true,src:URL.createObjectURL(REC.blob)}));};
      REC.rec.start();btn.textContent='■ Stop recording';status.textContent='Recording…';}
    catch(e){status.textContent='Microphone access was blocked. Allow it in your browser to record.';}}});
  return h('div',{class:'mic',style:'flex-wrap:wrap'},btn,status,play);}
function storyCard(p,st){const ph=st.photoId&&galleryOf(p).find(x=>x.id===st.photoId);
  const meta=[periodLabel(st.period),st.by&&('from '+st.by),st.audioId&&(st.isVideo?'video':'voice message')].filter(Boolean).join(' · ');
  let armed=false;
  return h('div',{class:'story'},h('div',{class:'st-h'},ph?h('button',{class:'st-th',style:`background-image:url("${blob(ph.id)}")`,'aria-label':'Open the photo',onclick:()=>openPhoto(p.id,ph.id)}):null,
      h('div',{style:'min-width:0;flex:1'},h('div',{class:'st-t',text:st.title||'Untitled'}),meta?h('div',{class:'st-m',text:meta}):null)),
    mediaEl(st),st.text?h('div',{class:'st-x',text:st.text}):null,
    mode()==='edit'?h('div',null,h('button',{class:'btn small danger',onclick:async e=>{if(!armed){armed=true;e.target.textContent='Tap again to remove';return;}await removeStory(p.id,st.id);},text:'Remove'})):null);}
async function removeStory(pid,sid){try{const ref=S.db.doc('people/'+pid);const cur=(await ref.get()).data()||{};const st=storiesOf(cur).find(x=>x.id===sid);
  await ref.update({stories:storiesOf(cur).filter(x=>x.id!==sid)});if(st?.audioId&&S.assets)S.assets.delete(st.audioId).catch(()=>{});toast('Removed');}catch(e){toast('Couldn’t remove it');}}
const jobLine=j=>[[j.role,j.company].filter(Boolean).join(', '),(j.from&&!j.to)?'from '+j.from:(j.from||j.to)?(j.from||'?')+'–'+j.to:''].filter(Boolean).join(' · ');
function workFacts(p,fact){const js=Array.isArray(p.jobs)&&p.jobs.length?p.jobs:(p.occupation?[{role:p.occupation}]:[]);
  return js.length?js.flatMap((j,i)=>fact(i?'':'Work',jobLine(j))):fact('Work','');}
function eduFacts(p,fact){const j=(...a)=>a.filter(Boolean).join(' · ');
  const rows=[['High school',j(p.hsSchool||p.eduHs,p.hsYear)],['College',j([p.colDegree,p.colSchool||p.eduCollege].filter(Boolean).join(', '),p.colYear)],
    ['Graduate',j([p.gradDegree,p.gradSchool||p.eduGrad].filter(Boolean).join(', '),p.gradYear)],['Other',p.eduOther||p.education]].filter(x=>x[1]);
  return rows.length?rows.flatMap(([k,v])=>fact(k,v)):fact('Education','');}
const US_STATES='AL Alabama|AK Alaska|AZ Arizona|AR Arkansas|CA California|CO Colorado|CT Connecticut|DE Delaware|DC District of Columbia|FL Florida|GA Georgia|HI Hawaii|ID Idaho|IL Illinois|IN Indiana|IA Iowa|KS Kansas|KY Kentucky|LA Louisiana|ME Maine|MD Maryland|MA Massachusetts|MI Michigan|MN Minnesota|MS Mississippi|MO Missouri|MT Montana|NE Nebraska|NV Nevada|NH New Hampshire|NJ New Jersey|NM New Mexico|NY New York|NC North Carolina|ND North Dakota|OH Ohio|OK Oklahoma|OR Oregon|PA Pennsylvania|RI Rhode Island|SC South Carolina|SD South Dakota|TN Tennessee|TX Texas|UT Utah|VT Vermont|VA Virginia|WA Washington|WV West Virginia|WI Wisconsin|WY Wyoming|PR Puerto Rico|GU Guam|VI U.S. Virgin Islands'.split('|').map(x=>[x.slice(0,2),x.slice(3)]);
const COUNTRIES_TOP=['USA','Israel','Canada','Poland','Russia','Ukraine','Belarus','Lithuania','Hungary','Romania','Germany','Austria','Morocco','United Kingdom'];
const COUNTRIES=[...COUNTRIES_TOP,...'Afghanistan|Albania|Algeria|Andorra|Angola|Antigua and Barbuda|Argentina|Armenia|Australia|Austria|Azerbaijan|Bahamas|Bahrain|Bangladesh|Barbados|Belarus|Belgium|Belize|Benin|Bhutan|Bolivia|Bosnia and Herzegovina|Botswana|Brazil|Brunei|Bulgaria|Burkina Faso|Burundi|Cambodia|Cameroon|Canada|Cape Verde|Central African Republic|Chad|Chile|China|Colombia|Comoros|Congo|Costa Rica|Croatia|Cuba|Cyprus|Czech Republic|Czechoslovakia (historic)|Denmark|Djibouti|Dominica|Dominican Republic|Ecuador|Egypt|El Salvador|Equatorial Guinea|Eritrea|Estonia|Eswatini|Ethiopia|Fiji|Finland|France|Gabon|Gambia|Georgia|Germany|Ghana|Greece|Grenada|Guatemala|Guinea|Guinea-Bissau|Guyana|Haiti|Honduras|Hungary|Iceland|India|Indonesia|Iran|Iraq|Ireland|Israel|Italy|Ivory Coast|Jamaica|Japan|Jordan|Kazakhstan|Kenya|Kiribati|Kosovo|Kuwait|Kyrgyzstan|Laos|Latvia|Lebanon|Lesotho|Liberia|Libya|Liechtenstein|Lithuania|Luxembourg|Madagascar|Malawi|Malaysia|Maldives|Mali|Malta|Marshall Islands|Mauritania|Mauritius|Mexico|Micronesia|Moldova|Monaco|Mongolia|Montenegro|Morocco|Mozambique|Myanmar|Namibia|Nauru|Nepal|Netherlands|New Zealand|Nicaragua|Niger|Nigeria|North Korea|North Macedonia|Norway|Oman|Pakistan|Palau|Panama|Papua New Guinea|Paraguay|Peru|Philippines|Poland|Portugal|Qatar|Romania|Russia|Russian Empire (historic)|Rwanda|Saint Kitts and Nevis|Saint Lucia|Saint Vincent and the Grenadines|Samoa|San Marino|Sao Tome and Principe|Saudi Arabia|Senegal|Serbia|Seychelles|Sierra Leone|Singapore|Slovakia|Slovenia|Solomon Islands|Somalia|South Africa|South Korea|South Sudan|Spain|Sri Lanka|Sudan|Suriname|Sweden|Switzerland|Syria|Taiwan|Tajikistan|Tanzania|Thailand|Timor-Leste|Togo|Tonga|Trinidad and Tobago|Tunisia|Turkey|Turkmenistan|Tuvalu|Uganda|Ukraine|United Arab Emirates|United Kingdom|Uruguay|USSR (historic)|Uzbekistan|Vanuatu|Vatican City|Venezuela|Vietnam|Yemen|Yugoslavia (historic)|Zambia|Zimbabwe|Austria-Hungary (historic)'.split('|').filter(c=>!COUNTRIES_TOP.includes(c)).sort()];
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];const THIS_YEAR=new Date().getFullYear();
function yearSelect(attrs,value,opt={}){const v=value==null?'':String(value);const ys=[];for(let y=THIS_YEAR;y>=1700;y--)ys.push(String(y));
  const extra=v&&v!=='present'&&!ys.includes(v)?[v]:[];return h('select',attrs,h('option',{value:''},opt.label||'Year'),opt.present?h('option',{value:'present',selected:v==='present'},'Present'):null,
    extra.map(x=>h('option',{value:x,selected:true},x)),ys.map(y=>h('option',{value:y,selected:v===y},y)));}
function parseDate(s){s=String(s||'');const o={};const y=s.match(/\b(1[6-9]\d\d|20\d\d)\b/);if(y)o.y=y[1];
  const m=s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?/i);if(m){o.m=MONTHS.findIndex(x=>x.toLowerCase()===m[1].toLowerCase())+1;const d=s.slice(m.index+m[0].length).match(/^\s*(\d{1,2})\b/);if(d&&+d[1]<=31)o.d=+d[1];}
  else{const n=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(n){o.m=+n[1];o.d=+n[2];o.y=n[3];}}return o;}
function fmtDate(m,d,y){const M=m?MONTHS[m-1]:'';if(y){if(M&&d)return M+' '+d+', '+y;if(M)return M+' '+y;return y;}if(M&&d)return M+' '+d;return M||'';}
function dateField(attrs,value){const o=parseDate(value);const hid=h('input',{type:'hidden',...attrs,value:value||''});
  const mS=h('select',{'aria-label':'Month'},h('option',{value:''},'Month'),MONTHS.map((m,i)=>h('option',{value:i+1,selected:o.m===i+1},m)));
  const dS=h('select',{'aria-label':'Day'},h('option',{value:''},'Day'),[...Array(31)].map((_,i)=>h('option',{value:i+1,selected:o.d===i+1},i+1)));
  const yS=yearSelect({'aria-label':'Year'},o.y);const sync=()=>{hid.value=fmtDate(+mS.value,+dS.value,yS.value);};[mS,dS,yS].forEach(x=>x.addEventListener('change',sync));
  return h('div',{class:'date-r'},mS,dS,yS,hid);}
const isUS=c=>!c||/^(usa|us|u\.s\.a?\.?|united states( of america)?|america)$/i.test(String(c).trim());
function parseLoc(v){if(!v)return{};if(typeof v==='object')return v;const parts=String(v).split(',').map(x=>x.trim()).filter(Boolean);const o={};
  if(parts.length){o.city=parts[0];}if(parts[1]){const up=parts[1].toUpperCase();if(US_STATES.some(([a])=>a===up)){o.state=up;o.country=parts[2]||'USA';}else if(parts.length===2){o.country=parts[1];}else{o.state=parts[1];o.country=parts[2];}}return o;}
function locStr(v){if(!v)return'';if(typeof v==='string')return v;return[v.city,v.state,v.country].filter(Boolean).join(', ');}
function locInput(key,label,v){const o=parseLoc(v);const country=o.country||'';const us=isUS(country);
  const sel=h('select',{id:'L-'+key+'-st','aria-label':label+' state',hidden:!us},h('option',{value:''},'State'),US_STATES.map(([a,n])=>h('option',{value:a,selected:o.state===a},a+' – '+n)));
  const reg=h('input',{id:'L-'+key+'-rg',placeholder:'State / region','aria-label':label+' region',hidden:us,value:us?'':(o.state||'')});
  const cur=isUS(country)?'USA':country;const ctry=h('select',{id:'L-'+key+'-co','aria-label':label+' country',onchange:e=>{const u=isUS(e.target.value);sel.hidden=!u;reg.hidden=u;}},
    cur&&!COUNTRIES.includes(cur)?h('option',{value:cur,selected:true},cur):null,COUNTRIES.map((c,i)=>h('option',{value:c,selected:c===cur},c)),h('option',{disabled:true,value:''},'──────'));
  return h('div',{class:'loc'},h('div',{class:'loc-l',text:label}),h('div',{class:'loc-r'},h('input',{id:'L-'+key+'-ci',placeholder:'City','aria-label':label+' city',value:o.city||''}),sel,reg,ctry));}
function readLoc(key){if(!$('L-'+key+'-ci'))return null;const co=$('L-'+key+'-co').value.trim();const o={city:$('L-'+key+'-ci').value.trim(),
  state:isUS(co)?$('L-'+key+'-st').value:$('L-'+key+'-rg').value.trim(),country:co};
  if(!o.city&&!o.state)return'';if(isUS(co))o.country='USA';return Object.fromEntries(Object.entries(o).filter(([,v])=>v));}
function contactBlock(c){if(!c)return null;const rows=[];
  const cityLine=[[c.addr?.city,c.addr?.state].filter(Boolean).join(', '),c.zip].filter(Boolean).join(' ');
  const addr=[c.street,cityLine,c.addr&&!isUS(c.addr.country)?c.addr.country:''].filter(Boolean).join('\n');
  const copyBtn=t=>h('button',{type:'button',class:'btn small ghost',text:'Copy',onclick:e=>{navigator.clipboard?.writeText(t).then(()=>toast('Copied'),()=>toast('Select the text to copy it'));}});
  if(addr)rows.push(h('dt',{text:'Address'}),h('dd',{style:'white-space:pre-line'},addr,' ',copyBtn(addr.replace(/\n/g,', '))));
  if(c.email)rows.push(h('dt',{text:'Email'}),h('dd',null,h('a',{href:'mailto:'+c.email,text:c.email}),' ',copyBtn(c.email)));
  if(c.phone)rows.push(h('dt',{text:'Phone'}),h('dd',null,h('a',{href:'tel:'+c.phone.replace(/[^\d+]/g,''),text:c.phone}),' ',copyBtn(c.phone)));
  return rows.length?h('dl',{class:'facts'},rows):null;}
const sameLoc=(a,b)=>JSON.stringify(a||'')===JSON.stringify(b||'');
const byPhotoAge=p=>(a,b)=>(+photoAge(p,a)||999)-(+photoAge(p,b)||999);

/* ---------- relationships ---------- */
const parentsOf=id=>(P(id)?.parents||[]).filter(x=>S.people.has(x));
function childrenOf(id){const out=[];for(const p of S.people.values())if((p.parents||[]).includes(id))out.push(p.id);return out.sort(byBirth);}
function byBirth(a,b){const ya=+yearOf(P(a)?.born)||9999,yb=+yearOf(P(b)?.born)||9999;return ya-yb||nameOf(a).localeCompare(nameOf(b));}
function unionsOf(id){return [...S.unions.values()].filter(u=>u.a===id||u.b===id).sort((x,y)=>(x.order||0)-(y.order||0));}
const other=(u,id)=>u.a===id?u.b:u.a;
function spousesOf(id){return unionsOf(id).map(u=>other(u,id)).filter(x=>S.people.has(x));}
function siblingsOf(id){const ps=parentsOf(id);if(!ps.length)return[];const s=new Set();for(const p of ps)for(const c of childrenOf(p))if(c!==id)s.add(c);return [...s].sort(byBirth);}
function ancMap(id){const m=new Map([[id,0]]);const q=[id];while(q.length){const c=q.shift();for(const p of parentsOf(c))if(!m.has(p)){m.set(p,m.get(c)+1);q.push(p);}}return m;}
const G=(id,m,f,n)=>{const g=P(id)?.g;return g==='m'?m:g==='f'?f:n;};
const ord=n=>n+(['th','st','nd','rd'][(n%100>10&&n%100<14)?0:n%10]||'th');
function greats(n){return n<=0?'':n===1?'great-':n+'× great-';}
function bloodLabel(F,Pid,AF){
  const AP=ancMap(Pid);let best=null;
  for(const[c,dp]of AP){if(AF.has(c)){const df=AF.get(c);if(!best||df+dp<best.df+best.dp)best={c,df,dp};}}
  if(!best)return null;const{df,dp}=best;
  if(dp===0){if(df===1)return{l:G(Pid,'Father','Mother','Parent'),cat:0,r:1};
    return{l:greats(df-2)+G(Pid,'grandfather','grandmother','grandparent'),cat:0,r:df};}
  if(df===0){if(dp===1)return{l:G(Pid,'Son','Daughter','Child'),cat:3,r:1};
    return{l:greats(dp-2)+G(Pid,'grandson','granddaughter','grandchild'),cat:3,r:dp};}
  if(df===1&&dp===1){const a=parentsOf(F),b=parentsOf(Pid),sh=a.filter(x=>b.includes(x)).length;
    const half=sh===1&&a.length===2&&b.length===2;return{l:(half?'Half-':'')+G(Pid,'brother','sister','sibling'),cat:1,r:1};}
  if(df===1)return{l:(dp>=3?greats(dp-3)+'grand':'')+G(Pid,'nephew','niece','niece/nephew'),cat:5,r:dp};
  if(dp===1)return{l:(df>=3?greats(df-3)+'grand-':'')+G(Pid,'uncle','aunt','aunt/uncle'),cat:4,r:df};
  const n=Math.min(df,dp)-1,rm=Math.abs(df-dp);
  return{l:ord(n)+' cousin'+(rm?(' '+(rm===1?'once':rm===2?'twice':rm+' times')+' removed'):''),cat:6,r:df+dp};
}
const cap=s=>s?s[0].toUpperCase()+s.slice(1):s;
function relation(F,Pid,AF){
  if(F===Pid)return{l:'Centered here',cat:-1,r:0};
  const b=bloodLabel(F,Pid,AF);if(b)return{...b,l:cap(b.l)};
  const fu=unionsOf(F).find(u=>other(u,F)===Pid);
  if(fu){const w=G(Pid,'husband','wife','spouse');const pre={divorced:'Ex-',ended:'Former '}[fu.status]||'';
    return{l:cap(pre+w)+(fu.status==='widowed'?' (late)':''),cat:2,r:1};}
  const fsp=spousesOf(F);
  for(const s of fsp){if(parentsOf(s).includes(Pid))return{l:G(Pid,'Father-in-law','Mother-in-law','Parent-in-law'),cat:7,r:2};
    if(siblingsOf(s).includes(Pid))return{l:G(Pid,'Brother-in-law','Sister-in-law','Sibling-in-law'),cat:7,r:2};
    if(childrenOf(s).includes(Pid))return{l:G(Pid,'Stepson','Stepdaughter','Stepchild'),cat:7,r:2};}
  for(const par of parentsOf(F))if(spousesOf(par).includes(Pid))return{l:G(Pid,'Stepfather','Stepmother','Step-parent'),cat:7,r:2};
  for(const sib of siblingsOf(F))if(spousesOf(sib).includes(Pid))return{l:G(Pid,'Brother-in-law','Sister-in-law','Sibling-in-law'),cat:7,r:2};
  for(const ch of childrenOf(F))if(spousesOf(ch).includes(Pid))return{l:G(Pid,'Son-in-law','Daughter-in-law','Child-in-law'),cat:7,r:2};
  let bestR=null;
  for(const s of spousesOf(Pid)){const rb=bloodLabel(F,s,AF);if(rb&&(!bestR||rb.r<bestR.rb.r))bestR={s,rb};}
  if(bestR){const{rb}=bestR;if(rb.cat===4)return{l:cap(rb.l.replace(/aunt\/uncle|aunt|uncle/,G(Pid,'uncle','aunt','aunt/uncle')))+' by marriage',cat:8,r:rb.r+1};
    return{l:cap(rb.l)+"’s "+G(Pid,'husband','wife','spouse'),cat:8,r:rb.r+1};}
  return{l:'Relative',cat:9,r:99};
}

/* ---------- layout ---------- */
function layout(F){
  const nodes=new Map(), edges=[], spouseEdges=[];
  const put=(id,x,y)=>{if(nodes.has(id))return false;nodes.set(id,{id,x,y});return true;};
  const aw=new Map();
  function ancW(id,l){const k=id+'|'+l;if(aw.has(k))return aw.get(k);const ps=l<MAXUP?parentsOf(id):[];
    let w=CW;if(ps.length){w=Math.max(CW,ps.reduce((s,p)=>s+ancW(p,l+1),0)+GX*(ps.length-1));}aw.set(k,w);return w;}
  function placeAnc(id,l,left){const ps=l<MAXUP?parentsOf(id):[];const w=ancW(id,l);let cx;
    if(ps.length){const tot=ps.reduce((s,p)=>s+ancW(p,l+1),0)+GX*(ps.length-1);let cur=left+(w-tot)/2;const cs=[];
      for(const p of ps){cs.push(placeAnc(p,l+1,cur));cur+=ancW(p,l+1)+GX;}cx=cs.reduce((a,b)=>a+b,0)/cs.length;
      edges.push({parents:ps,kid:id});
      if(ps.length===2){const u=[...S.unions.values()].find(u=>(u.a===ps[0]&&u.b===ps[1])||(u.a===ps[1]&&u.b===ps[0]));
        spouseEdges.push({a:ps[0],b:ps[1],ex:u&&['divorced','ended'].includes(u.status)});}}
    else cx=left+w/2;
    if(l>0)put(id,cx-CW/2,-l*RH);return cx;}
  const fcx=placeAnc(F,0,0);const fx=fcx-CW/2;
  const SIBDOWN=2; // show brothers' and sisters' children and grandchildren
  const sp=spousesOf(F).filter(s=>!nodes.has(s));
  const sibs=siblingsOf(F).filter(s=>!nodes.has(s)&&!sp.includes(s));
  const fy=+yearOf(P(F).born)||0;const older=sibs.filter(s=>(+yearOf(P(s).born)||0)<=fy&&fy).reverse(),younger=sibs.filter(s=>!older.includes(s));
  // widths of each person's block (them + partners) and everything below it
  const dw=new Map();const reserved=new Set([F,...sp,...sibs]);
  const blockOf=id=>id===F?[F,...sp]:[id,...spousesOf(id).filter(s=>s!==F&&!reserved.has(s)&&!nodes.has(s))];
  function kidsOf(id,d,max){return d<max?childrenOf(id).filter(k=>!reserved.has(k)):[];}
  function descW(id,d,max){const key=id+'|'+d+'|'+max;if(dw.has(key))return dw.get(key);const b=blockOf(id).length;const bw=b*CW+(b-1)*GX;
    const ks=kidsOf(id,d,max);const kw=ks.length?ks.reduce((s,k)=>s+descW(k,d+1,max),0)+GX*(ks.length-1):0;const w=Math.max(bw,kw);dw.set(key,w);return w;}
  function placeKids(id,d,center,max){const ks=kidsOf(id,d,max).filter(k=>!nodes.has(k));if(!ks.length)return;
    const kw=ks.reduce((s,k)=>s+descW(k,d+1,max),0)+GX*(ks.length-1);let cur=center-kw/2;
    ks.forEach((k,ki)=>{const w=descW(k,d+1,max);const raw=blockOf(k).filter(x=>!nodes.has(x));const bw=raw.length*CW+(raw.length-1)*GX;
      // partners go on the outer side, so brothers and sisters stay next to each other
      const left=ks.length>1&&ki<Math.floor(ks.length/2);const blk=left?[...raw.slice(1).reverse(),k]:raw;
      const bl=cur+(w-bw)/2;let kx=bl;blk.forEach((x,i)=>{const xx=bl+i*(CW+GX);put(x,xx,(d+1)*RH);if(x===k)kx=xx;
        else{const u=unionsOf(k).find(u=>other(u,k)===x);spouseEdges.push({a:k,b:x,ex:u&&['divorced','ended'].includes(u.status)});}});
      const ps=parentsOf(k).filter(p=>nodes.has(p));edges.push({parents:ps.length?ps:[id],kid:k});
      placeKids(k,d+1,blk.length>1?bl+bw/2:kx+CW/2,max);cur+=w+GX;});}
  // the centered person, their partners to the right, their children below
  put(F,fx,0);
  sp.forEach((s,i)=>{put(s,fx+(i+1)*(CW+GX),0);const u=unionsOf(F).find(u=>other(u,F)===s);spouseEdges.push({a:F,b:s,ex:u&&['divorced','ended'].includes(u.status)});});
  const fbw=(1+sp.length)*CW+sp.length*GX,fc=fx+fbw/2,fw=Math.max(fbw,descW(F,0,MAXDOWN));
  placeKids(F,0,sp.length?fc:fx+CW/2,MAXDOWN);
  // brothers and sisters on either side, each with their own family below them
  const placeSib=(s,unitLeft,onLeft)=>{const w=descW(s,0,SIBDOWN);const raw=blockOf(s);const bw=raw.length*CW+(raw.length-1)*GX;
    const blk=onLeft?[...raw.slice(1).reverse(),s]:raw;const bl=unitLeft+(w-bw)/2;let sx=bl;
    blk.forEach((x,i)=>{const xx=bl+i*(CW+GX);put(x,xx,0);if(x===s)sx=xx;else{const u=unionsOf(s).find(u=>other(u,s)===x);spouseEdges.push({a:s,b:x,ex:u&&['divorced','ended'].includes(u.status)});}});
    placeKids(s,0,blk.length>1?bl+bw/2:sx+CW/2,SIBDOWN);return w;};
  let cur=fc-fw/2-GX*2;for(const s of older){const w=descW(s,0,SIBDOWN);placeSib(s,cur-w,true);cur-=w+GX*2;}
  cur=fc+fw/2+GX*2;for(const s of younger){const w=placeSib(s,cur,false);cur+=w+GX*2;}
  for(const s of sibs){const ps=parentsOf(s).filter(p=>nodes.has(p));if(ps.length)edges.push({parents:ps,kid:s});}
  // normalize
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const n of nodes.values()){minX=Math.min(minX,n.x);minY=Math.min(minY,n.y);maxX=Math.max(maxX,n.x+CW);maxY=Math.max(maxY,n.y+CH);}
  const PAD=60,LBL=110;for(const n of nodes.values()){n.x+=-minX+PAD+LBL;n.y+=-minY+PAD;}
  return{nodes,edges,spouseEdges,w:maxX-minX+PAD*2+LBL,h:maxY-minY+PAD*2,y0:-minY+PAD};
}

/* ---------- left-to-right layouts ---------- */
// Lays out blocks (a person plus any partners stacked under them) in columns, children to the right.
function tidyH(roots,blockOf,kidsOf,colOf){
  const nodes=new Map(),edges=[],spouseEdges=[];let cur=0;const BH=n=>n*(CH+RG)-RG;
  function place(id){if(nodes.has(id))return null;
    const blk=blockOf(id,nodes);blk.forEach(x=>nodes.set(x,{id:x,x:0,y:0}));
    const kids=kidsOf(blk).filter(k=>!nodes.has(k));const start=cur;const rs=kids.map(place).filter(Boolean);
    const bh=BH(blk.length);let top=rs.length?(rs[0][0]+rs[rs.length-1][1])/2-bh/2:cur;top=Math.max(top,start);
    blk.forEach((x,i)=>{const n=nodes.get(x);n.y=top+i*(CH+RG);n.x=colOf(blk[0])*(CW+CG)+(i>0?SPI:0);if(i>0)n.inlaw=true;
      if(i>0){const u=[...S.unions.values()].find(u=>(u.a===blk[0]&&u.b===x)||(u.b===blk[0]&&u.a===x));spouseEdges.push({a:blk[0],b:x,ex:u&&['divorced','ended'].includes(u.status)});}});
    cur=Math.max(cur,top+bh+RG);return[top,top+bh];}
  for(const r of roots)place(r);
  return{nodes,edges,spouseEdges};}
function finishH(R,colOf,label){
  const{nodes}=R;let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const n of nodes.values()){minX=Math.min(minX,n.x);minY=Math.min(minY,n.y);maxX=Math.max(maxX,n.x+CW);maxY=Math.max(maxY,n.y+CH);}
  const PAD=60,TOP=40;for(const n of nodes.values()){n.x+=-minX+PAD;n.y+=-minY+PAD+TOP;}
  const cols=new Map();for(const n of nodes.values())if(!cols.has(n.x))cols.set(n.x,label(colOf(n.id)));
  return{...R,horiz:true,cols,w:maxX-minX+PAD*2,h:maxY-minY+PAD*2+TOP};}
function genMap(){const ids=[...S.people.keys()],g=new Map(ids.map(i=>[i,0]));
  for(let it=0;it<60;it++){let ch=false;
    for(const id of ids){let v=g.get(id);for(const p of parentsOf(id))if(g.has(p))v=Math.max(v,g.get(p)+1);
      for(const s of spousesOf(id))if(g.has(s))v=Math.max(v,g.get(s));
      if(!parentsOf(id).length){const ks=childrenOf(id).filter(k=>g.has(k));if(ks.length)v=Math.max(v,Math.min(...ks.map(k=>g.get(k)))-1);}
      if(v!==g.get(id)){g.set(id,v);ch=true;}}
    if(!ch)break;}
  return g;}
function layoutWhole(F){const g=genMap();const home=P(CTX?.myPersonId)?CTX.myPersonId:F;
  const anc=[...ancMap(home).keys()].filter(a=>P(a)&&!parentsOf(a).length);
  const roots=[...new Set([...anc.sort((a,b)=>g.get(a)-g.get(b)),
    ...[...S.people.keys()].filter(i=>!parentsOf(i).length).sort((a,b)=>g.get(a)-g.get(b)||byBirth(a,b)),...S.people.keys()])];
  const ord=(id,s)=>unionsOf(id).find(u=>other(u,id)===s)?.order||0;
  const R=tidyH(roots,
    (id,placed)=>[id,...spousesOf(id).filter(s=>s!==id&&!placed.has(s)).sort((a,b)=>ord(id,a)-ord(id,b))].filter((x,i,a)=>a.indexOf(x)===i),
    blk=>[...new Set(blk.flatMap(b=>childrenOf(b)))].sort(byBirth),
    id=>g.get(id));
  return finishH(R,id=>g.get(id),c=>c);}
function layoutPedigree(F){const depth=new Map([[F,0]]);
  const R=tidyH([F],id=>[id],blk=>{const ps=parentsOf(blk[0]).filter(p=>P(p));const d=depth.get(blk[0])+1;
      if(d>6)return[];ps.forEach(p=>{if(!depth.has(p))depth.set(p,d);});return ps;},id=>depth.get(id));
  return finishH(R,id=>depth.get(id),c=>-c);}
/* ---------- one side of the family, with cousins out to a chosen degree ---------- */
function parentOnSide(F,side){const ps=parentsOf(F).filter(p=>P(p));
  if(side==='father')return ps.find(p=>P(p).g==='m')||ps.find(p=>P(p).g!=='f')||null;
  if(side==='mother')return ps.find(p=>P(p).g==='f')||ps.find(p=>P(p).g!=='m'&&p!==parentOnSide(F,'father'))||null;return null;}
// n = 0: direct line and brothers/sisters; 1: first cousins (share grandparents); 2: second cousins; 3: third cousins; 9: everyone on that side
function branchSet(F,side,n){const inc=new Set([F]);
  const addDesc=id=>{const q=[id];while(q.length){const c=q.shift();for(const k of childrenOf(c))if(!inc.has(k)){inc.add(k);q.push(k);}}};
  addDesc(F);
  const roots=side==='both'?parentsOf(F):[parentOnSide(F,side)].filter(Boolean);
  for(const r of roots)for(const[a,d]of ancMap(r)){const g=d+1;inc.add(a);
    if(g===1&&n===0)for(const s of childrenOf(a))inc.add(s);
    else if(g<=n+1)addDesc(a);}
  for(const id of[...inc])for(const s of spousesOf(id))if(P(s))inc.add(s);
  return inc;}
function layoutBranch(F,side=S.side,n=S.cousins){const inc=branchSet(F,side,n);const g=genMap();
  const isRoot=i=>!parentsOf(i).some(p=>inc.has(p));
  const anc=[...ancMap(F).keys()].filter(a=>inc.has(a)&&isRoot(a)).sort((a,b)=>g.get(a)-g.get(b));
  const roots=[...new Set([...anc,...[...inc].filter(isRoot).sort((a,b)=>g.get(a)-g.get(b)||byBirth(a,b)),...inc])];
  const ord=(id,s)=>unionsOf(id).find(u=>other(u,id)===s)?.order||0;
  const R=tidyH(roots,(id,placed)=>[id,...spousesOf(id).filter(s=>s!==id&&inc.has(s)&&!placed.has(s)&&isRoot(s)).sort((a,b)=>ord(id,a)-ord(id,b))],
    blk=>[...new Set(blk.flatMap(b=>childrenOf(b)))].filter(k=>inc.has(k)).sort(byBirth),id=>g.get(id));
  return finishH(R,id=>g.get(id),c=>c);}
const COUSIN_LABEL={0:'Direct line and siblings',1:'Up to first cousins',2:'Up to second cousins',3:'Up to third cousins',4:'Up to fourth cousins',9:'Everyone on this side'};

/* ---------- render tree ---------- */
let L=null, AF=null;
function rel(id){return relation(S.focus,id,AF);}
function renderTree(scroll){
  const canvas=$('canvas'),svg=$('links');
  canvas.querySelectorAll('.card,.gen-label').forEach(e=>e.remove());
  if(!S.focus||!P(S.focus)){return;}
  AF=ancMap(S.focus);L=S.view==='branch'?layoutBranch(S.focus):S.view==='whole'?layoutWhole(S.focus):S.view==='pedigree'?layoutPedigree(S.focus):layout(S.focus);
  canvas.style.width=L.w+'px';canvas.style.height=L.h+'px';svg.setAttribute('width',L.w);svg.setAttribute('height',L.h);
  svg.replaceChildren();
  const NS='http://www.w3.org/2000/svg';const pth=(d,cls,data)=>{const e=document.createElementNS(NS,'path');e.setAttribute('d',d);if(cls)e.setAttribute('class',cls);if(data)for(const[k,v]of Object.entries(data))e.dataset[k]=v;svg.append(e);};
  if(L.horiz){
    for(const n of L.nodes.values()){const ps=parentsOf(n.id).map(p=>L.nodes.get(p)).filter(Boolean);if(!ps.length)continue;
      const px=Math.max(...ps.map(q=>q.x))+CW,py=ps.reduce((s,q)=>s+q.y+CH/2,0)/ps.length,ky=n.y+CH/2,mx=n.x-CG/2;
      pth(`M${px} ${py} H${mx} V${ky} H${n.x}`,'',{k:n.id,p:parentsOf(n.id).join(',')});}
    for(const e of L.spouseEdges){const a=L.nodes.get(e.a),b=L.nodes.get(e.b);if(!a||!b)continue;const[t,u]=a.y<b.y?[a,b]:[b,a];
      pth(`M${t.x+14} ${t.y+CH} V${u.y}`,e.ex?'ex':'',{a:e.a,b:e.b});}
  }
  else{
  for(const e of L.edges){const kn=L.nodes.get(e.kid);const ps=e.parents.map(p=>L.nodes.get(p)).filter(Boolean);if(!kn||!ps.length)continue;
    const px=ps.reduce((s,n)=>s+n.x+CW/2,0)/ps.length,py=Math.max(...ps.map(n=>n.y))+(ps.length>1?CH/2:CH);
    const kx=kn.x+CW/2,ky=kn.y,my=ky-30;pth(`M${px} ${py} V${my} H${kx} V${ky}`,'',{k:e.kid,p:e.parents.join(',')});}
  for(const e of L.spouseEdges){const a=L.nodes.get(e.a),b=L.nodes.get(e.b);if(!a||!b)continue;const[l,r]=a.x<b.x?[a,b]:[b,a];const y=l.y+CH/2;
    pth(`M${l.x+CW} ${y} H${r.x}`,e.ex?'ex':'',{a:e.a,b:e.b});}
  }
  // generation labels
  const gname=k=>k===0?'Generation of '+firstName(S.focus):k<0?(['Parents','Grandparents','Great-grandparents','2× great-grandparents','3× great-grandparents','4× great-grandparents'][-k-1]||''):(['Children','Grandchildren','Great-grandchildren'][k-1]||'');
  if(L.horiz){
    for(const[x,c]of L.cols){
      canvas.append(h('div',{class:'gen-label',style:`top:62px;left:${x}px`,text:S.view==='pedigree'?(c===0?firstName(S.focus):gname(c)):('Generation '+(c+1))}));}}
  const gens=L.horiz?new Set():new Set([...L.nodes.values()].map(n=>n.y));
  for(const y of gens){const k=Math.round((y-L.y0)/RH);canvas.append(h('div',{class:'gen-label',style:`top:${y+CH/2-8}px;left:20px`,text:gname(k)}));}
  const CL=S.colorBy==='none'?null:classify(S.focus);canvas.className='cm-'+S.colorBy;renderLegend(CL?CL.slot.filter(([,n])=>[...L.nodes.keys()].some(id=>CL.map.get(id)?.line===n)):[]);
  for(const n of L.nodes.values()){const p=P(n.id);const r=rel(n.id);const ci=CL?.map.get(n.id)||{kind:'married',line:-1};
    const ph=portraitOf(p);
    const av=h('div',{class:'av',style:ph?`background-image:url("${blob(ph)}");background-position:${facePos(p,ph)}`:null},ph?'':(isUnknown(p)?'?':initials(p.name)));
    const inlaw=n.id!==S.focus&&(ci.kind==='married'||n.inlaw||(!L.horiz&&[2,7,8].includes(r.cat)));
    const card=h('button',{class:'card k-'+ci.kind+' ln-'+ci.line+(inlaw?' inlaw':'')+(n.id===S.focus?' focus':'')+(n.id===S.sel?' sel':'')+(isUnknown(p)?' unknown':''),style:`left:${n.x}px;top:${n.y}px`,
      'data-id':n.id,'aria-label':p.name+', '+r.l,onclick:()=>{if(S.sel===n.id&&n.id!==S.focus)setFocus(n.id);else select(n.id);}},
      av,h('div',{class:'tx'},h('div',{class:'rel',text:r.l}),h('div',{class:'nm',text:cardName(p)}),p.aka?h('div',{class:'aka',text:'aka '+p.aka}):null,...cardDates(p).map(t=>h('div',{class:'dt',text:t}))));
    canvas.append(card);}
  applyScale();highlightPath();
  $('centered').replaceChildren('Centered on ',h('b',{text:P(S.focus).name}),' · click a person, then click again to re-center');
  if(scroll)centerOnFocus();
}
const firstName=id=>String(nameOf(id)).replace(/[“”"]/g,'').split(/\s+/)[0];
function applyScale(){if(!L)return;$('canvas').style.transform=`scale(${S.scale})`;$('scaler').style.width=L.w*S.scale+'px';$('scaler').style.height=L.h*S.scale+'px';}
function centerOnFocus(){if(!L)return;const n=L.nodes.get(S.focus);const st=$('stage');
  st.scrollLeft=(n.x+CW/2)*S.scale-st.clientWidth/2;st.scrollTop=(n.y+CH/2)*S.scale-st.clientHeight*0.55;}

/* ---------- printing ---------- */
// Builds a clean, compact version of the tree as vector graphics and opens it ready to print or save as a PDF.
const escX=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function wrap2(s,max){if(s.length<=max)return[s];const w=s.split(' ');let a='';while(w.length&&(a+' '+w[0]).trim().length<=max)a=(a+' '+w.shift()).trim();
  let b=w.join(' ');if(b.length>max)b=b.slice(0,max-1)+'…';return a?[a,b]:[s.slice(0,max-1)+'…'];}
export function printTree(mode,size,famName,paper,opts){const big=paper==='tabloid';
  const save=[CW,CH,GX,RH,CG,RG,SPI];
  CW=172;CH=74;GX=10;RH=112;CG=44;RG=8;SPI=16;
  const F=S.focus;let PL,title;
  try{
    if(mode==='everyone'){PL=layoutWhole(F);title='Everyone in the family';}
    else if(mode==='father'||mode==='mother'||mode==='both'){const n=opts?.cousins??S.cousins;PL=layoutBranch(F,mode,n);
      title=nameOf(F)+(mode==='father'?'’s father’s side':mode==='mother'?'’s mother’s side':'’s family branches')+' · '+COUSIN_LABEL[n].toLowerCase();}
    else if(mode==='ancestors'){PL=layoutPedigree(F);title=nameOf(F)+'’s ancestors';}
    else{PL=layout(F);title=nameOf(F)+'’s family';}
  }catch(e){[CW,CH,GX,RH,CG,RG,SPI]=save;throw e;}
  const W=PL.w,H=PL.h;let out=[];
  const line=(d,ex)=>out.push(`<path d="${d}" fill="none" stroke="#C9B48F" stroke-width="1.2"${ex?' stroke-dasharray="4 3"':''}/>`);
  if(PL.horiz){
    for(const n of PL.nodes.values()){const ps=parentsOf(n.id).map(p=>PL.nodes.get(p)).filter(Boolean);if(!ps.length)continue;
      const px=Math.max(...ps.map(q=>q.x))+CW,py=ps.reduce((s,q)=>s+q.y+CH/2,0)/ps.length,ky=n.y+CH/2,mx=n.x-CG/2;line(`M${px} ${py} H${mx} V${ky} H${n.x}`);}
    for(const e of PL.spouseEdges){const a=PL.nodes.get(e.a),b=PL.nodes.get(e.b);if(!a||!b)continue;const[t,u]=a.y<b.y?[a,b]:[b,a];line(`M${t.x+8} ${t.y+CH} V${u.y}`,e.ex);}
  }else{
    for(const e of PL.edges){const kn=PL.nodes.get(e.kid);const ps=e.parents.map(p=>PL.nodes.get(p)).filter(Boolean);if(!kn||!ps.length)continue;
      const px=ps.reduce((s,n)=>s+n.x+CW/2,0)/ps.length,py=Math.max(...ps.map(n=>n.y))+(ps.length>1?CH/2:CH);const kx=kn.x+CW/2,ky=kn.y;line(`M${px} ${py} V${ky-24} H${kx} V${ky}`);}
    for(const e of PL.spouseEdges){const a=PL.nodes.get(e.a),b=PL.nodes.get(e.b);if(!a||!b)continue;const[l,r]=a.x<b.x?[a,b]:[b,a];line(`M${l.x+CW} ${l.y+CH/2} H${r.x}`,e.ex);}
  }
  const CLp=S.colorBy==='none'?null:classify(F);const LC=['#86602F','#3D6A8C','#4E7D52','#A65A3A','#7B5C93'];
  for(const n of PL.nodes.values()){const p=P(n.id);const r=relation(F,n.id,ancMap(F));const ci=CLp?.map.get(n.id);
    const stripe=!ci||ci.kind==='married'||ci.kind==='self'?null:S.colorBy==='line'?LC[ci.line]||null:(ci.kind==='direct'?'#86602F':'#D9C6A8');
    const inlaw=n.id!==F&&(n.inlaw||(!PL.horiz&&[2,7,8].includes(r.cat)));
    const fill=n.id===F?'#EFE5D6':inlaw?'#FBFAF8':'#FFFFFF',stroke=n.id===F?'#86602F':'#D9C6A8';
    const nm=wrap2(cardName(p),25),ds=cardDates(p);let y=n.y+15;const t=[];
    if(mode!=='everyone'&&r.l){t.push(`<text x="${n.x+9}" y="${y}" font-size="7.5" letter-spacing=".6" fill="#86602F" font-weight="600">${escX(r.l.toUpperCase())}</text>`);y+=12;}
    for(const s of nm){t.push(`<text x="${n.x+9}" y="${y}" font-family="Literata,Georgia,serif" font-size="11" fill="${inlaw?'#5d564e':'#24211D'}">${escX(s)}</text>`);y+=12.5;}
    if(p.aka&&y<n.y+CH-14){t.push(`<text x="${n.x+9}" y="${y}" font-size="8.5" font-style="italic" fill="#756D63">aka ${escX(p.aka)}</text>`);y+=10.5;}
    for(const s of ds){if(y>n.y+CH-4)break;t.push(`<text x="${n.x+9}" y="${y}" font-size="8.5" fill="#756D63">${escX(s)}</text>`);y+=10.5;}
    const dash=p.placeholder||ci?.kind==='married';const ms=S.colorBy==='line'&&ci?.kind==='married'&&LC[ci.line]?LC[ci.line]:stroke;
    out.push(`<g><rect x="${n.x}" y="${n.y}" width="${CW}" height="${CH}" rx="6" fill="${fill}" stroke="${ms}" stroke-width="${n.id===F?1.6:1}"${dash?' stroke-dasharray="3 2"':''}/>${stripe?`<rect x="${n.x+0.5}" y="${n.y+0.5}" width="4" height="${CH-1}" rx="2" fill="${stripe}"/>`:''}${t.join('')}</g>`);}
  [CW,CH,GX,RH,CG,RG,SPI]=save;
  const svgBody=out.join('');
  const head=`<div class="hd"><span class="t"><b>${escX(famName||'Family Tree')}</b> · ${escX(title)}</span><span>Printed ${new Date().toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'})} · gofamtree.com</span></div>`;
  const landscape=W>=H||size==='poster';
  const PW=big?(landscape?16.4:10.4):(landscape?10.4:7.9),PH=big?(landscape?10.4:16.4):(landscape?7.9:10.4); // printable inches, 0.3in margins
  let pages='';
  if(size==='poster'){const tw=PW*96,th=(PH-0.45)*96;const cols=Math.ceil(W/tw),rows=Math.ceil(H/th);
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      pages+=`<section class="pg">${head}<svg viewBox="${c*tw} ${r*th} ${tw} ${th}" width="${PW}in" height="${PH-0.45}in" font-family="Inter,Helvetica,Arial,sans-serif">${svgBody}</svg><div class="ft">Page ${r*cols+c+1} of ${rows*cols} · row ${r+1}, column ${c+1}. Lay pages out in a grid (${rows} rows × ${cols} columns) and tape them together.</div></section>`;}}
  else pages=`<section class="pg">${head}<svg viewBox="0 0 ${W} ${H}" width="${PW}in" height="${PH-0.45}in" preserveAspectRatio="xMidYMid meet" font-family="Inter,Helvetica,Arial,sans-serif">${svgBody}</svg></section>`;
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>${escX(famName||'Family Tree')} - ${escX(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Literata:opsz,wght@7..72,500&display=swap">
<style>@page{size:${big?'11in 17in':'letter'} ${landscape?'landscape':'portrait'};margin:0.3in}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:Inter,Helvetica,Arial,sans-serif;color:#24211D;background:#fff}
.bar{position:sticky;top:0;display:flex;gap:10px;align-items:center;padding:10px 16px;background:#FBFAF8;border-bottom:1px solid #E4DDD2;font-size:14px}
.bar button{font:inherit;padding:7px 14px;border-radius:8px;border:1px solid #86602F;background:#86602F;color:#fff;cursor:pointer}
.pg{width:${PW}in;margin:16px auto;break-after:page;page-break-after:always}.pg:last-child{break-after:auto}
.hd{display:flex;justify-content:space-between;align-items:baseline;font-size:11pt;padding-bottom:4px;border-bottom:1px solid #D9C6A8;margin-bottom:4px}
.hd b{font-family:Literata,Georgia,serif;font-size:13pt}.hd>span:last-child{font-size:8pt;color:#756D63}.ft{font-size:7.5pt;color:#756D63;text-align:right}
@media print{.bar{display:none}.pg{margin:0}}</style></head><body>
<div class="bar"><button onclick="print()">Print or save as PDF</button><span>${size==='poster'?'Prints across several pages to tape together.':'Fits on one page.'} In the print window, choose “Save as PDF” to keep a copy.</span></div>
${pages}</body></html>`;
  const w=window.open('','_blank');if(!w){toast('Allow pop-ups for this site to print.');return;}
  w.document.open();w.document.write(html);w.document.close();
}

/* ---------- private people ---------- */
const HIDDEN_LABEL={born:'Birthday',bornPlace:'Birthplace',bornHospital:'Birth hospital',residence:'Lives in',jobs:'Work',occupation:'Work',
  hsSchool:'Education',colSchool:'Education',gradSchool:'Education',eduOther:'Education',notes:'Notes',stories:'Stories & voice messages',docs:'Documents',gallery:'More photos',died:'Death'};
function privateBlock(id,p){const fn=firstName(id);const labels=[...new Set((p._hidden||[]).map(k=>HIDDEN_LABEL[k]).filter(Boolean))];
  const fake=['Mar 14, 19••','Los Angeles, CA','•••••• ••••','•••• ••••• ••••'];
  const rows=labels.length?h('dl',{class:'facts blurred','aria-hidden':'true'},labels.flatMap((l,i)=>[h('dt',{text:l}),h('dd',{text:fake[i%fake.length]})])):null;
  const st=CTX.accessStatus?.(id);
  const btn=st==='pending'?h('p',{class:'q',style:'margin:0',text:'You asked to see more. '+fn+' or a close family member will decide.'})
    :h('button',{class:'btn primary',text:'Ask to see '+fn+'’s details',onclick:()=>CTX.requestAccess?.(id)});
  return h('div',{class:'section private'},
    h('h3',{text:p._minor?'Private: under 18':'Private'}),
    h('p',{class:'q',style:'margin:0 0 8px',text:p._minor
      ?'Details about children are shown only to their immediate family.'
      :fn+'’s details are shown to close family. You can ask to see more; '+fn+' or their close family decides.'}),
    rows,btn);}

/* ---------- colors: whose line is whose ---------- */
// kind: self | direct (ancestor or descendant) | blood (shares an ancestor) | married (married into the family)
// line: which of the centered person's four grandparents the connection runs through (1-4), or 0 for their own household
function classify(F){const AF=ancMap(F);const gps=[];for(const p of parentsOf(F).slice(0,2))for(const g of parentsOf(p).slice(0,2))gps.push(g);
  // pad so father's parents are 1-2 and mother's parents are 3-4
  const ps=parentsOf(F);const slot=[];ps.forEach((p,i)=>parentsOf(p).slice(0,2).forEach((g,j)=>slot.push([g,i*2+j+1])));
  const gpAnc=slot.map(([g,n])=>[n,new Set(ancMap(g).keys())]);
  const lineOfAnc=a=>{for(const[n,set]of gpAnc)if(set.has(a))return n;return 0;};
  const desc=new Set();const q=[F];while(q.length){const c=q.shift();for(const k of childrenOf(c))if(!desc.has(k)){desc.add(k);q.push(k);}}
  const out=new Map();const sibSet=new Set(siblingsOf(F));
  for(const id of S.people.keys()){
    if(id===F){out.set(id,{kind:'self',line:0});continue;}
    if(AF.has(id)){out.set(id,{kind:'direct',line:AF.get(id)<=1?0:lineOfAnc(id)});continue;}
    if(desc.has(id)){out.set(id,{kind:'direct',line:0});continue;}
    if(sibSet.has(id)){out.set(id,{kind:'direct',line:0});continue;} // brothers and sisters count as immediate family
    const A=ancMap(id);let best=null;for(const[a,d]of A)if(AF.has(a)){const dd=AF.get(a);if(!best||dd<best.d||(dd===best.d&&lineOfAnc(a)<lineOfAnc(best.a)))best={a,d:dd};}
    if(best)out.set(id,{kind:'blood',line:best.d<=1?0:lineOfAnc(best.a)});}
  // people who married in take the color of the relative they married
  for(const id of S.people.keys())if(!out.has(id)){const sp=spousesOf(id).map(s=>out.get(s)).find(Boolean);
    let via=sp;if(!via){for(const c of childrenOf(id)){if(out.get(c)){via=out.get(c);break;}}}
    out.set(id,{kind:'married',line:via?via.line:-1});}
  return{map:out,slot};}
function lineName(g){const p=P(g);if(!p)return'';const sur=p.maiden||p.last||String(p.name||'').split(' ').pop();return sur+' ('+(p.nick||p.first||firstName(g))+')';}
function renderLegend(slot){const el=$('legend');if(!el)return;
  const sel=h('select',{'aria-label':'Color the tree by'},[['relation','Color by relationship'],['line','Color by family line'],['none','No colors']].map(([v,t])=>h('option',{value:v,selected:S.colorBy===v},t)));
  sel.onchange=()=>{S.colorBy=sel.value;try{localStorage.setItem('gft-color',S.colorBy);}catch(e){}renderTree(false);};
  const item=(cls,label)=>h('div',{class:'lg-i'},h('span',{class:'lg-sw '+cls}),label);
  let rows=[];
  if(S.colorBy==='relation')rows=[item('sw-direct','Immediate family and direct line: parents, grandparents, brothers, sisters, children'),item('sw-blood','Other blood relatives: aunts, uncles, cousins, nieces, nephews'),item('sw-married','Married into the family')];
  else if(S.colorBy==='line'){rows=[item('sw-l0',firstName(S.focus)+'’s own family'),...slot.map(([g,n])=>item('sw-l'+n,lineName(g)+' line')),item('sw-married','Married in (outline shows whose family)')];}
  el.replaceChildren(sel,...rows);el.hidden=false;}

/* ---------- trace the line between two people ---------- */
function pathBetween(a,b){if(!a||!b||a===b)return[];const prev=new Map([[a,null]]);const q=[a];
  while(q.length){const c=q.shift();if(c===b)break;
    for(const n of[...parentsOf(c),...childrenOf(c),...spousesOf(c)])if(!prev.has(n)&&P(n)){prev.set(n,c);q.push(n);}}
  if(!prev.has(b))return[];const out=[];for(let c=b;c!=null;c=prev.get(c))out.unshift(c);return out;}
function highlightPath(){const svg=$('links');if(!svg)return;
  svg.querySelectorAll('.hl').forEach(e=>e.classList.remove('hl'));document.querySelectorAll('.card.onpath').forEach(e=>e.classList.remove('onpath'));
  const path=pathBetween(S.focus,S.sel);if(path.length<2)return;const on=new Set(path);
  const pairs=new Set();for(let i=1;i<path.length;i++){pairs.add(path[i-1]+'|'+path[i]);pairs.add(path[i]+'|'+path[i-1]);}
  for(const e of svg.querySelectorAll('path')){const d=e.dataset;
    if(d.k&&(d.p||'').split(',').some(p=>pairs.has(d.k+'|'+p)))e.classList.add('hl');
    if(d.a&&pairs.has(d.a+'|'+d.b))e.classList.add('hl');}
  for(const c of document.querySelectorAll('.card'))if(on.has(c.dataset.id)&&c.dataset.id!==S.focus)c.classList.add('onpath');
  svg.querySelectorAll('.hl').forEach(e=>svg.append(e));}

/* ---------- focus & selection ---------- */
function setFocus(id,fromHash){if(!P(id))return;S.focus=id;S.sel=id;if(!fromHash&&location.hash!=='#'+id){try{location.hash=id;}catch(e){}}
  S.editing=null;renderTree(true);renderPanel();openSheet();}
function select(id){S.sel=id;S.editing=null;S.tab='person';document.querySelectorAll('.card').forEach(c=>c.classList.toggle('sel',c.dataset.id===id));highlightPath();renderPanel();openSheet();}
function openSheet(){$('aside').classList.remove('closed');}
window.addEventListener('hashchange',()=>{const id=decodeURIComponent(location.hash.slice(1));if(id&&id!==S.focus&&P(id))setFocus(id,true);});

/* ---------- writing: owner applies, others suggest ---------- */
const mode=()=>S.isOwner?'edit':(S.uid&&S.canWrite!==false?'suggest':'view');
function slug(s){return (String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'person')+'-'+Math.random().toString(36).slice(2,6);}
function describe(op){const n=nameOf(op.id||op.personId);
  switch(op.kind){case'updatePerson':return'Update '+n+': '+Object.entries(op.data).map(([k,v])=>FIELD_LABEL[k]+' → '+(Array.isArray(v)?(v.map(jobLine).join('; ')||'(none)'):(v&&typeof v==='object')?locStr(v):v===true?'yes':v===false?'no':v||'(blank)')).join('; ');
  case'createPerson':return'Add '+op.data.name+' as '+op.relWord+' of '+nameOf(op.relTo);
  case'updateUnion':return'Update marriage '+nameOf(S.unions.get(op.id)?.a)+' & '+nameOf(S.unions.get(op.id)?.b)+': '+Object.entries(op.data).map(([k,v])=>k+' → '+(v||'(blank)')).join('; ');
  case'addDoc':return'Add document to '+n+': '+op.doc.title;
  case'setPhoto':return'Add '+op.slot+' photo of '+n;
  case'addPhoto':return'Add photo of '+n+(op.photo.milestone?' ('+op.photo.milestone+')':'')+(photoAge(P(op.personId)||{},op.photo)?' at about age '+photoAge(P(op.personId)||{},op.photo):'');
  case'updatePhoto':return'Update photo details for '+n+': '+[op.photo.milestone,op.photo.age&&('age ~'+op.photo.age),op.photo.year,op.photo.caption].filter(Boolean).join(', ');
  case'setPortrait':return'Change profile picture of '+n;
  case'setContact':return(Object.keys(op.contact).length?'Update contact info for ':'Remove contact info for ')+n+(op.visible?' (shown to family)':' (kept private)');
  case'addStory':return'Add '+(op.story.audioId?(op.story.isVideo?'a video':'a voice message'):'a story')+' for '+n+': '+(op.story.title||'');}return op.kind;}
async function commit(op){
  if(mode()==='edit'){try{await apply(op);toast('Saved');}catch(e){toast('Couldn’t save: '+(e.message||e.code));}return;}
  if(mode()!=='suggest'){toast('You can view this tree but not add to it.');return;}
  const ref=S.db.doc('suggestions/'+S.uid);
  let prev=[];try{prev=(await ref.get()).data()?.items||[];}catch(e){}
  const items=[...prev,{sid:Math.random().toString(36).slice(2,10),at:new Date().toISOString(),op,summary:describe(op)}];
  try{await ref.set({by:S.uid,items});toast('Sent for review');}catch(e){S.canWrite=false;toast('This link is view-only, so changes can’t be sent.');renderPanel();}
}
async function apply(op){const db=S.db;
  if(op.kind==='updatePerson')return db.doc('people/'+op.id).update(op.data);
  if(op.kind==='updateUnion')return db.doc('unions/'+op.id).update(op.data);
  if(op.kind==='setPhoto')return apply({kind:'addPhoto',personId:op.personId,photo:{id:op.assetId,stage:op.slot,...(op.face?{face:op.face}:{})}});
  if(op.kind==='addPhoto'||op.kind==='updatePhoto'){const ref=db.doc('people/'+op.personId);const cur=(await ref.get()).data()||{};let g=galleryOf(cur);
    g=op.kind==='addPhoto'?[...g.filter(x=>x.id!==op.photo.id),op.photo]:g.map(x=>x.id===op.photo.id?{...x,...op.photo}:x);return ref.update({gallery:g});}
  if(op.kind==='setContact'){const empty=!Object.keys(op.contact||{}).length;
    if(op.visible&&!empty){await db.doc('contacts/'+op.personId).set(op.contact);await db.doc('hiddencontacts/'+op.personId).delete();}
    else if(!empty){await db.doc('hiddencontacts/'+op.personId).set(op.contact);await db.doc('contacts/'+op.personId).delete();}
    else{await db.doc('contacts/'+op.personId).delete();await db.doc('hiddencontacts/'+op.personId).delete();}return;}
  if(op.kind==='addStory'){const ref=db.doc('people/'+op.personId);const cur=(await ref.get()).data()||{};return ref.update({stories:[...storiesOf(cur),op.story]});}
  if(op.kind==='setPortrait')return db.doc('people/'+op.personId).update({portrait:op.assetId});
  if(op.kind==='addDoc'){const ref=db.doc('people/'+op.personId);const cur=(await ref.get()).data()||{};return ref.update({docs:[...(cur.docs||[]),op.doc]});}
  if(op.kind==='createPerson'){await db.doc('people/'+op.id).set(op.data);
    if(op.union)await db.doc('unions/'+op.union.id).set(op.union.data);
    if(op.parentOf){const c=P(op.parentOf);if(c)await db.doc('people/'+c.id).update({parents:[...(c.parents||[]),op.id].slice(0,2)});}
    return;}
}

/* ---------- panel ---------- */
const FIELD_LABEL={aka:'Also known as',showNick:'Show nickname on tree',first:'First name',middle:'Middle name',last:'Last name',bornPlace:'Birthplace',diedPlace:'Place of death',buriedPlace:'Cemetery location',residence:'Lives in',jobs:'Work history',hsSchool:'High school',hsYear:'Graduated',colSchool:'College',colDegree:'Degree',colYear:'Graduated',gradSchool:'Graduate school',gradDegree:'Degree',gradYear:'Graduated',eduOther:'Other education',occupation:'Occupation',education:'Education & degrees',name:'Name',g:'Gender',maiden:'Birth surname',nick:'Nickname',born:'Born',bornPlace:'Birthplace',bornHospital:'Birth hospital',died:'Died',diedPlace:'Place of death',buried:'Buried',deceased:'Deceased',notes:'Notes'};
function setTab(t){S.tab=t;['person','rel','review'].forEach(x=>$('tab-'+x).setAttribute('aria-selected',String(x===t)));renderPanel();}
$('tab-person').onclick=()=>setTab('person');$('tab-rel').onclick=()=>setTab('rel');$('tab-review').onclick=()=>setTab('review');
$('closeSheet').onclick=()=>$('aside').classList.add('closed');
function renderPanel(){const panel=$('panel');panel.replaceChildren();
  ['person','rel','review'].forEach(x=>$('tab-'+x).setAttribute('aria-selected',String(x===S.tab)));
  const rv=$('tab-review');rv.hidden=!S.isOwner;rv.replaceChildren('Review',S.suggest.length?h('span',{class:'badge',text:S.suggest.length}):'');
  if(S.tab==='rel')return renderRelatives(panel);
  if(S.tab==='review')return renderReview(panel);
  const id=S.sel||S.focus;const p=P(id);if(!p){panel.append(h('p',{class:'q',text:'Choose a person in the tree.'}));return;}
  if(S.editing)return renderEdit(panel,p);
  const r=AF?rel(id):{l:''};
  panel.append(h('div',{class:'p-head'},h('div',{class:'p-rel',text:id===S.focus?'Centered here':r.l+' of '+firstName(S.focus)}),
    h('h2',{text:p.name}),(p.maiden||p.nick||p.aka)?h('div',{class:'p-sub',text:[p.maiden&&('born '+p.maiden),p.nick&&('goes by “'+p.nick+'”'),p.aka&&('also known as '+p.aka)].filter(Boolean).join(' · ')}):null));
  const acts=h('div',{class:'p-actions'});
  if(id!==S.focus)acts.append(h('button',{class:'btn primary',onclick:()=>setFocus(id),text:'Center tree on '+firstName(id)}));
  if(mode()!=='view'&&!p._masked)acts.append(h('button',{class:'btn',onclick:()=>{S.editing={type:'person'};renderPanel();},text:mode()==='edit'?'Edit details':'Suggest a correction'}));
  panel.append(acts);
  if(p._masked){panel.append(privateBlock(id,p));const ex=CTX.contactActions?.(id);if(ex)panel.append(h('div',{class:'section'},h('h3',{text:'Contact'}),ex));return;}
  if(mode()==='suggest')panel.append(h('div',{class:'note',text:'Anything you add or correct goes to the family’s tree managers for review before it appears in the tree.'}));
  // facts
  const fact=(k,v)=>[h('dt',{text:k}),h('dd',v?{text:v}:{class:'q',text:'?'})];
  const born=[p.born,locStr(p.bornPlace)].filter(Boolean).join(' · ');
  const dead=p.deceased||p.died;
  const dl=h('dl',{class:'facts'},fact('Born',born),p.bornHospital?fact('Hospital',p.bornHospital):null,
    dead?null:fact('Lives in',locStr(p.residence)),
    dead?fact('Died',[p.died,locStr(p.diedPlace)].filter(Boolean).join(' · ')):null,(dead||p.buried)?fact('Buried',[p.buried,locStr(p.buriedPlace)].filter(Boolean).join(' · ')):null,
    ...workFacts(p,fact),...eduFacts(p,fact));
  panel.append(h('div',{class:'sec'},h('h3',{text:'Life'}),dl));
  // contact
  if(!(p.deceased||p.died)){const vis=S.contacts.get(id),hid=S.isOwner?S.hiddenContacts.get(id):null;const c=vis||hid;
    const csec=h('div',{class:'sec'},h('h3',{text:'Contact'}));
    if(c){if(hid&&!vis)csec.append(h('div',{class:'note',style:'margin-bottom:8px',text:'Private: only you can see this. It’s hidden from everyone else.'}));csec.append(contactBlock(c)||h('p',{class:'q',style:'margin:0',text:'No details yet.'}));}
    else csec.append(h('p',{class:'q',style:'margin:0',text:'No contact details shown here.'}));
    const extra=CTX.contactActions?.(id);if(extra)csec.append(extra);
    if(mode()!=='view')csec.append(h('div',{class:'p-actions'},h('button',{class:'btn small',onclick:()=>{S.editing={type:'contact'};renderPanel();},text:c?'Update contact info':'Add contact info'})));
    panel.append(csec);}
  // marriages
  const us=unionsOf(id);
  if(us.length){const sec=h('div',{class:'sec'},h('h3',{text:'Marriages'}));
    for(const u of us){const o=other(u,id);const st={married:'Married',divorced:'Divorced',widowed:'Widowed',ended:'Ended'}[u.status]||'Married';
      const box=h('div',{class:'marr'},h('div',{class:'who'},h('button',{onclick:()=>select(o),text:nameOf(o)})),
        h('div',{class:'p-sub',text:st+' · married '+(u.married||'?')+(u.status==='divorced'||u.divorced?' · divorced '+(u.divorced||'?'):'')}));
      if(mode()!=='view')box.append(h('div',null,h('button',{class:'btn small',onclick:()=>{S.editing={type:'union',id:u.id};renderPanel();},text:mode()==='edit'?'Edit dates':'Suggest dates'})));
      sec.append(box);}
    panel.append(sec);}
  // family chips
  const chipSec=(title,ids)=>ids.length?h('div',{class:'sec'},h('h3',{text:title}),h('div',{class:'chips'},ids.map(x=>h('button',{class:'chip',onclick:()=>select(x)},nameOf(x),' ',h('small',{text:yearOf(P(x).born)||''}))))):null;
  panel.append(...[chipSec('Parents',parentsOf(id)),chipSec('Siblings',siblingsOf(id)),chipSec('Children',childrenOf(id))].filter(Boolean));
  // photos
  const canUp=!!S.assets&&mode()!=='view';const gal=galleryOf(p);
  const psec=h('div',{class:'sec'},h('h3',{text:'Photos'+(gal.length?' · '+gal.length:'')}));
  for(const[stage,label]of STAGES){const items=gal.filter(x=>(x.stage||'adult')===stage).sort(byPhotoAge(p));
    if(!items.length&&!canUp)continue;const grid=h('div',{class:'photos'});
    for(const ph of items){const line=photoLine(p,ph);grid.append(h('button',{class:'ph has',style:`background-image:url("${blob(ph.id)}")`,'aria-label':label+' photo'+(line?', '+line:''),onclick:()=>openPhoto(p.id,ph.id)},line?h('span',{text:line}):null));}
    if(canUp){const inp=h('input',{type:'file',accept:'image/*',multiple:true,id:'up-'+stage,onchange:e=>{if(!e.target.files.length)return;S.editing={type:'photos',stage,files:[...e.target.files]};renderPanel();}});
      grid.append(h('div',{class:'ph'},h('label',{for:'up-'+stage},'+ Add photos',inp)));}
    psec.append(h('div',{class:'stage'},h('div',{class:'stage-h',text:label}),grid));}
  if(!gal.length&&!canUp)psec.append(h('p',{class:'q',style:'margin:0',text:'No photos yet.'}));
  panel.append(psec);
  // documents
  const ds=h('div',{class:'docs'});
  for(const d of(p.docs||[])){const row=h('div',{class:'doc'});
    const nm=h('div',{class:'dn'},d.url?h('a',{href:d.url,target:'_blank',rel:'noopener',text:d.title}):h('span',{text:d.title}),h('span',{class:'dk',text:d.kind||(d.url?'Link':'File')}));
    row.append(nm);
    if(d.assetId){row.append(h('button',{class:'btn small',onclick:()=>openAsset(d),text:'View'}));
      if(S.downloads)row.append(h('button',{class:'btn small',onclick:()=>download(d),text:'Download'}));}
    ds.append(row);}
  if(!(p.docs||[]).length)ds.append(h('p',{class:'q',style:'margin:0',text:'No certificates or records yet.'}));
  const dsec=h('div',{class:'sec'},h('h3',{text:'Certificates & records'}),ds);
  if(mode()!=='view')dsec.append(h('div',{class:'p-actions'},h('button',{class:'btn small',onclick:()=>{S.editing={type:'doc'};renderPanel();},text:'Add a record'})));
  panel.append(dsec);
  const sts=storiesOf(p);const ssec=h('div',{class:'sec'},h('h3',{text:'Stories & messages'+(sts.length?' · '+sts.length:'')}));
  for(const st of sts)ssec.append(storyCard(p,st));
  if(!sts.length)ssec.append(h('p',{class:'q',style:'margin:0',text:'No stories yet. A memory, a voice message, or the story behind a photo all fit here.'}));
  if(mode()!=='view')ssec.append(h('div',{class:'p-actions'},h('button',{class:'btn small',onclick:()=>{S.editing={type:'story'};renderPanel();},text:'Add a story or message'})));
  panel.append(ssec);
  if(p.notes)panel.append(h('div',{class:'sec'},h('h3',{text:'Notes'}),h('div',{class:'notes',text:p.notes})));
  if(mode()!=='view')panel.append(h('div',{class:'sec'},h('h3',{text:'Add a relative'}),h('div',{class:'p-actions'},
    ['parent','spouse','child','sibling'].map(k=>h('button',{class:'btn small',onclick:()=>{S.editing={type:'new',rel:k};renderPanel();},text:'+ '+cap(k)})))));
}
const F_DEF={born:'',state:'',decade:'',lives:'',status:'',sort:'rel'};S.filters={...F_DEF};
function placeKeys(v){const o=parseLoc(v);const c=o.country?(isUS(o.country)?'USA':o.country):(o.state&&US_STATES.some(([a])=>a===o.state)?'USA':'');return{country:c,state:o.state||''};}
function renderRelatives(panel){const F=S.focus;if(!F)return;const fl=S.filters;
  panel.append(h('div',{class:'p-head'},h('div',{class:'p-rel',text:'Everyone, as related to'}),h('h2',{text:nameOf(F)})));
  const all=[...S.people.values()].filter(p=>p.id!==F&&!isUnknown(p));
  // options from the data itself
  const bornC=new Set(),bornS=new Set(),decs=new Set(),lives=new Set();
  for(const p of all){const b=placeKeys(p.bornPlace);if(b.country)bornC.add(b.country);if(b.state&&b.country==='USA')bornS.add(b.state);
    const y=+yearOf(p.born);if(y)decs.add(Math.floor(y/10)*10);const r=placeKeys(p.residence);if(r.country)lives.add(r.country==='USA'&&r.state?r.state:r.country);}
  const sel=(key,label,opts)=>h('label',{class:'flt'},h('span',{text:label}),h('select',{id:'flt-'+key,onchange:e=>{fl[key]=e.target.value;renderPanel();}},
    opts.map(([v,t])=>h('option',{value:v,selected:fl[key]===v},t))));
  const anyOpt=t=>[['',t]];
  const ctrls=h('div',{class:'filters'},
    sel('born','Born in',[...anyOpt('Anywhere'),...[...bornC].sort((x,y)=>x==='USA'?-1:y==='USA'?1:x.localeCompare(y)).map(c=>[c,c])]),
    sel('state','Born in state',[...anyOpt('Any state'),...[...bornS].sort().map(c=>[c,c])]),
    sel('decade','Born in the',[...anyOpt('Any decade'),...[...decs].sort().map(d=>[String(d),d+'s'])]),
    sel('lives','Lives in',[...anyOpt('Anywhere'),...[...lives].sort().map(c=>[c,c])]),
    sel('status','Living or not',[['','Everyone'],['living','Living'],['dead','Passed away']]),
    sel('sort','Sort by',[['rel','How related'],['born','Birth year'],['name','Name']]));
  const active=Object.keys(F_DEF).some(k=>k!=='sort'&&fl[k]);
  panel.append(ctrls);
  const match=p=>{const b=placeKeys(p.bornPlace),r=placeKeys(p.residence),y=+yearOf(p.born),dead=!!(p.deceased||p.died);
    if(fl.born&&b.country!==fl.born)return false;if(fl.state&&!(b.country==='USA'&&b.state===fl.state))return false;
    if(fl.decade&&!(y&&Math.floor(y/10)*10===+fl.decade))return false;
    if(fl.lives&&!(r.country===fl.lives||(r.country==='USA'&&r.state===fl.lives)))return false;
    if(fl.status==='living'&&dead)return false;if(fl.status==='dead'&&!dead)return false;return true;};
  const list=all.filter(match).map(p=>({p,r:rel(p.id)}));
  const bar=h('div',{class:'flt-bar'},h('span',{text:list.length+' of '+all.length+' people'}),
    (active||fl.sort!=='rel')?h('button',{class:'btn small ghost',text:'Clear filters',onclick:()=>{S.filters={...F_DEF};renderPanel();}}):null);
  panel.append(bar);
  if(!list.length){panel.append(h('p',{class:'q',text:active&&!bornC.size&&!decs.size?'Nobody has a birthplace or birth year filled in yet.':'Nobody matches these filters yet. Many birthplaces and dates are still blank, so this list will fill in as details are added.'}));return;}
  const row=({p,r})=>{const b=locStr(p.bornPlace);const sub=[r.l,[clean(p.born)&&('b. '+clean(p.born)),b].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
    return h('button',{class:'rrow',onclick:()=>select(p.id)},h('span',{class:'rn',text:p.name}),h('span',{class:'rl',text:sub}));};
  if(fl.sort==='born'){list.sort((a,b)=>byBirth(a.p.id,b.p.id));panel.append(h('div',{class:'rgroup'},list.map(row)));return;}
  if(fl.sort==='name'){const last=n=>String(n).replace(/\(.*?\)|[“”"?]/g,'').trim().split(/\s+/).pop();list.sort((a,b)=>last(a.p.name).localeCompare(last(b.p.name))||a.p.name.localeCompare(b.p.name));
    panel.append(h('div',{class:'rgroup'},list.map(row)));return;}
  const groups=['Parents & grandparents','Siblings','Spouses','Children & grandchildren','Aunts & uncles','Nieces & nephews','Cousins','In-laws & step-family','Related by marriage','Other relatives'];
  const lists=groups.map(()=>[]);for(const it of list)lists[it.r.cat]?.push(it);
  lists.forEach((arr,i)=>{if(!arr.length)return;arr.sort((a,b)=>a.r.r-b.r.r||byBirth(a.p.id,b.p.id));
    panel.append(h('div',{class:'rgroup'},h('h3',{text:groups[i]+' · '+arr.length}),arr.map(row)));});
}
function renderReview(panel){
  panel.append(h('div',{class:'p-head'},h('div',{class:'p-rel',text:'Only you see this'}),h('h2',{text:'Waiting for review'})));
  if(!S.suggest.length){panel.append(h('p',{class:'q',text:'Nothing to review. When relatives add details, photos or records, they show up here first.'}));return;}
  for(const s of S.suggest){const who=S.names[s.by]||'A relative';
    const box=h('div',{class:'sug'},h('div',{text:s.summary}),h('div',{class:'meta',text:who+' · '+new Date(s.at).toLocaleDateString()}));
    if(s.op.kind==='setPhoto'||s.op.kind==='addPhoto')box.append(h('div',{class:'ph has',style:`background-image:url("${blob(s.op.assetId)}");max-width:120px`,onclick:()=>lightbox(s.op.assetId,'Suggested photo')}));
    if(s.op.kind==='setContact'){const cb=contactBlock(s.op.contact);if(cb)box.append(cb);}
    if(s.op.kind==='addStory'){const m=mediaEl(s.op.story);if(m)box.append(m);if(s.op.story.text)box.append(h('div',{class:'st-x',style:'white-space:pre-wrap',text:s.op.story.text}));}
    if(s.op.kind==='addDoc'&&s.op.doc.assetId)box.append(h('div',null,h('button',{class:'btn small',onclick:()=>openAsset(s.op.doc),text:'View file'})));
    box.append(h('div',{class:'acts'},h('button',{class:'btn primary small',onclick:()=>resolve(s,true),text:'Approve'}),h('button',{class:'btn small danger',onclick:()=>resolve(s,false),text:'Decline'})));
    panel.append(box);}
}
async function resolve(s,ok){try{
  if(ok)await apply(s.op);
  else{const aid=s.op.assetId||s.op.doc?.assetId||s.op.story?.audioId;if(aid&&S.assets)await S.assets.delete(aid).catch(()=>{});}
  const ref=S.db.doc('suggestions/'+s.docId);const snap=await ref.get();const items=(snap.data()?.items||[]).filter(x=>x.sid!==s.sid);
  await ref.update({items});toast(ok?'Added to the tree':'Declined');}catch(e){toast('Couldn’t finish: '+(e.message||e.code));}}

function renderEdit(panel,p){const ed=S.editing;const sugg=mode()==='suggest';
  const back=h('button',{class:'btn ghost small',onclick:()=>{S.editing=null;renderPanel();},text:'← Back'});
  if(ed.type==='union'){const u=S.unions.get(ed.id);
    const f=h('form',{class:'edit'},h('div',{class:'p-head'},back,h('h2',{text:'Marriage of '+firstName(u.a)+' & '+firstName(u.b)})),
      h('label',null,'Status',h('select',{id:'u-status'},['married','divorced','widowed','ended'].map(s=>h('option',{value:s,selected:(u.status||'married')===s},cap(s))))),
      h('label',null,'Married',dateField({id:'u-married'},u.married)),
      h('label',null,'Divorced (if divorced)',dateField({id:'u-divorced'},u.divorced)),
      h('button',{class:'btn primary',type:'submit',text:sugg?'Send for review':'Save'}));
    f.onsubmit=e=>{e.preventDefault();const data={};for(const k of['status','married','divorced']){const v=$('u-'+k).value.trim();if(v!==(u[k]||(k==='status'?'married':'')))data[k]=v;}
      if(Object.keys(data).length)commit({kind:'updateUnion',id:u.id,data});S.editing=null;renderPanel();};
    return panel.append(f);}
  if(ed.type==='photos'||ed.type==='photo'){const isNew=ed.type==='photos';
    const list=isNew?ed.files.map((f,i)=>({key:'n'+i,file:f,url:URL.createObjectURL(f)})):[{key:'e0',ph:galleryOf(p).find(x=>x.id===ed.id)||{id:ed.id}}];
    const cur=isNew?ed.stage:(list[0].ph.stage||'adult');
    const rows=list.map(it=>{const v=it.ph||{};return h('div',{class:'phrow'},h('div',{class:'ph has',style:`background-image:url("${it.url||blob(v.id)}")`}),
      h('div',{class:'phf'},
        h('div',{class:'row'},h('label',null,'Approx. age',h('input',{id:'a-'+it.key,inputmode:'numeric',value:v.age||'',placeholder:'e.g. 8'})),h('label',null,'Year',yearSelect({id:'y-'+it.key},v.year))),
        h('label',null,'Milestone',h('input',{id:'m-'+it.key,list:'milestones',value:v.milestone||'',placeholder:'Pick one or type your own'})),
        h('label',null,'Caption',h('input',{id:'c-'+it.key,value:v.caption||'',placeholder:'Who, where, what’s happening'}))));});
    const f=h('form',{class:'edit'},h('div',{class:'p-head'},back,h('h2',{text:(isNew?'Add photos of ':'Photo details · ')+firstName(p.id)})),
      h('label',null,'Stage of life',h('select',{id:'ph-stage'},STAGES.map(([s2,l])=>h('option',{value:s2,selected:cur===s2},l)))),
      ...rows,h('datalist',{id:'milestones'},MILESTONES.map(m=>h('option',{value:m}))),
      h('p',{class:'q',style:'margin:0;font-size:12px',text:'Fill in the age or the year, whichever you know. When the birth year is known, the age is worked out from the year.'}),
      h('button',{class:'btn primary',type:'submit',text:sugg?'Send for review':'Save'}));
    f.onsubmit=async e=>{e.preventDefault();const stage=$('ph-stage').value;f.querySelector('button[type=submit]').disabled=true;
      const read=k=>{const o={stage};for(const[x,n]of[['a','age'],['y','year'],['m','milestone'],['c','caption']]){const v=$(x+'-'+k).value.trim();if(v)o[n]=v;}return o;};
      if(isNew){let n=0;for(const it of list){try{toast('Uploading '+(++n)+' of '+list.length+'…');const r=await S.assets.upload(it.file);
          await commit({kind:'addPhoto',personId:p.id,assetId:r.id,photo:{id:r.id,...(r.face?{face:r.face}:{}),...read(it.key)}});}catch(err){toast(uploadMsg(err));}}}
      else{const o=read('e0');const old=list[0].ph;for(const k of['age','year','milestone','caption'])if(!o[k]&&old[k])o[k]='';await commit({kind:'updatePhoto',personId:p.id,assetId:ed.id,photo:{id:ed.id,...o}});}
      S.editing=null;renderPanel();};
    return panel.append(f);}
  if(ed.type==='contact'){const vis=S.contacts.get(p.id),hid=S.isOwner?S.hiddenContacts.get(p.id):null;const c=vis||hid||{};const shown=!!vis;
    const f=h('form',{class:'edit'},h('div',{class:'p-head'},back,h('h2',{text:'Contact info · '+firstName(p.id)})),
      h('label',null,'Street address',h('input',{id:'c-street',value:c.street||'',autocomplete:'street-address',placeholder:'e.g. 123 Main St, Apt 4'})),
      locInput('caddr','City, state, country',c.addr||''),
      h('div',{class:'row'},h('label',null,'ZIP / postal code',h('input',{id:'c-zip',value:c.zip||'',autocomplete:'postal-code'})),h('span')),
      h('div',{class:'row'},h('label',null,'Email',h('input',{id:'c-email',type:'email',value:c.email||'',autocomplete:'email'})),h('label',null,'Phone',h('input',{id:'c-phone',type:'tel',value:c.phone||'',autocomplete:'tel'}))),
      h('datalist',{id:'countries'},COUNTRIES.map(x=>h('option',{value:x}))),
      h('fieldset',{class:'edu'},h('legend',{text:'Who can see this?'}),
        h('label',{class:'check'},h('input',{type:'radio',name:'c-vis',id:'c-vis-show',checked:shown}),'Show to everyone the family tree is shared with'),
        h('label',{class:'check'},h('input',{type:'radio',name:'c-vis',id:'c-vis-hide',checked:!shown}),'Keep private (only the family\u2019s tree managers can see it)')),
      h('button',{class:'btn primary',type:'submit',text:sugg?'Send for review':'Save'}));
    f.onsubmit=async e=>{e.preventDefault();const contact={street:$('c-street').value.trim(),addr:readLoc('caddr')||undefined,zip:$('c-zip').value.trim(),email:$('c-email').value.trim(),phone:$('c-phone').value.trim()};
      for(const k of Object.keys(contact))if(!contact[k])delete contact[k];
      await commit({kind:'setContact',personId:p.id,visible:$('c-vis-show').checked,contact});S.editing=null;renderPanel();};
    return panel.append(f);}
  if(ed.type==='story'){const gal=galleryOf(p);let dict=null,listening=false;
    const ta=h('textarea',{id:'s-text',rows:'6',placeholder:'Write the memory, or tap Speak and say it out loud'});
    const live=h('span',{class:'live'});
    const micBtn=S.dictation?h('button',{type:'button',class:'btn small',text:'Speak',onclick:async()=>{
        if(listening){try{await S.dictation.stop();}catch(e){}return;}
        if(!dict){S.dictation.onPartial(({text})=>{live.textContent=text;});S.dictation.onFinal(({text})=>{ta.value=(ta.value?ta.value.replace(/\s*$/,' '):'')+text;live.textContent='';});
          S.dictation.onState(({state})=>{listening=state==='listening';micBtn.textContent=listening?'Stop':'Speak';if(!listening)live.textContent='';});dict=true;}
        S.dictation.start().catch(err=>{if(err?.code==='not_granted')micBtn.remove();});}}):null;
    const f=h('form',{class:'edit'},h('div',{class:'p-head'},back,h('h2',{text:'A story or message about '+firstName(p.id)})),
      h('label',null,'Title',h('input',{id:'s-title',required:true,placeholder:'e.g. Summers at Grandpa Sid’s store'})),
      h('div',{class:'row'},h('label',null,'Part of life',h('select',{id:'s-period'},PERIODS.map(([k,l])=>h('option',{value:k},l)))),
        h('label',null,'About a photo',h('select',{id:'s-photo'},h('option',{value:''},'No photo'),gal.map((ph,i)=>h('option',{value:ph.id},(photoLine(p,ph)||periodLabel(ph.stage)+' photo '+(i+1))))))),
      h('label',null,'Story',ta),micBtn?h('div',{class:'mic'},micBtn,live):null,
      S.assets?h('label',null,'Voice message or video (optional)',h('input',{id:'s-audio',type:'file',accept:'audio/*,video/*,.m4a,.mp4,.webm'})):null,
      S.assets&&window.MediaRecorder&&navigator.mediaDevices?recorderBox():null,
      S.assets?h('p',{class:'q',style:'margin:0;font-size:12px',text:'Record right here, or attach a voice memo or video you already have.'}):null,
      h('label',null,'Told by',h('input',{id:'s-by',placeholder:'Who is telling it? e.g. Cory, in 2026'})),
      h('button',{class:'btn primary',type:'submit',text:sugg?'Send for review':'Save'}));
    f.onsubmit=async e=>{e.preventDefault();if(listening){try{await S.dictation.stop();}catch(x){}}
      const st={id:Math.random().toString(36).slice(2,10),title:$('s-title').value.trim(),period:$('s-period').value,at:new Date().toISOString()};
      const ph=$('s-photo').value;if(ph)st.photoId=ph;const tx=ta.value.trim();if(tx)st.text=tx;const by=$('s-by').value.trim();if(by)st.by=by;
      const file=$('s-audio')?.files[0]||(REC.blob&&new File([REC.blob],'voice-message.'+(REC.blob.type.includes('mp4')?'m4a':'webm'),{type:REC.blob.type}));REC.blob=null;
      if(file){const ext=(file.name.split('.').pop()||'').toLowerCase();const isVideo=String(file.type).startsWith('video/')&&ext!=='m4a';
        const type=ext==='webm'||file.type.includes('webm')?'video/webm':(['m4a','mp4','mov','aac'].includes(ext)||/mp4|m4a|aac|quicktime/.test(file.type))?'video/mp4':null;
        const upType=type||file.type||'audio/mpeg';
        try{toast('Uploading…');const r=await S.assets.upload(file,{type:upType});st.audioId=r.id;st.mediaType=r.contentType;if(isVideo)st.isVideo=true;}catch(err){toast(uploadMsg(err));return;}}
      if(!st.text&&!st.audioId){toast('Write the story or attach a recording');return;}
      await commit({kind:'addStory',personId:p.id,assetId:st.audioId,story:st});S.editing=null;renderPanel();};
    return panel.append(f);}
  if(ed.type==='doc'){const f=h('form',{class:'edit'},h('div',{class:'p-head'},back,h('h2',{text:'Add a record for '+firstName(p.id)})),
      h('label',null,'What is it?',h('input',{id:'d-title',required:true,placeholder:'e.g. Birth certificate, 1923 ship manifest'})),
      h('label',null,'Type',h('select',{id:'d-kind'},['Birth certificate','Death certificate','Marriage record','Divorce record','Census record','Military record','Immigration record','Obituary','Photo','Other'].map(k=>h('option',{value:k},k)))),
      S.assets?h('label',null,'Upload a file (PDF or image)',h('input',{id:'d-file',type:'file',accept:'application/pdf,image/*'})):null,
      h('label',null,(S.assets?'Or paste a link':'Link to the record'),h('input',{id:'d-url',type:'url',placeholder:'https://…'})),
      h('button',{class:'btn primary',type:'submit',text:sugg?'Send for review':'Save'}));
    f.onsubmit=async e=>{e.preventDefault();const title=$('d-title').value.trim(),kind=$('d-kind').value,url=$('d-url').value.trim(),file=$('d-file')?.files[0];
      if(!file&&!url){toast('Add a file or a link');return;}
      const doc={title,kind};if(url)doc.url=url;
      if(file){try{toast('Uploading…');const r=await S.assets.upload(file);doc.assetId=r.id;doc.type=r.contentType;doc.file=file.name;}catch(err){toast(uploadMsg(err));return;}}
      await commit({kind:'addDoc',personId:p.id,doc,assetId:doc.assetId});S.editing=null;renderPanel();};
    return panel.append(f);}
  const isNew=ed.type==='new';const src=isNew?{}:p;
  const inp=(k,ph)=>h('label',null,FIELD_LABEL[k],h('input',{id:'f-'+k,value:src[k]||'',placeholder:ph||''}));
  const yr=k=>h('label',null,FIELD_LABEL[k],yearSelect({id:'f-'+k},src[k]));
  const extra=[];
  const jobList=h('div',{class:'jobs'});
  const addJob=(j={})=>{const row=h('div',{class:'job'},
      h('div',{class:'row'},h('label',null,'Company or employer',h('input',{class:'j-company',value:j.company||'',placeholder:'e.g. Acme Co.'})),h('label',null,'Role',h('input',{class:'j-role',value:j.role||'',placeholder:'e.g. Founder'}))),
      h('div',{class:'row3'},h('div',{class:'row'},h('label',null,'From',yearSelect({class:'j-from'},j.from)),h('label',null,'To',yearSelect({class:'j-to'},j.to,{present:true}))),
        h('button',{type:'button',class:'btn small ghost danger',text:'Remove',onclick:()=>row.remove()})));jobList.append(row);};
  const startJobs=Array.isArray(src.jobs)&&src.jobs.length?src.jobs:(src.occupation?[{role:src.occupation}]:[{}]);startJobs.forEach(addJob);
  const jobsBox=h('fieldset',{class:'edu'},h('legend',{text:'Work'}),jobList,h('div',null,h('button',{type:'button',class:'btn small',text:'+ Add another job',onclick:()=>addJob()})));
  if(isNew&&ed.rel==='child'){const sp=spousesOf(p.id);extra.push(h('label',null,'Other parent',h('select',{id:'f-other'},h('option',{value:''},'Unknown'),sp.map(s=>h('option',{value:s},nameOf(s))))));}
  if(isNew&&ed.rel==='spouse')extra.push(h('label',null,'Status',h('select',{id:'f-ustatus'},['married','divorced','widowed','ended'].map(s=>h('option',{value:s},cap(s))))),
    h('label',null,'Married',dateField({id:'f-umarried'},'')),h('label',null,'Divorced (if divorced)',dateField({id:'f-udivorced'},'')));
  const f=h('form',{class:'edit'},h('div',{class:'p-head'},back,h('h2',{text:isNew?'Add '+(ed.rel==='child'?'a child':'a '+ed.rel)+' of '+firstName(p.id):(sugg?'Suggest a correction':'Edit '+firstName(p.id))})),
    h('div',{class:'row'},h('label',null,'First name',h('input',{id:'f-first',value:src.first||'',autocomplete:'off'})),h('label',null,'Middle name',h('input',{id:'f-middle',value:src.middle||'',autocomplete:'off'}))),
    h('div',{class:'row'},h('label',null,'Last name',h('input',{id:'f-last',value:src.last||'',autocomplete:'off'})),h('label',null,'Also known as',h('input',{id:'f-aka',value:src.aka||'',autocomplete:'off',placeholder:'Other names, e.g. Clara'}))),
    h('fieldset',{class:'edu'},h('legend',{text:'Nickname'}),
      h('input',{id:'f-nick',value:src.nick||'',autocomplete:'off',placeholder:'e.g. Bud','aria-label':'Nickname'}),
      h('label',{class:'check'},h('input',{type:'checkbox',id:'f-shownick',checked:src.showNick!==false}),'Show the nickname on the tree')),
    (!isNew&&!src.first&&!src.last)?h('p',{class:'q',style:'margin:0;font-size:12px',text:'Currently listed as “'+(src.name||'')+'”. Fill in the name fields to replace it.'}):null,
    h('div',{class:'row'},h('label',null,'Gender',h('select',{id:'f-g'},[['','Not set'],['f','Female'],['m','Male']].map(([v,t])=>h('option',{value:v,selected:(src.g||'')===v},t)))),inp('maiden','Maiden or birth name')),
    h('label',null,'Born',dateField({id:'f-born'},src.born)),inp('bornHospital','Hospital, if known'),
    locInput('bornPlace','Birthplace',src.bornPlace),
    h('div',{id:'f-livebox',hidden:!!src.deceased},locInput('residence','Lives in',src.residence)),
    h('label',{class:'check'},h('input',{type:'checkbox',id:'f-deceased',checked:!!src.deceased,onchange:e=>{$('f-deathbox').hidden=!e.target.checked;$('f-livebox').hidden=e.target.checked;}}),'Has passed away'),
    h('div',{id:'f-deathbox',class:'subbox',hidden:!src.deceased},h('label',null,'Died',dateField({id:'f-died'},src.died)),locInput('diedPlace','Place of death',src.diedPlace),inp('buried','Cemetery name'),locInput('buriedPlace','Cemetery location',src.buriedPlace)),
    h('datalist',{id:'countries'},COUNTRIES.map(c=>h('option',{value:c}))),
    jobsBox,
    h('fieldset',{class:'edu'},h('legend',{text:'Education'}),
      h('div',{class:'row3'},inp('hsSchool',src.eduHs||'School name'),yr('hsYear')),
      h('div',{class:'row3'},inp('colSchool',src.eduCollege||'School name'),yr('colYear')),inp('colDegree','e.g. BA in History'),
      h('div',{class:'row3'},inp('gradSchool',src.eduGrad||'School name'),yr('gradYear')),inp('gradDegree','e.g. MBA, JD, MD'),
      inp('eduOther','Trade school, certificates…')),
    h('label',null,FIELD_LABEL.notes,h('textarea',{id:'f-notes',rows:'4'},src.notes||'')),
    ...extra,
    h('button',{class:'btn primary',type:'submit',text:sugg?'Send for review':'Save'}));
  f.onsubmit=async e=>{e.preventDefault();const data={};
    for(const k of['first','middle','last','aka','g','maiden','nick','born','bornHospital','hsSchool','hsYear','colSchool','colDegree','colYear','gradSchool','gradDegree','gradYear','eduOther','died','buried','notes']){const v=$('f-'+k).value.trim();if(isNew?v:v!==(src[k]||''))data[k]=v;}
    for(const k of['bornPlace','residence','diedPlace','buriedPlace']){const v=readLoc(k);if(isNew?v:!sameLoc(v,src[k]||''))data[k]=v;}
    const jobs=[...jobList.querySelectorAll('.job')].map(r=>({company:r.querySelector('.j-company').value.trim(),role:r.querySelector('.j-role').value.trim(),from:r.querySelector('.j-from').value.trim(),to:r.querySelector('.j-to').value.trim()})).filter(j=>j.company||j.role).map(j=>Object.fromEntries(Object.entries(j).filter(([,v])=>v)));
    {const sn=$('f-shownick').checked;if(isNew?!sn:sn!==(src.showNick!==false))data.showNick=sn;}
    {const nf=$('f-first').value.trim(),nm=$('f-middle').value.trim(),nl=$('f-last').value.trim();const full=joinName(nf,nm,nl);
      if(full&&full!==src.name)data.name=full;}
    const oldJobs=Array.isArray(src.jobs)?src.jobs:(src.occupation?[{role:src.occupation}]:[]);
    if(JSON.stringify(jobs)!==JSON.stringify(oldJobs)&&(jobs.length||oldJobs.length))data.jobs=jobs;
    const dec=$('f-deceased').checked;if(isNew?dec:dec!==!!src.deceased)data.deceased=dec;
    if(isNew){if(!data.name){toast('Add a name');return;}const nid=slug(data.name);const op={kind:'createPerson',id:nid,data:{...data,parents:[]},relTo:p.id,relWord:ed.rel};
      if(ed.rel==='child'){const o=$('f-other').value;op.data.parents=[p.id,o].filter(Boolean);}
      if(ed.rel==='sibling'){if(!parentsOf(p.id).length){toast('Add a parent for '+firstName(p.id)+' first, so the sibling can be linked');return;}op.data.parents=[...(p.parents||[])];}
      if(ed.rel==='parent'){if(parentsOf(p.id).length>=2){toast(firstName(p.id)+' already has two parents');return;}op.parentOf=p.id;}
      if(ed.rel==='spouse'){op.union={id:'u-'+nid,data:{a:p.id,b:nid,status:$('f-ustatus').value,married:$('f-umarried').value.trim(),divorced:$('f-udivorced').value.trim(),order:unionsOf(p.id).length+1}};}
      await commit(op);}
    else if(Object.keys(data).length)await commit({kind:'updatePerson',id:p.id,data});
    S.editing=null;renderPanel();};
  panel.append(f);
}
function uploadMsg(err){return{too_large:'That file is too big (20 MB limit).',unsupported_type:'Use a photo (JPG, PNG) or a PDF.',quota_or_state:'Storage is full.'}[err?.code]||'Upload didn’t work. Try again.';}
async function uploadPhoto(id,slot,file){if(!file)return;try{toast('Uploading…');const r=await S.assets.upload(file);await commit({kind:'setPhoto',personId:id,slot,assetId:r.id,face:r.face});}catch(e){toast(uploadMsg(e));}}
function lightbox(aid,title){const lb=$('lightbox');lb.replaceChildren(h('img',{src:blob(aid),alt:title}),h('div',{class:'lb-bar'},
  S.downloads?h('button',{class:'btn',onclick:()=>download({assetId:aid,title}),text:'Download'}):null,h('button',{class:'btn',onclick:()=>lb.hidden=true,text:'Close'})));lb.hidden=false;}
function openPhoto(pid,aid){const p=P(pid);const ph=galleryOf(p).find(x=>x.id===aid)||{id:aid};const lb=$('lightbox');const line=photoLine(p,ph);
  const info=h('div',{class:'lb-info'},h('div',{class:'lb-t',text:p.name}),line?h('div',{text:line}):null,ph.caption?h('div',{class:'lb-c',text:ph.caption}):null);
  let armed=false;
  const bar=h('div',{class:'lb-bar'},
    S.downloads?h('button',{class:'btn',onclick:()=>download({assetId:aid,title:p.name+(ph.milestone?' - '+ph.milestone:'')}),text:'Download'}):null,
    mode()!=='view'?h('button',{class:'btn',onclick:()=>{lb.hidden=true;S.sel=pid;S.tab='person';S.editing={type:'photo',id:aid};renderPanel();openSheet();},text:mode()==='edit'?'Edit details':'Suggest details'}):null,
    mode()==='edit'&&p.portrait!==aid?h('button',{class:'btn',onclick:async()=>{lb.hidden=true;await commit({kind:'setPortrait',personId:pid,assetId:aid});},text:'Use as profile picture'}):null,
    mode()==='edit'?h('button',{class:'btn danger',onclick:async e=>{if(!armed){armed=true;e.target.textContent='Tap again to remove';return;}lb.hidden=true;await removePhoto(pid,aid);},text:'Remove'}):null,
    h('button',{class:'btn',onclick:()=>lb.hidden=true,text:'Close'}));
  const linked=storiesOf(p).filter(st=>st.photoId===aid);
  if(linked.length)info.append(h('div',{class:'lb-stories'},linked.map(st=>h('div',null,h('div',{class:'st-t',text:st.title}),mediaEl(st),st.text?h('div',{class:'lb-c',style:'white-space:pre-wrap',text:st.text}):null))));
  lb.replaceChildren(h('figure',{class:'lb-fig'},h('img',{src:blob(aid),alt:p.name+(line?', '+line:'')}),info),bar);lb.hidden=false;}
async function removePhoto(pid,aid){try{const ref=S.db.doc('people/'+pid);const cur=(await ref.get()).data()||{};const upd={gallery:galleryOf(cur).filter(x=>x.id!==aid)};
  if(cur.portrait===aid)upd.portrait='';await ref.update(upd);if(S.assets)S.assets.delete(aid).catch(()=>{});toast('Photo removed');}catch(e){toast('Couldn’t remove it');}}
$('lightbox').addEventListener('click',e=>{if(e.target.id==='lightbox')e.target.hidden=true;});
function openAsset(d){if(String(d.type||'').startsWith('image/'))return lightbox(d.assetId,d.title);CTX.urlAsync(d.assetId).then(u=>{window.open(u,'_blank')||toast('Use Download to save this file.');});}
async function download(d){try{const r=await fetch(await CTX.urlAsync(d.assetId));const b=await r.blob();const ext=(d.file&&d.file.split('.').pop())||(b.type.split('/')[1]||'bin').replace('jpeg','jpg');
  await S.downloads.save({filename:d.file||(d.title.replace(/[^\w\- ]+/g,'')+'.'+ext),data:b});}catch(e){if(e?.code!=='declined')toast('Download didn’t start.');}}

/* ---------- search, zoom, pan ---------- */
$('q').addEventListener('input',()=>{const q=$('q').value.trim().toLowerCase();const box=$('results');if(!q){box.hidden=true;return;}
  const hits=[...S.people.values()].filter(p=>[p.name,p.maiden,p.nick].some(v=>v&&v.toLowerCase().includes(q))).slice(0,12);
  box.replaceChildren(...(hits.length?hits.map(p=>h('button',{onclick:()=>{box.hidden=true;$('q').value='';setFocus(p.id);}},p.name,h('small',{text:(AF?rel(p.id).l+' · ':'')+lifespan(p)}))):[h('div',{class:'q',style:'padding:8px 10px',text:'No one by that name yet'})]));box.hidden=false;});
document.addEventListener('click',e=>{if(!e.target.closest('.search'))$('results').hidden=true;});
$('zoomIn').onclick=()=>{S.scale=Math.min(1.6,S.scale+0.15);applyScale();};
$('zoomOut').onclick=()=>{S.scale=Math.max(0.2,S.scale-0.15);applyScale();};
{const bs=$('brSide'),bc=$('brCous');if(bs&&bc){bs.value=S.side;bc.value=String(S.cousins);
  bs.onchange=()=>{S.side=bs.value;try{localStorage.setItem('gft-side',S.side);}catch(e){}renderTree(true);};
  bc.onchange=()=>{S.cousins=+bc.value;try{localStorage.setItem('gft-cousins',S.cousins);}catch(e){}renderTree(true);};}}
const syncBar=()=>{const b=$('branchBar');if(b)b.hidden=S.view!=='branch';};syncBar();
{const vs=$('viewSel');if(vs){vs.value=S.view;vs.onchange=()=>{S.view=vs.value;try{localStorage.setItem('gft-view',S.view);}catch(e){}syncBar();
  if(S.view==='whole'&&S.scale>0.8)S.scale=0.7;renderTree(true);};}}
$('recenter').onclick=()=>centerOnFocus();
(()=>{const st=$('stage');let d=null;st.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.target.closest('.card'))return;d={x:e.clientX,y:e.clientY,l:st.scrollLeft,t:st.scrollTop};st.classList.add('dragging');});
  window.addEventListener('pointermove',e=>{if(!d)return;st.scrollLeft=d.l-(e.clientX-d.x);st.scrollTop=d.t-(e.clientY-d.y);});
  window.addEventListener('pointerup',()=>{d=null;st.classList.remove('dragging');});})();

/* ---------- data ---------- */
function showEmpty(title,msg){const e=$('empty');e.hidden=false;e.replaceChildren(h('div',null,h('h2',{text:title}),h('p',{text:msg})));}
function refresh(){if(!S.loaded.p||!S.loaded.u)return;
  if(!S.people.size){showEmpty('No one in the tree yet',S.isOwner?'Start with yourself, then add your parents, partner and children from your page.':'People added to the family appear here.');if(S.isOwner)$('empty').firstChild.append(h('button',{class:'btn primary',style:'margin-top:14px',text:'Add yourself',onclick:()=>CTX.addSelf()}));$('centered').textContent='';return;}
  $('empty').hidden=true;
  if(!S.focus||!P(S.focus)){const hid=decodeURIComponent(location.hash.slice(1));S.focus=P(hid)?hid:(P(CTX.myPersonId)?CTX.myPersonId:S.people.keys().next().value);S.sel=S.focus;renderTree(true);if(innerWidth>820)openSheet();}
  else renderTree(false);
  renderPanel();}
export function refreshPanel(){renderPanel();}
export const focusName=()=>S.focus?nameOf(S.focus):'';
export function startTree(ctx){
  CTX=ctx; const db=ctx.db; S.db=db; S.assets=ctx.assets; S.downloads=ctx.downloads; S.dictation=ctx.dictation;
  S.isOwner=ctx.canManage; S.uid=ctx.uid; S.canWrite=ctx.canContribute;
  const err=e=>{showEmpty('Couldn\u2019t load the family',e?.message||'Try reloading the page.');};
  db.collection('people').onSnapshot(s=>{S.people=new Map(s.docs.map(d=>[d.id,{id:d.id,...d.data()}]));S.loaded.p=true;ctx.signAll(S.people).then(()=>{if(S.loaded.p&&S.loaded.u)renderTree(false);});refresh();},err);
  db.collection('unions').onSnapshot(s=>{S.unions=new Map(s.docs.map(d=>[d.id,{id:d.id,...d.data()}]));S.loaded.u=true;refresh();},err);
  db.collection('contacts').onSnapshot(s=>{S.contacts=new Map(s.docs.map(d=>[d.id,d.data()]));if(S.loaded.p)renderPanel();},()=>{});
  if(S.isOwner){db.collection('hiddencontacts').onSnapshot(s=>{S.hiddenContacts=new Map(s.docs.map(d=>[d.id,d.data()]));renderPanel();},()=>{});
    db.collection('suggestions').onSnapshot(async s=>{
      S.suggest=s.docs.flatMap(d=>(d.data().items||[]).map(it=>({...it,docId:d.id,by:d.data().by||d.id})));
      const ids=[...new Set(S.suggest.map(x=>x.by))];if(ids.length){try{const pr=await ctx.profiles(ids);for(const i of ids)S.names[i]=pr[i]||'';}catch(e){}}
      renderPanel();},()=>{});}
  else if(S.uid){db.doc('suggestions/'+S.uid).onSnapshot(s=>{S.mine=s.exists?s.data():null;},()=>{});}
  renderPanel();
}
