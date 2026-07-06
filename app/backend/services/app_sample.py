"""app_sample.py — Data layer for the 1000-hour grid-explorer app.

Serves, per sampled timestamp:
  * line flows pre/post + loading,
  * per-bus generation (dispatch), installed capacity, load, and curtailment,
  * country totals: load and generation/curtailment by technology,
plus a per-node detail (capacity + generation + curtailment by carrier) for click-through.

Reads results/app_sample1000.npz (built by scripts/simulation/build_app_sample.py),
memory-mapped, joined to bus coordinates + line endpoints from the database.
"""
from __future__ import annotations
import functools
from pathlib import Path
import numpy as np
import pandas as pd
from sqlalchemy import text
from ..db import SCN, scn_for, get_engine

# A line counts as overloaded only above the redispatch LP's own tolerance:
# the solver deliberately binds lines exactly AT their rating, so a strict >1.0
# would misreport at-rating float dust (loading 1.0000x) as violations.
OVERLOAD_TOL = 1.001

_RESULTS = Path(__file__).resolve().parents[3] / "results"
# Two run datasets: "n0" = base-case (N-0) redispatch, "n1" = N-1-secured
# redispatch (preventive security against single-line outages). The N-0 path
# falls back to the 1000-hour sample if the full year isn't built yet.
NPZ_N0 = _RESULTS / "app_year.npz"
if not NPZ_N0.exists():
    NPZ_N0 = _RESULTS / "app_sample1000.npz"
NPZ_N1 = _RESULTS / "app_year_n1.npz"
N1_SCREEN = _RESULTS / "app_year_n1_screen.npz"   # sidecar: per-hour LODF screening
V_COLORS = {110: "#2b6cff", 220: "#16c784", 380: "#ff3b3b"}


def _npz(year: int, ds: str) -> Path:
    """Redispatch dataset path for a scenario year + dataset (n0/n1).

    2025 keeps the canonical app_year.npz (n1 has a separate file if built).
    Horizon years store one fixpoint run (N-0+N-1 in a single solve) as
    app_year_{year}.npz — both ds values resolve to it.
    """
    if int(year) == 2025:
        return NPZ_N1 if (ds == "n1" and NPZ_N1.exists()) else NPZ_N0
    return _RESULTS / f"app_year_{int(year)}.npz"


def _screen_path(year: int) -> Path:
    if int(year) == 2025:
        return N1_SCREEN
    return _RESULTS / f"app_year_{int(year)}_n1_screen.npz"


def available_years() -> list[int]:
    """Scenario years whose redispatch npz exists (2025 always; horizons if built)."""
    from ..db import SCENARIOS
    return [y for y in sorted(SCENARIOS) if _npz(y, "n0").exists()]


def _norm_ds(year: int, ds: str) -> str:
    if int(year) == 2025:
        return "n1" if (str(ds) == "n1" and NPZ_N1.exists()) else "n0"
    return "n0"   # horizon: single fixpoint dataset


def datasets():
    """Which run datasets + scenario years exist (frontend gates its selectors)."""
    out = [{"id": "n0", "label": "Canonical run (N-0 + N-1)",
            "desc": "full year: whole-grid N-0 redispatch with "
                    "N-1 securing inside the same solve"}]
    if NPZ_N1.exists():
        out.append({"id": "n1", "label": "N-1 secured",
                    "desc": "Preventive redispatch: no single line outage may overload any line",
                    "screened": N1_SCREEN.exists()})
    return {"datasets": out, "years": available_years()}


@functools.lru_cache(maxsize=8)
def _n1_screen(year: int = 2025):
    """Per-hour N-1 contingency screening (build_n1_screen.py), fully loaded (small)."""
    p = _screen_path(year)
    if not p.exists():
        return None
    z = np.load(p, allow_pickle=True)
    return {k: np.asarray(z[k]) for k in z.files}


@functools.lru_cache(maxsize=8)
def _topo(year: int = 2025):
    scn = scn_for(year)
    eng = get_engine()
    with eng.connect() as c:
        buses = pd.read_sql(text("SELECT bus_id,v_nom,x AS lon,y AS lat FROM grid.egon_etrago_bus WHERE scn_name=:s"),
                            c, params={"s": scn})
        lines = pd.read_sql(text("SELECT line_id,bus0,bus1,v_nom FROM grid.egon_etrago_line WHERE scn_name=:s"),
                            c, params={"s": scn})
    buses["bus_id"] = buses["bus_id"].astype(str)
    xy = {r.bus_id: (float(r.lon), float(r.lat), float(r.v_nom)) for r in buses.itertuples()}
    lines["line_id"] = lines["line_id"].astype(str)
    lines["bus0"] = lines["bus0"].astype(str); lines["bus1"] = lines["bus1"].astype(str)
    return xy, lines


@functools.lru_cache(maxsize=1)
def _bus_names():
    """bus_id (str) -> substation name from grid.egon_bus_metadata.

    Scenario-independent (keyed on bus_id alone), so shared across years. New
    horizon buses simply have no metadata row → callers tolerate a missing name.
    """
    eng = get_engine()
    with eng.connect() as c:
        df = pd.read_sql(text("SELECT bus_id, subst_name FROM grid.egon_bus_metadata "
                              "WHERE subst_name IS NOT NULL"), c)
    return {str(r.bus_id): str(r.subst_name) for r in df.itertuples()}


@functools.lru_cache(maxsize=8)
def _data(year: int = 2025, ds: str = "n0"):
    z = np.load(_npz(year, ds), allow_pickle=True, mmap_mode="r")
    gen_bus = np.asarray(z["gen_bus"]).astype(str)
    gen_car = np.asarray(z["gen_carrier"]).astype(str)
    gen_pnom = np.asarray(z["gen_p_nom"]).astype(np.float64)
    bus_ids = np.asarray(z["bus_ids"]).astype(str)
    sub_lines = np.asarray(z["sub_line_ids"]).astype(str)
    line_pos = {l: i for i, l in enumerate(sub_lines)}
    snaps = np.asarray(z["snapshots"]).astype(str)
    import_mask = np.char.startswith(gen_car, "import")
    # static installed capacity per (bus, carrier) and per bus
    cap_df = pd.DataFrame({"bus": gen_bus, "carrier": gen_car, "p_nom": gen_pnom})
    cap_by_bus_car = cap_df.groupby(["bus", "carrier"]).p_nom.sum()
    cap_by_bus = cap_df.groupby("bus").p_nom.sum()
    return (z, gen_bus, gen_car, gen_pnom, bus_ids, sub_lines, line_pos, snaps,
            cap_by_bus_car, cap_by_bus, import_mask)


_MMDIR = _RESULTS / ".mmcache"

@functools.lru_cache(maxsize=96)
def _mm(year: int, ds: str, key: str):
    """Memory-mapped per-hour array. np.load(mmap_mode=) is IGNORED for .npz, and these
    datasets are savez_compressed, so slicing z[key][i] re-decompresses the whole array
    (~0.3 GB) on EVERY call — ~5 s per hour. We materialise each big array to an
    uncompressed .npy sidecar once (keyed by file mtime) and mmap that, so a per-hour
    slice is O(row) with no full decompress."""
    path = _npz(year, ds)
    _MMDIR.mkdir(exist_ok=True)
    f = _MMDIR / f"{path.stem}_{int(path.stat().st_mtime)}_{key}.npy"
    if not f.exists():
        z = np.load(path, allow_pickle=True)
        np.save(f, np.asarray(z[key])); del z
    return np.load(f, mmap_mode="r")


@functools.lru_cache(maxsize=16)
def snapshots(ds: str = "n0", year: int = 2025):
    ds = _norm_ds(year, ds)
    z, *_rest = _data(year, ds)
    snaps = _rest[6]
    load_by_bus = _mm(year, ds, "load_by_bus")   # mmap sidecar, not npz decompress
    # "h" = absolute hour-of-year index, so the frontend can keep the cursor on
    # the same moment when switching between datasets with different samplings
    # (the N-0 run may be a subsample while the N-1 run is the full 8760).
    hours = np.asarray(z["hours"]).astype(int) if "hours" in z else np.arange(len(snaps))
    out = [{"i": int(i), "h": int(hours[i]), "time": snaps[i],
            "load_GW": round(float(load_by_bus[i].sum()) / 1e3, 1)}
           for i in range(len(snaps))]
    return {"snapshots": out, "count": len(out), "dataset": ds}


def line_overload_hours(ds: str = "n0", year: int = 2025):
    """Per-line hours/year overloaded (pre and post redispatch), with geometry — for the
    annual congestion-frequency map layer."""
    z, *_rest = _data(year, _norm_ds(year, ds))
    sub_lines = _rest[4]
    if "ovl_hours_da" not in z:
        return {"lines": [], "max_hours": 0}
    ovl_da = np.asarray(z["ovl_hours_da"]).astype(float)
    ovl_po = np.asarray(z["ovl_hours_post"]).astype(float)
    xy, lines = _topo(year)
    pos = {l: i for i, l in enumerate(sub_lines)}
    out = []
    for r in lines.itertuples():
        p = pos.get(r.line_id)
        if p is None:
            continue
        hda, hpo = round(float(ovl_da[p]), 0), round(float(ovl_po[p]), 0)
        if hda < 1 and hpo < 1:
            continue
        b0, b1 = xy.get(r.bus0), xy.get(r.bus1)
        if b0 is None or b1 is None:
            continue
        out.append({"id": r.line_id, "v": int(r.v_nom) if r.v_nom else 0,
                    "x0": b0[0], "y0": b0[1], "x1": b1[0], "y1": b1[1],
                    "h_da": hda, "h_post": hpo})
    out.sort(key=lambda d: -d["h_post"])
    return {"lines": out, "max_hours": 8760, "count": len(out)}


def state(i: int, ds: str = "n0", year: int = 2025):
    ds = _norm_ds(year, ds)
    (z, gen_bus, gen_car, gen_pnom, bus_ids, sub_lines, line_pos, snaps,
     _cbc, cap_by_bus, import_mask) = _data(year, ds)
    i = max(0, min(int(i), len(snaps) - 1))
    xy, lines = _topo(year)
    bpos = {b: k for k, b in enumerate(bus_ids)}

    p_da = np.asarray(_mm(year, ds, "p_da")[i]).astype(np.float64)
    dg = np.asarray(_mm(year, ds, "delta_gen")[i]).astype(np.float64)
    curt = np.maximum(-dg, 0.0)
    load_bus = np.asarray(_mm(year, ds, "load_by_bus")[i]).astype(np.float64)

    # aggregate generation + curtailment per bus
    gen_by_bus = pd.Series(p_da).groupby(gen_bus).sum()
    curt_by_bus = pd.Series(curt).groupby(gen_bus).sum()

    nodes = []
    for b, (lon, lat, v) in xy.items():
        g = float(gen_by_bus.get(b, 0.0))
        cu = float(curt_by_bus.get(b, 0.0))
        ld = float(load_bus[bpos[b]]) if b in bpos else 0.0
        cap = float(cap_by_bus.get(b, 0.0))
        if g < 0.5 and ld < 0.5 and cap < 0.5 and cu < 0.5:
            continue
        nodes.append({"bus": b, "lon": lon, "lat": lat, "v": int(v),
                      "gen_MW": round(g, 1), "load_MW": round(ld, 1),
                      "curtail_MW": round(cu, 1), "cap_MW": round(cap, 1)})

    # lines with flow/loading
    fda = np.asarray(_mm(year, ds, "line_flow_da")[i]).astype(float)
    fpo = np.asarray(_mm(year, ds, "line_flow_post")[i]).astype(float)
    snom = np.asarray(z["s_nom"]).astype(float); snom_safe = np.where(snom > 0, snom, np.inf)
    loading_da = np.abs(fda) / snom_safe
    loading_post = np.abs(fpo) / snom_safe
    mon = np.asarray(z["mon_line_mask"]).astype(bool)
    n_over = int((loading_da > OVERLOAD_TOL).sum())
    n_over_mon = int((loading_da[mon] > OVERLOAD_TOL).sum())
    n_over_post = int((loading_post > OVERLOAD_TOL).sum())  # residual after redispatch
    # split overloads by grid level: 110 kV = DSO domain, ≥220 kV = TSO/ÜNB domain
    vmap = dict(zip(lines["line_id"], lines["v_nom"]))
    sub_vnom = np.array([float(vmap.get(l, 0)) for l in sub_lines])
    is_dso = sub_vnom <= 110; is_tso = sub_vnom >= 220
    over_da = loading_da > OVERLOAD_TOL; over_po = loading_post > OVERLOAD_TOL
    n_dso = int((over_da & is_dso).sum()); n_dso_post = int((over_po & is_dso).sum())
    n_tso = int((over_da & is_tso).sum()); n_tso_post = int((over_po & is_tso).sum())
    max_load_da = float(loading_da.max()) if loading_da.size else 0.0
    max_load_post = float(loading_post.max()) if loading_post.size else 0.0
    out_lines = []
    for r in lines.itertuples():
        b0 = xy.get(r.bus0); b1 = xy.get(r.bus1)
        if b0 is None or b1 is None:
            continue
        p = line_pos.get(r.line_id)
        v = int(r.v_nom) if r.v_nom else 0
        rec = {"id": r.line_id, "v": v, "x0": b0[0], "y0": b0[1], "x1": b1[0], "y1": b1[1],
               "bus0": str(r.bus0), "bus1": str(r.bus1),
               "color": V_COLORS.get(v, "#888")}
        if p is not None:
            rec["flow_da"] = round(float(fda[p]), 1); rec["flow_post"] = round(float(fpo[p]), 1)
            rec["load_da"] = round(float(abs(fda[p]) / snom_safe[p]), 3)
            rec["load_post"] = round(float(abs(fpo[p]) / snom_safe[p]), 3)
        else:
            rec["flow_da"] = rec["flow_post"] = None; rec["load_da"] = rec["load_post"] = 0.0
        out_lines.append(rec)

    # Top overloaded lines this hour (by worst of pre/post loading), with both values
    vnom_map = dict(zip(lines["line_id"], lines["v_nom"]))
    worst = np.maximum(loading_da, loading_post)
    order = np.argsort(worst)[::-1][:10]
    top_overloads = []
    for k in order:
        if worst[k] <= 0.9:
            break
        top_overloads.append({
            "id": str(sub_lines[k]), "v": int(float(vnom_map.get(sub_lines[k], 0)) or 0),
            "s_nom": round(float(snom[k]), 0),
            "load_da": round(float(loading_da[k]), 2), "load_post": round(float(loading_post[k]), 2),
            "flow_da": round(float(fda[k]), 0), "flow_post": round(float(fpo[k]), 0),
        })

    # What was curtailed this hour: top (carrier, bus) groups by MW reduced
    neg = dg < -0.5
    curt_rows = []
    if neg.any():
        cd = pd.DataFrame({"carrier": gen_car[neg], "bus": gen_bus[neg], "mw": -dg[neg]})
        g = cd.groupby(["carrier", "bus"]).mw.sum().sort_values(ascending=False).head(12)
        curt_rows = [{"carrier": c, "bus": b, "mw": round(float(m), 1)} for (c, b), m in g.items()]

    # ...and who was ramped UP to compensate / relieve (the other half of redispatch)
    posi = dg > 0.5
    rampup_rows = []
    if posi.any():
        ud = pd.DataFrame({"carrier": gen_car[posi], "bus": gen_bus[posi], "mw": dg[posi]})
        gu = ud.groupby(["carrier", "bus"]).mw.sum().sort_values(ascending=False).head(12)
        rampup_rows = [{"carrier": c, "bus": b, "mw": round(float(m), 1)} for (c, b), m in gu.items()]

    # Energy balance: imports are generators (carrier import_*), exports are loads,
    # storage shifts supply<->demand, and the upstream day-ahead schedule leaves a
    # slack residual. Split them all out so generation vs load reconciles.
    domestic_gen = float(p_da[~import_mask].sum())
    imports = float(p_da[import_mask].sum())
    total_load = float(load_bus.sum())                       # domestic load only
    exports = float(np.asarray(z["export_by_snap"][i])) if "export_by_snap" in z else 0.0
    storage = float(np.asarray(z["storage_by_snap"][i])) if "storage_by_snap" in z else 0.0  # +discharge/−charge
    # The day-ahead schedule is balanced by a distributed slack (see
    # _redispatch_core.rebalance_dispatch); residual is the MW head-room couldn't
    # absorb (≈0 except in extreme hours). Recompute directly so it always ties out.
    slack = (domestic_gen + imports + storage) - (total_load + exports)

    # country totals by technology (domestic generation only; imports shown separately)
    keep = ~import_mask
    gen_by_tech = pd.Series(p_da[keep]).groupby(gen_car[keep]).sum()
    curt_by_tech = pd.Series(curt).groupby(gen_car).sum()
    gtech = {k: round(float(v), 0) for k, v in gen_by_tech.sort_values(ascending=False).items()
             if v > 1 and not k.startswith("export")}
    ctech = {k: round(float(v), 0) for k, v in curt_by_tech.sort_values(ascending=False).items() if v > 1}
    country = {
        "time": snaps[i], "i": i,
        "total_load_MW": round(total_load, 0),
        "total_gen_MW": round(domestic_gen, 0),
        "imports_MW": round(imports, 0),
        "exports_MW": round(exports, 0),
        "storage_MW": round(storage, 0),
        "slack_MW": round(slack, 0),
        "total_curtail_MW": round(float(curt.sum()), 0),
        "n_overload": n_over,
        "n_overload_monitored": n_over_mon,
        "n_overload_post": n_over_post,
        "n_dso": n_dso, "n_dso_post": n_dso_post,        # 110 kV (DSO domain)
        "n_tso": n_tso, "n_tso_post": n_tso_post,        # ≥220 kV (TSO/ÜNB domain)
        "max_loading_da": round(max_load_da, 2),
        "max_loading_post": round(max_load_post, 2),
        "gen_by_tech_MW": gtech,
        "curtail_by_tech_MW": ctech,
        "top_overloads": top_overloads,
        "curtail_rows": curt_rows,
        "rampup_rows": rampup_rows,
        "dataset": ds,
        "year": int(year),
    }

    # N-1 contingency picture for this hour (sidecar screening): how many
    # (monitored line, outaged line) pairs would overload under a single outage,
    # before and after the security redispatch, plus the worst residual pairs.
    # 2025: only in the n1 dataset. Horizon: the fixpoint run already secures
    # N-1, so attach the screen whenever its sidecar exists.
    sc = _n1_screen(year) if (ds == "n1" or int(year) != 2025) else None
    if sc is not None and i < len(sc["n1_viol_da"]):
        pairs = []
        for k in range(sc["top_m"].shape[1]):
            m = int(sc["top_m"][i, k]); cpos = int(sc["top_c"][i, k])
            if m < 0:
                break
            mid = str(sub_lines[m]); cid = str(sub_lines[cpos])
            pairs.append({"line": mid, "v": int(float(vnom_map.get(mid, 0)) or 0),
                          "outage": cid,
                          "loading": round(float(sc["top_load"][i, k]), 2)})
        country["n1"] = {
            "n_cont": int(sc["n1_ncont"][i]),
            "viol_pre": int(sc["n1_viol_da"][i]),
            "viol_post": int(sc["n1_viol_post"][i]),
            "worst_pre": round(float(sc["n1_worst_da"][i]), 2),
            "worst_post": round(float(sc["n1_worst_post"][i]), 2),
            "pairs": pairs,
        }
    # Static HVDC links (offshore export cables + interconnectors) so the flow
    # maps can draw the DC layer alongside the AC lines.
    return {"nodes": nodes, "lines": out_lines,
            "links": grid_topology(year)["links"], "country": country}


@functools.lru_cache(maxsize=8)
def grid_topology(year: int = 2025):
    """Static grid topology for the Grid tab: every line with technical data, all
    transformers (incl. phase-shifters, trafo_id >= 32000), and every bus with its
    voltage level — all positioned."""
    scn = scn_for(year)
    eng = get_engine()
    with eng.connect() as c:
        lines = pd.read_sql(text("""
            SELECT line_id, bus0, bus1, v_nom, s_nom, length, x, r, cables
            FROM grid.egon_etrago_line WHERE scn_name=:s"""), c, params={"s": scn})
        trafos = pd.read_sql(text("""
            SELECT trafo_id, bus0, bus1, s_nom FROM grid.egon_etrago_transformer
            WHERE scn_name=:s"""), c, params={"s": scn})
        links = pd.read_sql(text("""
            SELECT link_id, bus0, bus1, p_nom, length, carrier
            FROM grid.egon_etrago_link WHERE scn_name=:s"""), c, params={"s": scn})
    xy, _ = _topo(year)
    out_lines = []
    for r in lines.itertuples():
        b0, b1 = xy.get(str(r.bus0)), xy.get(str(r.bus1))
        if b0 is None or b1 is None:
            continue
        def _f(v):   # NaN-safe (new horizon lines may lack cables/length)
            return 0.0 if v is None or v != v else float(v)
        out_lines.append({"id": str(r.line_id), "v": int(_f(r.v_nom)),
                          "x0": b0[0], "y0": b0[1], "x1": b1[0], "y1": b1[1],
                          "s_nom": round(_f(r.s_nom), 0),
                          "length_km": round(_f(r.length), 2),
                          "x_ohm": round(_f(r.x), 4), "r_ohm": round(_f(r.r), 4),
                          "cables": int(_f(r.cables)),
                          "bus0": str(r.bus0), "bus1": str(r.bus1)})
    out_trafos = []
    for r in trafos.itertuples():
        b0, b1 = xy.get(str(r.bus0)), xy.get(str(r.bus1))
        if b0 is None or b1 is None:
            continue
        v0, v1 = int(b0[2]), int(b1[2])
        out_trafos.append({"id": str(r.trafo_id), "lon": b0[0], "lat": b0[1],
                           "v0": v0, "v1": v1, "s_nom": round(float(r.s_nom or 0), 0),
                           "pst": int(r.trafo_id) >= 32000,
                           "bus0": str(r.bus0), "bus1": str(r.bus1)})
    out_links = []
    for r in links.itertuples():
        b0, b1 = xy.get(str(r.bus0)), xy.get(str(r.bus1))
        if b0 is None or b1 is None:
            continue
        out_links.append({"id": str(r.link_id),
                          "x0": b0[0], "y0": b0[1], "x1": b1[0], "y1": b1[1],
                          "p_nom": round(float(r.p_nom or 0), 0),
                          "length_km": round(float(r.length or 0), 1),
                          "carrier": str(r.carrier or "DC"),
                          "bus0": str(r.bus0), "bus1": str(r.bus1)})
    names = _bus_names()
    out_buses = [{"bus": b, "lon": v[0], "lat": v[1], "v": int(v[2]),
                  "name": names.get(b)} for b, v in xy.items()]
    return {"lines": out_lines, "trafos": out_trafos, "buses": out_buses,
            "links": out_links}


def bus_info(bus: str, year: int = 2025):
    """Everything about one bus: voltage, installed capacity by carrier, the individual
    connected generators, and the transformers / phase-shifters at the bus."""
    z, gen_bus, gen_car, gen_pnom, *_ = _data(year)
    topo = grid_topology(year)
    xy, _lines = _topo(year)
    b = str(bus)
    v = int(xy[b][2]) if b in xy else 0
    sel = gen_bus == b
    gens = [{"carrier": str(c), "p_nom_MW": round(float(p), 2)}
            for c, p in sorted(zip(gen_car[sel], gen_pnom[sel]), key=lambda t: -t[1])]
    cap = pd.Series(gen_pnom[sel]).groupby(gen_car[sel]).sum().sort_values(ascending=False)
    trf = [t for t in topo["trafos"] if t["bus0"] == b or t["bus1"] == b]
    lns = [l["id"] for l in topo["lines"] if l["bus0"] == b or l["bus1"] == b]
    return {"bus": b, "v_nom": v, "name": _bus_names().get(b),
            "installed_MW": round(float(gen_pnom[sel].sum()), 1),
            "cap_by_carrier_MW": {str(k): round(float(vv), 1) for k, vv in cap.items()},
            "generators": gens[:60], "n_generators": int(sel.sum()),
            "transformers": trf, "lines": lns}


@functools.lru_cache(maxsize=1)
def _plant_registry():
    """OPSD/MaStR plant registry (true coordinates), with a KD-tree per carrier so the
    spokes can find each carrier's nearest real plants to any bus. Includes units down
    to 0.05 MW so distribution buses are covered."""
    from scipy.spatial import cKDTree
    base = Path(__file__).resolve().parents[3] / "data" / "plants"
    frames = []
    res = pd.read_csv(base / "renewables_de.csv",
                      usecols=["electrical_capacity", "energy_source_level_2",
                               "technology", "lat", "lon"], low_memory=False)
    res = res.dropna(subset=["lat", "lon"])
    res = res[res["electrical_capacity"] >= 0.05]
    src = res["energy_source_level_2"].astype(str); tech = res["technology"].astype(str)
    carrier = np.select(
        [src.eq("Solar"), tech.str.contains("Offshore", na=False), src.eq("Wind"),
         src.eq("Hydro"), tech.str.contains("biogas", case=False, na=False),
         src.eq("Bioenergy")],
        ["solar", "offwind", "onwind", "run_of_river", "biogas", "biomass"], default="other")
    frames.append(pd.DataFrame({"carrier": carrier, "mw": res["electrical_capacity"],
                                "lat": res["lat"], "lon": res["lon"]}))
    con = pd.read_csv(base / "conventional_de.csv", low_memory=False)
    con = con.dropna(subset=["lat", "lon"])
    con = con[con["status"].astype(str).str.contains("operating", case=False, na=True)]
    fuel = con["fuel"].astype(str) if "fuel" in con.columns else con["energy_source"].astype(str)
    cmap = {"Lignite": "lignite", "Hard coal": "coal", "Natural gas": "gas_ccgt",
            "Oil": "oil", "Waste": "waste", "Biomass and biogas": "biomass",
            "Hydro": "run_of_river", "Pumped storage": "pumped_hydro", "Other fuels": "other"}
    frames.append(pd.DataFrame({"carrier": fuel.map(cmap).fillna("other"),
                                "mw": con["capacity_net_bnetza"],
                                "lat": con["lat"], "lon": con["lon"]}).dropna(subset=["mw"]))
    pl = pd.concat(frames, ignore_index=True)
    # gas plants serve both model gas carriers
    trees = {}
    for c, sub in pl.groupby("carrier"):
        trees[c] = (cKDTree(sub[["lat", "lon"]].values), sub.reset_index(drop=True))
    return trees


_REG_ALIAS = {"gas_chp": "gas_ccgt", "coal": "coal", "hydrogen": "gas_ccgt",
              "waste": "waste", "reservoir": "run_of_river", "other": "other"}


@functools.lru_cache(maxsize=1)
def _has_unit_bus_map() -> bool:
    try:
        eng = get_engine()
        with eng.connect() as c:
            n = c.execute(text("SELECT count(*) FROM mastr.unit_bus_map")).scalar()
        return bool(n and n > 0)
    except Exception:
        return False


# MaStR per-technology "extended" tables and whether they carry a Technologie column.
_MASTR_EXT_TABLES = [
    "solar_extended", "wind_extended", "biomass_extended", "hydro_extended",
    "storage_extended", "gsgk_extended", "combustion_extended",
]


def _mastr_unit_details(conn, ids: list[str]) -> dict:
    """Look up registry detail (name, capacity, commissioning date, status,
    municipality) for a set of MaStR unit numbers across all extended tables."""
    if not ids:
        return {}
    parts = [
        f'''SELECT "EinheitMastrNummer" AS uid,
                   "NameStromerzeugungseinheit" AS name,
                   "Nettonennleistung" AS net_kw,
                   "Bruttoleistung" AS gross_kw,
                   "Inbetriebnahmedatum" AS cod,
                   "EinheitBetriebsstatus" AS status,
                   "Gemeindeschluessel" AS ags
            FROM mastr.{tbl}
            WHERE "EinheitMastrNummer" = ANY(:ids)'''
        for tbl in _MASTR_EXT_TABLES
    ]
    sql = text(" UNION ALL ".join(parts))
    rows = conn.execute(sql, {"ids": ids}).mappings().all()
    out = {}
    for r in rows:
        out[r["uid"]] = {
            "name": r["name"],
            "net_kw": float(r["net_kw"]) if r["net_kw"] is not None else None,
            "gross_kw": float(r["gross_kw"]) if r["gross_kw"] is not None else None,
            "cod": str(r["cod"]) if r["cod"] else None,
            "status": r["status"],
            "ags": r["ags"],
        }
    return out


def bus_plants(bus: str):
    """Plants connected to this bus, with true coordinates.

    Preferred source: `mastr.unit_bus_map` — the replayed original allocation
    (SEL → Netzanschlusspunkt → grid_connections + voltage rules), i.e. the GENUINE
    unit→bus assignment, enriched with per-unit MaStR registry detail. Falls back to
    OPSD carrier-aware proximity matching when the MaStR mapping hasn't been built yet."""
    if _has_unit_bus_map():
        eng = get_engine()
        with eng.connect() as conn:
            df = pd.read_sql(text(
                "SELECT unit_id, carrier, mw, lat, lon FROM mastr.unit_bus_map "
                "WHERE bus = :b ORDER BY mw DESC"), conn, params={"b": str(bus)})
            df = df.head(40)
            details = _mastr_unit_details(conn, df["unit_id"].astype(str).tolist())
        plants = []
        for r in df.itertuples():
            uid = str(r.unit_id)
            d = details.get(uid, {})
            plants.append({
                "unit_id": uid,
                "carrier": str(r.carrier),
                "mw": round(float(r.mw), 3),
                "lat": float(r.lat),
                "lon": float(r.lon),
                "name": d.get("name"),
                "net_kw": d.get("net_kw"),
                "gross_kw": d.get("gross_kw"),
                "cod": d.get("cod"),
                "status": d.get("status"),
                "ags": d.get("ags"),
            })
        return {"bus": str(bus), "count": int(len(df)), "source": "mastr",
                "plants": plants}
    return _bus_plants_opsd(bus)


def _bus_plants_opsd(bus: str):
    """Fallback: nearest registry plants of the model's carriers (proximity match)."""
    info = bus_info(bus)
    xy, _ = _topo()
    b = str(bus)
    if b not in xy:
        return {"bus": b, "count": 0, "plants": []}
    lon0, lat0, _v = xy[b]
    trees = _plant_registry()
    out = []
    for carrier, cap in info["cap_by_carrier_MW"].items():
        key = carrier if carrier in trees else _REG_ALIAS.get(carrier)
        if key not in trees or str(carrier).startswith("import"):
            continue
        tree, sub = trees[key]
        k = min(60, len(sub.index))
        dist, idx = tree.query([lat0, lon0], k=k)
        dist = np.atleast_1d(dist); idx = np.atleast_1d(idx)
        got = 0.0; n = 0
        for d, i in zip(dist, idx):
            if d > 0.8 or n >= 12 or got >= cap:   # ~80 km cap
                break
            r = sub.iloc[int(i)]
            out.append({"carrier": str(carrier), "mw": round(float(r.mw), 2),
                        "lat": float(r.lat), "lon": float(r.lon),
                        "km": round(float(d) * 111, 1)})
            got += float(r.mw); n += 1
    out.sort(key=lambda p: -p["mw"])
    return {"bus": b, "count": len(out), "plants": out[:40]}


@functools.lru_cache(maxsize=8)
def gen_nodes(year: int = 2025):
    """Static per-bus installed capacity by carrier (for the Generation tab):
    dominant carrier, total MW, and the per-carrier breakdown."""
    z, gen_bus, gen_car, gen_pnom, *_ = _data(year)
    xy, _lines = _topo(year)
    df = pd.DataFrame({"bus": gen_bus, "carrier": gen_car, "p_nom": gen_pnom})
    df = df[~df["carrier"].str.startswith("import")]
    out = []
    for bus, g in df.groupby("bus"):
        if bus not in xy:
            continue
        lon, lat, v = xy[bus]
        caps = g.groupby("carrier").p_nom.sum().sort_values(ascending=False)
        tot = float(caps.sum())
        if tot < 0.5:
            continue
        out.append({"bus": str(bus), "lon": lon, "lat": lat, "v": int(v),
                    "total_MW": round(tot, 1), "dominant": str(caps.index[0]),
                    "mix": {str(k): round(float(vv), 1) for k, vv in caps.head(6).items()}})
    carriers = sorted(df["carrier"].unique())
    return {"nodes": out, "carriers": carriers, "count": len(out)}


@functools.lru_cache(maxsize=1)
def _kreis_geo():
    """Simplified Landkreis polygons + bus→Kreis assignment (cached)."""
    import geopandas as gpd
    import json as _json
    eng = get_engine()
    kre = gpd.read_postgis(
        "SELECT ags, gen, bez, geometry FROM boundaries.vg250_krs WHERE ags IS NOT NULL AND gf=4",
        eng, geom_col="geometry").to_crs(4326)
    xy, _lines = _topo()
    pts = gpd.GeoDataFrame({"bus": list(xy.keys())},
                           geometry=gpd.points_from_xy([v[0] for v in xy.values()],
                                                       [v[1] for v in xy.values()]), crs=4326)
    sj = gpd.sjoin(pts, kre[["ags", "geometry"]], predicate="within", how="left")
    sj = sj[~sj.index.duplicated(keep="first")]
    bus_ags = dict(zip(sj["bus"], sj["ags"].fillna("")))
    kre["geometry"] = kre["geometry"].simplify(0.01, preserve_topology=True)
    geo = _json.loads(kre.to_json())
    names = {r.ags: f"{r.gen} ({r.bez})" for r in kre.itertuples()}
    return geo, names, bus_ags


def load_by_kreis(i: int, ds: str = "n0", year: int = 2025):
    """Hourly load aggregated per Landkreis, plus the polygon geojson (first call only
    is slow; cached). Used by the Load tab choropleth."""
    ds = _norm_ds(year, ds)
    z, *_rest = _data(year, ds)
    bus_ids = _rest[3]
    snaps = _rest[6]
    i = max(0, min(int(i), len(snaps) - 1))
    geo, names, bus_ags = _kreis_geo()
    load_bus = np.asarray(_mm(year, ds, "load_by_bus")[i]).astype(np.float64)
    agg = {}
    for k, b in enumerate(bus_ids):
        a = bus_ags.get(b, "")
        if a:
            agg[a] = agg.get(a, 0.0) + float(load_bus[k])
    return {"time": snaps[i], "i": i,
            "load_by_kreis_MW": {k: round(v, 1) for k, v in agg.items() if v > 0.5},
            "names": names}


@functools.lru_cache(maxsize=1)
def kreis_geojson():
    geo, _names, _ba = _kreis_geo()
    return geo


@functools.lru_cache(maxsize=1)
def municipality_energy():
    """Per-municipality (AGS) installed renewable capacity by technology plus
    attributed grid load, as a GeoJSON FeatureCollection. Backed by the
    precomputed grid.municipality_energy table (see
    scripts/pipeline/build_municipality_energy.py). Cached in memory."""
    import json as _json
    eng = get_engine()
    sql = text("""
        SELECT ags, name, kind,
               solar_mw, wind_mw, biomass_mw, hydro_mw, storage_mw,
               renewable_mw, load_mw,
               ST_AsGeoJSON(geom, 4) AS geom
        FROM grid.municipality_energy
    """)
    with eng.connect() as conn:
        rows = conn.execute(sql).mappings().all()
    feats = []
    for r in rows:
        if not r["geom"]:
            continue
        feats.append({
            "type": "Feature",
            "geometry": _json.loads(r["geom"]),
            "properties": {
                "ags": r["ags"],
                "name": r["name"],
                "kind": r["kind"],
                "solar": round(float(r["solar_mw"]), 2),
                "wind": round(float(r["wind_mw"]), 2),
                "biomass": round(float(r["biomass_mw"]), 2),
                "hydro": round(float(r["hydro_mw"]), 2),
                "storage": round(float(r["storage_mw"]), 2),
                "renewable": round(float(r["renewable_mw"]), 2),
                "load": round(float(r["load_mw"]), 2),
            },
        })
    return {"type": "FeatureCollection", "features": feats, "count": len(feats)}


@functools.lru_cache(maxsize=1)
def development():
    """Fleet + demand development across every built scenario year: installed
    capacity by carrier (imports excluded) and the annual demand / peak load.
    One row per year — feeds the 'development' panels in Generation and Load."""
    out = []
    for y in available_years():
        ds = _norm_ds(y, "n0")
        (_z, _gb, gen_car, gen_pnom, *_rest) = _data(y, ds)
        keep = ~np.char.startswith(gen_car, "import")
        cap = pd.Series(gen_pnom[keep]).groupby(gen_car[keep]).sum().sort_values(ascending=False)
        lb = _mm(y, ds, "load_by_bus")
        H = lb.shape[0]
        scale = 8760.0 / H
        hourly = np.zeros(H)
        for i0 in range(0, H, 1024):
            hourly[i0:i0 + 1024] = np.asarray(lb[i0:i0 + 1024]).sum(axis=1)
        out.append({
            "year": int(y),
            "cap_by_carrier_MW": {str(k): round(float(v), 0) for k, v in cap.items() if v > 1},
            "total_cap_MW": round(float(gen_pnom[keep].sum()), 0),
            "demand_TWh": round(float(hourly.sum()) * scale / 1e6, 1),
            "peak_load_MW": round(float(hourly.max()), 0),
            "mean_load_MW": round(float(hourly.mean()), 0),
        })
    return {"years": out}


@functools.lru_cache(maxsize=8)
def _line_p95(year: int, ds: str) -> np.ndarray:
    """95th percentile of |post-redispatch flow| per line over the year (MW).
    Cached to a sidecar keyed by the npz mtime — first call streams the full
    flow matrix once, afterwards it is instant."""
    path = _npz(year, ds)
    _MMDIR.mkdir(exist_ok=True)
    f = _MMDIR / f"{path.stem}_{int(path.stat().st_mtime)}_p95post.npy"
    if f.exists():
        return np.load(f)
    fl = _mm(year, ds, "line_flow_post")
    L = fl.shape[1]
    out = np.zeros(L)
    for j0 in range(0, L, 2048):
        block = np.abs(np.asarray(fl[:, j0:j0 + 2048]).astype(np.float32))
        out[j0:j0 + 2048] = np.percentile(block, 95, axis=0)
    np.save(f, out)
    return out


@functools.lru_cache(maxsize=4)
def bus_headroom(year: int = 2025):
    """Greenfield connection headroom per bus: how much spare thermal capacity the
    lines at each substation keep in the year's 95 % of hours, after redispatch.

    spare_min = the weakest connected line's (s_nom − p95|flow|)  → firm view,
    spare_sum = Σ spare across all connected lines               → meshed view,
    ovl_h     = worst post-redispatch overload-hours among them  → congestion flag.
    Line-based (transformers not netted); a screening layer, not a connection study.
    """
    from collections import defaultdict
    ds = _norm_ds(year, "n0")
    z, *_rest = _data(year, ds)
    sub_lines = _rest[4]
    snom = np.asarray(z["s_nom"]).astype(float)
    p95 = _line_p95(year, ds)
    ovl = (np.asarray(z["ovl_hours_post"]).astype(float)
           if "ovl_hours_post" in z.files else np.zeros(len(sub_lines)))
    xy, lines = _topo(year)
    pos = {l: i for i, l in enumerate(sub_lines)}
    names = _bus_names()
    bl = defaultdict(list)
    for r in lines.itertuples():
        p = pos.get(r.line_id)
        if p is None:
            continue
        bl[str(r.bus0)].append(p)
        bl[str(r.bus1)].append(p)
    snom_safe = np.where(snom > 0, snom, np.inf)
    out = []
    for b, (lon, lat, v) in xy.items():
        ps = bl.get(b)
        if not ps:
            continue
        spare = np.maximum(snom[ps] - p95[ps], 0.0)
        out.append({
            "bus": b, "name": names.get(b),
            "lon": round(lon, 4), "lat": round(lat, 4), "v": int(v),
            "n_lines": len(ps),
            "spare_min_MW": round(float(spare.min()), 0),
            "spare_sum_MW": round(float(spare.sum()), 0),
            "p95_loading": round(float((p95[ps] / snom_safe[ps]).max()), 2),
            "ovl_h": round(float(ovl[ps].max()), 0),
        })
    return {"year": int(year), "buses": out, "count": len(out),
            "method": "spare = s_nom − p95(|post-redispatch flow|) per connected line, "
                      "full simulated year"}


@functools.lru_cache(maxsize=8)
def annual_summary(ds: str = "n0", year: int = 2025):
    """Before/after redispatch congestion summary over the whole sampled year."""
    ds = _norm_ds(year, ds)
    z, *_rest = _data(year, ds)
    snom = np.asarray(z["s_nom"]).astype(float)
    ss = np.where(snom > 0, snom, np.inf)
    fda = np.asarray(_mm(year, ds, "line_flow_da"))     # mmap sidecars — the
    fpo = np.asarray(_mm(year, ds, "line_flow_post"))   # npz would decompress ~1 GB
    H = fda.shape[0]; scale = 8760.0 / H
    over_da = (np.abs(fda) / ss) > OVERLOAD_TOL
    over_po = (np.abs(fpo) / ss) > OVERLOAD_TOL
    pre_h = over_da.any(axis=1); post_h = over_po.any(axis=1)
    # annual N-1 violation totals (sidecar screening, N-1 dataset only)
    n1 = None
    sc = _n1_screen(year) if (ds == "n1" or int(year) != 2025) else None
    if sc is not None:
        n1 = {
            "hours_with_violation_pre": int((sc["n1_viol_da"] > 0).sum()),
            "hours_with_violation_post": int((sc["n1_viol_post"] > 0).sum()),
            "pair_hours_pre": int(sc["n1_viol_da"].sum()),
            "pair_hours_post": int(sc["n1_viol_post"].sum()),
            "max_post_contingency_loading_pre": round(float(sc["n1_worst_da"].max()), 2),
            "max_post_contingency_loading_post": round(float(sc["n1_worst_post"].max()), 2),
        }
    # TSO vs DSO redispatch split by connection voltage (needs bus_v_nom in the
    # npz, saved by build_app_sample since 2026-07-01). 110 kV curtailment is the
    # model's DSO Einspeisemanagement layer — reported separately from the
    # TSO-comparable EHV volumes so it is never scored against the TSO target.
    tso_dso = None
    if "bus_v_nom" in z.files and "delta_gen" in z.files:
        vmap = dict(zip(np.asarray(z["bus_ids"]).astype(str),
                        np.asarray(z["bus_v_nom"]).astype(float)))
        gb = np.asarray(z["gen_bus"]).astype(str)
        ehv = np.array([vmap.get(x, 0.0) >= 220 for x in gb])
        car = np.asarray(z["gen_carrier"]).astype(str)
        res = np.isin(car, ["onwind", "offwind", "solar"])
        dgen = np.asarray(_mm(year, ds, "delta_gen")).astype(np.float64)
        dnv = np.where(dgen < 0, -dgen, 0.0)
        tso_dso = {
            "tso_down_TWh": round(float(dnv[:, ehv].sum()) * scale / 1e6, 2),
            "dso_res_curtailment_TWh": round(
                float(dnv[:, res & ~ehv].sum()) * scale / 1e6, 2),
        }
    return {
        "dataset": ds, "year": int(year), "n1": n1, "tso_dso": tso_dso,
        "sampled_hours": int(H), "scale_to_year": round(scale, 2),
        "hours_with_overload_pre": int(pre_h.sum()),
        "hours_with_overload_post": int(post_h.sum()),
        "hours_fully_cleared": int((pre_h & ~post_h).sum()),
        "lines_ever_overloaded_pre": int(over_da.any(axis=0).sum()),
        "lines_ever_overloaded_post": int(over_po.any(axis=0).sum()),
        "line_hours_pre": int(over_da.sum()), "line_hours_post": int(over_po.sum()),
        "line_hours_pre_yr": int(over_da.sum() * scale), "line_hours_post_yr": int(over_po.sum() * scale),
        "mean_overloads_per_hour_pre": round(float(over_da.sum(axis=1).mean()), 1),
        "mean_overloads_per_hour_post": round(float(over_po.sum(axis=1).mean()), 1),
        "max_loading_pre": round(float((np.abs(fda) / ss).max()), 2),
        "max_loading_post": round(float((np.abs(fpo) / ss).max()), 2),
    }


def node_detail(i: int, bus: str, ds: str = "n0", year: int = 2025):
    ds = _norm_ds(year, ds)
    (z, gen_bus, gen_car, gen_pnom, bus_ids, sub_lines, line_pos, snaps,
     cap_by_bus_car, _cb, _imp) = _data(year, ds)
    i = max(0, min(int(i), len(snaps) - 1))
    sel = gen_bus == str(bus)
    p_da = np.asarray(_mm(year, ds, "p_da")[i]).astype(np.float64)[sel]
    dg = np.asarray(_mm(year, ds, "delta_gen")[i]).astype(np.float64)[sel]
    car = gen_car[sel]; pnom = gen_pnom[sel]
    cap = pd.Series(pnom).groupby(car).sum()
    gen = pd.Series(p_da).groupby(car).sum()
    cur = pd.Series(np.maximum(-dg, 0.0)).groupby(car).sum()
    carriers = sorted(set(car), key=lambda c: -float(cap.get(c, 0)))
    rows = [{"carrier": c, "cap_MW": round(float(cap.get(c, 0)), 1),
             "gen_MW": round(float(gen.get(c, 0)), 1), "curtail_MW": round(float(cur.get(c, 0)), 1)}
            for c in carriers if cap.get(c, 0) > 0.5 or gen.get(c, 0) > 0.5]
    load_bus = np.asarray(_mm(year, ds, "load_by_bus")[i]).astype(np.float64)
    bpos = {b: k for k, b in enumerate(bus_ids)}
    return {"bus": str(bus), "time": snaps[i],
            "cap_MW": round(float(cap.sum()), 1), "gen_MW": round(float(gen.sum()), 1),
            "curtail_MW": round(float(cur.sum()), 1),
            "load_MW": round(float(load_bus[bpos[str(bus)]]) if str(bus) in bpos else 0.0, 1),
            "carriers": rows}
