/* Methodology content for the Grid Studio "Methodology" tab.
   One page per app tab + the underlying pipeline, told as the real build journey
   (where it started, every step, how the data was cleaned, why each choice).
   window.METH = [ { id, group, title, body(HTML) }, ... ]
   Written 2026-06-22. Grounded in docs/methodology.md, docs/merit_order_methodology.md,
   docs/merit_order_analysis.md, docs/grid_alpha_build_2026-06-13.md, docs/grid_beta.md,
   docs/network_reduction.md, docs/load_mapping.md and
   docs/dispatchredispatch_power_flow_final_2026-06-22.md. In-app reproducibility guide. */
window.METH = [

/* ───────────────────────── START HERE ───────────────────────── */
{id:'overview', group:'Start here', title:'What this is & how it fits together', body:`
<p>This app is a full digital model of the German power system for the year <b>2025</b>:
the physical grid (380 / 220 / 110&nbsp;kV), every generator and load, the hourly
electricity market, and the congestion management (<b>redispatch</b>) that keeps the grid
within limits. Everything is computed for all <b>8 760 hours</b> of the year.</p>
<h3>The journey, end to end</h3>
<p>The pages in <b>"The model (pipeline)"</b> below tell the whole story in order — this is
the part to read if you want to <i>reproduce</i> the work:</p>
<ol>
<li><b>Where the grid starts</b> — raw OpenStreetMap → eGon-data / osmTGmod: 14 494 buses,
26 489 lines, full of artifacts.</li>
<li><b>Cleaning the grid</b> — a 5-stage reduction pipeline that removes ~half the buses and
~60% of the lines while preserving the physics.</li>
<li><b>grid_alpha</b> — the canonical grid: MaStR generators allocated, voltage bugs fixed,
110&nbsp;kV parallel circuits merged.</li>
<li><b>Generators</b> and <b>Loads</b> — every plant and every kWh of demand placed on a bus.</li>
<li><b>The market (merit order)</b> — which plants run each hour, calibrated to the real 2025
market through a documented run-by-run process.</li>
<li><b>Power flow</b> — the resulting line flows, after fixing real grid-data errors.</li>
<li><b>Redispatch</b> — the N-0 + N-1 correction that clears every overload.</li>
</ol>
<p>The pages in <b>"App tabs"</b> then explain what each tab of the app shows and which stage
it draws from. Every page ends with the exact script and command.</p>
<p class="meth-note">Reference: <code>docs/methodology.md</code> (the master build doc) and
<code>docs/dispatchredispatch_power_flow_final_2026-06-22.md</code> (the simulation chain).
Environment: conda <code>egon2025</code> (Python 3.10, PyPSA, CBC/HiGHS), PostgreSQL +
PostGIS (<code>egon-data</code> DB), app on port 8765.</p>
`},

/* ───────────────────────── PIPELINE ───────────────────────── */
{id:'grid-start', group:'The model (pipeline)', title:'1 · Where the grid starts (OSM → eGon)', body:`
<p>The grid did not start as a clean dataset — it started as <b>OpenStreetMap</b>. The whole
topology is reconstructed from crowdsourced map data, so the first job is understanding what
came in and what's wrong with it.</p>
<h3>The source chain</h3>
<ol>
<li><b>OpenStreetMap</b> — every substation, tower, line and cable that mappers have traced
(~224&nbsp;GB of raw OSM for Germany).</li>
<li><b>osmTGmod</b> — a transmission-grid modelling tool that turns those OSM ways/nodes into
an electrical topology (buses, lines, transformers) with voltage levels.</li>
<li><b>eGon-data</b> — the open German energy-system pipeline that runs osmTGmod and stores
the result in PostgreSQL in the <b>eTraGo</b> (PyPSA) convention, schema <code>grid.egon_etrago_*</code>.</li>
</ol>
<h3>What the raw extraction looked like</h3>
<table><tr><td><b>Buses</b></td><td>14 494</td><td>110&nbsp;kV 78% · 220&nbsp;kV 9% · 380&nbsp;kV 13%</td></tr>
<tr><td><b>Lines</b></td><td>26 489</td><td>overhead + cable</td></tr>
<tr><td><b>Transformers</b></td><td>535</td><td>voltage interconnections</td></tr>
<tr><td><b>Substations</b></td><td>5 389</td><td>OSM-tagged nodes</td></tr></table>
<h3>Why it can't be used as-is — the artifacts</h3>
<p>OSM is crowdsourced, so the raw graph is electrically inflated:</p>
<ul>
<li><b>27.5% of lines are under 200&nbsp;m</b> — mostly modelling artifacts, not real circuits.</li>
<li><b>Multiple buses per physical substation</b> — urban areas drawn as clusters of nodes.</li>
<li><b>Pass-through nodes</b> — intermediate points along a corridor that add no branching.</li>
<li><b>Excessive parallel lines</b> — up to 8+ between the same bus pair.</li>
</ul>
<p class="meth-why"><b>Why this matters:</b> these artifacts don't add electrical information,
but they multiply the size of the power-flow problem <i>and</i> double-count capacity — which
later shows up as phantom congestion. So before anything physical can be trusted, the grid
has to be cleaned. That's the next page.</p>
<p class="meth-note">DB: <code>grid</code> schema (network), <code>mastr</code> (registry),
<code>boundaries</code> (municipalities/districts), <code>osmtgmod_results</code> (raw
topology). Docs: <code>docs/methodology.md</code> §3, <code>docs/database_import.md</code>.</p>
`},

{id:'grid-clean', group:'The model (pipeline)', title:'2 · Cleaning the grid (5-stage reduction)', body:`
<p>The cleaning is a <b>5-stage reduction pipeline</b>. Each stage targets one specific class
of OSM artifact. <b>Every stage preserves all 535 transformers, all 5 389 substation buses,
single-connected-component connectivity, and electrical equivalence</b> (impedances are
aggregated correctly, never just dropped).</p>
<table>
<tr><td><b>Stage</b></td><td><b>Method</b></td><td><b>Buses</b></td><td><b>Lines</b></td><td><b>Key param</b></td></tr>
<tr><td>V1 raw</td><td>—</td><td>14 494</td><td>26 489</td><td>—</td></tr>
<tr><td>V2</td><td>Conservative clustering</td><td>11 575</td><td>22 072</td><td>120&nbsp;m radius</td></tr>
<tr><td>V3</td><td>Voltage-specific clustering</td><td>9 234</td><td>16 700</td><td>1200&nbsp;m / 250&nbsp;m</td></tr>
<tr><td>V4</td><td>Degree-2 elimination</td><td>7 458</td><td>12 102</td><td>series merge</td></tr>
<tr><td>V5</td><td>Substation-proximity merge</td><td>7 316</td><td>11 728</td><td>300&nbsp;m</td></tr>
<tr><td>V6</td><td>Parallel-line capping</td><td>7 316</td><td>10 863</td><td>max 2 parallels</td></tr>
</table>
<p><b>Net: −49.5% buses, −59.0% lines</b>, no substation or transformer lost.</p>
<h3>Stage 1 — Conservative 120&nbsp;m clustering (V1→V2)</h3>
<p>Merge buses within <b>120&nbsp;m</b> of each other (PostGIS <code>ST_ClusterDBSCAN</code> in
EPSG:3035 for metre-accurate distance). These are almost always one physical place drawn as
several nodes. <b>Protection:</b> never merge two distinct substations or two transformer
buses; the substation bus is the keeper. Removed 2 919 buses; ultra-short (&lt;100&nbsp;m)
lines dropped 91.6% (2 456→207). Script <code>reduce_network.py</code>.</p>
<h3>Stage 2 — Voltage-specific clustering (V2→V3)</h3>
<p>Now cluster harder, with a radius matched to how sparse each level is: <b>380/220&nbsp;kV at
1200&nbsp;m, 110&nbsp;kV at 250&nbsp;m</b>. Keeper = highest-degree (most-connected) bus.
Removed another 2 341 buses. <span class="meth-why" style="display:inline;padding:2px 6px">Why
cascade V1→V2→V3 instead of jumping straight to 1200&nbsp;m? Applying the wide radius to the
dirty raw grid produced clusters full of protected buses that all had to be skipped. Cleaning
the sub-120&nbsp;m mess first makes V3 find clean, actionable clusters.</span> Script
<code>reduce_network_v3.py</code>.</p>
<h3>Stage 3 — Degree-2 elimination (V3→V4)</h3>
<p>A degree-2 bus connects exactly two lines in series — a pass-through point with no
switching role. Remove it by merging its two lines into one equivalent. Three steps:
(a) <b>parallel compression</b> per bus-pair (<code>r_eq=1/Σ(1/r)</code>, <code>x_eq=1/Σ(1/x)</code>,
<code>s_nom</code> adds); (b) <b>chain detection</b> of maximal degree-2 runs; (c) <b>series
merge</b> (<code>r,x,length</code> add; <code>s_nom=min</code> = bottleneck). Substation and
transformer buses are protected. Validation re-checks the component count and substation
reachability. ~1 776 buses, ~4 598 lines removed.</p>
<h3>Stage 4 — Substation-proximity merge (V4→V5)</h3>
<p>110&nbsp;kV non-substation buses within <b>300&nbsp;m</b> of a real substation are merged
into it (line entry nodes just outside the fence). 142 buses removed.
Script <code>reduce_network_v5.py</code>.</p>
<h3>Stage 5 — Parallel-line capping (V5→V6)</h3>
<p>Cap any bus pair at <b>2 parallel circuits</b> (real corridors are at most double-circuit;
more are merge artifacts). Keep the 2 highest-<code>s_nom</code>, drop the rest — 865 lines
removed, 0 buses. Script <code>reduce_network_v6.py</code>.</p>
<p class="meth-note">Every merge is logged to <code>reduction_info*.json</code> so it's auditable
and reversible. Full detail: <code>docs/network_reduction.md</code>, <code>docs/methodology.md</code> §4.</p>
`},

{id:'grid-alpha', group:'The model (pipeline)', title:'3 · grid_alpha (the canonical grid)', body:`
<p>The cleaned V6 topology is still just wires. Two more steps turn it into the canonical
scenario <b>grid_alpha</b> that every simulation reads: putting the generation fleet on it
(with the voltage bugs fixed), and merging the 110&nbsp;kV parallel circuits.</p>
<h3>grid_beta — fleet attached, voltage bugs fixed</h3>
<p>The MaStR fleet (see the <i>Generators</i> page) is allocated onto the buses, plus domestic
loads and BDEW profiles → <b>grid_beta</b>: 7 723 buses, 12 911 lines, 18 793 generators
(296.5&nbsp;GW), 2 444 storage, 12 154 domestic + 56 export loads. Two real <b>data bugs were
found and fixed here</b>:</p>
<ol>
<li><b>Generator voltage-allocation bug</b> — the build applied the Hülk capacity thresholds
(&gt;20&nbsp;MW→220&nbsp;kV, &gt;120&nbsp;MW→380&nbsp;kV) <i>unconditionally</i>, overriding the
real MaStR registered voltage. A 28&nbsp;MW MV wind farm got bumped to 220&nbsp;kV. Fix:
respect the MaStR SAN voltage when present, apply the threshold only as a fallback, and add a
sanity downgrade for obvious MaStR errors. 220 generator groups corrected (onshore wind on
110&nbsp;kV: 50.7→66.2&nbsp;GW).</li>
<li><b>Load voltage-allocation bug</b> — the municipality→bus spatial join grabbed <i>any</i>
bus inside the polygon regardless of voltage, so small residential loads landed on 220/380&nbsp;kV
buses where a town had no 110&nbsp;kV bus inside its border. Fix: strictly filter by target
voltage, KD-tree fallback to the nearest bus <i>at the correct voltage</i>, never spill upward.</li>
</ol>
<h3>grid_alpha — 110&nbsp;kV parallel circuits merged</h3>
<p>eGon represents each circuit of a parallel 110&nbsp;kV line as a separate row. Counting them
individually <b>double-counts capacity and manufactures phantom congestion</b>. grid_alpha
merges every 110&nbsp;kV bus-pair into one equivalent circuit — <b>EHV (≥220&nbsp;kV) left
completely untouched</b>:</p>
<table>
<tr><td></td><td><b>merge rule</b></td></tr>
<tr><td>cables, num_parallel</td><td><b>summed</b> (2×3 → 6 cables)</td></tr>
<tr><td>s_nom</td><td><b>summed</b> (260+260 → 520 MVA)</td></tr>
<tr><td>x, r</td><td><b>parallel</b> <code>1/Σ(1/z)</code> (identical pair → z/2)</td></tr>
<tr><td>b, g</td><td>summed</td></tr>
<tr><td>length, geometry</td><td>representative kept</td></tr>
</table>
<p>Result: <b>12 911 → 9 310 lines</b> (110&nbsp;kV 10 483→6 882; 3 125 groups merged). The
110&nbsp;kV Σ&nbsp;s_nom (3 469&nbsp;GVA) and Σ&nbsp;cables (39 825) are <b>identical before and
after</b> — physics preserved, only duplicate rows consolidated. Final grid_alpha: 380&nbsp;kV
1 456 · 220&nbsp;kV 972 · 110&nbsp;kV 6 882 lines, ≈7 700 buses, 567 transformers (incl. 19
PSTs), ~15 HVDC links.</p>
<p class="meth-why"><b>Why merge instead of just dropping copies?</b> Dropping a parallel
circuit throws away real capacity. Summing cables keeps the true corridor rating <i>and</i>
gives the correct (halved) impedance — so the power flow splits realistically.</p>
<p class="meth-note"><code>EGON_SCN</code> defaults to <code>grid_alpha</code>, so every script
reads it. A "dynamic 110&nbsp;kV sectioning" idea (open ties as a remedial action) was built
and tested but <b>underperformed the merge alone</b> and is OFF by default — see
<code>docs/grid_alpha_build_2026-06-13.md</code> §4 for the honest negative result.</p>
`},

{id:'generators', group:'The model (pipeline)', title:'4 · Generators (from MaStR)', body:`
<p>Every generator is a <b>real plant from the Marktstammdatenregister (MaStR)</b> — Germany's
legally-mandated registry of every generating unit, from a 3&nbsp;kW rooftop panel to a
1 400&nbsp;MW lignite block. The end result on grid_alpha is <b>18 798 generators</b>. This is
the exact procedure (<code>scripts/pipeline/build_grid_alpha.py</code>).</p>
<h3>Step 1 — pull units from MaStR, with their grid-connection voltage</h3>
<p>For each technology table the loader runs a 3-table SQL join to recover the <i>registered
connection voltage</i> — this is the join chain, the single most important part of the
allocation:</p>
<pre class="meth-pre">FROM mastr.{tech}_extended w                       -- the unit (capacity, lat/lon, AGS)
LEFT JOIN mastr.locations_extended  l              -- via w.LokationMastrNummer
       ON w."LokationMastrNummer" = l."MastrNummer"
LEFT JOIN mastr.grid_connections    gc             -- via the FIRST connection point
       ON gc."NetzanschlusspunktMastrNummer"
        = SPLIT_PART(l."Netzanschlusspunkte", ', ', 1)
WHERE  w."EinheitBetriebsstatus" = 'In Betrieb'    -- operational only
  AND  w."Nettonennleistung" > 0</pre>
<p>So each unit carries <code>Nettonennleistung</code>/1000 (→MW), <code>Breitengrad/Laengengrad</code>
(lat/lon), <code>Gemeindeschluessel</code> (AGS municipality key), and
<code>gc."Spannungsebene"</code> (the connection voltage band). The MaStR DB is 31 tables /
36.4&nbsp;M records (solar 5.85&nbsp;M, wind 41 765, combustion 92 837, storage 2.32&nbsp;M).</p>
<h3>Step 2 — group by location (SEL) and classify the carrier</h3>
<p>Units are grouped by <b>SEL = <code>LokationMastrNummer</code></b> (the physical site): sum
capacity, average coordinates, majority-vote the carrier. Fuel strings map to PyPSA carriers
via explicit dictionaries (e.g. <code>Rohbraunkohlen/Braunkohle→lignite</code>,
<code>Erdgas/Grubengas/Hochofengas→gas</code>, <code>Laufwasseranlage→run_of_river</code>,
<code>Speicherwasseranlage→reservoir</code>).</p>
<h3>Step 3 — assign the voltage level (the bug that was fixed here)</h3>
<p>The <code>Spannungsebene</code> string maps to a voltage: <code>Höchstspannung→380</code>,
<code>Umspannebene Höchstspannung/Hochspannung→220</code>, everything Hochspannung and below
<code>→110</code>. <b>The capacity thresholds (Hülk et&nbsp;al. 2017: &gt;120&nbsp;MW→380,
&gt;20&nbsp;MW→220) are applied ONLY to SEL groups with no registered voltage</b>
(<code>has_san_voltage = False</code>) — the original build applied them unconditionally and
bumped real MV plants up a level. A <b>sanity downgrade</b> then catches obvious MaStR errors
(a group tagged 220/380&nbsp;kV but below the Hülk threshold — e.g. 0.1&nbsp;MW solar at
"220&nbsp;kV" — is pushed back down).</p>
<h3>Step 4 — place each site on a bus (the KD-tree matcher)</h3>
<p>A <code>SpatialMatcher</code> builds <b>one <code>scipy.cKDTree</code> per voltage level</b>,
on coordinates pre-scaled to kilometres (<code>lon×71.5, lat×111&nbsp;km/°</code> so Euclidean
distance ≈ real distance). For each SEL group it queries the tree <i>at the group's target
voltage</i> and accepts the nearest bus within the radius: <b>380→50&nbsp;km, 220→30&nbsp;km,
110→20&nbsp;km</b>. If nothing is in range it falls back to <code>find_nearest_any_voltage</code>
(search ≤100&nbsp;km, prefer the target voltage, else nearest — preferring higher voltages on a
tie). Each match gets a 0–1 confidence score (0.60 direct, down to 0.30 municipality).</p>
<h3>Step 5 — distributed units with no coordinates (rooftop PV etc.)</h3>
<p>Most rooftop PV has no usable lat/lon, so it is handled by <b>municipality aggregation</b>:
sum capacity per (AGS, carrier), then <b>spread it evenly across <i>all</i> the 110&nbsp;kV
buses that fall inside that municipality's polygon</b> — if a town has N buses, each gets
1/N of the capacity (not all dumped on one node). If the polygon contains no bus, fall back to
the nearest bus to the centroid (<code>ST_Centroid(ST_Union(geom))</code> from
<code>boundaries.vg250_gem</code>). Solar is split: HV+ (≥ Hochspannung) goes through the SEL
path; MV/LV goes through this municipality path.</p>
<h3>Step 6 — aggregate per bus+carrier and insert</h3>
<p>All units of one technology on one bus collapse to a single PyPSA generator (summed
capacity), written to <code>grid.egon_etrago_generator</code> with PyPSA columns
(<code>control='PQ'</code>, <code>p_min_pu=0</code>, <code>p_max_pu=1</code>). Final fleet
≈ <b>270&nbsp;GW</b>: solar 104.6 · onshore wind 68.2 · gas 33.9 · coal 14.2 · lignite 14.0 ·
offshore wind 9.5 · biogas 7.1 · oil 5.3 · run-of-river 4.2 · the rest.</p>
<p class="meth-why"><b>Why a per-voltage KD-tree + SEL grouping?</b> A plant must connect at its
real voltage, so matching has to be voltage-constrained — a 380&nbsp;kV unit can't snap to a
nearby 110&nbsp;kV bus. Grouping by SEL first means one physical site becomes one match, not
dozens of duplicate units fighting over buses.</p>
<p class="meth-note">Script <code>scripts/pipeline/build_grid_alpha.py</code>
(<code>sel_based_allocation</code>, <code>spatial_match_sel_groups</code>,
<code>municipality_aggregation</code>) + <code>scripts/utils/spatial_matching.py</code>; docs
<code>docs/mastr_*.md</code>, <code>docs/methodology.md</code> §5. Every bus is also given a human
name (<code>name_buses.py</code>, all 7 723 named).</p>
`},

{id:'loads', group:'The model (pipeline)', title:'5 · Loads (demand, how & why)', body:`
<p>Germany's <b>448&nbsp;TWh/yr</b> of demand has to be split across 11 135 municipalities, by
sector, assigned to voltage levels, and placed on buses — plus the cross-border exports the
generation must also serve.</p>
<h3>Step 1 — national totals by sector</h3>
<p>From BDEW/BNetzA 2025: <b>Households 134&nbsp;TWh (30%) · CTS 124&nbsp;TWh (28%) · Industry
190&nbsp;TWh (42%)</b>.</p>
<h3>Step 2 — disaggregate to municipalities</h3>
<ol>
<li><b>NUTS-3 allocation:</b> household demand from <b>DemandRegio</b> (FFE Munich, 2015
baseline scaled ×1.015 to the 134&nbsp;TWh 2025 target); CTS and industry spread across the
401 NUTS-3 regions <b>proportional to population</b>.</li>
<li><b>Municipality split:</b> within each NUTS-3 region, demand is distributed to
municipalities <b>proportional to land area</b>.</li>
<li><b>NUTS remapping:</b> two codes had to be hand-mapped between the 2016 DemandRegio and
2021 DB classifications (DEB1C→DEB16, DEB1D→DEB19).</li>
</ol>
<p>Output: <code>demand_by_municipality_2025.csv</code> (11 135 rows).</p>
<h3>Step 3 — sector → voltage, and the peak factor</h3>
<p>Each municipality makes up to two load points:</p>
<ul>
<li><b>Residential + CTS → always 110&nbsp;kV</b> (low/medium-voltage consumers aggregate up).</li>
<li><b>Industry → voltage by peak demand.</b> Peak is estimated from annual energy with a
<b>peak factor 1.49</b> (= Germany's 76&nbsp;GW system peak ÷ 51.1&nbsp;GW average load):
<code>peak_MW = annual_MWh/8760 × 1.49</code>, then the Hülk thresholds (&gt;120→380, &gt;20→220,
else 110).</li>
</ul>
<h3>Step 4 — split each municipality across its buses (degree-weighted)</h3>
<p>This is the part that makes the load realistic. A spatial join (<code>ST_Contains</code>)
finds every bus <i>inside</i> each municipality polygon at the target voltage. The demand is
then split across them <b>weighted by each bus's connectivity (degree = number of lines), with
an exponent that depends on whether it's a city or a rural municipality</b>:</p>
<pre class="meth-pre">weight(bus) = degree(bus) ** alpha
  alpha = 1.5   if Stadt   (concentrate load at the big substations)
  alpha = 0.7   if Gemeinde (spread more evenly across the rural grid)
frac(bus) = weight(bus) / sum(weights)</pre>
<p>If a municipality has <b>no</b> bus at the target voltage inside its polygon, it falls back
to the nearest bus by KD-tree (<code>_fallback_nearest</code>: try the target voltage first,
then prefer <i>lower</i> voltages so small loads don't spill onto the EHV grid). Multiple
points on one bus are summed → <b>7 246 loads, 76.2&nbsp;GW peak, 448&nbsp;TWh</b> (110&nbsp;kV
carries 84.9%; on grid_alpha there are 12 210 load rows after the export loads and storage
splits).</p>
<h3>Step 5 — hourly shape (BDEW standard load profiles)</h3>
<p>Each load is given an 8 760-hour shape by carrier, built analytically to match the BDEW
standard load profiles (each normalised to sum to 1):</p>
<ul>
<li><b>H0 household</b> — ±20% seasonal (winter high), a morning bump (~7:30) + a strong
evening peak (~18:30), Saturday 90% / Sunday 80%.</li>
<li><b>G0 commerce/services</b> — mild ±8% seasonal, business-hours peak (~13:00), Saturday
70% / Sunday 50%.</li>
<li><b>Industry</b> — nearly flat (±3% seasonal, 3-shift), weekend 75–85%.</li>
</ul>
<p>The national curve is then rescaled to the real <b>SMARD 2025</b> load (465.8&nbsp;TWh) so
the aggregate shape is exact even though the per-bus split is modelled.</p>
<h3>Why exports are separate</h3>
<p>The 56 nodal <b>export loads</b> (31.5&nbsp;GW) carry the market's cross-border schedule.
Germany exports ~50–60&nbsp;TWh/yr; without them the model would under-generate and the
flows would be wrong. Keeping them separate also means the redispatch can distinguish
domestic load from transit.</p>
<p class="meth-why"><b>Why area/population proxies?</b> There's no public per-municipality
metered demand. Population (for CTS/industry) and land area (within-region split) are the
standard first-order proxies; the known weakness is industry, which really concentrates at a
few large sites — flagged as the main load caveat.</p>
<p class="meth-note">Script <code>scripts/pipeline/build_grid_beta.py</code>
(<code>build_load_entries</code>, <code>estimate_peak</code>, <code>generate_bdew_profiles</code>);
validated to the 448&nbsp;TWh total and the 76&nbsp;GW peak. Docs <code>docs/load_mapping.md</code>,
<code>docs/methodology.md</code> §6. The <b>Grid → Load</b> tab renders this per district.</p>
`},

{id:'merit', group:'The model (pipeline)', title:'6 · Merit order (how it was made right)', body:`
<p>For each hour, <i>which</i> plants run? A <b>rolling-horizon MILP unit-commitment</b>
(48-hour windows, 24-hour stride) clears the market on cost — cheapest plants first — subject
to power balance, unit commitment, ramping, storage, and trade limits. This is a
<b>copperplate</b> clear (no grid yet), exactly like the real day-ahead market. Getting it to
match reality took a documented, iterative calibration.</p>
<h3>Where it starts — the short-run marginal cost (SRMC)</h3>
<p>Every thermal plant gets a €/MWh bid:</p>
<pre class="meth-pre">SRMC = fuel_price/η  +  CO2_factor × CO2_price/η  +  variable_O&M  −  heat_credit</pre>
<p>with concrete 2025 inputs (<code>build_merit_order.py</code>): fuel gas 40, coal 13.6,
lignite 5.0, oil 35&nbsp;€/MWh<sub>th</sub>; CO₂ 75&nbsp;€/t; CO₂ factors lignite 0.399, coal
0.338, gas 0.201&nbsp;t/MWh<sub>th</sub>; fleet-average η lignite 0.36, coal 0.40, CCGT 0.58,
gas-CHP 0.42. So e.g. lignite ≈ 5/0.36 + 0.399·75/0.36 ≈ <b>97&nbsp;€/MWh</b>, gas-CCGT ≈
40/0.58 + 0.201·75/0.58 ≈ <b>95&nbsp;€/MWh</b> — they sit right next to each other, which is why
the next step matters.</p>
<h3>Spreading plants within a fuel — COD efficiency ranking</h3>
<p>One η per fuel would make every lignite plant bid identically (a flat merit order).
Instead each plant's η is set from its <b>commissioning year (COD)</b> from MaStR: the MaStR
fleet is sorted newest-first, each grid generator is mapped to a fleet percentile by capacity
rank, that percentile gives a COD year, and the year maps to efficiency
<code>η = η_min + (η_max−η_min)·year_frac^0.8</code> (1960→η_min, 2025→η_max). Newer plants are
more efficient → bid lower → run first, exactly like the real fleet. (Falls back to a
capacity-rank proxy when COD is missing.)</p>
<h3>Imports/exports, storage, CHP must-run</h3>
<p>Imports/exports are priced at the <b>hourly neighbour-zone day-ahead price</b> (11 bidding
zones). Pumped storage/batteries arbitrage inside the MILP (η<sub>1-way</sub>=√η<sub>RT</sub>,
SOC carried between windows). Heat-driven CHP is partly <b>must-run</b>: a seasonal
<code>p_min_pu</code> profile (winter ~0.60, summer ~0.12) × a <code>MUST_RUN_SCALE</code>
(0.42 in the SMARD run) generates regardless of price, the rest bids economically.</p>
<h3>The calibration journey (this is the "getting it right")</h3>
<p>Price correlation against the real SMARD spot, run by run:</p>
<table>
<tr><td><b>Phase</b></td><td><b>What changed</b></td><td><b>Pearson r</b></td></tr>
<tr><td>1–3</td><td>simple merit order → heuristic UC</td><td>0.30 → 0.45 → 0.32</td></tr>
<tr><td>4 (MILP v1)</td><td>48h rolling MILP, static prices, flat 35% markup</td><td>0.459</td></tr>
<tr><td>5 (v2)</td><td>market coupling (below)</td><td><b>0.674</b></td></tr>
<tr><td>7 (final)</td><td>SMARD-calibrated RES adoption</td><td><b>0.908</b></td></tr>
</table>
<p>The big jump (v1→v2) came from five concrete changes:</p>
<ol>
<li><b>Hourly neighbour prices</b> for all 11 bidding zones (Energy-Charts) — alone worth
~0.15 of the correlation gain; it transmits the demand signal like real market coupling.</li>
<li><b>Per-border NTC caps</b> from the 99th percentile of observed physical flows (replaces a
flat 8&nbsp;GW aggregate).</li>
<li><b>Monthly fuel & CO₂ prices</b> (TTF 33–48, coal 12–15&nbsp;€/MWhth, CO₂ 69–79&nbsp;€/t).</li>
<li><b>COD-based efficiency ranking</b> from MaStR (5 289 units).</li>
<li><b>Dynamic scarcity markup</b> keyed to residual-load percentile (5% in RES surplus →
60% at p95) — for <i>display</i> price only, never the dispatch decision.</li>
</ol>
<h3>Two data traps that had to be caught</h3>
<ul>
<li><b>SMARD filter-ID bug:</b> filter 1223 ("nuclear") actually returns lignite (Germany has
zero nuclear since 2023); 4075 ("oil") is a constant 15.5&nbsp;GW that matches nothing. So
generation benchmarks come from <b>Energy-Charts</b>, SMARD only for price and load.</li>
<li><b>Behind-the-meter (BTM):</b> public benchmarks only count grid-fed metered generation,
but the model balances <i>total</i> demand. So per-fuel BTM corrections (rooftop self-use,
industrial CHP) are added to the <i>benchmark</i> side, each sourced from BDEW/Fraunhofer/AGEB.</li>
</ul>
<h3>The final step — pinning RES to SMARD hour-by-hour</h3>
<p>The model's weather year is not 2025, so its raw solar/wind shapes are off. The
<code>--smard</code> run <b>calibrates RES feed-in to the measured SMARD series</b>:</p>
<ul>
<li><b>Solar / onshore / offshore wind — hourly.</b> For each hour, scale every unit of that
fuel by one national factor = <code>SMARD_feed-in / model_potential</code>, but clip each unit
at its rated power (<code>p_max_pu ≤ 1</code>). Because clipping loses energy on hours the
model was calm but 2025 was windy, the factor is <b>iterated 4 times</b> with re-clipping, so
the fleet sum lands on SMARD while staying physical. This fixes both the annual level <i>and</i>
the hour-to-hour shape (it's why wind correlation hits 0.998).</li>
<li><b>Biomass / hydro — monthly.</b> A per-month factor = <code>SMARD/model</code>, clamped to
[0.2, 2.0] (slow fuels don't need hourly detail).</li>
</ul>
<h3>Final quality (run 7)</h3>
<p>Wind hourly correlation <b>0.998</b>, solar 73.8&nbsp;TWh (−5% vs SMARD), price correlation
<b>0.908</b>, gas +2%, coal +1%, ~300–800 negative-price hours/yr. Output
<code>results/dispatch_8760h_smard.nc</code> — nodal dispatch, no line flows yet.</p>
<p class="meth-why"><b>Why copperplate?</b> The real day-ahead market also ignores the internal
grid and clears on price; grid limits are handled afterwards by redispatch — exactly the split
this model uses. The honest residual (r&nbsp;0.91 not 1.0) is no network constraints, monthly
(not intraday) fuel prices, and 48h look-ahead.</p>
<p class="meth-note">Scripts <code>run_unconstrained_8760h.py --smard</code>,
<code>merit_order_comparison.py</code>; docs <code>docs/merit_order_methodology.md</code> (the
reusable recipe) + <code>docs/merit_order_analysis.md</code> (the run-by-run numbers). The
<b>Market</b> tabs visualise this against SMARD.</p>
`},

{id:'powerflow', group:'The model (pipeline)', title:'7 · Power flow + grid fixes', body:`
<p>Given the dispatch, how does power flow on each line? A <b>DC load-flow</b> answers it — but
first several real grid-data errors are fixed, or the flows aren't physical.</p>
<h3>Method — <code>run_dcpf_8760h.py</code></h3>
<ol>
<li>Per-bus net injection = generation − load, with each <b>HVDC link's far-end schedule
(offshore wind, imports) routed to its onshore bus0</b> so it appears in the AC flow.</li>
<li>Line flows = <b>PTDF · injection</b> on the main AC subnetwork (DC approximation:
lossless, flow splits by 1/reactance).</li>
</ol>
<h3>The grid-data fixes (applied before the PTDF)</h3>
<ol>
<li><b>Gen/storage-voltage rule</b> (<code>APPLY_GEN_VOLTAGE_FIX=1</code>) — any gen/storage
&gt;150&nbsp;MW still on 110&nbsp;kV is moved to the nearest EHV bus; <b>capacity-aware</b>
(lands only where the connected lines can evacuate it; &gt;600&nbsp;MW forced to 380&nbsp;kV).
Wind/solar stay on 110&nbsp;kV.</li>
<li><b>Reactance fix</b> (<code>APPLY_REACTANCE_FIX=1</code>) — eGon's 110&nbsp;kV reactances
were 2–4× too low (median 0.19 vs physical 0.38&nbsp;Ω/km), which let 110&nbsp;kV steal bulk
EHV transit. Raised to <code>x ≥ length·x_per_km/num_parallel</code>.</li>
<li><b>Corridor reinforcement</b> (<code>REINFORCE_LINES_JSON</code>) — the 9 chronically
single-circuit Berlin/Brandenburg (Uckermark) lines + line 33077 upgraded to 2 circuits (the
real Uckermarkleitung). 110&nbsp;kV overload-hours 68k→12k.</li>
</ol>
<p class="meth-note">Output <code>results/dispatch_8760h_pf_smard_reinf.nc</code>. Each fix is a
real eGon error found during this work — the full audit is on the next page. Sectioning
(opening lines) was tried and <b>proven useless</b>: transit just reroutes onto the next
parallel 110&nbsp;kV line. Reinforcement adds capacity that actually absorbs it.</p>
`},

{id:'redispatch-engine', group:'The model (pipeline)', title:'8 · Redispatch (N-0 + N-1) + the audit', body:`
<p>The day-ahead dispatch overloads lines the market never saw. <b>Redispatch</b> is the
operator's least-cost correction: curtail behind a bottleneck, ramp up in front, until no line
is over its rating — under normal operation (<b>N-0</b>) <i>and</i> the outage of any single
critical EHV element (<b>N-1</b>).</p>
<h3>Engine — <code>solve_snapshot_fixpoint</code></h3>
<p>One single-solve LP per hour by <b>lazy constraint generation</b> (warm-started in-process
HiGHS): it adds only the line constraints actually violated and re-solves until none remain (a
<i>fixpoint</i>). At the fixpoint <b>post-redispatch can never be worse than pre</b> — doing
nothing (Δp=0) is always feasible.</p>
<h3>What happens each of the 8 760 hours</h3>
<ol>
<li><b>Energy-balance closure</b> (<code>rebalance_dispatch</code>) — the copperplate balances
to national demand, but the nodal grid carries its own egon load + ~60&nbsp;TWh exports, so
Σgen≠Σload by GW/h. A distributed-slack closure spreads the residual over dispatchable units ∝
head-room (RES never pushed past weather), propagated into the line flows with the same PTDF.</li>
<li><b>Offshore-landing fix</b> — relocate the 12 islanded North-Sea farms onto their onshore
converter bus so their curtailment is a priced, attributed action (not a free link reroute).</li>
<li><b>N-0</b> — monitor all lines (<code>REDISPATCH_MIN_VNOM=0</code>).</li>
<li><b>N-1</b> — EHV-only contingencies (110&nbsp;kV is N-1-secure by design, VDE-AR-N 4121),
EHV lines loaded above <code>REDISPATCH_N1_THRESH=0.30</code> (a curated-CNEC proxy), lazy LODF
post-contingency rows.</li>
<li><b>Levers & cost</b> — generation up/down at marginal cost × <b>§13a Mindestfaktor</b>
(curtail conventional ≈10× before RES; solar eased to 5×); <b>countertrade</b> (import
reduction on all 11 borders at €40/MWh — a real BNetzA measure, not a last resort); HVDC + PSTs.</li>
</ol>
<h3>The audit — 6 real eGon bugs found & fixed</h3>
<p>None artificial; each verified to change the physics:</p>
<ol>
<li><b>PSPs on 110&nbsp;kV</b> — gen-voltage rule never applied to grid_alpha; 1 538&nbsp;MW
Allgäu pumped-hydro on 110&nbsp;kV (line 25296 at 14.7×). Relocated to EHV.</li>
<li><b>Relocation target too weak</b> — big units sent to a 220&nbsp;kV pocket that couldn't
evacuate them. Made capacity-aware (&gt;600&nbsp;MW→380&nbsp;kV).</li>
<li><b>Offshore HVDC mis-attribution</b> — offshore curtailment hidden in "free" link reroutes.
Fixed by the onshore-landing relocation.</li>
<li><b>No countertrade</b> — import reduction priced at €1000 (last resort). Enabled at market
spread on all borders.</li>
<li><b>110&nbsp;kV reactances 2–4× too low</b> — corrected to physical Ω/km.</li>
<li><b>Under-built corridors</b> — single 110&nbsp;kV circuits carrying corridor transit
(Uckermark). Reinforced to 2 circuits.</li>
</ol>
<h3>Result (full year)</h3>
<p><b>100% of N-0 and N-1 overloads cleared</b> (8 757/8 760 h fully clean, post&gt;pre = 0).
Feed-in reduction 9.75&nbsp;TWh (BNetzA-2025 transmission-reachable ≈12.8). Line-hours over
rating 30 877 → 1 167 (96% cleared). The 2.7&nbsp;TWh PV gap is <b>structural, not a price</b>:
distribution PV has ≈0 PTDF to the congested EHV lines, so curtailing it relieves nothing —
that Einspeisemanagement happens at MV/LV detail a transmission model aggregates away.</p>
<p class="meth-note">Engine <code>scripts/simulation/_redispatch_core.py</code>; fixes
<code>_gen_voltage_fix.py</code>; driver <code>build_app_sample.py</code> →
<code>results/app_year_wholegrid.npz</code>. Full record:
<code>docs/dispatchredispatch_power_flow_final_2026-06-22.md</code>.</p>
`},

{id:'redispatch-validation', group:'The model (pipeline)', title:'8b · Reality upgrade & validation (2026-07-02)', body:`
<p>The canonical run the app now serves (<code>results/app_year.npz</code>) adds three
reality upgrades on top of chapter 8, and is validated against the official
per-measure records.</p>
<h3>What changed</h3>
<ul>
<li><b>Real 2025 weather geography</b> — RES dispatch is re-allocated spatially per hour with the
ERA5-2025 zonal capacity factors (national SMARD totals preserved exactly). 27.5% of onshore-wind
energy moved; the congestion geography is now the real one (<code>apply_regional_weather.py</code>).</li>
<li><b>Real offshore corridors</b> — the North-Sea evacuation is the actual 2025 HVDC corridor set
(BorWin1/2 → Diele, BorWin3+DolWin6 → Emden/Ost, DolWin1/2/3 → Dörpen/West, SylWin1+HelWin1/2 →
Büttel), each with its real MW rating (<code>split_offshore_corridors.py</code>).</li>
<li><b>The honest comparison target</b> — the netztransparenz TSO measures filtered to
cause = <i>strombedingt</i> (congestion): down 8.50 TWh / up 8.00 TWh in 2025. Countertrade,
voltage-cause and test runs are separate categories; DSO Einspeisemanagement (110 kV) is reported
as its own layer, never against the TSO target.</li>
</ul>
<h3>Validation (full year, 8 760 h)</h3>
<table><thead><tr><th>check</th><th>result</th></tr></thead><tbody>
<tr><td>TSO-scope feed-in reduction</td><td>8.22 vs 8.50 TWh official — <b>0.97×</b></td></tr>
<tr><td>whole-system feed-in reduction</td><td>14.83 vs 15.55 TWh (BNetzA 2025) — <b>0.95×</b></td></tr>
<tr><td>conventional down / countertrade</td><td>1.06× / 1.09×</td></tr>
<tr><td>daily timing vs official measures</td><td><b>r = 0.68</b> (353 days); monthly per-tech r 0.66–0.92</td></tr>
<tr><td>location</td><td>99.5% of official curtailed energy lies within 0.5° of a model curtailment site</td></tr>
<tr><td>congested lines</td><td>model's top corridors match BNetzA's published overloaded elements by name:
Dörpen–Niederlangen–Meppen (BNetzA #1), Diele–Rhede–Dörpen, Landesbergen–Wechold–Sottrum,
Dollern–Sottrum, Wilster/SH corridor</td></tr>
<tr><td>guards</td><td>post &gt; pre = 0/8 760; residual overloads in 28 h (0.32%), concentrated in 3
deterministic hard hours</td></tr>
</tbody></table>
<p class="meth-note">Known remaining gaps: offshore curtailment 1.6× (corridor outages not modelled),
conventional up 1.6× (the model balances DSO curtailment 1:1; reality settles it via balancing groups).
Scripts: <code>compare_vs_official.py</code>, <code>validate_vs_official.py</code>. Full record:
<code>docs/session_2026-07-01_reality_gap_implementation.md</code>.</p>
`},

{id:'data-sources', group:'The model (pipeline)', title:'9 · Data sources & the database', body:`
<p>Everything above is grounded in real data. Here is the complete inventory — the PostgreSQL
database and every external dataset.</p>
<h3>The PostgreSQL database (<code>egon-data</code>, ~234&nbsp;GB)</h3>
<table>
<tr><td><b>Schema</b></td><td><b>What's in it</b></td></tr>
<tr><td><code>grid</code></td><td>the network — <code>egon_etrago_bus / line / transformer /
link / generator / load</code> + their timeseries, per scenario (<code>grid_alpha</code>,
<code>grid_beta</code>, eGon2025v1–v6). Also the official-redispatch tables.</td></tr>
<tr><td><code>mastr</code></td><td>the power-plant registry — 31 tables, 36.4&nbsp;M records
(solar/wind/combustion/hydro/biomass/storage <code>_extended</code>, <code>locations_extended</code>,
<code>grid_connections</code>).</td></tr>
<tr><td><code>boundaries</code></td><td>geographies — <code>vg250_gem</code> (11 135
municipalities), <code>vg250_krs</code> (districts), NUTS regions.</td></tr>
<tr><td><code>osmtgmod_results</code></td><td>the raw OSM topology modelling output (bus_data
etc.) the reduction reads.</td></tr>
</table>
<p><b>grid_alpha today (live counts):</b> 7 724 buses · 9 310 lines · 18 798 generators ·
12 210 loads · 567 transformers · ~15 HVDC links.</p>
<h3>External datasets</h3>
<table>
<tr><td><b>Dataset</b></td><td><b>Source</b></td><td><b>Used for</b></td></tr>
<tr><td>OSM transmission grid</td><td>OpenStreetMap → osmTGmod → eGon-data</td><td>topology</td></tr>
<tr><td>MaStR</td><td>Bundesnetzagentur registry (bulk export)</td><td>every generator + storage</td></tr>
<tr><td>DemandRegio</td><td>FFE Munich</td><td>household demand by NUTS-3</td></tr>
<tr><td>BDEW / BNetzA</td><td>national statistics</td><td>sector demand totals + SLP shapes</td></tr>
<tr><td>SMARD</td><td>Bundesnetzagentur</td><td>2025 load, prices, RES feed-in (calibration)</td></tr>
<tr><td>Energy-Charts</td><td>Fraunhofer ISE</td><td>generation-by-fuel, neighbour prices, cross-border flows</td></tr>
<tr><td>Fuel / CO₂</td><td>TTF, API2, EU&nbsp;ETS</td><td>monthly merit-order prices</td></tr>
<tr><td>netztransparenz</td><td>the four TSOs</td><td>official 2025 redispatch measures</td></tr>
<tr><td>ERA5</td><td>Copernicus reanalysis</td><td>143-zone weather CFs (BESS/FCA)</td></tr>
<tr><td>NEP 2025 / §14d</td><td>TSO + DSO plans</td><td>investment-plan tab</td></tr>
</table>
<p class="meth-note">Connection: <code>postgresql://egon:data@127.0.0.1:5432/egon-data</code>.
Import/analysis docs: <code>docs/database_import.md</code>, <code>docs/egon_database_analysis.md</code>,
<code>docs/mastr_postgresql_import.md</code>, <code>docs/mastr_database_linkages.md</code>.</p>
`},

/* ───────────────────────── APP TABS ───────────────────────── */
{id:'tab-overview', group:'App tabs', title:'Overview', body:`
<p>The landing tab: the headline story and the year's key numbers (total redispatch volume,
hours with congestion, line-hours cleared) from <code>/api/sample/summary</code> over the
full-year result. The scroll-story illustrates the core mechanism — northern wind overloads a
north–south corridor and is curtailed, southern gas ramps up.</p>
<p class="meth-note">Component <code>Home</code>; data <code>app_sample.annual_summary()</code>.</p>
`},

{id:'tab-network', group:'App tabs', title:'Grid → Network', body:`
<p>The physical grid map: every line by voltage (380/220/110&nbsp;kV), transformers, HVDC links,
clickable buses. This is the <b>grid_alpha</b> topology from pipeline steps 1–3.</p>
<ul>
<li>Topology from <code>/api/sample/grid_topology</code> (bus coords + lines from Postgres, cached).</li>
<li>Bus detail: <code>/api/sample/bus_info</code>, <code>bus_plants</code>, <code>node</code> —
the MaStR units placed on that bus.</li>
</ul>
<p class="meth-why">This is the canvas everything else draws on — the real cleaned, merged grid
the power flow and redispatch run on.</p>
`},

{id:'tab-generation', group:'App tabs', title:'Grid → Generation', body:`
<p>Installed capacity per bus by dominant technology (the MaStR fleet, pipeline step 4), plus
the hourly market dispatch (step 6) — scrub time to watch generation change through the year.</p>
<ul>
<li>Static capacity: <code>/api/sample/gen_nodes</code>.</li>
<li>Hourly generation: <code>/api/sample/state?i=H</code> (the day-ahead dispatch per bus).</li>
</ul>
<p>The time control is month-chips + day-picker + a 24-hour slider (a slider only makes sense at
day scale, not 8 760 h); per-hour data is memory-mapped from <code>.npy</code> sidecars for fast
scrubbing.</p>
`},

{id:'tab-load', group:'App tabs', title:'Grid → Load', body:`
<p>Demand per district (Landkreis) as a choropleth + per-bus load circles, for any hour — the
448&nbsp;TWh disaggregation from pipeline step 5.</p>
<ul>
<li><code>/api/sample/load_kreis?i=H</code> + <code>kreise</code> geojson (eGon load joined to
vg250 districts).</li>
</ul>
`},

{id:'tab-muni', group:'App tabs', title:'Grid → Municipalities', body:`
<p>A per-municipality (AGS) choropleth of renewable capacity and load — the finest spatial view,
built from the same MaStR units (step 4) aggregated to municipality keys.</p>
<p class="meth-note">Endpoint <code>/api/sample/municipalities</code>.</p>
`},

{id:'tab-invest', group:'App tabs', title:'Grid → Investment plan', body:`
<p>Upcoming reinforcements — new lines/substations for <b>2028 / 2031 / 2034</b> from the
<b>NEP 2025</b> (Netzentwicklungsplan) + §14d DSO plans, with commitment tiers.</p>
<p class="meth-note">Endpoint <code>/api/investments</code>; data <code>data/grid_investments/</code>;
methodology <code>docs/grid_investments_methodology.md</code>.</p>
<p class="meth-why">The redispatch shows where the grid is congested today; this shows whether a
fix is already planned there (e.g. the Uckermarkleitung that the model reinforced by hand).</p>
`},

{id:'tab-territories', group:'App tabs', title:'Grid → Territories', body:`
<p>The service territories of the grid operators (TSO control zones, DSO areas) — who is
responsible for which part of the grid.</p>
<p class="meth-note">Endpoint <code>/api/territories</code>.</p>
<p class="meth-why">Redispatch is a TSO↔DSO process; the territories show whose grid a given
bottleneck sits in.</p>
`},

{id:'tab-scenarios', group:'App tabs', title:'Grid → Regional scenarios', body:`
<p>Regional build-out scenarios (e.g. a 2027 outlook) — how generation and load shift by region
under different futures.</p>
<p class="meth-note">Endpoint <code>/api/territories/scenarios</code>;
<code>docs/scenario_2027_methodology.md</code>.</p>
`},

{id:'tab-thishour', group:'App tabs', title:'Redispatch → This hour', body:`
<p>The core view: for any hour, line loadings <b>before</b> redispatch (the market's flows) and
<b>after</b> (post-correction), with the curtailed and ramped-up plants. Overloaded lines (red)
turn green when the redispatch is applied — this is the visual face of pipeline step 8.</p>
<ul>
<li><code>/api/sample/state?i=H</code> returns per-bus gen/load/curtailment and per-line flows
da/post from <code>app_year.npz</code> (the whole-grid redispatch result).</li>
<li>The N-0 / N-1 toggle switches between the base-case and N-1-secured runs.</li>
</ul>
`},

{id:'tab-congestion', group:'App tabs', title:'Redispatch → Congestion · year', body:`
<p>Annual congestion: each line coloured by how many hours/year it is over rating, before vs
after redispatch; the table ranks the worst lines (30 877 → 1 167 line-hours, 96% cleared).</p>
<ul><li><code>/api/sample/overload_hours</code> — per-line overload-hours (da & post).</li></ul>
<p class="meth-why">This is where the 110&nbsp;kV audit (step 8) is visible: the persistently-red
lines were the eGon bugs — large PSPs on 110&nbsp;kV, reactances too low, under-built corridors —
each fixed in the power-flow stage. Sectioning was tried and rejected; reinforcement worked.</p>
`},

{id:'tab-official', group:'App tabs', title:'Redispatch → Official data', body:`
<p>The real, published 2025 redispatch beside the model — the honesty check.</p>
<h3>Sources</h3>
<ul>
<li><b>TSO measures</b> — all four TSOs via <b>netztransparenz</b> (fetched without an account
by replaying the ASP.NET postback). 2025: 19 369 measures, 20.5&nbsp;TWh.</li>
<li><b>DSO measures</b> — EWE&nbsp;NETZ + Avacon JSON API. Stored in
<code>grid.official_redispatch_*</code>.</li>
</ul>
<h3>Views</h3>
<ul>
<li>Date-window brush (stacked by technology) + bubble map of measures.</li>
<li>Model-vs-reality daily curtailment line.</li>
<li><b>Plants — official vs model:</b> for the most-redispatched real plants, does the model
have the same plant (within 20&nbsp;km) and redispatch it the same direction? 26/33 ramp-ups and
17/25 curtailments match; the <b>◆ on map</b> toggle overlays model plants beside the official
bubbles.</li>
</ul>
<p class="meth-note">Backend <code>official_data.py</code>. The model carries the whole
conventional + offshore fleet; the gaps are foreign plants and distribution-level RE.</p>
`},

{id:'tab-market-merit', group:'App tabs', title:'Market → Merit order', body:`
<p>The economic dispatch vs the real 2025 market: annual energy mix, monthly stack, day-of-year
price curve (model vs SMARD) — the visual of pipeline step 6 and its calibration journey.</p>
<p class="meth-note"><code>merit_order_comparison.py</code> → <code>/api/official/merit</code> +
<code>/api/validation/report</code>. See the <i>Merit order</i> pipeline page for how it was
calibrated (r 0.30 → 0.908).</p>
`},

{id:'tab-validation', group:'App tabs', title:'Market → Validation', body:`
<p>Per-fuel and per-hour validation of the dispatch against measured SMARD 2025 (negative-price
hours, monthly generation, hourly correlation) — the quantitative "is the model right?" page.</p>
<p class="meth-note">Endpoint <code>/api/validation/report</code>. The SMARD filter-ID bug
(gas↔hydro / fake nuclear) was caught here — see the <i>Merit order</i> page.</p>
`},

{id:'tab-analysis', group:'App tabs', title:'Analysis · BESS + FCA (full)', body:`
<p>The Analysis tab answers a business question: <b>is a grid-scale battery worth more on a
firm grid connection, or on a cheaper "Flexible Connection Agreement" (FCA) that curtails it
when the local grid is congested?</b> It has two tools sharing one engine
(<code>bess_runner.py</code>, a faithful Python port of the VBA in
<code>BESS_Dispatch_2025.xlsm</code>): a <b>per-node simulator</b> (click any substation) and a
<b>system-wide scan</b> (every 110&nbsp;kV bus at once).</p>

<h3>The dispatch engine — how the battery earns money</h3>
<p>For all 8 760 hours of 2025 the battery stacks three revenue streams on the real SMARD +
regelleistung prices:</p>
<ol>
<li><b>Day-ahead + intraday arbitrage.</b> Each day is solved independently: sort the 24 hours,
buy in the cheapest, sell in the dearest. With intraday on, the buy price is
<code>min(DA, ID)</code> and the sell price <code>max(DA, ID)</code> per hour. A charge/discharge
pair is only taken if it clears the round-trip after costs:
<code>(sell − grid_cost) − (buy + grid_cost)/η<sub>RT</sub> − degradation &gt; 0</code>. The number
of pairs per day is capped by <code>max_cycles_day</code>. SoC is tracked hour to hour with
one-way efficiency <code>η<sub>1-way</sub> = √η<sub>RT</sub></code> on each leg.</li>
<li><b>FCR (primary reserve).</b> A flat block of MW held every hour, paid at the hourly FCR
capacity price.</li>
<li><b>aFRR (secondary reserve).</b> A held ± capacity block paid at the hourly aFRR capacity
price, plus aFRR <b>energy</b> revenue for the fraction actually activated, netted of
degradation.</li>
</ol>
<p>Reserve commitments <b>reserve headroom first</b> — the arbitrage only uses the
<i>remaining</i> power (<code>P − FCR − aFRR</code>) and energy band (<code>FCR·buffer_h +
aFRR·reserve_h</code> subtracted from the usable SoC), so value-stacking never double-books
the same MW. Net €/yr = arbitrage + FCR + aFRR cap + aFRR energy − degradation.</p>

<h3>The FCA implementation (Schleswig-Holstein Netz HV spec)</h3>
<p>An FCA trades firm capacity for a cheaper connection, under three real SH&nbsp;Netz HV rules
the engine applies to a <i>second</i> dispatch run:</p>
<ul>
<li><b>Reserve restrictions:</b> FCR (PRL) is <b>forbidden</b>; aFRR (SRL) is capped at
<b>30% of installed power</b>; the active-power gradient is limited to <b>6%/min</b> (a ramp
loss the firm run doesn't pay).</li>
<li><b>A rule-based power band ("Betriebsfenster")</b> driven by the <i>local</i> renewable
feed-in. The binding signal each hour is the <b>higher of nearby wind% and ground-PV%</b>
(relative to rated power). Feed-in (discharge) is allowed at 100% until that signal hits a
<b>knee</b>, then derates linearly to 0 at an <b>end</b> point; withdrawal (charge) is throttled
in dark-doldrum hours, with a <b>23:00–05:00 night release</b> (charge ≥25% allowed).</li>
<li><b>Three band variants</b> (chosen by the DSO at its discretion; V1 is today's spec):
<table>
<tr><td><b>Variant</b></td><td><b>Feed-in knee→end</b></td><td><b>Withdrawal knee</b></td></tr>
<tr><td>V1 (current)</td><td>100% until RE 50%, →0 at 100%</td><td>10%</td></tr>
<tr><td>V2</td><td>100% until 40%, →0 at 80%</td><td>20%</td></tr>
<tr><td>V3</td><td>100% until 30%, →0 at 60%</td><td>30%</td></tr>
</table></li>
</ul>
<p>The two runs (firm vs FCA) are differenced to report exactly what the FCA costs and why.</p>

<h3>What drives the band — the regional RE index</h3>
<p>The "nearby wind/PV" is real: <code>regional_re_index</code> sums the <b>standalone wind +
ground-mounted PV capacity (MaStR, rooftop excluded) within a 25&nbsp;km radius</b> of the bus,
and takes the hourly output <i>shape</i> from <b>ERA5 reanalysis capacity factors</b> — the
nearest 0.75° grid cell, so each region has its own independent weather timing (level <i>and</i>
timing are regional). eGon's national profile is the fallback. This is why windy northern nodes
hit the curtailment knee far more often than southern ones.</p>

<h3>Tool 1 — the per-node simulator (every button)</h3>
<img class="meth-img" src="/js/meth/bess_popup_result.png" alt="BESS per-node simulator popup"/>
<div class="meth-cap">Click any substation on <b>Grid → Network</b> → this popup. Substation
Lutterbek (110&nbsp;kV, 80&nbsp;MW wind + 21&nbsp;MW ground-PV within 25&nbsp;km), FCA V1 applied.</div>
<ul>
<li><b>Battery parameters</b> — Power (MW), Energy (MWh), RT η (%), max Cycles/day.</li>
<li><b>Reserve markets</b> — FCR / aFRR+ / aFRR− toggles + their reserved MW (FCR greys out to
"n/a" under FCA).</li>
<li><b>Connection toggle</b> — "Firm connection" vs "Apply FCA".</li>
<li><b>FCA panel</b> — band-variant chips V1/V2/V3 with a live <b>band chart</b> (the green
feed-in-allowed curve vs nearby RE output), RE-radius (km), and the night-window checkbox.</li>
<li><b>Show connected plants ▸</b> — draws the bus's MaStR plants at their true coordinates.</li>
<li><b>Simulate 1-year dispatch ▸</b> — runs the 8 760-h dispatch (well under a second).</li>
<li><b>Results</b> — KPI tiles (Net €/yr, Arbitrage, Reserves, Cycles/yr, €/MW-yr, and the
<b>FCA Δ</b> vs firm with the % retained), a representative-week dispatch chart (price + charge +
discharge + SoC, restricted hours shaded), and a full-year power chart with <b>⤓ Excel</b> export
(the same two-sheet Summary/Hourly workbook the VBA produces) and <b>⤢ Expand</b>.</li>
</ul>

<h3>Tool 2 — the system-wide scan (every feature)</h3>
<img class="meth-img" src="/js/meth/analysis_fca.png" alt="System-wide FCA revenue-loss map"/>
<div class="meth-cap">Every 110&nbsp;kV bus (≈6 400) coloured by the share of annual revenue a
50&nbsp;MW/100&nbsp;MWh battery gives up under the FCA. Green = small loss, red = large.</div>
<ul>
<li><b>Map-layer chips</b> — "FCA revenue loss", "Wind zones", "PV zones".</li>
<li><b>Band-scenario chips V1/V2/V3</b> — re-colour the whole map for each variant.</li>
<li><b>Reference economics</b> — firm net €/yr (identical at every bus, price-driven), the flat
reserve loss (FCR ban + aFRR cap), and the median location-specific feed-in loss.</li>
<li><b>Selected-node panel</b> — click any node for its firm-vs-FCA breakdown (net, Δ, %
retained, curtailed hours).</li>
<li><b>Hardest-hit buses table</b> — the 12 worst nodes for the chosen variant.</li>
<li><b>Run / Re-run</b> — recomputes all ≈6 400 buses (~2 min, cached to
<code>results/.bess_fca_scan.json</code>).</li>
</ul>
<img class="meth-img" src="/js/meth/analysis_wind.png" alt="ERA5 wind capacity-factor zones"/>
<div class="meth-cap">The "Wind zones" layer: ERA5 reanalysis grid cells (0.75°) coloured by
annual capacity factor — the regional weather that drives each node's FCA curtailment.</div>

<p class="meth-why"><b>Why this matters:</b> a firm connection is increasingly slow and
expensive to get in northern Germany. The FCA is the regulator's offer — connect now, accept
curtailment when the local grid is full. This tool prices that trade-off per site, so a
developer can see exactly which substations make a battery+FCA viable and which don't.</p>
<p class="meth-note">Backend: <code>app/backend/services/bess_runner.py</code> (engine + FCA),
<code>bess_scan.py</code> (system scan), router <code>routers/bess.py</code>
(<code>/api/bess/simulate · /context · /weather_zones · /scan · /export</code>). Prices:
<code>results/.smard_cache_2025_v2.json</code> (DA), <code>.intraday_cache_2025.json</code>,
<code>.balancing_cache_2025.json</code> (FCR/aFRR). Weather:
<code>results/era5_cf_2025.npz</code>. Excel original: <code>BESS_Dispatch_2025.xlsm</code> +
<code>scripts/bess_excel/modBESS.bas</code>.</p>
`},

{id:'tab-dc', group:'App tabs', title:'DC (LWL fibre backbone)', body:`
<p>The <b>LWL (fibre-optic) network</b> — not electrical DC. SEFE Energy's dark-fibre routes
(laid along their gas-pipeline corridors), doubling as low-latency long-haul between data-centre
sites.</p>
<ul>
<li><b>Fibre routes</b> — SEFE's public map data layer (exact WGS84, real routes).</li>
<li><b>Node names</b> (PoP/Repeater) — SEFE's public PDF, geocoded via OSM/Nominatim, snapped to
the route.</li>
<li><b>Data centres</b> — OpenStreetMap (Overpass <code>data_center</code>), major operators;
MW is an honest estimate (no open per-facility database).</li>
</ul>
<p class="meth-note">Build <code>scripts/dc_lwl/</code> → <code>app/frontend/js/dc_lwl.geojson</code>,
<code>dc_datacenters.geojson</code>.</p>
`},

{id:'tab-assistant', group:'App tabs', title:'Assistant', body:`
<p>A chat assistant that answers questions about the visible view. It screenshots the current tab
and sends a context JSON (active tab, hour, KPIs, top overloads/curtailment) to a local
open-source LLM.</p>
<p class="meth-note"><code>/api/ai/chat</code> proxies a local <b>Ollama</b> model
(prefers <code>gemma3:4b</code> for vision, text fallback), with a canned-answer fallback when
offline. <code>app/backend/routers/ai.py</code>.</p>
`},

/* ───────────────────────── REPRODUCE ───────────────────────── */
{id:'reproduce-grid', group:'Reproduce everything', title:'Rebuild the grid & fleet', body:`
<p>From the eGon database to grid_alpha + the MaStR fleet + loads.</p>
<pre class="meth-pre"># ── clean the raw OSM/eGon topology (V1 -> V6) ──
python reduce_network.py        # V1->V2  120 m clustering
python reduce_network_v3.py     # V2->V3  voltage-specific clustering
python scripts/reduction/v4/pipeline.py   # V3->V4  degree-2 elimination
python reduce_network_v5.py     # V4->V5  substation-proximity merge
python reduce_network_v6.py     # V5->V6  parallel-line capping

# ── fleet + loads + canonical scenario ──
python scripts/generator_mapping.py       # MaStR -> generators (270 GW)
python scripts/load_mapping.py            # 448 TWh -> 7,246 loads
python scripts/pipeline/build_grid_alpha_110merge.py   # grid_beta -> grid_alpha (110 kV merge)
python scripts/pipeline/gen_grid_alpha_ties.py         # tie register
python scripts/simulation/audit_connections.py         # guard (must pass)
</pre>
<p class="meth-note">Docs: <code>docs/methodology.md</code>, <code>docs/network_reduction.md</code>,
<code>docs/grid_alpha_build_2026-06-13.md</code>, <code>docs/grid_beta.md</code>.</p>
`},

{id:'reproduce-sim', group:'Reproduce everything', title:'Run dispatch → PF → redispatch', body:`
<p>The full simulation chain. Environment: <code>conda activate egon2025</code>; Postgres
running; app via <code>uvicorn app.backend.main:app --port 8765</code> (no <code>--reload</code>).</p>
<pre class="meth-pre">ENV=/opt/homebrew/anaconda3/envs/egon2025/bin/python

# 1 · day-ahead dispatch (SMARD-calibrated MILP)
$ENV scripts/simulation/run_unconstrained_8760h.py --smard
#   -> results/dispatch_8760h_smard.nc   (r_price 0.908, wind corr 0.998)

# 2 · DC power flow + grid fixes
APPLY_GEN_VOLTAGE_FIX=1 APPLY_REACTANCE_FIX=1 \\
REINFORCE_LINES_JSON=results/reinforce_lines.json \\
$ENV scripts/simulation/run_dcpf_8760h.py \\
  --in results/dispatch_8760h_smard.nc --out results/dispatch_8760h_pf_smard_reinf.nc

# 3 · whole-grid N-0 + N-1 redispatch
APP_BUILD_NC=results/dispatch_8760h_pf_smard_reinf.nc \\
APP_BUILD_OUT=results/app_year_wholegrid.npz \\
APP_SOLVER=fixpoint REDISPATCH_MIN_VNOM=0 REDISPATCH_N1_EHV_ONLY=1 REDISPATCH_N1_THRESH=0.30 \\
REDISPATCH_SOLAR_WEIGHT=5 REDISPATCH_IMPORT_COST=40 \\
REDISPATCH_EMERGENCY_IMPORTS="import_AT,import_CH,import_FR,import_NL,import_CZ,import_DK,import_NO,import_PL,import_BE,import_SE,import_LU" \\
APP_OFFSHORE_LANDING=1 \\
caffeinate -i $ENV scripts/simulation/build_app_sample.py --workers 4

# 4 · summary + point the app at it
$ENV scripts/simulation/summarize_redispatch.py results/app_year_wholegrid.npz \\
  --out results/redispatch_2025_summary.json
cp results/app_year_wholegrid.npz results/app_year.npz   # the app reads app_year.npz
</pre>
<p class="meth-note">Key code: <code>_redispatch_core.py</code> (engine),
<code>_gen_voltage_fix.py</code> (fixes), <code>run_dcpf_8760h.py</code> (PF),
<code>build_app_sample.py</code> (driver). Full narrative + the 6 grid-bug fixes:
<code>docs/dispatchredispatch_power_flow_final_2026-06-22.md</code>.</p>
`},

];
