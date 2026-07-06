import {html2canvas} from './core.js';

async function snapView(){
  try{
    const vis=[...document.querySelectorAll('.view')].filter(v=>getComputedStyle(v).display!=='none');
    const el=vis[vis.length-1]||document.getElementById('root');
    const canvas=await html2canvas(el,{useCORS:true,backgroundColor:getComputedStyle(document.body).backgroundColor,scale:.6,logging:false,
      ignoreElements:n=>n.classList&&(n.classList.contains('aipop')||n.classList.contains('fab'))});
    const maxW=960,sc=canvas.width>maxW?maxW/canvas.width:1;
    let out=canvas;
    if(sc<1){out=document.createElement('canvas');
      out.width=Math.round(canvas.width*sc);out.height=Math.round(canvas.height*sc);
      out.getContext('2d').drawImage(canvas,0,0,out.width,out.height);}
    return out.toDataURL('image/jpeg',.7).split(',')[1];
  }catch(e){console.warn('snapView failed',e);return null;}
}

/* ── data layer: parallel boot, per-hour cache (async-parallel, client-swr spirit) ── */
const stateCache=new Map(), kreisCache=new Map();
// bounded caches: a long scrub session would otherwise hold hundreds of MB of
// per-hour states (Map preserves insertion order → delete oldest first)
const _capMap=(m,n)=>{while(m.size>n)m.delete(m.keys().next().value)};
const j=u=>fetch(u).then(r=>r.json());
let NAMES={};j('/api/sample/bus_names').then(d=>{NAMES=d||{}}).catch(()=>{});
const bn=b=>NAMES[b]||('Bus '+b);
const getState=(i,ds='n0',year=2025)=>{const k=year+':'+ds+':'+i;
  return stateCache.has(k)?Promise.resolve(stateCache.get(k)):j('/api/sample/state?i='+i+'&ds='+ds+'&year='+year).then(d=>(stateCache.set(k,d),_capMap(stateCache,36),d))};
const getKreis=(i,ds='n0',year=2025)=>{const k=year+':'+ds+':'+i;
  return kreisCache.has(k)?Promise.resolve(kreisCache.get(k)):j('/api/sample/load_kreis?i='+i+'&ds='+ds+'&year='+year).then(d=>(kreisCache.set(k,d),_capMap(kreisCache,120),d))};

export {NAMES,_capMap,bn,getKreis,getState,j,snapView,stateCache};
