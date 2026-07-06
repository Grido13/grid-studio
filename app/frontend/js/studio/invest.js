import {h,useCallback,useEffect,useMemo,useRef,useState} from './core.js';
import {tr} from './i18n.js';
import {MW} from './format.js';
import {useMap} from './mapcore.js';
import {VCOL} from './gridtab.js';

/* ── Investment plan: NEP 2025 (TSO) + §14d DSO upcoming lines & substations ── */
const TIERCOL={safe:'#34c759',firm:'#0a84ff',likely:'#ff9f0a',maybe:'#8e8e93'};
const ITIERS=['safe','firm','likely','maybe'];
const TIERHINT={safe:'built / under construction',firm:'decided · Startnetz',likely:'in planning · confirmed need',maybe:'proposed · not yet confirmed'};
const ilvl=d=>(d.grid_level||'').startsWith('TSO')?'TSO':'DSO';
const itip=d=>`${d.name||''} · ${d.operator||''} · ${d.commitment}${d.cod_year?' · '+d.cod_year:''}`;
const icolor=(d,mode)=>mode==='voltage'?(d.is_hvdc?'#00c7be':(VCOL[d.voltage_kv]||'#86868b')):(TIERCOL[d.commitment]||'#86868b');
const isLine=d=>d.from!==undefined;
const iMatched=d=>isLine(d)?!!(d.from_bus_id&&d.to_bus_id):!!d.bus_id;
const iReady=d=>iMatched(d)&&(d.match_confidence>=0.65||d.review_status==='confirmed')
  &&d.review_status!=='rejected'&&(d.commitment==='safe'||d.commitment==='firm')&&d.is_future!==0;

function Invest({active,nav}){
  const [ref,mapRef]=useMap(active);
  const [data,setData]=useState(null);
  const [op,setOp]=useState('');
  const [tiers,setTiers]=useState(new Set(['safe','firm']));  // committed only by default
  const [cod,setCod]=useState(2034);
  const [undated,setUndated]=useState(true);
  const [show,setShow]=useState({line:true,sub:true,hvdc:true});
  const [futureOnly,setFutureOnly]=useState(true);   // pipeline view by default
  const [mode,setMode]=useState('tier');     // colour by tier | voltage
  const [matchF,setMatchF]=useState('');     // '' | matched | ready | unmatched
  const [sort,setSort]=useState({k:'cod_year',d:1});
  const [q,setQ]=useState('');
  const [exY,setExY]=useState(2031);
  const [info,setInfo]=useState(null);
  const [err,setErr]=useState(null);
  const layRef=useRef({});
  useEffect(()=>{
    if(active&&!data&&!err){
      fetch('/api/investments')
        .then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
        .then(d=>{if(!d||!Array.isArray(d.lines))throw new Error('unexpected payload');setData(d);})
        .catch(e=>setErr(String(e&&e.message||e)));
    }
  },[active,data,err]);

  const pass=useCallback(d=>{
    if(d.is_hvdc&&!show.hvdc)return false;
    if(op&&d.operator!==op)return false;
    if(futureOnly&&d.is_future===0)return false;
    if(!tiers.has(d.commitment))return false;
    if(matchF==='matched'&&!iMatched(d))return false;
    if(matchF==='ready'&&!iReady(d))return false;
    if(matchF==='unmatched'&&iMatched(d))return false;
    if(q){const s=(d.name+' '+(d.operator||'')+' '+(d.nep_measure||'')).toLowerCase();
      if(!s.includes(q.toLowerCase()))return false;}
    if(d.cod_year==null)return undated;
    return d.cod_year<=cod;
  },[op,tiers,cod,undated,show.hvdc,futureOnly,matchF,q]);

  const ops=useMemo(()=>{
    if(!data)return{tso:[],dso:[]};
    const lvl={};for(const d of data.lines.concat(data.substations))if(d.operator&&!(d.operator in lvl))lvl[d.operator]=ilvl(d);
    const all=data.meta.operators;
    return{tso:all.filter(o=>lvl[o]==='TSO'),dso:all.filter(o=>lvl[o]!=='TSO')};
  },[data]);

  // filtered rows (table) + funnel: total -> on map -> bus-matched -> model-ready
  const rows=useMemo(()=>{
    if(!data)return[];
    const out=[];
    if(show.line)for(const d of data.lines)if(pass(d))out.push(d);
    if(show.sub)for(const d of data.substations)if(pass(d))out.push(d);
    const tv=t=>ITIERS.indexOf(t);
    const key={name:d=>(d.name||'').toLowerCase(),operator:d=>(d.operator||'').toLowerCase(),
      voltage_kv:d=>+d.voltage_kv||0,cod_year:d=>d.cod_year||9999,
      commitment:d=>tv(d.commitment),model:d=>iReady(d)?0:iMatched(d)?1:2}[sort.k]||(d=>d.cod_year||9999);
    out.sort((a,b)=>{const x=key(a),y=key(b);return(x<y?-1:x>y?1:0)*sort.d});
    return out;
  },[data,pass,show.line,show.sub,sort]);
  const funnel=useMemo(()=>{
    let placed=0,matched=0,ready=0;
    for(const d of rows){
      if(isLine(d)?d.placed==='line':d.placed)placed++;
      if(iMatched(d))matched++;if(iReady(d))ready++;
    }
    return{total:rows.length,placed,matched,ready};
  },[rows]);

  useEffect(()=>{
    const m=mapRef.current;if(!m||!data)return;
    const R=layRef.current;
    for(const k of ['lines','subs']){if(!R[k])R[k]=L.layerGroup();R[k].clearLayers();}
    // map shows only fully placed features; partial/unplaced rows live in the table
    if(show.line)for(const d of data.lines){
      if(d.placed!=='line'||!pass(d))continue;
      const c=icolor(d,mode),sel=info===d;
      // official BNetzA corridor path where available, straight line otherwise
      const geom=d.route||[[[d.y0,d.x0],[d.y1,d.x1]]];
      R.lines.addLayer(L.polyline(geom,
        {color:c,weight:sel?4:d.voltage_kv>=380?2.2:d.voltage_kv>=220?1.6:1,opacity:sel?1:.82,
         dashArray:(d.commitment==='maybe'||d.commitment==='likely')?'6 5':null})
        .bindTooltip(itip(d),{sticky:true}).on('click',()=>setInfo(d)));
    }
    if(show.sub)for(const d of data.substations){
      if(!d.placed||!pass(d))continue;const c=icolor(d,mode),sel=info===d;
      R.subs.addLayer(L.circleMarker([d.lat,d.lon],{radius:sel?6.5:4,color:sel?'#1d1d1f':'rgba(0,0,0,.25)',weight:sel?1.5:.5,fillColor:c,fillOpacity:.9})
        .bindTooltip(itip(d),{sticky:true}).on('click',()=>setInfo(d)));
    }
    for(const k of ['lines','subs'])if(!m.hasLayer(R[k]))m.addLayer(R[k]);
  },[data,op,tiers,cod,undated,show,mode,matchF,q,futureOnly,info,mapRef.current]);

  const pick=d=>{
    setInfo(d);
    const m=mapRef.current;if(!m)return;
    if(isLine(d)&&d.placed==='line')m.fitBounds([[d.y0,d.x0],[d.y1,d.x1]],{maxZoom:9,padding:[60,60]});
    else if(!isLine(d)&&d.placed)m.setView([d.lat,d.lon],Math.max(m.getZoom(),9));
  };
  const reviewMatch=(d,status)=>{
    fetch('/api/investments/review',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({kind:isLine(d)?'line':'substation',id:d.id,status})})
      .then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
      .then(()=>{d.review_status=status;setData(x=>({...x}));})
      .catch(e=>alert('review failed: '+e.message));
  };
  const ttoggle=t=>setTiers(s=>{const x=new Set(s);x.has(t)?x.delete(t):x.add(t);return x});
  const hsort=k=>setSort(s=>({k,d:s.k===k?-s.d:1}));
  const arrow=k=>sort.k===k?(sort.d>0?' ↑':' ↓'):'';
  const CAP=400;
  const qmarks=d=>h`${d.capacity_mw&&d.capacity_estimated?h`<span class="iq warn" title="capacity is a standard per-circuit estimate, not stated in the source">cap~</span>`:''}
    ${d.length_km&&d.length_estimated?h`<span class="iq warn" title="length estimated (haversine x 1.2)">len~</span>`:''}
    ${d.cod_carried?h`<span class="iq warn" title="commissioning year carried from the §14d snapshot horizon, not stated per measure">cod→</span>`:''}`;
  const mdot=d=>{
    const ok=iMatched(d),ready=iReady(d);
    const t=ok?`model bus ${isLine(d)?d.from_bus_id+' → '+d.to_bus_id:d.bus_id} · ${d.match_method||''} · conf ${d.match_confidence!=null?d.match_confidence:'—'}`
              :(d.match_method==='new_build'?'new-build site — gets a new bus on export':'no model bus match');
    return h`<span title=${t} style=${{color:ready?'#34c759':ok?'#0a84ff':'var(--ink3)',fontFamily:'var(--mono)',fontSize:'11px'}}>${ready?'●':ok?'◐':'○'}</span>`;
  };
  return h`<div class="view" style=${{display:active?'block':'none'}}><div class="maplay">
    <div class="itable">
      <div class="ihead">
        <input class="isel" style=${{marginBottom:6}} placeholder="Search measures, operators, M-numbers…" value=${q} onInput=${e=>setQ(e.target.value)}/>
        <div class="funnel">
          <span class="fs"><b>${funnel.total}</b> shown</span>
          <span class="fs" title="drawn on the map (both endpoints located)"><b>${funnel.placed}</b> on map</span>
          <span class="fs" title="linked to Grid_Final_2025 buses"><b>${funnel.matched}</b> bus-matched</span>
          <span class="fs" title="bus-matched at high confidence, committed tier, not yet in service — included in the model export"><b>${funnel.ready}</b> model-ready</span>
        </div>
        <div class="chips" style=${{margin:'2px 0 4px'}}>
          ${['','matched','ready','unmatched'].map(f=>h`<span key=${f} class=${'chip'+(matchF===f?' on':'')}
            onClick=${()=>setMatchF(f)}>${f===''?'all':f==='ready'?'model-ready':f}</span>`)}
        </div>
      </div>
      <div class="ibody">
        <table><thead><tr>
          <th onClick=${()=>hsort('name')}>measure${arrow('name')}</th>
          <th onClick=${()=>hsort('operator')}>operator${arrow('operator')}</th>
          <th onClick=${()=>hsort('voltage_kv')}>kV${arrow('voltage_kv')}</th>
          <th onClick=${()=>hsort('cod_year')}>COD${arrow('cod_year')}</th>
          <th onClick=${()=>hsort('commitment')}>tier${arrow('commitment')}</th>
          <th onClick=${()=>hsort('model')} title="● model-ready · ◐ bus-matched · ○ unmatched">model${arrow('model')}</th>
        </tr></thead><tbody>
          ${rows.slice(0,CAP).map(d=>h`<tr key=${(isLine(d)?'l':'s')+d.id} class=${info===d?'sel':''} onClick=${()=>pick(d)}>
            <td style=${{maxWidth:230,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title=${d.name}>
              <span class="idot" style=${{background:icolor(d,mode)}}></span>${d.nep_measure?h`<span class="iq">${d.nep_measure}</span> `:''}${d.name}${qmarks(d)}</td>
            <td style=${{maxWidth:110,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title=${d.operator}>${d.operator||'—'}</td>
            <td>${d.voltage_kv||'—'}${d.is_hvdc?' DC':''}</td>
            <td>${d.cod_year||'—'}</td>
            <td><span style=${{color:TIERCOL[d.commitment]}}>${d.commitment}</span></td>
            <td>${mdot(d)}</td>
          </tr>`)}
        </tbody></table>
        ${rows.length>CAP?h`<p class="note">Showing the first ${CAP} of ${rows.length} rows — refine the filters or search to narrow down.</p>`:''}
        ${!rows.length&&data?h`<p class="note">${tr("No measures match the current filters.")}</p>`:''}
      </div>
    </div>
    <div class="map" ref=${ref}></div>
    <aside class="rail">${nav}<header><h2>${tr("Investment plan")}</h2>
      <p>Upcoming lines and substations — NEP 2037/2045 (2025, 2nd draft) via the digital
      Projektbibliothek for the TSOs, §14d EnWG Netzausbaupläne 2024 for the largest DSOs.
      Rows link to Grid_Final_2025 model buses where matched.</p></header>
      <div class="scroller">
        ${err?h`<p class="note" style=${{color:'#ff3b30'}}>⚠ Couldn't load investment data (${err}).<br/>
          Restart the backend so <code>/api/investments</code> is available, then reload.</p>`
         :!data?h`<p class="note">${tr("Loading investment data…")}</p>`:''}
        <div class="sect">${tr("Operator")}</div>
        <select class="isel" value=${op} onChange=${e=>setOp(e.target.value)}>
          <option value="">All operators</option>
          ${ops.tso.length?h`<optgroup label="TSO">${ops.tso.map(o=>h`<option key=${o} value=${o}>${o}</option>`)}</optgroup>`:''}
          ${ops.dso.length?h`<optgroup label="DSO">${ops.dso.map(o=>h`<option key=${o} value=${o}>${o}</option>`)}</optgroup>`:''}
        </select>
        <div class="sect">${tr("Commitment tier")}</div>
        <div class="chips">${ITIERS.map(t=>h`
          <span class=${'chip'+(tiers.has(t)?' on':'')} key=${t} title=${TIERHINT[t]} onClick=${()=>ttoggle(t)}>
            <span class="sw" style=${{background:TIERCOL[t]}}></span>${t}</span>`)}</div>
        <div class="sect">${tr("In service by")} ${cod}</div>
        <input type="range" min="2025" max="2045" step="1" value=${cod} style=${{width:'100%'}}
          onInput=${e=>setCod(+e.target.value)}/>
        <label class="note" style=${{display:'flex',gap:6,alignItems:'center',marginTop:4}}>
          <input type="checkbox" checked=${undated} onChange=${e=>setUndated(e.target.checked)}/> include measures with no stated year</label>
        <div class="sect">${tr("Display")}</div>
        <div class="chips">
          <span class=${'chip'+(show.line?' on':'')} onClick=${()=>setShow(s=>({...s,line:!s.line}))}>Lines</span>
          <span class=${'chip'+(show.sub?' on':'')} onClick=${()=>setShow(s=>({...s,sub:!s.sub}))}>Substations</span>
          <span class=${'chip'+(show.hvdc?' on':'')} title="HGÜ — HVDC corridors (SuedLink etc.)" onClick=${()=>setShow(s=>({...s,hvdc:!s.hvdc}))}>HVDC (HGÜ)</span>
          <span class=${'chip'+(futureOnly?' on':'')} title="Hide assets already in service (COD < 2026 / commissioned) — show only the to-build pipeline" onClick=${()=>setFutureOnly(v=>!v)}>Future only</span>
          <span class="chip" onClick=${()=>setMode(m=>m==='tier'?'voltage':'tier')}>Colour: ${mode}</span>
        </div>
        <div class="sect">${tr("Model export")}</div>
        <p class="note" style=${{marginTop:2}}>PyPSA-ready CSVs (new lines, upgrades, HVDC links, new buses)
          for one horizon — committed (safe/firm), bus-matched rows only.</p>
        <div style=${{display:'flex',gap:8,alignItems:'center'}}>
          <select class="isel" style=${{width:'auto',flex:1}} value=${exY} onChange=${e=>setExY(+e.target.value)}>
            ${[2028,2031,2034].map(y=>h`<option key=${y} value=${y}>in service by ${y}</option>`)}
          </select>
          <a class="chip on" style=${{textDecoration:'none'}} href=${'/api/investments/export/'+exY} download>Download</a>
        </div>
        <div class="sect">${tr("Inspector")}</div>
        ${!info&&h`<div class="panel"><span class="note">Click a table row or a map feature to inspect it.</span></div>`}
        ${info&&h`<div class="panel">
          <b style=${{fontFamily:'var(--disp)',fontSize:13}}>${info.name||'—'}</b>
          <div class="note" style=${{margin:'3px 0 6px'}}>
            <span style=${{color:TIERCOL[info.commitment],fontWeight:600}}>${info.commitment}</span> · ${info.status_de||info.status||''}</div>
          <table><tbody>
            <tr><td>operator</td><td>${info.operator} (${ilvl(info)})</td></tr>
            <tr><td>type</td><td>${isLine(info)?'Line':'Substation'}${info.type?' · '+info.type:''}${info.technology?' · '+info.technology:''}</td></tr>
            <tr><td>voltage</td><td>${info.voltage_kv?info.voltage_kv+' kV':'—'}${info.is_hvdc?' · HVDC':''}</td></tr>
            ${info.from?h`<tr><td>route</td><td>${info.from} → ${info.to}</td></tr>`:''}
            ${info.capacity_mw?h`<tr><td>capacity</td><td>${info.capacity_mw} MW${info.capacity_estimated?' (estimated)':''}</td></tr>`:''}
            <tr><td>commitment</td><td>${info.commitment} — ${info.status||''}</td></tr>
            <tr><td>in service</td><td>${info.cod_year?('~'+info.cod_year+(info.cod_carried?' (carried from §14d snapshot)':'')):'not stated'}${info.is_future===0?' · already in service':''}</td></tr>
            ${info.length_km?h`<tr><td>length</td><td>${info.length_km} km${info.length_estimated?' (estimated)':''}</td></tr>`:''}
            ${info.num_circuits?h`<tr><td>circuits</td><td>${info.num_circuits}</td></tr>`:''}
            <tr><td>model link</td><td>${iMatched(info)
              ?(isLine(info)?`bus ${info.from_bus_id} → ${info.to_bus_id}`:`bus ${info.bus_id}`)
               +(info.match_confidence!=null?` · conf ${info.match_confidence}`:'')
              :(info.match_method==='new_build'?'new-build site (new bus on export)':'not matched')}
              ${info.review_status==='confirmed'?' · confirmed':info.review_status==='rejected'?' · rejected':''}</td></tr>
            ${info.match_method&&info.match_method!=='new_build'?h`<tr><td>match via</td><td>${info.match_method}</td></tr>`:''}
            ${info.quality_score!=null?h`<tr><td>data quality</td><td>${info.quality_score}/100 stated</td></tr>`:''}
            ${(info.cross_border||info.offshore)?h`<tr><td>connection</td><td>${[info.cross_border?'cross-border':'',info.offshore?'offshore':''].filter(Boolean).join(' · ')}</td></tr>`:''}
            ${(info.location_city||info.location_state)?h`<tr><td>location</td><td>${[info.location_city,info.location_state].filter(Boolean).join(', ')}</td></tr>`:''}
            ${info.law?h`<tr><td>basis</td><td>${info.law}</td></tr>`:''}
            ${info.nep_measure?h`<tr><td>measure id</td><td>${info.nep_measure}</td></tr>`:''}
            <tr><td>source</td><td>${info.source||''}${info.source_page?' · p.'+info.source_page:''}</td></tr>
            ${(info.source_doc&&/^https?:/.test(info.source_doc))?h`<tr><td>project page</td><td><a href=${info.source_doc} target="_blank" rel="noopener">${info.source_doc.replace(/^https?:\/\/(www\.)?/,'').split('/')[0]} ↗</a></td></tr>`:''}
          </tbody></table>
          ${iMatched(info)&&h`<div class="chips" style=${{marginTop:8}}>
            <span class=${'chip'+(info.review_status==='confirmed'?' on':'')}
              title="Mark this bus match as verified — it passes the export gate regardless of confidence"
              onClick=${()=>reviewMatch(info,info.review_status==='confirmed'?'auto':'confirmed')}>Confirm match</span>
            <span class=${'chip'+(info.review_status==='rejected'?' on':'')}
              title="Mark this bus match as wrong — the row is excluded from every export"
              onClick=${()=>reviewMatch(info,info.review_status==='rejected'?'auto':'rejected')}>Reject</span>
          </div>`}
          ${info.reason?h`<p class="note" style=${{marginTop:6}}><b>Why:</b> ${info.reason}</p>`:''}
          ${info.notes?h`<p class="note" style=${{marginTop:4}}>${info.notes}</p>`:''}
        </div>`}
      </div>
    </aside>
  </div></div>`;
}

export {ITIERS,Invest,TIERCOL,TIERHINT,iMatched,iReady,icolor,ilvl,isLine,itip};
