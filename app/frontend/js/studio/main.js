import {createRoot,h,useCallback,useEffect,useRef,useState} from './core.js';
import {I18N,setLang as setI18nLang,LangCtx} from './i18n.js';
import {getState,j} from './api.js';
import {TABS,TAB_ALIAS} from './ui.js';
import {Home} from './home.js';
import {Grid} from './gridtab.js';
import {Ai,AiPop} from './ai.js';
import {GridPage,ScenariosPage} from './pages.js';
import {AnalysisPage} from './analysis.js';
import {Docs,Regulatory} from './docs.js';

function App(){
  const [tab,setTab]=useState(()=>{const t=(location.hash||'').slice(1)||'home';
    return TAB_ALIAS[t]||(TABS.some(([id])=>id===t)?t:'home')});
  const [snaps,setSnaps]=useState([]);
  const [summary,setSummary]=useState(null);
  const [hour,setHour]=useState(0);
  const [state,setState]=useState(null);
  const [busy,setBusy]=useState(true);
  const [ds,setDs]=useState('n0');             // 'n0' base-case run · 'n1' N-1-secured run
  const [dsAvail,setDsAvail]=useState(false);  // offer the toggle only if the N-1 run exists
  const [year,setYear]=useState(2025);         // scenario year: 2025 | 2030 | 2032 | 2035
  const [years,setYears]=useState([2025]);     // years with a built redispatch dataset
  const [theme,setTheme]=useState(()=>document.documentElement.dataset.theme||'light');
  useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('gs-theme',theme);
    window.dispatchEvent(new CustomEvent('gs-theme',{detail:theme}))},[theme]);
  const [lang,setLang]=useState(()=>localStorage.getItem('gs-lang')||'en');
  useEffect(()=>{localStorage.setItem('gs-lang',lang);document.documentElement.lang=lang},[lang]);
  const T=I18N[lang]||I18N.en;
  setI18nLang(lang);   // module-level lang for tr() before children render
  useEffect(()=>{   // boot
    j('/api/sample/datasets').then(d=>{
      setDsAvail(!!(d&&d.datasets&&d.datasets.some(x=>x.id==='n1')));
      if(d&&d.years&&d.years.length)setYears(d.years);
    }).catch(()=>{});
  },[]);
  const snapsRef=useRef({});   // per-(year,run) snapshot lists (samplings can differ)
  useEffect(()=>{   // snapshots follow the selected year+run; keep the cursor on the same moment
    const key=year+':'+ds;
    const apply=list=>{
      snapsRef.current[key]=list;
      let ni=hour;
      const cur=snaps[hour];
      if(cur&&cur.h!==undefined&&list.length){           // nearest absolute hour-of-year
        let bd=Infinity;ni=0;
        for(let k=0;k<list.length;k++){const dd=Math.abs(list[k].h-cur.h);if(dd<bd){bd=dd;ni=k}}
      }else if(ni>=list.length)ni=0;
      setSnaps(list);if(ni!==hour)setHour(ni);
    };
    if(snapsRef.current[key])apply(snapsRef.current[key]);
    else j('/api/sample/snapshots?ds='+ds+'&year='+year).then(sn=>apply(sn.snapshots));
  },[ds,year]);
  useEffect(()=>{   // annual summary follows the selected year+run
    j('/api/sample/summary?ds='+ds+'&year='+year).then(su=>{setSummary(su);setBusy(false)});
  },[ds,year]);
  useEffect(()=>{   // shared per-hour state, cached per (year, run, hour)
    let live=true;setBusy(true);
    getState(hour,ds,year).then(d=>{if(live){setState(d);setBusy(false)}});
    return()=>{live=false};
  },[hour,ds,year]);
  const go=useCallback(t=>{setTab(t);history.replaceState(null,'','#'+t)},[]);
  return h`<${LangCtx.Provider} value=${lang}><div style=${{height:'100%'}}>
    <nav class="nav">
      <span class="brand" role="link" tabIndex=${0} title="Back to overview" onClick=${()=>go('home')}
        onKeyDown=${e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go('home')}}}>Grid Studio</span>
      <div class="seg" role="tablist">${TABS.map(([id,l])=>h`
        <button key=${id} role="tab" aria-selected=${tab===id} class=${tab===id?'on':''} onClick=${()=>go(id)}>${T.tabs[id]||l}</button>`)}</div>
      <span class="navmeta">${tab==='scen'&&years.length>1?`${T.scenario} ${year}`:''}</span>
      <div class="navctl">
        <div class="lang" role="group" aria-label="Language">
          <button class=${lang==='en'?'on':''} onClick=${()=>setLang('en')}>EN</button>
          <button class=${lang==='de'?'on':''} onClick=${()=>setLang('de')}>DE</button>
        </div>
        <button class="thm" onClick=${()=>setTheme(theme==='dark'?'light':'dark')}
          title=${theme==='dark'?'Light mode':'Dark mode'} aria-label="Toggle appearance">
          ${theme==='dark'
            ?h`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.4"/><path d="M12 2.8v2.2M12 19v2.2M2.8 12H5M19 12h2.2M5.4 5.4L7 7M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6"/></svg>`
            :h`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.2 14.2A8.2 8.2 0 0 1 9.8 3.8a8.2 8.2 0 1 0 10.4 10.4Z"/></svg>`}
        </button>
      </div>
    </nav>
    ${busy&&h`<div class="loadpill">${T.loading}</div>`}
    ${tab==='home'&&h`<${Home} summary=${summary} go=${go} T=${T} lang=${lang}/>`}
    <${GridPage} active=${tab==='grid'} hour=${hour} state=${state} snaps=${snaps} setHour=${setHour} ds=${ds} years=${years}/>
    <${ScenariosPage} active=${tab==='scen'} hour=${hour} state=${state} snaps=${snaps} setHour=${setHour} ds=${ds} setDs=${setDs} dsAvail=${dsAvail} summary=${summary} year=${year} setYear=${setYear} years=${years}/>
    <${AnalysisPage} active=${tab==='analysis'} years=${years}/>
    <${Regulatory} active=${tab==='reg'}/>
    <${Docs} active=${tab==='docs'}/>
    <${Ai} active=${tab==='ai'} hour=${hour} snaps=${snaps} state=${state} summary=${summary}/>
    ${tab!=='ai'&&h`<${AiPop} tab=${tab} hour=${hour} snaps=${snaps} state=${state} summary=${summary}/>`}
  </div><//>`;
}
createRoot(document.getElementById('root')).render(h`<${App}/>`);

export {App};
