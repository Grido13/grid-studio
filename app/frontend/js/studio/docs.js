import {h,useEffect,useMemo,useRef,useState} from './core.js';

/* ── DocsView · shared docs layout (Methodology + Guide) ── */
function DocsView({active,pages,navHdr,missing}){
  pages=pages||[];
  const [cur,setCur]=useState(pages.length?pages[0].id:null);
  const mainRef=useRef(null);
  const groups=useMemo(()=>{const g=[],seen={};
    pages.forEach(p=>{if(!seen[p.group]){seen[p.group]=[];g.push([p.group,seen[p.group]]);}seen[p.group].push(p);});
    return g;},[pages]);
  useEffect(()=>{if(mainRef.current)mainRef.current.scrollTop=0;},[cur]);
  if(!pages.length)return h`<div class="view" style=${{display:active?'block':'none'}}>
    <p class="note" style=${{padding:40}}>Content failed to load (<code>${missing||''}</code>).</p></div>`;
  const i=pages.findIndex(p=>p.id===cur),page=pages[i]||pages[0],prev=pages[i-1],next=pages[i+1];
  return h`<div class="view" style=${{display:active?'block':'none'}}>
    <div class="meth-wrap">
      <main class="meth-main" ref=${mainRef}>
        <article class="meth-doc">
          <div class="meth-eyebrow">${page.group}</div>
          <h1 class="meth-h1">${page.title}</h1>
          <div class="meth-body" dangerouslySetInnerHTML=${{__html:page.body}}></div>
          <div class="meth-pager">
            ${prev?h`<button onClick=${()=>setCur(prev.id)}><small>Previous</small>← ${prev.title}</button>`:h`<span></span>`}
            ${next?h`<button class="nx" onClick=${()=>setCur(next.id)}><small>Next</small>${next.title} →</button>`:h`<span></span>`}
          </div>
        </article>
      </main>
      <nav class="meth-nav">
        <div class="meth-navhdr">${navHdr||'On this guide'}</div>
        ${groups.map(([gname,ps])=>h`<div class="meth-navgrp" key=${gname}>
          <div class="meth-navg">${gname}</div>
          ${ps.map(p=>h`<button key=${p.id} class=${'meth-navlink'+(p.id===cur?' on':'')}
            onClick=${()=>setCur(p.id)}>${p.title}</button>`)}
        </div>`)}
      </nav>
    </div>
  </div>`;
}
/* Guide + Methodology merged into one docs tab: how to use the app first,
   how the model is built after. Group names keep the two halves distinct. */
const _METH_GROUP={'Start here':'Methodology','The model (pipeline)':'Methodology — pipeline',
  'App tabs':'Methodology — behind the views','Reproduce everything':'Reproduce everything'};
const DOCS_PAGES=(typeof window==='undefined')?[]
  :[...(window.GUIDE||[]),...((window.METH||[]).map(p=>({...p,group:_METH_GROUP[p.group]||p.group})))];
const Docs=({active})=>h`<${DocsView} active=${active} pages=${DOCS_PAGES}
  navHdr="Guide & methodology" missing="/js/guide.js + /js/methodology.js"/>`;

/* ── Regulatory briefing: editorial reading view over window.REG_POSTS ── */
const REG_DATE=d=>new Date(d+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
function Regulatory({active}){
  const posts=useMemo(()=>((typeof window!=='undefined'&&window.REG_POSTS)||[])
    .slice().sort((a,b)=>b.date.localeCompare(a.date)),[]);
  const [cur,setCur]=useState(null);
  const mainRef=useRef(null);
  useEffect(()=>{if(mainRef.current)mainRef.current.scrollTop=0;},[cur]);
  const i=posts.findIndex(p=>p.id===cur),post=posts[i],prev=posts[i-1],next=posts[i+1];
  if(!posts.length)return h`<div class="view" style=${{display:active?'block':'none'}}>
    <p class="note" style=${{padding:40}}>Content failed to load (<code>/js/regulatory.js</code>).</p></div>`;
  return h`<div class="view" style=${{display:active?'block':'none'}}>
    <main class="reg-main" ref=${mainRef}>
      ${!post?h`<div class="reg-doc">
        <div class="reg-kicker">Regulatory briefing</div>
        <h1 class="reg-h1">The German energy market, on the record.</h1>
        <p class="reg-lede">What is moving in Berlin and Bonn — grid connections, network charges,
          storage rules, capacity auctions and market design — written up against what this model
          actually simulates. Curated from primary sources; every piece carries its references.</p>
        <p class="reg-asof">as of 6 July 2026 · ${posts.length} briefings</p>
        ${posts.map(p=>h`<button class="reg-item" key=${p.id} onClick=${()=>setCur(p.id)}>
          <div class="reg-meta"><span class="reg-date">${REG_DATE(p.date)}</span>
            <span class="reg-tag">${p.tag}</span></div>
          <h3>${p.title}</h3>
          <p>${p.dek}</p>
          <span class="reg-more">Read the briefing →</span>
        </button>`)}
        <span class="note" style=${{display:'block',marginTop:26}}>Editorial summaries of public
          regulatory material, prepared for orientation alongside the model — not legal advice.
          Dates refer to the underlying regulatory event.</span>
      </div>`
      :h`<article class="reg-doc reg-art">
        <button class="reg-back" onClick=${()=>setCur(null)}>← All briefings</button>
        <div class="reg-meta" style=${{marginBottom:12}}>
          <span class="reg-date">${REG_DATE(post.date)}</span>
          <span class="reg-tag">${post.tag}</span></div>
        <h1 class="reg-h1">${post.title}</h1>
        <p class="reg-dek">${post.dek}</p>
        <div class="meth-body" dangerouslySetInnerHTML=${{__html:post.body}}></div>
        ${post.app&&h`<div class="meth-why"><b>In this studio:</b> ${post.app}</div>`}
        <div class="reg-srcs"><h4>Sources</h4>
          <ol>${post.sources.map(([label,url])=>h`<li key=${url}>
            <a href=${url} target="_blank" rel="noopener noreferrer">${label}</a></li>`)}</ol>
        </div>
        <div class="meth-pager">
          ${prev?h`<button onClick=${()=>setCur(prev.id)}><small>Newer</small>← ${prev.title}</button>`:h`<span></span>`}
          ${next?h`<button class="nx" onClick=${()=>setCur(next.id)}><small>Older</small>${next.title} →</button>`:h`<span></span>`}
        </div>
      </article>`}
    </main>
  </div>`;
}

export {DOCS_PAGES,Docs,DocsView,REG_DATE,Regulatory,_METH_GROUP};
