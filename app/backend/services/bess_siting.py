"""bess_siting.py — Where would a standard BESS beat redispatch / Netzausbau?

Screening layer over the year-scenario redispatch runs: for every 110 kV and
380 kV bus, a standard grid-booster BESS (50 MW/200 MWh at 110 kV,
250 MW/1000 MWh at 380 kV) is counter-dispatched against the PRE-redispatch
(day-ahead) overloads on the bus's incident lines, and the node is classified
per the German regulatory triad:

  supportive (netzdienlich)   — the BESS relieves most local overload energy;
                                a real alternative to redispatch/Netzausbau,
  neutral    (netzneutral)    — congestion nearby but only partial relief;
                                market operation under grid constraints,
  market     (marktdienlich)  — no local congestion; pure arbitrage site.

Local-relief assumption: 1 MW at the bus moves the constraining incident line
by 1 MW (no PTDF split) — an upper bound, fine for siting/screening. 220 kV
buses carry no standard BESS product and are excluded entirely.
"""
from __future__ import annotations
import hashlib
import json
import math
import threading
from collections import defaultdict
from pathlib import Path

import numpy as np

from .app_sample import (OVERLOAD_TOL, _RESULTS, _bus_names, _mm, _norm_ds,
                         _npz, _topo)

# Standard BESS per voltage level: (P_MW, E_MWh). 220 kV deliberately absent.
SPEC = {110: (50.0, 200.0), 380: (250.0, 1000.0)}
EFF_RT = 0.90            # round-trip efficiency; sqrt applied per direction
SOC0_FRAC = 0.5          # start + between-episode recovery target
SUPPORTIVE_FRAC = 0.70   # relief fraction needed for "supportive"
MIN_OVL_H = 25.0         # local overload must matter (h/yr) to justify a booster
VERSION = 1              # bump to invalidate caches on algorithm changes

_lock = threading.Lock()


def _cache_path(year: int) -> Path:
    return _RESULTS / f".bess_siting_{int(year)}.json"


def _params_key(year: int) -> str:
    p = _npz(year, _norm_ds(year, "n0"))
    cfg = json.dumps({"spec": SPEC, "eff": EFF_RT, "soc0": SOC0_FRAC,
                      "sup": SUPPORTIVE_FRAC, "minh": MIN_OVL_H}, sort_keys=True)
    return f"v{VERSION}|{int(p.stat().st_mtime)}|{hashlib.md5(cfg.encode()).hexdigest()[:8]}"


def _simulate_bus(exc_c, exc_d, ovl_idx, P: float, E: float, scale: float) -> dict:
    """Greedy hourly SoC counter-dispatch over this bus's overload hours only.

    exc_c[t] / exc_d[t]: MW of excess relievable by charging / discharging.
    Between overload episodes the BESS drifts back to SOC0 at rated power
    (free market operation assumed to leave it half-full when congestion hits).
    """
    eff = math.sqrt(EFF_RT)
    target = SOC0_FRAC * E
    soc = target
    prev = -1
    relieved = 0.0
    ovl_mwh = 0.0
    peak_ex = 0.0
    residual_h = 0
    conflict_h = 0
    for t in ovl_idx:
        gap = int(t) - prev - 1
        if gap > 0:
            if soc < target:
                soc = min(target, soc + gap * P * eff)
            elif soc > target:
                soc = max(target, soc - gap * P / eff)
        prev = int(t)
        c = float(exc_c[t]); d = float(exc_d[t])
        ovl_mwh += c + d
        peak_ex = max(peak_ex, c, d)
        if c > 0 and d > 0:
            # opposite needs the same hour: a single device can't serve both
            conflict_h += 1
            residual_h += 1
            continue
        if c > 0:
            r = min(c, P, (E - soc) / eff)   # grid-side MW absorbed
            soc += r * eff
        else:
            r = min(d, P, soc * eff)         # grid-side MW delivered
            soc -= r / eff
        relieved += r
        if r < max(c, d) - 1e-6:
            residual_h += 1
    return {
        "ovl_h": round(len(ovl_idx) * scale, 1),
        "ovl_h_res": round(residual_h * scale, 1),
        "ovl_mwh": round(ovl_mwh * scale, 0),
        "rel_mwh": round(relieved * scale, 0),
        "rel_frac": round(relieved / ovl_mwh, 3) if ovl_mwh > 0 else 0.0,
        "peak_ex_mw": round(peak_ex, 0),
        "conflict_h": round(conflict_h * scale, 1),
    }


def compute(year: int) -> dict:
    ds = _norm_ds(year, "n0")
    z = np.load(_npz(year, ds), allow_pickle=True)
    snom = np.asarray(z["s_nom"]).astype(np.float64)
    sub_lines = np.asarray(z["sub_line_ids"]).astype(str)
    ovl_da = np.asarray(z["ovl_hours_da"]).astype(np.float64)
    del z

    # Only lines ever overloaded pre-redispatch matter; gather just those columns.
    cols = np.where(ovl_da > 0)[0]
    F = np.asarray(_mm(year, ds, "line_flow_da")[:, cols], dtype=np.float32)
    T = F.shape[0]
    scale = 8760.0 / T if T else 1.0
    ssafe = np.where(snom[cols] > 0, snom[cols], np.inf)
    absF = np.abs(F)
    over = (absF / ssafe) > OVERLOAD_TOL
    exc = np.where(over, absF - snom[cols], 0.0).astype(np.float32)
    pos_flow = F > 0                    # PyPSA convention: >0 flows bus0 -> bus1
    del F, absF, over

    xy, lines = _topo(year)
    pos_map = {l: i for i, l in enumerate(sub_lines)}
    col_of = {int(c): k for k, c in enumerate(cols)}
    inc = defaultdict(list)             # bus -> [(col in exc, +1 if bus is bus0)]
    for r in lines.itertuples():
        p = pos_map.get(r.line_id)
        if p is None or p not in col_of:
            continue
        inc[str(r.bus0)].append((col_of[p], 1))
        inc[str(r.bus1)].append((col_of[p], -1))

    names = _bus_names()
    counts = {"supportive": 0, "neutral": 0, "market": 0}
    buses_out = []
    for b, (lon, lat, v) in xy.items():
        v = int(round(v))
        if v not in SPEC:               # 220 kV (and any other level) excluded
            continue
        P, E = SPEC[v]
        row = {"bus": b, "name": names.get(b),
               "lat": round(lat, 4), "lon": round(lon, 4), "v": v,
               "p_mw": P, "e_mwh": E}
        pairs = inc.get(b)
        if pairs:
            ks = np.array([k for k, _ in pairs])
            ors = np.array([o for _, o in pairs]) > 0
            # export from the bus <=> flow sign matches the bus being bus0
            exporting = pos_flow[:, ks] == ors[None, :]
            eb = exc[:, ks]
            exc_c = np.where(exporting, eb, 0.0).max(axis=1)   # charge-helpable
            exc_d = np.where(~exporting, eb, 0.0).max(axis=1)  # discharge-helpable
            ovl_idx = np.where((exc_c > 0) | (exc_d > 0))[0]
        else:
            ovl_idx = ()
        if len(ovl_idx):
            m = _simulate_bus(exc_c, exc_d, ovl_idx, P, E, scale)
            m["n_ovl_lines"] = int(len(pairs))
            if m["rel_frac"] >= SUPPORTIVE_FRAC and m["ovl_h"] >= MIN_OVL_H:
                cls = "supportive"
            else:
                cls = "neutral"
        else:
            m = {"n_ovl_lines": 0, "ovl_h": 0, "ovl_h_res": 0, "ovl_mwh": 0,
                 "rel_mwh": 0, "rel_frac": 0.0, "peak_ex_mw": 0, "conflict_h": 0}
            cls = "market"
        counts[cls] += 1
        row["cls"] = cls
        row.update(m)
        buses_out.append(row)

    return {
        "year": int(year),
        "key": _params_key(year),
        "params": {"spec": {str(k): list(v) for k, v in SPEC.items()},
                   "eff_rt": EFF_RT, "supportive_frac": SUPPORTIVE_FRAC,
                   "min_ovl_h": MIN_OVL_H, "version": VERSION},
        "counts": counts,
        "buses": buses_out,
        "method": ("Pre-redispatch (day-ahead) hourly flows of the year run. A "
                   "standard BESS at each bus counter-dispatches the overloads on "
                   "its incident lines (charge absorbs export overloads, discharge "
                   "serves import overloads), greedy hourly SoC simulation with "
                   f"{EFF_RT:.0%} round-trip efficiency, drifting back to "
                   f"{SOC0_FRAC:.0%} SoC between episodes. 1 MW at the bus is "
                   "assumed to move the constraining line by 1 MW (no PTDF split) "
                   "— an upper-bound screening, not a network study. supportive = "
                   f"relief ≥ {SUPPORTIVE_FRAC:.0%} of local overload energy and "
                   f"≥ {MIN_OVL_H:.0f} overload h/yr; neutral = congested but only "
                   "partial relief; market = no congested incident line."),
    }


def siting(year: int = 2025, force: bool = False) -> dict:
    """Cached per-year siting analysis (results/.bess_siting_{year}.json)."""
    key = _params_key(year)             # raises FileNotFoundError if no dataset
    cp = _cache_path(year)
    if not force and cp.exists():
        try:
            d = json.loads(cp.read_text())
            if d.get("key") == key:
                return d
        except Exception:
            pass
    with _lock:
        if not force and cp.exists():   # another request may have just built it
            try:
                d = json.loads(cp.read_text())
                if d.get("key") == key:
                    return d
            except Exception:
                pass
        d = compute(year)
        cp.write_text(json.dumps(d))
        return d
