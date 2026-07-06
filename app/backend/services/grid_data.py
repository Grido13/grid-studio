"""grid_data.py — Data layer for the whole-grid map view.

Serves, per snapshot:
  * line flows pre/post-redispatch and loading (from the hourly redispatch npz),
  * per-bus redispatch (ramp-up / curtailment) aggregated from generator deltas,
  * the top congested lines and what resolved them.

Bus coordinates + line endpoints come from the database (scenario db.SCN); the
timeseries come from the CANONICAL run results/app_year.npz (since 2026-07-03;
memory-mapped, so the 1.3 GB file is not pulled into RAM). Falls back to the
legacy redispatch2_final_deltas_hourly.npz. All lookups are cached on first use.
"""
from __future__ import annotations

import functools
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import text

from ..db import SCN, get_engine

CANON_NPZ = Path(__file__).resolve().parents[3] / "results" / "app_year.npz"
NPZ_PATH = Path(__file__).resolve().parents[3] / "results" / "redispatch2_final_deltas_hourly.npz"
DELTAS_CSV = Path(__file__).resolve().parents[3] / "results" / "redispatch2_final_deltas.csv"

V_COLORS = {110: "#2b6cff", 220: "#16c784", 380: "#ff3b3b"}  # blue / green / red

# Indicative €/MWh for a real (non-slack) hourly redispatch-cost estimate:
# replacement generation when ramped up, lost-feed-in compensation when curtailed.
CARRIER_PRICE = {
    "solar": 45, "onwind": 85, "offwind": 110, "run_of_river": 30, "reservoir": 40,
    "biogas": 60, "biomass": 60, "waste": 30, "gas_chp": 65, "gas_ccgt": 100,
    "coal": 90, "hard_coal": 90, "lignite": 50, "oil": 150, "other": 80, "hydrogen": 200,
}


@functools.lru_cache(maxsize=1)
def _topology():
    """Bus coords + line endpoints from the DB (cached)."""
    eng = get_engine()
    with eng.connect() as c:
        buses = pd.read_sql(text(
            "SELECT bus_id, v_nom, x AS lon, y AS lat FROM grid.egon_etrago_bus "
            "WHERE scn_name=:s"), c, params={"s": SCN})
        lines = pd.read_sql(text(
            "SELECT line_id, bus0, bus1, v_nom, s_nom FROM grid.egon_etrago_line "
            "WHERE scn_name=:s"), c, params={"s": SCN})
        links = pd.read_sql(text(
            "SELECT link_id, bus0, bus1, p_nom, length, carrier "
            "FROM grid.egon_etrago_link WHERE scn_name=:s"), c, params={"s": SCN})
    buses["bus_id"] = buses["bus_id"].astype(str)
    bus_xy = {r.bus_id: (r.lon, r.lat, r.v_nom) for r in buses.itertuples()}
    lines["line_id"] = lines["line_id"].astype(str)
    lines["bus0"] = lines["bus0"].astype(str)
    lines["bus1"] = lines["bus1"].astype(str)
    out_links = []
    for r in links.itertuples():
        b0, b1 = bus_xy.get(str(r.bus0)), bus_xy.get(str(r.bus1))
        if b0 is None or b1 is None:
            continue
        out_links.append({"id": str(r.link_id),
                          "x0": b0[0], "y0": b0[1], "x1": b1[0], "y1": b1[1],
                          "p_nom": round(float(r.p_nom or 0), 0),
                          "length_km": round(float(r.length or 0), 1),
                          "carrier": str(r.carrier or "DC"),
                          "bus0": str(r.bus0), "bus1": str(r.bus1)})
    return bus_xy, lines, out_links


@functools.lru_cache(maxsize=1)
def _npz():
    path = CANON_NPZ if CANON_NPZ.exists() else NPZ_PATH
    z = np.load(path, allow_pickle=True, mmap_mode="r")
    sub_line_ids = np.asarray(z["sub_line_ids"]).astype(str)
    line_pos = {lid: i for i, lid in enumerate(sub_line_ids)}
    snapshots = np.asarray(z["snapshots"]).astype(str)
    gen_ids = np.asarray(z["gen_ids"]).astype(str)
    files = getattr(z, "files", [])
    if "gen_bus" in files and "gen_carrier" in files:
        gen_bus = np.asarray(z["gen_bus"]).astype(str)
        gen_car = np.asarray(z["gen_carrier"]).astype(str)
    else:  # legacy npz: generator -> bus/carrier map from the deltas CSV
        df = pd.read_csv(DELTAS_CSV)
        df["gen_id"] = df["gen_id"].astype(str)
        bus_of_gen = dict(zip(df["gen_id"], df["bus"].astype(str)))
        carrier_of_gen = dict(zip(df["gen_id"], df["carrier"].astype(str)))
        gen_bus = np.array([bus_of_gen.get(g, "") for g in gen_ids])
        gen_car = np.array([carrier_of_gen.get(g, "") for g in gen_ids])
    return z, sub_line_ids, line_pos, snapshots, gen_ids, gen_bus, gen_car


def _n_binding(z):
    """Pre-redispatch binding-line count per hour (legacy key or fix_stats col 0)."""
    if "n_binding" in getattr(z, "files", []):
        return np.asarray(z["n_binding"])
    return np.nan_to_num(np.asarray(z["fix_stats"])[:, 0]).astype(int)


def snapshots_index(top: int = 200):
    """Return the most-congested snapshots (by pre-redispatch binding count)."""
    z, *_ , = _npz()
    nb = _n_binding(z)
    snaps = np.asarray(z["snapshots"]).astype(str)
    order = np.argsort(nb)[::-1]
    out = [{"idx": int(i), "time": snaps[i], "n_binding": int(nb[i])}
           for i in order[:top] if nb[i] > 0]
    return {"snapshots": out, "total_hours": int(len(snaps)),
            "hours_with_overload": int((nb > 0).sum())}


def grid_state(idx: int, congested_only: bool = False, loading_min: float = 0.0):
    """Full map state for snapshot `idx`."""
    bus_xy, lines, links = _topology()
    z, sub_line_ids, line_pos, snapshots, gen_ids, gen_bus, gen_car = _npz()
    idx = max(0, min(int(idx), len(snapshots) - 1))

    fda = np.asarray(z["line_flow_da"][idx]).astype(float)
    fpo = np.asarray(z["line_flow_post"][idx]).astype(float)
    snom = np.asarray(z["s_nom"]).astype(float)
    snom_safe = np.where(snom > 0, snom, np.inf)

    out_lines = []
    for r in lines.itertuples():
        p = line_pos.get(r.line_id)
        b0 = bus_xy.get(r.bus0); b1 = bus_xy.get(r.bus1)
        if b0 is None or b1 is None:
            continue
        vnom = int(r.v_nom) if r.v_nom else 0
        rec = {
            "id": r.line_id, "v_nom": vnom,
            "x0": b0[0], "y0": b0[1], "x1": b1[0], "y1": b1[1],
            "color": V_COLORS.get(vnom, "#888888"),
        }
        if p is not None:
            fd = fda[p]; fp = fpo[p]; sn = snom_safe[p]
            rec["flow_da"] = round(float(fd), 1)
            rec["flow_post"] = round(float(fp), 1)
            rec["s_nom"] = round(float(snom[p]), 1)
            rec["load_da"] = round(float(abs(fd) / sn), 3)
            rec["load_post"] = round(float(abs(fp) / sn), 3)
        else:
            rec["flow_da"] = rec["flow_post"] = None
            rec["s_nom"] = round(float(r.s_nom or 0), 1)
            rec["load_da"] = rec["load_post"] = 0.0
        if congested_only and rec["load_da"] < loading_min:
            continue
        out_lines.append(rec)

    # ---- Per-bus redispatch (ramp-up / curtailment) ----
    dg = np.asarray(z["delta_gen"][idx]).astype(float)
    up = np.where(dg > 0, dg, 0.0)
    dn = np.where(dg < 0, -dg, 0.0)
    node = {}
    for b, u, d in zip(gen_bus, up, dn):
        if not b or (u < 0.1 and d < 0.1):
            continue
        e = node.setdefault(b, [0.0, 0.0])
        e[0] += u; e[1] += d
    nodes = []
    for b, (u, d) in node.items():
        xy = bus_xy.get(b)
        if xy is None or (u < 1.0 and d < 1.0):
            continue
        nodes.append({"bus": b, "lon": xy[0], "lat": xy[1],
                      "up_MW": round(u, 1), "down_MW": round(d, 1),
                      "net_MW": round(u - d, 1)})

    # ---- Top congested lines + what resolved them ----
    over_idx = np.flatnonzero(np.abs(fda) > snom_safe * 1.0)
    order = over_idx[np.argsort((np.abs(fda) / snom_safe)[over_idx])[::-1]][:25]
    id_at = {v: k for k, v in line_pos.items()}
    top = []
    for p in order:
        lid = id_at.get(int(p))
        if lid is None:
            continue
        ld = abs(fda[p]) / snom_safe[p]
        lp = abs(fpo[p]) / snom_safe[p]
        lrow = lines[lines["line_id"] == lid]
        vnom = int(lrow["v_nom"].iloc[0]) if len(lrow) else 0
        top.append({
            "id": lid, "v_nom": vnom, "s_nom": round(float(snom[p]), 0),
            "load_da": round(float(ld), 2), "load_post": round(float(lp), 2),
            "resolved": bool(lp <= 1.001),
            "relief_pct": round(float(100 * (ld - lp) / ld), 0) if ld > 0 else 0,
        })

    # ---- Snapshot summary ----
    carr_dn = {}
    for c, d in zip(gen_car, dn):
        if d > 0.1:
            carr_dn[c] = carr_dn.get(c, 0.0) + d
    carr_up = {}
    for c, u in zip(gen_car, up):
        if u > 0.1:
            carr_up[c] = carr_up.get(c, 0.0) + u
    summary = {
        "time": snapshots[idx], "idx": idx,
        "n_overloaded_pre": int(len(over_idx)),
        "n_overloaded_post": int((np.abs(fpo) > snom_safe).sum()),
        "total_curtailed_MW": round(float(dn.sum()), 0),
        "total_rampup_MW": round(float(up.sum()), 0),
        "curtail_by_carrier": {k: round(v, 0) for k, v in sorted(carr_dn.items(), key=lambda x: -x[1])},
        "rampup_by_carrier": {k: round(v, 0) for k, v in sorted(carr_up.items(), key=lambda x: -x[1])},
        # Indicative money cost (replacement generation + curtailment compensation),
        # NOT the slack-laden LP objective.
        "redispatch_cost_kEUR": round(
            sum(v * CARRIER_PRICE.get(k, 80) for k, v in carr_up.items())
            + sum(v * CARRIER_PRICE.get(k, 80) for k, v in carr_dn.items()), 0) / 1e3,
    }
    return {"lines": out_lines, "links": links, "nodes": nodes,
            "top_congested": top, "summary": summary}
