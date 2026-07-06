import {h,useEffect,useState} from './core.js';
import {tr} from './i18n.js';
import {TopicNav} from './ui.js';
import {Gen} from './gen.js';
import {Grid} from './gridtab.js';
import {Capex} from './capex.js';
import {Load} from './loadtab.js';
import {Flow} from './flow.js';
import {Cong} from './cong.js';
import {Official} from './official.js';
import {Merit,Validation} from './market.js';
import {Invest} from './invest.js';
import {Territories} from './territories.js';
import {Muni,Scenarios} from './regional.js';
import {Reform} from './reform.js';
import {DC} from './dc.js';

/* ── merged sections: one window each, sub-views switched in-place ── */
/* Grid: everything that describes the grid as it stands — grouped by topic */
const GRID_GROUPS=[
  ['Electrical',[['network','Network'],['gen','Generation'],['load','Load'],['capex','CAPEX estimator']]],
  ['Regions',[['muni','Municipalities'],['territories','Territories'],['scenarios','NEP forecast']]],
  ['Build-out',[['invest','Investment plan'],['reform','Grid reform']]],
  ['Fibre',[['dc','LWL backbone']]]];
function GridPage({active,hour,state,snaps,setHour,ds,years}){
  const [sub,setSub]=useState('network');
  const nav=h`<${TopicNav} groups=${GRID_GROUPS} cur=${sub} set=${setSub}/>`;
  return h`<div>
    <${Grid} active=${active&&sub==='network'} nav=${nav}/>
    <${Gen} active=${active&&sub==='gen'} nav=${nav} hour=${hour} state=${state} snaps=${snaps} setHour=${setHour} ds=${ds} years=${years}/>
    <${Load} active=${active&&sub==='load'} nav=${nav} hour=${hour} state=${state} snaps=${snaps} setHour=${setHour} ds=${ds} years=${years}/>
    <${Capex} active=${active&&sub==='capex'} nav=${nav}/>
    <${Muni} active=${active&&sub==='muni'} nav=${nav}/>
    <${Territories} active=${active&&sub==='territories'} nav=${nav}/>
    <${Scenarios} active=${active&&sub==='scenarios'} nav=${nav}/>
    <${Invest} active=${active&&sub==='invest'} nav=${nav}/>
    <${Reform} active=${active&&sub==='reform'} nav=${nav}/>
    <${DC} active=${active&&sub==='dc'} nav=${nav}/>
  </div>`;
}
/* Scenarios: the simulation results — pick the year first, then the view.
   2025 = calibrated against measurement (SMARD, Redispatch 2.0 publications);
   2030/2032/2035 = NEP-scaled model horizons, so the measured-reference views
   (vs SMARD, Official data) give way to the model-only market summary. */
function ScenariosPage({active,hour,state,snaps,setHour,ds,setDs,dsAvail,summary,year,setYear,years}){
  const [sub,setSub]=useState('flow');
  const items=year===2025
    ?[['flow','Power flow · hour'],['cong','Congestion · year'],['merit','Merit order'],['val','vs SMARD'],['off','Official data']]
    :[['flow','Power flow · hour'],['cong','Congestion · year'],['val','Market (model)']];
  useEffect(()=>{if(!items.some(([id])=>id===sub))setSub(sub==='off'||sub==='merit'?'val':'flow')},[year]);
  const nav=h`<div>
    ${years.length>1&&h`<div class="subtop">
      <span class="sublbl">${tr("Scenario year")}</span>
      ${years.map(y=>h`<button key=${y} class=${year===y?'on':''} onClick=${()=>setYear(y)}>${y}</button>`)}
    </div>`}
    <div class="subnav" style=${years.length>1?{paddingTop:8}:{}}>
      ${items.map(([id,l])=>h`<button key=${id} class=${sub===id?'on':''} onClick=${()=>setSub(id)}>${tr(l)}</button>`)}
    </div>
    ${year!==2025&&h`<div class="subnote">${tr('NEP-scaled')} ${year} ${tr('— fleet, load and grid; model scenario, no measured reference.')}</div>`}
  </div>`;
  return h`<div>
    <${Flow} active=${active&&sub==='flow'} nav=${nav} hour=${hour} state=${state} snaps=${snaps} setHour=${setHour} ds=${ds} setDs=${setDs} dsAvail=${dsAvail} year=${year}/>
    <${Cong} active=${active&&sub==='cong'} nav=${nav} summary=${summary} ds=${ds} setDs=${setDs} dsAvail=${dsAvail} year=${year}/>
    <${Merit} active=${active&&sub==='merit'&&year===2025} nav=${nav}/>
    <${Validation} active=${active&&sub==='val'} nav=${nav} year=${year}/>
    <${Official} active=${active&&sub==='off'&&year===2025} nav=${nav}/>
  </div>`;
}

export {GRID_GROUPS,GridPage,ScenariosPage};
