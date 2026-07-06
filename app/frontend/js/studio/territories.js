import {h,useCallback,useEffect,useMemo,useRef,useState} from './core.js';
import {tr} from './i18n.js';
import {useMap} from './mapcore.js';
import {Grid} from './gridtab.js';

/* ── Territories: DSO / TSO service areas ── */
const TSOCOL={TenneT:'#e3582b','50Hertz':'#0aa2a2',Amprion:'#1f6feb',TransnetBW:'#7d4fd1'};
// deterministic, well-spread hue per DSO so neighbours read as distinct
const dsoCol=n=>{let hh=0;for(const c of n)hh=(hh*31+c.charCodeAt(0))>>>0;return`hsl(${hh%360} 52% 56%)`;};
const terrCol=p=>p.level==='TSO'?(TSOCOL[p.operator]||'#0066cc'):dsoCol(p.operator);

function Territories({active,nav}){
  const [ref,mapRef]=useMap(active);
  const [data,setData]=useState(null);
  const [err,setErr]=useState(null);
  const [show,setShow]=useState({tso:true,dso:true});
  const [scope,setScope]=useState('all');   // all | hv  (DSO voltage scope)
  const [op,setOp]=useState('');             // isolate one operator
  const [info,setInfo]=useState(null);
  const layRef=useRef({});
  useEffect(()=>{
    if(active&&!data&&!err){
      fetch('/api/territories')
        .then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
        .then(d=>{if(!d||!d.tso||!d.dso)throw new Error('unexpected payload');setData(d);})
        .catch(e=>setErr(String(e&&e.message||e)));
    }
  },[active,data,err]);

  const ops=useMemo(()=>{
    if(!data)return{tso:[],dso:[]};
    return{tso:data.tso.features.map(f=>f.properties.operator),
           dso:data.dso.features.map(f=>f.properties.operator)};
  },[data]);

  const pass=useCallback(p=>{
    if(op)return p.operator===op;
    if(p.level==='TSO')return show.tso;
    if(!show.dso)return false;
    return scope==='all'||p.level==='HV-DSO';
  },[op,show,scope]);

  const shown=useMemo(()=>{
    if(!data)return{nT:0,nD:0};
    let nT=0,nD=0;
    for(const f of data.tso.features)if(pass(f.properties))nT++;
    for(const f of data.dso.features)if(pass(f.properties))nD++;
    return{nT,nD};
  },[data,pass]);

  useEffect(()=>{
    const m=mapRef.current;if(!m||!data)return;
    const R=layRef.current;
    if(!R.g){R.g=L.layerGroup().addTo(m);}
    R.g.clearLayers();
    const feats=data.tso.features.concat(data.dso.features).filter(f=>pass(f.properties));
    for(const f of feats){
      const p=f.properties,c=terrCol(p),sel=op&&op===p.operator;
      const lyr=L.geoJSON(f,{style:{color:c,weight:sel?2.2:1,opacity:.9,fillColor:c,
        fillOpacity:p.level==='TSO'?.12:.28}});
      lyr.bindTooltip(`<b>${p.operator}</b><br/>${p.level} · ${p.voltages}`,{sticky:true});
      lyr.on('mouseover',()=>lyr.setStyle({weight:2.6,fillOpacity:.46}));
      lyr.on('mouseout',()=>lyr.setStyle({weight:sel?2.2:1,fillOpacity:p.level==='TSO'?.12:.28}));
      lyr.on('click',()=>setInfo(p));
      R.g.addLayer(lyr);
    }
  },[data,show,scope,op,mapRef.current]);

  return h`<div class="view" style=${{display:active?'block':'none'}}><div class="maplay">
    <div class="map" ref=${ref}></div>
    <aside class="rail">${nav}<header><h2>${tr("Territories")}</h2>
      <p>Grid-operator service areas — the four TSO control zones (Regelzonen) and the
      110 kV high-voltage DSOs — derived from the model and dissolved over the ~11k
      municipalities. Click any area to inspect it.</p></header>
      <div class="scroller">
        ${err?h`<p class="note" style=${{color:'#ff3b30'}}>⚠ Couldn't load territories (${err}).<br/>
          Run <code>scripts/pipeline/build_territories.py</code> and restart the backend.</p>`
         :!data?h`<p class="note">${tr("Loading territories…")}</p>`:''}
        <div class="sect">${tr("Layers")}</div>
        <div class="chips">
          <span class=${'chip'+(show.tso?' on':'')} onClick=${()=>{setOp('');setShow(s=>({...s,tso:!s.tso}))}}>TSOs</span>
          <span class=${'chip'+(show.dso?' on':'')} onClick=${()=>{setOp('');setShow(s=>({...s,dso:!s.dso}))}}>DSOs</span>
        </div>
        <div class="sect">${tr("DSO scope")}</div>
        <div class="chips">
          <span class=${'chip'+(scope==='all'?' on':'')} onClick=${()=>{setOp('');setScope('all')}}>All DSOs</span>
          <span class=${'chip'+(scope==='hv'?' on':'')} title="DSOs operating a 110 kV network" onClick=${()=>{setOp('');setScope('hv')}}>HV DSOs</span>
        </div>
        ${data&&h`<p class="note">Middle-voltage-only DSOs aren't in the transmission model, so
          <b>All DSOs</b> currently shows the ${ops.dso.length} HV (110 kV) operators.</p>`}
        <div class="sect">${tr("Isolate operator")}</div>
        <select class="isel" value=${op} onChange=${e=>setOp(e.target.value)}>
          <option value="">— show by layer —</option>
          ${ops.tso.length?h`<optgroup label="TSO">${ops.tso.map(o=>h`<option key=${o} value=${o}>${o}</option>`)}</optgroup>`:''}
          ${ops.dso.length?h`<optgroup label="HV-DSO">${ops.dso.slice().sort().map(o=>h`<option key=${o} value=${o}>${o}</option>`)}</optgroup>`:''}
        </select>
        ${data&&h`<p class="note">Showing <b>${shown.nT}</b> TSO ${shown.nT===1?'zone':'zones'}, <b>${shown.nD}</b> DSO ${shown.nD===1?'area':'areas'}.</p>`}
        <div class="sect">${tr("Inspector")}</div>
        ${!info&&h`<div class="panel"><span class="note">Click any territory on the map to inspect it.</span></div>`}
        ${info&&h`<div class="panel">
          <b style=${{fontFamily:'var(--disp)',fontSize:13,display:'inline-flex',alignItems:'center',gap:6}}>
            <span class="sw" style=${{width:9,height:9,borderRadius:'50%',background:terrCol(info),display:'inline-block'}}></span>${info.operator}</b>
          <div class="note" style=${{margin:'3px 0 6px'}}>${info.level}</div>
          <table><tbody>
            <tr><td>type</td><td>${info.level==='TSO'?'Transmission control zone':'HV distribution area'}</td></tr>
            <tr><td>voltage</td><td>${info.voltages}</td></tr>
            <tr><td>municipalities</td><td>${info.n_gem.toLocaleString('en-US')}</td></tr>
            <tr><td>area</td><td>${info.area_km2.toLocaleString('en-US')} km²</td></tr>
          </tbody></table>
        </div>`}
        <p class="note" style=${{marginTop:10}}>Approximate: areas are assigned by nearest
          tagged ${' '}substation, then snapped to municipal boundaries.</p>
      </div>
    </aside>
  </div></div>`;
}

export {TSOCOL,Territories,dsoCol,terrCol};
