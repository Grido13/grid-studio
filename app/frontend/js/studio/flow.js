import {h,useEffect,useRef,useState} from './core.js';
import {tr} from './i18n.js';
import {GW,MW,cn,loadColor} from './format.js';
import {useMap} from './mapcore.js';
import {bn} from './api.js';
import {Bars,Dot,DsToggle,Timeline} from './ui.js';

/* ── Flows & Redispatch ── */
function Flow({active,hour,state,snaps,setHour,ds,setDs,dsAvail,nav}){
  const [ref,mapRef]=useMap(active);
  const [post,setPost]=useState(false);
  const [curt,setCurt]=useState(false);
  const layRef=useRef({});
  // the ~9.3k line polylines are built ONCE per grid (year); every hour / toggle
  // only calls setStyle on them — a full rebuild each scrub froze the map
  const flowRef=useRef({key:null,layers:[],lines:null});
  useEffect(()=>{
    const m=mapRef.current;if(!m||!state)return;
    const R=layRef.current,F=flowRef.current;
    if(!R.lines)R.lines=L.layerGroup().addTo(m);
    if(!R.links)R.links=L.layerGroup().addTo(m);
    if(!R.curt)R.curt=L.layerGroup();
    const sty=ln=>{const l=(post?ln.load_post:ln.load_da)||0;
      return{color:loadColor(l),weight:l>1?Math.min(1.5+l*1.6,6):(ln.v>=380?1.8:ln.v>=220?1.3:.65),opacity:l>.8?.95:.6}};
    F.lines=state.lines;   // tooltips always read the current hour through F
    const key=(state.country?state.country.year:2025)+':'+state.lines.length;
    if(F.key!==key){
      F.key=key;F.layers=[];
      R.lines.clearLayers();R.links.clearLayers();
      state.lines.forEach((ln,ix)=>{
        if(ln.flow_da===null){F.layers.push(null);return}
        const pl=L.polyline([[ln.y0,ln.x0],[ln.y1,ln.x1]],sty(ln))
         .bindTooltip(()=>{const c=F.lines[ix]||ln;
           return `<b>${bn(c.bus0)} – ${bn(c.bus1)}</b><br>Line ${c.id} · ${c.v} kV<br>before ${Math.round((c.load_da||0)*100)}% · after ${Math.round((c.load_post||0)*100)}%`},{sticky:true});
        F.layers.push(pl);R.lines.addLayer(pl);
      });
      for(const lk of (state.links||[])){
        R.links.addLayer(L.polyline([[lk.y0,lk.x0],[lk.y1,lk.x1]],
          {color:'#5856d6',weight:1.6,opacity:.55,dashArray:'7 6'})
         .bindTooltip(()=>`<b>${bn(lk.bus0)} – ${bn(lk.bus1)}</b><br>HVDC link ${lk.id} · ${MW(lk.p_nom)} rating`,{sticky:true}));
      }
    }else{
      state.lines.forEach((ln,ix)=>{const pl=F.layers[ix];if(pl)pl.setStyle(sty(ln))});
    }
    R.curt.clearLayers();
    if(curt)for(const nd of state.nodes){if(nd.curtail_MW>1)
      R.curt.addLayer(L.circleMarker([nd.lat,nd.lon],{radius:Math.min(3+Math.sqrt(nd.curtail_MW)/3,16),
        color:'rgba(0,0,0,.2)',weight:.5,fillColor:'#ff3b30',fillOpacity:.78})
       .bindTooltip(()=>`<b>${bn(nd.bus)}</b><br>Bus ${nd.bus} · curtailed ${nd.curtail_MW} MW`,{sticky:true}))}
    curt?m.addLayer(R.curt):m.removeLayer(R.curt);
  },[state,post,curt,mapRef.current]);
  const c=state?.country;
  const sgn=x=>(x>=0?'+':'−')+Math.abs(x/1000).toFixed(1);
  return h`<div class="view" style=${{display:active?'block':'none'}}><div class="maplay">
    <div class="mapcol"><${Timeline} snaps=${snaps} hour=${hour} setHour=${setHour}/><div class="map" ref=${ref}></div></div>
    <aside class="rail">${nav}<header><h2>${tr("Flows & redispatch")}</h2>
      <p>${ds==='n1'
        ?tr('N-1-secured run: redispatch also protects against every single-line outage.')
        :tr('Line loadings and what the DSO ↔ TSO cascade changed this hour.')}</p></header>
      <div class="scroller">
        <${DsToggle} ds=${ds} setDs=${setDs} avail=${dsAvail}/>
        <div class="chips">
          <span class=${'chip'+(!post?' on':'')} onClick=${()=>setPost(false)}>${tr('Before')}</span>
          <span class=${'chip'+(post?' on':'')} onClick=${()=>setPost(true)}>${tr('After redispatch')}</span>
          <span class=${'chip'+(curt?' on':'')} onClick=${()=>setCurt(v=>!v)}>
            <span class="sw" style=${{background:'#ff3b30'}}></span>${tr('Curtailment')}</span>
        </div>
        <div class="legend"><i style=${{background:'#34c759'}}></i>${tr('under 80%')} <i style=${{background:'#ffcc00'}}></i>80–100%
          <i style=${{background:'#ff9500'}}></i>100–150% <i style=${{background:'#ff3b30'}}></i>${tr('over 150%')}</div>
        ${c&&h`<div>
        <div class="kpis">
          <div class="kpi"><div class="v">${GW(c.total_load_MW)}</div><div class="k">${tr("load GW")}</div></div>
          <div class="kpi"><div class="v">${GW(c.total_gen_MW)}</div><div class="k">${tr("gen GW")}</div></div>
          <div class="kpi"><div class="v" style=${{color:'var(--red)'}}>${(c.total_curtail_MW/1000).toFixed(2)}</div><div class="k">${tr("curtailed GW")}</div></div>
        </div>
        <div class="sect">${tr("Energy balance")}</div>
        <div class="panel">
          <div style=${{fontFamily:'var(--mono)',fontSize:12.5,fontWeight:600,marginBottom:4}}>
            gen ${GW(c.total_gen_MW)} ${sgn(c.imports_MW)} imp ${sgn(c.storage_MW)} stor = load ${GW(c.total_load_MW)} ${sgn(c.exports_MW)} exp</div>
          <div class="note">${tr('Balanced by construction — market dispatch, exports and grid share one demand.')}
          ${tr('Overloads:')} ${c.n_overload} ${tr('before')} → <b>${c.n_overload_post}</b> ${tr('after')}
          (${tr('DSO')} 110 kV ${c.n_dso}→${c.n_dso_post} · ${tr('TSO')} ${c.n_tso}→${c.n_tso_post}).</div>
        </div>
        <div class="sect">${tr("Top overloads · before → after")}</div>
        <table><thead><tr><th>${tr("line")}</th><th>${tr("kV")}</th><th>${tr("before")}</th><th>${tr("after")}</th></tr></thead><tbody>
        ${(c.top_overloads||[]).map(o=>h`<tr key=${o.id}><td>${o.id}</td><td>${o.v}</td>
          <td class=${o.load_da>1?'bad':'good'}>${Math.round(o.load_da*100)}%</td>
          <td class=${o.load_post>1?'bad':'good'}>${Math.round(o.load_post*100)}%</td></tr>`)}
        </tbody></table>
        ${c.n1&&h`<div>
        <div class="sect">${tr("N-1 contingency check")}</div>
        <div class="panel">
          <div class="note">${c.n1.n_cont} credible outages screened (lines above 40% loading).
          Pairs that would overload under a single outage:
          ${c.n1.viol_pre} before → <b class=${c.n1.viol_post>0?'bad':'good'}>${c.n1.viol_post}</b> after redispatch.
          Worst post-contingency loading ${Math.round(c.n1.worst_pre*100)}% → <b>${Math.round(c.n1.worst_post*100)}%</b>.</div>
        </div>
        ${(c.n1.pairs&&c.n1.pairs.length)?h`<div>
        <div class="sect">${tr("Worst residual N-1 pairs · after redispatch")}</div>
        <table><thead><tr><th>${tr("line")}</th><th>${tr("kV")}</th><th>${tr("if outage of")}</th><th>${tr("loading")}</th></tr></thead><tbody>
        ${c.n1.pairs.map((p,i)=>h`<tr key=${i}><td>${p.line}</td><td>${p.v}</td><td>${p.outage}</td>
          <td class="bad">${Math.round(p.loading*100)}%</td></tr>`)}
        </tbody></table>
        <p class="note">${tr("These pairs stay insecure after all feasible redispatch — structural\n        N-1 weaknesses that need grid reinforcement, not dispatch.")}</p></div>`
        :h`<p class="note">${tr("Every screened outage is safe this hour after redispatch.")}</p>`}
        </div>`}
        <div class="sect">${tr("Curtailed this hour")}</div>
        ${(c.curtail_rows&&c.curtail_rows.length)?h`<table>
          <thead><tr><th>${tr("carrier")}</th><th>${tr("bus")}</th><th>${tr("MW down")}</th></tr></thead><tbody>
          ${c.curtail_rows.map((r,i)=>h`<tr key=${i}><td><${Dot} c=${r.carrier}/>${cn(r.carrier)}</td><td>${bn(r.bus)}</td><td class="bad">−${r.mw}</td></tr>`)}
          </tbody></table>`:h`<p class="note">${tr("Nothing curtailed this hour.")}</p>`}
        <div class="sect">${tr("Ramped up this hour")}</div>
        ${(c.rampup_rows&&c.rampup_rows.length)?h`<table>
          <thead><tr><th>${tr("carrier")}</th><th>${tr("bus")}</th><th>${tr("MW up")}</th></tr></thead><tbody>
          ${c.rampup_rows.map((r,i)=>h`<tr key=${i}><td><${Dot} c=${r.carrier}/>${cn(r.carrier)}</td><td>${bn(r.bus)}</td><td class="good">+${r.mw}</td></tr>`)}
          </tbody></table>`:h`<p class="note">${tr("Nothing ramped up this hour.")}</p>`}
        <div class="sect">${tr("Generation by technology")}</div>
        <${Bars} obj=${c.gen_by_tech_MW}/>
        </div>`}
      </div>
    </aside>
  </div></div>`;
}

export {Flow};
