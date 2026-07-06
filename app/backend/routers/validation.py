"""Market/dispatch report.

2025: model day-ahead dispatch vs SMARD measured (results/dispatch_vs_smard_2025.json,
written by scripts/simulation/compare_dispatch_smard.py).

Horizon years (2030/2032/2035): there is no measured reference, so serve the
model-only market summary (results/market_summary_{year}.json, written by
scripts/simulation/build_market_summary.py) with a "mode":"model_only" marker.
"""
import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

router = APIRouter()

_RESULTS = Path(__file__).resolve().parents[3] / "results"
_PATH_2025 = _RESULTS / "dispatch_vs_smard_2025.json"
_cache: dict = {}


def _load(path: Path):
    if not path.exists():
        return None
    mtime = path.stat().st_mtime
    ent = _cache.get(path)
    if ent is None or ent[0] != mtime:
        with open(path) as f:
            _cache[path] = (mtime, json.load(f))
    return _cache[path][1]


@router.get("/report")
def report(year: int = Query(2025, description="scenario year")):
    if int(year) == 2025:
        data = _load(_PATH_2025)
        if data is None:
            raise HTTPException(
                503, "validation report not found — run "
                     "scripts/simulation/compare_dispatch_smard.py")
        return data
    data = _load(_RESULTS / f"market_summary_{int(year)}.json")
    if data is None:
        raise HTTPException(
            503, f"market summary for {year} not found — run "
                 f"scripts/simulation/build_market_summary.py --year {year}")
    return data
