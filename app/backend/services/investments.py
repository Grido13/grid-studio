"""Serve the precomputed grid-investment map data (geocoded lines + substations).

Source: data/grid_investments/investments_geo.json (built by
scripts/grid_investments/geocode_investments.py). Loaded once and cached.

review() persists a user verdict on a bus match (confirmed/rejected/auto) to
grid_investments.db and patches the served cache in place, so the workbench
reflects it immediately; the next geocode run bakes it into the JSON.
"""
import json
import pathlib
import sqlite3

_REPO = pathlib.Path(__file__).resolve().parents[3]
_GEO = _REPO / "data" / "grid_investments" / "investments_geo.json"
_DB = _REPO / "data" / "grid_investments" / "grid_investments.db"
_cache = None


def load() -> dict:
    global _cache
    if _cache is None:
        if not _GEO.exists():
            raise FileNotFoundError(
                f"{_GEO} not found — run scripts/grid_investments/geocode_investments.py")
        _cache = json.loads(_GEO.read_text())
    return _cache


def review(kind: str, row_id: int, status: str) -> dict:
    if kind not in ("line", "substation"):
        raise ValueError("kind must be 'line' or 'substation'")
    if status not in ("confirmed", "rejected", "auto"):
        raise ValueError("status must be confirmed | rejected | auto")
    table = "lines" if kind == "line" else "substations"
    con = sqlite3.connect(_DB)
    try:
        n = con.execute(f"UPDATE {table} SET review_status=? WHERE id=?",
                        (status, row_id)).rowcount
        con.commit()
    finally:
        con.close()
    if not n:
        raise KeyError(f"no {kind} with id {row_id}")
    data = load()
    for d in data["lines" if kind == "line" else "substations"]:
        if d["id"] == row_id:
            d["review_status"] = status
            break
    return {"kind": kind, "id": row_id, "review_status": status}
