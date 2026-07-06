"""DSO/TSO service-area territory endpoints (derived from the grid model)."""
from fastapi import APIRouter, HTTPException

from ..services import nep_scenarios, territories

router = APIRouter()


@router.get("/scenarios")
def scenarios():
    """NEP 2025 regional scenarios: 6 region polygons with per-technology forecasts."""
    try:
        return nep_scenarios.load()
    except FileNotFoundError as e:
        raise HTTPException(503, str(e))


@router.get("")
@router.get("/")
def all_territories():
    """Full payload: {tso, dso, meta}. GeoJSON FeatureCollections, filtered client-side."""
    try:
        return territories.load()
    except FileNotFoundError as e:
        raise HTTPException(503, str(e))


@router.get("/meta")
def meta():
    """Operator list (name + level) and counts, for building filters."""
    try:
        return territories.load()["meta"]
    except FileNotFoundError as e:
        raise HTTPException(503, str(e))
