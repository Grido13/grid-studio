#!/usr/bin/env bash
# Restore the PostgreSQL data the app reads (grid.* + boundaries.vg250_krs).
# Needs: PostgreSQL >= 16 running locally, with the PostGIS extension available.
# Creates role `egon` (password `data`) and database `egon-data`, then restores.
# Run from the repo root after scripts/fetch_data.sh:
#   bash scripts/restore_db.sh
set -euo pipefail
cd "$(dirname "$0")/.."

psql postgres -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='egon') THEN
    CREATE ROLE egon LOGIN PASSWORD 'data';
  END IF;
END $$;
SELECT 'CREATE DATABASE "egon-data" OWNER egon'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname='egon-data')\gexec
SQL
psql "egon-data" -c 'CREATE EXTENSION IF NOT EXISTS postgis;'

echo "recombining dump parts…"
cat db_dump/egon_grid.dump.tar.part* > db_dump/egon_grid.dump.tar
tar -xf db_dump/egon_grid.dump.tar -C db_dump

echo "restoring (this takes a while — ~13 GB of hourly timeseries)…"
pg_restore -d "egon-data" --no-owner --role=egon -j 4 db_dump/egon_grid.dump

echo "done. Start the app with:"
echo "  uvicorn app.backend.main:app --port 8765"
