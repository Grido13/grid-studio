import {createPortal,h,useCallback,useEffect,useMemo,useRef,useState} from './core.js';
import {tr} from './i18n.js';
import {GW,MW,P} from './format.js';
import {useMap} from './mapcore.js';
import {bn,j} from './api.js';
import {Night} from './home.js';
import {EURc,FEEDIN_BANDS} from './bess.js';
import {C30,Grid,VCOL} from './gridtab.js';
import {muniFmt} from './regional.js';
import {Reform,TSOC} from './reform.js';

/* ── Analysis: system-wide firm connection vs FCA, every 110 kV bus ──
   For each DSO-level bus we run the 1-year BESS dispatch under a firm connection
   (no ramp limit, full market access) and under the SH Netz HV FCA (6%/min gradient,
   FCR forbidden, aFRR ≤30%) for band variants V1/V2/V3, and colour the node by how
   much annual revenue the FCA leaves behind: green = small loss, red = large. */
const FCA_GREEN='#34c759', FCA_YEL='#ffcc00', FCA_RED='#ff3b30';
// drop% = firm→FCA revenue lost. The FCR ban + aFRR cap impose the same loss floor at
// every bus; the location-specific part is feed-in curtailment. So the colour ramp is
// scaled to each scenario's own [lo,hi] spread — green = least lost here, red = most.
const _hx=c=>[parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)];
const _mix=(c1,c2,t)=>{const a=_hx(c1),b=_hx(c2);t=Math.max(0,Math.min(1,t));
  return 'rgb('+a.map((v,i)=>Math.round(v+(b[i]-v)*t)).join(',')+')'};
const fcaColor=(drop,lo,hi)=>{const mid=(lo+hi)/2;
  return drop<=mid?_mix(FCA_GREEN,FCA_YEL,(drop-lo)/(mid-lo||1))
                  :_mix(FCA_YEL,FCA_RED,(drop-mid)/(hi-mid||1))};
const fcaBin=(drop,lo,hi)=>{const t=(hi-lo)/3;return drop<=lo+t?'green':drop>=lo+2*t?'red':'yellow'};
const _pct=(arr,p)=>arr[Math.min(arr.length-1,Math.max(0,Math.round(p/100*(arr.length-1))))];
// capacity-factor colour ramp for the weather-zone layers (light → strong)
const cfColor=(cf,mn,mx,kind)=>{const t=Math.max(0,Math.min(1,(cf-mn)/((mx-mn)||1)));
  return kind==='wind'?_mix('#e6eefb','#0a3d7a',t):_mix('#fdf0d0','#b35400',t)};

const GWMW=mw=>mw>=950?(mw/1000).toFixed(1)+' GW':(mw|0)+' MW';
/* Per-bus FCA matrix popup: band variants V1–V3 (rows) × night cap off/on (columns),
   left table WITHOUT the ancillary cap & ramp rate, right table WITH them
   (FCR banned, aFRR ≤30 % of rated power, 6 %/min active-power gradient). */
const dropColor=(drop,lo,hi)=>_mix('#1d1d1f','#ff3b30',Math.max(0,Math.min(1,(drop-lo)/((hi-lo)||1))));
const FcaMatrixTable=({title,sub,cells,lo,hi})=>h`<div class="fmx-t">
  <div class="tt">${title}</div><div class="ts">${sub}</div>
  <table><thead><tr><th></th><th>${tr("No night cap")}</th><th>${tr("Night cap")}</th></tr></thead>
  <tbody>${[1,2,3].map(v=>{const r=cells['v'+v];return h`<tr key=${v}>
    <td class="vn">Variant ${v}</td>
    ${['no_night','night'].map(k=>{const c=r[k],drop=Math.max(0,100-c.ret);return h`<td key=${k} class="big"
      style=${{color:dropColor(drop,lo,hi)}}
      title=${EURc(c.net)+'/yr net · '+c.hrs.toLocaleString()+' h capped by the band'}>−${drop.toFixed(1)}%</td>`})}
  </tr>`})}</tbody></table></div>`;

const FcaMatrixModal=({mx,onClose})=>{
  useEffect(()=>{const k=e=>{if(e.key==='Escape')onClose();};addEventListener('keydown',k);return()=>removeEventListener('keydown',k);},[]);
  const d=mx.data;
  // colour ramp shared by both tables, scaled to this bus's own spread of drops
  const drops=d?['open','restricted'].flatMap(g=>[1,2,3].flatMap(v=>
    ['no_night','night'].map(k=>Math.max(0,100-d[g]['v'+v][k].ret)))):[0,1];
  const lo=Math.min(...drops), hi=Math.max(...drops);
  return createPortal(h`
    <div class="ymodal" onClick=${onClose}>
      <div class="fmx" onClick=${e=>e.stopPropagation()}>
        <div class="ymhead"><b>${mx.name||bn(mx.bus)} · FCA revenue matrix</b>
          <span>${d?`Bus ${d.bus} · ${d.battery.power_mw|0} MW / ${d.battery.energy_mwh|0} MWh battery · reference plants ≤${d.radius_km|0} km: ${GWMW(d.wind_mw)} wind + ${GWMW(d.pv_mw)} PV`:`Bus ${mx.bus}`}</span>
          <button class="ymx" onClick=${onClose}>×</button></div>
        ${mx.error?h`<p class="note bad">Matrix computation failed — check the backend log.</p>`
        :!d?h`<p class="note"><span class="spinner"></span>Running the 12 one-year dispatches for this bus…</p>`
        :h`<div>
          ${(d.wind_mw===0&&d.pv_mw===0)&&h`<p class="note" style=${{margin:'8px 0 0'}}>No standalone wind unit or
            ground-mounted PV (≥750 kW) within ${d.radius_km|0} km — the rule-based band cannot be constructed here,
            so only the FCR ban and ramp rate cost anything.</p>`}
          <div class="fmx-grid">
            <${FcaMatrixTable} title="Without ancillary cap & ramp rate"
              sub="FCA feed-in / withdrawal band only — full FCR + aFRR business, no ramp limit."
              cells=${d.open} lo=${lo} hi=${hi}/>
            <${FcaMatrixTable} title="With ancillary cap & ramp rate"
              sub="Band plus FCR ban, aFRR ≤ 30 % of rated (not binding at 15 MW bids) and the 6 %/min gradient."
              cells=${d.restricted} lo=${lo} hi=${hi}/>
          </div>
          <p class="bhint" style=${{marginTop:12}}>Each number: annual revenue lost vs a firm connection
            (<b>${EURc(d.baseline.net)}/yr</b>, identical at every bus). Hover a cell for the absolute €/yr.
            “Night cap” = the SH Netz night window (23:00–05:00) is active: withdrawal is fixed at 25 % of rated
            regardless of RE — granted even in Dunkelflaute, but a ceiling on windy nights. Without it the RE
            withdrawal band applies around the clock.</p>
        </div>`}
      </div>
    </div>`,document.body);
};

function Analysis({active,nav}){
  const [ref,mapRef]=useMap(active);
  const [data,setData]=useState(null);
  const [prog,setProg]=useState(null);   // {ready:false,...} or status while running
  const [scn,setScn]=useState(1);        // band variant 1/2/3
  const [sel,setSel]=useState(null);     // clicked bus record
  const [mx,setMx]=useState(null);       // FCA matrix popup {bus,name,data?,error?}
  const [layer,setLayer]=useState('fca'); // 'fca' | 'wind' | 'pv'
  const [wm,setWm]=useState(null);        // per-municipality capacity factors
  const [muniGeo,setMuniGeo]=useState(null);
  const layRef=useRef(null);
  const wzLayRef=useRef(null);
  const wmCurRef=useRef(null);            // current kind+cf for the (stable) tooltips
  const pollRef=useRef(0);

  useEffect(()=>{if(active&&!data)j('/api/bess/scan').then(d=>{
    if(d&&d.ready)setData(d);else setProg(d||{ready:false});});},[active,data]);
  useEffect(()=>{if(active&&layer!=='fca'){
    if(!wm)j('/api/bess/weather_muni').then(setWm).catch(()=>{});
    if(!muniGeo)j('/api/sample/municipalities').then(setMuniGeo).catch(()=>{});
  }},[active,layer,wm,muniGeo]);

  // weather layer: municipality choropleth of the mean wind / PV capacity factor
  // (each municipality inherits its nearest ERA5 cell). Built once, restyled after.
  useEffect(()=>{
    const m=mapRef.current;if(!m)return;
    if(layer==='fca'){if(wzLayRef.current)m.removeLayer(wzLayRef.current);return;}
    if(!wm||!wm[layer]||!muniGeo)return;
    const z=wm[layer];
    wmCurRef.current={kind:layer,z};
    const style=f=>{const cf=z.cf[f.properties.ags];
      return{color:'#fff',weight:.35,
        fillColor:cf!=null?cfColor(cf,z.cf_min,z.cf_max,layer):'#ececec',fillOpacity:.88}};
    if(!wzLayRef.current){
      wzLayRef.current=L.geoJSON(muniGeo,{style,
        onEachFeature:(f,lyr)=>{const p=f.properties;
          lyr.bindTooltip(()=>{
            const cur=wmCurRef.current;if(!cur)return p.name;
            const cf=cur.z.cf[p.ags];
            const inst=cur.kind==='wind'?p.wind:p.solar;
            return `<b>${p.name}</b><br>${cur.kind==='wind'?'Wind':'PV'} capacity factor `+
              (cf!=null?(cf*100).toFixed(1)+'%':'—')+
              (inst>0?`<br>${muniFmt(inst)} ${cur.kind==='wind'?'wind':'PV'} installed`:'');
          },{sticky:true});}});
    }else wzLayRef.current.setStyle(style);
    if(!m.hasLayer(wzLayRef.current))m.addLayer(wzLayRef.current);
  },[wm,muniGeo,layer,mapRef.current]);

  // click a bus → rail summary + matrix popup (12 dispatches computed on demand)
  const openMatrix=useCallback(b=>{
    setSel(b);setMx({bus:b.bus,name:b.name});
    j('/api/bess/fca_matrix/'+b.bus)
      .then(d=>setMx(m=>m&&m.bus===b.bus?{...m,data:d}:m))
      .catch(()=>setMx(m=>m&&m.bus===b.bus?{...m,error:true}:m));
  },[]);

  const runScan=useCallback(()=>{
    setProg(p=>({...(p||{}),running:true,done:0,total:0}));
    fetch('/api/bess/scan/run',{method:'POST'}).then(()=>{
      const tick=()=>{pollRef.current++;j('/api/bess/scan/status').then(s=>{
        setProg(s);
        if(s.running)setTimeout(tick,1500);
        else j('/api/bess/scan').then(d=>{if(d&&d.ready)setData(d);else setProg(d)});});};
      tick();});
  },[]);

  // per-scenario stats + worst-hit list
  const stats=useMemo(()=>{
    if(!data)return null;
    const k='v'+scn;
    const rows=data.buses.map(b=>({...b,d:-b[k].pct})).sort((a,b)=>b.d-a.d);
    const asc=rows.map(r=>r.d).slice().reverse();   // ascending drops
    const lo=_pct(asc,2), hi=Math.max(_pct(asc,98),lo+2);   // scenario-adaptive ramp
    const bins={green:0,yellow:0,red:0};
    rows.forEach(r=>bins[fcaBin(r.d,lo,hi)]++);
    const med=asc[Math.floor(asc.length/2)];
    const t=(hi-lo)/3;
    return {rows,bins,med,lo,hi,t1:lo+t,t2:lo+2*t,worst:rows.slice(0,12),
      meanDelta:data.buses.reduce((a,b)=>a+b[k].delta,0)/data.buses.length};
  },[data,scn]);

  // draw the coloured FCA node layer
  useEffect(()=>{
    const m=mapRef.current;if(!m)return;
    if(!layRef.current)layRef.current=L.layerGroup().addTo(m);
    const lay=layRef.current;lay.clearLayers();
    if(layer!=='fca'||!data||!stats)return;
    const k='v'+scn, {lo,hi}=stats;
    for(const b of data.buses){
      const drop=-b[k].pct, col=fcaColor(drop,lo,hi);
      lay.addLayer(L.circleMarker([b.lat,b.lon],{radius:3.4,color:'rgba(0,0,0,.22)',
        weight:.5,fillColor:col,fillOpacity:.9})
        .bindTooltip(()=>`<b>${b.name||bn(b.bus)}</b><br>Bus ${b.bus} · loses ${drop.toFixed(1)}% (${EURc(b[k].delta)}/yr)<br>${b[k].hrs.toLocaleString()} curtailed hours · ${(b.wind_mw/1000).toFixed(1)} GW wind ≤25 km`,{sticky:true})
        .on('click',()=>openMatrix(b)));
    }
  },[data,scn,stats,layer,mapRef.current]);

  const baseNet=data&&data.baseline.net;
  const selK=sel&&sel['v'+scn];
  const band=FEEDIN_BANDS[scn];
  return h`<div class="view" style=${{display:active?'block':'none'}}><div class="maplay">
    <div class="map" ref=${ref}></div>
    <aside class="rail">${nav}<header><h2>${tr("Connection economics")}</h2>
      <p>Firm grid connection vs. a Schleswig-Holstein Netz HV Flexible Connection Agreement,
        for a ${data?`${data.battery.power_mw|0} MW / ${data.battery.energy_mwh|0} MWh`:'100 MW / 400 MWh'} battery under a${' '}
        <b>2027 market case</b>, at <b>every 110 kV bus</b>. Each node is coloured by the share of annual revenue the FCA gives up.</p></header>
      <div class="scroller">
      <div class="sect">${tr("Map layer")}</div>
      <div class="chips">
        <span class=${'chip'+(layer==='fca'?' on':'')} onClick=${()=>setLayer('fca')}>FCA revenue loss</span>
        <span class=${'chip'+(layer==='wind'?' on':'')} onClick=${()=>setLayer('wind')}>Wind zones</span>
        <span class=${'chip'+(layer==='pv'?' on':'')} onClick=${()=>setLayer('pv')}>PV zones</span>
      </div>
      ${layer!=='fca'?h`<div>
        <div class="sect">${layer==='wind'?'Wind':'Solar PV'} resource · by municipality</div>
        ${!(wm&&wm[layer]&&muniGeo)?h`<p class="note"><span class="spinner"></span>Loading ~11k municipalities…</p>`:h`<div>
          <p class="bhint">Mean annual capacity factor per municipality — each of the ${wm[layer].n_munis.toLocaleString()}${' '}
            municipalities inherits its nearest ${wm[layer].source==='ERA5'?'ERA5 reanalysis cell (real per-region hourly weather; the FCA & BESS analysis runs on these profiles)':'weather sample'}.
            Hover any municipality for its value and installed ${layer==='wind'?'wind':'PV'} capacity.</p>
          <div class="fcaleg"><div class="fcaleg-bar" style=${{background:`linear-gradient(90deg,${cfColor(wm[layer].cf_min,wm[layer].cf_min,wm[layer].cf_max,layer)},${cfColor(wm[layer].cf_max,wm[layer].cf_min,wm[layer].cf_max,layer)})`}}></div>
            <div class="fcaleg-tx"><span>${(wm[layer].cf_min*100).toFixed(0)}% CF</span><span>${(wm[layer].cf_max*100).toFixed(0)}% CF</span></div></div>
          <p class="note" style=${{marginTop:10}}>${layer==='wind'?'Windier coastal/northern municipalities cross the FCA feed-in knee far more often, so batteries there lose more to curtailment.':'Sunnier southern municipalities drive more midday PV feed-in, curtailing discharge there.'}</p>
        </div>`}
      </div>`:(!data?h`<div class="fcarun">
        <p class="note">${prog&&prog.running
          ?`Running the 1-year dispatch for all 110 kV buses… ${prog.done||0}${prog.total?` / ${prog.total}`:''}`
          :'No scan computed yet for this battery configuration.'}</p>
        ${prog&&prog.running&&prog.total?h`<div class="fcabar"><span style=${{width:(100*(prog.done||0)/prog.total)+'%'}}></span></div>`:null}
        ${prog&&prog.error?h`<p class="note bad">Scan failed: ${prog.error}</p>`:null}
        <button class="brun" onClick=${runScan} disabled=${prog&&prog.running}>
          ${prog&&prog.running?'Computing…':'Run system-wide analysis ▸'}</button>
        <p class="bhint" style=${{marginTop:10}}>2027 case: DA+ID arbitrage plus market-sized reserve bids
          (5 MW FCR, 15 MW aFRR each way) at saturation-adjusted prices (FCR −50 %, aFRR −40 % vs 2025).
          ~2 min for ${'≈6,400'} buses.</p>
      </div>`:h`<div>
        <div class="sect">${tr("Band scenario")}</div>
        <div class="chips">${[1,2,3].map(v=>h`<span key=${v} class=${'chip'+(scn===v?' on':'')}
          onClick=${()=>{setScn(v);setSel(null)}}>V${v}</span>`)}</div>
        <p class="bhint">Full feed-in until nearby wind/PV reaches <b>${band[0]}%</b> of rated, derated to 0
          at <b>${band[1]}%</b>${scn===1?' (V1 = current SH Netz spec)':' — earlier curtailment for high-RE grids'}.
          FCR ban + aFRR cap cost the same everywhere; the map shows where <i>feed-in curtailment</i> bites.</p>

        <div class="sect">${tr("Revenue lost to the FCA · firm → FCA")}</div>
        <div class="fcaleg"><div class="fcaleg-bar"></div>
          <div class="fcaleg-tx"><span>${stats.lo.toFixed(0)}% lost</span><span>${stats.hi.toFixed(0)}% lost</span></div></div>
        <div class="chips" style=${{marginTop:6}}>
          <span class="chip"><span class="sw" style=${{background:FCA_GREEN}}></span>${stats.bins.green.toLocaleString()} small ≤${stats.t1.toFixed(0)}%</span>
          <span class="chip"><span class="sw" style=${{background:FCA_YEL}}></span>${stats.bins.yellow.toLocaleString()} mid</span>
          <span class="chip"><span class="sw" style=${{background:FCA_RED}}></span>${stats.bins.red.toLocaleString()} large ≥${stats.t2.toFixed(0)}%</span>
        </div>

        <div class="sect">${tr("Reference economics")}</div>
        <div class="kpis">
          <div class="kpi"><div class="v">${EURc(baseNet)}</div><div class="k">${tr("Firm net €/yr")}</div></div>
          <div class="kpi"><div class="v">${EURc(data.baseline.per_mw)}</div><div class="k">${tr("per MW firm")}</div></div>
          <div class="kpi"><div class="v">${stats.med.toFixed(0)}%</div><div class="k">${tr("Median FCA loss")}</div></div>
        </div>
        <p class="note">${tr("2027 market case (Aurora / Modo / Rabobank outlooks): 2025 hourly price shapes with\n          reserve prices scaled for saturation — the firm stack is ≈72 % wholesale trading, 26 % aFRR\n          (15 MW each way), 3 % FCR (5 MW). The FCA's aFRR cap (≤30 % of rated) doesn't bind these bids,\n          so its ancillary cost is the FCR ban; the band and night cap hit the trading share.")}</p>

        ${selK?h`<div class="sect">${tr("Selected ·")} ${sel.name||bn(sel.bus)}</div>
          <div class="panel">
            <div class="note">Bus ${sel.bus} · ${(sel.wind_mw/1000).toFixed(1)} GW wind · ${(sel.pv_mw/1000).toFixed(1)} GW PV ≤25 km</div>
            <table><tbody>
              <tr><td>Firm net</td><td>${EURc(baseNet)}</td></tr>
              <tr><td>FCA net (V${scn})</td><td>${EURc(selK.net)}</td></tr>
              <tr><td>Difference</td><td class=${selK.delta<0?'bad':'good'}>${EURc(selK.delta)} (${selK.pct.toFixed(1)}%)</td></tr>
              <tr><td>Revenue retained</td><td>${selK.ret.toFixed(1)}%</td></tr>
              <tr><td>Curtailed hours</td><td>${selK.hrs.toLocaleString()} h</td></tr>
            </tbody></table></div>`
          :h`<p class="note" style=${{marginTop:14}}>Click any node for its variant × night-cap revenue matrix.</p>`}

        <div class="sect">${tr("Hardest-hit buses · V")}${scn}</div>
        <table><thead><tr><th>${tr("Substation")}</th><th>${tr("loss")}</th><th>${tr("Δ €/yr")}</th><th>${tr("curt h")}</th></tr></thead>
          <tbody>${stats.worst.map(b=>h`<tr key=${b.bus} style=${{cursor:'pointer'}} onClick=${()=>openMatrix(b)}>
            <td>${(b.name||bn(b.bus)).slice(0,22)}</td>
            <td class="bad">${b.d.toFixed(0)}%</td>
            <td class="bad">${EURc(b['v'+scn].delta)}</td>
            <td>${b['v'+scn].hrs.toLocaleString()}</td></tr>`)}</tbody></table>
        <p class="bhint" style=${{marginTop:12}}>Generated ${data.generated?data.generated.slice(0,10):''} ·
          ${data.n_buses.toLocaleString()} buses · RE catchment ${data.radius_km|0} km.
          <span role="link" tabIndex=${0} class="fcalink" onClick=${runScan}>Re-run</span></p>
      </div>`)}
      </div>
    </aside>
    ${mx&&h`<${FcaMatrixModal} mx=${mx} onClose=${()=>setMx(null)}/>`}
  </div></div>`;
}

/* ── Greenfield siting: where can new capacity actually connect? ──
   Per bus, the year's spare thermal line capacity after redispatch
   (spare = s_nom − p95(|flow_post|), /api/sample/headroom), overlaid with the
   Reifegradverfahren connection points (published EHV availability) and — for
   horizon years — the committed new substations. */
const spareColor=(v,cap)=>_mix('#ff3b30','#34c759',Math.max(0,Math.min(1,v/(cap||1))));
function Greenfield({active,nav,years}){
  const [ref,mapRef]=useMap(active);
  const [yr,setYr]=useState(2025);
  const [data,setData]=useState(null);
  const dataRef=useRef({});
  const [busy,setBusy]=useState(false);
  const [vsel,setVsel]=useState(new Set([110,220,380]));
  const [metric,setMetric]=useState('sum');       // 'sum' meshed · 'min' firm
  const [minMW,setMinMW]=useState(0);
  const [ovr,setOvr]=useState({reform:true,newsub:true});
  const [reform,setReform]=useState(null);
  const [novl,setNovl]=useState({});
  const [sel,setSel]=useState(null);
  const layRef=useRef({});
  const gfYears=years.filter(y=>y===2025||y===2030);   // greenfield horizons: today + 2030 build-out
  useEffect(()=>{if(!active)return;
    if(dataRef.current[yr]){setData(dataRef.current[yr]);return}
    setBusy(true);setData(null);
    j('/api/sample/headroom?year='+yr)
      .then(d=>{dataRef.current[yr]=d;setData(d);setBusy(false)})
      .catch(()=>setBusy(false));
  },[active,yr]);
  useEffect(()=>{if(active&&!reform)j('/api/reform').then(d=>setReform(d&&d.substations?d:null)).catch(()=>{})},[active,reform]);
  useEffect(()=>{if(active&&yr!==2025&&!novl[yr])
    j('/api/investments/grid/'+yr).then(d=>setNovl(o=>({...o,[yr]:d}))).catch(()=>{})},[active,yr,novl]);
  const key=metric==='sum'?'spare_sum_MW':'spare_min_MW';
  const rows=useMemo(()=>!data?[]:data.buses.filter(b=>vsel.has(b.v)&&b[key]>=minMW),[data,vsel,key,minMW]);
  const cap=useMemo(()=>{      // colour ramp capped at the shown buses' p90
    if(!rows.length)return 1;
    const vs=rows.map(b=>b[key]).sort((a,b)=>a-b);
    return Math.max(vs[Math.floor(vs.length*0.9)]||1,1);
  },[rows,key]);
  useEffect(()=>{
    const m=mapRef.current;if(!m)return;
    const R=layRef.current;
    for(const k of ['bus','reform','newsub']){if(!R[k])R[k]=L.layerGroup().addTo(m);R[k].clearLayers();}
    for(const b of rows){
      R.bus.addLayer(L.circleMarker([b.lat,b.lon],{
        radius:b.v>=380?4.6:b.v>=220?3.8:2.6,
        color:'rgba(0,0,0,.2)',weight:.4,fillColor:spareColor(b[key],cap),fillOpacity:.85})
       .bindTooltip(()=>`<b>${b.name||bn(b.bus)}</b><br>${b.v} kV · spare ${P(b[key])} `+
         `(${metric==='sum'?'all lines':'weakest line'})`+
         (b.ovl_h>0?`<br><span style="color:#ff3b30">congested ${b.ovl_h} h/yr</span>`:''),{sticky:true})
       .on('click',()=>setSel(b)));
    }
    if(ovr.reform&&reform)for(const s of reform.substations){
      const avail=s.q?s.q.avail_gen:(s.feedin?s.feedin[1]:null);
      R.reform.addLayer(L.circleMarker([s.lat,s.lon],{
        radius:8,color:TSOC[s.tso]||'#0066cc',weight:1.8,fillColor:'#fff',fillOpacity:.1,
        dashArray:(s.restriction&&s.restriction!=='No free switch bay')?'3 2':null})
       .bindTooltip(()=>`<b>${s.name}</b> · ${s.tso} — Reifegradverfahren point`+
         `<br>${avail!=null?'available ≈ '+MW(avail):'no MW published'}${s.year?' · from '+s.year:''}`+
         (s.restriction?`<br><span style="color:#ff3b30">${s.restriction}</span>`:''),{sticky:true}));
    }
    const nv=yr!==2025?novl[yr]:null;
    if(ovr.newsub&&nv)for(const b of nv.new_buses){
      R.newsub.addLayer(L.circleMarker([b.lat,b.lon],{
        radius:6,color:C30,weight:2,fillColor:'#fff',fillOpacity:.92})
       .bindTooltip(`<b>${b.name}</b><br>NEW substation · ${b.kv} kV · ~${b.cod}`,{sticky:true}));
    }
  },[rows,cap,key,metric,ovr,reform,novl,yr,mapRef.current]);
  const vtoggle=v=>setVsel(s=>{const x=new Set(s);x.has(v)?x.delete(v):x.add(v);return x});
  const top=useMemo(()=>rows.slice().sort((a,b)=>b[key]-a[key]).slice(0,14),[rows,key]);
  return h`<div class="view" style=${{display:active?'block':'none'}}><div class="maplay">
    <div class="map" ref=${ref}></div>
    <aside class="rail">${nav}<header><h2>${tr("Greenfield siting")}</h2>
      <p>Where new generation, storage or load can still plug in: every substation coloured by the
        spare thermal capacity of its lines over the full simulated year, beside the TSOs' published
        connection points and the committed build-out.</p></header>
      <div class="scroller">
        <div class="sect">${tr("Grid year")}</div>
        <div class="chips">${gfYears.map(y=>h`<span key=${y} class=${'chip'+(yr===y?' on':'')}
          onClick=${()=>{setYr(y);setSel(null)}}>${y===2025?'2025 · today':y+' · committed build-out'}</span>`)}</div>
        ${busy&&h`<p class="note"><span class="spinner"></span>Computing spare capacity for ${yr} —
          the first run streams the full year of line flows (can take a minute)…</p>`}
        <div class="sect">${tr("Voltage level")}</div>
        <div class="chips">${[110,220,380].map(v=>h`
          <span class=${'chip'+(vsel.has(v)?' on':'')} key=${v} onClick=${()=>vtoggle(v)}>
            <span class="sw" style=${{background:VCOL[v]}}></span>${v} kV</span>`)}</div>
        <div class="sect">${tr("Spare capacity measure")}</div>
        <div class="chips">
          <span class=${'chip'+(metric==='sum'?' on':'')} title="Sum of spare across every connected line — realistic for a meshed node" onClick=${()=>setMetric('sum')}>Meshed · all lines</span>
          <span class=${'chip'+(metric==='min'?' on':'')} title="The weakest connected line's spare — the conservative firm view" onClick=${()=>setMetric('min')}>Firm · weakest line</span>
        </div>
        <div class="chips">${[[0,'All'],[100,'≥ 100 MW'],[250,'≥ 250 MW'],[500,'≥ 500 MW']].map(([v,l])=>h`
          <span key=${v} class=${'chip'+(minMW===v?' on':'')} onClick=${()=>setMinMW(v)}>${l}</span>`)}</div>
        <div class="fcaleg" style=${{marginTop:8}}>
          <div class="fcaleg-bar" style=${{background:`linear-gradient(90deg,${spareColor(0,1)},${spareColor(.5,1)},${spareColor(1,1)})`}}></div>
          <div class="fcaleg-tx"><span>0 MW spare</span><span>≥ ${P(cap)}</span></div></div>
        <div class="sect">${tr("Overlays")}</div>
        <div class="chips">
          <span class=${'chip'+(ovr.reform?' on':'')} title="Reifegradverfahren cycle-1 connection points (rings, TSO colour; dashed = hard restriction)"
            onClick=${()=>setOvr(o=>({...o,reform:!o.reform}))}>Reform connection points</span>
          ${yr!==2025&&h`<span class=${'chip'+(ovr.newsub?' on':'')} title=${'Committed new substations in service by '+yr}
            onClick=${()=>setOvr(o=>({...o,newsub:!o.newsub}))}>
            <span class="sw" style=${{background:C30}}></span>New substations ${yr}</span>`}
        </div>
        ${yr!==2025&&novl[yr]&&h`<p class="note">${novl[yr].meta.new_buses} committed new substations
          by ${yr} (white rings, orange) — greenfield sites with no queue history yet.</p>`}
        <div class="sect">${tr("Selected")}</div>
        ${sel?h`<div class="panel">
          <b style=${{fontFamily:'var(--disp)',fontSize:13}}>${sel.name||bn(sel.bus)}</b>
          <div class="note">Bus ${sel.bus} · ${sel.v} kV · ${sel.n_lines} line${sel.n_lines===1?'':'s'}</div>
          <table><tbody>
            <tr><td>spare · all lines</td><td>${P(sel.spare_sum_MW)}</td></tr>
            <tr><td>spare · weakest line</td><td>${P(sel.spare_min_MW)}</td></tr>
            <tr><td>worst line p95 loading</td><td class=${sel.p95_loading>0.9?'bad':''}>${Math.round(sel.p95_loading*100)}%</td></tr>
            <tr><td>congested hours (worst line)</td><td class=${sel.ovl_h>0?'bad':'good'}>${sel.ovl_h} h/yr</td></tr>
          </tbody></table>
        </div>`:h`<div class="panel"><span class="note">Click a substation on the map for its numbers.</span></div>`}
        <div class="sect">${tr("Most connectable ·")} ${metric==='sum'?'meshed':'firm'}</div>
        <table><thead><tr><th>${tr("substation")}</th><th>${tr("kV")}</th><th>${tr("spare")}</th></tr></thead><tbody>
          ${top.map(b=>h`<tr key=${b.bus} style=${{cursor:'pointer'}}
            onClick=${()=>{setSel(b);mapRef.current&&mapRef.current.setView([b.lat,b.lon],9,{animate:true})}}>
            <td>${(b.name||bn(b.bus)).slice(0,24)}</td><td>${b.v}</td>
            <td class="good">${(b[key]/1000).toFixed(1)} GW</td></tr>`)}
        </tbody></table>
        <p class="note" style=${{marginTop:10}}>Method: spare = line rating − 95th percentile of the
          line's |flow| after redispatch, over all 8,760 hours${yr!==2025?` of the NEP-scaled ${yr} run (grid incl. committed build-out)`:''}.
          Line-based screening — transformers, protection and short-circuit limits are not netted;
          use it to shortlist, not to size a connection.</p>
      </div>
    </aside>
  </div></div>`;
}
/* ── BESS siting: where would a standard grid-booster beat redispatch / Netzausbau?
   Per bus, the year's PRE-redispatch overloads on its incident lines are
   counter-dispatched by a standard BESS (50 MW/200 MWh at 110 kV, 250 MW/1 GWh
   at 380 kV; 220 kV has no standard product) — /api/bess/siting. Nodes carry
   the regulatory triad: netzdienlich / netzneutral / marktdienlich. */
const SIT_COL={supportive:'#34c759',neutral:'#ff9500',market:'#8e8e93'};
const SIT_LBL={supportive:'Grid-supportive · netzdienlich',neutral:'Grid-neutral · netzneutral',market:'Market-based · marktdienlich'};
const SIT_DEF={supportive:'the standard BESS relieves most of the local overload energy — a real alternative to redispatch or grid expansion at this node',
  neutral:'congested, but the standard BESS only partly relieves it — operate in the market under grid constraints',
  market:'no congested line at the node — pure arbitrage site, no grid value'};
function BessSiting({active,nav,years}){
  const [ref,mapRef]=useMap(active);
  const [yr,setYr]=useState(2025);              // scenario year | 'all'
  const dataRef=useRef({});
  const [loaded,setLoaded]=useState(0);         // bumped when a year's payload arrives
  const [busy,setBusy]=useState(false);
  const [vsel,setVsel]=useState(new Set([110,380]));
  const [csel,setCsel]=useState(new Set(['supportive','neutral','market']));
  const [sel,setSel]=useState(null);
  const layRef=useRef({});
  useEffect(()=>{if(!active)return;
    const need=(yr==='all'?years:[yr]).filter(y=>!dataRef.current[y]);
    if(!need.length){setBusy(false);return}
    setBusy(true);
    Promise.all(need.map(y=>j('/api/bess/siting?year='+y).then(d=>{dataRef.current[y]=d})))
      .then(()=>{setBusy(false);setLoaded(n=>n+1)})
      .catch(()=>setBusy(false));
  },[active,yr]);
  const rows=useMemo(()=>{
    const D=dataRef.current;
    if(yr!=='all')return D[yr]?D[yr].buses:[];
    if(years.some(y=>!D[y]))return[];
    const by={};                                // persistence across all scenario years
    for(const y of years)for(const b of D[y].buses){
      let r=by[b.bus];
      if(!r)r=by[b.bus]={per:{},supN:0,rel_sum:0,best:b};
      r.per[y]=b.cls;
      if(b.cls==='supportive')r.supN++;
      r.rel_sum+=b.rel_mwh;
      if(b.rel_mwh>r.best.rel_mwh)r.best=b;
    }
    return Object.values(by).map(r=>({...r.best,per:r.per,supN:r.supN,rel_sum:r.rel_sum,
      cls:r.supN>0?'supportive':Object.values(r.per).includes('neutral')?'neutral':'market'}));
  },[yr,loaded,years]);
  const counts=useMemo(()=>{const c={supportive:0,neutral:0,market:0};
    for(const b of rows)if(vsel.has(b.v))c[b.cls]++;return c;},[rows,vsel]);
  const shown=useMemo(()=>rows.filter(b=>vsel.has(b.v)&&csel.has(b.cls)),[rows,vsel,csel]);
  useEffect(()=>{
    const m=mapRef.current;if(!m)return;
    const R=layRef.current;                     // draw order: market under neutral under supportive
    for(const k of ['market','neutral','supportive']){if(!R[k])R[k]=L.layerGroup().addTo(m);R[k].clearLayers();}
    const all=yr==='all',nY=years.length;
    for(const b of shown){
      const ring=all&&b.supN===nY;              // supportive in every scenario year
      R[b.cls].addLayer(L.circleMarker([b.lat,b.lon],{
        radius:b.cls==='market'?2:b.cls==='neutral'?(b.v>=380?3.6:2.6):(b.v>=380?4.8:3.4),
        color:ring?'#1d1d1f':'rgba(0,0,0,.2)',weight:ring?1.3:.4,
        fillColor:SIT_COL[b.cls],
        fillOpacity:b.cls==='market'?.3:(all?.45+.5*(b.supN/nY):.88)})
       .bindTooltip(()=>`<b>${b.name||bn(b.bus)}</b><br>${b.v} kV · ${SIT_LBL[b.cls]}`+
         `<br>standard BESS ${b.p_mw} MW / ${b.e_mwh} MWh`+
         (b.cls!=='market'?`<br>relieves ${Math.round(b.rel_frac*100)}% of ${Math.round(b.ovl_mwh).toLocaleString('en-US')} MWh overload · ${Math.round(b.ovl_h)} → ${Math.round(b.ovl_h_res)} h/yr`:'')+
         (all?`<br><span style="color:var(--ink2)">${years.map(y=>y+' '+((b.per[y]||'—').slice(0,10))).join(' · ')}</span>`:''),{sticky:true})
       .on('click',()=>setSel(b)));
    }
  },[shown,yr,mapRef.current]);
  const vtoggle=v=>setVsel(s=>{const x=new Set(s);x.has(v)?x.delete(v):x.add(v);return x});
  const ctoggle=c=>setCsel(s=>{const x=new Set(s);x.has(c)?x.delete(c):x.add(c);return x});
  const top=useMemo(()=>rows.filter(b=>b.cls==='supportive'&&vsel.has(b.v)).slice()
    .sort((a,b)=>yr==='all'?(b.supN-a.supN||b.rel_sum-a.rel_sum):(b.rel_mwh-a.rel_mwh))
    .slice(0,14),[rows,vsel,yr]);
  const meta=yr!=='all'?dataRef.current[yr]:null;
  return h`<div class="view" style=${{display:active?'block':'none'}}><div class="maplay">
    <div class="map" ref=${ref}></div>
    <aside class="rail">${nav}<header><h2>${tr("BESS siting")}</h2>
      <p>Where a battery beats redispatch: every node's pre-redispatch overloads,
        counter-dispatched by a standard grid-booster BESS — 50 MW / 200 MWh at 110 kV,
        250 MW / 1 GWh at 380 kV — and classified netzdienlich, netzneutral or marktdienlich.</p></header>
      <div class="scroller">
        <div class="sect">${tr("Grid year")}</div>
        <div class="chips">${years.map(y=>h`<span key=${y} class=${'chip'+(yr===y?' on':'')}
            onClick=${()=>{setYr(y);setSel(null)}}>${y}</span>`)}
          <span class=${'chip'+(yr==='all'?' on':'')} onClick=${()=>{setYr('all');setSel(null)}}>All years</span></div>
        ${busy&&h`<p class="note"><span class="spinner"></span>Screening ${yr==='all'?'all scenario years':yr} —
          the first run streams the year's line flows (can take a minute)…</p>`}
        ${yr==='all'&&!busy&&rows.length>0&&h`<p class="note">Persistence view — a node counts as grid-supportive
          if the standard BESS resolves its congestion in at least one scenario year; a dark ring marks
          nodes supportive in all ${years.length} years, the strongest candidates.</p>`}
        <div class="sect">${tr("Voltage level")}</div>
        <div class="chips">${[110,380].map(v=>h`
          <span class=${'chip'+(vsel.has(v)?' on':'')} key=${v} onClick=${()=>vtoggle(v)}>
            <span class="sw" style=${{background:VCOL[v]}}></span>${v} kV · ${v===110?'50 MW':'250 MW'}</span>`)}</div>
        <p class="note">${tr("220 kV is excluded — no standard BESS product is defined for it.")}</p>
        <div class="sect">${tr("Classification")}</div>
        <div class="chips">${['supportive','neutral','market'].map(c=>h`
          <span key=${c} class=${'chip'+(csel.has(c)?' on':'')} onClick=${()=>ctoggle(c)}>
            <span class="sw" style=${{background:SIT_COL[c]}}></span>${SIT_LBL[c].split(' · ')[0]} · ${counts[c]}</span>`)}</div>
        <div class="panel" style=${{marginTop:8}}>${['supportive','neutral','market'].map(c=>h`
          <div key=${c} class="note" style=${{display:'flex',gap:7,lineHeight:1.5,marginTop:3}}>
            <span style=${{flex:'none',width:9,height:9,borderRadius:5,background:SIT_COL[c],marginTop:3}}></span>
            <span><b style=${{color:'var(--ink)'}}>${SIT_LBL[c]}</b> — ${SIT_DEF[c]}</span></div>`)}</div>
        <div class="sect">${tr("Selected")}</div>
        ${sel?h`<div class="panel">
          <b style=${{fontFamily:'var(--disp)',fontSize:13}}>${sel.name||bn(sel.bus)}</b>
          <div class="note">Bus ${sel.bus} · ${sel.v} kV · ${SIT_LBL[sel.cls]}</div>
          <table><tbody>
            <tr><td>standard BESS</td><td>${sel.p_mw} MW / ${sel.e_mwh} MWh</td></tr>
            <tr><td>congested incident lines</td><td>${sel.n_ovl_lines}</td></tr>
            <tr><td>local overload energy</td><td>${Math.round(sel.ovl_mwh).toLocaleString('en-US')} MWh/yr</td></tr>
            <tr><td>relieved by the BESS</td><td class=${sel.rel_frac>=0.7?'good':''}>${Math.round(sel.rel_mwh).toLocaleString('en-US')} MWh · ${Math.round(sel.rel_frac*100)}%</td></tr>
            <tr><td>overload hours</td><td>${Math.round(sel.ovl_h)} → <span class=${sel.ovl_h_res>0?'bad':'good'}>${Math.round(sel.ovl_h_res)}</span> h/yr</td></tr>
            <tr><td>peak excess vs. rating</td><td class=${sel.peak_ex_mw>sel.p_mw?'bad':''}>${Math.round(sel.peak_ex_mw)} MW vs ${sel.p_mw} MW</td></tr>
            <tr><td>conflicting hours</td><td>${Math.round(sel.conflict_h)} h/yr</td></tr>
            ${yr==='all'&&sel.per&&h`<tr><td>by year</td><td>${years.map(y=>y+' '+((sel.per[y]||'—').slice(0,4))).join(' · ')}</td></tr>`}
          </tbody></table>
        </div>`:h`<div class="panel"><span class="note">Click a node on the map for its numbers.</span></div>`}
        <div class="sect">${tr("Top booster candidates")}${yr!=='all'?' · '+yr:''}</div>
        <table><thead><tr><th>${tr("substation")}</th><th>${tr("kV")}</th><th>${yr==='all'?'years':'relieved'}</th></tr></thead><tbody>
          ${top.map(b=>h`<tr key=${b.bus} style=${{cursor:'pointer'}}
            onClick=${()=>{setSel(b);mapRef.current&&mapRef.current.setView([b.lat,b.lon],9,{animate:true})}}>
            <td>${(b.name||bn(b.bus)).slice(0,24)}</td><td>${b.v}</td>
            <td class="good">${yr==='all'?b.supN+'/'+years.length+' · '+(b.rel_sum/1000).toFixed(1)+' GWh':(b.rel_mwh/1000).toFixed(1)+' GWh'}</td></tr>`)}
        </tbody></table>
        ${!top.length&&!busy&&h`<p class="note">${tr("No grid-supportive nodes under the current filters.")}</p>`}
        <p class="note" style=${{marginTop:10}}>Method: pre-redispatch (day-ahead) hourly flows of the
          full simulated year. The BESS charges against export overloads and discharges against import
          overloads on the node's own lines, greedy hourly state-of-charge simulation (90% round-trip,
          back to half-full between episodes). 1 MW at the node is assumed to move the constraining
          line by 1 MW — an upper-bound screening, not a network study. Grid-supportive =
          ≥ 70% of the local overload energy relieved and ≥ 25 congested h/yr.
          ${meta?` This year: ${meta.counts.supportive} supportive · ${meta.counts.neutral} neutral · ${meta.counts.market} market nodes.`:''}</p>
      </div>
    </aside>
  </div></div>`;
}
function AnalysisPage({active,years}){
  const [sub,setSub]=useState('fca');
  const nav=h`<div class="subnav">
    ${[['fca','Connection economics'],['green','Greenfield siting'],['bess','BESS siting']].map(([id,l])=>h`
      <button key=${id} class=${sub===id?'on':''} onClick=${()=>setSub(id)}>${tr(l)}</button>`)}
  </div>`;
  return h`<div>
    <${Analysis} active=${active&&sub==='fca'} nav=${nav}/>
    <${Greenfield} active=${active&&sub==='green'} nav=${nav} years=${years}/>
    <${BessSiting} active=${active&&sub==='bess'} nav=${nav} years=${years}/>
  </div>`;
}

export {Analysis,AnalysisPage,BessSiting,FCA_GREEN,FCA_RED,FCA_YEL,FcaMatrixModal,FcaMatrixTable,GWMW,Greenfield,SIT_COL,SIT_DEF,SIT_LBL,_hx,_mix,_pct,cfColor,dropColor,fcaBin,fcaColor,spareColor};
