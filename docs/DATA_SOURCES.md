# Bogotá transit data sources

Researched 2026-09-25. Everything below was downloaded and inspected, not taken from documentation.

## Headline

The trunk system appears in TransMilenio's official GTFS from the **2026-03-17** export onward
(TransMilenio changed its pipeline then: new agency ids, `feed_info.txt` added, daily
`GTFS_YYYYMMDD.zip` files from 2026-04-10).

| Export | Troncal routes (agency 1) |
|---|---|
| 2024-02-28 through 2025-12-05 | 0 |
| 2026-03-17, 04-01, 04-29 | 109 |
| 20260410 | 111 |
| 20260817 (holiday export, partial) | 90 |
| 20260908 through 20260920 | 113 |

Transitous lacks trunk routes because it pulls Bogotá via the transit.land atlas
(`feeds/transmilenio.gov.co.dmfr.json`), which is still pinned to `GTFS-2024-02-21.zip` and uses
the old agency ids.

## 1. GTFS bucket (primary source)

- Listing: `https://storage.googleapis.com/storage/v1/b/gtfs-estaticos/o` (~300 objects, one page).
- About 120 MB zipped; `stop_times.txt` is ~574 MB unzipped. Validity per feed_info: 20260101–20261231.
- License: CC BY-SA 4.0 (datos.gov.co `nysb-4689`, datosabiertos.bogota.gov.co).
- **No stable "latest" URL, and some exports are defective.** Holiday-dated exports are partial;
  GTFS_20260920 has 1,686 Sunday/holiday trips on 9 routes with no stop_times.
  `tools/fetch_latest_gtfs.py` walks exports newest-first and keeps the first one that validates.

Agency ids (new scheme): 1 Troncal · 2 Alimentadores · 3 Zonal-Urbano · 4 Zonal-Complementario ·
5 Zonal-Especial · 6 Dual · 7 TransMiCable.

What the 20260918 export contains for the trunk:
- 95 troncal service codes; each direction is its own route_id (e.g. `11231` "1" → Universidades and
  `13171` "1" → Portal Eldorado). `route_long_name` is the destination only.
- Colors are placeholders: `ff0000` for every troncal route, `00ff00` for dual, `0000ff` for zonal.
- `trip_headsign` blank on every trip; no `direction_id`.
- Services: 1 = weekdays, 2 = Saturday, 4 = Sunday/holiday (calendar_dates swaps in 4 on the 2026 holidays).
- Troncal runs on explicit trips (frequencies.txt covers the cable only). 728,815 troncal + dual stop_times rows.
- Stops are platform-level; the name or the stop_code carries the wagon and doors,
  e.g. "Av. Jiménez E - 2 ó 5" or code "Calle 72 C - 4". Portal bays look like "Portal Tunal T2".
- 155 stations with child platforms, 142 served. Unserved: Caracas stations closed for Metro works
  (Hospital, Tercer Milenio, Calle 19, 34, 45, 63, and Calle 76, which closed 2026-08-22 when
  Calle 72 opened) plus legacy ids.
- 119 platforms used by troncal/dual trips have no parent station (dual curbside stops, a few Portal Usme bays).
- Station names include sponsors ("Portal Norte - Unicervantes", "Calle 72 - Areandina"), so the
  router's geocoder misses how people say them. The app searches its bundled station list first.
- fare_attributes covers the cable only.

Zonal `route_long_name` values like "A427 Centro Andino || F427 Calandaima" name both ends of the
route. Where the trip starts and ends at the same stop, it's a loop.

## 2. TransMilenio ArcGIS (`https://gis.transmilenio.gov.co/arcgis/rest/services`)

- **Stations** — `Troncal/consulta_estaciones_troncales/0` and `Consulta_Planificacion_SITP/FeatureServer/2`
  (153 records each). `numero_estacion` equals the GTFS parent stop_id as an integer. Carries
  `troncal_estacion`, `id_trazado`, `tipo_estacion`, `numero_vagones`. Every record says operational,
  including closed stations. Attribution: "Fuente: TRANSMILENIO S.A: www.transmilenio.gov.co".
- **Corridors** — planning FeatureServer/5 (22 features) and `Troncal/consulta_trazados_troncales` (20).
  `le_troncal` letters: A Caracas, B Autonorte, C Suba, D Calle 80, E NQS Central, F Américas,
  G NQS Sur/Soacha, H Caracas Sur/Usme, J Eje Ambiental, K Calle 26, L Cra 10, M Cra 7,
  Z Av. Ciudad de Cali. `tipo_tra` 1 = in operation.
- **Services** — planning FeatureServer/15 (693 records; 126 with `comp_sitp=1` are troncal) with
  `cod_ruta`, `cod_linea` (direction pair, e.g. BJ74), origin/destination and hours as text
  (CC BY 4.0). `Troncal/consulta_rutas_troncales` (128 records) has cleaner hours fields. Neither
  has stop sequences or headways. Weekday start times agree with GTFS within 30 min for 106 of 121 routes.
- Dead ends: `matriz_distancia_troncal` returns HTTP 500; `estacion_sae_sne` is stale (2021);
  `conexiones` errors; `BRT/consulta_desvios_brt` is a static detour catalog, not live alerts;
  `GTFS_dinamicos` has no public services.

## 3. Mobility Database

`mdb-3358` (active) points at GTFS-2026-04-29. Its stable URL
`https://files.mobilitydatabase.org/mdb-3358/latest.zip` (last modified 2026-07-13) **has troncal
(109 routes)** but is stale. No Colombian GTFS-RT feeds.

## 4. transit.land

REST API needs a key. The atlas entry is the stale 2024 pin described above.

## Real-time

Nothing public. TransMiApp has live ETAs and a trip planner (launched 2026-04), but its backend
isn't public.

## Metro de Bogotá Línea 1

Not in service. 81.25% built as of 2026-07-31; commercial operation targeted for March 2028.
