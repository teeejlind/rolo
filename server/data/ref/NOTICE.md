# Reference data: source and license

These files are small extracts of TRANSMILENIO S.A. open data, kept in the repo so the app and the
feed cleaner work without hitting TransMilenio's ArcGIS server.

| File | Built from |
|---|---|
| `troncal_stations.csv` | GTFS parent stations (TransMilenio GTFS export) joined to the ArcGIS station layer `Troncal/consulta_estaciones_troncales` on `numero_estacion` |
| `trazados_troncales.geojson` | ArcGIS trunk corridor layer `Troncal/consulta_trazados_troncales` |
| `../../../ios/Rolo/Resources/network.json` | Both files above, via `tools/build_app_data.py` |

Source: TRANSMILENIO S.A., www.transmilenio.gov.co (GTFS published on datos.gov.co, dataset
`nysb-4689`, under CC BY-SA 4.0; ArcGIS layers at gis.transmilenio.gov.co).

Because they include CC BY-SA 4.0 data, these files are shared under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), not the MIT License that covers
the code. Changes from the source: columns selected, station ids joined, names whitespace-cleaned,
coordinates rounded.
