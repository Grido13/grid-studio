import {h,useCallback,useEffect,useMemo,useRef,useState} from './core.js';
import {tr} from './i18n.js';
import {MW} from './format.js';
import {useMap} from './mapcore.js';
import {Load} from './loadtab.js';

/* ── Regional scenarios: NEP 2025 forecast choropleth ── */
const scenFmt=v=>{const a=Math.abs(v);const s=v<0?'−':'';return a>=1000?s+(a/1000).toFixed(1)+' GW':s+Math.round(a)+' MW';};
const _sh2r=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const _smix=(a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
const _srgb=a=>`rgb(${a[0]},${a[1]},${a[2]})`;
const _sW=[247,247,247],_sB=[10,10,10];
// light tint → saturated → slightly darkened ramp in the technology's own colour
const tcol=(t,hex)=>{const base=_sh2r(hex||'#888888');t=Math.max(0,Math.min(1,t));
  const lo=_smix(_sW,base,.22),hi=_smix(base,_sB,.16);return _srgb(_smix(lo,hi,t));};
// signed change: increases in the tech colour, decreases in cool grey, both light→dark
const dcol=(d,maxAbs,hex)=>d>=0?tcol(d/(maxAbs||1),hex):tcol(-d/(maxAbs||1),'#6b7a90');

/* ── Municipalities: installed RE capacity by technology + load (AGS choropleth) ── */
const MUNI_METRICS=[
  ['renewable','Renewable total','#1b9e3f'],
  ['solar','Solar (PV)','#f5a700'],
  ['wind','Wind','#00a3b4'],
  ['biomass','Biomass','#7cb342'],
  ['hydro','Hydro','#1e88e5'],
  ['storage','Storage','#9c27b0'],
  ['load','Load','#e53935'],
];
const muniFmt=v=>v>=1000?(v/1000).toLocaleString('de-DE',{maximumFractionDigits:2})+' GW'
  :(v>0&&v<10?v.toLocaleString('de-DE',{maximumFractionDigits:1}):Math.round(v).toLocaleString('de-DE'))+' MW';
function Muni({active,nav}){
  const [ref,mapRef]=useMap(active);
  const [data,setData]=useState(null);
  const [err,setErr]=useState(null);
  const [metric,setMetric]=useState('renewable');
  const [info,setInfo]=useState(null);
  const layRef=useRef(null);
  useEffect(()=>{
    if(active&&!data&&!err){
      fetch('/api/sample/municipalities')
        .then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
        .then(d=>{if(!d||!d.features)throw new Error('unexpected payload');setData(d);})
        .catch(e=>setErr(String(e&&e.message||e)));
    }
  },[active,data,err]);
  const mi=MUNI_METRICS.find(m=>m[0]===metric)||MUNI_METRICS[0];
  const color=mi[2];
  // 95th-percentile cap with sqrt scaling, so a few huge municipalities don't wash out the rest
  const cap=useMemo(()=>{
    if(!data)return 1;
    const vs=data.features.map(f=>f.properties[metric]).filter(v=>v>0).sort((a,b)=>a-b);
    return vs.length?(vs[Math.min(vs.length-1,Math.floor(vs.length*0.95))]||1):1;
  },[data,metric]);
  const total=useMemo(()=>data?data.features.reduce((a,f)=>a+(f.properties[metric]||0),0):0,[data,metric]);
  const nNonzero=useMemo(()=>data?data.features.filter(f=>f.properties[metric]>0).length:0,[data,metric]);
  const fill=useCallback(v=>v>0?tcol(Math.sqrt(Math.min(v/cap,1)),color):'#eeeeee',[cap,color]);

  // build the 11k-polygon layer once (canvas via preferCanvas); restyle on metric change
  useEffect(()=>{
    const m=mapRef.current;if(!m||!data||layRef.current)return;
    const tip=p=>`<b>${p.name}</b><br/>Renewable ${muniFmt(p.renewable)} · Load ${muniFmt(p.load)}`;
    layRef.current=L.geoJSON(data,{
      style:f=>({color:'#ffffff',weight:.4,fillColor:fill(f.properties[metric]),fillOpacity:.85}),
      onEachFeature:(f,lyr)=>{const p=f.properties;
        lyr.bindTooltip(()=>tip(p),{sticky:true});
        lyr.on('click',()=>setInfo(p));}
    }).addTo(m);
  },[data,mapRef.current]);
  useEffect(()=>{
    if(layRef.current)layRef.current.setStyle(f=>({color:'#ffffff',weight:.4,fillColor:fill(f.properties[metric]),fillOpacity:.85}));
  },[metric,cap,color,fill]);

  return h`<div class="view" style=${{display:active?'block':'none'}}><div class="maplay">
    <div class="map" ref=${ref}></div>
    <aside class="rail">${nav}<header><h2>${tr("Municipalities")}</h2>
      <p>${tr("Installed capacity (Marktstammdatenregister, in operation) and modelled load across Germany’s ~11,000 municipalities. Pick a layer; click a municipality to inspect it.")}</p></header>
      <div class="scroller">
        ${err?h`<p class="note" style=${{color:'#ff3b30'}}>⚠ Couldn't load municipalities (${err}).<br/>
          Run <code>scripts/pipeline/build_municipality_energy.py</code> and restart the backend.</p>`
         :!data?h`<p class="note">${tr("Loading ~11k municipalities…")}</p>`:''}
        <div class="sect">${tr("Layer")}</div>
        <div class="chips">
          ${MUNI_METRICS.map(([k,lbl,c])=>h`<span key=${k} class=${'chip'+(metric===k?' on':'')} onClick=${()=>setMetric(k)}>
            <span class="sw" style=${{background:c}}></span>${lbl}</span>`)}
        </div>
        ${data&&h`<div class="legend" style=${{marginTop:10,alignItems:'center'}}>
            <span style=${{flex:1,height:10,borderRadius:3,background:`linear-gradient(90deg, ${tcol(0,color)}, ${tcol(.5,color)}, ${tcol(1,color)})`}}></span></div>
          <div class="legend" style=${{justifyContent:'space-between',marginTop:3}}><span>0</span><span>≥ ${muniFmt(cap)}</span></div>
          <p class="note">National ${mi[1].toLowerCase()}: <b>${muniFmt(total)}</b> · present in ${nNonzero.toLocaleString('de-DE')} municipalities.</p>`}
        <div class="sect">${tr("Inspector")}</div>
        ${!info&&h`<div class="panel"><span class="note">Click a municipality on the map to see its full breakdown.</span></div>`}
        ${info&&h`<div class="panel">
          <b style=${{fontFamily:'var(--disp)',fontSize:13}}>${info.name}</b>
          <div class="note" style=${{margin:'2px 0 6px'}}>${info.kind||''} · AGS ${info.ags}</div>
          <table><tbody>
            ${MUNI_METRICS.map(([k,lbl,c])=>h`<tr key=${k}>
              <td><span class="sw" style=${{display:'inline-block',width:8,height:8,borderRadius:'50%',background:c,marginRight:6}}></span>${lbl}</td>
              <td style=${{textAlign:'right',fontWeight:metric===k?700:400}}>${muniFmt(info[k]||0)}</td></tr>`)}
          </tbody></table>
        </div>`}
        <p class="note" style=${{marginTop:10}}>Capacity is summed from the MaStR by municipality key (AGS).
          Load is the model's annual-peak demand attributed to the municipality containing each grid bus —
          so it appears only where the transmission model has a node (~2,800 municipalities).</p>
      </div>
    </aside>
  </div></div>`;
}

function Scenarios({active,nav}){
  const [ref,mapRef]=useMap(active);
  const [data,setData]=useState(null);
  const [terr,setTerr]=useState(null);   // DSO territory polygons (lazy, for By-DSO map)
  const [err,setErr]=useState(null);
  const [level,setLevel]=useState('dso');    // dso | tso (network level)
  const [view,setView]=useState('region');   // region | dso (DSO level only)
  const [mode,setMode]=useState('value');     // value | delta (change between years)
  const [cat,setCat]=useState('re_agg');
  const [dy,setDy]=useState(2045);            // DSO value year
  const [dy0,setDy0]=useState(2030),[dy1,setDy1]=useState(2035);  // DSO change span
  const [scen,setScen]=useState('A');         // TSO scenario
  const [ty,setTy]=useState(2045);            // TSO value year
  const [info,setInfo]=useState(null);        // {kind:'region',region} | {kind:'op',op}
  const layRef=useRef(null);
  useEffect(()=>{
    if(active&&!data&&!err){
      fetch('/api/territories/scenarios')
        .then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
        .then(d=>{if(!d||!d.regions)throw new Error('unexpected payload');setData(d);})
        .catch(e=>setErr(String(e&&e.message||e)));
    }
  },[active,data,err]);
  const eView=level==='tso'?'region':view;   // TSO has no per-DSO breakdown
  useEffect(()=>{
    if(active&&eView==='dso'&&!terr){
      fetch('/api/territories').then(r=>r.json()).then(d=>setTerr(d.dso)).catch(()=>{});
    }
  },[active,eView,terr]);

  const meta=useMemo(()=>data?Object.fromEntries(data.categories.map(c=>[c.key,c])):{},[data]);
  const ci=meta[cat]||{label:cat,color:'#888'};
  const dyears=data?data.years.dso:[2024,2030,2035,2045];
  // read the current selection (level/mode/year/scenario) out of a {cat:{key:val}} dict
  const read=useCallback(vals=>{
    const c=vals&&vals[cat];if(!c)return 0;
    if(level==='dso')return mode==='value'?(c[dy]||0):(c[dy1]||0)-(c[dy0]||0);
    return mode==='value'?(c[scen+'_'+ty]||0):(c[scen+'_2045']||0)-(c[scen+'_2037']||0);
  },[cat,level,mode,dy,dy0,dy1,scen,ty]);
  const lvals=useCallback(f=>level==='dso'?f.properties.dso:f.properties.tso,[level]);
  const opByName=useMemo(()=>data?Object.fromEntries(data.operators.map(o=>[o.operator,o])):{},[data]);
  const oVal=useCallback(o=>read(o&&o.values),[read]);
  const total=useMemo(()=>data?data.regions.features.reduce((a,f)=>a+read(lvals(f)),0):0,[data,read,lvals]);
  const scale=useMemo(()=>{
    if(!data)return 1;
    const vs=eView==='dso'?data.operators.map(oVal):data.regions.features.map(f=>read(lvals(f)));
    return Math.max(1,...vs.map(Math.abs));
  },[data,eView,read,lvals,oVal]);
  const fill=v=>mode==='value'?tcol(v/scale,ci.color):dcol(v,scale,ci.color);
  const opsRanked=useMemo(()=>data?data.operators.map(o=>[o,oVal(o)]).filter(([,v])=>Math.abs(v)>0)
    .sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])):[],[data,oVal]);
  const yrLbl=level==='dso'?(mode==='value'?dy:`${dy0}→${dy1}`):(mode==='value'?`scen ${scen} · ${ty}`:`scen ${scen} · 2037→2045`);

  useEffect(()=>{
    const m=mapRef.current;if(!m||!data)return;
    if(layRef.current){m.removeLayer(layRef.current);layRef.current=null;}
    if(eView==='region'){
      layRef.current=L.geoJSON(data.regions,{
        style:f=>({color:'#fff',weight:1,fillColor:fill(read(lvals(f))),fillOpacity:.85}),
        onEachFeature:(f,lyr)=>{const p=f.properties,v=read(lvals(f));
          lyr.bindTooltip(`<b>${p.region}</b><br/>${ci.label} · ${yrLbl}: ${scenFmt(v)}`,{sticky:true});
          lyr.on('mouseover',()=>lyr.setStyle({weight:2.4,color:'#1a1a1a'}));
          lyr.on('mouseout',()=>lyr.setStyle({weight:1,color:'#fff'}));
          lyr.on('click',()=>setInfo({kind:'region',region:p.region}));}
      }).addTo(m);
    }else if(terr){
      layRef.current=L.geoJSON(terr,{
        style:f=>{const o=opByName[f.properties.operator];
          return o?{color:'#fff',weight:.8,fillColor:fill(read(o.values)),fillOpacity:.88}
                  :{color:'#fff',weight:.8,fillColor:'#dcdcdc',fillOpacity:.4};},
        onEachFeature:(f,lyr)=>{const name=f.properties.operator,o=opByName[name];
          lyr.bindTooltip(`<b>${name}</b><br/>${o?`${ci.label} · ${yrLbl}: ${scenFmt(read(o.values))}`:'no NEP scenario'}`,{sticky:true});
          lyr.on('mouseover',()=>lyr.setStyle({weight:2.2,color:'#1a1a1a'}));
          lyr.on('mouseout',()=>lyr.setStyle({weight:.8,color:'#fff'}));
          lyr.on('click',()=>o&&setInfo({kind:'op',op:name}));}
      }).addTo(m);
    }
  },[data,terr,eView,read,scale,ci.color,mapRef.current]);

  const groups=useMemo(()=>{
    if(!data)return[];
    const by={};for(const c of data.categories)(by[c.group]||(by[c.group]=[])).push(c);
    return [['aggregate','Totals'],['generation','Generation'],['storage','Storage'],['consumption','Consumption']]
      .filter(([g])=>by[g]&&by[g].length).map(([g,lbl])=>[lbl,by[g]]);
  },[data]);
  const chip=(on,fn,label,title)=>h`<span class=${'chip'+(on?' on':'')} title=${title||''} onClick=${fn}>${label}</span>`;
  const yChips=(sel,set)=>dyears.map(y=>chip(sel===y,()=>set(y),y===2024?`${y} (today)`:y));

  const selFeat=info&&info.kind==='region'&&data.regions.features.find(f=>f.properties.region===info.region);
  const selVals=info?(info.kind==='op'?(opByName[info.op]||{}).values
    :(selFeat?(level==='dso'?selFeat.properties.dso:selFeat.properties.tso):null)):null;
  const readK=(vals,k)=>{const c=vals&&vals[k];if(!c)return 0;
    return level==='dso'?(mode==='value'?(c[dy]||0):(c[dy1]||0)-(c[dy0]||0))
      :(mode==='value'?(c[scen+'_'+ty]||0):(c[scen+'_2045']||0)-(c[scen+'_2037']||0));};

  return h`<div class="view" style=${{display:active?'block':'none'}}><div class="maplay">
    <div class="map" ref=${ref}></div>
    <aside class="rail">${nav}<header><h2>${tr("NEP regional forecast")}</h2>
      <p>NEP 2025 Regionalszenarien — the forecast of installed capacity and demand by
      technology. Distribution (DSO) by region or operator, and the transmission (TSO)
      scenarios. Switch to <b>Change</b> to see where it grows between two years.</p></header>
      <div class="scroller">
        ${err?h`<p class="note" style=${{color:'#ff3b30'}}>⚠ Couldn't load scenarios (${err}).<br/>
          Run <code>scripts/pipeline/build_nep_scenarios.py</code> and restart the backend.</p>`
         :!data?h`<p class="note">${tr("Loading scenarios…")}</p>`:''}
        <div class="sect">${tr("Network level")}</div>
        <div class="chips">
          ${chip(level==='dso',()=>{setInfo(null);setLevel('dso')},'DSO','Distribution — Verteilnetzbetreiber')}
          ${chip(level==='tso',()=>{setInfo(null);setLevel('tso')},'TSO','Transmission — Übertragungsnetzbetreiber (scenarios A/B)')}
        </div>
        ${level==='dso'&&h`<div><div class="sect">${tr("View")}</div><div class="chips">
          ${chip(view==='region',()=>{setInfo(null);setView('region')},'By region')}
          ${chip(view==='dso',()=>{setInfo(null);setView('dso')},'By DSO')}
        </div></div>`}
        <div class="sect">${tr("Technology")}</div>
        <select class="isel" value=${cat} onChange=${e=>setCat(e.target.value)}>
          ${groups.map(([lbl,cs])=>h`<optgroup label=${lbl} key=${lbl}>
            ${cs.map(c=>h`<option key=${c.key} value=${c.key}>${c.label}</option>`)}</optgroup>`)}
        </select>
        <div class="sect">${tr("Metric")}</div>
        <div class="chips">
          ${chip(mode==='value',()=>setMode('value'),'Installed')}
          ${chip(mode==='delta',()=>setMode('delta'),'Change Δ','Growth between two years — darker = bigger change')}
        </div>
        ${level==='tso'&&h`<div><div class="sect">${tr("Scenario")}</div><div class="chips">
          ${chip(scen==='A',()=>setScen('A'),'Szenario A')}${chip(scen==='B',()=>setScen('B'),'Szenario B')}
        </div></div>`}
        ${mode==='value'?h`<div><div class="sect">${tr("Year")}</div>
          <div class="chips">${level==='dso'?yChips(dy,setDy):[2037,2045].map(y=>chip(ty===y,()=>setTy(y),y))}</div></div>`
         :level==='dso'?h`<div><div class="sect">${tr("Change span")}</div>
            <div class="note">from</div><div class="chips">${yChips(dy0,setDy0)}</div>
            <div class="note" style=${{marginTop:4}}>to</div><div class="chips">${yChips(dy1,setDy1)}</div></div>`
         :h`<div><div class="sect">${tr("Change span")}</div><div class="note">2037 → 2045 (scenario ${scen})</div></div>`}
        ${data&&h`<div class="panel" style=${{marginTop:14}}>
          <div class="note">Germany ${mode==='delta'?'change':'total'} · ${ci.label} · ${yrLbl}</div>
          <b style=${{fontFamily:'var(--disp)',fontSize:20,color:mode==='delta'?(total>=0?'inherit':'#c0392b'):'inherit'}}>
            ${mode==='delta'&&total>=0?'+':''}${scenFmt(total)}</b>
          <div class="fcaleg" style=${{marginTop:10}}>
            <div class="fcaleg-bar" style=${{background:`linear-gradient(90deg,${fill(0)},${fill(scale)})`}}></div>
            <div class="note" style=${{display:'flex',justifyContent:'space-between'}}>
              <span>${mode==='delta'?'0':'0'}</span><span>${scenFmt(scale)}${eView==='dso'?' (per DSO)':' (per region)'}</span></div>
            ${mode==='delta'?h`<div class="note">darker = bigger increase; decreases shown in grey</div>`:''}
          </div>
        </div>`}
        ${eView==='dso'&&data&&h`<div>
          <div class="sect">${tr("DSOs ranked ·")} ${ci.label} ${yrLbl}</div>
          ${!terr?h`<p class="note">${tr("Loading DSO map…")}</p>`:''}
          <div>${opsRanked.map(([o,v])=>h`
            <div key=${o.operator} onClick=${()=>setInfo({kind:'op',op:o.operator})}
              title=${o.matched?'shown on map':'embedded in a larger territory — list only'}
              style=${{cursor:'pointer',padding:'4px 0',borderBottom:'0.5px solid var(--hair)'}}>
              <div style=${{display:'flex',justifyContent:'space-between',fontSize:12}}>
                <span style=${{opacity:o.matched?1:.55}}>${o.operator}${o.matched?'':' ·'}</span>
                <span style=${{fontWeight:600}}>${mode==='delta'&&v>=0?'+':''}${scenFmt(v)}</span></div>
              <div style=${{height:3,marginTop:2,background:fill(v),width:`${Math.max(3,100*Math.abs(v)/scale)}%`,borderRadius:2}}></div>
            </div>`)}</div>
          <p class="note" style=${{marginTop:6}}>Faint rows (·) are DSOs embedded inside a larger
            territory in our model — no own polygon, listed only.</p>
        </div>`}
        <div class="sect">${info&&info.kind==='op'?'DSO detail':'Region detail'}</div>
        ${!info&&h`<div class="panel"><span class="note">Click ${eView==='dso'?'a DSO (map or list)':'a region'} for its full forecast.</span></div>`}
        ${info&&selVals&&h`<div class="panel">
          <b style=${{fontFamily:'var(--disp)',fontSize:14}}>${info.kind==='op'?info.op:info.region}</b>
          <div class="note" style=${{margin:'2px 0 6px'}}>${level==='tso'?'transmission · scen '+scen:info.kind==='op'?'HV-DSO':'planning region'} · ${yrLbl} (MW)</div>
          ${groups.map(([lbl,cs])=>h`<div key=${lbl}>
            <div class="note" style=${{fontWeight:600,marginTop:6}}>${lbl}</div>
            <table><tbody>${cs.map(c=>{const v=readK(selVals,c.key);return h`<tr key=${c.key} style=${c.key===cat?{fontWeight:600,color:'var(--ink)'}:{}}>
              <td><span style=${{display:'inline-block',width:7,height:7,borderRadius:2,background:c.color,marginRight:5}}></span>${c.label}</td>
              <td style=${{textAlign:'right'}}>${mode==='delta'&&v>=0?'+':''}${scenFmt(v)}</td></tr>`;})}</tbody></table>
          </div>`)}
        </div>`}
        <p class="note" style=${{marginTop:10}}>Source: NEP 2025 (Entwurf). DSO 2024/2030/2035/2045;
          TSO scenarios A/B for 2037/2045. Region outlines approximated by Bundesland.</p>
      </div>
    </aside>
  </div></div>`;
}

export {MUNI_METRICS,Muni,Scenarios,_sW,_sh2r,_smix,_srgb,dcol,muniFmt,scenFmt,tcol};
