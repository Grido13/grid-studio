"""Grid-connection CAPEX/OPEX estimator (screening level).

Given a project (technology, size, Q-capability, connection voltage) at a map
point and a connection target — an existing substation/bus or a tap into an
existing line — estimate the full connection cost:

* cable route  = air distance x 1.4 (detour factor for permits/roads)
* cable sizing = every standard cross-section that can carry the current is
  costed with its CAPEX and its 30-year losses (OPEX), and the NPV-optimal
  one is recommended — the classic CAPEX-vs-OPEX trade-off
* switchgear   = grid-side bay in the existing TSO/DSO substation, or a
  Stichanschluss (T-tap, n-0 — no loop-in/loop-out) when tapping a line
* customer side = step-up/down transformer(s) + customer switchgear
* voltage drop at the point of connection and reactive compensation
  (cable charging -> shunt reactor; Q support -> STATCOM as an option)

All unit costs are indicative 2025 EUR price levels assembled from public
German sources (NEP 2025 unit-cost assumptions, BNetzA determinations, dena
distribution-grid studies, published DSO price sheets). Screening numbers
(±30 %), not binding quotes — the UI says so too.
"""
from __future__ import annotations

import math

from . import app_sample

# ── economics ────────────────────────────────────────────────────────────
DETOUR = 1.4                 # cable route length = air distance x 1.4
LOSS_EUR_MWH = 75.0          # value of cable losses
LIFE_YEARS = 30
DISCOUNT = 0.06
NPV_F = (1 - (1 + DISCOUNT) ** -LIFE_YEARS) / DISCOUNT   # ≈ 13.76
MAINT_CABLE = 0.004          # %/yr of cable CAPEX
MAINT_STATION = 0.010        # %/yr of station CAPEX

# ── technology presets: capacity factor drives the loss-load-factor ──────
# LLF = 0.2·CF + 0.8·CF²  (standard empirical loss-load-factor formula)
TECHS = {
    "solar":        dict(label="Solar PV",            cf=0.12, kind="gen"),
    "onwind":       dict(label="Onshore wind",        cf=0.28, kind="gen"),
    "bess":         dict(label="Battery storage",     cf=0.17, kind="both"),
    "electrolyser": dict(label="Electrolyser",        cf=0.55, kind="load"),
    "load":         dict(label="Large load / DC",     cf=0.75, kind="load"),
    "hybrid":       dict(label="Hybrid RE + BESS",    cf=0.35, kind="both"),
}

# ── cable catalog: 3-phase systems of single-core XLPE cable, buried ─────
# amp = ampacity per system (A, direct-buried, 1.5 K·m/W soil, 70 % LF)
# r   = AC resistance Ω/km at 90 °C · x = inductive reactance Ω/km
# c   = capacitance µF/km
# Cost split per km: supply = the cable itself (3 single cores), install =
# pulling, jointing, terminations, testing (per system). Earthworks (trench,
# civils, surfaces) are per TRENCH.
# 33 kV: MV export cable (36-kV-class Al XLPE, trefoil) — the default concept:
# the park exports at collector voltage, the step-up trafo sits at the POC.
# 110 kV: aluminium (NA2XS(FL)2Y type) · 220/380 kV: copper milliken
CABLES = {
    33: [
        dict(mm2=400,  mat="Al", amp=420, r=0.1020, x=0.110, c=0.25, supply=60_000,  install=40_000),
        dict(mm2=630,  mat="Al", amp=530, r=0.0632, x=0.104, c=0.30, supply=85_000,  install=45_000),
        dict(mm2=1000, mat="Al", amp=650, r=0.0405, x=0.098, c=0.35, supply=130_000, install=50_000),
    ],
    110: [
        dict(mm2=630,  mat="Al", amp=580,  r=0.0605, x=0.126, c=0.21, supply=120_000, install=90_000),
        dict(mm2=1000, mat="Al", amp=715,  r=0.0406, x=0.119, c=0.24, supply=190_000, install=100_000),
        dict(mm2=1600, mat="Al", amp=855,  r=0.0270, x=0.112, c=0.28, supply=330_000, install=120_000),
        dict(mm2=2500, mat="Al", amp=1000, r=0.0188, x=0.106, c=0.33, supply=520_000, install=140_000),
    ],
    220: [
        dict(mm2=1000, mat="Cu", amp=810,  r=0.0220, x=0.135, c=0.16, supply=800_000,   install=180_000),
        dict(mm2=1600, mat="Cu", amp=940,  r=0.0147, x=0.128, c=0.19, supply=1_150_000, install=200_000),
        dict(mm2=2500, mat="Cu", amp=1090, r=0.0112, x=0.121, c=0.22, supply=1_600_000, install=220_000),
    ],
    380: [
        dict(mm2=1600, mat="Cu", amp=1010, r=0.0147, x=0.130, c=0.15, supply=3_300_000, install=350_000),
        dict(mm2=2500, mat="Cu", amp=1210, r=0.0112, x=0.124, c=0.18, supply=4_300_000, install=380_000),
    ],
}
TRENCH_EUR_KM = {33: 120_000, 110: 350_000, 220: 550_000, 380: 900_000}  # earthworks per trench-km
SYS_PER_TRENCH = {33: 3, 110: 2, 220: 2, 380: 2}   # systems sharing one trench
MAX_SYSTEMS = {33: 6, 110: 4, 220: 4, 380: 4}
MV_KV = 33                                          # collector / export voltage
MV_SWGR_EUR = 500_000                               # MV switchgear at the project fence

# ── station unit costs (EUR) ─────────────────────────────────────────────
BAY = {110: 1_000_000, 220: 2_000_000, 380: 3_500_000}     # AIS bay, existing station
# Line taps are priced as a Stichanschluss (T-tap, n-0): tap structure /
# cable transition, disconnectors, protection adaptation on the tapped line.
# No loop-in/loop-out station.
STICH_TAP = {110: 400_000, 220: 900_000, 380: 1_500_000}
TAP_COMPOUND = 300_000       # small civil compound at the tap (trafo pad, fence, access)
CUST_SWGR = {110: 1_500_000, 220: 2_800_000, 380: 4_500_000}     # customer-side switchgear + civil
TRAFO_EUR_MVA = {110: 9_000, 220: 10_000, 380: 12_000}           # power transformer, installed
SHUNT_FIX, SHUNT_EUR_MVAR = 250_000, 20_000        # shunt reactor for cable charging
STATCOM_EUR_MVAR = 90_000                          # optional Q-support (not in totals)

ASSUMPTIONS = [
    f"Cable route = air distance × {DETOUR} (detour factor).",
    f"Losses valued at {LOSS_EUR_MWH:.0f} €/MWh · NPV over {LIFE_YEARS} yr at {DISCOUNT*100:.0f} %.",
    "Ampacities: direct-buried XLPE, 1.5 K·m/W soil, 70 % load factor; one trench carries 2 systems.",
    "Unit costs: indicative 2025 German price level (NEP/BNetzA/dena-style catalog), ±30 % screening accuracy.",
    "Default concept: 33 kV export cable, step-up transformer at the POC; the HV-cable-from-site variant is priced as the alternative.",
    "Grid-side bay assumes space in the existing substation; a line tap is priced as a Stichanschluss (T-tap, n-0) — no loop-in/loop-out station.",
    "Baukostenzuschuss (BKZ), grid studies beyond the lump sum, and permitting timelines are not included.",
]


# ── geometry helpers ─────────────────────────────────────────────────────
def _hav_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _nearest_on_segment(plat, plon, lat0, lon0, lat1, lon1):
    """Closest point on a line segment (equirectangular approx, fine <100 km)."""
    ky = 111.32
    kx = 111.32 * math.cos(math.radians(plat))
    ax, ay = (lon0 - plon) * kx, (lat0 - plat) * ky
    bx, by = (lon1 - plon) * kx, (lat1 - plat) * ky
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, -(ax * dx + ay * dy) / L2))
    cx, cy = ax + t * dx, ay + t * dy
    return (plat + cy / ky, plon + cx / kx, math.hypot(cx, cy))


# ── topology access ──────────────────────────────────────────────────────
def _topo(year=2025):
    return app_sample.grid_topology(year)


def _bus_by_id(topo, bus_id):
    for b in topo["buses"]:
        if str(b["bus"]) == str(bus_id):
            return b
    return None


def _line_by_id(topo, line_id):
    for ln in topo["lines"]:
        if str(ln["id"]) == str(line_id):
            return ln
    return None


def _bus_headroom_mva(topo, bus_id):
    """Proxy for how much the node can take: half the sum of incident line ratings."""
    s = sum(ln["s_nom"] for ln in topo["lines"]
            if ln["bus0"] == str(bus_id) or ln["bus1"] == str(bus_id))
    return s / 2.0


# ── the engine ───────────────────────────────────────────────────────────
def _size_cables(v_kv, s_mva, p_mw, q_mvar, route_km, cf, n1, mw):
    """Cost every workable cross-section; return options + recommended index."""
    i_req = s_mva * 1e3 / (math.sqrt(3) * v_kv)          # A
    llf = 0.2 * cf + 0.8 * cf * cf
    energy_mwh = mw * 8760 * cf                          # annual energy through the cable
    options = []
    for cab in CABLES[v_kv]:
        n = math.ceil(i_req / cab["amp"])
        if n1:
            n += 1                                        # spare system
        if n > MAX_SYSTEMS[v_kv]:
            continue
        trenches = math.ceil(n / SYS_PER_TRENCH[v_kv])
        supply_eur = route_km * cab["supply"] * n
        install_eur = route_km * cab["install"] * n
        civil_eur = route_km * TRENCH_EUR_KM[v_kv] * trenches
        capex = supply_eur + install_eur + civil_eur
        rating_sys = math.sqrt(3) * v_kv * cab["amp"] / 1e3          # MVA per system
        i_sys = i_req / n                                 # systems share the load
        peak_loss_mw = 3 * i_sys ** 2 * (cab["r"] * route_km) * n / 1e6
        loss_mwh = peak_loss_mw * 8760 * llf
        loss_eur = loss_mwh * LOSS_EUR_MWH
        maint_eur = capex * MAINT_CABLE
        npv = capex + NPV_F * (loss_eur + maint_eur)
        r_eff = cab["r"] * route_km / n
        x_eff = cab["x"] * route_km / n
        du_pct = 100 * (p_mw * r_eff + q_mvar * x_eff) / (v_kv ** 2)
        qc_mvar = 2 * math.pi * 50 * cab["c"] * 1e-6 * (v_kv * 1e3) ** 2 / 1e6 * route_km * n
        options.append(dict(
            mm2=cab["mm2"], mat=cab["mat"], amp=cab["amp"], systems=n,
            rating_mva_sys=round(rating_sys, 1),
            rating_mva=round(rating_sys * n, 1),
            load_pct=round(100 * i_sys / cab["amp"], 1),
            supply_eur=round(supply_eur), install_eur=round(install_eur),
            civil_eur=round(civil_eur), trenches=trenches,
            capex=round(capex), loss_mwh_yr=round(loss_mwh, 1),
            loss_pct=round(100 * loss_mwh / energy_mwh, 2) if energy_mwh else 0.0,
            loss_eur_yr=round(loss_eur), maint_eur_yr=round(maint_eur),
            opex_eur_yr=round(loss_eur + maint_eur),
            npv=round(npv), du_pct=round(du_pct, 2), qc_mvar=round(qc_mvar, 2),
        ))
    if not options:
        return [], None, i_req
    ok = [o for o in options if o["du_pct"] <= 5.0] or options
    rec = min(ok, key=lambda o: o["npv"])
    for o in options:
        o["recommended"] = o is rec
    return options, rec, i_req


def _evaluate(prj, target, topo, with_alt=True):
    """Full cost card for one project→target connection. `target` is a dict:
    {type:'bus'|'line', obj: bus-or-line dict, tap:(lat,lon) for lines}.

    Two connection concepts:
      'mv' (default) — the project exports at 33 kV collector voltage; the
            step-up transformer sits at the POC (grid substation / tie-off).
      'hv' — transformer at the project site, HV cable to the POC.
    The other concept is always priced too and returned as `alternative`."""
    concept = prj.get("concept", "mv")
    tech = TECHS[prj["tech"]]
    pf = max(0.80, min(1.0, prj["pf"]))
    s_mva = prj["mw"] / pf
    q_mvar = prj["mw"] * math.tan(math.acos(pf))

    if target["type"] == "bus":
        b = target["obj"]
        v_kv = int(b["v"])
        tlat, tlon = b["lat"], b["lon"]
        tname = b.get("name") or f"Bus {b['bus']}"
        tid = str(b["bus"])
    else:
        ln = target["obj"]
        v_kv = int(ln["v"])
        tlat, tlon = target["tap"]
        tname = f"Tap on line {ln['id']} ({v_kv} kV)"
        tid = str(ln["id"])

    if v_kv not in CABLES:
        return None
    air_km = _hav_km(prj["lat"], prj["lon"], tlat, tlon)
    route_km = max(air_km * DETOUR, 0.2)

    cable_kv = MV_KV if concept == "mv" else v_kv
    cables, rec, i_req = _size_cables(cable_kv, s_mva, prj["mw"], q_mvar,
                                      route_km, tech["cf"], prj["n1"], prj["mw"])
    if rec is None:
        if concept == "mv" and with_alt:
            # 33 kV can't carry it over this distance — fall back to the HV concept
            out = _evaluate({**prj, "concept": "hv"}, target, topo, with_alt=False)
            if out:
                out["flags"].insert(0, f"A {MV_KV} kV export would need more than "
                    f"{MAX_SYSTEMS[MV_KV]} cable systems here — priced as an HV cable "
                    "with the transformer at the project site instead.")
            return out
        return None

    # ── stations ──
    items = []
    if target["type"] == "bus":
        items.append(("Grid-side bay (existing substation)", BAY[v_kv]))
    else:
        items.append((f"Stichanschluss: T-tap, disconnectors, protection (n-0)", STICH_TAP[v_kv]))
        if concept == "mv":
            items.append(("Tap compound: trafo pad, fence, access", TAP_COMPOUND))
    trafo_mva = s_mva * (1.2 if prj["n1"] else 1.0)       # n-1: 2 units at 60 %
    trafo_n = (f"2× {trafo_mva/2:.0f} MVA transformers (n-1)"
               if prj["n1"] else f"{trafo_mva:.0f} MVA transformer")
    if concept == "mv":
        items.append((f"{trafo_n} {MV_KV}/{v_kv} kV at the POC",
                      max(600_000, trafo_mva * TRAFO_EUR_MVA[v_kv])))
        items.append(("MV switchgear at the project fence", MV_SWGR_EUR))
    else:
        items.append((f"{trafo_n} {MV_KV}/{v_kv} kV at the project site",
                      max(600_000, trafo_mva * TRAFO_EUR_MVA[v_kv])))
        items.append((f"Customer {v_kv} kV switchgear + civil works at site", CUST_SWGR[v_kv]))
    items.append(("Protection, SCADA, grid study (lump)", 300_000 + 0.02 * rec["capex"]))
    station_capex = sum(v for _, v in items)

    # ── compensation ──
    comp_items, comp_capex = [], 0.0
    qc = rec["qc_mvar"]
    if qc > 0.10 * s_mva:
        mvar = math.ceil(qc)
        cost = SHUNT_FIX + SHUNT_EUR_MVAR * mvar
        comp_items.append(dict(name=f"Shunt reactor {mvar} Mvar (cable charging)",
                               eur=round(cost), included=True,
                               why=f"The cable generates {qc:.1f} Mvar — "
                                   f"{100*qc/s_mva:.0f} % of the connection rating."))
        comp_capex += cost
    if tech["kind"] in ("gen", "both") and rec["du_pct"] > 3.0:
        mvar = math.ceil(0.3 * prj["mw"])
        comp_items.append(dict(name=f"STATCOM ±{mvar} Mvar (voltage support)",
                               eur=round(mvar * STATCOM_EUR_MVAR), included=False,
                               why=f"Voltage drop {rec['du_pct']:.1f} % > 3 % — dynamic "
                                   "Q support may be required to hold the ±0.95 band."))

    # ── totals ──
    capex = rec["capex"] + station_capex + comp_capex
    opex_yr = rec["loss_eur_yr"] + rec["maint_eur_yr"] + MAINT_STATION * (station_capex + comp_capex)
    npv25 = capex + NPV_F * opex_yr

    # ── flags ──
    flags = []
    if target["type"] == "line":
        flags.append("Stichanschluss is n-0: a fault or maintenance outage on the tapped "
                     "line disconnects the project for the duration.")
        if prj["n1"]:
            flags.append("N-1 is selected, but a Stichanschluss stays n-0 on the line side — "
                         "the spare only covers your cable and transformer.")
    if target["type"] == "line" and s_mva > 0.4 * (target["obj"]["s_nom"] or 1e9):
        flags.append(f"Project needs {s_mva:.0f} MVA but the tapped line is rated "
                     f"{target['obj']['s_nom']:.0f} MVA — the operator will likely refuse a "
                     "Stich this size and require a full loop-in (not priced here).")
    if target["type"] == "bus":
        hr = _bus_headroom_mva(topo, tid)
        if hr and s_mva > 0.5 * hr:
            flags.append(f"Connection rating {s_mva:.0f} MVA vs ~{hr:.0f} MVA node headroom proxy "
                         "(½ of incident line ratings) — expect a connection study / possible refusal.")
    if concept == "mv" and route_km > 15:
        flags.append(f"~{route_km:.0f} km at {MV_KV} kV bleeds losses and copper — compare "
                     "the HV-cable alternative below.")
    if cable_kv == 110 and route_km > 25:
        flags.append("Over ~25 km of 110 kV cable a 220/380 kV connection or an on-site "
                     "collector station is usually cheaper per MW.")
    if cable_kv >= 220:
        flags.append(f"{cable_kv} kV underground cable is priced here; an overhead line, where "
                     "permittable, costs roughly a third.")
    if rec["du_pct"] > 5:
        flags.append(f"Voltage drop {rec['du_pct']:.1f} % is above the usual 5 % planning limit — "
                     "consider more/larger cable systems or a higher voltage level.")

    # price the other concept too, so the user sees what the choice costs
    alternative = None
    if with_alt:
        other = "hv" if concept == "mv" else "mv"
        alt = _evaluate({**prj, "concept": other}, target, topo, with_alt=False)
        if alt:
            ar = alt["cable"]["recommended"]
            alternative = dict(concept=other, capex=alt["totals"]["capex"],
                               npv30=alt["totals"]["npv30"],
                               cable=f"{ar['systems']}× {ar['mm2']} mm² @ {alt['cable']['v_kv']} kV")

    return dict(
        concept=concept,
        alternative=alternative,
        target=dict(type=target["type"], id=tid, name=tname, v_kv=v_kv,
                    lat=tlat, lon=tlon),
        route=dict(air_km=round(air_km, 2), factor=DETOUR,
                   route_km=round(route_km, 2),
                   path=[[prj["lat"], prj["lon"]], [tlat, tlon]]),
        current_a=round(i_req),
        s_mva=round(s_mva, 1), q_mvar=round(q_mvar, 1),
        cable=dict(v_kv=cable_kv, options=cables, recommended=rec),
        station=dict(items=[dict(name=n, eur=round(v)) for n, v in items],
                     total=round(station_capex)),
        compensation=dict(items=comp_items, qc_mvar=qc,
                          total_included=round(comp_capex)),
        opex=dict(losses_eur_yr=rec["loss_eur_yr"],
                  maint_eur_yr=round(rec["maint_eur_yr"] + MAINT_STATION * (station_capex + comp_capex)),
                  total_eur_yr=round(opex_yr)),
        totals=dict(capex=round(capex), opex_yr=round(opex_yr),
                    npv30=round(npv25),
                    eur_per_mw=round(capex / prj["mw"]),
                    npv_per_mw=round(npv25 / prj["mw"])),
        econ=dict(years=LIFE_YEARS, discount=DISCOUNT, loss_eur_mwh=LOSS_EUR_MWH),
        flags=flags,
    )


def _prj_dict(req):
    return dict(lat=req.lat, lon=req.lon, tech=req.tech, mw=req.mw,
                pf=req.pf, n1=req.n1, voltage=req.voltage,
                concept=getattr(req, "concept", "mv"))


def estimate(req):
    """Cost card for one explicit target (clicked substation or line)."""
    topo = _topo(req.year)
    prj = _prj_dict(req)
    if req.target_type == "bus":
        b = _bus_by_id(topo, req.target_id)
        if not b:
            raise ValueError(f"bus {req.target_id} not found")
        target = dict(type="bus", obj=b)
    else:
        ln = _line_by_id(topo, req.target_id)
        if not ln:
            raise ValueError(f"line {req.target_id} not found")
        # tap where the user clicked (snapped onto the segment); only without
        # click coords fall back to the point nearest the project — projecting
        # the project instead would clamp to a line END whenever the
        # perpendicular foot lies outside the segment
        ref_lat = req.click_lat if req.click_lat is not None else prj["lat"]
        ref_lon = req.click_lon if req.click_lon is not None else prj["lon"]
        lat, lon, _ = _nearest_on_segment(ref_lat, ref_lon,
                                          ln["y0"], ln["x0"], ln["y1"], ln["x1"])
        target = dict(type="line", obj=ln, tap=(lat, lon))
    out = _evaluate(prj, target, topo)
    if out is None:
        raise ValueError(f"no cable catalog for {req.target_type} voltage level")
    out["assumptions"] = ASSUMPTIONS
    return out


# ── co-location: two technologies behind one transformer ─────────────────
# Regional hourly capacity-factor curves (ERA5 grid cell, eGon fallback —
# the same source the BESS tools use) drive an 8760-h sweep: for each size of
# the second technology, how much of its energy the shared export limit
# (trafo MVA × cos φ) would curtail. Complementary profiles (wind vs PV) let
# a lot of extra MW ride on the same connection almost for free.
COLO_CURVES = {"solar": ("pv", ("solar",)), "onwind": ("wind", ("onwind", "offwind"))}
COLO_THRESHOLDS = [0.01, 0.05, 0.10]
MONTH_H = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]  # days; 2025 non-leap


def _re_curve(lon, lat, tech):
    """Regional hourly p.u. curve (8760) for a curve technology + its source."""
    import numpy as np
    from . import bess_runner as BR
    kind, carriers = COLO_CURVES[tech]
    p = BR._era5_profile(lon, lat, kind)
    if p is not None:
        return np.asarray(p, dtype=float), "ERA5 regional weather (2025)"
    return (np.asarray(BR._egon_profile(lon, lat, 25.0, carriers), dtype=float),
            "eGon generator time series (nearest units)")


def colocation(req):
    import numpy as np
    if req.tech2 not in COLO_CURVES:
        raise ValueError(f"secondary technology must be one of {list(COLO_CURVES)}")
    pf = max(0.80, min(1.0, req.pf))
    if req.trafo_mva <= 0:
        raise ValueError("transformer size must be positive")
    p_lim = req.trafo_mva * pf                       # MW export limit at the POC
    n = 8760

    c2, src2 = _re_curve(req.lon, req.lat, req.tech2)
    if len(c2) < n or not c2.any():
        raise ValueError("no regional profile available at this location")
    c2 = c2[:n]

    # primary baseline flow through the transformer (MW, + = export)
    notes = []
    c1 = None
    if req.tech in COLO_CURVES:
        c1, _ = _re_curve(req.lon, req.lat, req.tech)
        c1 = c1[:n]
        base = req.mw * c1
    elif req.tech == "hybrid":
        w, _ = _re_curve(req.lon, req.lat, "onwind")
        s, _ = _re_curve(req.lon, req.lat, "solar")
        c1 = 0.5 * (w[:n] + s[:n])
        base = req.mw * c1
        notes.append("Hybrid primary approximated as 50 % wind + 50 % solar; "
                     "its battery half is ignored here.")
    elif req.tech == "bess":
        base = np.zeros(n)
        notes.append("The battery is assumed to defer to the generator — it charges on "
                     "surplus and discharges into spare transformer capacity, so it adds "
                     "no curtailment of its own.")
    else:  # electrolyser, load
        cf = TECHS[req.tech]["cf"]
        base = np.full(n, -req.mw * cf)
        notes.append(f"{TECHS[req.tech]['label']} modeled as a flat draw of "
                     f"{cf*100:.0f} % of its {req.mw:.0f} MW — on-site consumption nets "
                     "against the generator before the transformer.")

    base_curt = float(np.clip(base - p_lim, 0, None).sum())
    if base_curt > 0:
        notes.append(f"The primary alone already curtails "
                     f"{base_curt/1e3:.1f} GWh/yr at this transformer size.")

    def util(flow):
        return float(np.abs(np.clip(flow, -p_lim, p_lim)).mean()) / p_lim

    # sweep the secondary size; curtailment beyond the primary's own is attributed to it
    mw2s = np.linspace(0.0, 3.0 * p_lim, 61)[1:]
    comb = base[None, :] + np.outer(mw2s, c2)
    over = np.clip(comb - p_lim, 0, None)
    add_curt = over.sum(axis=1) - base_curt          # MWh/yr caused by the secondary
    pot2 = mw2s * c2.sum()                           # MWh/yr the secondary could make
    pct = add_curt / pot2
    utils = np.abs(np.clip(comb, -p_lim, p_lim)).mean(axis=1) / p_lim
    curt_h = (over > 1e-9).sum(axis=1)

    def stats_at(mw2):
        flow = base + mw2 * c2
        o = np.clip(flow - p_lim, 0, None)
        ac = float(o.sum()) - base_curt
        p2 = mw2 * float(c2.sum())
        return dict(mw2=round(float(mw2), 1),
                    curt_pct=round(100 * ac / p2, 2) if p2 else 0.0,
                    curt_gwh=round(ac / 1e3, 2),
                    added_gwh=round((p2 - ac) / 1e3, 1),
                    curt_h=int((o > 1e-9).sum()),
                    util_pct=round(100 * util(flow), 1))

    sizes = {}
    for thr in COLO_THRESHOLDS:
        idx = np.where(pct <= thr)[0]
        if len(idx) == 0:
            continue
        i = int(idx[-1])
        if i == len(mw2s) - 1:
            mw2 = float(mw2s[-1])                    # threshold never reached in the sweep
        else:
            p0, p1, x0, x1 = pct[i], pct[i + 1], mw2s[i], mw2s[i + 1]
            mw2 = float(x0 if p1 <= p0 else x0 + (thr - p0) * (x1 - x0) / (p1 - p0))
        sizes[f"p{int(thr*100)}"] = stats_at(mw2)

    # response curve, trimmed shortly past 30 % — beyond that nobody builds
    keep = int(np.searchsorted(pct, 0.30)) + 2
    curve = [dict(mw2=round(float(m), 1), curt_pct=round(100 * p, 2),
                  added_gwh=round((q - a) / 1e3, 1), util_pct=round(100 * u, 1))
             for m, p, a, q, u in zip(mw2s[:keep], pct[:keep], add_curt[:keep],
                                      pot2[:keep], utils[:keep])]

    # reference size for the charts: the ≤5 % point (or the largest size found)
    ref = sizes.get("p5") or sizes.get("p10") or sizes.get("p1")
    ref_mw2 = ref["mw2"] if ref else float(mw2s[len(mw2s) // 3])
    sec = ref_mw2 * c2
    exported = np.clip(base + sec, 0, p_lim)
    prim_exp = np.clip(np.minimum(base, p_lim), 0, None)
    sec_exp = np.clip(exported - prim_exp, 0, None)
    edges = np.cumsum([0] + [d * 24 for d in MONTH_H])
    monthly = dict(
        primary_gwh=[round(float(prim_exp[a:b].sum()) / 1e3, 2)
                     for a, b in zip(edges[:-1], edges[1:])],
        secondary_gwh=[round(float(sec_exp[a:b].sum()) / 1e3, 2)
                       for a, b in zip(edges[:-1], edges[1:])],
        limit_gwh=[round(p_lim * d * 24 / 1e3, 2) for d in MONTH_H])
    avg_day = dict(
        primary_mw=[round(float(v), 1) for v in base.reshape(365, 24).mean(axis=0)],
        secondary_mw=[round(float(v), 1) for v in sec.reshape(365, 24).mean(axis=0)],
        limit_mw=round(p_lim, 1))

    return dict(
        trafo_mva=req.trafo_mva, p_exp_mw=round(p_lim, 1), pf=pf,
        primary=dict(tech=req.tech, label=TECHS[req.tech]["label"], mw=req.mw,
                     cf=round(float(c1.mean()), 3) if c1 is not None else None,
                     gwh=round(float(np.clip(base, 0, None).sum()) / 1e3, 1),
                     curt_gwh=round(base_curt / 1e3, 2),
                     util_pct=round(100 * util(base), 1)),
        secondary=dict(tech=req.tech2, label=TECHS[req.tech2]["label"],
                       cf=round(float(c2.mean()), 3), source=src2),
        corr=round(float(np.corrcoef(c1, c2)[0, 1]), 2) if c1 is not None else None,
        curve=curve, sizes=sizes, ref_mw2=round(ref_mw2, 1),
        monthly=monthly, avg_day=avg_day, notes=notes)


def best3(req):
    """Rank every plausible nearby connection and return the top 3 by 30-yr NPV.
    Candidates: the nearest substations at the requested voltage plus, for the
    same voltage, taps into the nearest line segments."""
    topo = _topo(req.year)
    prj = _prj_dict(req)
    v = int(req.voltage)

    cand = []
    buses = [(b, _hav_km(prj["lat"], prj["lon"], b["lat"], b["lon"]))
             for b in topo["buses"] if int(b["v"]) == v]
    buses.sort(key=lambda t: t[1])
    for b, d in buses[:15]:
        cand.append(dict(type="bus", obj=b))

    lines = []
    for ln in topo["lines"]:
        if int(ln["v"]) != v or not ln["s_nom"]:
            continue
        lat, lon, d = _nearest_on_segment(prj["lat"], prj["lon"],
                                          ln["y0"], ln["x0"], ln["y1"], ln["x1"])
        lines.append((ln, lat, lon, d))
    lines.sort(key=lambda t: t[3])
    for ln, lat, lon, d in lines[:10]:
        cand.append(dict(type="line", obj=ln, tap=(lat, lon)))

    evaluated = []
    for c in cand:
        try:
            e = _evaluate(prj, c, topo)
        except Exception:
            e = None
        if e:
            evaluated.append(e)
    evaluated.sort(key=lambda e: e["totals"]["npv30"])

    # de-duplicate: a tap right next to an already-listed substation adds nothing
    top, seen = [], []
    for e in evaluated:
        key = (round(e["target"]["lat"], 3), round(e["target"]["lon"], 3))
        if key in seen:
            continue
        seen.append(key)
        top.append(e)
        if len(top) == 3:
            break
    for i, e in enumerate(top):
        e["rank"] = i + 1
    return dict(options=top, evaluated=len(evaluated), assumptions=ASSUMPTIONS)
