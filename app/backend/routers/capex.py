"""Grid-connection CAPEX estimator endpoints (Grid → Electrical → CAPEX estimator)."""
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services import capex

router = APIRouter()


class ProjectReq(BaseModel):
    lat: float
    lon: float
    tech: Literal["solar", "onwind", "bess", "electrolyser", "load", "hybrid"] = "solar"
    mw: float = 50.0
    mwh: Optional[float] = None        # BESS energy, informational only
    voltage: Literal[110, 220, 380] = 110
    pf: float = 0.95                   # cos φ at the point of connection
    n1: bool = False                   # redundant connection (spare system, 2 trafos)
    concept: Literal["mv", "hv"] = "mv"  # mv: 33 kV export + trafo at POC · hv: trafo at site + HV cable
    year: int = 2025


class EstimateReq(ProjectReq):
    target_type: Literal["bus", "line"]
    target_id: str
    click_lat: Optional[float] = None  # where the user clicked on a line —
    click_lon: Optional[float] = None  # the tap point, not the nearest point to the project


class ColocationReq(BaseModel):
    lat: float
    lon: float
    tech: Literal["solar", "onwind", "bess", "electrolyser", "load", "hybrid"] = "solar"
    mw: float = 50.0
    pf: float = 0.95
    trafo_mva: float = 63.0
    tech2: Literal["solar", "onwind"] = "onwind"


@router.post("/estimate")
def estimate(req: EstimateReq):
    """Full cost card for one clicked substation or one tapped line."""
    try:
        return capex.estimate(req)
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.post("/colocation")
def colocation(req: ColocationReq):
    """Co-location sweep: how much of a second technology fits behind one
    transformer with little or no curtailment, using regional hourly curves."""
    try:
        return capex.colocation(req)
    except ValueError as e:
        raise HTTPException(422, str(e))


@router.post("/best3")
def best3(req: ProjectReq):
    """Evaluate nearby substations + line taps and return the 3 cheapest by 30-yr NPV."""
    out = capex.best3(req)
    if not out["options"]:
        raise HTTPException(404, f"no {req.voltage} kV connection candidate found nearby")
    return out
