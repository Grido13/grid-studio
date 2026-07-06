#!/usr/bin/env bash
# (maintainer tool) Dump exactly the tables the app reads from egon-data into
# a directory-format pg_dump, tar it, and split into <2 GB parts for a GitHub
# release. Produces db_dump/egon_grid.dump.tar.partNN.
set -euo pipefail
cd "$(dirname "$0")/.."
PGDUMP="${PGDUMP:-pg_dump}"
OUT=db_dump/egon_grid.dump
rm -rf "$OUT" db_dump/egon_grid.dump.tar*
mkdir -p db_dump

"$PGDUMP" "postgresql://egon:data@127.0.0.1:5432/egon-data" \
  -Fd -Z 6 -j 4 -f "$OUT" \
  -t grid.egon_etrago_bus -t grid.egon_etrago_line -t grid.egon_etrago_link \
  -t grid.egon_etrago_transformer -t grid.egon_etrago_generator \
  -t grid.egon_etrago_generator_timeseries -t grid.egon_etrago_load \
  -t grid.egon_etrago_load_timeseries -t grid.egon_bus_metadata \
  -t grid.municipality_energy -t grid.official_eeg_plants \
  -t grid.official_operators -t grid.official_redispatch_measures \
  -t grid.official_redispatch_national_hourly -t boundaries.vg250_krs

tar -cf db_dump/egon_grid.dump.tar -C db_dump egon_grid.dump
split -b 1900m -d -a 2 db_dump/egon_grid.dump.tar db_dump/egon_grid.dump.tar.part
rm db_dump/egon_grid.dump.tar
ls -lh db_dump/egon_grid.dump.tar.part*
