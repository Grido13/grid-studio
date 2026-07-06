"""System-wide FCA scan: firm connection vs. SH Netz HV Flexible Connection
Agreement, evaluated for EVERY 110 kV bus in the grid.

This is the batch sibling of `bess_runner.simulate` (the per-node popup). Instead of
one substation it sweeps all ~6,400 DSO-level (110 kV) buses and, for each, runs the
1-year BESS dispatch under a firm connection and under three FCA band variants
(V1/V2/V3), reporting how much annual revenue the FCA leaves on the table at that
location. The result feeds the Analysis tab's green→yellow→red map/table.

Design notes
------------
* The firm-connection baseline does NOT depend on the bus (prices + battery only), so
  it is computed exactly once. Per the spec it carries **no ramp constraint**.
* The FCA dispatch differs per bus only through the regional RE feed-in that drives the
  power band; the reserve revenue (FCR forbidden, aFRR ≤30%) is the same everywhere.
  Per the spec the FCA carries a **6 %/min active-power gradient**.
* The slow part of `bess_runner` is one DB round-trip per bus for the regional RE.
  Here we load every wind/PV generator profile ONCE into a numpy matrix and compute
  each bus's regional fraction with a vectorised bounding-box + haversine filter, so
  the whole 6,400-bus sweep runs in-process in well under a minute.

The scan is cached to `results/.bess_fca_scan.json` and recomputed only when the
battery configuration changes (the params hash is stored alongside).
"""
from __future__ import annotations

import hashlib
import json
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from sqlalchemy import text

from ..db import SCN, get_engine
from . import bess_runner as BR

N_HOURS = BR.N_HOURS
CACHE = BR._RESULTS / ".bess_fca_scan.json"
VARIANTS = (1, 2, 3)

# Battery used for the sweep — 100 MW / 400 MWh (4 h), 2027 MARKET CASE.
#
# Revenue stack per market research (Aurora European BESS outlook May/Oct-2025 —
# German 2h benchmark, ancillary saturation 2026-29, merchant margins → ~130 €/kW/yr
# by early 2030s; Modo Energy; Rabobank: wholesale ≈95 % of the stack by 2030;
# enervis BESS index): by 2027 wholesale arbitrage dominates (~70-75 %), aFRR is
# still worth bidding (~20-25 %) and FCR is marginal (~2-5 %). Bids are sized to
# what the saturating markets can absorb, NOT to the battery: 5 MW FCR, 15 MW aFRR
# each way (inside the FCA's 30 % SRL allowance, so the aFRR cap does not bind —
# the ancillary restriction that costs money in 2027 is the FCR ban).
SCAN_PARAMS = dict(
    power_charge=100.0, power_discharge=100.0, energy_capacity=400.0,
    rt_efficiency=86.0, soc_min=5.0, soc_max=100.0,
    use_intraday=True, max_cycles_day=2.0,
    degradation_cost=3.0, grid_cost_charge=0.0, grid_cost_discharge=0.0,
    enable_fcr=True, fcr_mw=5.0, enable_afrr=True, afrr_pos_mw=15.0, afrr_neg_mw=15.0,
    fcr_buffer_h=0.25, afrr_reserve_h=1.0, afrr_act_pos=10.0, afrr_act_neg=10.0,
    afrr_energy_margin=30.0,
)
RADIUS_KM = 25.0

# The 2027 reserve-price scaling lives in bess_runner.SCEN_2027 (inside
# _load_prices) so the Analysis scan and the per-node Grid-tab popup share it.

# Live progress for the background runner (read by /api/bess/scan/status).
_state = {"running": False, "done": 0, "total": 0, "error": None, "started": None}
_lock = threading.Lock()


def _params_key() -> str:
    # Include the ERA5 weather cache fingerprint so rebuilding the weather curves
    # (e.g. switching to fresh ERA5 profiles) auto-marks the scan stale.
    try:
        era5 = f"|era5:{BR.ERA5_CACHE.stat().st_mtime_ns}" if BR.ERA5_CACHE.exists() else "|era5:none"
    except Exception:
        era5 = "|era5:?"
    # "|band" tag = version of the FCA band / dispatch code; bump when the rules change
    blob = (json.dumps(SCAN_PARAMS, sort_keys=True) + f"|r{RADIUS_KM}" + era5
            + f"|band5-units|scen{json.dumps(BR.SCEN_2027, sort_keys=True)}")
    return hashlib.md5(blob.encode()).hexdigest()[:10]


# ─────────────────────────────────────────────────────────────────────────────
#  Regional wind / PV exposure per bus — IDENTICAL logic to
#  bess_runner.regional_re_index (so the scan matches the per-node popup):
#    • capacity / presence from real MaStR installations (rooftop PV excluded);
#    • per-hour output SHAPE from the ERA5 capacity-factor grid (real weather
#      timing), eGon p_max_pu as fallback if the ERA5 cache isn't built.
#  MaStR units and the ERA5 grid are loaded once (lru_cache inside bess_runner),
#  so we only need the bus coordinates — which we already have from _bus_list().
# ─────────────────────────────────────────────────────────────────────────────
def _frac_for(lat: float, lon: float) -> tuple:
    M = BR._mastr_units()

    def near_mw(key):
        la, lo, mw = M[key]
        if len(la) == 0:
            return 0.0
        d = BR._haversine_vec(lat, lon, la, lo)
        return float(mw[d <= RADIUS_KM].sum())

    wind_mw = near_mw("wind"); pv_mw = near_mw("pv")

    def _profile(kind, carriers):
        p = BR._era5_profile(lon, lat, kind)
        return p if p is not None else BR._egon_profile(lon, lat, RADIUS_KM, carriers)

    wind_frac = _profile("wind", ("onwind", "offwind")) if wind_mw > 0 else np.zeros(N_HOURS)
    pv_frac = _profile("pv", ("solar",)) if pv_mw > 0 else np.zeros(N_HOURS)
    return wind_frac, pv_frac, wind_mw, pv_mw


# ─────────────────────────────────────────────────────────────────────────────
#  Firm + FCA resolutions (location-independent; built once)
# ─────────────────────────────────────────────────────────────────────────────
def _resolutions() -> dict:
    P = BR._load_prices()
    # Firm connection: full market access, NO ramp constraint.
    base = {**SCAN_PARAMS, "apply_ramp_loss": False, "ramp_rate": 0.0}
    R_base = BR._resolve(base)
    base_disp = BR._dispatch(R_base, P["da"], P["id"])
    base_sum = BR._summary(R_base, base_disp, pr=P)

    # FCA: 6 %/min gradient, FCR forbidden, aFRR ≤ 30 % of rated power.
    P_inst = max(R_base["Pc"], R_base["Pd"])
    cap30 = 0.30 * P_inst
    fpar = {**SCAN_PARAMS, "apply_ramp_loss": True, "ramp_rate": 6.0,
            "enable_fcr": False, "fcr_mw": 0.0,
            "afrr_pos_mw": min(float(SCAN_PARAMS["afrr_pos_mw"]), cap30),
            "afrr_neg_mw": min(float(SCAN_PARAMS["afrr_neg_mw"]), cap30)}
    R_fca = BR._resolve(fpar)
    rsv_fca = BR._reserve_revenue(R_fca, pr=P)      # constant across buses
    fca_reserve = rsv_fca["fcr"] + rsv_fca["afrr_cap"] + rsv_fca["afrr_en"]
    return dict(R_base=R_base, base_sum=base_sum, R_fca=R_fca, fca_reserve=fca_reserve)


# ─────────────────────────────────────────────────────────────────────────────
#  Full scan
# ─────────────────────────────────────────────────────────────────────────────
def _bus_list() -> list:
    eng = get_engine()
    with eng.connect() as c:
        rows = c.execute(text(
            "SELECT bus_id, x, y FROM grid.egon_etrago_bus "
            "WHERE scn_name=:s AND v_nom=110 AND x IS NOT NULL AND y IS NOT NULL "
            "ORDER BY bus_id"
        ), {"s": SCN}).fetchall()
    names = BR_bus_names()
    return [(str(b), float(x), float(y), names.get(str(b))) for b, x, y in rows]


def BR_bus_names() -> dict:
    eng = get_engine()
    with eng.connect() as c:
        try:
            rows = c.execute(text(
                "SELECT bus_id, subst_name FROM grid.egon_bus_metadata"
            )).fetchall()
            return {str(b): str(n) for b, n in rows}
        except Exception:
            return {}


def run_scan() -> dict:
    P = BR._load_prices()
    da, id_ = P["da"], P["id"]
    Rs = _resolutions()
    R_base, base_sum = Rs["R_base"], Rs["base_sum"]
    R_fca, fca_reserve = Rs["R_fca"], Rs["fca_reserve"]
    base_net = base_sum["net"]
    Pmw = max(R_base["Pc"], R_base["Pd"], 1e-6)

    buses = _bus_list()
    with _lock:
        _state.update(running=True, done=0, total=len(buses), error=None,
                      started=time.time())

    out = []
    for k, (bus, lon, lat, name) in enumerate(buses):
        wind_frac, pv_frac, wind_mw, pv_mw = _frac_for(lat, lon)
        rec = {"bus": bus, "name": name, "lat": round(lat, 4), "lon": round(lon, 4),
               "wind_mw": round(wind_mw, 1), "pv_mw": round(pv_mw, 1)}
        for v in VARIANTS:
            caps = BR._build_fca_caps(R_fca, {"variant": v, "night_window": True},
                                      wind_frac, pv_frac)
            disp = BR._dispatch(R_fca, da, id_, caps["cap_charge"], caps["cap_discharge"])
            net = disp["arb"] + fca_reserve
            delta = net - base_net
            pct = (delta / base_net * 100.0) if abs(base_net) > 1e-6 else 0.0
            rec[f"v{v}"] = {
                "net": round(net, 0),
                "delta": round(delta, 0),
                "pct": round(pct, 1),
                "ret": round(net / base_net * 100.0, 1) if abs(base_net) > 1e-6 else 0.0,
                "hrs": int(caps["capped"].sum()),
            }
        out.append(rec)
        if k % 50 == 0:
            with _lock:
                _state["done"] = k

    result = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "params_key": _params_key(),
        "n_buses": len(out),
        "radius_km": RADIUS_KM,
        "battery": {"power_mw": R_base["Pc"], "energy_mwh": R_base["Ecap"]},
        "baseline": {
            "net": round(base_net, 0),
            "per_mw": round(base_net / Pmw, 0),
            "arb": round(base_sum["arb"], 0),
            "fcr": round(base_sum["fcr"], 0),
            "afrr": round(base_sum["afrr_cap"] + base_sum["afrr_en"], 0),
        },
        "fca_reserve": round(fca_reserve, 0),
        "reserve_loss": round(fca_reserve - (base_sum["fcr"] + base_sum["afrr_cap"]
                              + base_sum["afrr_en"]), 0),
        "buses": out,
    }
    CACHE.write_text(json.dumps(result))
    with _lock:
        _state.update(running=False, done=len(buses))
    return result


# ─────────────────────────────────────────────────────────────────────────────
#  Per-bus FCA matrix for the Analysis-tab popup:
#  3 band variants × night-cap on/off × two regimes —
#    "open"        FCA feed-in/withdrawal band only (full FCR + aFRR, no ramp limit)
#    "restricted"  band + ancillary cap & ramp (FCR banned, aFRR ≤30 %, 6 %/min)
# ─────────────────────────────────────────────────────────────────────────────
def node_matrix(bus_id: str) -> dict:
    prices = BR._load_prices()
    da, id_ = prices["da"], prices["id"]
    Rs = _resolutions()
    R_base, base_sum = Rs["R_base"], Rs["base_sum"]
    R_fca, fca_reserve = Rs["R_fca"], Rs["fca_reserve"]
    base_net = base_sum["net"]
    base_reserve = base_sum["fcr"] + base_sum["afrr_cap"] + base_sum["afrr_en"]

    wind_frac, pv_frac, wind_mw, pv_mw = BR.regional_re_index(bus_id, RADIUS_KM)

    def cell(R, reserve, variant, night):
        caps = BR._build_fca_caps(R, {"variant": variant, "night_window": night},
                                  wind_frac, pv_frac)
        disp = BR._dispatch(R, da, id_, caps["cap_charge"], caps["cap_discharge"])
        net = disp["arb"] + reserve
        return {
            "net": round(net, 0),
            "delta": round(net - base_net, 0),
            "ret": round(net / base_net * 100.0, 1) if abs(base_net) > 1e-6 else 0.0,
            "hrs": int(caps["capped"].sum()),
        }

    open_, restricted = {}, {}
    for v in VARIANTS:
        open_[f"v{v}"] = {"no_night": cell(R_base, base_reserve, v, False),
                          "night": cell(R_base, base_reserve, v, True)}
        restricted[f"v{v}"] = {"no_night": cell(R_fca, fca_reserve, v, False),
                               "night": cell(R_fca, fca_reserve, v, True)}

    return {
        "bus": str(bus_id),
        "name": BR_bus_names().get(str(bus_id)),
        "wind_mw": round(wind_mw, 1), "pv_mw": round(pv_mw, 1),
        "radius_km": RADIUS_KM,
        "battery": {"power_mw": R_base["Pc"], "energy_mwh": R_base["Ecap"]},
        "baseline": {"net": round(base_net, 0)},
        "open": open_, "restricted": restricted,
    }


def run_scan_safe():
    try:
        run_scan()
    except Exception as e:  # noqa: BLE001
        with _lock:
            _state.update(running=False, error=str(e))


def start_background() -> dict:
    with _lock:
        if _state["running"]:
            return {"started": False, **_state}
        _state.update(running=True, done=0, total=0, error=None, started=time.time())
    threading.Thread(target=run_scan_safe, daemon=True).start()
    return {"started": True}


def status() -> dict:
    with _lock:
        s = dict(_state)
    s["cached"] = CACHE.exists()
    s["fresh"] = cached_is_fresh()
    return s


def cached_is_fresh() -> bool:
    if not CACHE.exists():
        return False
    try:
        d = json.loads(CACHE.read_text())
        return d.get("params_key") == _params_key()
    except Exception:
        return False


def load_cached() -> dict | None:
    if not CACHE.exists():
        return None
    try:
        return json.loads(CACHE.read_text())
    except Exception:
        return None
