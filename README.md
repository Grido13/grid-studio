# Grid Studio

An interactive studio for a **full-year simulation of the German transmission grid** —
market dispatch, DC power flow on 8,238 line corridors, and a DSO ↔ TSO redispatch
cascade, for every one of the 8,760 hours of 2025 and the NEP horizon years
2030 · 2032 · 2035.

![Grid Studio — the grid at night](docs/screenshot-home.png)

## What's inside

- **Grid** — the physical network (380/220/110 kV lines, transformers, phase-shifters,
  HVDC), generation and load per node, municipalities, operator territories, the
  NEP/§14d investment pipeline, the 2026 grid-connection reform, and the fibre backbone.
- **Scenarios** — hourly line loadings before/after redispatch, the annual congestion
  map, modelled market prices, dispatch validated against SMARD, and the official
  Redispatch 2.0 record beside the model — for 2025 and the NEP horizons.
- **Analysis** — connection economics (firm vs. flexible connection agreement for a
  100 MW battery at every 110 kV bus), greenfield siting, and BESS grid-booster siting.
- **Assistant** — an optional local LLM (Ollama) that reads both the numbers and the
  maps on screen.

English ⇄ German interface, light and dark mode.

![Scenarios — hourly power flow](docs/screenshot-scenarios.png)

## Installation

### Requirements

- Python **3.11**
- PostgreSQL **≥ 16** with the **PostGIS** extension
- ~12 GB free disk for the data artifacts, ~18 GB in PostgreSQL after restore

### 1 · Clone and install

```bash
git clone https://github.com/witto13/grid-studio.git
cd grid-studio
python -m venv .venv && source .venv/bin/activate     # or a conda env
pip install -r requirements.txt
```

### 2 · Fetch the data

The hourly simulation results and the database dump are too large for git and live in
the [`v1.0-data` release](https://github.com/witto13/grid-studio/releases/tag/v1.0-data):

```bash
bash scripts/fetch_data.sh
```

This places the per-year redispatch results (`results/app_year*.npz`), the plant
registry, and the PostgreSQL dump parts (`db_dump/`).

### 3 · Restore the database

With a local PostgreSQL running (and PostGIS installed):

```bash
bash scripts/restore_db.sh
```

This creates role `egon`, database `egon-data`, and restores the grid model tables
(topology, generators, loads, hourly timeseries, official Redispatch 2.0 data,
municipality energy, district boundaries). If your database lives elsewhere, point the
app at it instead:

```bash
export GRID_DB_URL="postgresql+psycopg2://user:pass@host:5432/dbname"
```

### 4 · Run

```bash
uvicorn app.backend.main:app --port 8765
```

Open **http://127.0.0.1:8765** — you should land on the overview with the scroll story
and, further down, the 220/380 kV grid drawn live from the database.

### Optional: the assistant

The chat assistant uses a local [Ollama](https://ollama.com) with a vision model
(`ollama pull gemma3:4b`). Without it the assistant falls back to prepared answers —
everything else works normally.

## Architecture

- `app/backend/` — FastAPI. One router per feature area (`topology`, `sample`,
  `official`, `validation`, `capex`, `bess`, …); heavy lifting in `services/`.
  Data sources: PostgreSQL (grid model + official data) and precomputed `results/*.npz`
  (8,760-hour redispatch runs).
- `app/frontend/` — no-build SPA: native ES modules + React (esm.sh) + htm + Leaflet.
  Module map and conventions in [`app/frontend/README.md`](app/frontend/README.md).
- `results/`, `data/` — small precomputed artifacts tracked in git; large ones fetched
  from the release (see `.gitignore` for the split).

The simulation pipeline that *produces* these artifacts (grid reduction, market
dispatch, redispatch cascade, calibration) is a separate research codebase and is not
part of this repository.

## License

[MIT No Attribution (MIT-0)](LICENSE) — © 2026 witto13.

You may use, copy, modify, and sell this software, commercially and without
attribution. The original work remains the author's.
