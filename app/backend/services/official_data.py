"""official_data.py — Data layer for the Official Data (Redispatch 2.0) view.

Official measures live in Postgres (grid.official_redispatch_*), built by
scripts/official/. The model side of the comparison comes from the CANONICAL
app dataset results/app_year.npz (since 2026-07-02; carries gen_carrier
inline). Falls back to the legacy redispatch2_final_deltas_hourly.npz.

Timestamps: official data is stored timestamptz (UTC); the simulation
snapshot axis is naive Europe/Berlin local time, so official series are
converted to Berlin local before aligning.
"""
from __future__ import annotations

import functools
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import text

from ..db import get_engine

CANON_NPZ = Path(__file__).resolve().parents[3] / "results" / "app_year.npz"
NPZ_PATH = Path(__file__).resolve().parents[3] / "results" / "redispatch2_final_deltas_hourly.npz"
DELTAS_CSV = Path(__file__).resolve().parents[3] / "results" / "redispatch2_final_deltas.csv"
MERIT_JSON = Path(__file__).resolve().parents[3] / "results" / "merit_order_app.json"

# model carrier -> comparison group (official technologies already use these keys)
CARRIER_GROUP = {
    "solar": "solar", "onwind": "onwind", "offwind": "offwind",
    "run_of_river": "run_of_river", "reservoir": "run_of_river",
    "biogas": "biomass", "biomass": "biomass", "waste": "other",
    "gas_chp": "gas", "gas_ccgt": "gas", "gas": "gas",
    "coal": "coal", "hard_coal": "coal", "lignite": "lignite",
    "oil": "oil", "phs": "phs", "nuclear": "nuclear",
    "hydrogen": "other", "other": "other",
}

SOURCE_INFO = [
    {"source": "netztransparenz", "label": "Netztransparenz (4 TSOs)", "level": "TSO",
     "status": "complete",
     "note": "All published TSO measures incl. RES curtailment since 10/2023"},
    {"source": "ewe_netz", "label": "EWE NETZ + Avacon (JSON API)", "level": "DSO",
     "status": "partial",
     "note": "Per-call records; no MW published (setpoint % only)"},
    {"source": "blocked", "label": "SH Netz / Bayernwerk / E.DIS / Westnetz",
     "level": "DSO", "status": "blocked",
     "note": "Cloudflare-walled portals; not machine-accessible"},
    {"source": "no_history", "label": "Netze BW / MITNETZ / WEMAG",
     "level": "DSO", "status": "no_history",
     "note": "API serves only a rolling ~7-day window or no per-measure export"},
]


def _q(sql: str, **params) -> pd.DataFrame:
    return pd.read_sql(text(sql), get_engine(), params=params or None)


def _f0(v) -> float:
    """NaN/None-safe float (DSO rows can have NULL energy)."""
    try:
        x = float(v)
    except (TypeError, ValueError):
        return 0.0
    return 0.0 if x != x else x


_TOKEN = __import__("re").compile(r"^[a-z_]+$")


def _filters(cond: list, params: dict, level=None, cause=None,
             direction=None, technology=None, col="") -> None:
    """Append optional measure filters; technology accepts a comma list."""
    if level:
        cond.append(f"{col}level = :lv"); params["lv"] = level
    if cause:
        cond.append(f"{col}cause = :ca"); params["ca"] = cause
    if direction:
        cond.append(f"{col}direction = :di"); params["di"] = direction
    if technology:
        techs = [t for t in technology.split(",") if _TOKEN.match(t)]
        if techs:
            quoted = ", ".join(f"'{t}'" for t in techs)
            cond.append(f"{col}technology IN ({quoted})")


# ------------------------------------------------------------------ summary

def summary() -> dict:
    tot = _q("""
        SELECT level, direction,
               count(*) n, sum(energy_mwh) mwh
        FROM grid.official_redispatch_measures
        GROUP BY level, direction""")
    ops = _q("""
        SELECT o.name, m.level, count(*) n, sum(m.energy_mwh) mwh
        FROM grid.official_redispatch_measures m
        JOIN grid.official_operators o USING (operator_id)
        GROUP BY 1, 2 ORDER BY mwh DESC NULLS LAST""")
    rng = _q("SELECT min(ts_start) a, max(ts_end) b "
             "FROM grid.official_redispatch_measures")
    by_level = {}
    for lv in ("TSO", "DSO"):
        sub = tot[tot.level == lv]
        by_level[lv] = {
            "n_measures": int(sub.n.sum()),
            "gwh_down": round(_f0(sub[sub.direction == "down"].mwh.sum()) / 1e3, 1),
            "gwh_up": round(_f0(sub[sub.direction == "up"].mwh.sum()) / 1e3, 1),
        }
    return {
        "range": [str(rng.a[0]), str(rng.b[0])],
        "levels": by_level,
        "operators": [
            {"name": r.name, "level": r.level, "n": int(r.n),
             "gwh": round(_f0(r.mwh) / 1e3, 1)}
            for r in ops.itertuples()],
        "sources": SOURCE_INFO,
    }


# ----------------------------------------------------------------- timeline

@functools.lru_cache(maxsize=1)
def _data_range() -> tuple:
    df = _q("SELECT min(ts AT TIME ZONE 'Europe/Berlin') a, "
            "max(ts AT TIME ZONE 'Europe/Berlin') b "
            "FROM grid.official_redispatch_national_hourly")
    return df.a[0], df.b[0]


def timeline(freq: str = "day", by: str = "technology",
             level: str | None = None, cause: str | None = None,
             direction: str = "down") -> dict:
    if by not in ("technology", "level", "cause"):
        by = "technology"
    cond, params = ["direction = :dir"], {"dir": direction}
    if level:
        cond.append("level = :lv"); params["lv"] = level
    if cause:
        cond.append("cause = :ca"); params["ca"] = cause
    trunc = {"hour": "hour", "day": "day", "week": "week"}.get(freq, "day")
    df = _q(f"""
        SELECT date_trunc('{trunc}', ts AT TIME ZONE 'Europe/Berlin') t,
               {by} k, sum(energy_mwh) mwh
        FROM grid.official_redispatch_national_hourly
        WHERE {' AND '.join(cond)}
        GROUP BY 1, 2 ORDER BY 1""", **params)
    if df.empty:
        return {"t": [], "series": {}}
    piv = df.pivot_table(index="t", columns="k", values="mwh",
                         aggfunc="sum", fill_value=0.0)
    # contiguous full-coverage axis so brush indices stay stable across filters
    rule = {"hour": "h", "day": "D", "week": "W-MON"}[trunc]
    lo, hi = _data_range()
    lo = pd.Timestamp(lo).floor("D") if trunc != "week" else piv.index.min()
    hi = pd.Timestamp(hi).floor("D") if trunc != "week" else piv.index.max()
    piv = piv.reindex(pd.date_range(min(lo, piv.index.min()),
                                    max(hi, piv.index.max()), freq=rule),
                      fill_value=0.0)
    # keep biggest series first so stacked areas read well
    piv = piv[piv.sum().sort_values(ascending=False).index]
    return {
        "t": [str(x) for x in piv.index],
        "freq": trunc,
        "series": {str(c): [round(float(v), 1) for v in piv[c].values]
                   for c in piv.columns},
    }


# ---------------------------------------------------------------------- map

def map_agg(start: str, end: str, level: str | None = None,
            cause: str | None = None, direction: str | None = None,
            technology: str | None = None) -> dict:
    cond = ["m.lat IS NOT NULL", "m.ts_start < :e", "m.ts_end > :s"]
    params = {"s": start, "e": end}
    _filters(cond, params, level, cause, direction, technology, col="m.")
    df = _q(f"""
        SELECT m.bus_id, m.lat, m.lon,
               sum(CASE WHEN m.direction='down' THEN COALESCE(m.energy_mwh,0) ELSE 0 END) mwh_down,
               sum(CASE WHEN m.direction='up' THEN COALESCE(m.energy_mwh,0) ELSE 0 END) mwh_up,
               count(*) n,
               (array_agg(m.technology ORDER BY m.energy_mwh DESC NULLS LAST))[1] tech,
               (array_agg(m.level ORDER BY m.energy_mwh DESC NULLS LAST))[1] level,
               (array_agg(m.cause ORDER BY m.energy_mwh DESC NULLS LAST))[1] cause,
               (array_agg(m.plant_name ORDER BY m.energy_mwh DESC NULLS LAST))[1] top_plant
        FROM grid.official_redispatch_measures m
        WHERE {' AND '.join(cond)}
        GROUP BY 1, 2, 3""", **params)
    nodes = [
        {"bus": r.bus_id, "lat": round(float(r.lat), 4), "lon": round(float(r.lon), 4),
         "down": round(float(r.mwh_down or 0), 1), "up": round(float(r.mwh_up or 0), 1),
         "n": int(r.n), "tech": r.tech, "level": r.level, "cause": r.cause,
         "plant": r.top_plant}
        for r in df.itertuples()]
    nodes.sort(key=lambda x: -(x["down"] + x["up"]))
    return {"nodes": nodes[:1200]}


# ---------------------------------------------------------------- breakdown

def breakdown(start: str, end: str, level: str | None = None,
              cause_f: str | None = None, direction: str | None = None,
              technology: str | None = None) -> dict:
    cond, params = ["m.ts_start < :e", "m.ts_end > :s"], {"s": start, "e": end}
    _filters(cond, params, level, cause_f, direction, technology, col="m.")
    base = f"FROM grid.official_redispatch_measures m WHERE {' AND '.join(cond)}"
    tech = _q(f"SELECT m.technology k, m.direction, sum(m.energy_mwh) mwh {base} "
              "GROUP BY 1, 2", **params)
    cause = _q(f"SELECT m.cause k, sum(m.energy_mwh) mwh, count(*) n {base} "
               "GROUP BY 1", **params)
    ops = _q(f"""SELECT o.name k, m.level, sum(m.energy_mwh) mwh, count(*) n
                 {base.replace('measures m', 'measures m JOIN grid.official_operators o USING (operator_id)')}
                 GROUP BY 1, 2 ORDER BY mwh DESC NULLS LAST""", **params)
    kpi = _q(f"""SELECT m.direction, m.level, sum(m.energy_mwh) mwh, count(*) n
                 {base} GROUP BY 1, 2""", **params)

    def rows(df, cols):
        recs = df.astype(object).where(pd.notna(df), None).to_dict("records")
        return [{c: (round(float(r[c]), 1) if isinstance(r[c], float) else
                     int(r[c]) if isinstance(r[c], (int, np.integer)) else r[c])
                 for c in cols}
                for r in recs]

    return {
        "technology": rows(tech, ["k", "direction", "mwh"]),
        "cause": rows(cause, ["k", "mwh", "n"]),
        "operators": rows(ops.head(15), ["k", "level", "mwh", "n"]),
        "kpi": rows(kpi, ["direction", "level", "mwh", "n"]),
    }


# ----------------------------------------------------------------- measures

def measures(bus: str | None = None, operator: str | None = None,
             start: str | None = None, end: str | None = None,
             level: str | None = None, cause: str | None = None,
             direction: str | None = None, technology: str | None = None,
             limit: int = 200) -> list[dict]:
    cond, params = ["1=1"], {"lim": min(limit, 1000)}
    _filters(cond, params, level, cause, direction, technology, col="m.")
    if bus:
        cond.append("m.bus_id = :bus"); params["bus"] = bus
    if operator:
        cond.append("o.name = :op"); params["op"] = operator
    if start:
        cond.append("m.ts_end > :s"); params["s"] = start
    if end:
        cond.append("m.ts_start < :e"); params["e"] = end
    df = _q(f"""
        SELECT m.ts_start, m.ts_end, m.direction, m.mean_mw, m.energy_mwh,
               m.cause, m.technology, m.plant_name, m.level, o.name operator
        FROM grid.official_redispatch_measures m
        JOIN grid.official_operators o USING (operator_id)
        WHERE {' AND '.join(cond)}
        ORDER BY m.energy_mwh DESC NULLS LAST LIMIT :lim""", **params)
    out = []
    for r in df.itertuples():
        out.append({
            "start": str(r.ts_start), "end": str(r.ts_end), "dir": r.direction,
            "mw": round(float(r.mean_mw), 1) if pd.notna(r.mean_mw) else None,
            "mwh": round(float(r.energy_mwh), 1) if pd.notna(r.energy_mwh) else None,
            "cause": r.cause, "tech": r.technology, "plant": r.plant_name,
            "level": r.level, "operator": r.operator})
    return out


# ------------------------------------------------------------------ compare

@functools.lru_cache(maxsize=1)
def _model_hourly() -> pd.DataFrame:
    """Hourly model redispatch down/up MW by comparison group (8760 x groups)."""
    if CANON_NPZ.exists():
        z = np.load(CANON_NPZ, allow_pickle=True, mmap_mode="r")
    else:
        z = np.load(NPZ_PATH, allow_pickle=True, mmap_mode="r")
    snaps = pd.to_datetime(np.asarray(z["snapshots"]).astype(str))
    gen_ids = np.asarray(z["gen_ids"]).astype(str)
    if "gen_carrier" in getattr(z, "files", []):
        carriers = np.asarray(z["gen_carrier"]).astype(str)
    else:
        meta = pd.read_csv(DELTAS_CSV)
        meta["gen_id"] = meta["gen_id"].astype(str)
        carrier_of = dict(zip(meta["gen_id"], meta["carrier"].astype(str)))
        carriers = np.array([carrier_of.get(g, "other") for g in gen_ids])
    groups = np.array([CARRIER_GROUP.get(c, "other") for c in carriers])
    # exclude cross-border import/export pseudo-generators
    mask = ~np.char.startswith(carriers, "import")
    delta = np.asarray(z["delta_gen"])[:, mask]
    groups = groups[mask]
    frames = {}
    for g in np.unique(groups):
        sel = delta[:, groups == g]
        frames[("down", g)] = np.maximum(-sel, 0).sum(axis=1)
        frames[("up", g)] = np.maximum(sel, 0).sum(axis=1)
    df = pd.DataFrame(frames, index=snaps)
    df.columns = pd.MultiIndex.from_tuples(df.columns, names=["dir", "group"])
    return df


@functools.lru_cache(maxsize=1)
def merit() -> dict:
    """Merit-order dispatch (grid_beta MILP, no network) vs real 2025 market
    data (SMARD day-ahead price + Energy-Charts generation), pre-extracted by
    scripts/official/extract_merit_order.py."""
    import json
    return json.loads(MERIT_JSON.read_text())


def compare(freq: str = "day", technology: str | None = None) -> dict:
    model = _model_hourly()
    cond, params = [], {}
    sql_tech = ""
    if technology:
        sql_tech = "AND technology = :tech"
        params["tech"] = technology
    off = _q(f"""
        SELECT date_trunc('hour', ts AT TIME ZONE 'Europe/Berlin') t, direction,
               sum(mw) mw
        FROM grid.official_redispatch_national_hourly
        WHERE level = 'TSO' AND cause IN ('congestion', 'voltage') {sql_tech}
        GROUP BY 1, 2""", **params)
    if technology:
        if technology in set(model.columns.get_level_values("group")):
            m_down = model[("down", technology)]
            m_up = model[("up", technology)]
        else:
            m_down = pd.Series(0.0, index=model.index)
            m_up = m_down
    else:
        m_down = model["down"].sum(axis=1)
        m_up = model["up"].sum(axis=1)

    piv = off.pivot_table(index="t", columns="direction", values="mw",
                          aggfunc="sum", fill_value=0.0)
    idx = m_down.index
    o_down = piv.get("down", pd.Series(dtype=float)).reindex(idx, fill_value=0.0)
    o_up = piv.get("up", pd.Series(dtype=float)).reindex(idx, fill_value=0.0)

    rule = {"hour": "h", "day": "D", "week": "W"}.get(freq, "D")
    f = pd.DataFrame({"model_down": m_down, "model_up": m_up,
                      "off_down": o_down, "off_up": o_up}).resample(rule).mean()

    valid = (f["off_down"] > 0) | (f["model_down"] > 0)
    corr = float(f.loc[valid, "off_down"].corr(f.loc[valid, "model_down"])) if valid.sum() > 2 else None
    sum_o, sum_m = float(f["off_down"].sum()), float(f["model_down"].sum())
    return {
        "t": [str(x) for x in f.index],
        "official": {"down": [round(float(v), 1) for v in f["off_down"]],
                     "up": [round(float(v), 1) for v in f["off_up"]]},
        "model": {"down": [round(float(v), 1) for v in f["model_down"]],
                  "up": [round(float(v), 1) for v in f["model_up"]]},
        "stats": {
            "corr_down": round(corr, 3) if corr is not None else None,
            "ratio_down": round(sum_m / sum_o, 3) if sum_o > 0 else None,
            "twh_official_down": round(sum_o * (24 if rule == "D" else 168 if rule == "W" else 1) / 1e6, 2),
            "twh_model_down": round(sum_m * (24 if rule == "D" else 168 if rule == "W" else 1) / 1e6, 2),
        },
    }


def _haversine(lat1, lon1, lat2, lon2):
    import numpy as _np
    R = 6371.0; p = _np.pi / 180
    a = (_np.sin((lat2 - lat1) * p / 2) ** 2
         + _np.cos(lat1 * p) * _np.cos(lat2 * p) * _np.sin((lon2 - lon1) * p / 2) ** 2)
    return 2 * R * _np.arcsin(_np.sqrt(a))


@functools.lru_cache(maxsize=1)
def plants_compare(top: int = 60):
    """Per-plant redispatch comparison: did the model curtail (down) / ramp up (up) the
    same plants as the official 2025 redispatch? For each top official plant (by total
    redispatch energy) we sum the official down/up energy and the model's down/up of the
    generators of the same technology within 20 km. Returned for a scatter (official vs
    model) so agreement = points on the diagonal."""
    off = _q("""
        SELECT plant_name, technology, avg(lat) lat, avg(lon) lon,
               COALESCE(sum(energy_mwh) FILTER (WHERE direction='down'),0)/1e3 down_gwh,
               COALESCE(sum(energy_mwh) FILTER (WHERE direction='up'),0)/1e3 up_gwh
        FROM grid.official_redispatch_measures
        WHERE plant_name IS NOT NULL AND lat IS NOT NULL
              AND plant_name <> 'Börse' AND technology IS NOT NULL
        GROUP BY plant_name, technology
        ORDER BY (COALESCE(sum(energy_mwh) FILTER (WHERE direction='down'),0)
                  + COALESCE(sum(energy_mwh) FILTER (WHERE direction='up'),0)) DESC
        LIMIT :n""", n=int(top))
    from .app_sample import _data, _topo
    z, gen_bus, gen_car, gen_pnom, *_ = _data()
    xy, _lines = _topo()
    glon = np.array([xy.get(b, (np.nan, np.nan))[0] for b in gen_bus], float)
    glat = np.array([xy.get(b, (np.nan, np.nan))[1] for b in gen_bus], float)
    ggrp = np.array([CARRIER_GROUP.get(c, "other") for c in gen_car])
    dg = np.asarray(z["delta_gen"])                       # (H, G) MW, +up / -down
    up_g = np.maximum(dg, 0).sum(0) / 1e3                  # GWh per gen, ramp up
    dn_g = -np.minimum(dg, 0).sum(0) / 1e3                 # GWh per gen, curtail down
    groups = set(CARRIER_GROUP.values())
    rows = []
    for _, p in off.iterrows():
        grp = p.technology if p.technology in groups else CARRIER_GROUP.get(p.technology, "other")
        m = (ggrp == grp) & np.isfinite(glat) & np.isfinite(glon)
        cap = 0.0; mind = None; mdn = 0.0; mup = 0.0; mlat = None; mlon = None
        if m.any():
            d = _haversine(float(p.lat), float(p.lon), glat[m], glon[m])
            mind = float(np.nanmin(d))
            near = d < 20
            cap = float(gen_pnom[m][near].sum())
            mdn = float(dn_g[m][near].sum()); mup = float(up_g[m][near].sum())
            if near.any():
                w = gen_pnom[m][near]; wsum = w.sum() or 1.0
                mlat = round(float((glat[m][near] * w).sum() / wsum), 3)
                mlon = round(float((glon[m][near] * w).sum() / wsum), 3)
        rows.append({"name": p.plant_name, "tech": p.technology, "lat": round(float(p.lat), 3),
                     "lon": round(float(p.lon), 3), "mlat": mlat, "mlon": mlon,
                     "model_cap_MW": round(cap),
                     "nearest_km": round(mind, 1) if mind is not None else None,
                     "in_model": cap > 0,
                     "off_down": round(float(p.down_gwh), 1), "off_up": round(float(p.up_gwh), 1),
                     "mod_down": round(mdn, 1), "mod_up": round(mup, 1)})
    # agreement: of plants the official curtailed, how many did the model also curtail
    od = [r for r in rows if r["off_down"] > 10]
    agree_dn = sum(1 for r in od if r["mod_down"] > 1)
    ou = [r for r in rows if r["off_up"] > 10]
    agree_up = sum(1 for r in ou if r["mod_up"] > 1)
    return {"plants": rows, "n": len(rows), "in_model": sum(r["in_model"] for r in rows),
            "agree_down": [agree_dn, len(od)], "agree_up": [agree_up, len(ou)],
            "note": f"Of the {len(od)} plants the TSOs curtailed, the model also curtailed "
                    f"the same location for {agree_dn}. Up-ramp matches {agree_up}/{len(ou)}."}
