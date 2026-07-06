"""BESS one-year market-dispatch simulator for a single substation.

Faithful Python port of scripts/bess_excel/modBESS.bas (the VBA behind
BESS_Dispatch_2025.xlsm): day-ahead + intraday arbitrage with TSO ramp limits and
FCR / aFRR capacity value-stacking, on the real 2025 SMARD + regelleistung prices.

On top of the Excel model this adds a location-specific Flexible Connection
Agreement (FCA) layer: per-hour power upper limits ("Betriebsfenster") that can be
fixed by time-of-day and/or tightened dynamically when the wind feed-in *near this
bus* is high. The simulation is run twice (firm connection vs. FCA-constrained) so
the revenue gained/lost — and why — is reported per substation.

Pure Python, 8760 h, runs in well under a second -> served synchronously.
"""
from __future__ import annotations

import functools
import json
import math
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np
from sqlalchemy import text

from ..db import SCN, get_engine

N_HOURS = 8760
_RESULTS = Path(__file__).resolve().parents[3] / "results"
DA_CACHE = _RESULTS / ".smard_cache_2025_v2.json"
ID_CACHE = _RESULTS / ".intraday_cache_2025.json"
BAL_CACHE = _RESULTS / ".balancing_cache_2025.json"


# ─────────────────────────────────────────────────────────────────────────────
#  Prices (loaded once, carry-forward gaps exactly like build_workbook.load_prices)
# ─────────────────────────────────────────────────────────────────────────────
# 2027 market case, applied to ALL BESS dispatch features (Analysis scan + per-node
# popup): 2025 SMARD hourly SHAPES with reserve price LEVELS scaled for the 2026-29
# ancillary saturation (Aurora European BESS outlook, Rabobank, Modo) — FCR −50 %,
# aFRR capacity −40 %. Wholesale DA/ID spreads stay at 2025 levels (the merchant
# decline to 2027 comes from the ancillary side, not the spreads).
SCEN_2027 = dict(fcr=0.50, afrr_cap=0.60)


@functools.lru_cache(maxsize=1)
def _load_prices() -> dict:
    da = json.loads(DA_CACHE.read_text())["price"]
    idd = json.loads(ID_CACHE.read_text())["intraday"]
    bal = json.loads(BAL_CACHE.read_text())

    idx = da["index"]
    dav, idv = da["values"], idd["values"]
    fcr, acp, acn = bal["fcr"], bal["afrr_cap_pos"], bal["afrr_cap_neg"]

    da_a = np.zeros(N_HOURS); id_a = np.zeros(N_HOURS)
    fcr_a = np.zeros(N_HOURS); acp_a = np.zeros(N_HOURS); acn_a = np.zeros(N_HOURS)
    last_da = last_id = 0.0
    for i in range(N_HOURS):
        d = dav[i] if dav[i] is not None else last_da
        v = idv[i] if idv[i] is not None else last_id
        last_da, last_id = d, v
        da_a[i] = float(d); id_a[i] = float(v)
        fcr_a[i] = float(fcr[i]); acp_a[i] = float(acp[i]); acn_a[i] = float(acn[i])
    return {
        "index": idx, "da": da_a, "id": id_a,
        "fcr": fcr_a * SCEN_2027["fcr"],
        "afrr_cap_pos": acp_a * SCEN_2027["afrr_cap"],
        "afrr_cap_neg": acn_a * SCEN_2027["afrr_cap"],
    }


@functools.lru_cache(maxsize=1)
def _month_of_hour() -> np.ndarray:
    """Month number (1..12) for each of the 8760 hours, from the price index."""
    idx = _load_prices()["index"]
    base = datetime(2025, 1, 1).toordinal()
    out = np.empty(N_HOURS, dtype=np.int64)
    for i in range(N_HOURS):
        try:
            out[i] = datetime.fromisoformat(idx[i].replace("Z", "+00:00")).month
        except Exception:
            out[i] = datetime.fromordinal(base + i // 24).month
    return out


# ─────────────────────────────────────────────────────────────────────────────
#  Regional wind & PV feed-in within a radius of the bus (drives the FCA bands)
#
#  Per the SH Netz HV technical spec, the rule-based power band is built from the
#  wind and ground-mounted PV installations within a 25 km radius of the storage
#  site. Each is expressed as feed-in relative to its *rated* power (p_max_pu).
# ─────────────────────────────────────────────────────────────────────────────
def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    R = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1); dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _haversine_vec(lat0, lon0, lat, lon):
    R = 6371.0
    p0 = math.radians(lat0)
    p = np.radians(lat); dp = np.radians(lat - lat0); dl = np.radians(lon - lon0)
    a = np.sin(dp / 2) ** 2 + math.cos(p0) * np.cos(p) * np.sin(dl / 2) ** 2
    return 2 * R * np.arcsin(np.sqrt(a))


# Real standalone installations from MaStR (the official registry): utility-scale
# ground-mounted PV parks (≥750 kW net, i.e. NOT aggregated rooftop) and wind units.
# Loaded once into memory as (lat, lon, MW) arrays for fast per-bus radius lookups.
GROUND_PV_MIN_KW = 750.0


@functools.lru_cache(maxsize=1)
def _mastr_units() -> dict:
    eng = get_engine()
    out = {}
    specs = [("pv", "solar_extended", f' AND "Nettonennleistung" >= {GROUND_PV_MIN_KW}'),
             ("wind", "wind_extended", "")]
    with eng.connect() as c:
        for key, tbl, extra in specs:
            rows = c.execute(text(
                f'SELECT "Breitengrad", "Laengengrad", "Nettonennleistung" '
                f'FROM mastr.{tbl} WHERE "EinheitBetriebsstatus" = \'In Betrieb\' '
                f'AND "Breitengrad" IS NOT NULL AND "Laengengrad" IS NOT NULL{extra}'
            )).fetchall()
            a = np.asarray(rows, dtype=float) if rows else np.zeros((0, 3))
            out[key] = ((a[:, 0], a[:, 1], a[:, 2] / 1000.0) if len(a)
                        else (np.zeros(0), np.zeros(0), np.zeros(0)))
    return out


def _egon_profile(lon: float, lat: float, radius_km: float, carriers: tuple) -> np.ndarray:
    """Capacity-weighted mean p_max_pu (% of rated output, 0..1) of eGon generators of
    the given carriers within radius_km — the weather profile shape. Falls back to the
    single nearest generator if none lie inside the radius."""
    eng = get_engine()
    dlat = radius_km / 111.0
    dlon = radius_km / (111.0 * max(0.2, math.cos(math.radians(lat))))
    with eng.connect() as c:
        rows = c.execute(text("""
            SELECT wb.x, wb.y, g.p_nom, t.p_max_pu
            FROM grid.egon_etrago_generator g
            JOIN grid.egon_etrago_bus wb ON wb.bus_id = g.bus AND wb.scn_name = g.scn_name
            JOIN grid.egon_etrago_generator_timeseries t
              ON t.generator_id = g.generator_id AND t.scn_name = g.scn_name
            WHERE g.scn_name = :s AND g.carrier = ANY(:cs) AND t.p_max_pu IS NOT NULL
              AND wb.x BETWEEN :xmin AND :xmax AND wb.y BETWEEN :ymin AND :ymax
        """), {"s": SCN, "cs": list(carriers), "xmin": lon - dlon, "xmax": lon + dlon,
               "ymin": lat - dlat, "ymax": lat + dlat}).fetchall()
        acc = np.zeros(N_HOURS); w = 0.0
        for gx, gy, p_nom, prof in rows:
            if prof is None or len(prof) < N_HOURS:
                continue
            if _haversine_km(lat, lon, float(gy), float(gx)) > radius_km:
                continue
            ww = float(p_nom or 0.0) or 1.0
            acc += ww * np.asarray(prof[:N_HOURS], dtype=float); w += ww
        if w > 0:
            return np.clip(acc / w, 0, 1)
        # fallback: nearest single generator of these carriers
        r = c.execute(text("""
            SELECT t.p_max_pu FROM grid.egon_etrago_generator g
            JOIN grid.egon_etrago_bus wb ON wb.bus_id = g.bus AND wb.scn_name = g.scn_name
            JOIN grid.egon_etrago_generator_timeseries t
              ON t.generator_id = g.generator_id AND t.scn_name = g.scn_name
            WHERE g.scn_name = :s AND g.carrier = ANY(:cs) AND t.p_max_pu IS NOT NULL
            ORDER BY ((wb.x - :lon)*(wb.x - :lon) + (wb.y - :lat)*(wb.y - :lat)) ASC LIMIT 1
        """), {"s": SCN, "cs": list(carriers), "lon": lon, "lat": lat}).fetchone()
    if r and r[0]:
        return np.clip(np.asarray(r[0][:N_HOURS], dtype=float), 0, 1)
    return np.zeros(N_HOURS)


ERA5_CACHE = _RESULTS / "era5_cf_2025.npz"


@functools.lru_cache(maxsize=1)
def _era5_cf():
    """ERA5-derived wind & PV capacity-factor grid (true per-region timing). None if
    the cache hasn't been built (scripts/pipeline/build_era5_cf.py)."""
    if not ERA5_CACHE.exists():
        return None
    d = np.load(ERA5_CACHE)
    return dict(lats=d["lats"], lons=d["lons"],
                wind=d["wind_cf"].astype(float), pv=d["pv_cf"].astype(float))


def _era5_profile(lon: float, lat: float, kind: str):
    """Nearest ERA5 grid cell's hourly capacity factor (0..1) for 'wind' or 'pv'."""
    c = _era5_cf()
    if c is None:
        return None
    i = int(np.argmin((c["lats"] - lat) ** 2 + (c["lons"] - lon) ** 2))
    return np.clip((c["wind"] if kind == "wind" else c["pv"])[i], 0.0, 1.0)


@functools.lru_cache(maxsize=512)
def regional_re_index(bus_id: str, radius_km: float = 25.0) -> tuple:
    """Standalone wind + ground-mounted PV exposure within radius_km of the bus.
    Presence & capacity come from real MaStR installations (rooftop PV excluded);
    the % output profile shape comes from the local eGon weather time series.
    Returns (wind_frac[8760], pv_frac[8760], wind_mw, pv_mw)."""
    eng = get_engine()
    with eng.connect() as c:
        row = c.execute(text(
            "SELECT x, y FROM grid.egon_etrago_bus WHERE bus_id=:b AND scn_name=:s"
        ), {"b": int(bus_id), "s": SCN}).fetchone()
    if not row or row[0] is None or row[1] is None:
        return (np.zeros(N_HOURS), np.zeros(N_HOURS), 0.0, 0.0)
    lon, lat = float(row[0]), float(row[1])

    M = _mastr_units()

    def near_mw(key):
        la, lo, mw = M[key]
        if len(la) == 0:
            return 0.0
        d = _haversine_vec(lat, lon, la, lo)
        return float(mw[d <= radius_km].sum())

    wind_mw = near_mw("wind"); pv_mw = near_mw("pv")

    # profile SHAPE from ERA5 (real per-region weather timing); eGon as fallback
    def _profile(kind, carriers):
        p = _era5_profile(lon, lat, kind)
        return p if p is not None else _egon_profile(lon, lat, radius_km, carriers)

    wind_frac = _profile("wind", ("onwind", "offwind")) if wind_mw > 0 else np.zeros(N_HOURS)
    pv_frac = _profile("pv", ("solar",)) if pv_mw > 0 else np.zeros(N_HOURS)
    return (wind_frac, pv_frac, wind_mw, pv_mw)


# ─────────────────────────────────────────────────────────────────────────────
#  Parameter resolution (mirrors the gather + reserve-allocation block of the VBA)
# ─────────────────────────────────────────────────────────────────────────────
# 2027-case battery: 100 MW / 400 MWh, market-sized reserve bids (5 MW FCR,
# 15 MW aFRR each way — what the saturating 2027 reserve markets can absorb).
DEFAULTS = dict(
    power_charge=100.0, power_discharge=100.0, energy_capacity=400.0,
    rt_efficiency=86.0, soc_min=5.0, soc_max=100.0,
    ramp_rate=10.0, apply_ramp_loss=True, use_intraday=True, max_cycles_day=2.0,
    degradation_cost=3.0, grid_cost_charge=0.0, grid_cost_discharge=0.0,
    enable_fcr=True, fcr_mw=5.0, enable_afrr=True, afrr_pos_mw=15.0, afrr_neg_mw=15.0,
    fcr_buffer_h=0.25, afrr_reserve_h=1.0, afrr_act_pos=10.0, afrr_act_neg=10.0,
    afrr_energy_margin=30.0,
)


def _resolve(p: dict) -> dict:
    g = {**DEFAULTS, **(p or {})}
    Pc = float(g["power_charge"]); Pd = float(g["power_discharge"])
    Ecap = float(g["energy_capacity"]); etaRT = float(g["rt_efficiency"]) / 100.0
    socMin = float(g["soc_min"]) / 100.0; socMax = float(g["soc_max"]) / 100.0
    ramp = float(g["ramp_rate"])
    maxCyc = max(1.0, float(g["max_cycles_day"]))

    fcrMW = float(g["fcr_mw"]) if g["enable_fcr"] else 0.0
    aPosMW = float(g["afrr_pos_mw"]) if g["enable_afrr"] else 0.0
    aNegMW = float(g["afrr_neg_mw"]) if g["enable_afrr"] else 0.0
    fcrMW = max(0.0, fcrMW); aPosMW = max(0.0, aPosMW); aNegMW = max(0.0, aNegMW)
    fcrMW = min(fcrMW, min(Pc, Pd))
    if fcrMW + aPosMW > Pd:
        aPosMW = Pd - fcrMW
    if fcrMW + aNegMW > Pc:
        aNegMW = Pc - fcrMW
    aPosMW = max(0.0, aPosMW); aNegMW = max(0.0, aNegMW)

    etaC = etaD = math.sqrt(etaRT) if etaRT > 0 else 0.0
    eMin = socMin * Ecap; eMax = socMax * Ecap

    PdA = max(0.0, Pd - fcrMW - aPosMW)
    PcA = max(0.0, Pc - fcrMW - aNegMW)
    eMinA = eMin + fcrMW * float(g["fcr_buffer_h"]) + aPosMW * float(g["afrr_reserve_h"])
    eMaxA = eMax - fcrMW * float(g["fcr_buffer_h"]) - aNegMW * float(g["afrr_reserve_h"])
    if eMaxA <= eMinA:
        eMinA = (eMin + eMax) / 2.0; eMaxA = eMinA; PcA = 0.0; PdA = 0.0

    tRamp = (100.0 / ramp) if ramp > 0 else 0.0
    lossFrac = 0.5 * (tRamp / 60.0) if g["apply_ramp_loss"] else 0.0
    lossFrac = min(lossFrac, 0.5)

    return dict(
        Pc=Pc, Pd=Pd, Ecap=Ecap, etaRT=etaRT, etaC=etaC, etaD=etaD,
        eMin=eMin, eMax=eMax, eMinA=eMinA, eMaxA=eMaxA, PcA=PcA, PdA=PdA,
        maxCyc=maxCyc, lossFrac=lossFrac,
        useID=bool(g["use_intraday"]),
        degr=float(g["degradation_cost"]),
        gcCh=float(g["grid_cost_charge"]), gcDis=float(g["grid_cost_discharge"]),
        fcrMW=fcrMW, aPosMW=aPosMW, aNegMW=aNegMW,
        actPos=float(g["afrr_act_pos"]) / 100.0, actNeg=float(g["afrr_act_neg"]) / 100.0,
        enMargin=float(g["afrr_energy_margin"]),
    )


# ─────────────────────────────────────────────────────────────────────────────
#  Core dispatch — direct port of RunCore's day loop (with per-hour power caps)
# ─────────────────────────────────────────────────────────────────────────────
def _dispatch(R: dict, da: np.ndarray, id_: np.ndarray,
              cap_charge: Optional[np.ndarray] = None,
              cap_discharge: Optional[np.ndarray] = None) -> dict:
    """Returns per-hour arrays (buy, sell, power, soc, cashflow, throughput) and totals.
    cap_charge / cap_discharge are per-hour MW upper limits on arbitrage power
    (default = the reserve-net nameplate PcA / PdA). This is the FCA hook."""
    PcA, PdA = R["PcA"], R["PdA"]
    eMinA, eMaxA = R["eMinA"], R["eMaxA"]
    etaC, etaD, etaRT = R["etaC"], R["etaD"], R["etaRT"]
    degr, gcCh, gcDis = R["degr"], R["gcCh"], R["gcDis"]
    maxCyc, lossFrac, useID = R["maxCyc"], R["lossFrac"], R["useID"]

    cap_c = np.full(N_HOURS, PcA) if cap_charge is None else np.minimum(cap_charge, PcA)
    cap_d = np.full(N_HOURS, PdA) if cap_discharge is None else np.minimum(cap_discharge, PdA)

    buy_o = np.empty(N_HOURS); sell_o = np.empty(N_HOURS)
    power = np.zeros(N_HOURS); soc_o = np.zeros(N_HOURS)
    cashf = np.zeros(N_HOURS); thru_o = np.zeros(N_HOURS)
    mkt = np.zeros(N_HOURS, dtype=np.int8)  # 0=idle, 1=DA, 2=ID

    soc = eMinA
    prevPower = 0.0
    totChgMWh = totDisMWh = totThru = totCost = 0.0

    eDayBudget = (eMaxA - eMinA) * maxCyc     # MWh of charging the cycles allow per day

    for d in range(365):
        base = d * 24
        da_d = da[base:base + 24]
        id_d = id_[base:base + 24]
        if useID:
            buy = np.minimum(id_d, da_d)
            sell = np.maximum(id_d, da_d)
        else:
            buy = da_d.copy()
            sell = da_d.copy()

        is_chg = [False] * 24
        is_dis = [False] * 24
        # cap-aware planning: a schedule is drawn up against the known power band, so
        # hours the band blocks outright are skipped (the next-best hour substitutes)
        # and partially capped hours consume less of the daily cycle budget, letting
        # the plan spread the same energy over more (worse-priced) hours.
        ord_buy = [int(h) for h in np.argsort(buy, kind="stable")
                   if cap_c[base + int(h)] > 0.5]                # cheapest usable first
        ord_sell = [int(h) for h in np.argsort(sell, kind="stable")[::-1]
                    if cap_d[base + int(h)] > 0.5]               # dearest usable first
        ePlanned = 0.0
        for k in range(min(12, len(ord_buy), len(ord_sell))):
            bh, sh = ord_buy[k], ord_sell[k]
            bP, sP = buy[bh], sell[sh]
            if (sP - gcDis) - (bP + gcCh) / etaRT - degr > 0.0:
                if bh != sh:
                    is_chg[bh] = True
                    is_dis[sh] = True
                ePlanned += cap_c[base + bh]
                if ePlanned >= eDayBudget:
                    break
            else:
                break

        for h in range(24):
            ix = base + h
            pw = cf = thru = 0.0
            mk = 0
            if is_chg[h] and soc < eMaxA - 1e-6:
                room = eMaxA - soc
                pCh = min(cap_c[ix], room)
                if pCh > 0:
                    eIn = pCh * (1.0 - (lossFrac if prevPower <= 0 else 0.0))
                    soc += eIn * etaC
                    pw = pCh
                    cf = -(buy[h] + gcCh) * pCh
                    thru = eIn * etaC
                    totChgMWh += pCh
                    mk = 2 if (useID and id_d[h] < da_d[h]) else 1
            elif is_dis[h] and soc > eMinA + 1e-6:
                avail = soc - eMinA
                eOutGrid = cap_d[ix]
                eDrawn = eOutGrid / etaD if etaD > 0 else 0.0
                if eDrawn > avail:
                    eDrawn = avail
                    eOutGrid = avail * etaD
                if eOutGrid > 0:
                    eGridNet = eOutGrid * (1.0 - (lossFrac if prevPower >= 0 else 0.0))
                    soc -= eDrawn
                    pw = -eOutGrid
                    cf = (sell[h] - gcDis) * eGridNet
                    thru = eDrawn
                    totDisMWh += eGridNet
                    mk = 2 if (useID and id_d[h] > da_d[h]) else 1

            degCost = degr * thru
            cf -= degCost
            totCost += degCost
            totThru += thru
            prevPower = pw

            buy_o[ix] = buy[h]; sell_o[ix] = sell[h]
            power[ix] = pw; soc_o[ix] = soc
            cashf[ix] = cf; thru_o[ix] = thru; mkt[ix] = mk

    arb = float(cashf.sum())
    cycles = totDisMWh / max(1e-6, R["eMax"] - R["eMin"])
    return dict(
        buy=buy_o, sell=sell_o, power=power, soc=soc_o, cashflow=cashf,
        arb=arb, charged_mwh=totChgMWh, discharged_mwh=totDisMWh,
        deg_cost=totCost, cycles=cycles, mkt=mkt,
    )


def _reserve_revenue(R: dict, reserve_scale: float = 1.0, pr: Optional[dict] = None) -> dict:
    pr = pr if pr is not None else _load_prices()
    fcrMW = R["fcrMW"] * reserve_scale
    aPosMW = R["aPosMW"] * reserve_scale
    aNegMW = R["aNegMW"] * reserve_scale
    rev_fcr = float((fcrMW * pr["fcr"]).sum())
    rev_acap = float((aPosMW * pr["afrr_cap_pos"] + aNegMW * pr["afrr_cap_neg"]).sum())
    act_mwh = (aPosMW * R["actPos"] + aNegMW * R["actNeg"]) * N_HOURS
    rev_aen = act_mwh * (R["enMargin"] - R["degr"])
    return dict(fcr=rev_fcr, afrr_cap=rev_acap, afrr_en=rev_aen, deg_act=act_mwh * R["degr"])


def _summary(R: dict, disp: dict, reserve_scale: float = 1.0,
             pr: Optional[dict] = None) -> dict:
    rsv = _reserve_revenue(R, reserve_scale, pr)
    net = disp["arb"] + rsv["fcr"] + rsv["afrr_cap"] + rsv["afrr_en"]
    return dict(
        net=net,
        rev_per_mw=net / max(R["Pc"], R["Pd"], 1e-6),
        arb=disp["arb"], fcr=rsv["fcr"], afrr_cap=rsv["afrr_cap"], afrr_en=rsv["afrr_en"],
        cycles=disp["cycles"], charged_mwh=disp["charged_mwh"],
        discharged_mwh=disp["discharged_mwh"],
        deg_cost=disp["deg_cost"] + rsv["deg_act"],
    )


# ─────────────────────────────────────────────────────────────────────────────
#  Project financial model — IRR / NPV on a declining German revenue outlook
# ─────────────────────────────────────────────────────────────────────────────
# Year 1 of the cash-flow model is the simulated 2027 market case. Revenues are
# then indexed DOWN per component, calibrated to the published German BESS
# outlooks (as of mid-2026):
#   · Aurora European BESS outlook — ancillary saturation 2026-29, merchant
#     margins settling around ~130 €/kW/yr;
#   · Rabobank "Backup power for Europe pt. 5" — 2h revenues ~€240k/MW near-term
#     halve by 2030, wholesale ≈95 % of the stack, stabilising ~€125k/MW;
#   · Modo Energy German BESS outlook (Q2-2026) — overbuild cuts day-ahead
#     revenues ~17 % by 2030 (underbuild lifts them 11 %); ancillary falls from
#     55 % of the 2026 stack to ~5 % by 2030;
#   · enervis German BESS index — realised revenues already declining in 2026.
# Components: "anc" = FCR + aFRR capacity + aFRR energy margin (saturates fast);
# "arb" = DA/ID wholesale arbitrage (slower cannibalisation, then stabilises as
# the RE build-out keeps volatility alive).
FIN_SCENARIOS = {
    # yearly decay factor + floor (index relative to the simulated year = 1.0)
    "base": dict(arb_f=0.96, arb_floor=0.80, anc_f=0.78, anc_floor=0.28),
    "bear": dict(arb_f=0.93, arb_floor=0.65, anc_f=0.70, anc_floor=0.20),
    "bull": dict(arb_f=0.99, arb_floor=0.90, anc_f=0.85, anc_floor=0.40),
}

FIN_DEFAULTS = dict(
    capex_eur_per_kwh=235.0,   # ≈ Modo 4h 2026-COD benchmark (€935k/MW ÷ 4 MWh/MW)
    opex_pct=1.5,              # fixed O&M, % of CAPEX per year (real terms)
    years=15,
    wacc_pct=7.0,
    fade_pct=1.5,              # usable-capacity fade → proportional revenue loss
    scenario="base",
    start_year=2027,           # the simulated market year (SCEN_2027 price levels)
)


def _irr(cash: list) -> Optional[float]:
    """IRR by bisection; cash[0] = −CAPEX. None if there is no positive root."""
    def npv(r: float) -> float:
        return sum(c / (1.0 + r) ** t for t, c in enumerate(cash))
    lo, hi = -0.95, 5.0
    if npv(lo) < 0:            # never recovers even at −95 %/yr discount
        return None
    if npv(hi) > 0:
        return hi
    for _ in range(80):
        mid = (lo + hi) / 2.0
        if npv(mid) > 0:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2.0


def financial_model(s: dict, R: dict, fin: Optional[dict] = None) -> dict:
    """Merchant project cash flows on top of one simulated market year.

    s = _summary() revenue stack (year 1), R = _resolve()'d battery. All years
    in real terms; single up-front CAPEX, no debt, no terminal value."""
    f = {**FIN_DEFAULTS, **{k: v for k, v in (fin or {}).items() if v is not None}}
    years = max(1, int(f["years"]))
    scn = FIN_SCENARIOS.get(str(f["scenario"]), FIN_SCENARIOS["base"])
    capex = float(f["capex_eur_per_kwh"]) * R["Ecap"] * 1000.0     # MWh → kWh
    opex = capex * float(f["opex_pct"]) / 100.0
    fade = 1.0 - float(f["fade_pct"]) / 100.0
    y0 = int(f["start_year"])

    arb0 = s["arb"]
    anc0 = s["fcr"] + s["afrr_cap"] + s["afrr_en"]
    rows, cash, cum = [], [-capex], -capex
    for y in range(years):
        d = fade ** y
        arb = arb0 * max(scn["arb_floor"], scn["arb_f"] ** y) * d
        anc = anc0 * max(scn["anc_floor"], scn["anc_f"] ** y) * d
        cf = arb + anc - opex
        cash.append(cf)
        cum += cf
        rows.append(dict(year=y0 + y, arb=round(arb), anc=round(anc),
                         opex=round(-opex), cf=round(cf), cum=round(cum)))

    wacc = float(f["wacc_pct"]) / 100.0
    npv = sum(c / (1.0 + wacc) ** t for t, c in enumerate(cash))
    irr = _irr(cash)

    payback = None                      # simple payback, interpolated in-year
    run = -capex
    for t, c in enumerate(cash[1:], start=1):
        if c > 0 and run + c >= 0:
            payback = t - 1 + (-run) / c
            break
        run += c
    return dict(
        capex=round(capex), opex_yr=round(opex),
        irr_pct=(round(irr * 100.0, 2) if irr is not None else None),
        npv=round(npv),
        payback_yr=(round(payback, 1) if payback is not None else None),
        years=years, wacc_pct=float(f["wacc_pct"]), scenario=str(f["scenario"]),
        start_year=y0, rows=rows,
    )


# ─────────────────────────────────────────────────────────────────────────────
#  FCA: SH Netz HV rule-based power band (feed-in + withdrawal restrictions)
# ─────────────────────────────────────────────────────────────────────────────
# (knee%, end%) of the higher RE feed-in at which the feed-in band starts derating
# and reaches zero. Variant 1 = current as-is spec; 2 & 3 for higher RE overbuild.
FEEDIN_VARIANTS = {1: (50.0, 100.0), 2: (40.0, 80.0), 3: (30.0, 60.0)}
# knee% of RE feed-in below which the withdrawal (charge) band derates to 0 at 0%.
WITHDRAW_VARIANTS = {1: 10.0, 2: 20.0, 3: 30.0}
NIGHT_HOURS = lambda hod: (hod >= 23) | (hod < 5)  # 23:00–05:00 noqa: E731


def _build_fca_caps(R: dict, fca: dict, wind_frac: np.ndarray,
                    pv_frac: np.ndarray) -> dict:
    """SH Netz rule-based power band. The binding feed-in at each hour is the HIGHER
    of regional wind% and PV% (relative to rated power). Returns per-hour MW caps for
    charge & discharge, the limiting RE series, and the constrained-hour mask."""
    Pc, Pd = R["Pc"], R["Pd"]
    variant = int((fca or {}).get("variant", 1))
    knee_fi, end_fi = FEEDIN_VARIANTS.get(variant, FEEDIN_VARIANTS[1])
    knee_wd = WITHDRAW_VARIANTS.get(variant, WITHDRAW_VARIANTS[1])

    # The band is defined on the reference installations' feed-in as a share of THEIR
    # rated power, and a real wind/PV park does reach rated output during the year.
    # Our regional profiles carry yield derations (ERA5 wind availability 0.90, PV
    # performance ratio) that cap them below 1.0 — right for energy, wrong for the
    # band driver: with V1's endpoint at 100% the feed-in block could never fully
    # engage. Rescale each technology to its own annual max so it spans 0..1.
    def _to_rated(f):
        m = float(f.max())
        return f / m if m > 0.05 else f

    re = np.maximum(_to_rated(wind_frac), _to_rated(pv_frac))  # higher feed-in, 0..1
    if not np.any(re > 1e-6):
        # no standalone wind/ground-PV within the radius → the rule-based band can't
        # be constructed from local installations; leave dispatch unconstrained.
        return dict(cap_charge=np.full(N_HOURS, Pc), cap_discharge=np.full(N_HOURS, Pd),
                    capped=np.zeros(N_HOURS, dtype=bool), re=re,
                    dis_frac=np.ones(N_HOURS), chg_frac=np.ones(N_HOURS))
    x = re * 100.0                              # percent of rated RE power

    # 1) feed-in (discharge) cap: 100% below knee, linear to 0% at end
    dis_frac = np.clip((end_fi - x) / (end_fi - knee_fi), 0.0, 1.0)
    # 2) withdrawal (charge) cap during Dunkelflaute: 0% at 0 RE, full at knee_wd
    chg_frac = np.clip(x / knee_wd, 0.0, 1.0)
    # 3) night window (spec Figure 5): between 23:00 and 05:00 the storage is granted
    #    a withdrawal right of 25% Pinst INDEPENDENT of the RE feed-in — and the figure
    #    marks deeper night withdrawal as excluded. The grant is therefore both floor
    #    and ceiling: Dunkelflaute nights gain 25%, windy nights are THROTTLED to 25%.
    #    (Earlier code treated it as a pure release/floor, which is why the night
    #    window never showed a cost.)
    if (fca or {}).get("night_window", True):
        hod = np.arange(N_HOURS) % 24
        night = NIGHT_HOURS(hod)
        chg_frac = np.where(night, 0.25, chg_frac)

    capped = (dis_frac < 0.999) | (chg_frac < 0.999)
    return dict(
        cap_charge=chg_frac * Pc, cap_discharge=dis_frac * Pd,
        capped=capped, re=re, dis_frac=dis_frac, chg_frac=chg_frac,
    )


# ─────────────────────────────────────────────────────────────────────────────
#  Top level
# ─────────────────────────────────────────────────────────────────────────────
WEEK_START = 240  # representative winter week (11–17 Jan), matches the Excel chart


def _monthly(arr: np.ndarray) -> list:
    mo = _month_of_hour()
    return [float(arr[mo == m].sum()) for m in range(1, 13)]


def _fca_on(fca: Optional[dict]) -> bool:
    fca = fca or {}
    if "on" in fca:
        return bool(fca["on"])
    return fca.get("mode", "off") not in ("off", None)


def _core(bus_id: str, params: dict, fca: Optional[dict] = None) -> dict:
    """Run the baseline (firm) and, if requested, the FCA dispatch. Shared by
    simulate() and export_xlsx() so both stay in lockstep."""
    pr = _load_prices()
    da, id_ = pr["da"], pr["id"]
    fca = fca or {}
    on = _fca_on(fca)
    radius = float(fca.get("radius_km", 25.0))

    wind_frac, pv_frac, wind_mw, pv_mw = regional_re_index(str(bus_id), radius)

    # baseline = firm connection: full market access (FCR + aFRR), no ramp constraint
    R_base = _resolve({**(params or {}), "apply_ramp_loss": False})
    base = _dispatch(R_base, da, id_)
    base_sum = _summary(R_base, base)

    if on:
        # SH Netz HV reserve rules: PRL (FCR) forbidden; SRL (aFRR) ≤ 30% Pinst;
        # active-power gradient limited to 6% Pinst/min.
        P_inst = max(R_base["Pc"], R_base["Pd"])
        cap30 = 0.30 * P_inst
        g = {**DEFAULTS, **(params or {})}
        fpar = {**(params or {})}
        fpar["ramp_rate"] = 6.0           # SH Netz active-power gradient
        fpar["apply_ramp_loss"] = True
        fpar["enable_fcr"] = False
        fpar["fcr_mw"] = 0.0
        fpar["afrr_pos_mw"] = min(float(g["afrr_pos_mw"]), cap30)
        fpar["afrr_neg_mw"] = min(float(g["afrr_neg_mw"]), cap30)
        R_fca = _resolve(fpar)
        caps = _build_fca_caps(R_fca, fca, wind_frac, pv_frac)
        con = _dispatch(R_fca, da, id_, caps["cap_charge"], caps["cap_discharge"])
        con_sum = _summary(R_fca, con)
    else:
        R_fca = R_base
        con, con_sum = base, base_sum
        caps = dict(capped=np.zeros(N_HOURS, dtype=bool),
                    re=np.maximum(wind_frac, pv_frac),
                    dis_frac=np.ones(N_HOURS), chg_frac=np.ones(N_HOURS))

    return dict(
        pr=pr, da=da, id_=id_, on=on, radius=radius,
        wind_frac=wind_frac, pv_frac=pv_frac, wind_mw=wind_mw, pv_mw=pv_mw,
        R_base=R_base, base=base, base_sum=base_sum,
        R_fca=R_fca, con=con, con_sum=con_sum, caps=caps,
    )


def _reserve_series(R: dict, pr: dict) -> dict:
    """Per-hour reserve revenue (€). FCR & aFRR are capacity products: a flat block
    of MW held in reserve every hour, paid at the hourly capacity price. aFRR energy
    is the expected activation margin spread evenly across the year."""
    fcr = R["fcrMW"] * pr["fcr"]
    afrr_cap = R["aPosMW"] * pr["afrr_cap_pos"] + R["aNegMW"] * pr["afrr_cap_neg"]
    aen_h = (R["aPosMW"] * R["actPos"] + R["aNegMW"] * R["actNeg"]) * (R["enMargin"] - R["degr"])
    afrr_en = np.full(N_HOURS, aen_h)
    return dict(fcr=fcr, afrr_cap=afrr_cap, afrr_en=afrr_en)


def export_xlsx(bus_id: str, params: dict, fca: Optional[dict] = None) -> bytes:
    """Full 8,760-hour dispatch as a two-sheet .xlsx: 'Summary' (annual KPIs incl.
    FCR/aFRR revenue) and 'Hourly' (every hour: prices, power, SoC, and the per-hour
    arbitrage / FCR / aFRR cash flows)."""
    import io
    import pandas as pd

    c = _core(bus_id, params, fca)
    pr, on = c["pr"], c["on"]
    base, con, caps = c["base"], c["con"], c["caps"]
    R_base, R_fca = c["R_base"], c["R_fca"]
    base_sum, con_sum = c["base_sum"], c["con_sum"]
    rb = _reserve_series(R_base, pr)
    rc = _reserve_series(R_fca, pr)

    # power sign: + = charging (grid → battery), − = discharging (battery → grid)
    cols = {
        "hour": list(range(N_HOURS)),
        "timestamp": pr["index"],
        "da_price_eur_mwh": np.round(c["da"], 2),
        "id_price_eur_mwh": np.round(c["id_"], 2),
        "fcr_cap_price_eur_mw_h": np.round(pr["fcr"], 3),
        "afrr_pos_cap_price_eur_mw_h": np.round(pr["afrr_cap_pos"], 3),
        "afrr_neg_cap_price_eur_mw_h": np.round(pr["afrr_cap_neg"], 3),
        "firm_power_mw": np.round(base["power"], 3),
        "firm_soc_mwh": np.round(base["soc"], 3),
        "firm_arbitrage_eur": np.round(base["cashflow"], 2),
        "firm_fcr_eur": np.round(rb["fcr"], 3),
        "firm_afrr_cap_eur": np.round(rb["afrr_cap"], 3),
        "firm_afrr_energy_eur": np.round(rb["afrr_en"], 3),
    }
    cols["firm_total_eur"] = np.round(
        base["cashflow"] + rb["fcr"] + rb["afrr_cap"] + rb["afrr_en"], 3)
    if on:
        cols.update({
            "fca_power_mw": np.round(con["power"], 3),
            "fca_soc_mwh": np.round(con["soc"], 3),
            "fca_capped_hour": caps["capped"].astype(int),
            "fca_arbitrage_eur": np.round(con["cashflow"], 2),
            "fca_fcr_eur": np.round(rc["fcr"], 3),
            "fca_afrr_cap_eur": np.round(rc["afrr_cap"], 3),
            "fca_afrr_energy_eur": np.round(rc["afrr_en"], 3),
        })
        cols["fca_total_eur"] = np.round(
            con["cashflow"] + rc["fcr"] + rc["afrr_cap"] + rc["afrr_en"], 3)
    hourly = pd.DataFrame(cols)

    def _srows(tag, R, s):
        return [
            (f"{tag} — Arbitrage (DA+ID) €/yr", round(s["arb"])),
            (f"{tag} — FCR capacity €/yr", round(s["fcr"])),
            (f"{tag} — aFRR capacity €/yr", round(s["afrr_cap"])),
            (f"{tag} — aFRR energy €/yr", round(s["afrr_en"])),
            (f"{tag} — NET €/yr", round(s["net"])),
            (f"{tag} — FCR reserved MW", round(R["fcrMW"], 2)),
            (f"{tag} — aFRR+ reserved MW", round(R["aPosMW"], 2)),
            (f"{tag} — aFRR− reserved MW", round(R["aNegMW"], 2)),
        ]

    rows = [
        ("Bus", str(bus_id)),
        ("Nearby wind MW (radius)", round(c["wind_mw"], 1)),
        ("Nearby PV MW (radius)", round(c["pv_mw"], 1)),
        ("FCA applied", "yes" if on else "no"),
        ("FCA variant", int((fca or {}).get("variant", 1)) if on else "—"),
        ("FCA-limited hours", int(caps["capped"].sum()) if on else 0),
    ]
    rows += _srows("Firm", R_base, base_sum)
    if on:
        rows += _srows("FCA", R_fca, con_sum)
        rows.append(("FCA Δ NET €/yr", round(con_sum["net"] - base_sum["net"])))
    summary = pd.DataFrame(rows, columns=["metric", "value"])

    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as xw:
        summary.to_excel(xw, sheet_name="Summary", index=False)
        hourly.to_excel(xw, sheet_name="Hourly", index=False)
    return buf.getvalue()


def simulate(bus_id: str, params: dict, fca: Optional[dict] = None,
             fin: Optional[dict] = None) -> dict:
    c = _core(bus_id, params, fca)
    pr, da, on, radius = c["pr"], c["da"], c["on"], c["radius"]
    base, base_sum = c["base"], c["base_sum"]
    con, con_sum = c["con"], c["con_sum"]
    caps, R_fca = c["caps"], c["R_fca"]
    wind_frac, pv_frac = c["wind_frac"], c["pv_frac"]
    wind_mw, pv_mw = c["wind_mw"], c["pv_mw"]

    delta = dict(
        net=con_sum["net"] - base_sum["net"],
        arb=con_sum["arb"] - base_sum["arb"],
        fcr=con_sum["fcr"] - base_sum["fcr"],
        afrr=(con_sum["afrr_cap"] + con_sum["afrr_en"])
        - (base_sum["afrr_cap"] + base_sum["afrr_en"]),
        lost_discharge_mwh=base_sum["discharged_mwh"] - con_sum["discharged_mwh"],
        constrained_hours=int(caps["capped"].sum()),
        pct=((con_sum["net"] - base_sum["net"]) / base_sum["net"] * 100.0)
        if abs(base_sum["net"]) > 1e-6 else 0.0,
    )

    why = _explain(fca, delta, wind_mw, pv_mw, radius, caps)

    sl = slice(WEEK_START, WEEK_START + 168)
    chart = dict(
        week=dict(
            t=pr["index"][sl],
            price=[round(x, 2) for x in da[sl].tolist()],
            wind=[round(x, 3) for x in wind_frac[sl].tolist()],
            pv=[round(x, 3) for x in pv_frac[sl].tolist()],
            re=[round(x, 3) for x in caps["re"][sl].tolist()],
            power_base=[round(x, 2) for x in base["power"][sl].tolist()],
            soc_base=[round(x, 2) for x in base["soc"][sl].tolist()],
            power_fca=[round(x, 2) for x in con["power"][sl].tolist()],
            soc_fca=[round(x, 2) for x in con["soc"][sl].tolist()],
            capped=[bool(x) for x in caps["capped"][sl].tolist()],
        ),
        monthly=dict(
            net_base=_monthly(base["cashflow"]),
            net_fca=_monthly(con["cashflow"]),
        ),
        year=dict(
            price=[round(float(x), 1) for x in da.tolist()],
            power_base=[round(float(x), 1) for x in base["power"].tolist()],
            power_fca=[round(float(x), 1) for x in con["power"].tolist()],
            capped=[bool(x) for x in caps["capped"].tolist()],
        ),
        soc_max=R_fca["eMax"],
    )

    finance = dict(
        firm=financial_model(base_sum, c["R_base"], fin),
        fca=(financial_model(con_sum, R_fca, fin) if on else None),
    )

    return dict(
        bus=str(bus_id), radius_km=radius,
        nearby_wind_mw=round(wind_mw, 1), nearby_pv_mw=round(pv_mw, 1),
        fca_on=on, variant=int(fca.get("variant", 1)),
        baseline=base_sum, fca=(con_sum if on else None),
        delta=(delta if on else None), why=why, chart=chart,
        finance=finance,
    )


def _explain(fca: dict, delta: dict, wind_mw: float, pv_mw: float,
             radius: float, caps: dict) -> str:
    if not _fca_on(fca):
        return ("Firm grid connection — no FCA. The battery has full market access "
                "(arbitrage + FCR + aFRR) at rated power in every hour.")
    variant = int(fca.get("variant", 1))
    hrs = int(caps["capped"].sum())
    parts = [
        f"SH Netz HV flexible connection (Variant {variant}). The rule-based power band "
        f"is set by the {wind_mw:,.0f} MW of standalone wind and {pv_mw:,.0f} MW of "
        f"ground-mounted PV (rooftop excluded) within {radius:.0f} km: when the higher "
        f"of the two feeds in above the knee, the "
        f"battery's feed-in is derated linearly to zero, and in dark-doldrum hours its "
        f"charging is throttled (with a 23:00–05:00 night-charging release)."]
    if delta["fcr"] < -1:
        parts.append(f"FCR is not permitted on an FCA, costing €{abs(delta['fcr']):,.0f}/yr "
                     f"of primary-reserve revenue.")
    if delta["afrr"] < -1:
        parts.append(f"aFRR is capped at 30% of rated power (−€{abs(delta['afrr']):,.0f}/yr).")
    if delta["arb"] < -1:
        parts.append(f"Feed-in curtailment in {hrs} high-RE hours costs "
                     f"€{abs(delta['arb']):,.0f}/yr of arbitrage "
                     f"({delta['lost_discharge_mwh']:,.0f} MWh of discharge displaced) — "
                     f"though that energy mostly coincides with low, RE-depressed prices.")
    sign = "loses" if delta["net"] < 0 else "gains"
    parts.append(f"Net: the asset {sign} €{abs(delta['net']):,.0f}/yr ({delta['pct']:+.1f}%) "
                 f"vs. a firm connection.")
    return " ".join(parts)


@functools.lru_cache(maxsize=1)
def weather_zones() -> dict:
    """Weather-zone map data. Prefers the ERA5 grid (real per-region capacity factors);
    each cell is a point [lat, lon, cf_mean, zone_idx]. Falls back to eGon per-generator
    CF if the ERA5 cache hasn't been built."""
    c = _era5_cf()
    if c is not None:
        out = {}
        for kind in ("wind", "pv"):
            cf_mean = c[kind].mean(axis=1)
            cfs = sorted({round(float(x), 4) for x in cf_mean})
            zone = {v: i for i, v in enumerate(cfs)}
            pts = [[round(float(la), 4), round(float(lo), 4), round(float(m), 4),
                    zone[round(float(m), 4)]]
                   for la, lo, m in zip(c["lats"], c["lons"], cf_mean)]
            vals = [p[2] for p in pts] or [0.0]
            out[kind] = dict(points=pts, cf_min=min(vals), cf_max=max(vals),
                             n_zones=len(cfs), n_points=len(pts), source="ERA5", grid=True)
        return out

    eng = get_engine()
    out = {}
    with eng.connect() as conn:
        for kind, cars in [("wind", ("onwind", "offwind")), ("pv", ("solar",))]:
            rows = conn.execute(text("""
                SELECT wb.y, wb.x,
                       (SELECT avg(v) FROM unnest(t.p_max_pu) AS v) AS cf
                FROM grid.egon_etrago_generator g
                JOIN grid.egon_etrago_bus wb ON wb.bus_id = g.bus AND wb.scn_name = g.scn_name
                JOIN grid.egon_etrago_generator_timeseries t
                  ON t.generator_id = g.generator_id AND t.scn_name = g.scn_name
                WHERE g.scn_name = :s AND g.carrier = ANY(:cs)
                  AND t.p_max_pu IS NOT NULL AND wb.y IS NOT NULL AND wb.x IS NOT NULL
            """), {"s": SCN, "cs": list(cars)}).fetchall()
            cfs = sorted({round(float(r[2]), 4) for r in rows})
            zone = {cf: i for i, cf in enumerate(cfs)}
            pts = [[round(float(y), 4), round(float(x), 4), round(float(cf), 4),
                    zone[round(float(cf), 4)]] for y, x, cf in rows]
            vals = [p[2] for p in pts] or [0.0]
            out[kind] = dict(points=pts, cf_min=min(vals), cf_max=max(vals),
                             n_zones=len(cfs), n_points=len(pts), source="eGon", grid=False)
    return out


@functools.lru_cache(maxsize=1)
def weather_muni() -> dict:
    """Mean wind / PV capacity factor per municipality (AGS): each municipality's
    representative point is matched to its nearest weather sample — the ERA5 cell
    when the cache exists, else the nearest eGon generator CF. Drives the
    municipality-level weather choropleth (joined to /api/sample/municipalities)."""
    eng = get_engine()
    with eng.connect() as c:
        rows = c.execute(text(
            "SELECT ags, ST_Y(ST_PointOnSurface(geom)) AS lat, "
            "       ST_X(ST_PointOnSurface(geom)) AS lon "
            "FROM grid.municipality_energy WHERE geom IS NOT NULL")).fetchall()
    ags = [str(r[0]) for r in rows]
    la = np.array([float(r[1]) for r in rows])
    lo = np.array([float(r[2]) for r in rows])

    def _pack(kind, plats, plons, pcf, source):
        d2 = (la[:, None] - plats[None, :]) ** 2 + (lo[:, None] - plons[None, :]) ** 2
        vals = pcf[np.argmin(d2, axis=1)]
        return {"cf": {a: round(float(v), 4) for a, v in zip(ags, vals)},
                "cf_min": round(float(vals.min()), 4),
                "cf_max": round(float(vals.max()), 4),
                "n_munis": len(ags), "source": source}

    c5 = _era5_cf()
    out = {}
    if c5 is not None:
        for kind in ("wind", "pv"):
            out[kind] = _pack(kind, c5["lats"], c5["lons"],
                              c5[kind].mean(axis=1), "ERA5")
        return out
    z = weather_zones()
    for kind in ("wind", "pv"):
        pts = np.array([[p[0], p[1], p[2]] for p in z[kind]["points"]] or [[0, 0, 0]])
        out[kind] = _pack(kind, pts[:, 0], pts[:, 1], pts[:, 2], z[kind]["source"])
    return out


def context(bus_id: str, radius_km: float = 25.0) -> dict:
    """Per-bus RE exposure for the popup header (wind + PV within radius)."""
    wind_frac, pv_frac, wind_mw, pv_mw = regional_re_index(str(bus_id), radius_km)
    re = np.maximum(wind_frac, pv_frac)
    return dict(
        bus=str(bus_id), radius_km=radius_km,
        nearby_wind_mw=round(wind_mw, 1), nearby_pv_mw=round(pv_mw, 1),
        high_re_hours=int((re > 0.5).sum()),
        mean_wind=round(float(wind_frac.mean()), 3),
        mean_pv=round(float(pv_frac.mean()), 3),
    )
