/* User guide for the Grid Studio app — how to USE every tab, window and control
   (distinct from methodology.js, which explains how the model was BUILT).
   window.GUIDE = [ { id, group, title, body(HTML) }, ... ]. Images: /js/guide/*.png.
   Rewritten 2026-07-06 as a plain-language "for dummies" guide covering the full app:
   6 nav tabs + Assistant, Grid topic groups (incl. CAPEX estimator), year-first Scenarios,
   3 Analysis views, Regulatory tab, theme/language controls. Edit this file — no rebuild. */
window.GUIDE = [

/* ───────────────────────── GETTING STARTED ───────────────────────── */
{id:'welcome', group:'Getting started', title:'Welcome — what is this app?', body:`
<p>Grid Studio is an interactive map of the <b>German electricity grid</b>. Behind it sits a
computer model that replays a <b>whole year, hour by hour</b> (8,760 hours): where power is
made, where it is used, how it flows through every cable — and what happens when a cable
can't take any more.</p>
<p>You don't need to be a power engineer. If you can use Google Maps, you can use this.
Everything is: <b>look at a map, click things, and read the panel on the right</b>.</p>
<h3>What you can find out here</h3>
<ul>
<li><b>What the grid looks like</b> — every high-voltage line, substation and power plant in
Germany, on one map. Plus what will be built by 2030, 2032 and 2035.</li>
<li><b>What happens at any hour of the year</b> — pick 7&nbsp;pm on a stormy January evening
and watch northern wind power jam the north–south lines.</li>
<li><b>Where the grid is congested</b> — which lines overload, how often, and how the grid
operators fix it every hour (a process called <i>redispatch</i>).</li>
<li><b>Whether the model is trustworthy</b> — it is checked against the real, published 2025
market and redispatch data, and you can see the comparison yourself.</li>
<li><b>Business answers</b> — What would a big battery earn at this substation? What does a
grid connection for a solar park cost? Where can a new factory or data centre still plug in?</li>
</ul>
<p class="meth-note"><b>The 30-second version:</b> click <b>Scenarios</b> in the top bar,
drag the time controls to a windy winter evening, and flip the <b>Before / After redispatch</b>
switch. Red lines (overloaded) turn green (fixed). That one interaction is the heart of the
whole app — the rest of this guide just adds detail.</p>
<p>Want to know how the model was <i>built</i> (data sources, algorithms, calibration)?
That's the <b>Methodology</b> chapters, further down this same sidebar.</p>
`},

{id:'first-tour', group:'Getting started', title:'Your first five minutes', body:`
<p>A guided warm-up. Do these five things in order and you'll have seen the core of the app:</p>
<ol>
<li><b>Read the front page.</b> You land on <b>Overview</b>. Scroll down once — a short
illustrated story explains the one mechanism everything else builds on: wind in the north,
demand in the south, not enough wires in between.</li>
<li><b>Look at the grid itself.</b> Click <b>Grid</b> in the top bar. You see every line
coloured by voltage (blue 110&nbsp;kV, green 220&nbsp;kV, red 380&nbsp;kV). Zoom into your
home town. Hover a line — a tooltip names its endpoints.</li>
<li><b>Travel in time.</b> Click <b>Scenarios</b>. Above the map is the time control: click
<b>Jan</b>, pick day <b>15</b>, drag the hour slider to <b>18:00</b>. The map now shows the
power flows of that exact hour.</li>
<li><b>Fix the grid with one click.</b> In the right panel, flip between <b>Before</b> and
<b>After redispatch</b>. Before = what the electricity market wanted to do (red = overloaded
lines). After = what actually flows once the grid operators intervened.</li>
<li><b>Ask a question.</b> Click the round <b>AI</b> button (bottom-right). Type
"what is congested right now?". The assistant can literally see your screen and answers
about the view you have open.</li>
</ol>
<p class="meth-note">Nothing you click can break anything. The app only <i>shows</i> results
(plus a few on-demand calculators) — feel free to click everything.</p>
`},

{id:'navbar', group:'Getting started', title:'Finding your way around', body:`
<p>The thin bar at the top is the only navigation you need. From left to right:</p>
<table>
<tr><td><b>Grid Studio</b></td><td>the logo — click it any time to return to the front page.</td></tr>
<tr><td><b>Overview</b></td><td>the front page: the story, the year's headline numbers, and a
"grid at night" animation drawn live from the model.</td></tr>
<tr><td><b>Grid</b></td><td>everything about the grid <i>as a thing</i> — the network, power
plants, demand, planned build-out, who operates what, plus a connection-cost calculator.
It has topic groups (Electrical · Regions · Build-out · Fibre) with views under each.</td></tr>
<tr><td><b>Scenarios</b></td><td>the simulation <i>results</i>. Pick a year first
(2025 · 2030 · 2032 · 2035), then a view: hourly power flows, annual congestion, the market,
and the reality checks.</td></tr>
<tr><td><b>Analysis</b></td><td>three site-finder tools built on the simulation: battery
economics under flexible connections, greenfield connection capacity, and battery-vs-grid-expansion
siting.</td></tr>
<tr><td><b>Regulatory</b></td><td>short, readable briefings on German energy regulation —
each linked to what the model actually shows.</td></tr>
<tr><td><b>Guide</b></td><td>this manual, followed by the full methodology.</td></tr>
<tr><td><b>Assistant</b></td><td>the chat helper. Also available as a floating button on
every tab.</td></tr>
</table>
<h3>Two little switches, far right</h3>
<ul>
<li><b>EN / DE</b> — switches the interface language between English and German.</li>
<li><b>Sun / moon icon</b> — switches between light and dark mode. Every map and chart
follows along.</li>
</ul>
<p>Inside <b>Grid</b> and <b>Scenarios</b>, a second row of buttons appears at the top of the
right-hand panel — that's how you switch between the views of that tab. The web address always
carries the current tab (e.g. <code>#scen</code>), so you can bookmark or share a link
straight to a tab.</p>
`},

{id:'maps', group:'Getting started', title:'How every map works', body:`
<p>Most views are a map of Germany with a control panel (the "rail") on the right. They all
behave the same way:</p>
<ul>
<li><b>Move around</b> — drag the map to pan, scroll to zoom (or use the + / − buttons).</li>
<li><b>Hover</b> — rest the cursor on any line, dot or area and a tooltip tells you what it
is and its key numbers.</li>
<li><b>Click</b> — opens the details: sometimes in the right rail ("Inspector" or "Selected"
sections), sometimes as a popup on the map itself.</li>
<li><b>Chips</b> — the small rounded buttons in the rail are on/off switches and choices.
A filled (dark) chip is ON. Click to toggle. They control layers, filters, years, scenarios…</li>
<li><b>Legends</b> — every coloured map explains its own colour scale in the rail.</li>
<li><b>Tables are clickable</b> — in most rails, clicking a row of a "top …" table selects
that thing and often flies the map to it.</li>
</ul>
<p class="meth-why"><b>Colour conventions used everywhere:</b><br>
Voltage levels — <b>blue</b> 110&nbsp;kV · <b>green</b> 220&nbsp;kV · <b>red</b> 380&nbsp;kV ·
dashed <b>purple</b> = HVDC (high-voltage direct current links).<br>
Line loading — <b>green</b> relaxed → <b>yellow / orange</b> near the limit → <b>red / purple</b>
overloaded.<br>
Anything <b>orange</b> on a grid map = new, i.e. part of the future build-out.<br>
Good/bad numbers in tables — green = improved, red = problem.</p>
`},

{id:'timecontrol', group:'Getting started', title:'The time control', body:`
<p>Views that show a single hour (Power flow, Generation, Load) share one time control, docked
above the map. A year has 8,760 hours, so instead of one endless slider you pick the moment in
three quick steps:</p>
<img class="meth-img" src="/js/guide/timeline.png" alt="The time control"/>
<div class="meth-cap">Left: the selected date and hour. Middle: month chips and the day picker.
Right: an hour-of-day slider and the national demand at that moment.</div>
<ul>
<li><b>Month</b> — click one of the 12 chips (Jan … Dec).</li>
<li><b>Day</b> — the dropdown picks the day of the month; the <b>‹ ›</b> arrows step one day
back / forward.</li>
<li><b>Hour</b> — drag the slider across the 24 hours of that day.</li>
</ul>
<h3>Keyboard (much faster once you're browsing)</h3>
<table>
<tr><td><b>← / →</b></td><td>one hour back / forward</td></tr>
<tr><td><b>Shift + ← / →</b></td><td>one day back / forward</td></tr>
<tr><td><b>Page Up / Page Down</b></td><td>one week back / forward</td></tr>
</table>
<p class="meth-note">The chosen moment is <b>shared between views and years</b>: switch from
Power flow to Generation, or from 2025 to 2030, and you stay at (nearest to) the same hour —
so you can compare the same winter evening everywhere.</p>
`},

{id:'words', group:'Getting started', title:'The words you\'ll keep seeing', body:`
<p>Ten terms cover 95% of the app. Skim this once; come back when needed.</p>
<table>
<tr><td><b>Bus / node</b></td><td>a substation — a connection point in the grid. The dots on
the maps. This model has ~7,700 of them, all named.</td></tr>
<tr><td><b>Line</b></td><td>an overhead line or cable between two buses. Its <i>rating</i> is
the most power it may carry; <i>loading</i> is how much of that is used (over 100% = overloaded).</td></tr>
<tr><td><b>kV (kilovolt)</b></td><td>voltage level. 380 and 220&nbsp;kV are the long-distance
transmission grid; 110&nbsp;kV is the regional distribution level above your local grid.</td></tr>
<tr><td><b>TSO / DSO</b></td><td>Transmission System Operator (the four big ones: TenneT,
50Hertz, Amprion, TransnetBW) and Distribution System Operators (regional, e.g. SH Netz,
Bayernwerk). TSOs run 380/220&nbsp;kV, DSOs run 110&nbsp;kV and below.</td></tr>
<tr><td><b>Dispatch</b></td><td>the market's hourly plan of which power plants run. It ignores
the grid — it just picks the cheapest plants (the <i>merit order</i>).</td></tr>
<tr><td><b>Congestion</b></td><td>when the market's plan would push more power through a line
than it can carry.</td></tr>
<tr><td><b>Redispatch</b></td><td>the fix: turn <i>down</i> plants on the wrong side of the
bottleneck (often wind in the north — that part is <i>curtailment</i>) and turn <i>up</i>
plants on the other side (often gas in the south). Costs billions per year in reality.</td></tr>
<tr><td><b>N-1</b></td><td>the safety standard: the grid should survive the sudden loss of any
single line. An "N-1 secured" run leaves headroom for that.</td></tr>
<tr><td><b>NEP</b></td><td>Netzentwicklungsplan — Germany's official grid development plan.
The source of the future build-out and of the 2030/2032/2035 scenarios.</td></tr>
<tr><td><b>BESS / FCA</b></td><td>Battery Energy Storage System, and Flexible Connection
Agreement — a faster grid connection in exchange for accepting limits at times of local
renewable abundance. The Analysis tab quantifies that trade.</td></tr>
</table>
`},

/* ───────────────────────── THE GRID TAB ───────────────────────── */
{id:'grid-intro', group:'The Grid tab', title:'The Grid tab at a glance', body:`
<p>The Grid tab describes the grid <b>as it stands</b> (and as it is planned). At the top of
its right rail sits a <b>topic row</b>; each topic has its own views as pills below it:</p>
<table>
<tr><td><b>Electrical</b></td><td>Network · Generation · Load · CAPEX estimator</td></tr>
<tr><td><b>Regions</b></td><td>Municipalities · Territories · NEP forecast</td></tr>
<tr><td><b>Build-out</b></td><td>Investment plan · Grid reform</td></tr>
<tr><td><b>Fibre</b></td><td>LWL backbone (fibre-optic network + data centres)</td></tr>
</table>
<p>The next chapters walk through each view in that order.</p>
`},

{id:'grid-network', group:'The Grid tab', title:'Network — the map of everything', body:`
<p>The physical grid: ~9,300 lines, ~7,700 substations, every transformer, phase-shifter and
HVDC link. This map is the canvas everything else in the app is drawn on.</p>
<img class="meth-img" src="/js/guide/g_network.png" alt="Grid Network view"/>
<div class="meth-cap">Lines coloured by voltage. Click any element to inspect it in the rail.</div>
<h3>Controls in the rail</h3>
<ul>
<li><b>Grid state</b> — <b>2025</b> shows today's grid. <b>2030 / 2032 / 2035</b> draw the
committed build-out <b style="color:#ff9500">in orange</b> on top: new lines (solid), corridor
upgrades (dashed), new HVDC (dotted), new substations (rings) and offshore landing points
(filled dots). Hover any orange element for its name and in-service year.</li>
<li><b>Voltage levels</b> — show/hide the 110 / 220 / 380&nbsp;kV layers.</li>
<li><b>Elements</b> — show/hide buses (the dots), transformers (white dots), phase-shifters
(purple dots) and HVDC links (dashed purple).</li>
</ul>
<h3>Clicking things</h3>
<ul>
<li><b>Click a line, transformer or HVDC link</b> — the <b>Inspector</b> in the rail shows its
full data sheet (rating, length, impedances, endpoints) with buttons to jump to either end.</li>
<li><b>Click a bus (dot)</b> — opens the <b>battery simulator popup</b> for that substation
(its own chapter under "More tools"). Inside it, <b>"Show connected plants ▸"</b> draws every
power plant that feeds this substation at its true registered location, connected by dashed
lines — click a plant for its registry details.</li>
</ul>
<p class="meth-note">If dots don't react to clicks, make sure the <b>Buses</b> chip is ON.</p>
`},

{id:'grid-generation', group:'The Grid tab', title:'Generation — where power is made', body:`
<p>Every substation drawn as a bubble: <b>size</b> = installed generation capacity,
<b>colour</b> = its dominant technology (yellow solar, blue wind, …).</p>
<img class="meth-img" src="/js/guide/g_generation.png" alt="Grid Generation view"/>
<div class="meth-cap">Installed capacity per node; the rail shows the live national dispatch
for the selected hour.</div>
<h3>What you can do</h3>
<ul>
<li><b>Fleet year</b> — 2025 is today's power-plant fleet; 2030 / 2032 / 2035 show the
NEP-scaled future fleets. A <b>development table</b> in the rail lists installed GW per
technology across all years.</li>
<li><b>Technology chips</b> — filter the map to only solar, only wind, only gas… ("Select
all" / "Clear" for bulk).</li>
<li><b>Time control</b> — sets the hour for the "Country dispatch this hour" bars in the rail
(what is actually running right now, nationally).</li>
<li><b>Click a bubble</b> — that node's breakdown for the selected hour: installed vs
currently generating vs curtailed, per technology.</li>
</ul>
`},

{id:'grid-load', group:'The Grid tab', title:'Load — where power is used', body:`
<p>Electricity demand, shaded per district (Landkreis): the darker the orange, the more that
district draws in the selected hour.</p>
<img class="meth-img" src="/js/guide/g_load.png" alt="Grid Load view"/>
<div class="meth-cap">District demand for the selected hour; hover any district for its MW.</div>
<h3>What you can do</h3>
<ul>
<li><b>Demand year</b> — 2025 or the NEP-scaled future years. The <b>demand development</b>
table shows how national demand grows (electrification: heat pumps, EVs, electrolysis).</li>
<li><b>Time control</b> — the shading updates to each hour (watch the evening peak appear).</li>
<li><b>Layers</b> — <b>Landkreise</b> is the district shading; <b>Nodes</b> adds a teal circle
per substation sized by its own load.</li>
<li><b>Top districts</b> — the rail ranks the hungriest districts this hour.</li>
</ul>
`},

{id:'grid-capex', group:'The Grid tab', title:'CAPEX estimator — price a grid connection', body:`
<p>An interactive cost calculator: put a project anywhere on the map and find out what its
grid connection would cost. It works in three steps, and the rail walks you through them:</p>
<ol>
<li><b>Place the project</b> — the cursor is a crosshair; click the map at your site
(a field, a rooftop, anywhere).</li>
<li><b>Set the parameters</b> — a dialog asks what it is: technology (solar, onshore wind,
battery, electrolyser, large load / data centre, hybrid), size in MW (and MWh for batteries),
reactive-power capability (cos&nbsp;φ), N-1 redundancy, connection concept (export at 33&nbsp;kV
with the transformer at the grid end — the usual layout — or transformer at your site with a
high-voltage cable), and the target grid voltage.</li>
<li><b>Pick the connection</b> — either click a specific substation or line on the map
(clicking a line prices a T-tap into it), or press <b>"Show best 3 options ▸"</b> and let the
app rank the three cheapest connections by 30-year cost. The routes are drawn on the map;
click a route or its badge for a summary popup.</li>
</ol>
<h3>Reading the result (right rail)</h3>
<ul>
<li><b>Headline cards</b> — total CAPEX, CAPEX per MW, yearly OPEX, 30-year NPV, voltage drop.</li>
<li><b>Cable sizing</b> — the app tries every standard cable cross-section and recommends the
one with the lowest 30-year total of purchase price + electrical losses. The chart shows the
cost curves crossing — where a fatter (more expensive) cable pays for itself via lower losses.</li>
<li><b>Cost split</b> — cable supply, installation, earthworks, switch bays / stations /
transformer, and any reactive-power compensation, each priced separately.</li>
<li><b>Concept comparison</b> — the layout you did <i>not</i> choose is always priced too;
if it's cheaper, the app says so.</li>
<li><b>Watch out</b> — orange flags for anything unusual (very long route, heavy voltage drop…).</li>
</ul>
<h3>Co-location — share one connection</h3>
<p>Below the result: fix a transformer size, pick a second technology, and press
<b>"Analyse co-location ▸"</b>. Using real regional weather curves, the app sweeps a full year
hour-by-hour and tells you how much solar can ride along on a wind connection (or vice versa)
before curtailment bites — with the largest size at ≤1% / ≤5% / ≤10% energy lost, and a monthly
chart showing why complementary seasons make sharing work.</p>
<p class="meth-note">These are screening numbers (±30%), built on an NEP/BNetzA-style unit-cost
catalogue — good for comparing options and orders of magnitude, not a substitute for a quote.</p>
`},

{id:'grid-muni', group:'The Grid tab', title:'Municipalities — the finest view', body:`
<p>Germany's ~11,000 municipalities, shaded by what's installed in each one (from the official
Marktstammdatenregister) or by modelled demand.</p>
<img class="meth-img" src="/js/guide/g_muni.png" alt="Municipalities choropleth"/>
<div class="meth-cap">Pick a layer in the rail; darker = more.</div>
<h3>What you can do</h3>
<ul>
<li><b>Layer chips</b> — Renewable total · Solar · Wind · Biomass · Hydro · Storage · Load.
The rail shows the national total and the colour scale for the chosen layer.</li>
<li><b>Hover</b> — a municipality's renewables and load at a glance.</li>
<li><b>Click</b> — the full breakdown of that municipality (every layer at once) in the
Inspector.</li>
</ul>
<p class="meth-note">Load only appears in municipalities that contain a grid node in the model
(~2,800 of them) — blank load there doesn't mean nobody uses electricity.</p>
`},

{id:'grid-territories', group:'The Grid tab', title:'Territories — who runs which grid', body:`
<p>The service areas: the four TSO control zones and the DSO territories on one map.</p>
<img class="meth-img" src="/js/guide/g_territories.png" alt="Territories view"/>
<div class="meth-cap">Every operator in its own colour; hover for the name.</div>
<p>Toggle <b>TSO</b> and <b>DSO</b> layers, restrict DSOs to the 110&nbsp;kV (HV) operators,
or isolate a single operator to see exactly where it operates. Useful background whenever the
app says "the DSO acts first, then the TSO" — here you see who that actually is, where.</p>
`},

{id:'grid-nep', group:'The Grid tab', title:'NEP forecast — the official future, by region', body:`
<p>The NEP 2025 regional scenarios: how much solar, wind, storage and demand every region and
every distribution operator is <i>expected</i> to have in 2030, 2035, 2045.</p>
<img class="meth-img" src="/js/guide/g_scenarios.png" alt="NEP regional forecast"/>
<div class="meth-cap">A forecast choropleth — pick the technology, year and level in the rail.</div>
<h3>What you can do</h3>
<ul>
<li><b>Network level</b> — DSO (distribution forecast) or TSO (transmission scenarios A / B).</li>
<li><b>View</b> (DSO only) — shade by planning region, or by individual DSO territory,
with a ranked operator list you can click.</li>
<li><b>Technology</b> — a dropdown with totals, each generation technology, storage and
consumption categories.</li>
<li><b>Installed vs Change Δ</b> — absolute values in a year, or the <i>growth between two
years</i> (pick "from" and "to"); darker = more growth, grey = shrinking.</li>
<li><b>Click a region / DSO</b> — its complete forecast table.</li>
</ul>
`},

{id:'grid-invest', group:'The Grid tab', title:'Investment plan — what will be built', body:`
<p>The pipeline of grid reinforcement projects: new lines, upgrades and substations from the
official transmission plan (NEP) and the DSOs' §14d plans, each with its commitment status and
target year.</p>
<img class="meth-img" src="/js/guide/g_invest.png" alt="Investment plan view"/>
<div class="meth-cap">Projects on the map (real corridor routes where published) plus a
filterable table.</div>
<h3>What you can do</h3>
<ul>
<li><b>Filter</b> — by operator, by commitment tier (<b>safe</b> = built / under construction,
<b>firm</b> = decided, <b>likely</b> = in planning, <b>maybe</b> = proposed), by completion
year, by text search. Dashed = not yet committed.</li>
<li><b>Colour by</b> — commitment tier or voltage level.</li>
<li><b>Click a project</b> (map or table row) — its full record: measure name, operator,
voltage, kilometres, commissioning year.</li>
</ul>
<p class="meth-note">Compare with <b>Scenarios → Congestion</b>: do today's chronic bottlenecks
already have a fix in this pipeline? (Mostly: yes, that's what the 2030+ scenario years show.)</p>
`},

{id:'grid-reform', group:'The Grid tab', title:'Grid reform — where you can still connect', body:`
<p>Since April 2026 the four TSOs no longer hand out transmission connections first-come,
first-served — projects apply in cycles and are ranked by <i>maturity</i> (the
Reifegradverfahren). This view maps every published cycle-1 connection point.</p>
<h3>Two modes (top of the rail)</h3>
<ul>
<li><b>Data</b> — the published facts: the battery-queue chart that forced the reform,
every connection point with its available MW (bars), switch-bay counts and restrictions,
the 50Hertz oversubscription list, the project scoring system and the fees.</li>
<li><b>Analysis — why these nodes?</b> — the interpretation: what "requested / reserved /
available" actually mean, how the four TSOs' NEP plans drive the choices, node-by-node
"why here?" write-ups, and our <b>cycle-2 predictions</b> (Tier 1 / Tier 2 chips put them
on the map).</li>
</ul>
<h3>Reading the map</h3>
<p>Dots are connection points, coloured by TSO. <b>Dashed ring</b> = a hard restriction
(e.g. no free switch bay today). Click any point for its full data card. The filters above the
list (TSO, "appliable now", COD year…) apply to map and list together.</p>
`},

{id:'grid-fibre', group:'The Grid tab', title:'Fibre — the LWL backbone & data centres', body:`
<p>A different network on the same map: SEFE's fibre-optic (LWL) backbone, laid along gas
pipeline corridors — the low-latency routes that connect data-centre and internet-exchange
sites.</p>
<img class="meth-img" src="/js/guide/dc.png" alt="Fibre backbone map"/>
<div class="meth-cap">Blue = fibre routes and stations; amber = data centres; purple =
internet exchanges; green = screened DC connection sites.</div>
<h3>What you can do</h3>
<ul>
<li><b>Layer chips</b> — Routes, PoPs, repeaters, stations · <b>Data centres</b> (≥10 MW,
from OpenStreetMap) · <b>Potential</b> (internet exchanges from PeeringDB, scored and tiered)
· <b>Sites 40–50 MW</b> (substations screened for a mid-size data-centre connection:
grid availability × fibre distance × exchange latency) · <b>Europe view</b> widens the frame
beyond Germany.</li>
<li><b>Find a site</b> — a search box over every PoP / repeater / station; click a hit to fly
there.</li>
<li><b>Click anything</b> — site cards show the score breakdown, an exchange card shows its
members (including which hyperscalers are on the fabric), a data-centre card its size class.</li>
</ul>
`},

/* ───────────────────────── THE SCENARIOS TAB ───────────────────────── */
{id:'sc-years', group:'The Scenarios tab', title:'Scenarios — pick a year first', body:`
<p>Everything in this tab is a <b>result</b> of the year-long simulation. The first choice is
always the <b>scenario year</b> (top of the rail):</p>
<table>
<tr><td><b>2025</b></td><td>the reference year: today's grid and fleet, calibrated against
real measurements. Only here do the comparison views exist (<b>Merit order</b>, <b>vs SMARD</b>,
<b>Official data</b>) — because only 2025 has reality to compare with.</td></tr>
<tr><td><b>2030 · 2032 · 2035</b></td><td>the future: NEP-scaled fleet and demand on the grid
including the committed build-out. Model-only — the market view becomes "Market (model)".</td></tr>
</table>
<p>Below the year, the view pills: <b>Power flow · hour</b>, <b>Congestion · year</b>, and the
market/validation views. The selected hour survives a year switch, so you can hold one winter
evening fixed and ask "what does 2030 do to <i>this</i>?"</p>
<p class="meth-note">Some views also offer an <b>N-0 / N-1 secured</b> switch: N-0 is the
base run (fix what is actually overloaded); N-1 secured also protects against the loss of any
single line — more redispatch, more realistic operator caution.</p>
`},

{id:'sc-flow', group:'The Scenarios tab', title:'Power flow · hour — the heart of the app', body:`
<p>One hour of the German power system, on the map: every line coloured by how full it is, and
in the rail everything the grid operators changed in that hour.</p>
<img class="meth-img" src="/js/guide/r_thishour.png" alt="Power flow hour view"/>
<div class="meth-cap">Line loadings for the selected hour; the rail holds the energy balance,
worst overloads and the curtailed / ramped-up plants.</div>
<h3>What you can do</h3>
<ul>
<li><b>Before / After redispatch</b> — the key switch. <b>Before</b> = the market's plan
(watch the north–south corridor go red on windy evenings). <b>After</b> = the corrected flows.</li>
<li><b>Curtailment chip</b> — overlays red bubbles where generation was turned down, sized
by MW.</li>
<li><b>N-0 / N-1 run</b> — switch to the N-1-secured dataset (if computed). The rail then adds
an <b>N-1 contingency check</b>: how many single-line outages would still cause an overload,
before vs after — and lists the stubborn pairs that no redispatch can fix (a reinforcement
signal).</li>
<li><b>Time control + keyboard</b> — scrub to find interesting hours (see "The time control").</li>
<li><b>Hover a line</b> — its loading before → after.</li>
</ul>
<h3>Reading the rail</h3>
<ul>
<li><b>Energy balance</b> — generation ± imports ± storage = load ± exports, plus the overload
count before → after (split DSO 110&nbsp;kV vs TSO).</li>
<li><b>Top overloads</b> — the worst lines this hour, before and after.</li>
<li><b>Curtailed / Ramped up</b> — the actual plant movements: red −MW rows (mostly wind and
solar in the north), green +MW rows (mostly gas and hydro in the south).</li>
</ul>
<p class="meth-note"><b>Try this:</b> January, an evening hour, "Before" — the corridor lights
up red. Flip to "After" — green. That's a few hundred thousand euros of redispatch in one hour,
and you just watched it happen.</p>
`},

{id:'sc-congestion', group:'The Scenarios tab', title:'Congestion · year — the big picture', body:`
<p>The whole year on one map: every line coloured by <b>how many hours per year</b> it runs
above its rating.</p>
<img class="meth-img" src="/js/guide/r_congestion.png" alt="Congestion year view"/>
<div class="meth-cap">Annual overload-hours per line; green a few hours → purple thousands.</div>
<h3>What you can do</h3>
<ul>
<li><b>Before (day-ahead) / After redispatch</b> — the market's would-be congestion vs what
survives the correction (the model clears ~96% of overload line-hours).</li>
<li><b>Annual summary table</b> — hours with an overload, lines ever overloaded, overload
line-hours, max loading — each before → after (and N-1 violation counts in the N-1 run).</li>
<li><b>Redispatch by level</b> — TSO redispatch (comparable with official published volumes)
separated from 110&nbsp;kV distribution-level curtailment.</li>
<li><b>Most congested lines</b> — the ranked table. Lines still red <i>after</i> redispatch are
the structural bottlenecks that need actual reinforcement.</li>
</ul>
<p class="meth-note">Switch the scenario year while you're here: 2025 → 2030 shows what the
committed build-out buys; 2030 → 2035 shows electrification catching back up.</p>
`},

{id:'sc-merit', group:'The Scenarios tab', title:'Merit order — the market (2025 only)', body:`
<p>The model's electricity market next to the real one. No map — a scrolling page of charts.</p>
<img class="meth-img" src="/js/guide/m_merit.png" alt="Merit order view"/>
<div class="meth-cap">Annual mix, monthly generation stack, and the hourly price for any day.</div>
<ul>
<li><b>Annual energy mix</b> — the year's generation by fuel as one bar, with TWh and shares.</li>
<li><b>Monthly generation stack</b> — the mix month by month (solar summers, wind winters).</li>
<li><b>Hourly price — pick a day</b> — choose any day of 2025 and see the model's clearing
price beside the real SMARD day-ahead price, hour by hour.</li>
<li><b>Price duration curve & merit order</b> — the year's prices sorted high→low, and the
capacity blocks by marginal cost that produce them.</li>
</ul>
<p class="meth-note">How the price calibration works (correlation 0.30 → 0.91) is in
<b>Methodology → Merit order</b>.</p>
`},

{id:'sc-validation', group:'The Scenarios tab', title:'vs SMARD — is the model right?', body:`
<p>The honesty page for the <b>dispatch</b>: the model against the measured 2025 data from
SMARD (the Bundesnetzagentur's market data platform).</p>
<img class="meth-img" src="/js/guide/m_validation.png" alt="Validation view"/>
<div class="meth-cap">Per-fuel annual energy, daily price track, monthly solar/gas, and the
cross-border balance — model vs measured.</div>
<p>Read it like a scorecard: where the bars for model and reality are close, trust that part of
the model; where they differ, the caption says why. In the future years (2030+) this view
becomes <b>Market (model)</b> — same charts, no measured twin to compare against.</p>
`},

{id:'sc-official', group:'The Scenarios tab', title:'Official data — real redispatch (2025 only)', body:`
<p>The honesty page for the <b>redispatch</b>: every officially published redispatch and
curtailment measure of 2025, mapped and compared with the model's.</p>
<img class="meth-img" src="/js/guide/r_official.png" alt="Official data view"/>
<div class="meth-cap">Official measures as bubbles; charts compare volumes and locations with
the model.</div>
<h3>What you can do</h3>
<ul>
<li><b>Filters</b> — direction (curtailment ↓ / ramp-up ↑), who instructed (TSO / DSO), cause
(congestion / voltage / …), technology. Colour the bubbles by technology, level or cause.</li>
<li><b>Date brush</b> — drag across the timeline to focus a period; the technology stack
updates. Double-click to reset.</li>
<li><b>Model vs reality</b> — daily national curtailment, model line vs official line, on one
chart.</li>
<li><b>Plants comparison</b> — for the most-redispatched real plants: does the model have the
same plant nearby, and does it move it the same way? The <b>"◆ on map"</b> toggle overlays the
model's plants beside the official bubbles.</li>
<li><b>Click a node</b> — every official measure recorded at that location.</li>
</ul>
`},

/* ───────────────────────── THE ANALYSIS TAB ───────────────────────── */
{id:'an-intro', group:'The Analysis tab', title:'The Analysis tab at a glance', body:`
<p>Three site-finder tools, each answering one business question with the simulation's data:</p>
<table>
<tr><td><b>Connection economics</b></td><td>How much battery revenue does a <i>flexible</i>
connection agreement cost, at every 110&nbsp;kV substation?</td></tr>
<tr><td><b>Greenfield siting</b></td><td>Where can new generation, storage or a big load still
physically connect — where is spare line capacity?</td></tr>
<tr><td><b>BESS siting</b></td><td>At which substations would a standard battery genuinely
relieve congestion (and count as grid-supportive)?</td></tr>
</table>
<p>All three colour every substation on a map and rank the best in a table. Click any node for
its numbers.</p>
`},

{id:'an-fca', group:'The Analysis tab', title:'Connection economics — firm vs flexible', body:`
<p>Background in one breath: a <b>firm</b> connection lets a battery do whatever the market
pays for. A <b>Flexible Connection Agreement (FCA)</b> is granted faster, but the operator may
throttle you when local wind/solar output is high — and it bans some reserve markets. This view
computes, for <b>every 110&nbsp;kV substation</b>, how much annual revenue a reference battery
(100&nbsp;MW / 400&nbsp;MWh, 2027 market case) would lose by accepting the FCA there.</p>
<img class="meth-img" src="/js/meth/analysis_fca.png" alt="System-wide FCA map"/>
<div class="meth-cap">Green = the FCA costs little here · red = it costs a lot (windy coastal
nodes, where curtailment bites hardest).</div>
<h3>What you can do</h3>
<ul>
<li><b>Run the scan</b> — first visit shows a <b>"Run system-wide analysis ▸"</b> button
(~2 minutes for ~6,400 buses, then cached).</li>
<li><b>Map layer</b> — the FCA loss map, or the underlying <b>Wind zones</b> / <b>PV zones</b>
(mean capacity factor per municipality, real ERA5 weather) that explain the pattern.</li>
<li><b>Band scenario V1 / V2 / V3</b> — how aggressive the curtailment rule is (V1 = the
current SH Netz spec; V2/V3 = tighter what-ifs).</li>
<li><b>Click a node</b> — a popup computes that bus's full <b>revenue matrix</b> on demand:
band variants × night-cap on/off, with and without the reserve-market restrictions — 12
one-year simulations, each cell the % of revenue lost vs firm.</li>
<li><b>Hardest-hit buses</b> — the ranked table (click a row for its matrix).</li>
</ul>
<p class="meth-note">To simulate <i>your own</i> battery at one specific substation (own size,
own settings), use the per-node simulator instead: Grid → Network → click the bus. Next
chapter group, "More tools".</p>
`},

{id:'an-greenfield', group:'The Analysis tab', title:'Greenfield siting — where is room to connect?', body:`
<p>Every substation coloured by the <b>spare thermal capacity</b> of its lines across the whole
simulated year: green = lots of room, red = none. "Spare" = line rating minus the 95th
percentile of the line's actual flow after redispatch.</p>
<h3>What you can do</h3>
<ul>
<li><b>Grid year</b> — 2025 (today) or 2030 (with the committed build-out and the 2030 run).</li>
<li><b>Voltage & threshold</b> — e.g. only 380&nbsp;kV nodes with ≥500&nbsp;MW spare.</li>
<li><b>Meshed vs Firm</b> — count the spare across <i>all</i> of the node's lines (optimistic,
meshed view) or only its <i>weakest</i> line (conservative view).</li>
<li><b>Overlays</b> — the published Reifegradverfahren connection points (TSO-coloured rings;
dashed = restricted), and for 2030 the committed <b>new substations</b> (orange rings) —
greenfield in the literal sense, no connection queue yet.</li>
<li><b>Click a node / the "most connectable" table</b> — spare by both measures, worst-line
loading, congested hours.</li>
</ul>
<p class="meth-note">This is a line-based screening — transformers, protection and short-circuit
limits are not modelled. Use it to shortlist, then check the published availability
(Grid → Grid reform) before falling in love with a site.</p>
`},

{id:'an-bess-siting', group:'The Analysis tab', title:'BESS siting — where a battery beats the grid', body:`
<p>German regulation sorts battery sites into a triad, and this view classifies <b>every
substation</b> accordingly. The test: park a <i>standard</i> grid-booster battery at the node
(50&nbsp;MW / 200&nbsp;MWh at 110&nbsp;kV, 250&nbsp;MW / 1&nbsp;GWh at 380&nbsp;kV) and replay
the year's pre-redispatch overloads on its lines — charging against export congestion,
discharging against import congestion.</p>
<ul>
<li><b style="color:#34c759">Grid-supportive · netzdienlich</b> — the battery relieves ≥70% of
the local overload energy: a real alternative to redispatch or grid expansion here.</li>
<li><b style="color:#ff9500">Grid-neutral · netzneutral</b> — congested, but the standard
battery only partly helps: operate in the market, under grid constraints.</li>
<li><b style="color:#8e8e93">Market-based · marktdienlich</b> — no congested line at the node:
a pure arbitrage site, no grid value.</li>
</ul>
<h3>What you can do</h3>
<ul>
<li><b>Grid year</b> — any scenario year, or <b>All years</b>: the persistence view, where a
dark ring marks nodes that stay grid-supportive in <i>every</i> year — the strongest
candidates.</li>
<li><b>Voltage / classification chips</b> — filter the map (220&nbsp;kV is excluded: no
standard battery product exists for it).</li>
<li><b>Click a node</b> — overload energy, share relieved, overload hours before → after the
battery, peak excess vs battery power, conflicting hours.</li>
<li><b>Top booster candidates</b> — the ranked table.</li>
</ul>
<p class="meth-note">An upper-bound screening (1&nbsp;MW at the node is assumed to move the
congested line by 1&nbsp;MW) — a shortlist tool, not a network study.</p>
`},

/* ───────────────────────── MORE TOOLS ───────────────────────── */
{id:'tool-bess', group:'More tools', title:'The battery simulator (click any substation)', body:`
<p>The deepest tool in the app, and it hides in plain sight: on <b>Grid → Network</b>, click
any substation dot and a popup opens — a full battery business-case simulator for <i>that</i>
node.</p>
<img class="meth-img" src="/js/meth/bess_popup_result.png" alt="Per-node BESS simulator"/>
<div class="meth-cap">Configure, simulate a full year, read revenue / IRR, export to Excel.</div>
<h3>Top to bottom</h3>
<ul>
<li><b>Battery</b> — power (MW), energy (MWh), round-trip efficiency, max cycles per day.</li>
<li><b>Reserve markets</b> — FCR and aFRR± participation and bid sizes (2027 price case:
reserve prices well below 2025 — the market is saturating).</li>
<li><b>Firm connection / Apply FCA</b> — the key comparison. Under FCA you also choose the
band variant V1–V3 (a small chart shows the curtailment rule), the radius of nearby wind/PV
that drives it, and the night-window option.</li>
<li><b>Financial model</b> — CAPEX €/kWh, OPEX, lifetime, WACC, and a revenue outlook
(Base / Bear / Bull — German battery revenues are widely forecast to <i>decline</i>, and the
model bakes that in).</li>
<li><b>Simulate 1-year dispatch ▸</b> — runs all 8,760 hours in a moment.</li>
</ul>
<h3>Reading the results</h3>
<ul>
<li><b>Cards</b> — net €/yr, arbitrage vs reserves split, cycles, €/MW-yr, and (with FCA on)
the <b>FCA Δ</b>: exactly what the flexible connection costs at this node, split by cause.</li>
<li><b>Project financials</b> — IRR, NPV at your WACC, payback year, and a 15-year cash-flow
chart with declining revenues. With FCA on it shows IRR firm → IRR FCA.</li>
<li><b>Dispatch charts</b> — a representative week (price, charge/discharge, state of charge)
and the <b>full year</b>: scroll to zoom, drag to pan, red bars = hours the FCA capped you.
<b>⤢ Expand</b> opens it full-screen; <b>⤓ Excel</b> downloads the complete hourly dispatch
as a spreadsheet.</li>
</ul>
<p class="meth-note">Changing a financial input re-prices an existing run automatically —
tweak WACC or CAPEX and watch IRR respond live.</p>
`},

{id:'tool-regulatory', group:'More tools', title:'Regulatory — the briefings tab', body:`
<p>A reading tab, styled like a small journal: short briefings on what is moving in German
energy regulation — grid connection rules, network charges, storage regulation, capacity
auctions, market design.</p>
<ul>
<li><b>The list</b> — newest first, each with a date, a topic tag and a one-line summary.
Click to read.</li>
<li><b>Inside a briefing</b> — the write-up, then <b>"In this studio"</b>: where the topic
connects to something you can see in the app (often with the exact tab to open), and the
<b>sources</b> — every briefing cites its primary documents.</li>
<li><b>Newer / Older</b> — page through chronologically at the bottom.</li>
</ul>
<p class="meth-note">Editorial summaries for orientation, not legal advice. Dates refer to the
underlying regulatory event.</p>
`},

{id:'tool-assistant', group:'More tools', title:'The Assistant — chat that sees your screen', body:`
<p>Two ways in: the round <b>AI</b> button floating on every tab (quick questions about the
current view), or the full <b>Assistant</b> tab (longer conversations).</p>
<img class="meth-img" src="/js/guide/assistant.png" alt="Assistant tab"/>
<div class="meth-cap">Ask in plain language; the assistant is briefed on what you're viewing.</div>
<h3>How it works</h3>
<ul>
<li>Every question sends a <b>screenshot of your current view</b> plus a data summary (active
tab, selected hour, key numbers, top overloads) to a <b>local</b> AI model — nothing leaves
your machine.</li>
<li>Ask things like "why is this line red?", "what does this chart mean?", "summarise this
hour".</li>
<li>The badge at the top shows the model status. If no local model is running, the assistant
falls back to a small set of prepared answers (the suggestion chips).</li>
</ul>
`},

/* ───────────────────────── TIPS & RECIPES ───────────────────────── */
{id:'tips-shortcuts', group:'Tips & recipes', title:'Shortcuts, sharing, appearance', body:`
<h3>Keyboard (in views with the time control)</h3>
<table>
<tr><td><b>← / →</b></td><td>one hour</td></tr>
<tr><td><b>Shift + ← / →</b></td><td>one day</td></tr>
<tr><td><b>Page Up / Down</b></td><td>one week</td></tr>
<tr><td><b>Esc</b></td><td>closes any full-screen popup (battery matrix, year chart…)</td></tr>
</table>
<h3>Sharing & state</h3>
<ul>
<li>The URL carries the active tab (<code>#grid</code>, <code>#scen</code>…) — bookmark or
share links straight to a tab.</li>
<li>The selected hour is shared across views and scenario years; heavy layers are cached after
first load, so revisiting a view is instant.</li>
</ul>
<h3>Appearance</h3>
<ul>
<li><b>EN / DE</b> and the <b>sun/moon</b> toggle live at the top right; both are remembered
between visits.</li>
</ul>
`},

{id:'tips-workflows', group:'Tips & recipes', title:'"I want to…" — recipes', body:`
<table>
<tr><td><b>…watch congestion get fixed</b></td><td>Scenarios → Power flow · hour → windy
January evening → flip Before / After.</td></tr>
<tr><td><b>…find the worst lines of the year</b></td><td>Scenarios → Congestion · year → the
"most congested lines" table; the ones still red <i>after</i> redispatch are structural.</td></tr>
<tr><td><b>…see whether 2030 fixes it</b></td><td>Scenarios → switch the year chips → compare
Congestion across 2025 / 2030 / 2032 / 2035. Also: Grid → Network → Grid state 2030 to see the
new orange lines themselves.</td></tr>
<tr><td><b>…check the model against reality</b></td><td>Scenarios (2025) → vs SMARD for the
market, Official data for the redispatch.</td></tr>
<tr><td><b>…value a battery at a specific site</b></td><td>Grid → Network → click the
substation → set battery + financials → Simulate. Compare Firm vs Apply FCA; export the
dispatch to Excel.</td></tr>
<tr><td><b>…scan all of Germany for battery sites</b></td><td>Analysis → Connection economics
(revenue under FCA) · BESS siting (grid value / netzdienlich) · Greenfield (physical room).</td></tr>
<tr><td><b>…price a grid connection for a project</b></td><td>Grid → CAPEX estimator → click
your site on the map → set parameters → "Show best 3 options ▸". Then try Co-location to share
the connection.</td></tr>
<tr><td><b>…find where new load/generation can connect</b></td><td>Analysis → Greenfield
siting, cross-checked with Grid → Grid reform (published connection points).</td></tr>
<tr><td><b>…look up my region</b></td><td>Grid → Municipalities (what's installed),
Territories (who operates), NEP forecast (what's planned), Load (what it consumes).</td></tr>
<tr><td><b>…understand a view without reading manuals</b></td><td>click the AI button and ask
"explain this view".</td></tr>
<tr><td><b>…know how the model was built</b></td><td>keep scrolling this sidebar — the
Methodology chapters start below.</td></tr>
</table>
`},

];
