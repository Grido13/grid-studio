import {createPortal,h,useCallback,useEffect,useRef,useState} from './core.js';
import {tr} from './i18n.js';
import {MW,P} from './format.js';
import {useMap} from './mapcore.js';
import {bn,j} from './api.js';
import {EURc,NUM} from './bess.js';
import {Grid,VCOL} from './gridtab.js';

/* ── CAPEX estimator: place a project, pick a connection, price it ──
   Flow: click the map (project site) → parameter modal (technology, size,
   Q-capability, voltage) → click a substation or line (single estimate) or
   "best 3 options" (backend ranks nearby buses + line taps by 25-yr NPV).
   All cost math lives in app/backend/services/capex.py. */
const CX_TECHS=[['solar','Solar PV'],['onwind','Onshore wind'],['bess','Battery storage'],
  ['electrolyser','Electrolyser'],['load','Large load / DC'],['hybrid','Hybrid RE + BESS']];
const CX_RANK=['#0a84ff','#5856d6','#86868b'];
const cxT=t=>(CX_TECHS.find(x=>x[0]===t)||[t,t])[1];
const cxPop=(o,i,mode)=>{
  const r=o.cable.recommended;
  const row=(k,v)=>`<div class="prow"><span>${k}</span><span>${v}</span></div>`;
  return `<div class="plantpop" style="min-width:235px"><b>${mode==='best3'?'Option '+(i+1)+' · ':''}${o.target.name}</b>`
    +`<div class="note" style="margin:1px 0 6px">${o.target.v_kv} kV POC · ${o.target.type==='bus'?'bay in existing substation':'Stichanschluss (T-tap, n-0)'} · ${o.concept==='mv'?'trafo at POC':'trafo at site'}</div>`
    +row('Route',`${o.route.route_km} km (${o.route.air_km} km × ${o.route.factor})`)
    +row('Cable',`${r.systems}× 3×1×${r.mm2} mm² ${r.mat} @ ${o.cable.v_kv} kV`)
    +row('Rating / load',`${Math.round(r.rating_mva)} MVA · ${r.load_pct} % loaded`)
    +row('Cable supply',EURc(r.supply_eur))
    +row('Installation',EURc(r.install_eur))
    +row('Earthworks',EURc(r.civil_eur))
    +row('Stations & bays',EURc(o.station.total))
    +(o.compensation.total_included?row('Compensation',EURc(o.compensation.total_included)):'')
    +row('Voltage drop',r.du_pct+' %')
    +row('Losses',`${r.loss_pct} % · ${EURc(r.loss_eur_yr)}/yr`)
    +`<div class="prow" style="font-weight:600"><span>Total CAPEX</span><span>${EURc(o.totals.capex)}</span></div>`
    +row('per MW',EURc(o.totals.eur_per_mw))
    +`<div class="note" style="margin-top:5px">Full breakdown in the panel on the right.</div></div>`;
};
/* 30-yr cumulative discounted cost per cross-section: intercept = CAPEX on day
   one, slope = discounted OPEX (losses + maintenance). Crossing curves = the
   point where the bigger conductor has paid for itself. */
const CxProg=({opts,econ})=>{
  const yrs=(econ&&econ.years)||30, r=(econ&&econ.discount)||0.06;
  const W=330,H=158,Lx=44,B=18,T=10,Rp=52;
  const cum=o=>{const a=[o.capex];for(let t=1;t<=yrs;t++)a.push(a[t-1]+o.opex_eur_yr/Math.pow(1+r,t));return a};
  const series=opts.map(o=>({o,c:cum(o)}));
  const ymax=Math.max(...series.map(s=>s.c[yrs]))*1.04;
  const px=t=>Lx+t/yrs*(W-Lx-Rp), py=v=>T+(1-v/ymax)*(H-T-B);
  // nudge overlapping end labels apart
  const ends=series.map(s=>({s,y:py(s.c[yrs])})).sort((a,b)=>a.y-b.y);
  for(let i=1;i<ends.length;i++)if(ends[i].y-ends[i-1].y<9)ends[i].y=ends[i-1].y+9;
  return h`<svg viewBox=${`0 0 ${W} ${H}`} width="100%" style=${{display:'block',marginTop:8}}>
    ${[0,.25,.5,.75,1].map(f=>h`<line key=${f} x1=${Lx} x2=${W-Rp} y1=${py(f*ymax)} y2=${py(f*ymax)}
      class="cgrid" stroke-width="0.6"/>`)}
    ${series.map((s,i)=>h`<path key=${i} d=${'M'+s.c.map((v,t)=>px(t).toFixed(1)+','+py(v).toFixed(1)).join('L')}
      fill="none" stroke=${s.o.recommended?'#0a84ff':'#c7c7cc'} stroke-width=${s.o.recommended?2:1.2}/>`)}
    ${ends.map(({s,y},i)=>h`<text key=${i} x=${W-Rp+4} y=${y+3} font-size="8"
      fill=${s.o.recommended?'#0a84ff':'#86868b'} font-weight=${s.o.recommended?'600':'400'}>${s.o.systems}× ${s.o.mm2}</text>`)}
    ${[0,10,20,30].map(t=>h`<text key=${t} x=${px(t)} y=${H-5} font-size="8" fill="#86868b" text-anchor="middle">${t} yr</text>`)}
    <text x=${Lx-5} y=${py(ymax)+6} font-size="8" fill="#86868b" text-anchor="end">${EURc(ymax)}</text>
    <text x=${Lx-5} y=${py(0)+2} font-size="8" fill="#86868b" text-anchor="end">0</text>
  </svg>`;
};
const CapexModal=({prm,setPrm,onDone,onClose})=>{
  useEffect(()=>{const k=e=>{if(e.key==='Escape')onClose();};addEventListener('keydown',k);return()=>removeEventListener('keydown',k);},[]);
  const s=(k,v)=>setPrm(p=>({...p,[k]:v}));
  return createPortal(h`
    <div class="ymodal" onClick=${onClose}>
      <div class="cxbox" onClick=${e=>e.stopPropagation()}>
        <div class="ymhead"><b>Project parameters</b>
          <span>technology · size · capabilities · voltage</span>
          <button class="ymx" onClick=${onClose}>×</button></div>
        <div class="bsect">Technology</div>
        <div class="chips">${CX_TECHS.map(([id,l])=>h`
          <span key=${id} class=${'chip'+(prm.tech===id?' on':'')} onClick=${()=>s('tech',id)}>${l}</span>`)}</div>
        <div class="bsect">Size</div>
        <div class="bgrid b3">
          <label>Power <span>MW</span>${NUM(prm.mw,v=>s('mw',v),5,1)}</label>
          ${(prm.tech==='bess'||prm.tech==='hybrid')&&h`<label>Energy <span>MWh</span>${NUM(prm.mwh,v=>s('mwh',v),10,0)}</label>`}
        </div>
        <div class="bsect">Technical capabilities</div>
        <div class="chips">${[[1,'cos φ 1.00'],[0.95,'cos φ 0.95'],[0.90,'cos φ 0.90']].map(([v,l])=>h`
          <span key=${v} class=${'chip'+(prm.pf===v?' on':'')} onClick=${()=>s('pf',v)}>${l}</span>`)}
          <span class=${'chip'+(prm.n1?' on':'')} onClick=${()=>s('n1',!prm.n1)}>N-1 redundancy</span></div>
        <p class="bhint">cos φ sets the apparent power the cable and bays must carry (S = P / cos φ)
          and the reactive share of the voltage drop. N-1 adds a spare cable system and splits the
          transformer into two units.</p>
        <div class="bsect">Connection concept</div>
        <div class="chips">
          <span class=${'chip'+(prm.concept==='mv'?' on':'')} onClick=${()=>s('concept','mv')}>33 kV export · trafo at POC</span>
          <span class=${'chip'+(prm.concept==='hv'?' on':'')} onClick=${()=>s('concept','hv')}>Trafo at site · HV cable</span>
        </div>
        <p class="bhint">33 kV: the park exports at collector voltage over the route and the step-up
          transformer stands at the point of connection (the usual layout). HV: transformer at the
          project, transmission-voltage cable to the grid. The other concept is always priced too,
          as a comparison.</p>
        <div class="bsect">Grid voltage at the POC</div>
        <div class="chips">${[110,220,380].map(v=>h`
          <span key=${v} class=${'chip'+(prm.voltage===v?' on':'')} onClick=${()=>s('voltage',v)}>
            <span class="sw" style=${{background:VCOL[v]}}></span>${v} kV</span>`)}</div>
        <p class="bhint">Drives the best-3 search and the transformer/bay sizing. If you click an
          element at a different voltage, that element's own level is priced.</p>
        <button class="brun" onClick=${onDone}>Save — now pick the connection ▸</button>
      </div>
    </div>`,document.body);
};
/* ── co-location: second technology behind the same transformer ──
   Backend sweeps 8,760 h of regional weather curves (app/backend/services/
   capex.py::colocation): for each added-MW step, the share of the second
   plant's energy the shared export limit would curtail. */
const COLO_TECHS=[['solar','Solar PV'],['onwind','Onshore wind']];
const COLO_COL={solar:'#b45309',onwind:'#248a3d'};
const ColoSweep=({curve,sizes})=>{
  const W=330,H=150,Lx=40,B=18,T=10,Rp=10;
  const xmax=curve[curve.length-1].mw2||1;
  const ymax=Math.max(12,...curve.map(p=>p.curt_pct))*1.05;
  const px=x=>Lx+x/xmax*(W-Lx-Rp), py=y=>T+(1-y/ymax)*(H-T-B);
  const d='M'+curve.map(p=>px(p.mw2).toFixed(1)+','+py(p.curt_pct).toFixed(1)).join('L');
  const marks=[['p1','≤1 %'],['p5','≤5 %'],['p10','≤10 %']].filter(([k])=>sizes[k]);
  let lastX=-99;                       // skip a size label that would collide
  return h`<svg viewBox=${`0 0 ${W} ${H}`} width="100%" style=${{display:'block',marginTop:8}}>
    ${[0,.25,.5,.75,1].map(f=>h`<line key=${f} x1=${Lx} x2=${W-Rp} y1=${py(f*ymax)} y2=${py(f*ymax)}
      class="cgrid" stroke-width="0.6"/>`)}
    <path d=${d} fill="none" stroke="#0a84ff" stroke-width="2"/>
    ${marks.map(([k,l])=>{const s=sizes[k],x=px(s.mw2),lab=x-lastX>=36;if(lab)lastX=x;
      return h`<g key=${k}>
      <line x1=${x} x2=${x} y1=${py(0)} y2=${py(s.curt_pct)} stroke="#c7c7cc" stroke-width="0.7" stroke-dasharray="3 3"/>
      <circle cx=${x} cy=${py(s.curt_pct)} r="3.2" fill="#fff" stroke="#0a84ff" stroke-width="1.6">
        <title>${l}: ${Math.round(s.mw2)} MW · +${s.added_gwh} GWh/yr</title></circle>
      ${lab&&h`<text x=${x} y=${py(s.curt_pct)-7} font-size="8" fill="currentColor" font-weight="600"
        text-anchor="middle">${Math.round(s.mw2)} MW</text>`}</g>`})}
    ${curve.map((p,i)=>h`<circle key=${i} cx=${px(p.mw2)} cy=${py(p.curt_pct)} r="7" fill="transparent">
      <title>${p.mw2} MW → ${p.curt_pct} % curtailed · +${p.added_gwh} GWh/yr · connection ${p.util_pct} % used</title></circle>`)}
    ${[0,.5,1].map(f=>h`<text key=${'x'+f} x=${px(f*xmax)} y=${H-5} font-size="8" fill="#86868b"
      text-anchor=${f===0?'start':f===1?'end':'middle'}>${Math.round(f*xmax)} MW</text>`)}
    ${[.5,1].map(f=>h`<text key=${'y'+f} x=${Lx-4} y=${py(f*ymax)+3} font-size="8" fill="#86868b"
      text-anchor="end">${(f*ymax).toFixed(0)} %</text>`)}
    <text x=${Lx-4} y=${py(0)+3} font-size="8" fill="#86868b" text-anchor="end">0</text>
  </svg>`;
};
const ColoMonthly=({monthly,pcol,scol,plabel,slabel})=>{
  const W=330,H=140,Lx=36,B=16,T=8,Rp=8;
  const tot=monthly.primary_gwh.map((v,i)=>v+monthly.secondary_gwh[i]);
  const ymax=Math.max(...monthly.limit_gwh,...tot)*1.08||1;
  const py=v=>T+(1-v/ymax)*(H-T-B);
  const bw=(W-Lx-Rp)/12, wid=bw*0.62;
  const ML=['J','F','M','A','M','J','J','A','S','O','N','D'];
  const MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return h`<svg viewBox=${`0 0 ${W} ${H}`} width="100%" style=${{display:'block',marginTop:8}}>
    ${[.5,1].map(f=>h`<line key=${f} x1=${Lx} x2=${W-Rp} y1=${py(f*ymax)} y2=${py(f*ymax)}
      class="cgrid" stroke-width="0.6"/>`)}
    ${monthly.primary_gwh.map((v,i)=>{const x=Lx+i*bw+(bw-wid)/2,s2=monthly.secondary_gwh[i];
      return h`<g key=${i}>
      ${v>0&&h`<rect x=${x} width=${wid} y=${py(v)} height=${Math.max(0,py(0)-py(v))} fill=${pcol} rx="1.5">
        <title>${MN[i]} · ${plabel}: ${v.toFixed(1)} GWh</title></rect>`}
      ${s2>0&&h`<rect x=${x} width=${wid} y=${py(v+s2)} height=${Math.max(0,py(v)-py(v+s2)-2)} fill=${scol} rx="1.5">
        <title>${MN[i]} · ${slabel}: ${s2.toFixed(1)} GWh (of ${monthly.limit_gwh[i].toFixed(0)} GWh max)</title></rect>`}
    </g>`})}
    <path d=${monthly.limit_gwh.map((v,i)=>`M${(Lx+i*bw).toFixed(1)},${py(v).toFixed(1)}L${(Lx+(i+1)*bw).toFixed(1)},${py(v).toFixed(1)}`).join('')}
      fill="none" stroke="#86868b" stroke-width="1" stroke-dasharray="4 3"/>
    ${ML.map((l,i)=>h`<text key=${i} x=${Lx+i*bw+bw/2} y=${H-4} font-size="8" fill="#86868b" text-anchor="middle">${l}</text>`)}
    ${[.5,1].map(f=>h`<text key=${'y'+f} x=${Lx-4} y=${py(f*ymax)+3} font-size="8" fill="#86868b"
      text-anchor="end">${(f*ymax).toFixed(0)}</text>`)}
    <text x=${Lx-4} y=${py(0)+3} font-size="8" fill="#86868b" text-anchor="end">0</text>
    <text x=${W-Rp} y=${py(Math.max(...monthly.limit_gwh))-4} font-size="8" fill="#86868b" text-anchor="end">trafo max · GWh</text>
  </svg>`;
};
function Capex({active,nav}){
  const [ref,mapRef]=useMap(active);
  const [topo,setTopo]=useState(null);
  const [phase,setPhase]=useState('place');   // place → params (modal) → target → result
  const [proj,setProj]=useState(null);        // {lat,lon}
  const [prm,setPrm]=useState({tech:'solar',mw:50,mwh:200,voltage:110,pf:0.95,n1:false,concept:'mv'});
  const [modal,setModal]=useState(false);
  const [res,setRes]=useState(null);          // {mode:'single'|'best3',options:[…]}
  const [sel,setSel]=useState(0);
  const [busy,setBusy]=useState(false);
  const [colo,setColo]=useState(null);        // co-location sweep result
  const [cp,setCp]=useState({mva:0,tech2:''}); // 0 / '' → derived from prm
  const [cbusy,setCbusy]=useState(false);
  const layRef=useRef({});
  const S=useRef({});                         // live state for leaflet handlers
  S.current={phase,proj,prm,modal};
  useEffect(()=>{if(active&&!topo)j('/api/sample/grid_topology').then(setTopo)},[active,topo]);
  useEffect(()=>{const m=mapRef.current;if(!m)return;
    m.getContainer().style.cursor=phase==='place'?'crosshair':'';},[phase,mapRef.current]);
  const pickTarget=useCallback((type,id,ll)=>{
    const st=S.current;
    if(!st.proj||st.modal||st.phase==='place'||st.phase==='params')return;
    setBusy(true);
    // ll = the leaflet click latlng: the tap goes where the user clicked, not
    // to the segment point nearest the project (which snaps to a line end)
    fetch('/api/capex/estimate',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...st.prm,lat:st.proj.lat,lon:st.proj.lon,target_type:type,target_id:String(id),
        ...(ll?{click_lat:ll.lat,click_lon:ll.lng}:{})})})
      .then(r=>r.ok?r.json():r.json().then(e=>Promise.reject(new Error(e.detail||r.status))))
      .then(d=>{setRes({mode:'single',options:[d]});setSel(0);setPhase('result')})
      .catch(e=>alert('Estimate failed: '+e.message))
      .finally(()=>setBusy(false));
  },[]);
  const runBest3=useCallback(()=>{
    const st=S.current;if(!st.proj)return;
    setBusy(true);
    fetch('/api/capex/best3',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...st.prm,lat:st.proj.lat,lon:st.proj.lon})})
      .then(r=>r.ok?r.json():r.json().then(e=>Promise.reject(new Error(e.detail||r.status))))
      .then(d=>{setRes({mode:'best3',options:d.options});setSel(0);setPhase('result')})
      .catch(e=>alert('Ranking failed: '+e.message))
      .finally(()=>setBusy(false));
  },[]);
  const cmva=cp.mva>0?cp.mva:Math.round(prm.mw/prm.pf);        // default: fits the primary
  const ct2=cp.tech2||(prm.tech==='onwind'?'solar':'onwind');  // default: the other curve
  const runColo=()=>{
    if(!proj||cbusy)return;
    setCbusy(true);
    fetch('/api/capex/colocation',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({lat:proj.lat,lon:proj.lon,tech:prm.tech,mw:prm.mw,pf:prm.pf,
        trafo_mva:cmva,tech2:ct2})})
      .then(r=>r.ok?r.json():r.json().then(e=>Promise.reject(new Error(e.detail||r.status))))
      .then(setColo)
      .catch(e=>alert('Co-location failed: '+e.message))
      .finally(()=>setCbusy(false));
  };
  // base grid: every line and bus, clickable as a connection target
  useEffect(()=>{
    const m=mapRef.current;if(!m||!topo)return;
    const R=layRef.current;
    for(const k of ['lines','buses','proj','routes'])if(!R[k])R[k]=L.layerGroup();
    R.lines.clearLayers();R.buses.clearLayers();
    for(const ln of topo.lines){
      R.lines.addLayer(L.polyline([[ln.y0,ln.x0],[ln.y1,ln.x1]],
        {color:VCOL[ln.v]||'#86868b',weight:ln.v>=380?1.8:ln.v>=220?1.4:0.9,opacity:.5,interactive:false}));
      // invisible fat twin: the visible strokes are <2 px and unclickable on canvas
      R.lines.addLayer(L.polyline([[ln.y0,ln.x0],[ln.y1,ln.x1]],{color:'#000',weight:13,opacity:0})
       .bindTooltip(()=>`<b>${bn(ln.bus0)} – ${bn(ln.bus1)}</b><br>Line ${ln.id} · ${ln.v} kV · ${MW(ln.s_nom)}<br>click to tap this line`,{sticky:true})
       .on('click',e=>pickTarget('line',ln.id,e.latlng)));
    }
    for(const b of topo.buses){
      // wide low-alpha stroke = comfortable click target on the canvas renderer
      R.buses.addLayer(L.circleMarker([b.lat,b.lon],{radius:2.6,color:'rgba(0,0,0,.07)',
        weight:6,fillColor:VCOL[b.v]||'#86868b',fillOpacity:.85})
       .bindTooltip(()=>`<b>${b.name||bn(b.bus)}</b><br>Bus ${b.bus} · ${b.v} kV<br>click to connect here`,{sticky:true})
       .on('click',()=>pickTarget('bus',b.bus)));
    }
    for(const k of ['lines','buses','routes','proj'])if(!m.hasLayer(R[k]))m.addLayer(R[k]);
    if(location.search.includes('capex-test'))window.__cxmap=m;
  },[topo,mapRef.current,pickTarget]);
  // clicking the map places the project (bus/line clicks bubble here too — that's fine while placing)
  useEffect(()=>{
    const m=mapRef.current;if(!m)return;
    const f=e=>{if(S.current.phase!=='place')return;
      setProj({lat:e.latlng.lat,lon:e.latlng.lng});setRes(null);setSel(0);
      setModal(true);setPhase('params');};
    m.on('click',f);return()=>m.off('click',f);
  },[mapRef.current]);
  // project marker + result routes
  useEffect(()=>{
    const m=mapRef.current,R=layRef.current;if(!m||!R.proj)return;
    R.proj.clearLayers();R.routes.clearLayers();
    if(proj)R.proj.addLayer(L.circleMarker([proj.lat,proj.lon],{radius:7,color:'#fff',
      weight:2,fillColor:'#1d1d1f',fillOpacity:1})
      .bindTooltip(()=>`Project · ${prm.mw} MW ${cxT(prm.tech)}`,{sticky:true}));
    if(res){
      res.options.forEach((o,i)=>{
        const col=res.mode==='best3'?CX_RANK[i]||'#86868b':'#0a84ff';
        const pl=L.polyline(o.route.path,{color:col,weight:i===sel?3.4:2.2,opacity:.95,dashArray:'7 6'})
          .bindPopup(cxPop(o,i,res.mode),{maxWidth:300});
        pl.on('click',()=>setSel(i));
        R.routes.addLayer(pl);
        if(o.target.type==='line')R.routes.addLayer(L.circleMarker([o.target.lat,o.target.lon],
          {radius:4.5,color:col,weight:2,fillColor:'#fff',fillOpacity:1})
          .bindTooltip('Tap point — Stichanschluss (n-0)',{sticky:true}));
        const [a,b]=o.route.path;
        const badge=L.marker([(a[0]+b[0])/2,(a[1]+b[1])/2],{icon:L.divIcon({className:'',
          html:`<div class="cxbadge">${res.mode==='best3'?i+1:'€'}</div>`,iconSize:[22,22],iconAnchor:[11,11]})})
          .bindPopup(cxPop(o,i,res.mode),{maxWidth:300});
        badge.on('click',()=>setSel(i));
        R.routes.addLayer(badge);
      });
      const pts=res.options.flatMap(o=>o.route.path);
      if(pts.length)m.fitBounds(pts,{padding:[70,70],maxZoom:11});
    }
  },[proj,res,sel,prm,mapRef.current]);
  const reset=()=>{setProj(null);setRes(null);setSel(0);setColo(null);setPhase('place')};
  const o=res&&res.options[sel];
  const rec=o&&o.cable.recommended;
  return h`<div class="view" style=${{display:active?'block':'none'}}><div class="maplay">
    <div class="map" ref=${ref}></div>
    <aside class="rail">${nav}<header><h2>${tr("CAPEX estimator")}</h2>
      <p>${tr("Price a grid connection: place the project, set its parameters, then click a substation or a line — or let it rank the best 3 options. Screening numbers (±30 %), not quotes.")}</p></header>
      <div class="scroller">
        <div class="sect">${tr("Project")}</div>
        ${!proj&&h`<div class="panel"><span class="note"><b>1 ·</b> Click the map at the project site.
          The grid is shown for orientation; you can click anywhere.</span></div>`}
        ${proj&&h`<div class="panel">
          <b style=${{fontFamily:'var(--disp)',fontSize:13}}>${prm.mw} MW ${cxT(prm.tech)}</b>
          <div class="note">${(prm.tech==='bess'||prm.tech==='hybrid')?prm.mwh+' MWh · ':''}
            cos φ ${prm.pf.toFixed(2)} · ${prm.voltage} kV target · ${prm.concept==='mv'?'33 kV export, trafo at POC':'trafo at site, HV cable'} ·
            ${prm.n1?'N-1 redundant':'single feed'} · ${proj.lat.toFixed(4)}, ${proj.lon.toFixed(4)}</div>
          <div class="chips" style=${{marginTop:8}}>
            <span class="chip" onClick=${()=>{setModal(true)}}>Edit parameters</span>
            <span class="chip" onClick=${()=>{setPhase('place');setRes(null);setColo(null)}}>Move project</span>
            <span class="chip" onClick=${reset}>Start over</span>
          </div></div>`}
        ${proj&&phase!=='params'&&h`<div class="sect">${tr("Connection")}</div>
          <div class="panel"><span class="note"><b>2 ·</b> Click a substation or a line on the map for a
            single estimate — a line click prices a Stichanschluss (T-tap, n-0).</span>
            <button class="brun" onClick=${runBest3} disabled=${busy}>
              ${busy?'Evaluating candidates…':'Show best 3 options ▸'}</button></div>`}
        ${busy&&h`<p class="note"><span class="spinner"></span>Costing the connection…</p>`}
        ${res&&res.mode==='best3'&&h`<div class="chips" style=${{marginTop:8}}>
          ${res.options.map((op,i)=>h`<span key=${i} class=${'chip'+(sel===i?' on':'')} onClick=${()=>setSel(i)}>
            <span class="sw" style=${{background:CX_RANK[i]}}></span>${i+1} · ${EURc(op.totals.capex)}</span>`)}</div>`}
        ${o&&h`<div>
          <div class="sect">${res.mode==='best3'?`Option ${sel+1} — ${o.target.name}`:o.target.name}</div>
          <div class="panel">
            <div class="note">${o.target.v_kv} kV POC · ${o.target.type==='bus'?'bay in the existing substation':'Stichanschluss — T-tap on the line, n-0'} ·
              <b>${o.cable.v_kv} kV</b> cable route <b>${o.route.route_km} km</b> (${o.route.air_km} km air × ${o.route.factor}) ·
              ${o.concept==='mv'?'trafo at the POC':'trafo at the project site'} · ${o.s_mva} MVA</div>
            <div class="kpis" style=${{marginTop:8}}>
              <div class="kpi"><div class="v">${EURc(o.totals.capex)}</div><div class="k">${tr("Total CAPEX")}</div></div>
              <div class="kpi"><div class="v">${EURc(o.totals.eur_per_mw)}</div><div class="k">${tr("CAPEX / MW")}</div></div>
              <div class="kpi"><div class="v">${EURc(o.opex.total_eur_yr)}</div><div class="k">${tr("OPEX / yr")}</div></div>
            </div>
            <div class="kpis" style=${{marginTop:6}}>
              <div class="kpi"><div class="v">${EURc(o.totals.npv30)}</div><div class="k">${tr("30-yr NPV")}</div></div>
              <div class="kpi"><div class="v">${EURc(o.totals.npv_per_mw)}</div><div class="k">${tr("NPV / MW")}</div></div>
              <div class="kpi"><div class="v">${rec.du_pct} %</div><div class="k">${tr("Voltage drop")}</div></div>
            </div></div>
          <div class="sect">${tr("Cable sizing ·")} ${o.cable.v_kv} kV — CAPEX vs OPEX</div>
          <div class="panel">
            <div class="note">Recommended: <b>${rec.systems}× 3×1×${rec.mm2} mm² ${rec.mat}</b>${' — '}
              ${Math.round(rec.rating_mva)} MVA rating for ${o.s_mva} MVA needed
              (<b>${rec.load_pct} %</b> loaded), losses <b>${rec.loss_pct} %</b> of the energy
              delivered. Cheapest 30-yr total of CAPEX + losses + maintenance.</div>
            <table class="cxtab"><thead><tr><th>${tr("cable")}</th><th>${tr("rating")}</th><th>${tr("load")}</th><th>${tr("losses")}</th><th>${tr("CAPEX")}</th><th>${tr("30-yr NPV")}</th></tr></thead>
            <tbody>${o.cable.options.map(c=>h`<tr key=${c.mm2} class=${c.recommended?'rec':''}>
              <td>${c.systems}× ${c.mm2} ${c.mat}</td><td>${Math.round(c.rating_mva)} MVA</td>
              <td>${c.load_pct}%</td><td>${c.loss_pct}%</td>
              <td>${EURc(c.capex)}</td><td>${EURc(c.npv)}</td></tr>`)}</tbody></table>
            <${CxProg} opts=${o.cable.options} econ=${o.econ}/>
            <p class="bhint">Cumulative discounted cost over 30 years: the start value is the CAPEX on
              day one, the slope is the OPEX — losses ${EURc(rec.loss_eur_yr)}/yr
              (${rec.loss_mwh_yr.toLocaleString('en-US')} MWh at 75 €/MWh) plus maintenance. Where a
              curve dips below another, the bigger conductor has paid for itself.</p></div>
          <div class="sect">${tr("Cable cost split — recommended")}</div>
          <div class="panel"><table><tbody>
            <tr><td>Cable supply — ${rec.systems}× 3 cores × ${o.route.route_km} km</td>
              <td style=${{textAlign:'right'}}>${EURc(rec.supply_eur)}</td></tr>
            <tr><td>Installation — pulling, jointing, terminations</td>
              <td style=${{textAlign:'right'}}>${EURc(rec.install_eur)}</td></tr>
            <tr><td>Earthworks — ${rec.trenches} trench${rec.trenches>1?'es':''} × ${o.route.route_km} km</td>
              <td style=${{textAlign:'right'}}>${EURc(rec.civil_eur)}</td></tr>
            <tr><td><b>Cable total</b></td>
              <td style=${{textAlign:'right'}}><b>${EURc(rec.capex)}</b></td></tr>
          </tbody></table></div>
          ${o.alternative&&h`<div class="sect">${tr("Concept comparison")}</div>
          <div class="panel"><div class="note">
            Chosen — <b>${o.concept==='mv'?'33 kV export, trafo at POC':'trafo at site, HV cable'}</b>:${' '}
            ${EURc(o.totals.capex)} CAPEX · ${EURc(o.totals.npv30)} 30-yr NPV.<br/>
            Alternative — ${o.alternative.concept==='mv'?'33 kV export, trafo at POC':'trafo at site, HV cable'}${' '}
            (${o.alternative.cable}): <b>${EURc(o.alternative.capex)}</b> CAPEX ·${' '}
            ${EURc(o.alternative.npv30)} NPV${' — '}
            <b style=${{color:o.alternative.npv30<o.totals.npv30?'#b35400':'#248a3d'}}>
              ${o.alternative.npv30<o.totals.npv30
                ?((1-o.alternative.npv30/o.totals.npv30)*100).toFixed(0)+' % cheaper — consider switching the concept'
                :((o.alternative.npv30/o.totals.npv30-1)*100).toFixed(0)+' % more expensive'}</b>
          </div></div>`}
          <div class="sect">${tr("Bays, stations, transformer")}</div>
          <div class="panel"><table><tbody>
            ${o.station.items.map(it=>h`<tr key=${it.name}><td>${it.name}</td><td style=${{textAlign:'right'}}>${EURc(it.eur)}</td></tr>`)}
            <tr><td><b>Stations total</b></td><td style=${{textAlign:'right'}}><b>${EURc(o.station.total)}</b></td></tr>
          </tbody></table></div>
          <div class="sect">${tr("Voltage drop & compensation")}</div>
          <div class="panel">
            <div class="note">ΔU at the POC: <b>${rec.du_pct} %</b> · cable charging: <b>${o.compensation.qc_mvar.toFixed(1)} Mvar</b>
              · project Q at cos φ ${prm.pf.toFixed(2)}: ${o.q_mvar} Mvar</div>
            ${o.compensation.items.length===0&&h`<div class="note" style=${{marginTop:4}}>No compensation needed at this length and size.</div>`}
            ${o.compensation.items.map(it=>h`<div class="note" style=${{marginTop:6}} key=${it.name}>
              <b>${it.name}</b> — ${EURc(it.eur)} ${it.included?'(included in CAPEX)':'(optional, not included)'}<br/>${it.why}</div>`)}
          </div>
          ${o.flags.length>0&&h`<div class="sect">${tr("Watch out")}</div>
            ${o.flags.map((f,i)=>h`<div class="panel" key=${i} style=${{marginTop:6}}>
              <span class="note" style=${{color:'#b35400'}}>${f}</span></div>`)}`}
          <p class="bhint" style=${{marginTop:10}}>Assumptions: route = air distance × 1.4 · losses 75 €/MWh,
            30 yr @ 6 % · buried XLPE systems, one trench carries 2 systems ·
            indicative 2025 German unit costs (NEP/BNetzA-style catalog), ±30 % · BKZ and permitting excluded.</p>
        </div>`}
        ${proj&&phase!=='params'&&h`<div>
          <div class="sect">${tr("Co-location")}</div>
          <div class="panel">
            <span class="note">Share one grid connection: fix the transformer, then see how much${' '}
              <b>${cxT(ct2)}</b> fits beside the ${prm.mw} MW ${cxT(prm.tech)} before the export
              limit starts curtailing it — hour by hour on regional weather curves.</span>
            <div class="bgrid b3" style=${{marginTop:8}}>
              <label>Transformer <span>MVA</span>${NUM(cmva,v=>setCp(p=>({...p,mva:v})),5,1)}</label>
            </div>
            <div class="chips">${COLO_TECHS.map(([id,l])=>h`<span key=${id}
              class=${'chip'+(ct2===id?' on':'')} onClick=${()=>setCp(p=>({...p,tech2:id}))}>
              <span class="sw" style=${{background:COLO_COL[id]}}></span>${l}</span>`)}</div>
            <button class="brun" onClick=${runColo} disabled=${cbusy}>
              ${cbusy?'Sweeping 8,760 hours…':'Analyse co-location ▸'}</button>
          </div>
          ${colo&&h`<div>
            <div class="panel" style=${{marginTop:8}}>
              <div class="note">Export limit <b>${colo.p_exp_mw} MW</b> (${colo.trafo_mva} MVA × cos φ ${colo.pf.toFixed(2)}) ·${' '}
                ${colo.primary.label} alone uses <b>${colo.primary.util_pct} %</b> of the connection${colo.corr!=null?h` ·${' '}
                profile correlation <b>${colo.corr.toFixed(2)}</b>`:''}</div>
              <div class="kpis" style=${{marginTop:8}}>
                ${[['p1','≤1 % curtailed'],['p5','≤5 % curtailed'],['p10','≤10 % curtailed']]
                  .filter(([k])=>colo.sizes[k]).map(([k,l])=>h`<div class="kpi" key=${k}>
                  <div class="v">${Math.round(colo.sizes[k].mw2)} MW</div><div class="k">${l}</div></div>`)}
              </div>
              ${colo.sizes.p5&&h`<div class="note" style=${{marginTop:6}}>
                At <b>${Math.round(colo.sizes.p5.mw2)} MW</b> added ${cxT(colo.secondary.tech)} (≤5 %):
                +<b>${colo.sizes.p5.added_gwh} GWh/yr</b> delivered, ${colo.sizes.p5.curt_gwh} GWh curtailed
                across ${colo.sizes.p5.curt_h.toLocaleString('en-US')} h — connection utilisation${' '}
                ${colo.primary.util_pct} % → <b>${colo.sizes.p5.util_pct} %</b>.</div>`}
            </div>
            <div class="sect">${tr("Curtailment vs added")} ${cxT(colo.secondary.tech)}</div>
            <div class="panel">
              <${ColoSweep} curve=${colo.curve} sizes=${colo.sizes}/>
              <p class="bhint">Share of the added plant's annual energy the shared connection would
                curtail, as its size grows. Marked: the largest size at each curtailment budget.</p>
            </div>
            <div class="sect">${tr("Monthly energy ·")} ${colo.ref_mw2} MW added</div>
            <div class="panel">
              <${ColoMonthly} monthly=${colo.monthly} plabel=${colo.primary.label} slabel=${colo.secondary.label}
                pcol=${COLO_COL[colo.primary.tech]||'#1d1d1f'} scol=${COLO_COL[colo.secondary.tech]}/>
              <div class="chips" style=${{marginTop:6}}>
                <span class="chip"><span class="sw" style=${{background:COLO_COL[colo.primary.tech]||'#1d1d1f'}}></span>${colo.primary.label}</span>
                <span class="chip"><span class="sw" style=${{background:COLO_COL[colo.secondary.tech]}}></span>${colo.secondary.label} (added)</span>
              </div>
              <p class="bhint">Energy exported through the connection each month; the dashed line is the
                transformer's monthly maximum. Complementary seasons — winter wind, summer sun — are
                what let two technologies share one connection.</p>
            </div>
            ${colo.notes.map((nt,i)=>h`<p class="bhint" key=${i} style=${{marginTop:6}}>${nt}</p>`)}
            <p class="bhint" style=${{marginTop:6}}>Curves: ${colo.secondary.source} · the primary has grid
              priority, all shared-limit curtailment is attributed to the added plant · screening level.</p>
          </div>`}
        </div>`}
      </div>
    </aside>
  </div></div>
  ${modal&&h`<${CapexModal} prm=${prm} setPrm=${setPrm}
    onDone=${()=>{setModal(false);setRes(null);setColo(null);setPhase('target')}}
    onClose=${()=>{setModal(false);setPhase(proj?'target':'place')}}/>`}`;
}

export {COLO_COL,COLO_TECHS,CX_RANK,CX_TECHS,Capex,CapexModal,ColoMonthly,ColoSweep,CxProg,cxPop,cxT};
