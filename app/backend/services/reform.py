"""Serve the Grid Reform dataset (Reifegradverfahren, 2026 TSO connection reform).

Source: data/grid_reform/grid_reform.json (built by
scripts/pipeline/build_grid_reform.py). Loaded once and cached.
"""
import json
import pathlib

_REPO = pathlib.Path(__file__).resolve().parents[3]
_DATA = _REPO / "data" / "grid_reform" / "grid_reform.json"
_cache = None


def load() -> dict:
    global _cache
    if _cache is None:
        if not _DATA.exists():
            raise FileNotFoundError(
                f"{_DATA} not found — run scripts/pipeline/build_grid_reform.py")
        _cache = json.loads(_DATA.read_text())
    return _cache
