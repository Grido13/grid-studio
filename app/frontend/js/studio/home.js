import {h,useCallback,useEffect,useRef,useState} from './core.js';
import {MW} from './format.js';
import {j} from './api.js';

/* ── scroll story: dispatch → flow → overload → redispatch ── */
const STORY_STEPS=[
 ['01','Dispatch','A storm front reaches the North Sea coast. The market dispatches every wind farm at full output — location-blind.'],
 ['02','Power flow','Physics picks the route. The power flows south on the 380 kV corridor, toward the load.'],
 ['03','Overload','The corridor passes its thermal rating. The grid cannot carry what the market decided.'],
 ['04','Redispatch','Wind north of the bottleneck curtails, gas south of it ramps up. Paid, logged — and simulated here for all 8,760 hours.']];
const STORY_BOUNDS=[[0,.25],[.25,.52],[.52,.76],[.76,1]];
const kf=pts=>p=>{if(p<=pts[0][0])return pts[0][1];
  for(let i=1;i<pts.length;i++)if(p<=pts[i][0]){const[a,va]=pts[i-1],[b,vb]=pts[i];return va+(vb-va)*((p-a)/(b-a))}
  return pts[pts.length-1][1]};
const F_LOAD=kf([[0,0],[.10,34],[.42,74],[.58,138],[.74,138],[.90,96]]);
const F_WIND=kf([[0,430],[.42,640],[.56,1150],[.74,1150],[.90,690]]);
const F_CURT=kf([[.76,0],[.90,460]]);
const F_SPIN=kf([[0,.9],[.56,1.7],[.76,1.7],[.92,.3]]);

function Story({T}){
  const outer=useRef(null),stick=useRef(null);
  const R=useRef({blades:[]}).current;
  const stepEls=useRef([]),fillEls=useRef([]);
  useEffect(()=>{
    const rm=matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf,ang=0,dash=0,last=performance.now();
    const tick=now=>{
      raf=requestAnimationFrame(tick);
      const o=outer.current;if(!o||!stick.current)return;
      const dt=Math.min((now-last)/1000,.05);last=now;
      const r=o.getBoundingClientRect();
      if(r.bottom<0||r.top>innerHeight)return;
      const p=Math.min(1,Math.max(0,(46-r.top)/(r.height-stick.current.clientHeight)));
      const load=F_LOAD(p),wind=F_WIND(p),curt=F_CURT(p),over=load>100;
      if(!rm){ang=(ang+dt*240*F_SPIN(p))%360;dash-=dt*(12+load*1.15)}
      R.blades.forEach((g,i)=>g&&g.setAttribute('transform',`rotate(${ang+i*47})`));
      if(R.flow){R.flow.style.strokeDashoffset=dash;R.flow.style.opacity=Math.min(load/40,1)*.9;
        R.flow.style.stroke=over?'var(--red)':'var(--ink)'}
      if(R.line)R.line.style.stroke=over?'var(--red)':'var(--hair)';
      if(R.loadT){R.loadT.textContent=`${T.svg.loading} ${Math.round(load)}%`;
        R.loadT.style.fill=over?'var(--red)':'var(--ink)'}
      if(R.windT)R.windT.textContent=`${T.svg.wind} ${Math.round(wind).toLocaleString('en-US')} MW`;
      if(R.curtT){R.curtT.textContent=`− ${Math.round(curt)} MW ${T.svg.curt}`;R.curtT.style.opacity=curt>5?1:0}
      if(R.gasT){R.gasT.textContent=`+ ${Math.round(curt)} MW ${T.svg.gas}`;R.gasT.style.opacity=curt>5?1:0}
      if(R.farm)R.farm.style.opacity=curt>5?.55:1;
      const si=p<.25?0:p<.52?1:p<.76?2:3;
      stepEls.current.forEach((el,i)=>{if(!el)return;
        el.classList.toggle('on',i===si);
        const[a,b]=STORY_BOUNDS[i],f=Math.min(1,Math.max(0,(p-a)/(b-a)));
        if(fillEls.current[i])fillEls.current[i].style.transform=`scaleX(${i<si?1:i>si?0:f})`});
    };
    raf=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(raf);
  },[T]);
  const turbine=(x,i)=>h`<g key=${x}>
    <line x1=${x} y1="300" x2=${x} y2="254" class="mast"/>
    <g transform=${`translate(${x},254)`}>
      <g ref=${el=>R.blades[i]=el}>
        <line x1="0" y1="0" x2="0" y2="-26" class="blade"/>
        <line x1="0" y1="0" x2="22.5" y2="13" class="blade"/>
        <line x1="0" y1="0" x2="-22.5" y2="13" class="blade"/>
      </g>
      <circle r="2.4" class="hub"/>
    </g></g>`;
  const city=[[800,272,28],[818,254,46],[836,264,36],[854,248,52],[872,268,32]];
  return h`<div class="story" ref=${outer}>
    <div class="stick" ref=${stick}>
      <svg viewBox="60 200 880 165" aria-label="How redispatch works: wind power overloads a north–south line and is curtailed">
        <g class="farm" ref=${el=>R.farm=el}>
          <line x1="92" y1="300" x2="272" y2="300" class="hairl"/>
          ${[116,176,236].map((x,i)=>turbine(x,i))}
        </g>
        <text x="176" y="226" class="ro" text-anchor="middle" ref=${el=>R.windT=el}>${T.svg.wind} 430 MW</text>
        <text x="176" y="350" class="ro redt" text-anchor="middle" style=${{opacity:0}} ref=${el=>R.curtT=el}></text>
        <rect x="272" y="292" width="16" height="16" class="sub"/>
        <text x="280" y="334" class="lab" text-anchor="middle">${T.svg.north}</text>
        <line x1="288" y1="300" x2="700" y2="300" class="corridor" ref=${el=>R.line=el}/>
        <path d="M288,300 L700,300" class="flow" ref=${el=>R.flow=el}/>
        <text x="494" y="270" class="ro" text-anchor="middle" ref=${el=>R.loadT=el}>${T.svg.loading} 0%</text>
        <text x="494" y="326" class="lab" text-anchor="middle">${T.svg.rating}</text>
        <rect x="700" y="292" width="16" height="16" class="sub"/>
        <text x="708" y="334" class="lab" text-anchor="middle">${T.svg.south}</text>
        <text x="708" y="226" class="ro greent" text-anchor="middle" style=${{opacity:0}} ref=${el=>R.gasT=el}></text>
        <line x1="716" y1="300" x2="794" y2="300" class="hairl"/>
        <g class="city">${city.map(([x,y,hh])=>h`<rect key=${x} x=${x} y=${y} width="13" height=${hh}/>`)}</g>
        <text x="843" y="334" class="lab" text-anchor="middle">${T.svg.load}</text>
      </svg>
      <div class="steps">${T.story.map(([n,t,d],i)=>h`
        <div class="step" key=${n} ref=${el=>stepEls.current[i]=el}>
          <div class="num">${n}</div><h3>${t}</h3><p>${d}</p>
          <div class="track"><span class="fill" ref=${el=>fillEls.current[i]=el}></span></div>
        </div>`)}</div>
    </div>
  </div>`;
}


/* count-up readout for the night panel's instrument row */
const NCount=({to,run,lang,prefix=''})=>{
  const [v,setV]=useState(null);
  useEffect(()=>{
    if(!run||to==null)return;
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){setV(to);return}
    let raf,t0;
    const step=now=>{t0=t0||now;const p=Math.min(1,(now-t0)/1500);
      setV(Math.round(to*(1-Math.pow(1-p,3))));
      if(p<1)raf=requestAnimationFrame(step)};
    raf=requestAnimationFrame(step);
    return()=>cancelAnimationFrame(raf);
  },[run,to]);
  return v==null?'···':prefix+v.toLocaleString(lang==='de'?'de-DE':'en-US');
};

/* ── the grid at night: every real 220/380 kV circuit, drawn as light ── */
function Night({T,lang}){
  const secRef=useRef(null),cvsRef=useRef(null);
  const st=useRef({}).current;
  const [lit,setLit]=useState(false);
  const [meta,setMeta]=useState(null);
  useEffect(()=>{
    const sec=secRef.current;if(!sec||st.io)return;
    st.io=new IntersectionObserver(es=>{st.vis=es.some(e=>e.isIntersecting);
      if(st.vis&&!st.started){st.started=true;
        j('/api/topology?v_nom=220,380&include_geom=true').then(d=>{if(!st.dead)boot(d)}).catch(()=>{});}
    },{rootMargin:'480px 0px'});
    st.io.observe(sec);
    const onRs=()=>{if(st.geo&&st.done){setup();drawBase(1);blit()}};
    window.addEventListener('resize',onRs);
    return()=>{st.dead=true;st.io.disconnect();window.removeEventListener('resize',onRs);
      cancelAnimationFrame(st.raf)};
  },[]);
  function boot(d){
    st.geo=(d.lines||[]).map(l=>{
      const g=l.geom&&l.geom.coordinates;if(!g||g.length<2)return null;
      return{pts:g,hv:parseFloat(l.v_nom)>=380,d0:Math.random()*.55};
    }).filter(Boolean);
    st.busgeo=(d.buses||[]).map(b=>[+b.lon,+b.lat,parseFloat(b.v_nom)>=380])
      .filter(q=>isFinite(q[0])&&isFinite(q[1]));
    const km=(d.lines||[]).reduce((a,l)=>a+(parseFloat(l.length)||0),0);
    setMeta({corr:st.geo.length,km:Math.round(km/100)*100,buses:st.busgeo.length});
    setup();
    if(matchMedia('(prefers-reduced-motion: reduce)').matches){
      st.done=true;drawBase(1);blit();setLit(true);return}
    st.t0=performance.now();
    const DUR=5200;
    const tick=now=>{
      const p=Math.min(1,(now-st.t0)/DUR);
      drawBase(p);blit();
      if(p>.45&&!st.litSent){st.litSent=true;setLit(true)}
      if(p<1)st.raf=requestAnimationFrame(tick);
      else{st.done=true;initPackets();st.last=now;st.raf=requestAnimationFrame(amb)}
    };
    st.raf=requestAnimationFrame(tick);
  }
  function setup(){
    const cvs=cvsRef.current,r=cvs.getBoundingClientRect();
    st.dpr=Math.min(devicePixelRatio||1,2);
    st.w=cvs.width=Math.max(2,Math.round(r.width*st.dpr));
    st.h=cvs.height=Math.max(2,Math.round(r.height*st.dpr));
    st.vctx=cvs.getContext('2d');
    st.buf=document.createElement('canvas');st.buf.width=st.w;st.buf.height=st.h;
    st.bctx=st.buf.getContext('2d');
    let x0=99,x1=-99,y0=99,y1=-99;
    st.geo.forEach(l=>l.pts.forEach(q=>{if(q[0]<x0)x0=q[0];if(q[0]>x1)x1=q[0];
      if(q[1]<y0)y0=q[1];if(q[1]>y1)y1=q[1]}));
    const kx=Math.cos((y0+y1)/2*Math.PI/180),gw=(x1-x0)*kx,gh=y1-y0;
    const wide=st.w/st.dpr>=860;      // wide: copy left, grid right · narrow: stacked
    const sc=wide?Math.min(st.w*.52/gw,st.h*.86/gh):Math.min(st.w*.86/gw,st.h*.56/gh);
    const ox=wide?st.w*.40+(st.w*.56-gw*sc)/2:(st.w-gw*sc)/2;
    const cy=wide?st.h*.5:st.h*.68;
    const px=(x,y)=>[ox+(x-x0)*kx*sc,cy+gh*sc/2-(y-y0)*sc];
    st.paths=st.geo.map(l=>{
      const p=new Path2D();const poly=[];let len=0,prev=null;
      for(const q of l.pts){const c=px(q[0],q[1]);
        if(prev){len+=Math.hypot(c[0]-prev[0],c[1]-prev[1]);p.lineTo(c[0],c[1])}
        else p.moveTo(c[0],c[1]);
        poly.push([c[0],c[1],len]);prev=c}
      return{p,poly,len,hv:l.hv,d0:l.d0};
    });
    st.bpts=st.busgeo.map(q=>[...px(q[0],q[1]),q[2]]);
  }
  function drawBase(p){
    const c=st.bctx,dpr=st.dpr;
    c.clearRect(0,0,st.w,st.h);c.lineCap='round';c.lineJoin='round';
    for(const q of st.paths){
      const lp=p>=1?1:Math.max(0,Math.min(1,(p-q.d0)/.45));
      if(lp<=0)continue;
      if(lp<1){c.setLineDash([q.len,q.len]);c.lineDashOffset=q.len*(1-lp)}
      else c.setLineDash([]);
      if(q.hv){c.strokeStyle='rgba(255,190,110,'+(.11*lp).toFixed(3)+')';
        c.lineWidth=3.4*dpr;c.stroke(q.p);
        c.strokeStyle='rgba(255,214,158,'+(.55*lp).toFixed(3)+')';
        c.lineWidth=.85*dpr;c.stroke(q.p);}
      else{c.strokeStyle='rgba(120,165,255,'+(.07*lp).toFixed(3)+')';
        c.lineWidth=2.6*dpr;c.stroke(q.p);
        c.strokeStyle='rgba(158,192,255,'+(.5*lp).toFixed(3)+')';
        c.lineWidth=.75*dpr;c.stroke(q.p);}
    }
    c.setLineDash([]);
    const ba=Math.max(0,(p-.62)/.38);
    if(ba>0)for(const q of st.bpts){
      c.fillStyle=q[2]?'rgba(255,224,178,'+(.8*ba).toFixed(3)+')':'rgba(196,214,255,'+(.5*ba).toFixed(3)+')';
      c.beginPath();c.arc(q[0],q[1],(q[2]?1.3:.8)*dpr,0,6.2832);c.fill();}
  }
  function blit(){st.vctx.clearRect(0,0,st.w,st.h);st.vctx.drawImage(st.buf,0,0)}
  function initPackets(){
    const cand=st.paths.filter(q=>q.len>70*st.dpr);
    if(!cand.length)return;
    st.pk=Array.from({length:44},()=>({
      q:cand[(Math.random()*cand.length)|0],
      t:Math.random(),spd:(9+Math.random()*14)*st.dpr,dir:Math.random()<.5?-1:1}));
  }
  function amb(now){
    st.raf=requestAnimationFrame(amb);
    const dt=Math.min((now-(st.last||now))/1000,.06);st.last=now;
    if(!st.vis||!st.pk)return;
    blit();
    const c=st.vctx;c.globalCompositeOperation='lighter';
    for(const k of st.pk){
      k.t+=k.dir*k.spd*dt/k.q.len;
      if(k.t>1||k.t<0){const cand=st.paths.filter(q=>q.len>70*st.dpr);
        k.q=cand[(Math.random()*cand.length)|0];k.t=Math.random();k.dir=Math.random()<.5?-1:1;
        k.t=Math.max(0,Math.min(1,k.t));continue}
      const d=k.t*k.q.len,poly=k.q.poly;
      let i=1;while(i<poly.length-1&&poly[i][2]<d)i++;
      const a=poly[i-1],b=poly[i],f=(d-a[2])/((b[2]-a[2])||1);
      const x=a[0]+(b[0]-a[0])*f,y=a[1]+(b[1]-a[1])*f,r=4.2*st.dpr;
      const g=c.createRadialGradient(x,y,0,x,y,r);
      const col=k.q.hv?'255,205,140':'160,195,255';
      g.addColorStop(0,'rgba('+col+',.5)');g.addColorStop(1,'rgba('+col+',0)');
      c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,6.2832);c.fill();
    }
    c.globalCompositeOperation='source-over';
  }
  const NF=n=>n==null?'…':n.toLocaleString(lang==='de'?'de-DE':'en-US');
  return h`<section class=${'night'+(lit?' lit':'')} ref=${secRef} aria-label=${T.night.h}>
    <canvas ref=${cvsRef}></canvas>
    <div class="haze"></div>
    <div class="ncopy">
      <div class="neye">${T.night.eye}</div>
      <h2>${T.night.h}</h2>
      <p class="nsub">${T.night.sub}</p>
      <div class="nrow">
        ${[[meta&&meta.corr,T.night.corr,''],[meta&&meta.km,T.night.km,'≈ '],
           [meta&&meta.buses,T.night.bus,'']].map(([v,k,pre],i)=>h`
          <div class="ns" style=${{'--d':(.25+i*.2)+'s'}} key=${k}>
            <span class="v"><${NCount} to=${v} run=${lit} lang=${lang} prefix=${pre}/></span>
            <span class="k">${k}</span></div>`)}
      </div>
      <div class="nlive"><span class="pulse"></span>${T.night.live}</div>
    </div>
  </section>`;
}

/* ── Overview ── */
let heroPlayed=false; // fly-in runs once per session, not on every tab return
function Home({summary,go,T,lang}){
  const s=summary||{};
  const [shown,setShown]=useState(heroPlayed);
  const [numsIn,setNumsIn]=useState(false);   // triggers the count-up in the numbers grid
  const scrollRef=useRef(null);
  useEffect(()=>{
    if(heroPlayed)return;
    const id=requestAnimationFrame(()=>requestAnimationFrame(()=>{setShown(true);heroPlayed=true}));
    return ()=>cancelAnimationFrame(id);
  },[]);
  useEffect(()=>{   // reveal stats / cards / footer as they scroll into view
    const root=scrollRef.current;if(!root)return;
    const io=new IntersectionObserver(es=>es.forEach(e=>{
      if(e.isIntersecting){e.target.classList.add('in');
        if(e.target.classList.contains('numbers'))setNumsIn(true);
        io.unobserve(e.target)}}),{threshold:.12});
    root.querySelectorAll('.rv').forEach(n=>io.observe(n));
    return()=>io.disconnect();
  },[]);
  const toContent=useCallback(()=>{
    scrollRef.current?.scrollTo({top:scrollRef.current.clientHeight,behavior:'smooth'});
  },[]);
  const singles=[[7723,T.stats[0]],[8238,T.stats[1]],[395,T.stats[2]],[618,T.stats[3]]];
  const kf1=v=>v>=1000?Math.round(v/1000)+'k':v;
  const pairs=[[s.mean_overloads_per_hour_pre,s.mean_overloads_per_hour_post,T.stats[4],v=>v],
               [s.line_hours_pre_yr,s.line_hours_post_yr,T.stats[5],kf1]];
  const cards=['grid','scen','analysis','ai'].map(id=>[id,T.cards[id][0],T.cards[id][1]]);
  return h`<div class="view scrollview home" ref=${scrollRef}>
    <section class=${'hero'+(shown?' show':'')}>
      <div class="heroin">
        <h1><span>${T.hero[0]}</span><span>${T.hero[1]}</span></h1>
        <p><span class="lead">${T.lead}</span>
        <span>${T.sub}</span></p>
      </div>
      <button class="scrollbtn" onClick=${toContent}><span><span class="sbin">${T.scroll}</span></span></button>
    </section>
    <div class="below">
      <${Story} T=${T}/>
      <${Night} T=${T} lang=${lang}/>
      <div class="hsec"><div class="homeeye rv">${T.numeye}</div>
      <div class="numbers rv">
        ${singles.map(([v,k])=>h`<div class="numcell" key=${k}>
          <div class="v"><${NCount} to=${v} run=${numsIn} lang=${lang}/></div>
          <div class="k">${k}</div></div>`)}
        ${pairs.map(([a,b,k,fmt])=>h`<div class="numcell" key=${k}>
          <div class="v">${a==null?'···':h`${fmt(a)} <span class="arr2">→</span><span class="aft">${fmt(b)}</span>`}</div>
          <div class="k">${k}</div>
          ${a>0&&h`<div class="bar"><span style=${{'--f':Math.max(b/a,.02)}}></span></div>`}
        </div>`)}
      </div></div>
      <div class="hsec" style=${{marginTop:104}}><div class="homeeye rv">${T.expeye}</div>
      <div class="bento">
        ${cards.map(([id,t,p],i)=>h`
          <button class="bcard rv" style=${{'--d':(i*.08)+'s'}} key=${id} onClick=${()=>go(id)}>
            <span class="idx">0${i+1}</span><h3>${t}</h3><p>${p}</p>
            <span class="arr" aria-hidden="true">→</span></button>`)}
      </div></div>
      <div class="colophon rv">${T.foot.split(' · ').map(x=>h`<span key=${x}>${x}</span>`)}</div>
    </div>
  </div>`;
}

export {F_CURT,F_LOAD,F_SPIN,F_WIND,Home,Night,STORY_BOUNDS,STORY_STEPS,Story,heroPlayed,kf};
