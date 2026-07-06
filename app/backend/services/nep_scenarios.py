"""Serve the precomputed NEP 2025 regional scenarios (per-region forecast choropleth).

Source: data/territories/nep_scenarios.json (built by
scripts/pipeline/build_nep_scenarios.py). Loaded once and cached.
"""
import json
import pathlib

_REPO = pathlib.Path(__file__).resolve().parents[3]
_GEO = _REPO / "data" / "territories" / "nep_scenarios.json"
_cache = None


def load() -> dict:
    global _cache
    if _cache is None:
        if not _GEO.exists():
            raise FileNotFoundError(
                f"{_GEO} not found — run scripts/pipeline/build_nep_scenarios.py")
        _cache = json.loads(_GEO.read_text())
    return _cache
