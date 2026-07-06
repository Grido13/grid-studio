# Data sources & attribution

The **code** in this repository is MIT-0. The **data** it ships with and redistributes
(via the `v1.0-data` release) is derived from public sources that carry their own
terms. Attribution below.

| Source | Used for | Terms |
|---|---|---|
| [eGo^n / egon-data](https://github.com/openego/eGon-data) (Open Energy Platform) | Basis of the grid model: buses, lines, transformers, generators, loads, demand timeseries | Open data (CC BY 4.0 / ODbL for OSM-derived parts) |
| [OpenStreetMap](https://www.openstreetmap.org) contributors | Transmission-line geometries, substations | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/) |
| [Marktstammdatenregister](https://www.marktstammdatenregister.de) (Bundesnetzagentur) | Power-plant registry (`data/plants/*.csv`) | [dl-de/by-2-0](https://www.govdata.de/dl-de/by-2-0) |
| [SMARD](https://www.smard.de) (Bundesnetzagentur) | Measured 2025 load, generation and day-ahead prices used for calibration/validation | CC BY 4.0 |
| [netztransparenz.de](https://www.netztransparenz.de) (50Hertz, Amprion, TenneT, TransnetBW) | Official Redispatch 2.0 measures 2025 | Statutory transparency publications |
| DSO Redispatch 2.0 publications | Machine-readable distribution-level redispatch measures | Statutory transparency publications |
| [NEP 2025](https://www.netzentwicklungsplan.de) (2nd draft) & digital Projektbibliothek | Grid build-out measures for the 2030/2032/2035 scenarios | Public planning documents |
| §14d EnWG Netzausbaupläne | DSO grid-expansion plans | Statutory publications |
| TSO project websites (public pages) | Planned substations / grid-connection reform datapoints | Publicly accessible web data |
| [BKG VG250](https://gdz.bkg.bund.de) | Administrative boundaries (districts, municipalities) | dl-de/by-2-0, © GeoBasis-DE / BKG |
| [ERA5](https://cds.climate.copernicus.eu) (Copernicus / ECMWF) | 2025 weather for renewable capacity factors | Copernicus licence; contains modified Copernicus Climate Change Service information |
| [PeeringDB](https://www.peeringdb.com) | Internet-exchange data (data-centre siting layer) | Public API |
| [SEFE](https://www.sefe.eu) public network map | Fibre-backbone route geometry | Publicly accessible web data |
| [CARTO](https://carto.com) / OpenStreetMap | Basemap tiles at runtime | CARTO basemap terms / ODbL |

Simulation outputs (the `app_year*.npz` result files, congestion/redispatch figures,
market summaries) are original work produced by the author's own model runs.
