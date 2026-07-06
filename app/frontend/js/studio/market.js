import {h,memo,useEffect,useRef,useState} from './core.js';
import {tr} from './i18n.js';
import {GW,cn,tc} from './format.js';
import {j} from './api.js';
import {Dot} from './ui.js';

/* ── Merit Order: modelled dispatch vs real 2025 market ── */
const MAxes=memo(({w,ht,ymax,ylabel,xlabel})=>{
  const ticks=[0,.25,.5,.75,1].map(f=>Math.round(ymax*f));
  return h`<g>
    ${ticks.map((t,i)=>h`<g key=${i}>
      <line x1="38" x2=${w-6} y1=${ht-18-(i/4)*(ht-26)} y2=${ht-18-(i/4)*(ht-26)} stroke="#f0f0f2"/>
      <text x="33" y=${ht-15-(i/4)*(ht-26)} font-size="8.5" fill="#86868b" text-anchor="end">${t}</text>
    </g>`)}
    <text x="6" y=${ht/2} font-size="8.5" fill="#86868b" transform=${`rotate(-90 10 ${ht/2})`} text-anchor="middle">${ylabel}</text>
    ${xlabel&&h`<text x=${w/2} y=${ht-2} font-size="8.5" fill="#86868b" text-anchor="middle">${xlabel}</text>`}
  </g>`;
});
const MLine=({vals,ymax,w,ht,color,wdt=1.4})=>{
  const n=vals.length;const xs=i=>38+(i/(n-1))*(w-44),ys=v=>ht-18-(Math.max(0,v)/ymax)*(ht-26);
  return h`<path d=${'M'+vals.map((v,i)=>xs(i).toFixed(1)+','+ys(v).toFixed(1)).join('L')}
    fill="none" stroke=${color} stroke-width=${wdt}/>`;
};
const Legend=({items})=>h`<div class="note" style=${{display:'flex',gap:14,flexWrap:'wrap',margin:'2px 0 8px'}}>
  ${items.map(([c,l],i)=>h`<span key=${i}><span style=${{display:'inline-block',width:14,height:2.5,background:c,verticalAlign:'middle',marginRight:5}}></span>${l}</span>`)}</div>`;

const FUELC={solar:'#f4d44d',wind_onshore:'#4da6ff',wind_offshore:'#1a53ff',biomass:'#66bb6a',
  hydro:'#29b6f6',pumped_storage:'#26c6da',gas:'#ff7043',hard_coal:'#616161',lignite:'#8d6e63',
  'other_conventional+oil':'#ab47bc',distributed:'#bcaaa4',imports:'#78909c'};
const FUELN2={solar:'Solar',wind_onshore:'Wind onshore',wind_offshore:'Wind offshore',
  biomass:'Biomass',hydro:'Hydro',pumped_storage:'Pumped storage',gas:'Gas',
  hard_coal:'Hard coal',lignite:'Lignite','other_conventional+oil':'Other conv. + oil',
  distributed:'Distributed (unmetered)',imports:'Imports'};
function Merit({active,nav}){
  const [d,setD]=useState(null);
  const [err,setErr]=useState(false);
  const [day,setDay]=useState(165);     // 15 June
  useEffect(()=>{if(active&&!d&&!err)j('/api/validation/report').then(x=>x&&x.monthly_stack?setD(x):setErr(true)).catch(()=>setErr(true))},[active,d,err]);
  const W=560,Hc=190,Wd=1080,Hd=230;
  const stack=d&&d.monthly_stack;
  const mixTotal=stack?stack.fuels.reduce((a,f)=>a+f.twh,0):1;
  const moTotals=stack?stack.labels.map((_,mi)=>stack.fuels.reduce((a,f)=>a+(f.vals[mi]||0),0)):[];
  const moMax=Math.max(1,...moTotals);
  const dayDate=new Date(Date.UTC(2025,0,1)+day*86400000);
  const dayLabel=dayDate.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'long'});
  const m24=d?d.price_hourly.model.slice(day*24,day*24+24).map(v=>v??0):[];
  const s24=d?d.price_hourly.smard.slice(day*24,day*24+24).map(v=>v??0):[];
  const dMin=d?Math.min(0,...m24,...s24):0;
  const dMax=d?Math.max(10,...m24,...s24):1;
  const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
  const dayMae=mean(m24.map((v,i)=>Math.abs(v-s24[i])));
  return h`<div class="view scrollview" style=${{display:active?'block':'none'}}>
    <div style=${{maxWidth:1080,margin:'0 auto',padding:'14px 30px 80px'}}>
      ${nav}
      <header style=${{margin:'14px 0 18px'}}>
        <h2 style=${{font:'600 24px var(--disp)',margin:'0 0 6px'}}>Merit Order</h2>
        <p class="note" style=${{maxWidth:780,fontSize:13,lineHeight:1.5}}>
          The SMARD-calibrated day-ahead dispatch of the grid_beta fleet: what the market engine
          runs, when, and at what price. Pick any day of 2025 to set the model's hourly clearing
          price beside the measured SMARD day-ahead price.
        </p></header>
      ${!d?h`<p class="note">${err?'Report not found — run a --smard dispatch and scripts/simulation/compare_dispatch_smard.py.':'Loading…'}</p>`:h`<div>
        <div class="sect">${tr("Annual energy mix —")} ${Math.round(mixTotal)} TWh dispatched</div>
        <div style=${{display:'flex',height:16,borderRadius:3,overflow:'hidden',maxWidth:1080}}>
          ${stack.fuels.map(f=>h`<div key=${f.fuel} title=${FUELN2[f.fuel]||f.fuel}
            style=${{width:(100*f.twh/mixTotal)+'%',background:FUELC[f.fuel]||'#999'}}></div>`)}
        </div>
        <div style=${{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:'4px 18px',margin:'10px 0 6px'}}>
          ${stack.fuels.map(f=>h`<div key=${f.fuel} style=${{display:'flex',justifyContent:'space-between',fontSize:12}}>
            <span><span style=${{display:'inline-block',width:9,height:9,borderRadius:2,background:FUELC[f.fuel]||'#999',marginRight:7,verticalAlign:'-1px'}}></span>${FUELN2[f.fuel]||f.fuel}</span>
            <span class="note">${f.twh} TWh · ${(100*f.twh/mixTotal).toFixed(1)}%</span></div>`)}
        </div>

        <div class="sect" style=${{marginTop:26}}>Monthly generation stack — TWh</div>
        <svg viewBox=${`0 0 ${Wd} ${Hd}`} style=${{width:'100%',height:Hd,display:'block'}}>
          <${VAxes} w=${Wd} ht=${Hd} ymin=${0} ymax=${moMax} ylabel="TWh"/>
          ${stack.labels.map((lab,mi)=>{
            const slot=(Wd-44)/12,x=38+mi*slot+slot*0.18,bw=slot*0.64;
            let y=Hd-18;
            const segs=stack.fuels.map(f=>{
              const v=f.vals[mi]||0,hh=(v/moMax)*(Hd-26);y-=hh;
              return h`<rect key=${f.fuel} x=${x.toFixed(1)} y=${y.toFixed(1)} width=${bw.toFixed(1)} height=${Math.max(0,hh).toFixed(1)} fill=${FUELC[f.fuel]||'#999'}/>`;});
            return h`<g key=${mi}>${segs}
              <text x=${(x+bw/2).toFixed(1)} y=${Hd-6} font-size="8.5" fill="#86868b" text-anchor="middle">${lab}</text></g>`;})}
        </svg>

        <div class="sect" style=${{marginTop:26}}>Hourly price — pick a day of 2025</div>
        <div style=${{display:'flex',alignItems:'center',gap:14,maxWidth:1080,margin:'4px 0 10px'}}>
          <button onClick=${()=>setDay(dd=>Math.max(0,dd-1))} style=${{border:'0.5px solid var(--hair)',background:'#fff',borderRadius:6,width:26,height:24,cursor:'pointer',fontSize:13}}>‹</button>
          <input type="range" min="0" max="364" value=${day} onInput=${e=>setDay(+e.target.value)} style=${{flex:1}}/>
          <button onClick=${()=>setDay(dd=>Math.min(364,dd+1))} style=${{border:'0.5px solid var(--hair)',background:'#fff',borderRadius:6,width:26,height:24,cursor:'pointer',fontSize:13}}>›</button>
          <span style=${{fontSize:13,fontWeight:600,minWidth:170,textAlign:'right'}}>${dayLabel}</span>
        </div>
        <${Legend} items=${[['#0066cc','Model'],['var(--ink)','SMARD']]}/>
        <svg viewBox=${`0 0 ${Wd} ${Hd}`} style=${{width:'100%',height:Hd,display:'block'}}>
          <${VAxes} w=${Wd} ht=${Hd} ymin=${dMin} ymax=${dMax} ylabel="€/MWh" xlabel="hour 0 – 23"/>
          <${VLine} vals=${s24} ymin=${dMin} ymax=${dMax} w=${Wd} ht=${Hd} color="currentColor" wdt=${1.4}/>
          <${VLine} vals=${m24} ymin=${dMin} ymax=${dMax} w=${Wd} ht=${Hd} color="#0066cc" wdt=${1.4}/>
        </svg>
        <p class="note">This day: model mean ${mean(m24).toFixed(1)} € vs SMARD ${mean(s24).toFixed(1)} €
          · mean abs. difference ${dayMae.toFixed(1)} €
          · model range ${Math.min(...m24).toFixed(0)+' to '+Math.max(...m24).toFixed(0)} €,
          SMARD ${Math.min(...s24).toFixed(0)+' to '+Math.max(...s24).toFixed(0)} €.
          Full-year price statistics live in the Validation view.</p>
      </div>`}
    </div>
  </div>`;
}

/* ── Validation: SMARD-calibrated dispatch vs SMARD 2025 ── */
const VAxes=memo(({w,ht,ymin,ymax,ylabel,xlabel})=>{
  const span=ymax-ymin||1;
  const ticks=[0,.25,.5,.75,1].map(f=>ymin+span*f);
  const y=v=>ht-18-((v-ymin)/span)*(ht-26);
  return h`<g>
    ${ticks.map((t,i)=>h`<g key=${i}>
      <line x1="38" x2=${w-6} y1=${y(t)} y2=${y(t)} stroke="#f0f0f2"/>
      <text x="33" y=${y(t)+3} font-size="8.5" fill="#86868b" text-anchor="end">${Math.round(t)}</text>
    </g>`)}
    ${ymin<0&&ymax>0&&h`<line x1="38" x2=${w-6} y1=${y(0)} y2=${y(0)} stroke="#d2d2d7" stroke-width="0.8"/>`}
    <text x="6" y=${ht/2} font-size="8.5" fill="#86868b" transform=${`rotate(-90 10 ${ht/2})`} text-anchor="middle">${ylabel}</text>
    ${xlabel&&h`<text x=${w/2} y=${ht-2} font-size="8.5" fill="#86868b" text-anchor="middle">${xlabel}</text>`}
  </g>`;
});
const VLine=({vals,ymin,ymax,w,ht,color,wdt=1.2})=>{
  const v2=vals.map(v=>v==null?0:v),n=v2.length,span=ymax-ymin||1;
  const xs=i=>38+(i/(n-1))*(w-44),ys=v=>ht-18-((Math.min(ymax,Math.max(ymin,v))-ymin)/span)*(ht-26);
  return h`<path d=${'M'+v2.map((v,i)=>xs(i).toFixed(1)+','+ys(v).toFixed(1)).join('L')}
    fill="none" stroke=${color} stroke-width=${wdt}/>`;
};
const FUELN={solar:'Solar',wind_onshore:'Wind onshore',wind_offshore:'Wind offshore',
  biomass:'Biomass',hydro:'Hydro',pumped_storage:'Pumped storage',gas:'Gas',
  hard_coal:'Hard coal',lignite:'Lignite','other_conventional+oil':'Other conv. + oil',
  'distributed (unmetered)':'Distributed (unmetered)'};
/* Model-only market view for horizon scenarios (no measured SMARD reference). */
function MarketModelOnly({active,nav,d}){
  const W=560,Hc=180;
  const pdc=d.price_duration||[];
  const pMax=Math.max(1,...pdc.slice(0,Math.ceil(pdc.length*0.02)));
  const pMin=Math.min(0,...pdc);
  const mo=d.monthly_mean_price||[];
  const moMax=Math.max(1,...mo);
  const ft=Object.entries(d.fuel_twh||{}).filter(([,v])=>v>0.1).sort((a,b)=>b[1]-a[1]);
  const fMax=Math.max(1,...ft.map(([,v])=>v));
  const merit=(d.merit_order||[]).filter(m=>m.p_nom_gw>0.05);
  const ps=d.price_stats||{};
  const MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return h`<div class="view scrollview" style=${{display:active?'block':'none'}}>
    <div style=${{maxWidth:1080,margin:'0 auto',padding:'14px 30px 80px'}}>
      ${nav}
      <div style=${{margin:'14px 0 14px',padding:'10px 14px',borderRadius:10,
        background:'rgba(255,149,0,.12)',border:'1px solid rgba(255,149,0,.35)',
        font:'500 13px var(--ui)',color:'var(--fg)'}}>
        NEP price-path scenario — <b>${d.scenario}</b> (${d.year}). No measured reference
        exists for future years; every figure below is model output.</div>
      <header style=${{margin:'6px 0 18px'}}>
        <h2 style=${{font:'600 24px var(--disp)',margin:'0 0 6px'}}>${tr('Model market · ')}${d.year}</h2>
        <p class="note" style=${{maxWidth:820,fontSize:13,lineHeight:1.5}}>
          Prices: gas ${d.prices.gas_eur_mwh_th} €/MWhth · coal ${d.prices.coal_eur_mwh_th}
          · CO₂ ${d.prices.co2_eur_t} €/t · demand ${d.load_twh} TWh.</p></header>
      <div class="kpis" style=${{maxWidth:860,marginBottom:22}}>
        <div class="kpi"><div class="v">${ps.mean} €</div><div class="k">${tr("mean clearing price")}</div></div>
        <div class="kpi"><div class="v">${ps.median} €</div><div class="k">${tr("median price")}</div></div>
        <div class="kpi"><div class="v">${ps.negative_hours}</div><div class="k">${tr("negative-price hours")}</div></div>
        <div class="kpi"><div class="v">${ps.max} €</div><div class="k">${tr("peak price")}</div></div>
      </div>
      <div style=${{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'26px 34px'}}>
        <div>
          <div class="sect">${tr("Price duration curve — €/MWh, hours sorted high→low")}</div>
          <svg viewBox=${`0 0 ${W} ${Hc}`} style=${{width:'100%',height:Hc}}>
            <polyline fill="none" stroke="#0066cc" stroke-width="2" points=${pdc.map((v,i)=>
              `${(i/(pdc.length-1))*W},${Hc-((v-pMin)/(pMax-pMin))*(Hc-10)-5}`).join(' ')}/>
          </svg>
        </div>
        <div>
          <div class="sect">${tr("Monthly mean price — €/MWh")}</div>
          <svg viewBox=${`0 0 ${W} ${Hc}`} style=${{width:'100%',height:Hc}}>
            ${mo.map((v,i)=>h`<rect key=${i} x=${i*(W/12)+4} y=${Hc-(v/moMax)*(Hc-24)-18}
              width=${W/12-8} height=${(v/moMax)*(Hc-24)} fill="#0066cc" opacity="0.85"/>`)}
            ${mo.map((v,i)=>h`<text key=${'t'+i} x=${i*(W/12)+W/24} y=${Hc-4}
              text-anchor="middle" style=${{font:'10px var(--ui)',fill:'var(--muted)'}}>${MN[i]}</text>`)}
          </svg>
        </div>
        <div>
          <div class="sect">${tr("Annual energy by fuel — TWh")}</div>
          <div>${ft.map(([k,v])=>h`<div class="hbar" key=${k}>
            <span class="n">${FUELN[k]||cn(k)}</span>
            <span class="t"><span class="f" style=${{width:(100*v/fMax)+'%',background:tc(k.replace('wind_','').replace('hard_coal','coal'))}}></span></span>
            <span class="val">${v.toFixed(1)}</span></div>`)}</div>
        </div>
        <div>
          <div class="sect">${tr("Merit order — capacity blocks by SRMC")}</div>
          <table class="tbl" style=${{width:'100%',fontSize:12}}>
            <thead><tr><th style=${{textAlign:'left'}}>Carrier</th><th>${tr("GW")}</th><th>${tr("SRMC €/MWh")}</th></tr></thead>
            <tbody>${merit.map(m=>h`<tr key=${m.carrier}>
              <td style=${{textAlign:'left'}}><${Dot} c=${m.carrier}/>${cn(m.carrier)}</td>
              <td style=${{textAlign:'right'}}>${m.p_nom_gw.toFixed(1)}</td>
              <td style=${{textAlign:'right'}}>${m.srmc.toFixed(0)}</td></tr>`)}</tbody>
          </table>
        </div>
      </div>
    </div></div>`;
}
function Validation({active,nav,year}){
  const [d,setD]=useState(null);
  const [err,setErr]=useState(false);
  const yr=year||2025;
  const yrRef=useRef(null);
  useEffect(()=>{if(active&&yrRef.current!==yr){yrRef.current=yr;setD(null);setErr(false);
    j('/api/validation/report?year='+yr).then(x=>x?setD(x):setErr(true)).catch(()=>setErr(true))}},[active,yr]);
  // horizon scenarios: no measured (SMARD) reference — render the model-only market summary
  if(d&&d.mode==='model_only')return h`<${MarketModelOnly} active=${active} nav=${nav} d=${d}/>`;
  if(active&&yr!==2025&&!d&&!err)return h`<div class="view scrollview" style=${{display:'block'}}>
    <div style=${{maxWidth:1080,margin:'0 auto',padding:'14px 30px'}}>${nav}<p class="note">${tr("Loading model market summary…")}</p></div></div>`;
  const W=560,Hc=190;
  const fuels=d?[...d.fuels].sort((a,b)=>(b.model_twh)-(a.model_twh)):[];
  const fMax=Math.max(1,...fuels.map(f=>Math.max(f.model_twh,f.smard_twh||0)));
  const ps=d&&d.price_stats;
  const dur=d&&d.duration_curve;
  const durMin=dur?Math.min(...dur.model,...dur.smard):0;
  const durMax=dur?Math.min(650,Math.max(...dur.model.slice(0,9),...dur.smard.slice(0,9))):1;
  const day=d&&d.price_daily;
  const dayMax=day?Math.max(...day.model.map(v=>v||0),...day.smard.map(v=>v||0)):1;
  const dayMin=day?Math.min(0,...day.model.map(v=>v||0),...day.smard.map(v=>v||0)):0;
  const mo=d&&d.monthly;
  return h`<div class="view scrollview" style=${{display:active?'block':'none'}}>
    <div style=${{maxWidth:1080,margin:'0 auto',padding:'14px 30px 80px'}}>
      ${nav}
      <header style=${{margin:'14px 0 18px'}}>
        <h2 style=${{font:'600 24px var(--disp)',margin:'0 0 6px'}}>${tr('Dispatch vs SMARD')}</h2>
        <p class="note" style=${{maxWidth:780,fontSize:13,lineHeight:1.5}}>
          The SMARD-calibrated day-ahead dispatch against the measured 2025 market: the model adopts
          SMARD's load curve and hourly solar/wind feed-in, and the market engine dispatches the
          thermal fleet, storage and cross-border trade on its own. Below: how close every fuel,
          the energy balance and the clearing price land to measurement.
        </p></header>
      ${!d?h`<p class="note">${err?'Report not found — run a --smard dispatch and scripts/simulation/compare_dispatch_smard.py.':'Loading…'}</p>`:h`<div>
        <div class="kpis" style=${{maxWidth:860,marginBottom:22}}>
          <div class="kpi"><div class="v">${ps.model.mean} €</div><div class="k">${tr("model mean price")}</div></div>
          <div class="kpi"><div class="v">${ps.smard.mean} €</div><div class="k">${tr("SMARD mean price")}</div></div>
          <div class="kpi"><div class="v">${ps.corr}</div><div class="k">${tr("hourly price correlation")}</div></div>
          <div class="kpi"><div class="v">${ps.mae} €</div><div class="k">${tr("mean abs. error")}</div></div>
          <div class="kpi"><div class="v">${ps.model.neg_hours} / ${ps.smard.neg_hours}</div><div class="k">${tr("negative hours, model / SMARD")}</div></div>
          <div class="kpi"><div class="v">${d.balance.net_position_twh>0?'+':''}${d.balance.net_position_twh} TWh</div><div class="k">net imports (real +${d.balance.ref_net_position})</div></div>
        </div>
        <div style=${{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'26px 34px'}}>
          <div>
            <div class="sect">${tr("Price duration curve — €/MWh, hours sorted high→low")}</div>
            <${Legend} items=${[['#0066cc','Model'],['var(--ink)','SMARD']]}/>
            <svg viewBox=${`0 0 ${W} ${Hc}`} style=${{width:'100%',height:Hc}}>
              <${VAxes} w=${W} ht=${Hc} ymin=${durMin} ymax=${durMax} ylabel="€/MWh" xlabel="hours of the year"/>
              <${VLine} vals=${dur.smard} ymin=${durMin} ymax=${durMax} w=${W} ht=${Hc} color="currentColor"/>
              <${VLine} vals=${dur.model} ymin=${durMin} ymax=${durMax} w=${W} ht=${Hc} color="#0066cc"/>
            </svg>
            <p class="note">Left edge: scarcity hours (capped at 650 € for readability — model
              max ${' '+ps.model.max} €, SMARD ${' '+ps.smard.max} €). Right tail: surplus hours
              with zero and negative prices.</p>
          </div>
          <div>
            <div class="sect">${tr("Day-ahead price — daily mean, €/MWh")}</div>
            <${Legend} items=${[['#0066cc','Model'],['var(--ink)','SMARD']]}/>
            <svg viewBox=${`0 0 ${W} ${Hc}`} style=${{width:'100%',height:Hc}}>
              <${VAxes} w=${W} ht=${Hc} ymin=${dayMin} ymax=${dayMax} ylabel="€/MWh" xlabel="2025"/>
              <${VLine} vals=${day.smard} ymin=${dayMin} ymax=${dayMax} w=${W} ht=${Hc} color="currentColor" wdt=${1}/>
              <${VLine} vals=${day.model} ymin=${dayMin} ymax=${dayMax} w=${W} ht=${Hc} color="#0066cc" wdt=${1}/>
            </svg>
            <p class="note">Median ${ps.model.median} € vs ${ps.smard.median} €; RMSE ${ps.rmse} €;
              p95 ${ps.percentiles.p95[0]} € vs ${ps.percentiles.p95[1]} €.</p>
          </div>
          <div>
            <div class="sect">${tr("Monthly solar — TWh")}</div>
            <${Legend} items=${[['#0066cc','Model'],['var(--ink)','SMARD']]}/>
            <svg viewBox=${`0 0 ${W} ${Hc}`} style=${{width:'100%',height:Hc}}>
              <${VAxes} w=${W} ht=${Hc} ymin=${0} ymax=${Math.max(...mo.solar_model,...mo.solar_smard)} ylabel="TWh" xlabel="Jan – Dec"/>
              <${VLine} vals=${mo.solar_smard} ymin=${0} ymax=${Math.max(...mo.solar_model,...mo.solar_smard)} w=${W} ht=${Hc} color="currentColor"/>
              <${VLine} vals=${mo.solar_model} ymin=${0} ymax=${Math.max(...mo.solar_model,...mo.solar_smard)} w=${W} ht=${Hc} color="#0066cc"/>
            </svg>
          </div>
          <div>
            <div class="sect">${tr("Monthly gas — TWh")}</div>
            <${Legend} items=${[['#0066cc','Model'],['var(--ink)','SMARD']]}/>
            <svg viewBox=${`0 0 ${W} ${Hc}`} style=${{width:'100%',height:Hc}}>
              <${VAxes} w=${W} ht=${Hc} ymin=${0} ymax=${Math.max(...mo.gas_model,...mo.gas_smard)} ylabel="TWh" xlabel="Jan – Dec"/>
              <${VLine} vals=${mo.gas_smard} ymin=${0} ymax=${Math.max(...mo.gas_model,...mo.gas_smard)} w=${W} ht=${Hc} color="currentColor"/>
              <${VLine} vals=${mo.gas_model} ymin=${0} ymax=${Math.max(...mo.gas_model,...mo.gas_smard)} w=${W} ht=${Hc} color="#0066cc"/>
            </svg>
          </div>
          <div style=${{gridColumn:'1 / -1'}}>
            <div class="sect">${tr("Annual generation by fuel — model vs SMARD, TWh")}</div>
            <div>${fuels.map(f=>h`<div key=${f.fuel} style=${{margin:'7px 0'}}>
              <div style=${{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}>
                <span>${FUELN[f.fuel]||f.fuel}</span>
                <span class="note">model ${f.model_twh}${f.smard_twh!=null?` · SMARD ${f.smard_twh} · ${f.model_twh-f.smard_twh>=0?'+':''}${Math.round(100*(f.model_twh-f.smard_twh)/f.smard_twh)}%`:' · not in SMARD'}${f.corr!=null?` · corr ${f.corr}`:''}</span></div>
              <div style=${{position:'relative',height:16}}>
                ${f.smard_twh!=null&&h`<div style=${{position:'absolute',top:0,height:7,width:(100*f.smard_twh/fMax)+'%',background:'#c7c7cc',borderRadius:2}}></div>`}
                <div style=${{position:'absolute',top:9,height:7,width:(100*f.model_twh/fMax)+'%',background:'var(--ink)',borderRadius:2}}></div>
              </div></div>`)}</div>
            <${Legend} items=${[['var(--ink)','solid = model'],['#c7c7cc','faded = SMARD measured']]}/>
          </div>
          <div style=${{gridColumn:'1 / -1'}}>
            <div class="sect">${tr("Energy balance and cross-border — TWh")}</div>
            <table style=${{maxWidth:560}}><thead><tr><th>${tr("quantity")}</th><th>${tr("model")}</th><th>${tr("reference")}</th></tr></thead><tbody>
              <tr><td>Demand</td><td>${d.balance.demand_twh}</td><td>SMARD load ${d.balance.smard_load_twh}</td></tr>
              <tr><td>Imports</td><td>${d.balance.imports_twh}</td><td>scheduled ≈ ${d.balance.ref_scheduled_imports}</td></tr>
              <tr><td>Exports</td><td>${d.balance.exports_twh}</td><td>scheduled ≈ ${d.balance.ref_scheduled_exports}</td></tr>
              <tr><td>Net position</td><td>${d.balance.net_position_twh>0?'+':''}${d.balance.net_position_twh}</td><td>≈ +${d.balance.ref_net_position} (net import)</td></tr>
            </tbody></table>
            <p class="note" style=${{maxWidth:820}}>SMARD's own books leave ~20 TWh of consumption without measured
              generation (small CHP, autoproducers). The model carries it as the explicit
              "distributed (unmetered)" band, allocated to small CHP units on the 110 kV grid.</p>
          </div>
        </div>
      </div>`}
    </div>
  </div>`;
}

export {FUELC,FUELN,FUELN2,Legend,MAxes,MLine,MarketModelOnly,Merit,VAxes,VLine,Validation};
