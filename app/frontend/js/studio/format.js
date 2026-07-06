

/* ── tokens ── */
const TECH={solar:'#ffcc00',onwind:'#34c759',offwind:'#30b0c7',biomass:'#a2845e',biogas:'#7bc618',
 run_of_river:'#0a84ff',reservoir:'#5e5ce6',gas_ccgt:'#ff9500',gas_chp:'#ff6f3c',coal:'#8e8e93',
 lignite:'#a96f4c',oil:'#ff3b30',waste:'#98989d',other:'#c7c7cc',hydrogen:'#64d2ff',
 gas:'#ff9500',renewable:'#86d99c',conventional:'#6e6e73',phs:'#5e5ce6',nuclear:'#bf5af2',battery:'#64d2ff'};
const tc=c=>(c||'').startsWith('import')?'#aeaeb2':(TECH[c]||'#c7c7cc');
const CNAME={solar:'Solar',onwind:'Onshore wind',offwind:'Offshore wind',biomass:'Biomass',
 biogas:'Biogas',run_of_river:'Run-of-river',reservoir:'Reservoir hydro',gas_ccgt:'Gas (CCGT)',
 gas_chp:'Gas (CHP)',coal:'Hard coal',lignite:'Lignite',oil:'Oil',waste:'Waste',other:'Other',
 hydrogen:'Hydrogen',pumped_hydro:'Pumped hydro',battery:'Battery',
 gas:'Gas',renewable:'Renewables (unspec.)',conventional:'Conventional (unspec.)',
 phs:'Pumped storage',nuclear:'Nuclear',unknown:'Unknown'};
const cn=c=>CNAME[c]||((c||'').startsWith('import')?'Import '+c.slice(7).replace(/_/g,' ').toUpperCase():c);
const GW=x=>(x/1000).toFixed(1);
// MW-first: plain MW with separators below 10 GW; GW only for country-scale numbers
const MW=x=>Math.round(x).toLocaleString('en-US')+' MW';
const P=x=>Math.abs(x)>=10000?(x/1000).toFixed(1)+' GW':MW(x);
// capacity label with German decimals (comma) — MW for ≥1 MW, kW below
const kwLabel=kw=>kw==null?'—':(kw>=1000?(kw/1000).toLocaleString('de-DE',{maximumFractionDigits:2})+' MW'
  :(kw>=1?kw.toLocaleString('de-DE',{maximumFractionDigits:1})+' kW':(kw*1000).toLocaleString('de-DE',{maximumFractionDigits:0})+' W'));
const plantCapKw=g=>g.net_kw!=null?g.net_kw:(g.mw!=null?g.mw*1000:null);
const loadColor=l=>l<.8?'#34c759':l<1?'#ffcc00':l<1.5?'#ff9500':'#ff3b30';
const ovlColor=hh=>hh<10?'#34c759':hh<100?'#ffcc00':hh<500?'#ff9500':hh<2000?'#ff3b30':'#af52de';

export {CNAME,GW,MW,P,TECH,cn,kwLabel,loadColor,ovlColor,plantCapKw,tc};
