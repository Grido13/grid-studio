import {h,useCallback,useEffect,useMemo,useRef,useState} from './core.js';
import {tr} from './i18n.js';
import {GW,MW,P,cn,tc} from './format.js';
import {useMap} from './mapcore.js';
import {bn,getState,j} from './api.js';
import {Bars,Dot,Timeline} from './ui.js';

/* ── Generation ── */
/* development table shared by Generation (fleet) and Load (demand) */
const DevTable=({dev,yr,rows,header})=>h`<table>
  <thead><tr><th>${header}</th>${dev.years.map(d=>h`<th key=${d.year}
    style=${d.year===yr?{color:'var(--ink)'}:{}}>${d.year}</th>`)}</tr></thead>
  <tbody>${rows.map(([label,get,cls])=>h`<tr key=${label}>
    <td>${label}</td>
    ${dev.years.map(d=>h`<td key=${d.year} class=${cls||''}
      style=${d.year===yr?{fontWeight:700,color:'var(--ink)'}:{}}>${get(d)}</td>`)}
  </tr>`)}</tbody></table>`;
function Gen({active,hour,state,snaps,setHour,ds,nav,years}){
  const [ref,mapRef]=useMap(active);
  const [yr,setYr]=useState(2025);
  const [nodes,setNodes]=useState(null);
  const nodesRef=useRef({});
  const [sel,setSel]=useState(null);
  const [detail,setDetail]=useState(null);
  const [dev,setDev]=useState(null);
  const [stLocal,setStLocal]=useState(null);
  const layerRef=useRef(null);
  useEffect(()=>{if(!active)return;
    if(nodesRef.current[yr]){setNodes(nodesRef.current[yr]);return}
    j('/api/sample/gen_nodes?year='+yr).then(d=>{nodesRef.current[yr]=d;setNodes(d);
      setSel(s=>s||new Set(d.carriers.filter(c=>!c.startsWith('import'))))});
  },[active,yr]);
  useEffect(()=>{if(active&&!dev&&years.length>1)j('/api/sample/development').then(setDev).catch(()=>{})},[active,dev,years]);
  useEffect(()=>{   // horizon fleet: fetch that year's per-hour state for the dispatch panel
    let live=true;
    if(!active||yr===2025){setStLocal(null);return}
    getState(hour,ds,yr).then(d=>{if(live)setStLocal(d)});
    return()=>{live=false};
  },[active,hour,ds,yr]);
  const cst=yr===2025?state:stLocal;
  // hour/year live in refs so scrubbing time never rebuilds the ~4k bubbles —
  // the markers are static installed capacity; only the click URL needs the hour
  const curRef=useRef({});curRef.current={hour,yr};
  useEffect(()=>{
    if(!mapRef.current||!nodes||!sel)return;
    if(!layerRef.current)layerRef.current=L.layerGroup().addTo(mapRef.current);
    const lay=layerRef.current;lay.clearLayers();
    for(const n of nodes.nodes){
      const mix=Object.entries(n.mix).filter(([c])=>sel.has(c));
      if(!mix.length)continue;
      const tot=mix.reduce((a,[,v])=>a+v,0),dom=mix.sort((a,b)=>b[1]-a[1])[0][0];
      lay.addLayer(L.circleMarker([n.lat,n.lon],{radius:Math.min(2+Math.sqrt(tot)/5,15),
        color:'rgba(0,0,0,.25)',weight:.6,fillColor:tc(dom),fillOpacity:.82})
       .bindTooltip(()=>`<b>${bn(n.bus)}</b><br>Bus ${n.bus} · ${P(tot)} installed · mostly ${cn(dom).toLowerCase()}`,{sticky:true})
       .on('click',()=>{const c=curRef.current;
         j(`/api/sample/node?i=${c.hour}&bus=${n.bus}&ds=${ds}&year=${c.yr}`).then(setDetail)}));
    }
  },[nodes,sel,mapRef.current]);
  const toggle=useCallback(c=>setSel(s=>{const n=new Set(s);n.has(c)?n.delete(c):n.add(c);return n}),[]);
  const carriers=nodes?nodes.carriers.filter(c=>!c.startsWith('import')):[];
  const devCarriers=useMemo(()=>{
    if(!dev)return[];
    const last=dev.years[dev.years.length-1].cap_by_carrier_MW;
    return [...new Set(dev.years.flatMap(d=>Object.keys(d.cap_by_carrier_MW)))]
      .sort((a,b)=>(last[b]||0)-(last[a]||0)).slice(0,10);
  },[dev]);
  return h`<div class="view" style=${{display:active?'block':'none'}}><div class="maplay">
    <div class="mapcol"><${Timeline} snaps=${snaps} hour=${hour} setHour=${setHour}/><div class="map" ref=${ref}></div></div>
    <aside class="rail">${nav}<header><h2>${tr("Generation")}</h2>
      <p>Nodes sized by installed capacity, coloured by dominant technology. Hover for a summary, click for the full mix.</p></header>
      <div class="scroller">
        ${years.length>1&&h`<div>
        <div class="sect">${tr("Fleet year")}</div>
        <div class="chips">${years.map(y=>h`<span key=${y} class=${'chip'+(yr===y?' on':'')}
          onClick=${()=>{setYr(y);setDetail(null)}}>${y}</span>`)}</div>
        ${yr!==2025&&h`<p class="note">NEP-scaled ${yr} fleet — model scenario.</p>`}</div>`}
        <div class="sect">${tr("Technologies")}</div>
        <div class="chips">
          <span class="chip act" onClick=${()=>setSel(new Set(carriers))}>Select all</span>
          <span class="chip act" onClick=${()=>setSel(new Set())}>Clear</span>
        </div>
        <div class="chips">${carriers.map(c=>h`
          <span class=${'chip'+(sel&&sel.has(c)?' on':'')} key=${c} onClick=${()=>toggle(c)}>
            <span class="sw" style=${{background:tc(c)}}></span>${cn(c)}</span>`)}</div>
        ${dev&&dev.years.length>1&&h`<div>
          <div class="sect">${tr("Fleet development · installed GW")}</div>
          <${DevTable} dev=${dev} yr=${yr} header="carrier" rows=${[
            ...devCarriers.map(c=>[h`<span><${Dot} c=${c}/>${cn(c)}</span>`,
              d=>((d.cap_by_carrier_MW[c]||0)/1000).toFixed(1)]),
            [h`<b>Total</b>`,d=>h`<b>${(d.total_cap_MW/1000).toFixed(0)}</b>`]]}/>
          <p class="note">${tr("Installed capacity per scenario year (NEP-scaled fleet). Pick a year above to put it on the map.")}</p>
        </div>`}
        <div class="sect">${tr("Country dispatch this hour")}${yr!==2025?` · ${yr}`:''}</div>
        <${Bars} obj=${cst?.country?.gen_by_tech_MW}/>
        <div class="sect">${tr("Node")}</div>
        ${detail?h`<div class="panel">
          <b style=${{fontFamily:'var(--disp)',fontSize:13}}>${bn(detail.bus)}</b>
          <div class="note">Bus ${detail.bus} · installed ${P(detail.cap_MW)} · generating ${P(detail.gen_MW)} · load ${P(detail.load_MW)} · curtailed ${MW(detail.curtail_MW)}</div>
          <table><thead><tr><th>${tr("carrier")}</th><th>${tr("installed")}</th><th>${tr("now")}</th><th>${tr("curt")}</th></tr></thead><tbody>
          ${detail.carriers.map(x=>h`<tr key=${x.carrier}><td><${Dot} c=${x.carrier}/>${cn(x.carrier)}</td>
            <td>${x.cap_MW}</td><td>${x.gen_MW}</td><td class=${x.curtail_MW>0?'bad':''}>${x.curtail_MW}</td></tr>`)}
          </tbody></table></div>`
        :h`<div class="panel"><span class="note">Click a node on the map to open its mix.</span></div>`}
      </div>
    </aside>
  </div></div>`;
}

export {DevTable,Gen};
