import {h,useCallback,useEffect,useRef,useState} from './core.js';
import {tr} from './i18n.js';
import {j,snapView} from './api.js';
import {TABS} from './ui.js';

/* ── Assistant ── */
const SUGGS=['Why is wind curtailed in the north?','Which line is congested the most?',
 'What does the DSO↔TSO cascade do?','How is the energy balance closed?'];
const CANNED={
 'Why is wind curtailed in the north?':'Wind is curtailed when the lines that evacuate it reach their thermal limit and no cheaper remedy remains. The cascade lets each DSO act locally first (and the Mindestfaktor makes renewables 10× more expensive to touch than conventional plants), then the TSO redispatches the EHV grid. In this dataset wind curtailment is ~0.2% of wind generation — lignite and coal move first.',
 'Which line is congested the most?':'Open Scenarios → Congestion · year — the table ranks lines by hours per year over rating after redispatch. The persistent ones sit on under-built 110 kV feeders whose demand no local generation can relieve: a reinforcement signal, not a dispatch problem.',
 'What does the DSO↔TSO cascade do?':'Each of the 395 distribution pockets first clears its own 110 kV congestion using only its own generation. The TSO then redispatches transmission-connected plants nationally — monitoring every line so it never creates new distribution congestion — and supplies the balancing energy. The loop repeats until nothing improves, mirroring the German Kaskadenprinzip.',
 'How is the energy balance closed?':'By construction: the market dispatch runs against the grid model’s own nodal load, and its hourly export schedule is written onto the border loads. Generation + imports + storage = load + exports every hour — nothing leans on a slack bus.'};
function buildCtx(tab,hour,snaps,state,summary){
  const c=state?.country||{};
  const base={view:tab,time:snaps[hour]?.time,hour_of_sample:hour+1,
    load_MW:c.total_load_MW,generation_MW:c.total_gen_MW,curtailed_MW:c.total_curtail_MW,
    imports_MW:c.imports_MW,exports_MW:c.exports_MW,
    overloads_before:c.n_overload,overloads_after:c.n_overload_post,
    dso_110kV_overloads:[c.n_dso,c.n_dso_post],tso_ehv_overloads:[c.n_tso,c.n_tso_post]};
  if(tab==='scen'){base.top_overloads=(c.top_overloads||[]).slice(0,5);
    base.curtailed=(c.curtail_rows||[]).slice(0,5);base.ramped_up=(c.rampup_rows||[]).slice(0,5)}
  if(tab==='grid')base.generation_by_tech_MW=c.gen_by_tech_MW;
  if((tab==='scen'||tab==='ai')&&summary)base.annual_summary=summary;
  return base;
}
function Ai({active,hour,snaps,state,summary}){
  const [msgs,setMsgs]=useState([{cls:'ai',txt:'Hi — I’m the Grid Studio assistant. I answer from the simulation that’s loaded right now. Ask anything, or try a suggestion below.'}]);
  const [val,setVal]=useState('');
  const [model,setModel]=useState(null);   // null = checking, 'offline', or model name
  const endRef=useRef(null);
  useEffect(()=>{if(active&&model===null)
    j('/api/ai/status').then(s=>setModel(s.ok?s.model:'offline')).catch(()=>setModel('offline'))},[active,model]);
  useEffect(()=>{endRef.current&&endRef.current.scrollIntoView({behavior:'smooth'})},[msgs]);
  const ask=useCallback(async q=>{
    setMsgs(m=>[...m,{cls:'me',txt:q}]);
    if(model&&model!=='offline'){
      setMsgs(m=>[...m,{cls:'ai thinking',txt:'Reading the screen…'}]);
      const image=await snapView();
      fetch('/api/ai/chat',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({message:q,context:buildCtx('ai',hour,snaps,state,summary),image,
          history:msgs.filter(m=>!m.cls.includes('thinking')).map(m=>({role:m.cls==='me'?'user':'assistant',content:m.txt}))})})
       .then(r=>r.json()).then(d=>{setModel(d.model);
         setMsgs(m=>[...m.filter(x=>!x.cls.includes('thinking')),{cls:'ai',txt:d.reply}])})
       .catch(()=>{setModel('offline');
         setMsgs(m=>[...m.filter(x=>!x.cls.includes('thinking')),
           {cls:'ai',txt:CANNED[q]||'The local model just went offline. The Grid and Scenarios views answer most questions visually.'}])});
    }else{
      setTimeout(()=>setMsgs(m=>[...m,{cls:'ai',txt:CANNED[q]||'The local model is offline, so I can only answer a few prepared questions — try a suggestion below. The Grid and Scenarios views answer most questions visually.'}]),350);
    }
  },[model,hour,snaps,state,summary,msgs]);
  return h`<div class="view" style=${{display:active?'block':'none'}}><div class="aiwrap">
    <div class="aihead"><h2>${tr("Assistant")}</h2><span class="aibadge">● ${model===null?tr('checking local model…'):model==='offline'?tr('local model offline · prepared answers'):model+tr(' · local')}</span></div>
    <div class="chat">${msgs.map((m,i)=>h`<div class=${'msg '+m.cls} key=${i}>${m.txt}</div>`)}<div ref=${endRef}></div></div>
    <div class="sugg">${SUGGS.map(s=>h`<span class="chip" key=${s} onClick=${()=>ask(s)}>${tr(s)}</span>`)}</div>
    <div class="composer">
      <input value=${val} onInput=${e=>setVal(e.target.value)} placeholder=${tr('Ask about the grid…')}
        onKeyDown=${e=>{if(e.key==='Enter'&&val.trim()){ask(val.trim());setVal('')}}} aria-label="Ask the assistant"/>
      <button onClick=${()=>{if(val.trim()){ask(val.trim());setVal('')}}} aria-label="Send">↑</button>
    </div>
  </div></div>`;
}

/* ── floating assistant popup: sees what the window sees ── */
function AiPop({tab,hour,snaps,state,summary}){
  const [open,setOpen]=useState(false);
  const [msgs,setMsgs]=useState([]);
  const [val,setVal]=useState('');
  const [model,setModel]=useState(null);
  const endRef=useRef(null);
  useEffect(()=>{if(open&&model===null)j('/api/ai/status').then(s=>setModel(s.ok?s.model:'offline'))},[open,model]);
  useEffect(()=>{endRef.current&&endRef.current.scrollIntoView({behavior:'smooth'})},[msgs]);
  const ctx=useCallback(()=>buildCtx(tab,hour,snaps,state,summary),[tab,hour,snaps,state,summary]);
  const send=useCallback(async q=>{
    if(!q.trim())return;
    setMsgs(m=>[...m,{cls:'me',txt:q},{cls:'ai thinking',txt:'Reading the screen…'}]);
    const image=await snapView();
    fetch('/api/ai/chat',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:q,context:ctx(),image,
        history:msgs.filter(m=>!m.cls.includes('thinking')).map(m=>({role:m.cls==='me'?'user':'assistant',content:m.txt}))})})
     .then(r=>r.json()).then(d=>{setModel(d.model);
       setMsgs(m=>[...m.filter(x=>!x.cls.includes('thinking')),{cls:'ai',txt:d.reply}])})
     .catch(()=>setMsgs(m=>[...m.filter(x=>!x.cls.includes('thinking')),{cls:'ai',txt:'The local model is not reachable.'}]));
  },[ctx,msgs]);
  return h`<div>
    <button class="fab" onClick=${()=>setOpen(o=>!o)} aria-label="Ask the assistant">${open?'×':'AI'}</button>
    ${open&&h`<div class="aipop">
      <div class="head"><b>Assistant</b><span class="st">${model||'…'} · ${tr('sees this view')}</span></div>
      <div class="body">
        ${msgs.length===0&&h`<div class="m ai">I can see the ${((TABS.find(([id])=>id===tab)||[])[1]||tab).toLowerCase()} view${snaps[hour]?` at ${snaps[hour].time}`:''}. Ask me about what's on screen.</div>`}
        ${msgs.map((m,i)=>h`<div class=${'m '+m.cls} key=${i}>${m.txt}</div>`)}
        <div ref=${endRef}></div>
      </div>
      <div class="foot">
        <input value=${val} onInput=${e=>setVal(e.target.value)} placeholder=${tr('Ask about this view…')}
          onKeyDown=${e=>{if(e.key==='Enter'){send(val);setVal('')}}}/>
        <button class="send" onClick=${()=>{send(val);setVal('')}} aria-label="Send">↑</button>
      </div>
    </div>`}
  </div>`;
}

export {Ai,AiPop,CANNED,SUGGS,buildCtx};
