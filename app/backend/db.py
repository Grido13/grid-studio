import os

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine

DB_URL = os.environ.get(
    "GRID_DB_URL", "postgresql+psycopg2://egon:data@127.0.0.1:5432/egon-data"
)
# Canonical scenario: the final validated 2025 grid (grid_alpha + reactance fix
# + 22-line reinforcement + gen-voltage relocations + real offshore corridors),
# saved by scripts/pipeline/save_grid_final_2025.py. Previous: "grid_beta".
SCN = "Grid_Final_2025"
YEAR = 2025

# Horizon energy scenarios (topology + NEP-scaled fleet/load), saved by
# save_energy_scenario.py. The app defaults to 2025 everywhere; endpoints that
# opt in take a `year` query param and resolve the DB scenario via scn_for().
SCENARIOS = {
    2025: "Grid_Final_2025",
    2030: "Grid_2030",
    2032: "Grid_2032",
    2035: "Grid_2035",
}


def scn_for(year: int | None) -> str:
    """DB scn_name for a scenario year (defaults to the canonical 2025 grid)."""
    if year is None:
        return SCN
    try:
        return SCENARIOS[int(year)]
    except (KeyError, ValueError, TypeError):
        raise KeyError(f"unknown scenario year {year!r}; have {sorted(SCENARIOS)}")

_engine: Engine | None = None


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = create_engine(
            DB_URL,
            pool_pre_ping=True,
            pool_size=5,
            max_overflow=5,
            pool_recycle=300,
        )
    return _engine
