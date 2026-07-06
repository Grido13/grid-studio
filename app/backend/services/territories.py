"""Serve the precomputed DSO/TSO service-area territories (GeoJSON polygons).

Source: data/territories/territories.geojson (built by
scripts/pipeline/build_territories.py). Loaded once and cached.
"""
import json
import pathlib

_REPO = pathlib.Path(__file__).resolve().parents[3]
_GEO = _REPO / "data" / "territories" / "territories.geojson"
_cache = None


def load() -> dict:
    global _cache
    if _cache is None:
        if not _GEO.exists():
            raise FileNotFoundError(
                f"{_GEO} not found — run scripts/pipeline/build_territories.py")
        _cache = json.loads(_GEO.read_text())
    return _cache
