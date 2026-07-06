import {h,memo,useContext,useEffect} from './core.js';
import {tr,locale,LangCtx} from './i18n.js';
import {GW,cn,tc} from './format.js';

/* ── small components ── */
const Bars=memo(({obj})=>{
  const e=Object.entries(obj||{});
  if(!e.length)return h`<p class="note">${tr("Loading this hour…")}</p>`;
  const mx=Math.max(...e.map(([,v])=>v),1);
  return h`<div>${e.slice(0,12).map(([k,v])=>h`
    <div class="hbar" key=${k}><span class="n">${cn(k)}</span>
      <span class="t"><span class="f" style=${{width:(100*v/mx)+'%',background:tc(k)}}></span></span>
      <span class="val">${GW(v)}</span></div>`)}</div>`;
});
const Dot=({c})=>h`<span style=${{display:'inline-block',width:8,height:8,borderRadius:'50%',background:tc(c),marginRight:6}}></span>`;
/* run-dataset toggle: base-case (N-0) redispatch vs N-1-secured redispatch */
const DsToggle=({ds,setDs,avail})=>avail?h`<div class="chips">
  <span class=${'chip'+(ds==='n0'?' on':'')} onClick=${()=>setDs('n0')}>${tr('N-0 run')}</span>
  <span class=${'chip'+(ds==='n1'?' on':'')} onClick=${()=>setDs('n1')}>${tr('N-1 secured run')}</span>
</div>`:null;
/* sub-navigation shared by a merged section (rendered into each child's rail / page) */
/* two-level navigation: topic row on top, that topic's views as pills below */
function TopicNav({groups,cur,set}){
  let g=groups.find(([,items])=>items.some(([id])=>id===cur))||groups[0];
  return h`<div>
    <div class="subtop">
      ${groups.map(([name,items])=>h`<button key=${name} class=${name===g[0]?'on':''}
        onClick=${()=>set(items[0][0])}>${tr(name)}</button>`)}
    </div>
    ${g[1].length>1&&h`<div class="subnav" style=${{paddingTop:8}}>
      ${g[1].map(([id,l])=>h`<button key=${id} class=${cur===id?'on':''} onClick=${()=>set(id)}>${tr(l)}</button>`)}
    </div>`}
  </div>`;
}

/* ── the year timeline (signature element, docked between nav and map) ── */
const _MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const _DIM=[31,28,31,30,31,30,31,31,30,31,30,31];          // 2025 (non-leap)
const _CUM=[0,31,59,90,120,151,181,212,243,273,304,334];   // cumulative days before month
/* time control for a full hourly year: pick month + day discretely, scrub the 24 hours
   of that day with a slider (a slider only makes sense at day scale, not 8760 h). The
   model's hour axis is a plain count from Jan 1 with NO daylight-saving, so all index
   math is done arithmetically — never via JS Date (which would apply DST). */
const Timeline=memo(({snaps,hour,setHour})=>{
  useContext(LangCtx);   // re-render month/day labels on language change
  const N=snaps.length||8760;
  const clamp=v=>Math.max(0,Math.min(N-1,v));
  const doy=Math.floor(hour/24), hr=hour%24;
  let mo=11; while(mo>0&&_CUM[mo]>doy)mo--;
  const dy=doy-_CUM[mo]+1, daysIn=_DIM[mo];
  const cur=new Date(2025,mo,dy,hr);                        // display only
  const idx=(M,D,H)=>clamp((_CUM[M]+(D-1))*24+H);
  const setMo=M=>setHour(idx(M,Math.min(dy,_DIM[M]),hr));
  // keyboard: ←/→ hour, Shift ±day, PgUp/Dn ±week (ignored while typing in a field)
  useEffect(()=>{const f=e=>{const t=(e.target.tagName||'');if(t==='INPUT'||t==='SELECT'||t==='TEXTAREA')return;
    let nh=null,st=e.shiftKey?24:1;
    if(e.key==='ArrowRight')nh=hour+st;else if(e.key==='ArrowLeft')nh=hour-st;
    else if(e.key==='PageUp')nh=hour+168;else if(e.key==='PageDown')nh=hour-168;
    if(nh!=null){setHour(clamp(nh));e.preventDefault();}};
    window.addEventListener('keydown',f);return()=>window.removeEventListener('keydown',f);},[hour,N]);
  const s=snaps[hour]||{};
  return h`<div class="tl">
    <div class="tl-date">
      <div class="tl-d">${cur.toLocaleDateString(locale(),{weekday:'short',day:'numeric',month:'long'})}</div>
      <div class="tl-h">${String(hr).padStart(2,'0')}:00 · h ${hour+1}/${N}</div>
    </div>
    <div class="tl-months">
      ${_MON.map((m,i)=>h`<button key=${i} class=${'tl-mo'+(i===mo?' on':'')} onClick=${()=>setMo(i)}>${tr(m)}</button>`)}
    </div>
    <div class="tl-day">
      <span class="tl-lbl">${tr('DAY')}</span>
      <button class="step" onClick=${()=>setHour(clamp(hour-24))} title="−1 day (Shift+←)">‹</button>
      <div class="tl-selwrap">
        <select value=${dy} onChange=${e=>setHour(idx(mo,+e.target.value,hr))} aria-label="day of month">
          ${Array.from({length:daysIn},(_,i)=>h`<option key=${i} value=${i+1}>${String(i+1).padStart(2,'0')}</option>`)}
        </select>
      </div>
      <button class="step" onClick=${()=>setHour(clamp(hour+24))} title="+1 day (Shift+→)">›</button>
    </div>
    <div class="tl-hour">
      <input type="range" min="0" max="23" step="1" value=${hr}
        style=${{'--p':(hr/23*100)+'%'}}
        onInput=${e=>setHour(idx(mo,dy,+e.target.value))} aria-label="hour of day"/>
      <span class="tl-hh">${String(hr).padStart(2,'0')}:00</span>
    </div>
    <span class="tl-gw">${s.load_GW??'–'}<small> GW</small></span>
  </div>`;
});


/* tab registry (ids are stable; labels come from i18n) */
const TABS=[['home','Overview'],['grid','Grid'],['scen','Scenarios'],['analysis','Analysis'],['reg','Regulatory'],['docs','Guide'],['ai','Assistant']];
/* old deep links (pre-merge tab ids) land on the section that absorbed them */
const TAB_ALIAS={redispatch:'scen',market:'scen',reform:'grid',dc:'grid',guide:'docs',method:'docs'};

export {Bars,Dot,DsToggle,TABS,TAB_ALIAS,Timeline,TopicNav,_CUM,_DIM,_MON};
