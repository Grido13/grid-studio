import {h,useCallback,useEffect,useRef,useState} from './core.js';
import {tr} from './i18n.js';
import {GW,MW,P,cn,tc} from './format.js';
import {useMap} from './mapcore.js';
import {bn,j} from './api.js';
import {Dot} from './ui.js';
import {openBessPopup} from './bess.js';

/* ── Grid (topology inspector) ── */
const VCOL={110:'#0a84ff',220:'#34c759',380:'#ff3b30'};
const C30='#ff9500';   // everything that is new in the 2030 grid
function Grid({active,nav}){
  const [ref,mapRef]=useMap(active);
  const [topo,setTopo]=useState(null);
  const [vsel,setVsel]=useState(new Set([110,220,380]));
  const [show,setShow]=useState({buses:true,trafos:true,pst:true,links:true});
  const [year,setYear]=useState(2025);     // 2025 = Grid_Final_2025; 2030/2032/2035 = + committed build-out
  const [govl,setGovl]=useState({});       // horizon overlays (grid_{year}_overlay.json), cached per year
  const [info,setInfo]=useState(null);     // bus info panel
  const [spokes,setSpokes]=useState(false);
  const layRef=useRef({});
  useEffect(()=>{if(active&&!topo)j('/api/sample/grid_topology').then(setTopo)},[active,topo]);
  useEffect(()=>{if(active&&year!==2025&&!govl[year])
    j('/api/investments/grid/'+year).then(d=>setGovl(o=>({...o,[year]:d})))},[active,year,govl]);
  const openBus=useCallback(b=>{setSpokes(false);j('/api/sample/bus_info?bus='+b).then(setInfo)},[]);
  // ── build the ~17k base features ONCE, grouped per voltage level; the voltage /
  // element toggles then just add or remove whole groups (a full rebuild per
  // toggle made every click feel sluggish) ──
  useEffect(()=>{
    const m=mapRef.current;if(!m||!topo)return;
    const R=layRef.current;
    if(R.linesV)return;   // already built
    R.linesV={};R.busesV={};
    for(const v of [110,220,380]){R.linesV[v]=L.layerGroup();R.busesV[v]=L.layerGroup();}
    R.linesO=L.layerGroup();R.busesO=L.layerGroup();   // rare other voltages follow 110 kV
    for(const ln of topo.lines){
      (R.linesV[ln.v]||R.linesO).addLayer(L.polyline([[ln.y0,ln.x0],[ln.y1,ln.x1]],
        {color:VCOL[ln.v]||'#86868b',weight:ln.v>=380?2:ln.v>=220?1.5:0.75,opacity:.82})
       .bindTooltip(()=>`<b>${bn(ln.bus0)} – ${bn(ln.bus1)}</b><br>Line ${ln.id} · ${ln.v} kV`,{sticky:true})
       .on('click',()=>setInfo({line:ln})));
    }
    for(const b of topo.buses){
      (R.busesV[b.v]||R.busesO).addLayer(L.circleMarker([b.lat,b.lon],{radius:2.2,color:'rgba(0,0,0,.25)',
        weight:.5,fillColor:VCOL[b.v]||'#86868b',fillOpacity:.85})
       .bindTooltip(()=>`<b>${b.name||bn(b.bus)}</b><br>Bus ${b.bus} · ${b.v} kV · click to inspect`,{sticky:true})
       .on('click',()=>openBessPopup(m,b)));
    }
    R.links=L.layerGroup();
    for(const lk of (topo.links||[])){
      R.links.addLayer(L.polyline([[lk.y0,lk.x0],[lk.y1,lk.x1]],
        {color:'#5856d6',weight:2,opacity:.85,dashArray:'7 6'})
       .bindTooltip(()=>`<b>${bn(lk.bus0)} – ${bn(lk.bus1)}</b><br>HVDC link ${lk.id} · ${MW(lk.p_nom)} · ${lk.length_km} km`,{sticky:true})
       .on('click',()=>setInfo({link:lk})));
    }
    for(const k of ['trafos','spokes','g30']){if(!R[k])R[k]=L.layerGroup();m.addLayer(R[k]);}
    if(location.search.includes('bess-test'))window.__gmap=m;
  },[topo,mapRef.current,openBus]);
  // toggles: attach/detach the prebuilt groups
  useEffect(()=>{
    const m=mapRef.current,R=layRef.current;if(!m||!R.linesV)return;
    for(const v of [110,220,380]){
      vsel.has(v)?m.addLayer(R.linesV[v]):m.removeLayer(R.linesV[v]);
      (vsel.has(v)&&show.buses)?m.addLayer(R.busesV[v]):m.removeLayer(R.busesV[v]);
    }
    vsel.has(110)?m.addLayer(R.linesO):m.removeLayer(R.linesO);
    (vsel.has(110)&&show.buses)?m.addLayer(R.busesO):m.removeLayer(R.busesO);
    show.links?m.addLayer(R.links):m.removeLayer(R.links);
  },[topo,vsel,show.buses,show.links,mapRef.current]);
  // transformers / phase-shifters: few hundred markers — cheap to rebuild on filter
  useEffect(()=>{
    const m=mapRef.current,R=layRef.current;if(!m||!topo||!R.trafos)return;
    R.trafos.clearLayers();
    for(const t of topo.trafos){
      const isP=t.pst;
      if(isP&&!show.pst)continue; if(!isP&&!show.trafos)continue;
      if(!vsel.has(t.v0)&&!vsel.has(t.v1))continue;
      R.trafos.addLayer(L.circleMarker([t.lat,t.lon],{radius:isP?5:3.8,color:'var(--ink)',weight:1.1,
        fillColor:isP?'#af52de':'#fff',fillOpacity:.95})
       .bindTooltip(()=>`<b>${bn(t.bus0)}</b><br>${isP?'Phase-shifter':'Transformer'} ${t.id}<br>${t.v0} ↔ ${t.v1} kV · ${MW(t.s_nom)}`,{sticky:true})
       .on('click',()=>setInfo({trafo:t})));
    }
  },[topo,vsel,show.trafos,show.pst,mapRef.current]);
  // ---- horizon build-out overlay: everything new is drawn in C30 orange on
  // top of the 2025 base, with a white casing so it reads instantly ----
  useEffect(()=>{
    const m=mapRef.current,R=layRef.current;if(!m||!R.g30)return;
    R.g30.clearLayers();
    const g30=year!==2025?govl[year]:null;
    if(!g30)return;
    const casing={color:'#fff',opacity:.9};
    const addPath=(geom,style,tt)=>{
      R.g30.addLayer(L.polyline(geom,{...casing,weight:style.weight+2.6}));
      R.g30.addLayer(L.polyline(geom,style).bindTooltip(tt,{sticky:true}));
    };
    for(const d of g30.new_lines){
      if(!vsel.has(d.kv))continue;
      addPath(d.route||[d.ends],{color:C30,weight:d.kv>=380?3:2.2,opacity:.95},
        `<b>${d.name}</b><br>NEW ${d.kv} kV line · ${Math.round(d.s_nom)} MVA · in service ~${d.cod}`);
    }
    for(const u of g30.upgrades){
      if(!vsel.has(u.kv))continue;
      addPath(u.segments,{color:C30,weight:u.kv>=380?3:2.2,opacity:.95,dashArray:'7 6'},
        `<b>${u.name}</b><br>UPGRADE +${u.circ} circuit${u.circ>1?'s':''} · ${u.kv} kV · ~${u.cod}`);
    }
    for(const d of g30.hvdc){
      addPath(d.route||[d.ends],{color:C30,weight:3.4,opacity:.95,dashArray:'2 7'},
        `<b>${d.name}</b><br>NEW HVDC · ${Math.round(d.mw)} MW · ~${d.cod}`);
    }
    for(const b of g30.new_buses){
      R.g30.addLayer(L.circleMarker([b.lat,b.lon],{radius:5.5,color:C30,weight:2,
        fillColor:'#fff',fillOpacity:.95})
        .bindTooltip(`<b>${b.name}</b><br>NEW substation · ${b.kv} kV · ~${b.cod}`,{sticky:true}));
    }
    for(const o of g30.offshore){
      R.g30.addLayer(L.circleMarker([o.lat,o.lon],{radius:6+Math.sqrt(o.mw)/12,color:'#fff',
        weight:2,fillColor:C30,fillOpacity:.95})
        .bindTooltip(`<b>${o.name}</b><br>offshore landing · ${Math.round(o.mw)} MW @ ${o.nvp} · ~${o.cod}`,{sticky:true}));
    }
  },[topo,year,govl,vsel,mapRef.current]);
  // generator spokes: dashed lines from each plant's TRUE registry location
  // (OPSD/MaStR, nearest-bus matched) to the bus it feeds
  useEffect(()=>{
    const m=mapRef.current,R=layRef.current;if(!m||!R.spokes)return;
    R.spokes.clearLayers();
    if(!spokes||!info||!info.bus)return;
    const b=topo.buses.find(x=>x.bus===info.bus);if(!b)return;
    j('/api/sample/bus_plants?bus='+info.bus).then(d=>{
      R.spokes.clearLayers();
      if(!d.plants.length){
        R.spokes.addLayer(L.circleMarker([b.lat,b.lon],{radius:8,color:'#86868b',weight:1,
          fillOpacity:0}).bindTooltip('No registry plant ≥1 MW maps to this bus'));
        return;
      }
      for(const g of d.plants){
        R.spokes.addLayer(L.polyline([[b.lat,b.lon],[g.lat,g.lon]],
          {color:tc(g.carrier),weight:1.3,opacity:.8,dashArray:'4 5'}));
        R.spokes.addLayer(L.circleMarker([g.lat,g.lon],{radius:3.5+Math.sqrt(g.mw)/3,
          color:'rgba(0,0,0,.3)',weight:.6,fillColor:tc(g.carrier),fillOpacity:.9})
         .bindTooltip(`${cn(g.carrier)} · ${MW(g.mw)}<br><span style="color:#86868b">registry location</span>`,{sticky:true}));
      }
      const lats=d.plants.map(p=>p.lat).concat([b.lat]),lons=d.plants.map(p=>p.lon).concat([b.lon]);
      m.fitBounds([[Math.min(...lats),Math.min(...lons)],[Math.max(...lats),Math.max(...lons)]],{padding:[40,40]});
    });
  },[spokes,info,topo,mapRef.current]);
  const vtoggle=v=>setVsel(s=>{const x=new Set(s);x.has(v)?x.delete(v):x.add(v);return x});
  return h`<div class="view" style=${{display:active?'block':'none'}}><div class="maplay">
    <div class="map" ref=${ref}></div>
    <aside class="rail">${nav}<header><h2>${tr("Network")}</h2>
      <p>The physical network: every line, transformer and phase-shifter. Click anything to inspect it.</p></header>
      <div class="scroller">
        <div class="sect">${tr("Grid state")}</div>
        <div class="chips">
          <span class=${'chip'+(year===2025?' on':'')} onClick=${()=>setYear(2025)}>${tr('Grid')} 2025</span>
          ${[2030,2032,2035].map(y=>h`
          <span key=${y} class=${'chip'+(year===y?' on':'')} onClick=${()=>setYear(y)}
            title=${'Grid_Final_2025 plus every committed (safe/firm) measure in service by '+y}>
            <span class="sw" style=${{background:C30}}></span>${tr('Grid')} ${y}</span>`)}
        </div>
        ${year!==2025&&h`<p class="note" style=${{marginTop:2}}>
          ${!govl[year]?`Loading ${year} build-out…`:h`Committed build-out by ${year}, drawn in${' '}
          <b style=${{color:C30}}>orange</b> over the 2025 grid:${' '}
          <b>${govl[year].meta.new_lines}</b> new lines · <b>${govl[year].meta.upgrades}</b> corridor
          upgrades (dashed) · <b>${govl[year].meta.hvdc}</b> HVDC corridors (dotted) ·${' '}
          <b>${govl[year].meta.new_buses}</b> new substations (rings) ·${' '}
          <b>${(govl[year].meta.offshore_mw/1000).toFixed(1)} GW</b> new offshore landings (filled dots).
          Sources: NEP 2025 2nd draft + §14d plans (incl. re-harvested Maßnahmentabellen), safe/firm only.`}</p>`}
        <div class="sect">${tr("Voltage levels")}</div>
        <div class="chips">${[110,220,380].map(v=>h`
          <span class=${'chip'+(vsel.has(v)?' on':'')} key=${v} onClick=${()=>vtoggle(v)}>
            <span class="sw" style=${{background:VCOL[v]}}></span>${v} kV</span>`)}</div>
        <div class="sect">${tr("Elements")}</div>
        <div class="chips">
          <span class=${'chip'+(show.buses?' on':'')} onClick=${()=>setShow(s=>({...s,buses:!s.buses}))}>${tr('Buses')}</span>
          <span class=${'chip'+(show.trafos?' on':'')} onClick=${()=>setShow(s=>({...s,trafos:!s.trafos}))}>${tr('Transformers')}</span>
          <span class=${'chip'+(show.pst?' on':'')} onClick=${()=>setShow(s=>({...s,pst:!s.pst}))}>
            <span class="sw" style=${{background:'#af52de'}}></span>${tr('Phase-shifters')}</span>
          <span class=${'chip'+(show.links?' on':'')} onClick=${()=>setShow(s=>({...s,links:!s.links}))}>
            <span class="sw" style=${{background:'#5856d6'}}></span>${tr('HVDC')}</span>
        </div>
        ${topo&&h`<p class="note">${topo.lines.length.toLocaleString()} lines · ${topo.trafos.filter(t=>!t.pst).length} transformers ·
          ${topo.trafos.filter(t=>t.pst).length} phase-shifters · ${(topo.links||[]).length} HVDC links · ${topo.buses.length.toLocaleString()} buses</p>`}
        <div class="sect">${tr("Inspector")}</div>
        ${!info&&h`<div class="panel"><span class="note">Click a line, HVDC link, bus, transformer or phase-shifter on the map. Turn on “Buses” to make them clickable.</span></div>`}
        ${info&&info.line&&h`<div class="panel">
          <b style=${{fontFamily:'var(--disp)',fontSize:13}}>${bn(info.line.bus0)} – ${bn(info.line.bus1)}</b>
          <div class="note">Line ${info.line.id}</div>
          <table><tbody>
            <tr><td>voltage</td><td>${info.line.v} kV</td></tr>
            <tr><td>rating</td><td>${MW(info.line.s_nom)}</td></tr>
            <tr><td>length</td><td>${info.line.length_km} km</td></tr>
            <tr><td>reactance x</td><td>${info.line.x_ohm} Ω</td></tr>
            <tr><td>resistance r</td><td>${info.line.r_ohm} Ω</td></tr>
            <tr><td>cables</td><td>${info.line.cables} (${Math.round(info.line.cables/3)||'?'} circuit${info.line.cables>3?'s':''})</td></tr>
            <tr><td>buses</td><td>${info.line.bus0} ↔ ${info.line.bus1}</td></tr>
          </tbody></table>
          <div class="chips" style=${{marginTop:8}}>
            <span class="chip" onClick=${()=>openBus(info.line.bus0)}>Open bus ${info.line.bus0}</span>
            <span class="chip" onClick=${()=>openBus(info.line.bus1)}>Open bus ${info.line.bus1}</span>
          </div></div>`}
        ${info&&info.link&&h`<div class="panel">
          <b style=${{fontFamily:'var(--disp)',fontSize:13}}>${bn(info.link.bus0)} – ${bn(info.link.bus1)}</b>
          <div class="note">HVDC link ${info.link.id}</div>
          <table><tbody>
            <tr><td>technology</td><td>${info.link.carrier} (HVDC)</td></tr>
            <tr><td>rating</td><td>${MW(info.link.p_nom)}</td></tr>
            <tr><td>length</td><td>${info.link.length_km} km</td></tr>
            <tr><td>buses</td><td>${info.link.bus0} ↔ ${info.link.bus1}</td></tr>
          </tbody></table>
          <div class="chips" style=${{marginTop:8}}>
            <span class="chip" onClick=${()=>openBus(info.link.bus0)}>Open bus ${info.link.bus0}</span>
            <span class="chip" onClick=${()=>openBus(info.link.bus1)}>Open bus ${info.link.bus1}</span>
          </div></div>`}
        ${info&&info.trafo&&h`<div class="panel">
          <b style=${{fontFamily:'var(--disp)',fontSize:13}}>${bn(info.trafo.bus0)}</b>
          <div class="note">${info.trafo.pst?'Phase-shifter':'Transformer'} ${info.trafo.id}</div>
          <table><tbody>
            <tr><td>coupling</td><td>${info.trafo.v0} ↔ ${info.trafo.v1} kV</td></tr>
            <tr><td>rating</td><td>${MW(info.trafo.s_nom)}</td></tr>
            <tr><td>buses</td><td>${info.trafo.bus0} ↔ ${info.trafo.bus1}</td></tr>
          </tbody></table>
          <div class="chips" style=${{marginTop:8}}>
            <span class="chip" onClick=${()=>openBus(info.trafo.bus0)}>Open bus ${info.trafo.bus0}</span>
            <span class="chip" onClick=${()=>openBus(info.trafo.bus1)}>Open bus ${info.trafo.bus1}</span>
          </div></div>`}
        ${info&&info.bus&&h`<div class="panel">
          <b style=${{fontFamily:'var(--disp)',fontSize:13}}>${info.name||'Bus '+info.bus}</b>
          <div class="note">Bus ${info.bus} · ${info.v_nom} kV</div>
          <div class="note">installed capacity ${P(info.installed_MW)} across ${info.n_generators} generators ·
            ${info.transformers.length} transformer${info.transformers.length===1?'':'s'} · ${info.lines.length} lines</div>
          ${Object.keys(info.cap_by_carrier_MW).length>0&&h`<table><thead><tr><th>${tr("carrier")}</th><th>${tr("installed")}</th></tr></thead><tbody>
            ${Object.entries(info.cap_by_carrier_MW).map(([c,p])=>h`<tr key=${c}>
              <td><${Dot} c=${c}/>${cn(c)}</td><td>${MW(p)}</td></tr>`)}</tbody></table>`}
          ${info.transformers.length>0&&h`<div class="note">${info.transformers.map(t=>
            `${t.pst?'PST':'trafo'} ${t.id}: ${t.v0}↔${t.v1} kV, ${Math.round(t.s_nom)} MW`).join(' · ')}</div>`}
          ${info.n_generators>0&&h`<div class="chips" style=${{marginTop:8}}>
            <span class=${'chip'+(spokes?' on':'')} onClick=${()=>setSpokes(s=>!s)}>
              ${spokes?'Hide':'Show'} connected plants</span></div>`}
        </div>`}
      </div>
    </aside>
  </div></div>`;
}

export {C30,Grid,VCOL};
