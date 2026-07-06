import {h,memo,useCallback,useEffect,useMemo,useRef,useState} from './core.js';
import {tr} from './i18n.js';
import {MW,cn,tc} from './format.js';
import {useMap} from './mapcore.js';
import {bn,j} from './api.js';
import {Bars} from './ui.js';

/* ── Official Data (Redispatch 2.0 publications) ── */
const CAUSEC={congestion:'#ff3b30',voltage:'#af52de',countertrade:'#0a84ff',
 test_run:'#8e8e93',upstream_request:'#ff9500',other:'#c7c7cc',unknown:'#c7c7cc'};
const CAUSEN={congestion:'Grid congestion',voltage:'Voltage support',countertrade:'Countertrade',
 test_run:'Reserve test runs',upstream_request:'Upstream request',other:'Other',unknown:'Unknown'};
const LEVELC={TSO:'#0066cc',DSO:'#ff9500'};
const GWH=x=>x>=1000?(x/1000).toFixed(2)+' TWh':(x>=10?Math.round(x):x.toFixed(1)).toLocaleString('en-US')+' GWh';

/* year-long stacked area with a drag brush; the window drives map + rail */
const _MONB=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const BrushTimeline=memo(({tl,sel,setSel})=>{
  const W=1000,H=64;
  const geom=useMemo(()=>{
    if(!tl||!tl.t||!tl.t.length)return null;
    const keys=Object.keys(tl.series),N=tl.t.length;
    const tot=Array(N).fill(0);
    keys.forEach(k=>tl.series[k].forEach((v,i)=>tot[i]+=v));
    const mx=Math.max(...tot,1);
    let base=Array(N).fill(0);
    const paths=keys.map(k=>{
      const top=base.map((b,i)=>b+tl.series[k][i]);
      const xy=i=>`${(i/(N-1)*W).toFixed(1)},${(H-2-(top[i]/mx)*(H-6)).toFixed(1)}`;
      const yx=i=>`${(i/(N-1)*W).toFixed(1)},${(H-2-(base[i]/mx)*(H-6)).toFixed(1)}`;
      let d='M'+xy(0);for(let i=1;i<N;i++)d+='L'+xy(i);
      for(let i=N-1;i>=0;i--)d+='L'+yx(i);
      base=top;
      return {k,d:d+'Z'};
    });
    return {paths,mx};
  },[tl]);
  const drag=useRef(null);
  const frac=e=>{const r=e.currentTarget.getBoundingClientRect();
    return Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))};
  const N=tl&&tl.t?tl.t.length:0;
  const months=useMemo(()=>{if(!tl||!tl.t)return[];const o=[];let last=-1;
    tl.t.forEach((t,i)=>{const m=+t.slice(5,7);if(m!==last){o.push([i,i/(N-1),_MONB[m-1]]);last=m;}});return o;},[tl,N]);
  if(!geom)return h`<div class="btl"><span class="note">Loading official measures…</span></div>`;
  const lab=i=>(tl.t[i]||'').slice(0,10);
  const setMonth=si=>{const m=+tl.t[si].slice(5,7);let ei=si;
    for(let i=si;i<N;i++){if(+tl.t[i].slice(5,7)===m)ei=i;else break;}setSel([si,ei]);};
  const x0=sel[0]/(N-1)*W,x1=sel[1]/(N-1)*W;
  return h`<div class="btl">
    <div class="btl-top">
      <span class="btl-range">${lab(sel[0])} → ${lab(sel[1])}</span>
      <span class="note">drag to select · 2× click = full year</span>
    </div>
    <div class="btl-months">${months.map(([i,f,nm])=>h`<button key=${nm} class="tl-mo" onClick=${()=>setMonth(i)}>${nm}</button>`)}</div>
    <svg class="btl-svg" viewBox="0 0 1000 64" preserveAspectRatio="none"
      onMouseDown=${e=>{const f=frac(e);drag.current=f;const i=Math.round(f*(N-1));setSel([i,i])}}
      onMouseMove=${e=>{if(drag.current==null)return;const f=frac(e);
        const a=Math.round(Math.min(drag.current,f)*(N-1)),b=Math.round(Math.max(drag.current,f)*(N-1));
        setSel([a,Math.max(b,a)]);}}
      onMouseUp=${()=>{drag.current=null}}
      onMouseLeave=${()=>{drag.current=null}}
      onDblClick=${()=>setSel([0,N-1])}>
      ${months.map(([i,f])=>h`<line key=${'g'+i} x1=${(f*W).toFixed(1)} x2=${(f*W).toFixed(1)} y1="0" y2="64" stroke="rgba(0,0,0,.06)" stroke-width="1"/>`)}
      ${geom.paths.map(p=>h`<path key=${p.k} d=${p.d} fill=${tc(p.k)} fill-opacity=".8" stroke="none"/>`)}
      <rect x=${Math.min(x0,x1)} y="0" width=${Math.max(Math.abs(x1-x0),1.5)} height="64"
        fill="rgba(10,132,255,.10)" stroke="rgba(10,132,255,.5)" stroke-width="1"/>
      <rect x=${x0-2} y="0" width="4" height="64" fill="#0a84ff" rx="2"/>
      <rect x=${x1-2} y="0" width="4" height="64" fill="#0a84ff" rx="2"/>
    </svg>
  </div>`;
});

/* official vs model dual-line (daily MW down) */
const CompareChart=memo(({cmp})=>{
  if(!cmp||!cmp.t||!cmp.t.length)return h`<p class="note">${tr("Loading comparison…")}</p>`;
  const W=560,H=90,N=cmp.t.length;
  const mx=Math.max(...cmp.official.down,...cmp.model.down,1);
  const line=v=>'M'+v.map((y,i)=>`${(i/(N-1)*W).toFixed(1)},${(H-3-(y/mx)*(H-10)).toFixed(1)}`).join('L');
  return h`<svg viewBox="0 0 560 90" preserveAspectRatio="none" style=${{width:'100%',height:90,display:'block'}}>
    <path d=${line(cmp.official.down)} fill="none" stroke="currentColor" stroke-width="1.4"/>
    <path d=${line(cmp.model.down)} fill="none" stroke="#0066cc" stroke-width="1.4"/>
  </svg>`;
});

function Official({active,nav}){
  const [ref,mapRef]=useMap(active);
  const [tl,setTl]=useState(null);
  const [booted,setBooted]=useState(false);
  const [summ,setSumm]=useState(null);
  const [sel,setSel]=useState(null);           // [i0,i1] day indices
  const [colorBy,setColorBy]=useState('tech'); // tech | level | cause
  const [dir,setDir]=useState('down');         // down = curtailment, up = ramp-up
  const [lvl,setLvl]=useState('');             // '' | TSO | DSO
  const [cau,setCau]=useState('');             // '' | congestion | ...
  const [techSel,setTechSel]=useState(null);   // null = all, else Set
  const [bd,setBd]=useState(null);
  const [nodes,setNodes]=useState(null);
  const [cmp,setCmp]=useState(null);
  const [pc,setPc]=useState(null);             // plants: official vs model
  const [pcDir,setPcDir]=useState('up');       // scatter direction: up | down
  const [showModel,setShowModel]=useState(false); // overlay model plants on the map
  const [meas,setMeas]=useState(null);
  const layRef=useRef(null);
  const pcLayRef=useRef(null);
  const fq=useMemo(()=>{                       // shared filter query-string tail
    let s='';
    if(lvl)s+='&level='+lvl;
    if(cau)s+='&cause='+cau;
    if(techSel&&techSel.size)s+='&technology='+[...techSel].join(',');
    return s;
  },[lvl,cau,techSel]);
  useEffect(()=>{if(active&&!booted){setBooted(true);
    j('/api/official/summary').then(d=>setSumm(d&&d.sources?d:null)).catch(()=>{});
    j('/api/official/compare?freq=day').then(d=>setCmp(d&&d.t?d:null)).catch(()=>{});
    j('/api/official/plants_compare?top=60').then(d=>setPc(d&&d.plants?d:null)).catch(()=>{});
  }},[active,booted]);
  useEffect(()=>{if(!active&&!booted)return;   // timeline follows direction/level/cause
    j(`/api/official/timeline?freq=day&direction=${dir}${lvl?'&level='+lvl:''}${cau?'&cause='+cau:''}`)
      .then(d=>{
        const ok=d&&Array.isArray(d.t);const nd=ok?d:{t:[],series:{}};
        setTl(prev=>{ setSel(s=>(s&&prev&&prev.t.length===nd.t.length)?s:(nd.t.length?[0,nd.t.length-1]:null)); return nd;});
      }).catch(()=>setTl({t:[],series:{}}));
  },[active,booted,dir,lvl,cau]);
  const tlShown=useMemo(()=>{                  // technology filter applied client-side
    if(!tl||!techSel||!techSel.size)return tl;
    return {...tl,series:Object.fromEntries(Object.entries(tl.series).filter(([k])=>techSel.has(k)))};
  },[tl,techSel]);
  const allTechs=useMemo(()=>tl?Object.keys(tl.series):[],[tl]);
  const win=useMemo(()=>{
    if(!tl||!sel)return null;
    const d0=(tl.t[sel[0]]||'').slice(0,10),d1=(tl.t[sel[1]]||'').slice(0,10);
    const end=new Date(d1);end.setDate(end.getDate()+1);
    return [d0,end.toISOString().slice(0,10)];
  },[tl,sel]);
  useEffect(()=>{                              // window+filter-driven fetches, debounced
    if(!win)return;
    const id=setTimeout(()=>{
      j(`/api/official/map?start=${win[0]}&end=${win[1]}&direction=${dir}${fq}`)
        .then(d=>setNodes(d&&d.nodes?d:{nodes:[]})).catch(()=>{});
      j(`/api/official/breakdown?start=${win[0]}&end=${win[1]}${fq}`)
        .then(d=>setBd(d&&d.kpi?d:null)).catch(()=>{});
    },250);
    return()=>clearTimeout(id);
  },[win,dir,fq]);
  useEffect(()=>{                              // map bubbles
    if(!mapRef.current||!nodes)return;
    if(!layRef.current)layRef.current=L.layerGroup().addTo(mapRef.current);
    const lay=layRef.current;lay.clearLayers();
    const col=n=>colorBy==='level'?(LEVELC[n.level]||'#c7c7cc')
      :colorBy==='cause'?(CAUSEC[n.cause]||'#c7c7cc'):tc(n.tech);
    for(const n of nodes.nodes){
      const e=dir==='up'?n.up:n.down;if(e<=0&&n.n<5)continue;
      lay.addLayer(L.circleMarker([n.lat,n.lon],{
        radius:Math.min(2+Math.sqrt(Math.max(e,1))/28,17),color:'rgba(0,0,0,.25)',weight:.6,
        fillColor:col(n),fillOpacity:.78})
       .bindTooltip(()=>`<b>${n.plant||bn(n.bus)}</b><br>${GWH(n.down/1e3)} curtailed · ${GWH(n.up/1e3)} ramped up<br>${n.n} measures · ${n.level} · ${CAUSEN[n.cause]||n.cause}`,{sticky:true})
       .on('click',()=>j(`/api/official/measures?bus=${n.bus}&start=${win[0]}&end=${win[1]}&direction=${dir}${fq}&limit=40`)
         .then(d=>setMeas(Array.isArray(d)?d:null)).catch(()=>{})));
    }
  },[nodes,colorBy,dir,mapRef.current]);
  useEffect(()=>{                              // model-plant overlay (diamonds + tie-lines)
    if(!mapRef.current)return;
    if(!pcLayRef.current)pcLayRef.current=L.layerGroup().addTo(mapRef.current);
    const lay=pcLayRef.current;lay.clearLayers();
    if(!showModel||!pc)return;
    for(const p of pc.plants){
      if(p.mlat==null)continue;
      const e=dir==='up'?p.mod_up:p.mod_down;
      // tie-line to the official location when the model attributes it elsewhere
      if(p.nearest_km!=null&&p.nearest_km>5)
        lay.addLayer(L.polyline([[p.lat,p.lon],[p.mlat,p.mlon]],{color:'#0a84ff',weight:1,dashArray:'2 3',opacity:.7}));
      lay.addLayer(L.circleMarker([p.mlat,p.mlon],{
        radius:Math.min(4+Math.sqrt(Math.max(e,1))*1.1,16),
        color:'#0a84ff',weight:2,fillColor:tc(p.tech),fillOpacity:.35})
       .bindTooltip(`<b>${p.name}</b> — <b>model</b> (◯)<br>${GWH(p.mod_down/1e3)} curtailed · ${GWH(p.mod_up/1e3)} ramped up<br>${p.model_cap_MW} MW · ${p.nearest_km} km from official plant`,{sticky:true}));
    }
  },[showModel,pc,dir,mapRef.current]);
  const kpi=useMemo(()=>{
    if(!bd)return null;
    const g=(dir,lv)=>bd.kpi.filter(r=>r.direction===dir&&(!lv||r.level===lv))
      .reduce((a,r)=>a+(r.mwh||0),0)/1e3;
    const n=(lv)=>bd.kpi.filter(r=>r.level===lv).reduce((a,r)=>a+(r.n||0),0);
    return {down:g('down'),up:g('up'),tsoDown:g('down','TSO'),nTso:n('TSO'),nDso:n('DSO')};
  },[bd]);
  const techDir=useMemo(()=>{
    if(!bd)return{};
    const o={};bd.technology.filter(r=>r.direction===dir&&r.mwh>0)
      .forEach(r=>o[r.k]=(o[r.k]||0)+r.mwh);
    return Object.fromEntries(Object.entries(o).sort((a,b)=>b[1]-a[1]));
  },[bd,dir]);
  const causes=bd?bd.cause.filter(r=>r.mwh>0).sort((a,b)=>b.mwh-a.mwh):[];
  const causeTot=causes.reduce((a,r)=>a+r.mwh,0);
  const toggleTech=useCallback(t=>setTechSel(s=>{
    const n=new Set(s||[]);n.has(t)?n.delete(t):n.add(t);return n.size?n:null;
  }),[]);
  return h`<div class="view" style=${{display:active?'block':'none'}}><div class="maplay">
    <div class="mapcol">
      <${BrushTimeline} tl=${tlShown} sel=${sel||[0,0]} setSel=${setSel}/>
      <div class="map" ref=${ref}></div>
    </div>
    <aside class="rail">${nav}<header><h2>${tr("Official Data")}</h2>
      <p>${tr("Every published Redispatch 2.0 measure of 2025 — the four TSOs (netztransparenz) plus machine-readable DSO publications — mapped to plants, technologies and causes.")}</p></header>
      <div class="scroller">
        ${kpi&&h`<div class="kpis">
          <div class="kpi" style=${dir==='down'?{outline:'1.5px solid #0066cc',borderRadius:8}:{}}>
            <div class="v">${GWH(kpi.down)}</div><div class="k">${tr("curtailed ↓ (down)")}</div></div>
          <div class="kpi" style=${dir==='up'?{outline:'1.5px solid #0066cc',borderRadius:8}:{}}>
            <div class="v">${GWH(kpi.up)}</div><div class="k">${tr("ramped up ↑")}</div></div>
          <div class="kpi"><div class="v">${kpi.nTso.toLocaleString('en-US')}</div><div class="k">${tr("TSO measures")}</div></div>
          <div class="kpi"><div class="v">${kpi.nDso.toLocaleString('en-US')}</div><div class="k">${tr("DSO control calls")}</div></div>
        </div>`}
        <div class="sect">${tr("Direction")}</div>
        <div class="chips">${[['down','Curtailment ↓'],['up','Ramp-up ↑']].map(([id,l])=>h`
          <span class=${'chip'+(dir===id?' on':'')} key=${id} onClick=${()=>setDir(id)}>${l}</span>`)}</div>
        <div class="sect">${tr("Network level · who instructed")}</div>
        <div class="chips">${[['','All'],['TSO','TSO only'],['DSO','DSO only']].map(([id,l])=>h`
          <span class=${'chip'+(lvl===id?' on':'')} key=${id||'all'} onClick=${()=>setLvl(id)}>${l}</span>`)}</div>
        <div class="sect">${tr("Cause")}</div>
        <div class="chips">${[['','All'],['congestion','Congestion'],['voltage','Voltage'],
          ['countertrade','Countertrade'],['test_run','Test runs']].map(([id,l])=>h`
          <span class=${'chip'+(cau===id?' on':'')} key=${id||'all'} onClick=${()=>setCau(id)}>${l}</span>`)}</div>
        <div class="sect">${tr("Technologies")}</div>
        <div class="chips">
          <span class=${'chip'+(!techSel?' on':'')} onClick=${()=>setTechSel(null)}>All</span>
          ${allTechs.map(t=>h`<span class=${'chip'+(techSel&&techSel.has(t)?' on':'')} key=${t}
            onClick=${()=>toggleTech(t)}><span class="sw" style=${{background:tc(t)}}></span>${cn(t)}</span>`)}
        </div>
        <div class="sect">${tr("Colour nodes by")}</div>
        <div class="chips">${[['tech','Technology'],['level','TSO / DSO'],['cause','Cause']].map(([id,l])=>h`
          <span class=${'chip'+(colorBy===id?' on':'')} key=${id} onClick=${()=>setColorBy(id)}>${l}</span>`)}</div>
        <div class="sect">${dir==='down'?'Curtailment':'Ramp-up'} by technology</div>
        <${Bars} obj=${techDir}/>
        <div class="sect">${tr("By cause")}</div>
        ${causes.length?h`<div>
          <div style=${{display:'flex',height:10,borderRadius:5,overflow:'hidden',margin:'4px 0 8px'}}>
            ${causes.map(r=>h`<span key=${r.k} title=${CAUSEN[r.k]||r.k}
              style=${{width:(100*r.mwh/causeTot)+'%',background:CAUSEC[r.k]||'#c7c7cc'}}></span>`)}
          </div>
          ${causes.map(r=>h`<div class="hbar" key=${r.k}>
            <span class="n"><span style=${{display:'inline-block',width:8,height:8,borderRadius:'50%',background:CAUSEC[r.k]||'#c7c7cc',marginRight:6}}></span>${CAUSEN[r.k]||r.k}</span>
            <span class="val">${GWH(r.mwh/1e3)}</span></div>`)}
        </div>`:h`<p class="note">${tr("No data in this window.")}</p>`}
        <div class="sect">${tr("Operators")}</div>
        ${bd&&h`<table><thead><tr><th>${tr("operator")}</th><th>${tr("level")}</th><th>${tr("energy")}</th><th>n</th></tr></thead><tbody>
          ${bd.operators.map(r=>h`<tr key=${r.k}>
            <td>${r.k}</td><td style=${{color:LEVELC[r.level]}}>${r.level}</td>
            <td>${r.mwh!=null?GWH(r.mwh/1e3):'–'}</td><td>${r.n.toLocaleString('en-US')}</td></tr>`)}
        </tbody></table>`}
        <div class="sect">${tr("Model vs reality — national curtailment, daily mean MW")}</div>
        <${CompareChart} cmp=${cmp}/>
        ${cmp&&h`<div class="note" style=${{marginTop:4}}>
          <span style=${{color:'var(--ink)',fontWeight:600}}>━ official</span> ·
          <span style=${{color:'#0066cc',fontWeight:600}}> ━ model</span> ·
          model/official ratio ${cmp.stats.ratio_down??'–'} ·
          correlation r ${cmp.stats.corr_down??'–'} ·
          ${cmp.stats.twh_model_down} vs ${cmp.stats.twh_official_down} TWh
        </div>`}
        <div class="sect">${tr("Plants — did the model redispatch the same ones?")}</div>
        ${pc?(()=>{
          const isUp=pcDir==='up';
          const ox=p=>isUp?p.off_up:p.off_down, my=p=>isUp?p.mod_up:p.mod_down;
          const pts=pc.plants.filter(p=>ox(p)>5||my(p)>5);
          const mx=Math.max(10,...pts.map(p=>Math.max(ox(p),my(p))));
          const sc=v=>Math.sqrt(Math.max(v,0)/mx);                   // sqrt scale 0..1
          const W=300,Hc=200,pad=26;
          const X=v=>pad+sc(v)*(W-pad-6), Y=v=>Hc-pad-sc(v)*(Hc-pad-10);
          const ag=isUp?pc.agree_up:pc.agree_down;
          return h`<div>
          <div class="note" style=${{marginBottom:6}}>Each dot = one real plant. x = how much the
            <b>TSOs</b> ${isUp?'ramped it up':'curtailed it'} in 2025, y = how much <b>our model</b> did the same at that location.
            On the diagonal = the model redispatched the same plant the same way.</div>
          <div class="chips" style=${{marginBottom:6}}>
            ${[['up','Ramp-up ↑'],['down','Curtailment ↓']].map(([id,l])=>h`
              <span class=${'chip'+(pcDir===id?' on':'')} key=${id} onClick=${()=>setPcDir(id)}>${l}</span>`)}
            <span class=${'chip'+(showModel?' on':'')} onClick=${()=>setShowModel(v=>!v)}
              title="Overlay the model's plants (◆) on the map beside the official bubbles">◆ on map</span>
            <span class="note" style=${{marginLeft:6}}>same direction: <b>${ag[0]}/${ag[1]}</b> plants</span>
          </div>
          <svg viewBox=${`0 0 ${W} ${Hc}`} style=${{width:'100%',height:'auto',background:'var(--card)',border:'0.5px solid var(--hair2)',borderRadius:8}}>
            <line x1=${X(0)} y1=${Y(0)} x2=${X(mx)} y2=${Y(mx)} stroke="#d2d2d7" stroke-dasharray="3 3"/>
            <line x1=${pad} y1=${Hc-pad} x2=${W-4} y2=${Hc-pad} stroke="#c7c7cc"/>
            <line x1=${pad} y1=${Hc-pad} x2=${pad} y2=${8} stroke="#c7c7cc"/>
            <text x=${W-4} y=${Hc-pad+14} font-size="8" fill="#86868b" text-anchor="end">official ${Math.round(mx)} GWh →</text>
            <text x=${pad-3} y=${12} font-size="8" fill="#86868b" text-anchor="end" transform=${`rotate(-90 ${pad-3} 12)`}>model GWh</text>
            ${pts.map(p=>h`<circle key=${p.name} cx=${X(ox(p))} cy=${Y(my(p))} r=${3.2}
               fill=${tc(p.tech)} fill-opacity="0.78" stroke="#fff" stroke-width="0.5"
               style=${{cursor:'pointer'}} onClick=${()=>mapRef.current&&mapRef.current.flyTo([p.lat,p.lon],10)}>
               <title>${p.name} · ${cn(p.tech)}\nofficial ${isUp?p.off_up:p.off_down} GWh · model ${isUp?p.mod_up:p.mod_down} GWh</title></circle>`)}
          </svg>
          <table style=${{marginTop:6}}><thead><tr><th>${tr("plant")}</th><th>${tr("tech")}</th><th>off ${isUp?'↑':'↓'}</th><th>model ${isUp?'↑':'↓'}</th></tr></thead><tbody>
            ${pc.plants.slice(0,24).map(p=>h`<tr key=${p.name}
              onClick=${()=>mapRef.current&&mapRef.current.flyTo([p.lat,p.lon],10)} style=${{cursor:'pointer'}}>
              <td><span style=${{display:'inline-block',width:7,height:7,borderRadius:'50%',
                background:p.in_model?'#34c759':'#ff3b30',marginRight:6}}></span>${p.name}</td>
              <td style=${{color:tc(p.tech)}}>${cn(p.tech)}</td>
              <td>${(isUp?p.off_up:p.off_down).toFixed(0)}</td>
              <td>${(isUp?p.mod_up:p.mod_down).toFixed(0)}</td></tr>`)}
          </tbody></table>
          <div class="note" style=${{marginTop:4}}>${pc.in_model}/${pc.n} top plants exist in the model
            (missing = foreign PHS or generic RE clusters).</div>
        </div>`;})():h`<p class="note">${tr("Loading plant comparison…")}</p>`}
        <div class="sect">${tr("How Redispatch 2.0 works")}</div>
        <div class="panel"><div class="note" style=${{lineHeight:1.55}}>
          Since 10/2021 <b>every</b> network operator manages congestion in its own grid:
          the four TSOs instruct measures for transmission bottlenecks, while DSOs identify
          and instruct their own measures in the 110 kV grids and below, coordinated via the
          Connect+ platform. <b>Down</b> = reduce active-power feed-in (curtailment, mostly wind
          and solar north of bottlenecks); <b>up</b> = increase feed-in elsewhere (mostly gas
          and coal south of them) so the national balance holds.
          <br/><br/>
          The TSO dataset here is therefore <b>not</b> all German curtailment: per BNetzA the
          2025 total was ≈ 30.3 TWh and ≈ 3.1 bn €, of which TSO-instructed ≈ 67 %
          (the ≈ 20.5 TWh shown here, complete) and DSO-instructed ≈ 33 % — scattered across
          ~860 operator websites, most not machine-readable (status below).
        </div></div>
        <div class="sect">${tr("Data sources")}</div>
        ${summ&&summ.sources.map(s=>h`<div class="panel" key=${s.source} style=${{marginBottom:6}}>
          <b style=${{fontSize:12}}>${s.label}</b>
          <span class="note" style=${{marginLeft:6}}>${s.status==='complete'?'complete':s.status==='partial'?'partial':'unavailable'}</span>
          <div class="note">${s.note}</div></div>`)}
        <div class="sect">${tr("Measures at node")}</div>
        ${meas?h`<table><thead><tr><th>${tr("start")}</th><th>${tr("dir")}</th><th>${tr("MW")}</th><th>${tr("MWh")}</th><th>${tr("cause")}</th></tr></thead><tbody>
          ${meas.map((m,i)=>h`<tr key=${i}><td>${(m.start||'').slice(0,16)}</td>
            <td>${m.dir}</td><td>${m.mw??'–'}</td><td>${m.mwh??'–'}</td><td>${CAUSEN[m.cause]||m.cause}</td></tr>`)}
        </tbody></table>`
        :h`<div class="panel"><span class="note">Click a node on the map to list its measures.</span></div>`}
      </div>
    </aside>
  </div></div>`;
}

export {BrushTimeline,CAUSEC,CAUSEN,CompareChart,GWH,LEVELC,Official,_MONB};
