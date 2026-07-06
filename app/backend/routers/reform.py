"""Grid Reform endpoints — Reifegradverfahren capacity, queue and scoring data."""
from fastapi import APIRouter, HTTPException

from ..services import reform

router = APIRouter()


@router.get("")
@router.get("/")
def all_reform():
    """Full payload: {framework, cycle, queue, substations, tso_status, stats, meta}."""
    try:
        return reform.load()
    except FileNotFoundError as e:
        raise HTTPException(503, str(e))
