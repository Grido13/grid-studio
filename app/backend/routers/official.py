"""Official Redispatch 2.0 data (netztransparenz TSO + DSO publications)."""
from fastapi import APIRouter, HTTPException, Query

from ..services import official_data as od

router = APIRouter()


def _guard(fn, *a, **kw):
    try:
        return fn(*a, **kw)
    except Exception as e:  # table missing / pipeline not run yet
        raise HTTPException(503, f"official data unavailable: {e}") from e


@router.get("/summary")
def summary():
    return _guard(od.summary)


@router.get("/timeline")
def timeline(freq: str = "day", by: str = "technology",
             level: str | None = None, cause: str | None = None,
             direction: str = "down"):
    return _guard(od.timeline, freq=freq, by=by, level=level,
                  cause=cause, direction=direction)


@router.get("/map")
def map_agg(start: str = Query(...), end: str = Query(...),
            level: str | None = None, cause: str | None = None,
            direction: str | None = None, technology: str | None = None):
    return _guard(od.map_agg, start, end, level=level, cause=cause,
                  direction=direction, technology=technology)


@router.get("/breakdown")
def breakdown(start: str = Query(...), end: str = Query(...),
              level: str | None = None, cause: str | None = None,
              direction: str | None = None, technology: str | None = None):
    return _guard(od.breakdown, start, end, level=level, cause_f=cause,
                  direction=direction, technology=technology)


@router.get("/measures")
def measures(bus: str | None = None, operator: str | None = None,
             start: str | None = None, end: str | None = None,
             level: str | None = None, cause: str | None = None,
             direction: str | None = None, technology: str | None = None,
             limit: int = 200):
    return _guard(od.measures, bus=bus, operator=operator,
                  start=start, end=end, level=level, cause=cause,
                  direction=direction, technology=technology, limit=limit)


@router.get("/compare")
def compare(freq: str = "day", technology: str | None = None):
    return _guard(od.compare, freq=freq, technology=technology)


@router.get("/merit")
def merit():
    return _guard(od.merit)


@router.get("/plants_compare")
def plants_compare(top: int = 50):
    return _guard(od.plants_compare, top)
