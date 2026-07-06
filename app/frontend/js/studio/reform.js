import {h,memo,useCallback,useEffect,useMemo,useRef,useState} from './core.js';
import {tr} from './i18n.js';
import {GW,MW} from './format.js';
import {useMap} from './mapcore.js';
import {j} from './api.js';
import {Bars} from './ui.js';
import {Grid} from './gridtab.js';

/* ── Grid Reform (Reifegradverfahren — the 2026 TSO connection-queue reform) ──
   Data: /api/reform, built by scripts/pipeline/build_grid_reform.py from the
   four TSOs' cycle-1 publications. Palette (validated, CVD-safe): one fixed
   hue per TSO; identity is never colour-alone — every mark carries a label. */
const TSOC={'50Hertz':'#0066cc','Amprion':'#ff9500','TenneT':'#30b0c7','TransnetBW':'#af52de'};
const BANDL=b=>b==null?'—':b[1]===0?'0 MW':b[0]===0?'< '+b[1]+' MW':b[0]+'–'+b[1]+' MW';

/* BESS queue growth vs what the system actually needs (single series → no legend) */
const ReformQueueChart=memo(({q})=>{
  const W=348,H=158,x0=8,x1=W-70,yT=16,yB=132,mx=230;
  const y=v=>yB-(v/mx)*(yB-yT);
  const g=q.bess_growth,bw=38,step=(x1-x0)/g.length;
  const bar=(x,v)=>{const t=y(v),r=3;   // rounded top, square baseline
    return `M${x},${yB}V${t+r}Q${x},${t} ${x+r},${t}H${x+bw-r}Q${x+bw},${t} ${x+bw},${t+r}V${yB}Z`};
  const [lo,hi]=q.nep_2037_bess_need_gw;
  return h`<svg viewBox=${`0 0 ${W} ${H}`} width="100%" style=${{display:'block'}}>
    <rect x=${x0} y=${y(hi)} width=${x1-x0} height=${y(lo)-y(hi)} fill="rgba(0,0,0,.05)"/>
    <line x1=${x0} x2=${x1} y1=${y(hi)} y2=${y(hi)} stroke="#d2d2d7" stroke-width="0.5"/>
    <line x1=${x0} x2=${x1} y1=${y(lo)} y2=${y(lo)} stroke="#d2d2d7" stroke-width="0.5"/>
    <text x=${x1+4} y=${y(hi)+4} font-size="9" fill="#86868b">NEP 2037</text>
    <text x=${x1+4} y=${y(hi)+14} font-size="9" fill="#86868b">${lo}–${hi} GW</text>
    <line x1=${x0} x2=${x1} y1=${y(q.bess_reserved_gw)} y2=${y(q.bess_reserved_gw)}
      stroke="currentColor" stroke-width="1" stroke-dasharray="3 3"/>
    <text x=${x1+4} y=${y(q.bess_reserved_gw)+3.5} font-size="9" fill="currentColor">${q.bess_reserved_gw} GW rsvd</text>
    ${g.map((r,i)=>{const x=x0+i*step+(step-bw)/2;return h`<g key=${r.year}>
      <path d=${bar(x,r.gw)} fill="#0066cc"/>
      <text x=${x+bw/2} y=${y(r.gw)-5} font-size="10" font-weight="600" fill="currentColor" text-anchor="middle">${r.gw}</text>
      <text x=${x+bw/2} y=${yB+13} font-size="9.5" fill="#6e6e73" text-anchor="middle">${r.year}</text>
      <text x=${x+bw/2} y=${yB+24} font-size="8.5" fill="#86868b" text-anchor="middle">${r.requests} req.</text>
    </g>`})}
    <line x1=${x0} x2=${x1} y1=${yB} y2=${yB} stroke="#d2d2d7" stroke-width="0.5"/>
  </svg>`;
});

/* the 18-point maturity score — identity via direct label, neutral inks */
const ReformScoreBar=memo(({sc})=>{
  const W=348,H=30,gap=2,tones=['var(--ink)','#48484a','#6e6e73','#98989d'];
  let x=0;
  const segs=sc.categories.map((c,i)=>{
    const w=c.max_points/sc.max_points*(W-gap*(sc.categories.length-1));
    const s={x,w,c,tone:tones[i]};x+=w+gap;return s;});
  return h`<div>
    <svg viewBox=${`0 0 ${W} ${H}`} width="100%" style=${{display:'block'}}>
      ${segs.map(s=>h`<g key=${s.c.id}>
        <rect x=${s.x} y="6" width=${s.w} height="18" rx="4" fill=${s.tone}/>
        <text x=${s.x+s.w/2} y="18.5" font-size="10.5" font-weight="600" fill="#fff" text-anchor="middle">${s.c.id} · ${s.c.max_points}</text>
      </g>`)}
    </svg>
    ${sc.categories.map(c=>h`<div key=${c.id} style=${{margin:'7px 0 0'}}>
      <div style=${{fontSize:11.5,fontWeight:600}}>${c.id} — ${c.label} <span class="note">(${c.weight_pct}%)</span></div>
      ${c.sub.map(s=>h`<div key=${s.id} class="note" style=${{display:'flex',gap:6,marginTop:2}}>
        <span style=${{fontFamily:'var(--mono)',flex:'none'}}>${s.id}</span>
        <span style=${{flex:1}}>${s.label}</span>
        <span style=${{flex:'none',color:s.points?'#1d1d1f':'#86868b'}}>${s.points?'0–'+s.points+' pts':'min. req.'}</span>
      </div>`)}
    </div>`)}
  </div>`;
});

/* per-substation oversubscription at 50Hertz — requested vs still-available MW */
const ReformHzQueue=memo(({subs})=>{
  const rows=subs.filter(s=>s.q&&s.q.req_gen>0).sort((a,b)=>b.q.req_gen-a.q.req_gen).slice(0,12);
  if(!rows.length)return null;
  const W=348,rh=19,H=rows.length*rh+18,x0=108,x1=W-42;
  const mx=Math.max(...rows.map(r=>r.q.req_gen),1);
  const X=v=>x0+(v/mx)*(x1-x0);
  return h`<svg viewBox=${`0 0 ${W} ${H}`} width="100%" style=${{display:'block'}}>
    ${rows.map((s,i)=>{const y=8+i*rh,q=s.q;
      return h`<g key=${s.name}>
        <text x=${x0-6} y=${y+9} font-size="9.5" fill="currentColor" text-anchor="end">${s.name.replace(/\s*\(.*\)/,'').slice(0,17)}</text>
        <rect x=${x0} y=${y} width=${Math.max(X(q.req_gen)-x0,2)} height="11" rx="3" fill="#0066cc" opacity="0.85"/>
        ${q.avail_gen!=null&&h`<line x1=${X(q.avail_gen)} x2=${X(q.avail_gen)} y1=${y-2} y2=${y+13} stroke="currentColor" stroke-width="1.5"/>`}
        <text x=${Math.max(X(q.req_gen),q.avail_gen!=null?X(q.avail_gen):0)+5} y=${y+9} font-size="8.5" font-family="ui-monospace,Menlo,monospace" fill="#6e6e73">${(q.req_gen/1000).toFixed(1)}</text>
      </g>`})}
  </svg>`;
});

/* first-cycle timeline, Feb 2026 → Feb 2027, with a today cursor */
const ReformCycleStrip=memo(({cycle})=>{
  const W=348,H=92,m0=2026*12+1;   // Feb 2026 = index 0
  const mi=s=>(+s.slice(0,4))*12+(+s.slice(5,7)-1)-m0, span=13, X=m=>8+(m/span)*(W-16);
  const tm=mi(cycle.today.slice(0,7))+(+cycle.today.slice(8,10))/31;
  return h`<svg viewBox=${`0 0 ${W} ${H}`} width="100%" style=${{display:'block'}}>
    ${cycle.phases.map((p,i)=>{const a=mi(p.start),b=mi(p.end);
      const on=tm>=a&&tm<b,past=tm>=b,up=i%2===0;
      return h`<g key=${p.id}>
        <rect x=${X(a)} y="38" width=${X(b)-X(a)-2} height="14" rx="4"
          fill=${on?'#0066cc':past?'#d2d2d7':'#f0f0f2'} stroke=${on||past?'none':'#d2d2d7'} stroke-width="0.5"/>
        <text x=${X(a)+1} y=${up?30:66} font-size="9" font-weight=${on?600:400} fill=${on?'#0066cc':'#6e6e73'}>${p.label}</text>
        <text x=${X(a)+1} y=${up?18:78} font-size="8" fill="#86868b">${p.start.slice(5)}/${p.start.slice(2,4)} – ${p.end.slice(5)}/${p.end.slice(2,4)}</text>
      </g>`})}
    <line x1=${X(tm)} x2=${X(tm)} y1="34" y2="56" stroke="#ff3b30" stroke-width="1.5"/>
    <text x=${X(tm)} y=${90} font-size="8.5" fill="#ff3b30" text-anchor="middle">today</text>
  </svg>`;
});

const fmtMW=v=>v==null?'—':Math.round(v).toLocaleString('en-US');
/* explanation per node: curated `why` from the builder, else computed from the queue */
const autoWhy=s=>{
  if(s.why)return s.why;
  if(!s.q)return null;
  const q=s.q,parts=[];
  parts.push(q.bays_free?`${q.bays_free} switch bay${q.bays_free>1?'s':''} still free.`
    :'All switch bays taken — capacity was granted first-come-first-served before the reform.');
  if((q.res_gen||0)>0||(q.res_load||0)>0)parts.push(`${fmtMW(Math.max(q.res_gen||0,q.res_load||0))} MW already reserved (vergeben).`);
  if((q.avail_gen||0)>0&&q.req_gen>0)parts.push(`Queue is ${(q.req_gen/q.avail_gen).toFixed(1)}× the remaining feed-in capacity.`);
  else if(q.req_gen>0)parts.push(`${fmtMW(q.req_gen)} MW requested with no feed-in left to offer.`);
  return parts.join(' ');
};
/* full data card shown as a Leaflet popup when a substation is clicked */
const reformPopup=s=>{
  const row=(k,v)=>`<tr><td style="color:var(--ink2);padding:1px 10px 1px 0;white-space:nowrap;vertical-align:top">${k}</td><td style="text-align:right;font-weight:600;color:var(--ink)">${v}</td></tr>`;
  let rows='';
  rows+=row('Voltage',s.kv?s.kv+' kV':'—');
  rows+=row('Switch bays',s.q?`${s.q.bays_free} free`:(s.bays||'tbd'));
  if(s.year)rows+=row('Earliest connection',s.year);
  if(s.q){
    rows+=row('Angefragt (requested)',`${fmtMW(s.q.req_gen)} / ${fmtMW(s.q.req_load)}`);
    rows+=row('Vergeben (reserved)',`${fmtMW(s.q.res_gen)} / ${fmtMW(s.q.res_load)}`);
    rows+=row('Verfügbar (available)',`${fmtMW(s.q.avail_gen)} / ${fmtMW(s.q.avail_load)}`);
    if((s.q.avail_gen||0)>0&&s.q.req_gen>0)rows+=row('Oversubscription',(s.q.req_gen/s.q.avail_gen).toFixed(1)+'× (gen)');
    rows+=row('Site BKZ',s.q.bkz_eur_per_kw+' €/kW');
    rows+=row('DSO',s.q.dso||'—');
  }else{
    rows+=row('Verfügbare Einspeisung',BANDL(s.feedin));
    rows+=row('Verfügbare Last',BANDL(s.load));
  }
  const why=autoWhy(s);
  const nep=s.nep?(s.nep.first
      ?`Since NEP ${s.nep.first}${s.nep.proj?' · '+s.nep.proj:''}${s.nep.cod?' · project COD '+s.nep.cod:''}${s.nep.note?' — '+s.nep.note:''}`
      :`In no NEP (2019–2025)${s.nep.note?' — '+s.nep.note:' — legacy offer on existing bays/assets.'}`)
    :null;
  return `<div style="font:12px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;min-width:235px;max-width:285px">
    <div style="font-size:13px;font-weight:700;color:var(--ink)">${s.name}
      <span style="font-weight:400;color:var(--ink2)">· <span style="color:${TSOC[s.tso]}">●</span> ${s.tso}${s.city?' · '+s.city:''}</span></div>
    <table style="border-collapse:collapse;margin-top:5px;width:100%;font-size:11.5px">${rows}</table>
    ${s.q?'<div style="color:#86868b;font-size:10px;margin-top:3px">MW values: generation / load · feed 31.03.2026</div>':''}
    ${s.restriction?`<div style="color:#ff3b30;margin-top:4px;font-size:11.5px">${s.restriction}</div>`:''}
    ${why?`<div style="color:#48484a;margin-top:6px;padding-top:6px;border-top:0.5px solid #d2d2d7;font-size:11px"><b>Why:</b> ${why}</div>`:''}
    ${nep?`<div style="color:var(--ink2);margin-top:5px;font-size:10.5px"><b>NEP trail:</b> ${nep}</div>`:''}
  </div>`;
};
/* popup for a candidate node (future capacity, not offered in cycle 1) */
const candPopup=c=>`<div style="font:12px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;min-width:230px;max-width:285px">
  <div style="font-size:13px;font-weight:700;color:var(--ink)">${c.name}
    <span style="font-weight:400;color:var(--ink2)">· <span style="color:${TSOC[c.tso]}">◌</span> ${c.tso}</span>
    <span style="font-size:10px;font-weight:600;color:${c.tier===1?'#af52de':'#86868b'};letter-spacing:.04em"> · CYCLE-2 TIER ${c.tier}</span></div>
  <div style="margin-top:4px;font-size:11.5px"><b>COD ~${c.cod}</b> — ${c.driver}</div>
  <div style="color:#48484a;margin-top:5px;font-size:11px">${c.effect}</div>
  <div style="color:#86868b;margin-top:5px;font-size:10px">Not offered in cycle 1 — our NEP-based prediction, not a TSO publication.</div>
</div>`;
/* substation project from the TSO websites (COD >= 2030), scraped 07/2026 */
const tsoProjPopup=p=>`<div style="font:12px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;min-width:230px;max-width:285px">
  <div style="font-size:13px;font-weight:700;color:var(--ink)">${p.name}
    <span style="font-weight:400;color:var(--ink2)">· <span style="color:${TSOC[p.tso]}">●</span> ${p.tso}</span></div>
  <div style="margin-top:4px;font-size:11.5px"><b>COD ~${p.cod}</b> · ${p.type||'Umspannwerk'} · ${p.status||''}</div>
  <div style="color:#48484a;margin-top:4px;font-size:11px">${p.basis||''}</div>
  <div style="color:#86868b;margin-top:5px;font-size:10px">${p.kind==='new'?'Website-only — not (yet) a named NEP measure.':'Confirms an NEP measure.'}
    ${p.url?` · <a href="${p.url}" target="_blank" rel="noopener" style="color:#0066cc">project page ↗</a>`:''}</div>
  <div style="color:#86868b;margin-top:3px;font-size:10px">Construction pipeline from the TSO project sites — not a cycle-1 connection offer.</div>
</div>`;
/* requested vs reserved vs available, drawn to scale for one example node */
const SemanticsBar=memo(({s})=>{
  if(!s||!s.q)return null;
  const q=s.q,W=348,mx=Math.max(q.req_gen,(q.res_gen||0)+(q.avail_gen||0),1);
  const X=v=>8+(v/mx)*(W-16);
  return h`<svg viewBox=${`0 0 ${W} 98`} width="100%" style=${{display:'block'}}>
    <text x="8" y="12" font-size="9.5" fill="#6e6e73">Example — ${s.name.replace(/\s*\(.*\)/,'')}, generation side</text>
    <rect x="8" y="18" width=${Math.max(X(q.res_gen||0)-8,1)} height="13" rx="3" fill="currentColor"/>
    <rect x=${X(q.res_gen||0)+1} y="18" width=${Math.max(X((q.res_gen||0)+(q.avail_gen||0))-X(q.res_gen||0)-1,1)} height="13" rx="3" fill="#34c759"/>
    <text x="8" y="43" font-size="8.5" fill="currentColor">vergeben ${fmtMW(q.res_gen)} MW (gone)</text>
    <text x=${W-8} y="43" font-size="8.5" fill="#248a3d" text-anchor="end">verfügbar ${fmtMW(q.avail_gen)} MW (offerable)</text>
    <rect x="8" y="56" width=${Math.max(X(q.req_gen)-8,1)} height="13" rx="3" fill="#0066cc" opacity="0.55"/>
    <text x="8" y="82" font-size="8.5" fill="#0066cc">angefragt ${fmtMW(q.req_gen)} MW — the whole queue competes for the green slice only</text>
    <text x="8" y="94" font-size="8.5" fill="#86868b">site max ≈ vergeben + verfügbar (the TSO never publishes the max itself)</text>
  </svg>`;
});

function Reform({active,nav}){
  const [ref,mapRef]=useMap(active);
  const [data,setData]=useState(null);
  const [sel,setSel]=useState(null);          // clicked connection point
  const [tsoF,setTsoF]=useState(null);        // TSO filter (null = all)
  const [availF,setAvailF]=useState('all');   // 'all' | 'now' | 'future'
  const [bigq,setBigq]=useState(false);       // only queue ≥ 1 GW
  const [sizeBy,setSizeBy]=useState('queue'); // circle size: 'queue' | 'bays'
  const [mode,setMode]=useState('data');      // 'data' | 'analysis'
  const [codF,setCodF]=useState(null);        // COD bucket: null | 'le31' | '3233' | 'ge34'
  const [t1,setT1]=useState(false);           // cycle-2 predictions, tier 1
  const [t2,setT2]=useState(false);           // cycle-2 predictions, tier 2
  const [tproj,setTproj]=useState(false);     // TSO-website substation projects (COD >= 2030)
  const [c1,setC1]=useState(true);            // show the cycle-1 auctioned connection points
  const layRef=useRef(null);
  useEffect(()=>{if(active&&!data)j('/api/reform').then(d=>setData(d&&d.substations?d:null)).catch(()=>{});},[active,data]);

  // appliable in cycle 1: 50Hertz needs a free bay; Amprion/TransnetBW/TenneT
  // published sites are appliable by definition (TenneT: ≥1 bay assumed)
  const appliable=s=>s.q?s.q.bays_free>0:true;
  const inCod=y=>codF==='le31'?(y!=null&&y<=2031):codF==='3233'?(y>=2032&&y<=2033):codF==='ge34'?(y!=null&&y>=2034):true;
  const subs=useMemo(()=>!data?[]:data.substations
    .filter(s=>!tsoF||s.tso===tsoF)
    .filter(s=>availF==='now'?appliable(s):availF==='future'?!!s.year:true)
    .filter(s=>!bigq||(s.q&&Math.max(s.q.req_gen,s.q.req_load)>=1000))
    .filter(s=>inCod(s.year))
    .slice().sort((a,b)=>(a.year||9999)-(b.year||9999)||(b.q?b.q.req_gen:0)-(a.q?a.q.req_gen:0)||(b.feedin?b.feedin[1]:0)-(a.feedin?a.feedin[1]:0)),
    [data,tsoF,availF,bigq,codF]);
  const predMode=t1||t2;                      // prediction view replaces cycle-1 points
  const cands=useMemo(()=>!data||!predMode?[]:(data.candidates||[])
    .filter(c=>(t1&&c.tier===1)||(t2&&c.tier===2))
    .filter(c=>!tsoF||c.tso===tsoF).filter(c=>inCod(c.cod))
    .slice().sort((a,b)=>(a.cod||9999)-(b.cod||9999)),[data,t1,t2,tsoF,codF]);
  const tprojs=useMemo(()=>!data||!tproj?[]:(data.tso_projects||[])
    .filter(p=>!tsoF||p.tso===tsoF).filter(p=>inCod(p.cod)),[data,tproj,tsoF,codF]);
  const counts=useMemo(()=>{const c={};(data?data.substations:[]).forEach(s=>c[s.tso]=(c[s.tso]||0)+1);return c;},[data]);
  const ats=useMemo(()=>data&&data.substations.find(s=>s.name.startsWith('Altentreptow Süd')),[data]);

  useEffect(()=>{                             // map: marker per point, popup = full data card
    const m=mapRef.current;if(!m||!data)return;
    if(!layRef.current)layRef.current=L.layerGroup().addTo(m);
    const lay=layRef.current;lay.clearLayers();
    for(const s of (predMode||!c1?[]:subs)){
      const hardR=s.restriction&&s.restriction!=='No free switch bay';
      const r=sizeBy==='queue'
        ?(s.q?Math.min(3.5+Math.sqrt(Math.max(s.q.req_gen,s.q.req_load,1))/8.5,13):4.5)
        :(s.q?Math.min(3.5+2.2*s.q.bays_free,12):(s.bays==='n-1'?9:s.bays==='n-0'?6.5:5));
      lay.addLayer(L.circleMarker([s.lat,s.lon],{
        radius:r,fillColor:TSOC[s.tso],
        fillOpacity:sel&&sel.name===s.name?.95:(s.q&&!appliable(s)?.4:.78),
        color:hardR?'#ff3b30':'rgba(0,0,0,.3)',weight:hardR?1.4:.6,
        dashArray:hardR?'3 2':null})
       .bindTooltip(()=>`<b>${s.name}</b> · ${s.tso}${s.year?' · from '+s.year:''}${s.q?' · req '+fmtMW(s.q.req_gen)+' MW':''}<br><span style="color:var(--ink2)">click for the full data card</span>`,{sticky:true})
       .bindPopup(reformPopup(s),{maxWidth:300})
       .on('click',()=>setSel(s)));
    }
    for(const c of cands){                    // future-capacity candidates: hollow dashed rings
      lay.addLayer(L.circleMarker([c.lat,c.lon],{
        radius:8.5,fillColor:TSOC[c.tso],fillOpacity:.12,
        color:TSOC[c.tso],weight:1.6,dashArray:'4 3'})
       .bindTooltip(()=>`<b>${c.name}</b> · candidate · COD ~${c.cod}<br><span style="color:var(--ink2)">${c.driver}</span>`,{sticky:true})
       .bindPopup(candPopup(c),{maxWidth:300}));
    }
    for(const p of tprojs){                   // TSO-website substation projects: white-filled solid rings
      if(p.lat==null)continue;
      lay.addLayer(L.circleMarker([p.lat,p.lon],{
        radius:5.5,fillColor:'#fff',fillOpacity:.92,
        color:TSOC[p.tso],weight:2})
       .bindTooltip(()=>`<b>${p.name}</b> · ${p.tso} · COD ~${p.cod}<br><span style="color:var(--ink2)">${p.status||''}${p.kind==='new'?' · website-only':''}</span>`,{sticky:true})
       .bindPopup(tsoProjPopup(p),{maxWidth:300}));
    }
  },[data,subs,cands,tprojs,sel,sizeBy,predMode,c1,mapRef.current]);

  const pick=useCallback(s=>{setSel(s);const m=mapRef.current;if(!m)return;
    m.setView([s.lat,s.lon],Math.max(m.getZoom(),7),{animate:true});
    setTimeout(()=>L.popup({maxWidth:300}).setLatLng([s.lat,s.lon]).setContent(reformPopup(s)).openOn(m),320);
  },[]);

  const chip=(on,label,cb,color)=>h`<button key=${label} onClick=${cb}
    style=${{appearance:'none',cursor:'pointer',fontFamily:'inherit',fontSize:11,padding:'4px 9px',
      borderRadius:100,border:'0.5px solid '+(on?(color||'#1d1d1f'):'var(--hair)'),
      background:on?(color||'#1d1d1f')+'14':'var(--card)',color:'var(--ink)',fontWeight:on?600:400}}>${label}</button>`;

  const filters=data&&h`<div>
    <div class="brow" style=${{marginTop:8}}>
      ${Object.keys(TSOC).map(t=>h`<button key=${t} onClick=${()=>setTsoF(f=>f===t?null:t)}
        style=${{appearance:'none',cursor:'pointer',fontFamily:'inherit',fontSize:11,padding:'4px 9px',
          borderRadius:100,border:'0.5px solid '+(tsoF===t?TSOC[t]:'var(--hair)'),
          background:tsoF===t?TSOC[t]+'14':'var(--card)',color:'var(--ink)'}}>
        <span style=${{display:'inline-block',width:8,height:8,borderRadius:4,background:TSOC[t],marginRight:5,verticalAlign:'-0.5px'}}></span>
        ${t} · ${counts[t]||0}</button>`)}
    </div>
    <div class="brow">
      ${chip(availF==='now','Appliable now (free bay)',()=>setAvailF(f=>f==='now'?'all':'now'),'#34c759')}
      ${chip(availF==='future','From 2030+',()=>setAvailF(f=>f==='future'?'all':'future'))}
      ${chip(bigq,'Queue ≥ 1 GW',()=>setBigq(b=>!b),'#0066cc')}
      ${chip(sizeBy==='queue','Size: queue',()=>setSizeBy(v=>v==='queue'?'bays':'queue'))}
    </div>
    <div class="brow">
      ${chip(codF==='le31','COD ≤ 2031',()=>setCodF(f=>f==='le31'?null:'le31'))}
      ${chip(codF==='3233','COD 2032–33',()=>setCodF(f=>f==='3233'?null:'3233'))}
      ${chip(codF==='ge34','COD ≥ 2034',()=>setCodF(f=>f==='ge34'?null:'ge34'))}
      ${chip(t1,'Cycle 2 · Tier 1',()=>setT1(v=>!v),'#af52de')}
      ${chip(t2,'Cycle 2 · Tier 2',()=>setT2(v=>!v),'#af52de')}
      ${chip(tproj,`UW projects 2030+ · ${data.tso_projects?data.tso_projects.length:0}`,()=>setTproj(v=>!v),'#5e5ce6')}
      ${chip(!c1,'Hide cycle-1 offers',()=>setC1(v=>!v),'#ff3b30')}
    </div>
    ${tproj&&h`<span class="note" style=${{display:'block',fontSize:10}}>White rings — substation/converter projects from the four TSO project websites (COD ≥ 2030, scraped 07/2026): the physical build pipeline behind future connection capacity, not cycle-1 offers.</span>`}
    ${!c1&&!predMode&&h`<span class="note" style=${{display:'block',fontSize:10}}>Cycle-1 auctioned points hidden${tproj?' — showing only the UW build pipeline':cands.length?'':' — turn on “UW projects 2030+” or a Cycle-2 tier to see a layer'}.</span>`}
    ${predMode&&h`<span class="note" style=${{display:'block',fontSize:10}}>Prediction view — cycle-1 points hidden. Our NEP-based forecast of what the next cycle offers, not a TSO publication.</span>`}
    ${codF&&!predMode&&h`<span class="note" style=${{display:'block',fontSize:10}}>COD filter hides 50Hertz sites — they publish no connection year, only today's bay state.</span>`}
  </div>`;

  const candRow=c=>h`<button key=${c.name} onClick=${()=>{const m=mapRef.current;if(!m)return;
      m.setView([c.lat,c.lon],Math.max(m.getZoom(),7),{animate:true});
      setTimeout(()=>L.popup({maxWidth:300}).setLatLng([c.lat,c.lon]).setContent(candPopup(c)).openOn(m),320);}}
    style=${{display:'flex',alignItems:'flex-start',gap:8,width:'100%',appearance:'none',border:0,background:'none',
      cursor:'pointer',textAlign:'left',padding:'5px 4px',borderRadius:6,borderBottom:'0.5px solid var(--hair2)',fontFamily:'inherit'}}>
    <span style=${{flex:'none',width:9,height:9,borderRadius:5,border:'1.5px dashed '+TSOC[c.tso],marginTop:4}}></span>
    <span style=${{flex:1,minWidth:0}}>
      <span style=${{fontSize:12,fontWeight:600,color:'var(--ink)'}}>${c.name}</span>
      <span style=${{fontFamily:'var(--mono)',fontSize:10,color:'#6e6e73',marginLeft:6}}>COD ~${c.cod}</span>
      <span style=${{fontSize:9,fontWeight:600,color:c.tier===1?'#af52de':'#86868b',marginLeft:6,letterSpacing:'.04em'}}>TIER ${c.tier}</span>
      <span class="note" style=${{display:'block',fontSize:10.5,lineHeight:1.45}}>${c.driver} — ${c.effect}</span>
    </span>
  </button>`;
  const tprojRow=p=>h`<button key=${p.tso+p.name} onClick=${()=>{const m=mapRef.current;if(!m||p.lat==null)return;
      m.setView([p.lat,p.lon],Math.max(m.getZoom(),7),{animate:true});
      setTimeout(()=>L.popup({maxWidth:300}).setLatLng([p.lat,p.lon]).setContent(tsoProjPopup(p)).openOn(m),320);}}
    style=${{display:'flex',alignItems:'flex-start',gap:8,width:'100%',appearance:'none',border:0,background:'none',
      cursor:p.lat==null?'default':'pointer',textAlign:'left',padding:'5px 4px',borderRadius:6,borderBottom:'0.5px solid var(--hair2)',fontFamily:'inherit'}}>
    <span style=${{flex:'none',width:9,height:9,borderRadius:5,background:'#fff',border:'2px solid '+TSOC[p.tso],marginTop:4}}></span>
    <span style=${{flex:1,minWidth:0}}>
      <span style=${{fontSize:12,fontWeight:600,color:'var(--ink)'}}>${p.name}</span>
      <span style=${{fontFamily:'var(--mono)',fontSize:10,color:'#6e6e73',marginLeft:6}}>COD ~${p.cod}</span>
      ${p.kind==='new'&&h`<span style=${{fontSize:9,fontWeight:600,color:'#5e5ce6',marginLeft:6,letterSpacing:'.04em'}}>WEBSITE-ONLY</span>`}
      <span class="note" style=${{display:'block',fontSize:10.5,lineHeight:1.45}}>${p.status||''}${p.lat==null?' · no published location':''}</span>
    </span>
  </button>`;
  const list=predMode?cands.map(candRow)
    :!c1?(tproj?tprojs.map(tprojRow):[])
    :subs.map(s=>{const f=s.feedin,W=120,why=mode==='analysis'?autoWhy(s):null;
    return h`<button key=${s.tso+s.name} onClick=${()=>pick(s)}
      style=${{display:'flex',alignItems:mode==='analysis'?'flex-start':'center',gap:8,width:'100%',appearance:'none',border:0,
        background:sel&&sel.name===s.name?'rgba(0,102,204,.06)':'none',cursor:'pointer',textAlign:'left',
        padding:'5px 4px',borderRadius:6,borderBottom:'0.5px solid var(--hair2)',fontFamily:'inherit'}}>
      <span style=${{flex:'none',width:9,height:9,borderRadius:5,background:TSOC[s.tso],marginTop:mode==='analysis'?4:0,
        opacity:s.q&&!appliable(s)?.45:1,
        outline:s.restriction&&s.restriction!=='No free switch bay'?'1.5px dashed #ff3b30':'none',outlineOffset:1.5}}></span>
      <span style=${{flex:1,minWidth:0}}>
        <span style=${{fontSize:12,fontWeight:600,color:'var(--ink)'}}>${s.name}</span>
        ${mode==='analysis'
          ?h`<span class="note" style=${{display:'block',fontSize:10.5,lineHeight:1.45}}>${why||'No published detail.'}</span>`
          :h`<span class="note" style=${{display:'block',fontSize:10.5}}>${s.bays?s.bays+(s.q?' bays':''):'bays tbd'}${s.year?' · from '+s.year:''}${s.q?' · req '+(s.q.req_gen/1000).toFixed(1)+' GW':''}${s.restriction&&s.restriction!=='No free switch bay'?' · ':''}${s.restriction&&s.restriction!=='No free switch bay'&&h`<span style=${{color:'#ff3b30'}}>${s.restriction}</span>`}</span>`}
      </span>
      ${mode!=='analysis'&&(f?h`<svg width=${W} height="14" style=${{flex:'none'}}>
        <rect x="0" y="4" width=${W} height="6" rx="3" fill="rgba(0,0,0,.05)"/>
        <rect x="0" y="4" width=${Math.max(f[0]/2000*W,2)} height="6" rx="3" fill=${TSOC[s.tso]}/>
        <rect x=${f[0]/2000*W} y="4" width=${Math.max((f[1]-f[0])/2000*W,0)} height="6" fill=${TSOC[s.tso]} opacity="0.35"/>
      </svg>`:h`<span class="note" style=${{flex:'none',fontSize:10}}>no MW data</span>`)}
      ${mode!=='analysis'&&h`<span style=${{flex:'none',width:62,textAlign:'right',fontFamily:'var(--mono)',fontSize:9.5,color:'#6e6e73',whiteSpace:'nowrap'}}>${f==null?'—':f[1]===0?'0':f[0]===f[1]?''+f[1]:f[0]===0?'<'+f[1]:f[0]+'–'+f[1]}</span>`}
    </button>`});

  return h`<div class="view" style=${{display:active?'block':'none'}}><div class="maplay">
    <div class="mapcol"><div class="map" ref=${ref}></div></div>
    <aside class="rail">${nav}<header><h2>${tr("Grid Reform")}</h2>
      <p>The Reifegradverfahren — since April 2026 the four TSOs award transmission
        connections by project maturity, not queue position. Cycle-1 applications closed
        30 June 2026; every published connection point is mapped. Click one for its full data card.</p></header>
      <div class="scroller">
        ${!data&&h`<div class="panel"><span class="note">Loading… (needs data/grid_reform/grid_reform.json — run scripts/pipeline/build_grid_reform.py)</span></div>`}
        ${data&&h`<div>
        <div class="brow" style=${{marginTop:2}}>
          ${chip(mode==='data','Data',()=>setMode('data'))}
          ${chip(mode==='analysis','Analysis — why these nodes?',()=>setMode('analysis'))}
        </div>

        ${mode==='data'&&h`<div>
        <div class="kpis" style=${{marginTop:8}}>
          <div class="kpi"><div class="v">${data.queue.total_gw} GW</div><div class="k">requested · ${data.queue.total_requests} appl.</div></div>
          <div class="kpi"><div class="v">${data.queue.bess_gw} GW</div><div class="k">${tr("of it battery storage")}</div></div>
          <div class="kpi"><div class="v">${data.stats.published_points}</div><div class="k">${tr("published points · cycle 1")}</div></div>
        </div>

        <div class="bsect" style=${{marginTop:16}}>The queue that forced the reform</div>
        <span class="note">Cumulative BESS connection requests at the four TSOs, GW · ${data.queue.as_of}</span>
        <${ReformQueueChart} q=${data.queue}/>
        <span class="note">${data.queue.notes[0]}</span>

        <div class="bsect" style=${{marginTop:18}}>Where you can still connect</div>
        <span class="note">Filter and click a row or a dot on the map · dashed ring = hard restriction · faded = nothing free today</span>
        ${filters}
        ${list}
        <span class="note" style=${{display:'block',marginTop:6}}>Bars: still-available / indicative feed-in MW (scale 0–2,000).
          TransnetBW publishes bands, 50Hertz exact available MW, Amprion bay design only, TenneT locations + year.</span>
        <span class="note" style=${{display:'block',marginTop:6}}>TransnetBW additionally marks <b>37 substations as not available</b> (red on its map) —
          incl. Dellmensingen, Höpfingen, Karlsruhe-West and Goldshöfe. They are deliberately not listed here.</span>

        <div class="bsect" style=${{marginTop:18}}>Oversubscription, node by node — 50Hertz</div>
        <span class="note">Requested generation connections (GW) per substation vs still-available MW (tick) · map feed 31.03.2026</span>
        <div style=${{marginTop:6}}><${ReformHzQueue} subs=${data.substations}/></div>
        <span class="note">${(data.stats.hz_requested_gen_gw||0).toFixed(1)} GW of generation and ${(data.stats.hz_requested_load_gw||0).toFixed(1)} GW of load requested across ${data.stats.hz_sites} published 50Hertz substations — only ${data.stats.hz_sites_with_free_bay} still have a free switch bay.</span>

        <div class="bsect" style=${{marginTop:18}}>How projects are scored — max ${data.framework.scoring.max_points} points</div>
        <span class="note">Four equally weighted categories; points only decide ranking when a site is oversubscribed.</span>
        <div style=${{marginTop:8}}><${ReformScoreBar} sc=${data.framework.scoring}/></div>

        <div class="bsect" style=${{marginTop:18}}>First cycle</div>
        <${ReformCycleStrip} cycle=${data.cycle}/>

        <div class="bsect" style=${{marginTop:14}}>Entry rules</div>
        <div class="panel"><div class="note" style=${{lineHeight:1.7}}>
          Application fee <b style=${{color:'var(--ink)'}}>€${data.framework.fees.application_fee_eur.toLocaleString('en-US')}</b> (50% refunded if inadmissible, carried into the next cycle otherwise)<br/>
          Realisation deposit <b style=${{color:'var(--ink)'}}>€${data.framework.fees.realization_deposit_eur_per_mw.toLocaleString('en-US')}/MW</b> within ${data.framework.fees.offer_acceptance_window_days} days of an offer, credited against the grid-connection charge (BKZ, 3 tranches)<br/>
          Scarce resource: <b style=${{color:'var(--ink)'}}>switch bays, not MW</b> — assignment respects the 3-GW fault criterion</div></div>
        </div>`}

        ${mode==='analysis'&&h`<div>
        <div class="bsect" style=${{marginTop:12}}>Angefragt vs. vergeben vs. verfügbar</div>
        <div class="panel" style=${{marginTop:6}}>
          <${SemanticsBar} s=${ats}/>
          <div class="note" style=${{marginTop:8,lineHeight:1.6}}>
            <b style=${{color:'var(--ink)'}}>Vergeben</b> — ${data.capacity_semantics.reserved}<br/>
            <b style=${{color:'#248a3d'}}>Verfügbar</b> — ${data.capacity_semantics.available}<br/>
            <b style=${{color:'#0066cc'}}>Angefragt</b> — ${data.capacity_semantics.requested}<br/>
            <span style=${{color:'#86868b'}}>${data.capacity_semantics.caveat}</span>
          </div>
        </div>

        <div class="bsect" style=${{marginTop:16}}>Four NEPs, one shortage</div>
        ${data.analysis_overview.map(a=>h`<div key=${a.nep} class="panel" style=${{marginTop:6}}>
          <b style=${{fontSize:12}}>${a.nep}</b> <span class="note">· ${a.horizon}</span>
          <div class="note" style=${{marginTop:3,lineHeight:1.55}}>${a.text}</div>
        </div>`)}

        <div class="bsect" style=${{marginTop:16}}>Why this one — and not that one?</div>
        ${(data.analysis_compare||[]).map(c=>h`<div key=${c.title} class="panel" style=${{marginTop:6}}>
          <b style=${{fontSize:12}}>${c.title}</b>
          <div class="note" style=${{marginTop:3,lineHeight:1.55}}>${c.text}</div>
        </div>`)}

        <div class="bsect" style=${{marginTop:16}}>Next in line — cycle-2 predictions</div>
        <span class="note">NEP-based forecast: Tier 1 = enabling project approved/under construction, COD ≤ 2032;
          Tier 2 = 2033–35 or indirect mechanism. Use the “Cycle 2 · Tier 1/2” chips to see only these on the map.</span>
        ${(data.candidates||[]).slice().sort((a,b)=>a.tier-b.tier||(a.cod||9999)-(b.cod||9999)).map(candRow)}
        <span class="note" style=${{display:'block',marginTop:8}}>${data.analysis_method||''}</span>

        <div class="bsect" style=${{marginTop:16}}>Node by node — why here?</div>
        <span class="note">Curated from BBPlG/NEP project documentation where possible; 50Hertz nodes without a documented driver get a queue-derived summary. Interpretations, not TSO statements.</span>
        ${filters}
        ${list}
        </div>`}

        <span class="note" style=${{display:'block',margin:'14px 0 4px'}}>Sources: four-TSO concept V1.00 (netztransparenz.de, 05.02.2026); Amprion map (04.2026); TransnetBW map tooltips (04.2026); TenneT coordinate table (04.2026); 50Hertz Netzkapazität map feed (31.03.2026). Non-binding TSO first assessments; Amprion/TransnetBW coordinates approximate. As of ${data.meta.as_of}.</span>
        </div>`}
      </div>
    </aside>
  </div></div>`;
}

export {BANDL,Reform,ReformCycleStrip,ReformHzQueue,ReformQueueChart,ReformScoreBar,SemanticsBar,TSOC,autoWhy,candPopup,fmtMW,reformPopup,tsoProjPopup};
