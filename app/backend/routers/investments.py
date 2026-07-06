"""Grid-investment-plan map endpoints (NEP 2025 TSO + §14d DSO measures)."""
import io
import pathlib
import zipfile

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, StreamingResponse

from ..services import investments

router = APIRouter()

_EXPORT_DIR = pathlib.Path(__file__).resolve().parents[3] / "results" / "model_investments"
_EXPORT_KINDS = ("new_lines", "upgrades", "hvdc_links", "new_buses")
_EXPORT_YEARS = (2028, 2031, 2034)


@router.get("")
@router.get("/")
def all_investments():
    """Full geocoded payload: {lines, substations, meta}. Filtered client-side."""
    try:
        return investments.load()
    except FileNotFoundError as e:
        raise HTTPException(503, str(e))


@router.get("/meta")
def meta():
    """Operators list, COD range, and placement counts (for building filters)."""
    try:
        return investments.load()["meta"]
    except FileNotFoundError as e:
        raise HTTPException(503, str(e))


_RESULTS = pathlib.Path(__file__).resolve().parents[3] / "results"
_GRID_YEARS = (2030, 2032, 2035)
_overlay_cache = {}


def _overlay(year: int):
    if year not in _GRID_YEARS:
        raise HTTPException(404, f"grid year must be one of {_GRID_YEARS}")
    if year not in _overlay_cache:
        f = _RESULTS / f"grid_{year}_overlay.json"
        if not f.exists():
            raise HTTPException(503, f"run scripts/pipeline/build_grid_2030.py --year {year} first")
        import json
        _overlay_cache[year] = json.loads(f.read_text())
    return _overlay_cache[year]


@router.get("/grid2030")
def grid2030():
    """Back-compat alias for /grid/2030."""
    return _overlay(2030)


@router.get("/grid/{year}")
def grid_overlay(year: int):
    """Horizon grid overlay for the Network map (2030/2032/2035): new lines
    (official routes where known), path-matched upgrades, HVDC corridors, new
    buses, offshore landings. Built by build_grid_2030.py --year."""
    return _overlay(year)


@router.post("/review")
def review(body: dict):
    """Persist a bus-match verdict: {kind: line|substation, id, status:
    confirmed|rejected|auto}. Writes grid_investments.db + patches the cache."""
    try:
        return investments.review(body.get("kind"), int(body.get("id")),
                                  body.get("status"))
    except (ValueError, TypeError) as e:
        raise HTTPException(422, str(e))
    except KeyError as e:
        raise HTTPException(404, str(e))


@router.get("/export/{year}")
def export_zip(year: int):
    """All model-ready CSVs for one horizon (new lines, upgrades, HVDC, new
    buses) as a zip. Files are pre-built by export_model_investments.py."""
    if year not in _EXPORT_YEARS:
        raise HTTPException(404, f"horizon must be one of {_EXPORT_YEARS}")
    if not _EXPORT_DIR.exists():
        raise HTTPException(503, "run scripts/grid_investments/export_model_investments.py first")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for kind in _EXPORT_KINDS:
            f = _EXPORT_DIR / f"{kind}_{year}.csv"
            if f.exists():
                z.write(f, f.name)
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/zip", headers={
        "Content-Disposition": f'attachment; filename="model_investments_{year}.zip"'})


@router.get("/export/{year}/{kind}")
def export_csv(year: int, kind: str):
    """One model-ready CSV (kind: new_lines | upgrades | hvdc_links | new_buses)."""
    if kind not in _EXPORT_KINDS or year not in _EXPORT_YEARS:
        raise HTTPException(404, f"kind in {_EXPORT_KINDS}, year in {_EXPORT_YEARS}")
    f = _EXPORT_DIR / f"{kind}_{year}.csv"
    if not f.exists():
        raise HTTPException(503, "run scripts/grid_investments/export_model_investments.py first")
    return FileResponse(f, media_type="text/csv", filename=f.name)
