import {h,useEffect,useMemo,useRef,useState} from './core.js';
import {tr} from './i18n.js';
import {MW} from './format.js';
import {useMap} from './mapcore.js';
import {j} from './api.js';
import {Legend} from './market.js';

/* ── DC · fibre backbone ──────────────────────────────────────────────
   SEFE Energy's LWL (Lichtwellenleiter) overview map, georeferenced from the public
   PDF (scripts/dc_lwl/extract_lwl.py). The dark fibre runs along the gas-pipeline
   corridors, so it doubles as a low-latency long-haul route map between data-centre
   sites — hence the "DC" sheet. Blue = fibre routes; markers = PoP / Repeater / stations. */
const DC_BLUE='#0a5cc0';
const DC_AMBER='#ff9500';
const DC_PURPLE='#af52de';
const DC_GREEN='#34c759';
const IX_TIER={high:{op:.9,label:'High'},medium:{op:.55,label:'Medium'},low:{op:.25,label:'Low'}};
const SITE_TIER={prime:{op:.95,label:'Prime'},strong:{op:.65,label:'Strong'},possible:{op:.38,label:'Possible'},weak:{op:.16,label:'Weak'}};
const haversine=(a,b)=>{const R=6371,toR=Math.PI/180;
  const dla=(b[0]-a[0])*toR,dlo=(b[1]-a[1])*toR;
  const s=Math.sin(dla/2)**2+Math.cos(a[0]*toR)*Math.cos(b[0]*toR)*Math.sin(dlo/2)**2;
  return 2*R*Math.asin(Math.sqrt(s));};
function DC({active,nav}){
  const [euro,setEuro]=useState(false);
  const [ref,mapRef]=useMap(active,euro?'eu':'de');
  const [data,setData]=useState(null);
  const [dcs,setDcs]=useState(null);
  const [pdb,setPdb]=useState(null);
  const [cand,setCand]=useState(null);
  const [show,setShow]=useState({routes:true,pop:true,repeater:true,station:true,dc:true,potential:true,sites:true});
  const [sel,setSel]=useState(null);
  const [q,setQ]=useState('');
  const routeRef=useRef(null), nodeRef=useRef(null), dcRef=useRef(null), pdbRef=useRef(null), candRef=useRef(null);

  useEffect(()=>{if(active&&!data)j('/js/dc_lwl.geojson').then(setData).catch(()=>setData({error:1}));},[active,data]);
  useEffect(()=>{if(active&&!dcs)j('/js/dc_datacenters.geojson').then(setDcs).catch(()=>setDcs({error:1}));},[active,dcs]);
  // ?v= busts the browser's heuristic cache — these files are rebuilt by scripts,
  // and a stale copy silently drops whole countries from the map
  useEffect(()=>{if(active&&!pdb)j('/js/dc_peeringdb.geojson?v='+Date.now()).then(setPdb).catch(()=>setPdb({error:1}));},[active,pdb]);
  useEffect(()=>{if(active&&!cand)j('/js/dc_candidates.geojson?v='+Date.now()).then(setCand).catch(()=>setCand({error:1}));},[active,cand]);
  const dcList=useMemo(()=>(dcs&&!dcs.error?dcs.features.map(f=>(
    {...f.properties,ll:[f.geometry.coordinates[1],f.geometry.coordinates[0]]})):[]),[dcs]);
  const ixList=useMemo(()=>{
    if(!pdb||pdb.error)return[];
    const seen={};                    // fan out exchanges that share exact coordinates
    return pdb.features.map(f=>{
      const key=f.geometry.coordinates.join(',');
      const k=(seen[key]=(seen[key]??-1)+1);
      const dLat=k?.012*Math.cos(k*2.4):0, dLon=k?.019*Math.sin(k*2.4):0;
      return {...f.properties,ll:[f.geometry.coordinates[1]+dLat,f.geometry.coordinates[0]+dLon]};
    });
  },[pdb]);
  const siteList=useMemo(()=>(cand&&!cand.error?cand.features.map(f=>(
    {...f.properties,ll:[f.geometry.coordinates[1],f.geometry.coordinates[0]]})):[]),[cand]);

  const split=useMemo(()=>{
    if(!data||data.error)return null;
    const routes=[],nodes=[];
    for(const f of data.features){
      if(f.geometry.type==='LineString')routes.push(f.geometry.coordinates);
      else nodes.push({...f.properties,ll:[f.geometry.coordinates[1],f.geometry.coordinates[0]]});
    }
    let km=0;
    for(const r of routes)for(let i=1;i<r.length;i++)km+=haversine([r[i-1][1],r[i-1][0]],[r[i][1],r[i][0]]);
    return {routes,nodes,km};
  },[data]);

  // routes layer
  useEffect(()=>{
    const m=mapRef.current;if(!m||!split)return;
    if(!routeRef.current)routeRef.current=L.layerGroup().addTo(m);
    const lay=routeRef.current;lay.clearLayers();
    if(!show.routes)return;
    for(const r of split.routes){
      lay.addLayer(L.polyline(r.map(c=>[c[1],c[0]]),{color:DC_BLUE,weight:1.4,opacity:.85}));
    }
  },[split,show.routes,mapRef.current]);

  // nodes layer
  const NK={pop:{r:5,fill:DC_BLUE,stroke:'#fff',label:'PoP'},
            repeater:{r:3.6,fill:'#fff',stroke:DC_BLUE,label:'Repeater'},
            station:{r:2.8,fill:DC_BLUE,stroke:'rgba(255,255,255,.9)',label:'Station'},
            access:{r:4.2,fill:'#ff9500',stroke:'#fff',label:'Access'}};
  useEffect(()=>{
    const m=mapRef.current;if(!m||!split)return;
    if(!nodeRef.current)nodeRef.current=L.layerGroup().addTo(m);
    const lay=nodeRef.current;lay.clearLayers();
    for(const n of split.nodes){
      const k=NK[n.kind]||NK.station;
      if(show[n.kind]===false)continue;   // access nodes (not in toggles) stay visible
      lay.addLayer(L.circleMarker(n.ll,{radius:k.r,color:k.stroke,weight:1,
        fillColor:k.fill,fillOpacity:.95})
        .bindTooltip(`<b>${n.name||n.label}</b>${n.code?' · '+n.code:''}<br>${k.label}`,{sticky:true})
        .on('click',()=>setSel(n)));
    }
  },[split,show.pop,show.repeater,show.station,mapRef.current]);

  // data-centre layer (>=10 MW operator class) — amber, area ∝ published MW where known
  useEffect(()=>{
    const m=mapRef.current;if(!m)return;
    if(!dcRef.current)dcRef.current=L.layerGroup().addTo(m);
    const lay=dcRef.current;lay.clearLayers();
    if(!show.dc)return;
    for(const d of dcList){
      const r=d.mw?Math.max(5,Math.min(18,Math.sqrt(d.mw)*1.7)):4.5;
      lay.addLayer(L.circleMarker(d.ll,{radius:r,color:'#9a4b00',weight:1,
        fillColor:DC_AMBER,fillOpacity:.8})
        .bindTooltip(`<b>${d.name}</b><br>${d.operator||''}${d.city?' · '+d.city:''}<br>`+
          (d.mw?`${d.mw} MW`+(d.status&&d.status!=='operational'?' · '+d.status:''):'capacity n/a'),{sticky:true})
        .on('click',()=>setSel(d)));
    }
  },[dcList,show.dc,mapRef.current]);

  // potential layer — internet exchanges (PeeringDB) in the top-200 cities.
  // Sorted by score in the geojson, so big fabrics render first and small ones stay clickable.
  useEffect(()=>{
    const m=mapRef.current;if(!m)return;
    if(!pdbRef.current)pdbRef.current=L.layerGroup().addTo(m);
    const lay=pdbRef.current;lay.clearLayers();
    if(!show.potential)return;
    for(const x of ixList){
      const t=IX_TIER[x.tier]||IX_TIER.low;
      const r=Math.max(4.5,Math.min(16,2.5+Math.sqrt(x.members||1)*.55));
      lay.addLayer(L.circleMarker(x.ll,{radius:r,color:DC_PURPLE,weight:1.4,
        fillColor:DC_PURPLE,fillOpacity:t.op})
        .bindTooltip(`<b>${x.name}</b><br>${x.city}${x.country&&x.country!=='DE'?' ('+x.country+')':''} · ${x.members} members · ${t.label} potential`,{sticky:true})
        .on('click',()=>setSel(x)));
    }
  },[ixList,show.potential,mapRef.current]);

  // candidate-site layer — substations where a 40–50 MW DC load could connect
  // (Reifegradverfahren availability × fibre × IX latency × DC ecosystem)
  useEffect(()=>{
    const m=mapRef.current;if(!m)return;
    if(!candRef.current)candRef.current=L.layerGroup().addTo(m);
    const lay=candRef.current;lay.clearLayers();
    if(!show.sites)return;
    for(const s of [...siteList].reverse()){   // weak first, prime on top
      const t=SITE_TIER[s.tier]||SITE_TIER.weak;
      lay.addLayer(L.circleMarker(s.ll,{radius:Math.max(4,s.score/8),color:'#1d7a38',
        weight:1.2,fillColor:DC_GREEN,fillOpacity:t.op})
        .bindTooltip(`<b>${s.name}</b> · ${s.tso}<br>${t.label} site for a ${s.target_mw} MW DC · score ${s.score}`,{sticky:true})
        .on('click',()=>setSel(s)));
    }
  },[siteList,show.sites,mapRef.current]);

  const counts=useMemo(()=>{
    if(!split)return{};
    const c={pop:0,repeater:0,station:0,access:0};
    split.nodes.forEach(n=>{c[n.kind]=(c[n.kind]||0)+1;});
    return c;
  },[split]);
  const hits=useMemo(()=>{
    if(!split||!q.trim())return[];
    const s=q.trim().toLowerCase();
    return split.nodes.filter(n=>(n.label||'').toLowerCase().includes(s)).slice(0,40);
  },[split,q]);
  const toggle=k=>setShow(s=>({...s,[k]:!s[k]}));

  return h`<div class="view" style=${{display:active?'block':'none'}}><div class="maplay">
    <div class="map" ref=${ref}></div>
    <aside class="rail">${nav}<header><h2>${tr("Fibre backbone · LWL")}</h2>
      <p>SEFE Energy's <b>LWL (fibre-optic) network</b> — dark fibre laid along the
        long-distance gas-pipeline corridors. Exact route geometry from SEFE's own
        network map; the same low-latency routes that link long-haul data-centre and
        exchange sites across Germany.</p></header>
      <div class="scroller">
      ${!data?h`<p class="note"><span class="spinner"></span>Loading fibre map…</p>`
       :data.error?h`<p class="note bad">Could not load <code>/js/dc_lwl.geojson</code>. Run
         <code>python scripts/dc_lwl/build_dc.py</code> to (re)generate it.</p>`
       :h`<div>
        <div class="sect">${tr("Layers")}</div>
        <div class="chips">
          <span class=${'chip'+(show.routes?' on':'')} onClick=${()=>toggle('routes')}>
            <span class="sw" style=${{background:DC_BLUE}}></span>Routes</span>
          <span class=${'chip'+(show.pop?' on':'')} onClick=${()=>toggle('pop')}>
            <span class="sw" style=${{background:DC_BLUE}}></span>PoP</span>
          <span class=${'chip'+(show.repeater?' on':'')} onClick=${()=>toggle('repeater')}>
            <span class="sw" style=${{background:'#fff',boxShadow:'inset 0 0 0 1.5px '+DC_BLUE}}></span>Repeater</span>
          <span class=${'chip'+(show.station?' on':'')} onClick=${()=>toggle('station')}>
            <span class="sw" style=${{background:DC_BLUE}}></span>Stations</span>
          <span class=${'chip'+(show.dc?' on':'')} onClick=${()=>toggle('dc')}>
            <span class="sw" style=${{background:DC_AMBER}}></span>Data centres</span>
          <span class=${'chip'+(show.potential?' on':'')} title="Internet exchanges (PeeringDB) found in the 200 biggest German cities" onClick=${()=>toggle('potential')}>
            <span class="sw" style=${{background:DC_PURPLE}}></span>Potential</span>
          <span class=${'chip'+(show.sites?' on':'')} title="Substations where a 40–50 MW data-centre load could connect (Reifegradverfahren × fibre × IX latency)" onClick=${()=>toggle('sites')}>
            <span class="sw" style=${{background:DC_GREEN}}></span>Sites 40–50 MW</span>
          <span class=${'chip'+(euro?' on':'')} title="Frame all covered countries (DE, UK, PL, PT, ES) instead of Germany"
            onClick=${()=>setEuro(v=>!v)}>Europe view</span>
        </div>

        <div class="sect">${tr("Network")}</div>
        <div class="kpis">
          <div class="kpi"><div class="v">${Math.round(split.km).toLocaleString()} km</div><div class="k">${tr("Route length")}</div></div>
          <div class="kpi"><div class="v">${split.nodes.length}</div><div class="k">${tr("Sites")}</div></div>
          <div class="kpi"><div class="v">${counts.pop||0}</div><div class="k">${tr("PoP")}</div></div>
          <div class="kpi"><div class="v">${dcList.length||0}</div><div class="k">${tr("Data centres ≥10 MW")}</div></div>
          <div class="kpi"><div class="v">${ixList.length||0}</div><div class="k">${tr("Internet exchanges")}</div></div>
          <div class="kpi"><div class="v">${siteList.filter(s=>s.tier==='prime'||s.tier==='strong').length||0}</div><div class="k">${tr("Prime/strong DC sites")}</div></div>
        </div>

        <div class="sect">${tr("Find a site")}</div>
        <input class="isel" placeholder="search PoP / repeater / station…" value=${q}
          onInput=${e=>setQ(e.target.value)} style=${{marginBottom:6}}/>
        ${hits.length?h`<table><tbody>${hits.map((n,i)=>h`
          <tr key=${i} style=${{cursor:'pointer'}} onClick=${()=>{setSel(n);mapRef.current&&mapRef.current.setView(n.ll,11,{animate:true})}}>
            <td>${(n.name||n.label).slice(0,26)}</td><td class="note">${n.code||''}</td></tr>`)}</tbody></table>`
          :q.trim()?h`<p class="note">${tr("No match.")}</p>`:null}

        ${sel?(sel.kind==='site'
          ?h`<div class="sect">${tr("Selected · DC site candidate")}</div>
            <div class="panel"><table><tbody>
              <tr><td>substation</td><td><b>${sel.name}</b>${sel.city?` · ${sel.city}`:''}</td></tr>
              <tr><td>grid</td><td>${sel.tso}${sel.kv?` · ${sel.kv} kV`:''}</td></tr>
              <tr><td>fit ${sel.target_mw} MW</td><td><b style=${{color:sel.tier==='prime'?'#248a3d':sel.tier==='strong'?'#3a7d44':sel.tier==='possible'?'#c76b00':'inherit'}}>
                ${(SITE_TIER[sel.tier]||SITE_TIER.weak).label}</b> · score ${sel.score}/100</td></tr>
              <tr><td>switch bays</td><td>${sel.bays||'n/a'}${sel.year?` · connectable ${sel.year}`:''}</td></tr>
              ${sel.restriction?h`<tr><td>restriction</td><td>${sel.restriction}</td></tr>`:''}
              <tr><td>fibre</td><td>${sel.fibre_km} km to SEFE backbone</td></tr>
              <tr><td>peering</td><td>${sel.ix_name} ${sel.ix_km} km${sel.fra_km!=null?` · Frankfurt ${sel.fra_km} km`:''}</td></tr>
              <tr><td>nearest DC</td><td>${sel.dc_name} · ${sel.dc_km} km</td></tr>
            </tbody></table></div>
            ${sel.parts?h`<div class="sect">${tr("Score breakdown")}</div>
              <table><tbody>${Object.entries(sel.parts).map(([k,v],i)=>h`
                <tr key=${i}><td>${k.replace('_',' ')}</td>
                  <td style=${{whiteSpace:'nowrap'}}>${v}</td>
                  <td style=${{width:'40%'}}><span style=${{display:'inline-block',height:5,borderRadius:3,
                    background:DC_GREEN,opacity:.8,width:Math.max(2,v*3)+'%',minWidth:2}}></span></td></tr>`)}
              </tbody></table>`:''}
            ${sel.tso_note?h`<p class="bhint" style=${{marginTop:8}}><b>TSO context:</b> ${sel.tso_note}</p>`:''}
            <p class="bhint" style=${{marginTop:8}}>${sel.why}</p>`
          :sel.kind==='ix'
          ?h`<div class="sect">${tr("Selected · internet exchange")}</div>
            <div class="panel"><table><tbody>
              <tr><td>exchange</td><td><b>${sel.name}</b></td></tr>
              <tr><td>city</td><td>${sel.city}${sel.country?` · ${sel.country}`:''}${sel.city_rank?` (#${sel.city_rank} by population)`:''}</td></tr>
              <tr><td>potential</td><td><b style=${{color:sel.tier==='high'?'#248a3d':sel.tier==='medium'?'#c76b00':'inherit'}}>
                ${(IX_TIER[sel.tier]||IX_TIER.low).label}</b> · score ${sel.score}/100</td></tr>
              <tr><td>members</td><td>${sel.members} networks</td></tr>
              <tr><td>capacity</td><td>${(sel.capacity_gbps||0).toLocaleString()} Gbit/s connected ports</td></tr>
              ${sel.n_facilities?h`<tr><td>facilities</td><td>${sel.n_facilities} listed sites</td></tr>`:''}
              <tr><td>links</td><td><a href=${sel.pdb_url} target="_blank" rel="noopener">PeeringDB</a>
                ${sel.website?h` · <a href=${sel.website} target="_blank" rel="noopener">website</a>`:''}</td></tr>
            </tbody></table></div>
            ${(sel.customer_mix||[]).length?h`<div class="sect">${tr("Customer mix")}</div>
              <table><tbody>${sel.customer_mix.filter(c=>c.pct>0).map((c,i)=>h`
                <tr key=${i}><td>${c.type==='?'?'undeclared':c.type}</td>
                  <td style=${{whiteSpace:'nowrap'}}>${c.n} · ${c.pct}%</td>
                  <td style=${{width:'40%'}}><span style=${{display:'inline-block',height:5,borderRadius:3,
                    background:DC_PURPLE,opacity:.75,width:Math.max(2,c.pct)+'%',minWidth:2}}></span></td></tr>`)}
              </tbody></table>`:''}
            ${(sel.hyperscalers||[]).length?h`<div class="sect">${tr("Hyperscalers on the fabric")}</div>
              <div class="chips">${sel.hyperscalers.map(n=>h`<span class="chip on" key=${n}>${n}</span>`)}</div>`:''}
            ${(sel.marquee||[]).filter(n=>!(sel.hyperscalers||[]).includes(n)).length?h`
              <div class="sect">${tr("Other notable members")}</div>
              <div class="chips">${sel.marquee.filter(n=>!(sel.hyperscalers||[]).includes(n)).map(n=>h`<span class="chip" key=${n}>${n}</span>`)}</div>`:''}
            <p class="bhint" style=${{marginTop:8}}>${sel.why}</p>`
          :sel.kind==='datacenter'
          ?h`<div class="sect">${tr("Selected · data centre")}</div>
            <div class="panel"><table><tbody>
              <tr><td>name</td><td>${sel.name}</td></tr>
              ${sel.operator?h`<tr><td>operator</td><td>${sel.operator}</td></tr>`:''}
              ${sel.city?h`<tr><td>city</td><td>${sel.city}</td></tr>`:''}
              <tr><td>capacity</td><td>${sel.mw?`${sel.mw} MW`+(sel.mw_source==='published'?' (published)':''):'n/a (not public)'}</td></tr>
              ${sel.status&&sel.status!=='operational'?h`<tr><td>status</td><td>${sel.status}</td></tr>`:''}
              <tr><td>lat, lon</td><td>${sel.ll[0].toFixed(4)}, ${sel.ll[1].toFixed(4)}</td></tr>
            </tbody></table></div>`
          :h`<div class="sect">${tr("Selected")}</div>
            <div class="panel"><table><tbody>
              <tr><td>name</td><td>${sel.name||sel.label}</td></tr>
              ${sel.code?h`<tr><td>site code</td><td>${sel.code}</td></tr>`:''}
              <tr><td>type</td><td>${(NK[sel.kind]||NK.station).label}</td></tr>
              <tr><td>lat, lon</td><td>${sel.ll[0].toFixed(4)}, ${sel.ll[1].toFixed(4)}</td></tr>
            </tbody></table></div>`)
          :h`<p class="note" style=${{marginTop:14}}>Click any node, data centre or exchange for its details.</p>`}

        <div class="sect">${tr("Legend")}</div>
        <div class="chips">
          <span class="chip"><span class="sw" style=${{width:14,height:2,background:DC_BLUE}}></span>Fibre route</span>
          <span class="chip"><span class="sw" style=${{background:DC_BLUE}}></span>PoP</span>
          <span class="chip"><span class="sw" style=${{background:'#fff',boxShadow:'inset 0 0 0 1.5px '+DC_BLUE}}></span>Repeater</span>
          <span class="chip"><span class="sw" style=${{background:DC_AMBER}}></span>Data centre (area ∝ MW)</span>
          <span class="chip"><span class="sw" style=${{background:DC_PURPLE}}></span>Potential — internet exchange (area ∝ members, opacity ∝ value)</span>
          <span class="chip"><span class="sw" style=${{background:DC_GREEN}}></span>DC site 40–50 MW (opacity ∝ fit)</span>
        </div>
        <p class="bhint" style=${{marginTop:8}}>Data centres: major colocation/hyperscale operators
          (the ≥10 MW class), locations from OpenStreetMap. MW shown only where publicly reported —
          per-facility capacity is mostly proprietary, so this is indicative, not exhaustive.</p>
        <p class="bhint" style=${{marginTop:8}}>DC sites: the Reifegradverfahren substations (TSO-published
          connection availability — free bays, year, restrictions) screened as 40–50 MW data-centre
          locations against fibre distance, exchange latency and the existing DC footprint. Rebuild with
          <code>python scripts/dc_siting/build_dc_candidates.py</code> (app must be running).</p>
        <p class="bhint" style=${{marginTop:8}}>Potential: every PeeringDB internet exchange in
          Germany, the UK, Poland, Portugal and Spain (${ixList.length||0} in total), with the 200
          biggest cities of each country as rank context — use “Europe view” to see beyond Germany.
          Member counts, customer types and port capacity from PeeringDB; value tier scores members,
          capacity, hyperscaler presence and content/eyeball balance. Rebuild with
          <code>python scripts/dc_peeringdb/build_potential.py</code>.</p>
        <p class="bhint" style=${{marginTop:12}}>Routes: SEFE Energy interactive network map (exact
          WGS84 geometry). Site names: SEFE LWL-Übersichtsplan, geocoded and snapped onto the
          nearest cable. Public sources, for reference only.</p>
      </div>`}
      </div>
    </aside>
  </div></div>`;
}

export {DC,DC_AMBER,DC_BLUE,DC_GREEN,DC_PURPLE,IX_TIER,SITE_TIER,haversine};
