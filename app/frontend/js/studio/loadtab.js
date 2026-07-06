import {h,useEffect,useRef,useState} from './core.js';
import {tr} from './i18n.js';
import {GW,MW} from './format.js';
import {useMap} from './mapcore.js';
import {bn,getKreis,getState,j} from './api.js';
import {Timeline} from './ui.js';
import {DevTable} from './gen.js';

/* ── Load ── */
function Load({active,hour,state,snaps,setHour,ds,nav,years}){
  const [ref,mapRef]=useMap(active);
  const [yr,setYr]=useState(2025);
  const [geo,setGeo]=useState(null);
  const [lk,setLk]=useState(null);
  const [dev,setDev]=useState(null);
  const [stLocal,setStLocal]=useState(null);
  const [show,setShow]=useState({kreis:true,nodes:false});
  const layRef=useRef({});
  useEffect(()=>{if(active&&!geo)j('/api/sample/kreise').then(setGeo)},[active,geo]);
  useEffect(()=>{if(active)getKreis(hour,ds,yr).then(setLk)},[active,hour,ds,yr]);
  useEffect(()=>{if(active&&!dev&&years.length>1)j('/api/sample/development').then(setDev).catch(()=>{})},[active,dev,years]);
  useEffect(()=>{   // horizon year: fetch that year's per-hour state for KPIs + node circles
    let live=true;
    if(!active||yr===2025){setStLocal(null);return}
    getState(hour,ds,yr).then(d=>{if(live)setStLocal(d)});
    return()=>{live=false};
  },[active,hour,ds,yr]);
  const cst=yr===2025?state:stLocal;
  // the ~400 district polygons are built ONCE; each hour only restyles them
  // (tooltips read the latest values through lkRef)
  const lkRef=useRef(null);lkRef.current=lk;
  useEffect(()=>{
    const m=mapRef.current;if(!m||!geo||!lk)return;
    const R=layRef.current;
    if(!R.nodes)R.nodes=L.layerGroup();
    const mx=Math.max(...Object.values(lk.load_by_kreis_MW),1);
    const style=f=>{const v=lk.load_by_kreis_MW[f.properties.ags]||0;
      return{weight:.5,color:'rgba(0,0,0,.12)',fillColor:'#ff9500',
        fillOpacity:.06+.66*Math.sqrt(Math.min(v/mx,1))}};   // sqrt ramp: mid-size districts stay visible
    if(!R.kreis){
      R.kreis=L.geoJSON(geo,{style,
       onEachFeature:(f,la)=>la.bindTooltip(()=>{
         const cur=lkRef.current,v=cur?cur.load_by_kreis_MW[f.properties.ags]||0:0;
         return `<b>${(cur&&cur.names[f.properties.ags])||f.properties.ags}</b><br>${v.toLocaleString()} MW`;
       },{sticky:true})}).addTo(m);
    }else R.kreis.setStyle(style);
    R.nodes.clearLayers();
    if(show.nodes&&cst)for(const nd of cst.nodes){if(nd.load_MW>1)
      R.nodes.addLayer(L.circleMarker([nd.lat,nd.lon],{radius:Math.min(1.5+Math.sqrt(nd.load_MW)/4,13),
        color:'rgba(0,0,0,.2)',weight:.5,fillColor:'#30b0c7',fillOpacity:.72})
       .bindTooltip(()=>`<b>${bn(nd.bus)}</b><br>Bus ${nd.bus} · ${nd.load_MW.toLocaleString()} MW`,{sticky:true}))}
    show.kreis?m.addLayer(R.kreis):m.removeLayer(R.kreis);
    show.nodes?m.addLayer(R.nodes):m.removeLayer(R.nodes);
  },[geo,lk,cst,show,mapRef.current]);
  const top=lk?Object.entries(lk.load_by_kreis_MW).sort((a,b)=>b[1]-a[1]).slice(0,10):[];
  return h`<div class="view" style=${{display:active?'block':'none'}}><div class="maplay">
    <div class="mapcol"><${Timeline} snaps=${snaps} hour=${hour} setHour=${setHour}/><div class="map" ref=${ref}></div></div>
    <aside class="rail">${nav}<header><h2>${tr("Load")}</h2>
      <p>Electric demand per Landkreis and per grid node. Hover any district for its draw.</p></header>
      <div class="scroller">
        ${years.length>1&&h`<div>
        <div class="sect">${tr("Demand year")}</div>
        <div class="chips">${years.map(y=>h`<span key=${y} class=${'chip'+(yr===y?' on':'')}
          onClick=${()=>setYr(y)}>${y}</span>`)}</div>
        ${yr!==2025&&h`<p class="note">NEP-scaled ${yr} demand — model scenario.</p>`}</div>`}
        <div class="kpis">
          <div class="kpi"><div class="v">${cst?GW(cst.country.total_load_MW):'–'}</div><div class="k">${tr("load GW")}</div></div>
          <div class="kpi"><div class="v">${lk?Object.keys(lk.load_by_kreis_MW).length:'–'}</div><div class="k">${tr("districts")}</div></div>
          <div class="kpi"><div class="v">${top.length?GW(top[0][1]):'–'}</div><div class="k">${tr("top district GW")}</div></div>
        </div>
        ${dev&&dev.years.length>1&&h`<div>
          <div class="sect">${tr("Demand development")}</div>
          <${DevTable} dev=${dev} yr=${yr} header="demand" rows=${[
            ['Annual TWh',d=>d.demand_TWh.toFixed(0)],
            ['Peak GW',d=>(d.peak_load_MW/1000).toFixed(1)],
            ['Mean GW',d=>(d.mean_load_MW/1000).toFixed(1)]]}/>
          <p class="note">${tr("National demand per scenario year — electrification (heat pumps, EVs,\n          electrolysis) drives the growth. Pick a year above to put it on the map.")}</p>
        </div>`}
        <div class="sect">${tr("Layers")}</div>
        <div class="chips">
          <span class=${'chip'+(show.kreis?' on':'')} onClick=${()=>setShow(s=>({...s,kreis:!s.kreis}))}>
            <span class="sw" style=${{background:'#ff9500'}}></span>Landkreise</span>
          <span class=${'chip'+(show.nodes?' on':'')} onClick=${()=>setShow(s=>({...s,nodes:!s.nodes}))}>
            <span class="sw" style=${{background:'#30b0c7'}}></span>Nodes</span>
        </div>
        <div class="sect">${tr("Top districts this hour")}</div>
        <table><thead><tr><th>${tr("district")}</th><th>${tr("MW")}</th></tr></thead><tbody>
         ${top.map(([k,v])=>h`<tr key=${k}><td>${(lk.names[k]||k).replace(/ \(.*\)/,'')}</td><td>${v.toLocaleString()}</td></tr>`)}
        </tbody></table>
        <p class="note">${tr("Load profiles are the model's own nodal series — the same demand the market\n        dispatch is balanced against, so generation and load always tell one story.")}</p>
      </div>
    </aside>
  </div></div>`;
}

export {Load};
