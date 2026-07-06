/* Regulatory briefing — editorial content for the "Regulatory" tab.
   Each post: id, tag (topic chip), date (ISO, display), title, dek (standfirst),
   body (HTML, rendered with the meth-body typography), sources [{label,url}],
   and an optional `app` note linking the topic to a view in this studio.
   Curated from public sources as of 6 July 2026. */
window.REG_POSTS=[

{id:'agnes',tag:'Network charges',date:'2026-05-27',title:'AgNeS: the ground rules of German grid fees are being rewritten',
dek:'The Bundesnetzagentur has put its updated thinking for the general network-charge reform on the table. A final draft is due by end-2026 — and the new system starts on 1 January 2029.',
body:`
<p>Since late 2024 the Bundesnetzagentur has been running <b>AgNeS</b> — <i>Allgemeine Netzentgeltsystematik Strom</i> — the first ground-up reform of how German electricity network charges are built since the StromNEV era. On 27 May 2026 the agency presented its updated Überlegungen, turning a discussion paper into something close to a blueprint.</p>
<h3>What is on the table</h3>
<p>The reform touches every rate-payer class at once: the industrial <b>Bandlastprivileg</b> (§ 19 Abs. 2 StromNEV) is to be replaced by a flexibility-friendly framework, household charges are expected to shift toward capacity-based components, and — for the first time — <b>feed-in charges for generators</b> (Einspeiseentgelte) are being seriously examined. The declared goal is that charges should reward grid-serving behaviour instead of pure volume.</p>
<h3>Storage sits in the crossfire</h3>
<p>For battery storage the central question is what replaces today's near-total exemption. The agency has published dedicated "Orientierungspunkte" on storage network charges within AgNeS, and industry associations are lobbying hard: projects have been financed on the assumption of twenty exemption years, and the BNetzA has signalled that <b>trust protection</b> will apply — plants with a final investment decision before the Festlegung, commissioned by August 2029, keep their exemption.</p>
<p>The timetable: a formal draft Festlegung by the end of 2026, decision in 2027, and the new system in force on <b>1 January 2029</b> — the same date the current Netzentgelt world, including many of its privileges, sunsets.</p>`,
app:'The Analysis tab prices a 100 MW battery at every 110 kV bus — today under the § 118 exemption. AgNeS decides whether that column of the business case survives past 2029.',
sources:[
['Bundesnetzagentur — press release on the updated AgNeS considerations (27 May 2026)','https://www.bundesnetzagentur.de/SharedDocs/Pressemitteilungen/DE/2026/20260527_Agnes.html'],
['Rödl & Partner — Bundesnetzagentur konkretisiert Netzentgeltreform AgNes','https://www.roedl.com/insights/bundesnetzagentur-konkretisiert-netzentgeltreform-agnes/'],
['BEE — Stellungnahme zu „Speichernetzentgelte: Orientierungspunkte der BNetzA" im Rahmen der AgNes','https://www.bee-ev.de/service/publikationen-medien/beitrag/bee-stellungnahme-zu-speichernetzentgelte-orientierungspunkte-der-bnetza-im-rahmen-der-agnes'],
['windmesse.de — Projektierer vertrauen auf Zusagen der BNetzA zur Wahrung tragfähiger Speichergeschäftsmodelle','https://w3.windmesse.de/windenergie/news/48448-agnes-verfahren-netzentgeltreform-bnetza'],
['Logic Energy — AgNes-Reform 2026: Was PV-Investoren wissen müssen','https://www.logicenergy.de/neuigkeiten/agnes-reform-strom-pv-investoren']]},

{id:'mispel',tag:'Storage',date:'2026-06-30',title:'MiSpeL: storage wakes up from its regulatory hibernation',
dek:'The BNetzA determination on market integration of storage and charging points must be in force by 1 July 2026. It lets batteries mix grid power and green power without losing EEG eligibility — the unlock co-location has waited for.',
body:`
<p>Few file numbers have moved battery business models like <b>MiSpeL</b> — <i>Marktintegration von Speichern und Ladepunkten</i>. The Bundesnetzagentur published the draft on 18 September 2025; the EnWG gives it a hard statutory deadline: the final Festlegung must take effect by <b>1 July 2026</b>.</p>
<h3>The problem it solves</h3>
<p>Under the old exclusivity rule, a storage plant claiming EEG support could effectively only ever charge green electricity — one kilowatt-hour from the grid and the plant's EEG eligibility was contaminated. That froze co-located batteries at solar and wind parks into pure "green-only" operation and left arbitrage value on the table.</p>
<h3>Two ways out</h3>
<p>MiSpeL introduces a <b>delimitation option</b> (Abgrenzungsoption) — meter and account for grey and green quantities separately, with EEG payments flowing only for the delimited green share — and a simpler <b>flat-rate option</b> (Pauschaloption) that assigns fixed shares without full metering. Mixed-charging storage and charging points become fundable for the first time; commentators have called it the end of the storage <i>Dornröschenschlaf</i>.</p>
<p>For large co-location projects the delimitation option is the strategic choice: it keeps the EEG floor for the renewable share while opening the grid-charging door to wholesale arbitrage and ancillary services with the rest of the capacity.</p>`,
app:'Co-location economics change the dispatch of every battery this model places next to a wind or solar cluster — grid-charging widens the arbitrage band the Analysis tab simulates.',
sources:[
['BBH-Blog — MiSpeL-Entwurf der BNetzA: das Ende des Dornröschenschlafs für Speicher und Ladepunkte','https://www.bbh-blog.de/allgemein/mispel-entwurf-der-bnetza-das-ende-des-dornroeschenschlafs-fuer-speicher-und-ladepunkte/'],
['Bundesnetzagentur — Fachthema Stromspeicher','https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/Speicher/start.html'],
['Next Kraftwerke — MiSpeL und AgNes: Regulierung zur Marktintegration von Speichern','https://www.next-kraftwerke.de/energie-blog/mispel-agnes-batteriespeicher'],
['Interconnector — Was bedeutet MiSpeL für Co-Location-Batteriespeicher?','https://www.interconnector.de/energieblog/batterievermarktung/mispel-und-die-abgrenzungsoption-strategische-weichenstellung-fuer-grossbatteriespeicher-in-co-location/'],
['Prometheus Recht — BNetzA veröffentlicht Entwurf zur MiSpeL','https://www.prometheus-recht.de/bundesnetzagentur-mispel-speicher/']]},

{id:'nsa2',tag:'Flexibility',date:'2026-04-01',title:'Nutzen statt Abregeln 2.0: from pilot to market in October',
dek:'The four TSOs published their implementation concept for § 13k EnWG on 1 April 2026. The trial phase ends in September — then curtailed wind power gets auctioned to flexible consumers instead of being switched off.',
body:`
<p><i>Nutzen statt Abregeln</i> — "use it, don't curtail it" — is the § 13k EnWG answer to an uncomfortable number: gigawatt-hours of renewable generation are curtailed for congestion every year while electrolysers, heat generators and data centres pay full price a few kilometres away.</p>
<h3>How the mechanism works</h3>
<p>Ahead of expected congestion-related curtailment, the TSOs allocate the surplus energy to <b>zuschaltbare Lasten</b> — additional, flexible loads behind a separate metered connection (minimum 100 kW<sub>el</sub> in the pilot, pooling allowed). The load pays a reduced price; the system saves the redispatch cost of dumping the energy.</p>
<h3>2026 is the transition year</h3>
<p>The trial phase runs until the end of <b>September 2026</b>. On 1 April 2026 the four transmission operators published their joint implementation concept on netztransparenz.de, and the Bundesnetzagentur has framed the follow-up as "Nutzen statt Abregeln 2.0": from <b>October 2026</b> the allocation moves to a competitive bidding procedure, and coordination with distribution operators is being built in — DSOs can register their interest to participate under § 13k Abs. 8.</p>
<p>Early assessments (FfE) are sober about volumes so far, but the target model matters structurally: it is the first standing market interface where congestion-driven surplus becomes a tradable product rather than a loss line in the redispatch account.</p>`,
app:'The Scenarios tab quantifies exactly the energy at stake: pre-redispatch overloads and the curtailment the cascade orders, hour by hour, for 2025 through 2035.',
sources:[
['Bundesnetzagentur — Nutzen statt Abregeln 2.0','https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/Versorgungssicherheit/NSA/start.html'],
['netztransparenz.de — ÜNB-Umsetzungskonzept § 13k EnWG (1 April 2026, PDF)','https://www.netztransparenz.de/cdn/files/37bd9764-d02a-46de-fce9-08de8bf3161c/2026-04-01%20u%CC%88nb%20umsetzungskonzept%20%C2%A713k%20enwg.pdf'],
['FfE — Wie läuft Nutzen statt Abregeln? Erste Bilanz der Erprobungsphase','https://www.ffe.de/en/publications/use-instead-of-curtail-an-initial-assessment-of-the-trial-phase-of-13k-enwg/'],
['Raue — Update zu § 13k EnWG – Nutzen statt Abregeln','https://raue.com/aktuell/branchen/energie-und-klimaschutz/update-zu-%C2%A7-13k-enwg-nutzen-statt-abregeln/'],
['§ 13k EnWG im Wortlaut — gesetze-im-internet.de','https://www.gesetze-im-internet.de/enwg_2005/__13k.html']]},

{id:'reifegrad',tag:'Grid connection',date:'2026-04-01',title:'Reifegradverfahren: the connection queue is now a maturity contest',
dek:'Since 1 April 2026 the four TSOs allocate transmission-grid connections by project maturity — "first ready, first served". The era of paper reservations blocking gigawatts is over.',
body:`
<p>For years, access to the German transmission grid worked like a bakery queue: whoever filed first — however speculative the project — held the capacity. With storage and data-centre requests piling up to multiples of what the grid can physically connect, the four TSOs (50Hertz, Amprion, TenneT, TransnetBW) pulled the emergency brake.</p>
<h3>First ready, first served</h3>
<p>The joint concept, published on netztransparenz.de on <b>5 February 2026</b> (V1.00), replaces first-come-first-served with a <b>Reifegradverfahren</b> — a maturity assessment. In periodic allocation cycles, competing requests for the same electrical region are scored on five families of criteria: site control, permitting progress, the technical plant and connection concept, the applicant's financial capability, and the project's grid- and system-benefit. Only projects that clear the bar get a binding reservation; the first information-and-application phase opened on <b>1 April 2026</b>.</p>
<h3>Who is affected</h3>
<p>The procedure targets the new load and storage wave — large consumers, electrolysers, data centres, grid-scale batteries. Existing <i>binding</i> reservations are grandfathered; everything softer must re-enter through the new gate or withdraw. Law firms are already debating discrimination questions (§ 17 EnWG) and how the scoring interacts with the parallel Netzanschlusspaket legislation — but the direction is set, and the DSO level is watching closely.</p>`,
app:'The Grid → Grid reform view maps all published Reifegradverfahren connection points with free bays, years and restrictions — the supply side of this new contest.',
sources:[
['netztransparenz.de — Reifegradverfahren für Netzanschlüsse an das Übertragungsnetz, Konzept V1.00 (5 Feb 2026, PDF)','https://www.netztransparenz.de/Portals/1/Dokumente/Presse/2026/2026-02-05_Vier_Uebertragungsnetzbetreiber_Reifegradverfahren_Dokumentation_V100.pdf'],
['TransnetBW — ÜNB führen „Reifegradverfahren" für Netzanschlussanträge von Speichern und Großverbrauchern ein','https://www.transnetbw.de/de/newsroom/pressemitteilungen/uebertragungsnetzbetreiber-fuehren-reifegradverfahren-ein'],
['Taylor Wessing — TSOs switch grid connection allocation to maturity assessment procedure','https://www.taylorwessing.com/en/insights-and-events/insights/2026/02/unb-stellen-netzanschlussvergabe-auf-reifegradverfahren-um'],
['Baker McKenzie — Neues Reifegradverfahren für Netzanschlüsse (Legal Update, März 2026, PDF)','https://www.bakermckenzie.com/-/media/files/insight/publications/2026/03/deutschland-neues-reifegradverfahren-fr-netzanschlsse-an-das-bertragungsnet.pdf'],
['CMS — Neues Reifegradverfahren über Netzanschlüsse am Übertragungsnetz','https://cms.law/de/deu/legal-updates/neues-reifegradverfahren-ueber-netzanschluesse-am-uebertragungsnetz'],
['bne — Rückmeldung zum Reifegradverfahren','https://www.bne-online.de/rueckmeldung-zum-reifegradverfahren-fuer-netzanschluesse-an-das-uebertragungsnetz/']]},

{id:'netzpaket',tag:'Legislation',date:'2026-02-09',title:'The Netzanschlusspaket: capacity maps, auctions — and a crack in the feed-in priority',
dek:'A leaked BMWE draft bill from 13 January 2026 would force operators to publish free grid capacity on a monthly map, allow capacity auctions, and — most controversially — touches the renewable connection privilege.',
body:`
<p>The "Netzpaket" (formally the <i>Netzanschlusspaket</i>) is the legislative twin of the TSOs' Reifegradverfahren. The Referentenentwurf from the Federal Ministry for Economic Affairs and Energy, dated <b>13 January 2026</b>, became public in early February and immediately split the sector.</p>
<h3>Transparency and new allocation tools</h3>
<p>The bill would require network operators to publish available connection capacity on a <b>geographic map, updated monthly</b>; from 2028, DSOs must run an electronic pre-check channel for connections from 135 kW. Transmission operators may rank connection requests by qualitative criteria — and, with BNetzA approval, run different procedure types up to the <b>auctioning of connection capacity</b>. Municipalities gain the ability to reserve capacity for uses designated in spatial plans, data centres explicitly included.</p>
<h3>Storage wins, renewables worry</h3>
<p>For batteries the draft contains a clean win: operators can no longer simply refuse a <b>grid-neutral co-location storage</b> behind an existing connection if the maximum connection capacity is unchanged. The political firestorm is elsewhere: the draft relativises the <b>connection and feed-in priority for renewables</b> that has anchored the EEG since 2000. pv magazine's headline — the draft "rattles" the Einspeisevorrang — was one of the friendlier ones; the wind association called it a frontal assault. The parliamentary process through 2026 will decide how much of that survives.</p>`,
app:'The Grid → Investment plan and Grid reform views show where physical capacity is actually being built — the scarce good this bill decides how to ration.',
sources:[
['Referentenentwurf Netzanschlusspaket — Bearbeitungsstand 13.01.2026 (PDF via table.media)','https://table.media/assets/climate/referentenentwurf-netzanschlusspaket.pdf'],
['pv magazine — Netzpaket-Entwurf rüttelt am Anschluss- und Einspeisevorrang für Erneuerbare (9 Feb 2026)','https://www.pv-magazine.de/2026/02/09/netzpaket-entwurf-ruettelt-am-anschluss-und-einspeisevorrang-fuer-erneuerbare/'],
['anwalt.de — Netzanschluss von Rechenzentren: Reifegradverfahren, Netzpaket und FCA','https://www.anwalt.de/rechtstipps/netzanschluss-von-rechenzentren-reifegradverfahren-netzpaket-und-fca-was-betreiber-wissen-muessen-273695.html'],
['windmesse.de — „Der Gesetzentwurf zum Netzpaket ist ein Frontalangriff gegen den Ausbau der Erneuerbaren"','https://w3.windmesse.de/windenergie/news/48505-reiche-gesetzentwurf-netzpaket'],
['ZfK — Bundesnetzagentur beantwortet Fragen zum Speicher-Anschluss','https://www.zfk.de/energie/strom/speicher-bundesnetzagentur-faq-stromnetz-batteriespeicher']]},

{id:'bess-fees',tag:'Storage',date:'2026-01-30',title:'Grid fees for batteries: the 20-year exemption is no longer sacred',
dek:'The BGH has blessed construction cost contributions for grid-scale batteries, and the BNetzA is openly examining an early end to the § 118 EnWG network-charge exemption. The BESS business case is being repriced.',
body:`
<p>Two pillars carried every German grid-scale battery financial model: no network charges for twenty years (§ 118 Abs. 6 EnWG, for plants commissioned by <b>4 August 2029</b>), and — depending on the operator — no or low one-off connection contributions. Both pillars moved in the last twelve months.</p>
<h3>The BGH ruling on Baukostenzuschüsse</h3>
<p>On <b>15 July 2025</b> the Federal Court of Justice confirmed that a <b>Baukostenzuschuss</b> (construction cost contribution) for a grid-connected battery, calculated under the Leistungspreismodell, was lawfully levied. What many developers had treated as a TSO negotiating position is now settled case law: batteries above low voltage pay BKZ, and the BNetzA has said as much in its guidance.</p>
<h3>„Unechte Rückwirkung" — the early sunset debate</h3>
<p>Within AgNeS, the BNetzA is examining whether the § 118 exemption can be ended <i>early</i> for existing plants — legally framed as a permissible "unechte Rückwirkung" (quasi-retroactivity), reported by pv magazine on <b>30 January 2026</b>. The agency has floated trust-protection rules (FID before the Festlegung, commissioning by August 2029 → exemption survives), but the direction is unmistakable: storage will pay <i>something</i>, the fight is about how much, from when, and how grid-serving operation is rewarded. Between BKZ, the exemption debate and MiSpeL's new revenue options, 2026 is the year the German BESS case gets rebuilt line by line.</p>`,
app:'The Analysis tab’s node-by-node BESS simulator shows how thin the margin at weak buses already is — a network-charge line item moves the ranking materially.',
sources:[
['pv magazine — BNetzA prüft „unechte Rückwirkung" für vorzeitige Beendigung der Netzentgeltbefreiung (30 Jan 2026)','https://www.pv-magazine.de/2026/01/30/bundesnetzagentur-prueft-unechte-rueckwirkung-fuer-vorzeitige-beendigung-der-netzentgeltbefreiung-fuer-batteriespeicher/'],
['BBH-Blog — Batteriespeicher: Neues zu Netzanschlüssen und Netzentgelten','https://www.bbh-blog.de/allgemein/batteriespeicher-neues-zu-netzanschluessen-und-netzentgelten/'],
['ZfK — Netzentgelt-Befreiung: Der Zeitdruck für Batteriespeicher wächst','https://www.zfk.de/energie/strom/netzentgelt-batteriespeicher-bundesnetzagentur-agnes'],
['FfE — Neue Netzentgelt-Privilegien für Speicheranlagen: Stehen die Befreiungen auf dünnem Eis?','https://www.ffe.de/veroeffentlichungen/neue-netzentgelt-privilegien-fuer-speicheranlagen-und-ladepunkte-stehen-die-befreiungen-auf-duennem-eis/'],
['smartgrids-BW — BBH zu Netzanschlüssen und Netzentgelten für Batteriespeicher: Grundlegende Regeländerungen ab 2026','https://smartgrids-bw.net/news/bbh-zu-netzanschluessen-und-netzentgelten-fuer-batteriespeicher-grundlegende-regelaenderungen-ab-2026/']]},

{id:'stromvkg',tag:'Capacity market',date:'2026-01-15',title:'StromVKG: Germany finally tenders its backup power plants',
dek:'After the deal in principle with Brussels on 15 January 2026, the renamed power-plant law puts the first gas-fired capacity out to tender — 4.5 GW on 8 September and another 4.5 GW on 22 December 2026.',
body:`
<p>The power-plant strategy has consumed three governments; now it has a legal vehicle and dates. The former Kraftwerkssicherheitsgesetz has been renamed <b>StromVKG</b> — <i>Gesetz zur Sicherung der Versorgungssicherheit Strom und zur Bereitstellung neuer Kapazitäten</i> — and on <b>15 January 2026</b> the ministry announced an agreement in principle with the European Commission on the state-aid cornerstones.</p>
<h3>The numbers</h3>
<p>The coalition's target is up to <b>20 GW</b> of new controllable — in practice gas-fired, hydrogen-capable — capacity by 2030, tendered technology-neutrally. The first tranche covers roughly <b>12 GW</b> across categories; the two long-term capacity auctions of 2026 carry <b>4.5 GW each</b>, with bid deadlines on <b>8 September</b> and <b>22 December 2026</b>. The hydrogen-conversion requirements, sharply debated in consultation, have been softened relative to the Habeck-era drafts.</p>
<h3>Why it matters for the grid</h3>
<p>Where these plants land is a transmission question as much as a market one: southern siting bonuses are meant to pull capacity below the north–south congestion cut. In parallel, the law is the bridge to a comprehensive <b>capacity mechanism</b> — the combined market design debate (centralised vs. decentralised) continues through 2026, with EU pressure to have a mechanism notified before decade's end.</p>`,
app:'The Scenarios tab’s 2030–2035 horizons assume NEP-conform gas additions at documented sites — the StromVKG auctions decide whether those megawatts materialise on schedule.',
sources:[
['BMWE — Grundsatzeinigung mit der Europäischen Kommission über Eckpunkte der Kraftwerksstrategie (15 Jan 2026)','https://www.bundeswirtschaftsministerium.de/Redaktion/DE/Pressemitteilungen/2026/01/20260115-grundsatzeinigung-mit-europaeischen-kommission-ueber-eckpunkte-der-kraftwerksstrategie.html'],
['Börsen-Zeitung — Ausschreibungen für neue Gaskraftwerke beginnen im September','https://www.boersen-zeitung.de/konjunktur-politik/ausschreibungen-fuer-neue-gaskraftwerke-beginnen-im-september'],
['CMS — Der Entwurf des StromVKG im Überblick','https://cms.law/de/deu/legal-updates/der-entwurf-des-stromvkg-im-ueberblick'],
['Taylor Wessing — Die Ausschreibung von Gaskraftwerken zur Sicherung der Energieversorgung (PDF)','https://www.taylorwessing.com/-/media/taylor-wessing/files/germany/2026/02/ausschreibung-von-gaskraftwerken-zur-sicherung-der-energieversorgung.pdf'],
['ZfK — Reiches Gaskraftwerke-Pläne: Was Merz’ Ministerin vorhat','https://www.zfk.de/politik/deutschland/gaskraftwerke-reiche-wasserstoff-kriterien-gebote']]},

{id:'gebotszone',tag:'Market design',date:'2025-12-15',title:'One price zone, by decision: Germany rejects the bidding-zone split',
dek:'ENTSO-E’s review found up to €339 m per year in welfare gains from splitting the German zone. In December 2025 the government answered with an "Aktionsplan Gebotszone": the DE-LU zone stays.',
body:`
<p>The long-running <b>Bidding Zone Review</b> concluded what every congestion map already showed: the single German-Luxembourg price zone hides a structural north–south divide. The ACER-commissioned modelling put the welfare gain of a five-zone split at up to <b>€339 million per year</b>, with configurations ranging from a simple north–south cut to a southern zone of Bavaria, Baden-Württemberg, Hesse, Rhineland-Palatinate and the Rhineland.</p>
<h3>The political answer</h3>
<p>In <b>December 2025</b> the BMWE published its <i>Aktionsplan Gebotszone</i>: Germany keeps the uniform zone. The official reasoning — the review is a snapshot of a single year (2025), the modelled gains are dwarfed by reconfiguration costs, and the grid build-out plus redispatch reform will erode the congestion rents the split would price. The coalition agreement had pre-committed to this outcome; the four TSOs were likewise critical of the review's methodology.</p>
<h3>Not over</h3>
<p>ACER has signalled it will revisit the question — trade press summarised it as "Acer probiert es nochmal". And the underlying physics does not care about the Aktionsplan: as long as one price clears from Flensburg to Garmisch, the difference between market dispatch and feasible dispatch lands in the redispatch account, which is precisely the quantity this debate is about.</p>`,
app:'This entire studio is, in effect, a bidding-zone-review instrument: the Scenarios congestion view shows the north–south cut a split would price, hour by hour.',
sources:[
['energiezukunft — Aktionsplan Gebotszone: Deutschland will einheitliche Stromgebotszone beibehalten','https://www.energiezukunft.eu/erneuerbare-energien/stromnetze-speicher/deutschland-will-einheitliche-stromgebotszone-beibehalten'],
['Energie & Management — Acer probiert es nochmal mit der Strommarkt-Teilung','https://energie-und-management.de/nachrichten/alle/detail/acer-probiert-es-nochmal-mit-der-strommarkt-teilung-161363'],
['Science Media Center — Wird Deutschlands Strompreiszone geteilt?','https://www.sciencemediacenter.de/angebote/wird-deutschlands-strompreiszone-geteilt-25041'],
['VCI — Auswirkungen einer Stromgebotszonenteilung (Diskussionspapier, PDF)','https://www.vci.de/ergaenzende-downloads/vci-iskussionspapier-gebotszonenteilung.pdf'],
['IHK München — Positionspapier zum Erhalt der deutschen Stromgebotszone (PDF)','https://www.ihk-muenchen.de/ihk/documents/%C3%9Cber-Uns/IHK_PP_Erhalt-der-deutschen-Stromgebotszone.pdf']]},

{id:'monitoring',tag:'Policy',date:'2025-11-03',title:'The Energiewende monitoring report — and the EEG endgame of 2026',
dek:'The BET/EWI monitoring report gave Minister Reiche the evidence base for a ten-point course correction. The hard deadline behind it: the EEG’s EU state-aid approval expires at the end of 2026.',
body:`
<p>Commissioned by the new government and delivered by <b>BET Consulting and the EWI</b> (University of Cologne), the <i>Monitoringbericht Energiewende</i> was presented by Economics Minister Katherina Reiche together with a ten-point plan — and instantly became the most argued-over document in German energy policy.</p>
<h3>The course correction</h3>
<p>The report's thrust: align renewable build-out with realistic demand paths rather than aspirational ones, trim support toward market- and system-compatibility, and put firm capacity, grids and flexibility on equal footing with generation targets. Critics — from state energy ministers to the renewables industry — read the same pages as evidence the expansion pace must be held, and accused the ministry of using the report to justify gas, CCS and hydrogen subsidies instead.</p>
<h3>Why 2026 forces the issue</h3>
<p>Behind the debate sits a legal clock: the EEG's current <b>EU state-aid clearance runs out at the end of 2026</b>. The reform under construction replaces the fixed feed-in tariff for new installations with <b>two-sided contracts for difference</b> including clawback, ends compensation during negative-price hours entirely, and pushes new rooftop PV toward self-marketing. Chancellor Merz has publicly backed the plans. Whatever emerges, 2026 is the year the EEG's founding logic — pay per kilowatt-hour, regardless of system state — formally ends.</p>`,
app:'The Grid → NEP forecast view carries the 2030/2032/2035 fleet paths this debate is about; the Scenarios market views show what negative-price hours already do to dispatch.',
sources:[
['BMWE — Monitoring der Energiewende: Ergebnisse und Schlussfolgerungen (Schlaglichter, Nov 2025)','https://www.bundeswirtschaftsministerium.de/Redaktion/DE/Schlaglichter-der-Wirtschaftspolitik/2025/11/03-monitoring-der-energiewende.html'],
['ZDFheute — Reiches Energiewende: Kurskorrektur oder Vollbremsung?','https://www.zdfheute.de/politik/deutschland/energiewende-monitoring-reiche-kritik-100.html'],
['ZDFheute — EEG: Reiche will Einschnitte bei Förderung erneuerbarer Energien','https://www.zdfheute.de/politik/deutschland/foerderung-solaranlagen-strom-reiche-eeg-100.html'],
['ZfK — EEG-Reform: Merz steht hinter Reiches Plänen zur PV-Förderung','https://www.zfk.de/politik/deutschland/merz-reiche-pv-foerderung-eeg-novelle-2026'],
['neue energie — EEG-Reform 2026: Was bedeutet das für EE-Anlagen?','https://www.neueenergie.net/artikel/politik/deutschland/eeg-reform-2026']]},

{id:'offshore',tag:'Offshore',date:'2026-01-30',title:'Offshore wind: after the zero-bid shock, the 2026 auctions slip to 2027',
dek:'August 2025 brought the first German offshore auction with no bids at all. The re-tender was set for June 2026 — then the amended spatial plan of 30 January 2026 moved the year’s auctions wholesale into 2027.',
body:`
<p>It had never happened before: in <b>August 2025</b> the Bundesnetzagentur's auction for the centrally pre-examined sites <b>N-10.1 (2,000 MW)</b> and <b>N-10.2 (500 MW)</b> — grid connections planned for 2031 and 2030 — closed without a single bid.</p>
<h3>Why nobody bid</h3>
<p>Developers pointed to the model, not the sea: uncapped negative-bidding with full merchant price risk, rising capital and supply-chain costs, and — increasingly quantified — <b>wake losses</b> from the planned build density that shave full-load hours off precisely the sites now on offer. The BDEW called it a wake-up call for the auction design; the reform debate (CfDs for offshore, as most neighbouring markets use) has been running since.</p>
<h3>The 2026 slip</h3>
<p>The agency first re-scheduled N-10.1 and N-10.2 under the rules for non-centrally pre-examined sites with a bid deadline of 1 June 2026. But on <b>30 January 2026</b> the amendment of the offshore spatial development plan shifted the entire 2026 tender slate — N-10.1, N-10.2, N-12.4, N-12.5, N-13.1 and N-13.2 — into the <b>2027 auction year</b>. For the 2035+ horizons, the arithmetic is uncomfortable: the 30/40 GW targets need auctions that clear, and two lost years compound through every grid-connection schedule the TSOs have published.</p>`,
app:'The Scenarios 2035 horizon assumes the NEP offshore ramp arrives on schedule — this is the single largest downside risk to the northern feed-in in that model year.',
sources:[
['BDEW — Erstmals keine Gebote in einer Ausschreibung für Offshore-Wind','https://www.bdew.de/presse/erstmals-keine-gebote-in-einer-ausschreibung-fuer-offshore-wind/'],
['ZfK — Offshore-Wind-Ausschreibung gescheitert: Die Gründe','https://www.zfk.de/energie/strom/keine-gebote-offshore-wind-ausschreibung-erstmals-gescheitert'],
['windbranche.de — Offshore-Ausschreibung floppt: Reformdruck steigt','https://www.windbranche.de/news/ticker/offshore-ausschreibung-floppt-erstmals-keine-gebote-fuer-offshore-wind-ausschreibung-reformdruck-steigt-artikel7678'],
['Bundesnetzagentur — Ausschreibungen für nicht zentral voruntersuchte Flächen (BK6)','https://www.bundesnetzagentur.de/DE/Beschlusskammern/BK06/BK6_72_Offshore/Ausschr_nicht_zentral_vorunters_Flaechen/start.html']]},

{id:'p14a',tag:'Network charges',date:'2026-03-15',title:'§ 14a in year two: time-variable grid fees exist — steering effect pending',
dek:'Since April 2025 every DSO must offer time-variable network charges for controllable devices (Modul 3). In 2026 the instrument is standard — and the debate has moved to why it steers so little.',
body:`
<p>The § 14a EnWG framework — the deal that grants heat pumps, wallboxes and home batteries a guaranteed connection in exchange for grid-side dimmability — entered its second stage in <b>April 2025</b>, when distribution operators became obliged to offer <b>Modul 3: time-variable network charges</b> with high-, standard- and low-load windows per grid area.</p>
<h3>The 2026 reality</h3>
<p>A year in, the instrument is routine but uneven: price levels and time windows differ sharply between the ~800 DSO areas, and the low-tariff windows do not always coincide with the hours that actually help the local grid. Uptake tracks the smart-meter rollout, since Modul 3 requires an iMSys with 15-minute metering — still the binding constraint in most areas.</p>
<h3>The critique</h3>
<p>Trade press summarised the emerging consensus bluntly: "the instrument exists — the effect doesn't." Static three-window tariffs, set a year ahead, cannot follow a wind front. The reform discussion therefore folds into AgNeS: genuinely <b>dynamic</b> network charges, coupled to actual grid state, are the declared end-state — § 14a Modul 3 is the training-wheels version, and 2026 is the year the sector is learning to ride.</p>`,
app:'The Grid → Load view shows the household-density pockets where controllable-device growth will land first — the DSO areas where Modul 3 windows matter most.',
sources:[
['ZfK — Zeitvariable Netzentgelte: Das Instrument existiert – die Wirkung nicht','https://www.zfk.de/energie/strom/variable-netzentgelte-14a-enwg-modul-3-dynamische-tarife'],
['INTENSE — § 14a EnWG & zeitvariable Netzentgelte: Neuerungen ab April 2025','https://www.intense.de/magazin/regulatorische-aenderungen-%C2%A714a-enwg-zeitvariable-netzentgelte/'],
['Netze BW — Regelung § 14a EnWG','https://www.netze-bw.de/neuregelung-14a-enwg'],
['enerix — Dynamische Netzentgelte 2026: Stromkosten clever senken','https://www.enerix.de/ratgeber/dynamische-netzentgelte/'],
['ADAC — Reduzierte Netzentgelte: Mit steuerbarer Wärmepumpe oder Wallbox sparen','https://www.adac.de/rund-ums-haus/energie/neue-netzentgelte/']]},

{id:'fca',tag:'Grid connection',date:'2026-05-01',title:'Flexible connection agreements: the contract that jumps the queue',
dek:'Between the Reifegradverfahren and the Netzpaket, a third instrument is quietly becoming standard: connect earlier, accept contractual curtailment. For batteries and data centres, flexibility is now a currency.',
body:`
<p>While the Reifegradverfahren decides <i>who</i> gets scarce connection capacity and the Netzpaket decides <i>how</i> it is rationed, <b>flexible connection agreements</b> (flexible Netzanschlussvereinbarungen, FCA) change what "a connection" means: the customer accepts defined performance limitations — capping, curtailment windows, grid-state-dependent dispatch — and in exchange connects years earlier than a firm connection would allow.</p>
<h3>From regulatory to contractual</h3>
<p>Legally, the FCA shifts the flexibility question from the regulatory to the contractual level: instead of waiting for grid reinforcement (or litigating a refusal under § 17 EnWG), the parties price the residual congestion risk into the contract. The Netzpaket draft explicitly builds on this logic, and TSO practice increasingly treats a credible flexibility concept as a maturity criterion in its own right.</p>
<h3>Who signs first</h3>
<p>The natural first movers are <b>batteries</b> (curtailment tolerance is close to free for a storage plant that can simply time-shift) and <b>data centres</b> with load-shaping ability. The open questions are quantitative — how many hours of limitation, valued how, against how many years of earlier market access? That is an hourly-simulation question, not a legal one, and it decides whether an FCA is a discount or a trap at any given node.</p>`,
app:'The Analysis tab answers exactly this: firm vs. FCA connection for a 100 MW battery at every 110 kV bus, over a full simulated year — the FCA haircut, node by node.',
sources:[
['anwalt.de — Netzanschluss von Rechenzentren: Reifegradverfahren, Netzpaket und FCA','https://www.anwalt.de/rechtstipps/netzanschluss-von-rechenzentren-reifegradverfahren-netzpaket-und-fca-was-betreiber-wissen-muessen-273695.html'],
['Bird & Bird — Batteriebremse oder sinnvolle Korrekturen? Aktuelle Herausforderungen beim Netzanschluss von Batteriespeichern','https://www.twobirds.com/en/insights/2026/germany/batteriebremse-oder-sinnvolle-korrekturen--aktuelle-herausforderungen-beim-netzanschluss-von-batteri'],
['Gridside — Reifegradverfahren beim Netzanschluss','https://gridside.de/aktuelles/reifegradverfahren-beim-netzanschluss/'],
['Energie und Recht — Netzanschluss von Rechenzentren: Das Reifegradverfahren','https://www.energieundrecht.com/blog/netzanschluss-rechenzentren-reifegradverfahren']]}
];
