import {createPortal,createRoot,h,memo,useCallback,useEffect,useMemo,useRef,useState} from './core.js';
import {tr} from './i18n.js';
import {MW,P,cn,kwLabel,plantCapKw,tc} from './format.js';
import {bn,j} from './api.js';
import {Night} from './home.js';

/* ── BESS dispatch + FCA: on-map popup anchored to a substation ──
   Level 1 reproduces the Excel tool (DA+ID arbitrage + FCR/aFRR stacking on real
   2025 prices). Level 2 applies SH Netz's HV Flexible Connection Agreement to THIS
   node: PRL (FCR) forbidden, SRL (aFRR) ≤30% Pinst, 6%/min gradient, and a rule-based
   feed-in/withdrawal band set by the higher of wind/PV feed-in within a radius. */
const EUR=x=>'€'+Math.round(x).toLocaleString('en-US');
const EURc=x=>{const a=Math.abs(x),s=x<0?'−':'';return a>=1e6?s+'€'+(a/1e6).toFixed(2)+'M':a>=1e3?s+'€'+(a/1e3).toFixed(0)+'k':s+'€'+Math.round(a)};
const NUM=(v,setV,step,min,max)=>h`<input type="number" value=${v} step=${step||1} min=${min} max=${max}
  onChange=${e=>setV(parseFloat(e.target.value))} class="bnum"/>`;

/* compact inline-SVG dispatch chart for one representative week (168 h) */
const DispChart=memo(({week,socMax,fcaOn})=>{
  if(!week)return null;
  const W=520,H=132,n=week.price.length,pad=4;
  const xs=i=>pad+i/(n-1)*(W-2*pad);
  const pr=week.price,prMx=Math.max(...pr,1),prMn=Math.min(...pr,0);
  const py=v=>6+(1-(v-prMn)/Math.max(1,prMx-prMn))*40;       // price band (top 46px)
  const pwArr=fcaOn?week.power_fca:week.power_base;
  const pwMx=Math.max(1,...pwArr.map(Math.abs));
  const zero=H-30, ph=v=>v/pwMx*30;                           // power bars around zero line
  const sy=v=>zero+24-(v/Math.max(1,socMax))*22;              // soc strip (bottom)
  const priceLine='M'+pr.map((v,i)=>xs(i).toFixed(1)+','+py(v).toFixed(1)).join('L');
  const socB=fcaOn?week.soc_fca:week.soc_base;
  const socLine='M'+socB.map((v,i)=>xs(i).toFixed(1)+','+sy(v).toFixed(1)).join('L');
  return h`<svg viewBox=${`0 0 ${W} ${H}`} width="100%" style=${{display:'block'}}>
    ${week.capped.map((c,i)=>c?h`<rect key=${i} x=${xs(i)-1.4} y="2" width="2.8" height=${zero-2}
        fill="#ff9500" opacity="0.10"/>`:null)}
    <line x1=${pad} x2=${W-pad} y1=${zero} y2=${zero} stroke="#d2d2d7" stroke-width="0.6"/>
    ${pwArr.map((v,i)=>v!==0?h`<rect key=${'p'+i} x=${xs(i)-1.3} width="2.6"
        y=${v>0?zero-ph(v):zero} height=${Math.abs(ph(v))}
        fill=${v>0?'#0a84ff':'#34c759'} opacity="0.9"/>`:null)}
    <path d=${priceLine} fill="none" stroke="currentColor" stroke-width="1.1"/>
    <path d=${socLine} fill="none" stroke="#af52de" stroke-width="1" opacity="0.85"/>
  </svg>`;
});

/* full-year dispatch (8760 h), bucketed to the pixel width; drag to zoom a window,
   double-click to reset. FCA-limited hours are tinted red. */
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const YearChart=memo(({year,fcaOn,big})=>{
  const pw=fcaOn?year.power_fca:year.power_base, pr=year.price, cap=year.capped, N=pw.length;
  const [win,setWin]=useState([0,N]);
  const [hov,setHov]=useState(null);
  useEffect(()=>{setWin([0,N])},[year,N]);
  const svgRef=useRef(null), drag=useRef(null);
  const [a,b]=win, span=b-a;
  const W=big?1360:712, H=big?330:126, padL=6,padR=6, padT=big?14:6;
  const axis=H-(big?22:14), ph=axis-padT, zero=padT+ph/2, bh=ph/2-(big?8:3);
  const cols=Math.min(W-padL-padR, Math.max(1,span));
  const cw=(W-padL-padR)/cols;
  const buckets=useMemo(()=>{
    const out=[];
    for(let i=0;i<cols;i++){
      const s=a+Math.floor(i*span/cols), e=Math.max(s+1,a+Math.floor((i+1)*span/cols));
      let mx=0,prs=0,cp=false,n=0;
      for(let k=s;k<e&&k<N;k++){if(Math.abs(pw[k])>Math.abs(mx))mx=pw[k];prs+=pr[k];if(cap[k])cp=true;n++;}
      out.push([mx,n?prs/n:0,cp]);
    }
    return out;
  },[year,a,b,fcaOn,cols]);
  const pmax=useMemo(()=>Math.max(1,...buckets.map(d=>Math.abs(d[0]))),[buckets]);
  const prAll=useMemo(()=>{let mn=1e9,mx=-1e9;for(const v of pr){if(v<mn)mn=v;if(v>mx)mx=v;}return[mn,mx];},[year]);
  const px=i=>padL+i*cw, py=v=>padT+(1-(v-prAll[0])/Math.max(1,prAll[1]-prAll[0]))*ph;
  const priceLine='M'+buckets.map((d,i)=>px(i+0.5).toFixed(1)+','+py(d[1]).toFixed(1)).join('L');
  const D=h=>new Date(Date.UTC(2025,0,1)+h*3600e3);
  const dfmt=h=>{const d=D(h);return d.getUTCDate()+' '+MONTHS[d.getUTCMonth()];};
  const ticks=[];for(let m=0;m<12;m++){const hh=Math.round((Date.UTC(2025,m,1)-Date.UTC(2025,0,1))/3600e3);
    if(hh>=a&&hh<=b)ticks.push([px((hh-a)/span*cols),MONTHS[m]]);}
  const evX=e=>{const r=svgRef.current.getBoundingClientRect();return (e.clientX-r.left)/r.width;};
  const zoomAt=(f,factor)=>{const c=a+f*span,ns=Math.min(N,Math.max(24,span*factor));
    let na=Math.round(c-f*ns),nb=Math.round(na+ns);
    if(na<0){na=0;nb=Math.round(ns);}if(nb>N){nb=N;na=Math.round(N-ns);}
    setWin([Math.max(0,na),Math.min(N,nb)]);};
  useEffect(()=>{const el=svgRef.current;if(!el)return;
    const handler=e=>{e.preventDefault();const r=el.getBoundingClientRect();
      zoomAt((e.clientX-r.left)/r.width, e.deltaY>0?1.25:0.8);};
    el.addEventListener('wheel',handler,{passive:false});
    return ()=>el.removeEventListener('wheel',handler);
  },[a,b,N,span]);
  const onDown=e=>{drag.current={x:evX(e),a,b,moved:false};};
  const onMove=e=>{
    const f=evX(e);
    if(drag.current){const dx=(f-drag.current.x)*span;if(Math.abs(dx)>0.5)drag.current.moved=true;
      let na=Math.round(drag.current.a-dx),nb=Math.round(drag.current.b-dx);
      if(na<0){nb-=na;na=0;}if(nb>N){na-=nb-N;nb=N;}setWin([Math.max(0,na),Math.min(N,nb)]);return;}
    const i=Math.max(0,Math.min(cols-1,Math.floor(f*cols))),hh=a+Math.floor((i+0.5)*span/cols);
    setHov({i,h:hh});
  };
  const onUp=()=>{drag.current=null;};
  const hv=hov&&hov.h<N?{h:hov.h,p:pw[hov.h],pr:pr[hov.h],c:cap[hov.h]}:null;
  return h`<div>
    ${big&&h`<div class="byzoom">
      <button onClick=${()=>zoomAt(0.5,0.6)}>Zoom in</button>
      <button onClick=${()=>zoomAt(0.5,1.6)}>Zoom out</button>
      <button onClick=${()=>setWin([0,N])}>Reset</button>
      <span class="byread">${hv?`${dfmt(hv.h)} ${String(D(hv.h).getUTCHours()).padStart(2,'0')}:00 · ${hv.p>0?'charge':hv.p<0?'discharge':'idle'} ${Math.abs(hv.p).toFixed(0)} MW · ${hv.pr.toFixed(0)} €/MWh${hv.c?' · FCA-limited':''}`:'hover the chart for hourly detail'}</span>
    </div>`}
    <svg ref=${svgRef} viewBox=${`0 0 ${W} ${H}`} width="100%" style=${{display:'block',cursor:drag.current?'grabbing':'crosshair',touchAction:'none'}}
      onMouseDown=${onDown} onMouseMove=${onMove} onMouseUp=${onUp} onMouseLeave=${()=>{drag.current=null;setHov(null);}}
      onDblClick=${()=>setWin([0,N])}>
      ${ticks.map(([x,l],i)=>h`<g key=${i}><line x1=${x} x2=${x} y1=${padT} y2=${axis} class="cgrid" stroke-width="0.6"/>
        <text x=${x+2} y=${padT+(big?9:7)} font-size=${big?9:7} fill="#c7c7cc">${l}</text></g>`)}
      <line x1=${padL} x2=${W-padR} y1=${zero} y2=${zero} stroke="#d2d2d7" stroke-width="0.6"/>
      ${big&&h`<g font-size="9.5">
        <text x=${padL+4} y=${(padT+zero)/2} fill="#0a84ff">charging ▲</text>
        <text x=${padL+4} y=${(zero+axis)/2} fill="#1aa64b">discharging ▼</text>
        <text x=${padL+4} y=${zero-3} fill="#aeaeb2">0 MW</text>
      </g>`}
      ${buckets.map((d,i)=>{const v=d[0];if(!v&&!d[2])return null;const hh=Math.abs(v)/pmax*bh;
        const col=d[2]?'#ff3b30':(v>0?'#0a84ff':'#34c759');
        return h`<rect key=${i} x=${px(i).toFixed(2)} width=${Math.max(0.6,cw*0.9).toFixed(2)}
          y=${(v>=0?zero-hh:zero).toFixed(1)} height=${Math.max(0.6,hh).toFixed(1)} fill=${col} opacity=${d[2]?0.92:0.8}/>`;})}
      ${buckets.map((d,i)=>d[2]?h`<rect key=${'c'+i} x=${px(i).toFixed(2)} width=${Math.max(0.6,cw*0.9).toFixed(2)}
        y=${axis-2} height="3" fill="#ff3b30"/>`:null)}
      <path d=${priceLine} fill="none" stroke="currentColor" stroke-width=${big?1:0.8} opacity="0.55"/>
      ${big&&hov&&h`<line x1=${px(hov.i+0.5)} x2=${px(hov.i+0.5)} y1=${padT} y2=${axis} stroke="currentColor" stroke-width="0.6" opacity="0.4"/>`}
    </svg>
    <div class="bycap"><span>${dfmt(a)} – ${dfmt(Math.min(N-1,b-1))} · ${span} h · peak ±${pmax.toFixed(0)} MW · price ${prAll[0].toFixed(0)}–${prAll[1].toFixed(0)} €/MWh</span>
      <span>scroll/buttons to zoom · drag to pan${fcaOn?' · red = FCA-limited hour':''}</span></div>
  </div>`;
});

const YearModal=({year,fcaOn,onClose})=>{
  useEffect(()=>{const k=e=>{if(e.key==='Escape')onClose();};addEventListener('keydown',k);return()=>removeEventListener('keydown',k);},[]);
  return createPortal(h`
    <div class="ymodal" onClick=${onClose}>
      <div class="ymbox" onClick=${e=>e.stopPropagation()}>
        <div class="ymhead"><b>Full-year power dispatch · 8,760 h</b>
          <span>Bar = battery power each hour, height in MW · <b style=${{color:'#0a84ff'}}>▮</b> charging (above line) · <b style=${{color:'#34c759'}}>▮</b> discharging (below) · <b style=${{color:'var(--ink)'}}>━</b> day-ahead price${fcaOn?h` · <b style=${{color:'#ff3b30'}}>▮</b> hour capped by the FCA feed-in limit`:''}</span>
          <button class="ymx" onClick=${onClose}>×</button></div>
        <${YearChart} year=${year} fcaOn=${fcaOn} big=${true}/>
      </div>
    </div>`, document.body);
};

/* SH Netz feed-in band variants: [knee%, end%] of RE output.
   Withdrawal (charge) knee per variant: V1 10%, V2 20%, V3 30%. */
const FEEDIN_BANDS={1:[50,100],2:[40,80],3:[30,60]};
const WITHDRAW_KNEE={1:10,2:20,3:30};

/* tiny schematic of the selected variant's feed-in band */
const VariantBand=memo(({variant})=>{
  const [knee,end]=FEEDIN_BANDS[variant]||FEEDIN_BANDS[1];
  const W=312,H=78,L=22,Rp=8,T=8,B=16;
  const px=p=>L+p/100*(W-L-Rp), py=f=>T+(1-f/100)*(H-T-B);
  const pts=[[0,100],[knee,100],[end,0],[100,0]];
  const line='M'+pts.map(([x,f])=>px(x).toFixed(1)+','+py(f).toFixed(1)).join('L');
  const area=line+`L${px(100)},${py(0)}L${px(0)},${py(0)}Z`;
  return h`<svg viewBox=${`0 0 ${W} ${H}`} width="100%" style=${{display:'block'}}>
    <path d=${area} fill="#34c759" opacity="0.13"/>
    <line x1=${L} y1=${py(0)} x2=${W-Rp} y2=${py(0)} stroke="#d2d2d7" stroke-width="0.6"/>
    <line x1=${L} y1=${T} x2=${L} y2=${py(0)} stroke="#d2d2d7" stroke-width="0.6"/>
    <path d=${line} fill="none" stroke="currentColor" stroke-width="1.3"/>
    <line x1=${px(knee)} y1=${py(100)} x2=${px(knee)} y2=${py(0)} stroke="#ff9500" stroke-width="0.8" stroke-dasharray="2 2"/>
    ${[0,50,100].map(t=>h`<text key=${t} x=${px(t)} y=${H-4} font-size="7" fill="#86868b" text-anchor="middle">${t}%</text>`)}
    <text x="2" y=${py(100)+3} font-size="7" fill="#86868b">100</text>
    <text x="2" y=${py(0)+2} font-size="7" fill="#86868b">0</text>
    <text x=${px(knee)} y=${py(100)-2} font-size="7" fill="#ff9500" text-anchor="middle">${knee}%</text>
  </svg>`;
});

/* project cash-flow chart: stacked annual revenue bars (declining German outlook)
   + cumulative cash line on its own scale; orange dot = simple payback */
const FinChart=memo(({f})=>{
  const rows=f.rows||[];if(!rows.length)return null;
  const W=326,H=104,L=6,Rp=6,T=8,B=16,n=rows.length,bw=(W-L-Rp)/n;
  const maxRev=Math.max(...rows.map(r=>r.arb+r.anc),1);
  const cums=[-f.capex,...rows.map(r=>r.cum)];
  const cmin=Math.min(...cums),cmax=Math.max(...cums,0);
  const by=v=>T+(1-v/maxRev)*(H-T-B);
  const cy=v=>T+(cmax-v)/((cmax-cmin)||1)*(H-T-B);
  const cline='M'+rows.map((r,i)=>((L+(i+0.5)*bw).toFixed(1)+','+cy(r.cum).toFixed(1))).join('L');
  return h`<svg viewBox=${`0 0 ${W} ${H}`} width="100%" style=${{display:'block'}}>
    ${rows.map((r,i)=>{const x=L+i*bw+bw*0.12,w=Math.max(1,bw*0.76);
      const ya=by(r.arb),yn=by(r.arb+r.anc);
      return h`<g key=${i}>
        <rect x=${x.toFixed(1)} y=${ya.toFixed(1)} width=${w.toFixed(1)} height=${Math.max(0,by(0)-ya).toFixed(1)} fill="#34c759" opacity="0.75"/>
        <rect x=${x.toFixed(1)} y=${yn.toFixed(1)} width=${w.toFixed(1)} height=${Math.max(0,ya-yn).toFixed(1)} fill="#0a84ff" opacity="0.75"/>
      </g>`;})}
    <line x1=${L} x2=${W-Rp} y1=${cy(0).toFixed(1)} y2=${cy(0).toFixed(1)} stroke="#d2d2d7" stroke-width="0.7" stroke-dasharray="3 3"/>
    <path d=${cline} fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.8"/>
    ${f.payback_yr!=null&&f.payback_yr<=n&&h`<circle cx=${(L+f.payback_yr*bw).toFixed(1)} cy=${cy(0).toFixed(1)} r="2.6" fill="#ff9500"/>`}
    ${rows.map((r,i)=>(i===0||i===n-1||(i%4===0&&i<n-2))?h`<text key=${'t'+i} x=${(L+(i+0.5)*bw).toFixed(1)} y=${H-4} font-size="7" fill="#86868b" text-anchor="middle">${r.year}</text>`:null)}
  </svg>`;
});

function BessPopup({b,resize,map,plantsLayer,close}){
  const [ctx,setCtx]=useState(null);
  // draw the bus's plants on the map, then close this popup so it doesn't block them
  const showPlants=useCallback(()=>{
    if(map&&plantsLayer)drawBusPlants(map,b,plantsLayer).then(()=>close&&close());
  },[map,plantsLayer,b,close]);
  const [p,setP]=useState({power:100,energy:400,eta:86,maxcyc:2,
    fcr:5,afrrP:15,afrrN:15,useFcr:true,useAfrr:true});
  const [fca,setFca]=useState({on:false,variant:1,radius_km:25,night_window:true});
  const [fin,setFin]=useState({capex:235,opex:1.5,years:15,wacc:7,fade:1.5,scenario:'base'});
  const [res,setRes]=useState(null);
  const [busy,setBusy]=useState(false);
  const [bigYear,setBigYear]=useState(false);
  useEffect(()=>{j('/api/bess/context/'+b.bus+'?radius_km='+fca.radius_km).then(setCtx).catch(()=>{})},[b.bus,fca.radius_km]);
  useEffect(()=>{resize&&resize()},[res,fca.on]);   // re-fit on discrete size changes (results / FCA panel)
  const set=(k,v)=>setP(s=>({...s,[k]:v}));
  const setF=(k,v)=>setFca(s=>({...s,[k]:v}));
  const setFi=(k,v)=>setFin(s=>({...s,[k]:v}));
  const payload=useCallback(()=>({bus_id:String(b.bus),
    power_charge:p.power,power_discharge:p.power,energy_capacity:p.energy,
    rt_efficiency:p.eta,max_cycles_day:p.maxcyc,
    enable_fcr:p.useFcr,fcr_mw:p.fcr,enable_afrr:p.useAfrr,
    afrr_pos_mw:p.afrrP,afrr_neg_mw:p.afrrN,
    fca:{on:fca.on,variant:fca.variant,radius_km:fca.radius_km,night_window:fca.night_window},
    fin:{capex_eur_per_kwh:fin.capex,opex_pct:fin.opex,years:fin.years,
      wacc_pct:fin.wacc,fade_pct:fin.fade,scenario:fin.scenario}}),[b.bus,p,fca,fin]);
  const run=useCallback(()=>{
    setBusy(true);
    fetch('/api/bess/simulate',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload())})
      .then(r=>r.json()).then(d=>{setRes(d);setBusy(false)})
      .catch(()=>setBusy(false));
  },[payload]);
  // financial inputs re-price an existing run automatically (dispatch is ~0.3 s)
  useEffect(()=>{if(!res)return;const t=setTimeout(run,400);return()=>clearTimeout(t);},[fin]);
  const [exporting,setExporting]=useState(false);
  const exportXlsx=useCallback(()=>{
    setExporting(true);
    fetch('/api/bess/export',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload())})
      .then(r=>r.ok?r.blob():Promise.reject(r))
      .then(blob=>{const url=URL.createObjectURL(blob),a=document.createElement('a');
        a.href=url;a.download=`bess_dispatch_${b.bus}_${fca.on?'fca':'firm'}_2027case.xlsx`;
        document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);})
      .catch(()=>alert('Export failed'))
      .finally(()=>setExporting(false));
  },[payload,b.bus,fca.on]);
  const s=res&&(res.fca||res.baseline);
  const fN=res&&res.finance?(res.finance.fca||res.finance.firm):null;
  const pct=x=>x==null?'n/a':x.toFixed(1)+'%';
  return h`<div class="bess">
    <div class="bhead">
      <b>${b.name||bn(b.bus)}</b>
      <span class="bsub">Bus ${b.bus} · ${b.v} kV${ctx?` · ${P(ctx.nearby_wind_mw)} wind · ${P(ctx.nearby_pv_mw)} ground-PV ≤${ctx.radius_km}km`:''}</span>
    </div>
    <div class="brow" style=${{marginTop:2,marginBottom:2}}>
      <span class="chip" onClick=${showPlants}>Show connected plants ▸</span>
    </div>
    <div class="bgrid b4">
      <label>Power <span>MW</span>${NUM(p.power,v=>set('power',v),5,1)}</label>
      <label>Energy <span>MWh</span>${NUM(p.energy,v=>set('energy',v),10,1)}</label>
      <label>RT η <span>%</span>${NUM(p.eta,v=>set('eta',v),1,1,100)}</label>
      <label>Cycles/d <span>max</span>${NUM(p.maxcyc,v=>set('maxcyc',v),0.5,0)}</label>
    </div>
    <div class="bsect">Reserve markets<span class="bdoc">2027 case: FCR −50% · aFRR −40% vs 2025${fca.on?' · FCA: FCR n/a, aFRR ≤30%':''}</span></div>
    <div class="bgrid b3">
      <label class=${(p.useFcr&&!fca.on)?'':'boff'}>FCR <span onClick=${()=>!fca.on&&set('useFcr',!p.useFcr)} class="btog">${fca.on?'n/a':(p.useFcr?'on':'off')}</span>
        ${fca.on?h`<input class="bnum" value="0" disabled/>`:NUM(p.fcr,v=>set('fcr',v),1,0)}</label>
      <label class=${p.useAfrr?'':'boff'}>aFRR+ <span onClick=${()=>set('useAfrr',!p.useAfrr)} class="btog">${p.useAfrr?'on':'off'}</span>${NUM(p.afrrP,v=>set('afrrP',v),1,0)}</label>
      <label class=${p.useAfrr?'':'boff'}>aFRR− <span>MW</span>${NUM(p.afrrN,v=>set('afrrN',v),1,0)}</label>
    </div>
    <div class="bsect">Flexible Connection Agreement <span class="bdoc">SH Netz HV</span></div>
    <div class="brow">
      <span class=${'chip'+(!fca.on?' on':'')} onClick=${()=>setF('on',false)}>Firm connection</span>
      <span class=${'chip'+(fca.on?' on':'')} onClick=${()=>setF('on',true)}>Apply FCA</span>
    </div>
    ${fca.on&&h`<div class="bfca">
      <div class="brow"><span class="blbl">Band variant</span>
        ${[1,2,3].map(v=>h`<span key=${v} class=${'chip'+(fca.variant===v?' on':'')} onClick=${()=>setF('variant',v)}>V${v}</span>`)}</div>
      <${VariantBand} variant=${fca.variant}/>
      <div class="bvcap"><span>feed-in allowed (% of Pinst)</span><span>nearby wind/PV output →</span></div>
      <p class="bhint">Full feed-in until the higher of nearby wind/PV reaches
        <b>${FEEDIN_BANDS[fca.variant][0]}%</b> of rated, then derated to 0 at
        <b>${FEEDIN_BANDS[fca.variant][1]}%</b>. ${fca.variant===1?'V1 = current SH Netz spec.':'Earlier curtailment — for grids with more RE overbuild.'}
        Charging is throttled in dark-doldrum hours (knee ${WITHDRAW_KNEE[fca.variant]}%); in the 23:00–05:00 night window withdrawal is fixed at 25% of rated (floor and ceiling).
        <i>One variant applies at a time — chosen by SH Netz at their discretion (V1 today); this is a what-if.</i></p>
      <div class="bgrid b3">
        <label>RE radius <span>km</span>${NUM(fca.radius_km,v=>setF('radius_km',v),5,1)}</label>
        <label class="bchk"><input type="checkbox" checked=${fca.night_window} onChange=${e=>setF('night_window',e.target.checked)}/> Night window</label>
        <span></span>
      </div>
      <p class="bhint">Reserves under FCA: PRL (FCR) forbidden · SRL (aFRR) ≤30% Pinst · 6%/min gradient.</p>
    </div>`}
    <div class="bsect">Financial model <span class="bdoc">merchant · real terms · COD 2027</span></div>
    <div class="bgrid b4">
      <label>CAPEX <span>€/kWh</span>${NUM(fin.capex,v=>setFi('capex',v),5,50)}</label>
      <label>OPEX <span>%/yr</span>${NUM(fin.opex,v=>setFi('opex',v),0.1,0)}</label>
      <label>Life <span>yr</span>${NUM(fin.years,v=>setFi('years',v),1,1,30)}</label>
      <label>WACC <span>%</span>${NUM(fin.wacc,v=>setFi('wacc',v),0.5,0)}</label>
    </div>
    <div class="brow"><span class="blbl">Revenue outlook</span>
      ${['base','bear','bull'].map(sc=>h`<span key=${sc} class=${'chip'+(fin.scenario===sc?' on':'')}
        onClick=${()=>setFi('scenario',sc)}>${sc==='base'?'Base':sc==='bear'?'Bear (overbuild)':'Bull (underbuild)'}</span>`)}</div>
    <p class="bhint">German BESS revenues are forecast to <b>fall</b>: ancillary (FCR/aFRR) saturates
      2026–29 while wholesale arbitrage is slowly cannibalised, stabilising near
      ~€125k/MW-yr by 2030 (Aurora, Rabobank, Modo, enervis outlooks). Base: arbitrage −4%/yr to a
      floor of 80%, ancillary −22%/yr to 28% of the simulated year; plus ${fin.fade}%/yr capacity fade.</p>
    <button class="brun" onClick=${run} disabled=${busy}>${busy?'Simulating 8,760 h…':'Simulate 1-year dispatch ▸'}</button>
    ${s&&h`<div class="bres">
      <div class="kpis">
        <div class="kpi"><div class="v">${EURc(s.net)}</div><div class="k">${tr("Net €/yr")}</div></div>
        <div class="kpi"><div class="v">${EURc(s.arb)}</div><div class="k">${tr("Arbitrage")}</div></div>
        <div class="kpi"><div class="v">${EURc(s.fcr+s.afrr_cap+s.afrr_en)}</div><div class="k">${tr("Reserves")}</div></div>
      </div>
      <div class="kpis" style=${{marginTop:6}}>
        <div class="kpi"><div class="v">${s.cycles.toFixed(0)}</div><div class="k">${tr("Cycles/yr")}</div></div>
        <div class="kpi"><div class="v">${EUR(s.rev_per_mw)}</div><div class="k">${tr("€/MW-yr")}</div></div>
        ${res.delta?h`<div class="kpi"><div class="v ${res.delta.net<0?'bad':'good'}">${EURc(res.delta.net)}</div><div class="k">FCA Δ (${res.delta.pct.toFixed(1)}%)</div></div>`
          :h`<div class="kpi"><div class="v">—</div><div class="k">${tr("FCA Δ")}</div></div>`}
      </div>
      ${res.delta&&h`<div class="bbreak">vs firm:
        <b class="bad">FCR ${EURc(res.delta.fcr)}</b>
        ${res.delta.afrr<-1?h`<b class="bad">aFRR ${EURc(res.delta.afrr)}</b>`:null}
        <b class=${res.delta.arb<0?'bad':'good'}>arbitrage ${EURc(res.delta.arb)}</b></div>`}
      ${fN&&h`<div class="bsect" style=${{marginTop:12}}>Project financials
        <span class="bdoc">${fN.years} yr · CAPEX ${EURc(fN.capex)} · ${fN.scenario} outlook</span></div>
      <div class="kpis">
        <div class="kpi"><div class="v ${fN.irr_pct!=null&&fN.irr_pct>=fin.wacc?'good':'bad'}">${pct(fN.irr_pct)}</div><div class="k">${tr("IRR (unlevered)")}</div></div>
        <div class="kpi"><div class="v ${fN.npv>=0?'good':'bad'}">${EURc(fN.npv)}</div><div class="k">NPV @ ${fN.wacc_pct}%</div></div>
        <div class="kpi"><div class="v">${fN.payback_yr==null?'—':fN.payback_yr+' yr'}</div><div class="k">${tr("Payback")}</div></div>
      </div>
      ${res.finance.fca&&h`<div class="bbreak">IRR firm ${pct(res.finance.firm.irr_pct)} → FCA ${pct(res.finance.fca.irr_pct)}
        ${res.finance.firm.irr_pct!=null&&res.finance.fca.irr_pct!=null?h`<b class=${res.finance.fca.irr_pct<res.finance.firm.irr_pct?'bad':'good'}>
          ${(res.finance.fca.irr_pct-res.finance.firm.irr_pct).toFixed(1)} pt</b>`:null}</div>`}
      <div class="bcap" style=${{marginTop:4}}>Annual revenue ${fN.start_year}–${fN.start_year+fN.years-1} ·
        arbitrage <b style=${{color:'#34c759'}}>▮</b> ancillary <b style=${{color:'#0a84ff'}}>▮</b>
        cumulative cash <b style=${{color:'var(--ink)'}}>━</b> payback <b style=${{color:'#ff9500'}}>●</b></div>
      <${FinChart} f=${fN}/>`}
      <div class="bcap">Representative week · price <b style=${{color:'var(--ink)'}}>━</b>
        charge <b style=${{color:'#0a84ff'}}>▮</b> discharge <b style=${{color:'#34c759'}}>▮</b>
        SoC <b style=${{color:'#af52de'}}>━</b>${fca.on?' · restricted hrs shaded':''}</div>
      <${DispChart} week=${res.chart.week} socMax=${res.chart.soc_max} fcaOn=${fca.on}/>
      ${res.chart.year&&h`<div class="bsect" style=${{marginTop:12}}>Full year — power dispatch
        <button class="byexp" onClick=${exportXlsx} disabled=${exporting}>${exporting?'…':'⤓ Excel'}</button>
        <button class="byexp" style=${{marginLeft:6}} onClick=${()=>setBigYear(true)}>⤢ Expand</button></div>
        <${YearChart} year=${res.chart.year} fcaOn=${fca.on}/>`}
      ${res.why&&h`<p class="bwhy">${res.why}</p>`}
    </div>`}
    ${bigYear&&res&&res.chart.year&&h`<${YearModal} year=${res.chart.year} fcaOn=${fca.on} onClose=${()=>setBigYear(false)}/>`}
  </div>`;
}

// Draw a bus's connected plants at their TRUE registry coordinates into `layer`,
// each colored by technology with a click-popup of its details. Returns the count.
function drawBusPlants(map,b,layer){
  return j('/api/sample/bus_plants?bus='+b.bus).then(d=>{
    layer.clearLayers();
    const plants=(d&&d.plants)||[];
    if(!plants.length){
      layer.addLayer(L.circleMarker([b.lat,b.lon],{radius:8,color:'#86868b',weight:1,fillOpacity:0})
        .bindPopup('No registry plant maps to this bus'));
      return 0;
    }
    // fit the map to show every plant of this bus (the "show all again" view)
    const lats=plants.map(p=>p.lat).concat([b.lat]),lons=plants.map(p=>p.lon).concat([b.lon]);
    const fitAll=()=>map.fitBounds([[Math.min(...lats),Math.min(...lons)],[Math.max(...lats),Math.max(...lons)]],{padding:[60,60]});
    for(const g of plants){
      layer.addLayer(L.polyline([[b.lat,b.lon],[g.lat,g.lon]],
        {color:tc(g.carrier),weight:1.3,opacity:.8,dashArray:'4 5'}));
      const row=(k,v)=>v?`<div class="prow"><span>${k}</span><span>${v}</span></div>`:'';
      const html=`<div class="plantpop"><b><span style="display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;background:${tc(g.carrier)}"></span>${g.name||cn(g.carrier)}</b>`
        +`<div class="note" style="margin:1px 0 6px">${cn(g.carrier)}${g.status?' · '+g.status:''}</div>`
        +row('Net capacity',kwLabel(plantCapKw(g)))
        +row('Gross capacity',g.gross_kw!=null?kwLabel(g.gross_kw):null)
        +row('Commissioned',g.cod)
        +row('Municipality (AGS)',g.ags)
        +row('MaStR no.',g.unit_id)
        +row('Coordinates',g.lat.toFixed(4)+', '+g.lon.toFixed(4))
        +(g.km!=null?row('Distance',g.km+' km from substation'):'')
        +row('Feeds',b.name||('bus '+b.bus))
        +`</div>`;
      const mk=L.circleMarker([g.lat,g.lon],{radius:3.5+Math.sqrt(Math.max(g.mw,0))/3,
        color:'rgba(0,0,0,.3)',weight:.6,fillColor:tc(g.carrier),fillOpacity:.9})
        .bindTooltip(()=>`${cn(g.carrier)} · ${kwLabel(plantCapKw(g))}`,{sticky:true})
        .bindPopup(html);
      // when the user closes a plant popup (and none other is open), zoom back out
      // to show all the plants again
      mk.on('popupclose',()=>setTimeout(()=>{if(!document.querySelector('.leaflet-popup'))fitAll();},30));
      layer.addLayer(mk);
    }
    fitAll();
    return plants.length;
  });
}

function openBessPopup(map,b){
  map.closePopup();
  // dedicated layer for this bus's connected plants (cleared when the popup closes)
  let pl=map.__plantsLayer;
  if(!pl){pl=L.layerGroup().addTo(map);map.__plantsLayer=pl;}
  pl.clearLayers();
  // recentre so the clicked node sits ~75% down the screen — the popup opens
  // upward into the middle of the view and is fully visible even high up north
  const z=map.getZoom(),size=map.getSize(),pt=map.project([b.lat,b.lon],z);
  const center=map.unproject(L.point(pt.x, pt.y - size.y*0.25),z);
  map.setView(center,z,{animate:true});
  const div=document.createElement('div');
  const root=createRoot(div);
  const pop=L.popup({maxWidth:380,minWidth:380,className:'bess-pop',
    autoPan:true,autoPanPadding:[28,72],keepInView:true,closeOnClick:false})
    .setLatLng([b.lat,b.lon]).setContent(div).openOn(map);
  const resize=()=>{try{pop.update()}catch(e){}};  // re-fit once after results render
  root.render(h`<${BessPopup} b=${b} resize=${resize} map=${map} plantsLayer=${pl} close=${()=>{try{map.closePopup()}catch(e){}}}/>`);
  // plants stay on the map after this popup closes — they're only cleared when a
  // different substation is opened (pl.clearLayers above)
  pop.on('remove',()=>setTimeout(()=>{try{root.unmount()}catch(e){}},0));
}
// test-only hook (no effect unless ?bess-test is present)
if(location.search.includes('bess-test'))window.__openBessPopup=openBessPopup;

export {BessPopup,DispChart,EUR,EURc,FEEDIN_BANDS,FinChart,MONTHS,NUM,VariantBand,WITHDRAW_KNEE,YearChart,YearModal,drawBusPlants,openBessPopup};
