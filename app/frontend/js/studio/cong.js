import {h,useEffect,useRef,useState} from './core.js';
import {tr} from './i18n.js';
import {ovlColor} from './format.js';
import {useMap} from './mapcore.js';
import {j} from './api.js';
import {DsToggle} from './ui.js';

/* ── Congestion ── */
function Cong({active,summary,ds,setDs,dsAvail,nav,year}){
  const [ref,mapRef]=useMap(active);
  const [data,setData]=useState(null);
  const [pre,setPre]=useState(false);   // false = after redispatch (default) · true = before (day-ahead PF)
  const dsRef=useRef(null);
  const layRef=useRef(null);
  useEffect(()=>{const key=year+':'+ds;if(active&&dsRef.current!==key){dsRef.current=key;setData(null);
    j('/api/sample/overload_hours?ds='+ds+'&year='+year).then(setData)}},[active,ds,year]);
  // does this dataset have a redispatch stage? horizon PF-only runs leave
  // h_post == h_da on every line, so the toggle would show identical maps.
  const hasRedispatch=data&&data.lines.some(l=>l.h_da!==l.h_post);
  useEffect(()=>{
    const m=mapRef.current;if(!m||!data)return;
    if(!layRef.current)layRef.current=L.layerGroup().addTo(m);
    const lay=layRef.current;lay.clearLayers();
    for(const ln of data.lines){const hv=pre?ln.h_da:ln.h_post;if(hv<1)continue;
      lay.addLayer(L.polyline([[ln.y0,ln.x0],[ln.y1,ln.x1]],
        {color:ovlColor(hv),weight:Math.min(1.5+hv/250,7),opacity:.92})
       .bindTooltip(`Line ${ln.id} · ${ln.v} kV<br>${ln.h_da} h/yr before (day-ahead)<br><b>${ln.h_post} h/yr</b> after redispatch`,{sticky:true}))}
  },[data,pre,mapRef.current]);
  const s=summary;
  return h`<div class="view" style=${{display:active?'block':'none'}}><div class="maplay">
    <div class="map" ref=${ref}></div>
    <aside class="rail">${nav}<header><h2>${tr("Congestion")}</h2>
      <p>${tr('Hours per year each line runs above its rating — ')}${pre?tr('in the day-ahead schedule, before any redispatch.'):tr('after redispatch did all it could.')}</p></header>
      <div class="scroller">
        <${DsToggle} ds=${ds} setDs=${setDs} avail=${dsAvail}/>
        <div class="chips">
          <span class=${'chip'+(pre?' on':'')} onClick=${()=>setPre(true)}>Before (day-ahead)</span>
          <span class=${'chip'+(!pre?' on':'')} onClick=${()=>setPre(false)}>After redispatch</span>
        </div>
        ${data&&!hasRedispatch&&h`<p class="note" style=${{marginTop:-2}}>This year shows the day-ahead
          power flow only — redispatch is being computed, after which the two views will differ.</p>`}
        <div class="legend"><i style=${{background:'#34c759'}}></i>under 10 h <i style=${{background:'#ffcc00'}}></i>under 100 h
          <i style=${{background:'#ff9500'}}></i>under 500 h <i style=${{background:'#ff3b30'}}></i>under 2000 h
          <i style=${{background:'#af52de'}}></i>over 2000 h</div>
        ${s&&(()=>{const dir=(pre,post)=>post<pre?'good':post>pre?'bad':'';   // colour by improvement, not by column
          const rows=[['hours with an overload',s.hours_with_overload_pre,s.hours_with_overload_post,x=>x.toLocaleString()],
            ['lines ever overloaded',s.lines_ever_overloaded_pre,s.lines_ever_overloaded_post,x=>x.toLocaleString()],
            ['overload line-hours / yr',s.line_hours_pre_yr,s.line_hours_post_yr,x=>x.toLocaleString()],
            ['mean overloads / hour',s.mean_overloads_per_hour_pre,s.mean_overloads_per_hour_post,x=>x],
            ['max loading',s.max_loading_pre,s.max_loading_post,x=>Math.round(x*100)+'%']];
          if(s.n1){rows.push(['hours with an N-1 violation',s.n1.hours_with_violation_pre,s.n1.hours_with_violation_post,x=>x.toLocaleString()]);
            rows.push(['N-1 violation pair-hours / yr',s.n1.pair_hours_pre,s.n1.pair_hours_post,x=>x.toLocaleString()])}
          return h`<div><div class="sect">${tr("Annual summary · before vs after")}${s.dataset==='n1'?' · N-1 secured run':''}</div>
        <table><thead><tr><th></th><th>${tr("before")}</th><th>${tr("after")}</th></tr></thead><tbody>
          ${rows.map(([k,pre,post,fmt])=>h`<tr key=${k}><td>${k}</td><td>${fmt(pre)}</td>
            <td class=${dir(pre,post)}>${fmt(post)}</td></tr>`)}
        </tbody></table></div>`})()}
        ${s&&s.tso_dso&&h`<div><div class="sect">${tr("Redispatch by level")}</div>
          <table><tbody>
            <tr><td>TSO redispatch down (EHV)</td><td>${s.tso_dso.tso_down_TWh} TWh</td></tr>
            <tr><td>DSO Einspeisemanagement (110 kV)</td><td>${s.tso_dso.dso_res_curtailment_TWh} TWh</td></tr>
          </tbody></table>
          <p class="note">${tr("Only the EHV row is comparable to the official TSO (netztransparenz)\n          strombedingt volumes; the 110 kV row is distribution-level curtailment, its own category.")}</p></div>`}
        <div class="sect">${tr("Most congested lines")}</div>
        ${data&&h`<table><thead><tr><th>${tr("line")}</th><th>${tr("kV")}</th><th>${tr("h/yr after")}</th><th>${tr("before")}</th></tr></thead><tbody>
          ${data.lines.slice(0,12).map(l=>h`<tr key=${l.id}><td>${l.id}</td><td>${l.v}</td>
            <td class="bad">${l.h_post}</td><td>${l.h_da}</td></tr>`)}</tbody></table>`}
        <p class="note">${tr("Lines that stay congested after redispatch flag a structural need —\n        reinforcement, not dispatch. Most sit on under-built 110 kV feeders.")}</p>
      </div>
    </aside>
  </div></div>`;
}

export {Cong};
