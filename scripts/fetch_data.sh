#!/usr/bin/env bash
# Download the large data artifacts (simulation results + database dump) from
# the GitHub release into the paths the app expects. Run from the repo root:
#   bash scripts/fetch_data.sh
set -euo pipefail
REPO="Grido13/grid-studio"
TAG="v1.0-data"
cd "$(dirname "$0")/.."

mkdir -p results data/plants db_dump

dl() {  # dl <asset-name> <target-path>
  local asset="$1" target="$2"
  if [ -f "$target" ]; then echo "✓ $target (already present)"; return; fi
  echo "↓ $asset → $target"
  if command -v gh >/dev/null 2>&1; then
    gh release download "$TAG" -R "$REPO" -p "$asset" -O "$target"
  else
    curl -fL --retry 3 -o "$target" \
      "https://github.com/$REPO/releases/download/$TAG/$asset"
  fi
}

# hourly redispatch results (one npz per scenario year, ~1.2 GB each)
dl app_year.npz        results/app_year.npz
dl app_year_2030.npz   results/app_year_2030.npz
dl app_year_2032.npz   results/app_year_2032.npz
dl app_year_2035.npz   results/app_year_2035.npz

# plant registry (Marktstammdatenregister extract)
dl renewables_de.csv   data/plants/renewables_de.csv

# PostgreSQL dump parts (recombined by scripts/restore_db.sh)
for part in $(seq -f "%02g" 0 9); do
  if command -v gh >/dev/null 2>&1; then
    gh release download "$TAG" -R "$REPO" -p "egon_grid.dump.tar.part$part" -D db_dump 2>/dev/null || break
  else
    curl -fL --retry 3 -o "db_dump/egon_grid.dump.tar.part$part" \
      "https://github.com/$REPO/releases/download/$TAG/egon_grid.dump.tar.part$part" || { rm -f "db_dump/egon_grid.dump.tar.part$part"; break; }
  fi
  echo "✓ db_dump/egon_grid.dump.tar.part$part"
done

echo "done. Next: bash scripts/restore_db.sh"
