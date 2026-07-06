"""1000-hour grid-explorer endpoints."""
from fastapi import APIRouter, HTTPException, Query
from ..services import app_sample

router = APIRouter()

# Scenario year selector: 2025 (canonical) or a horizon year with a built
# app_year_{year}.npz. Defaults to 2025 so every existing caller is unchanged.
_YEAR = Query(2025, description="scenario year (2025 | 2030 | 2032 | 2035)")


def _guard_year(year: int):
    if year not in app_sample.available_years():
        raise HTTPException(
            404, f"scenario {year} has no built redispatch dataset "
                 f"(have {app_sample.available_years()})")


@router.get("/snapshots")
def snapshots(ds: str = Query("n0"), year: int = _YEAR):
    _guard_year(year)
    try:
        return app_sample.snapshots(ds, year)
    except FileNotFoundError as e:
        raise HTTPException(503, f"Sample dataset not built yet: {e}")


@router.get("/datasets")
def datasets():
    return app_sample.datasets()


@router.get("/state")
def state(i: int = Query(0, ge=0), ds: str = Query("n0"), year: int = _YEAR):
    _guard_year(year)
    try:
        return app_sample.state(i, ds, year)
    except FileNotFoundError as e:
        raise HTTPException(503, f"Sample dataset not built yet: {e}")


@router.get("/node")
def node(i: int = Query(0, ge=0), bus: str = Query(...), ds: str = Query("n0"),
         year: int = _YEAR):
    _guard_year(year)
    return app_sample.node_detail(i, bus, ds, year)


@router.get("/overload_hours")
def overload_hours(ds: str = Query("n0"), year: int = _YEAR):
    _guard_year(year)
    try:
        return app_sample.line_overload_hours(ds, year)
    except FileNotFoundError as e:
        raise HTTPException(503, f"Sample dataset not built yet: {e}")


@router.get("/summary")
def summary(ds: str = Query("n0"), year: int = _YEAR):
    _guard_year(year)
    try:
        return app_sample.annual_summary(ds, year)
    except FileNotFoundError as e:
        raise HTTPException(503, f"Sample dataset not built yet: {e}")


@router.get("/gen_nodes")
def gen_nodes_ep(year: int = _YEAR):
    _guard_year(year)
    return app_sample.gen_nodes(year)


@router.get("/load_kreis")
def load_kreis_ep(i: int = Query(0, ge=0), ds: str = Query("n0"), year: int = _YEAR):
    _guard_year(year)
    return app_sample.load_by_kreis(i, ds, year)


@router.get("/kreise")
def kreise_ep():
    return app_sample.kreis_geojson()


@router.get("/grid_topology")
def grid_topology_ep(year: int = _YEAR):
    return app_sample.grid_topology(year)


@router.get("/bus_names")
def bus_names_ep():
    return app_sample._bus_names()


@router.get("/bus_info")
def bus_info_ep(bus: str = Query(...), year: int = _YEAR):
    return app_sample.bus_info(bus, year)


@router.get("/bus_plants")
def bus_plants_ep(bus: str = Query(...)):
    return app_sample.bus_plants(bus)


@router.get("/municipalities")
def municipalities_ep():
    """Per-municipality installed RE capacity by tech + load (GeoJSON)."""
    return app_sample.municipality_energy()


@router.get("/development")
def development_ep():
    """Installed capacity by carrier + annual demand / peak load per scenario year."""
    return app_sample.development()


@router.get("/headroom")
def headroom_ep(year: int = _YEAR):
    """Greenfield screening: per-bus spare thermal line capacity for the year."""
    _guard_year(year)
    try:
        return app_sample.bus_headroom(year)
    except FileNotFoundError as e:
        raise HTTPException(503, f"Sample dataset not built yet: {e}")
