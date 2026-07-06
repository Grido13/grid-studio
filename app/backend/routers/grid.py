"""Whole-grid map endpoints: snapshot index + per-snapshot flow/redispatch state."""
from fastapi import APIRouter, HTTPException, Query

from ..services import grid_data

router = APIRouter()


@router.get("/snapshots")
def snapshots(top: int = Query(200, ge=1, le=2000)):
    """Most-congested snapshots (default landing list)."""
    return grid_data.snapshots_index(top=top)


@router.get("/state")
def state(
    snapshot: int = Query(0, ge=0, description="Snapshot index (0..8759)"),
    congested_only: bool = Query(False, description="Only return lines above loading_min"),
    loading_min: float = Query(0.0, ge=0.0, le=5.0),
):
    """Lines (flow + loading), per-bus redispatch, top congested lines, summary."""
    try:
        return grid_data.grid_state(snapshot, congested_only=congested_only,
                                    loading_min=loading_min)
    except FileNotFoundError as e:
        raise HTTPException(503, f"Result data not available: {e}")
