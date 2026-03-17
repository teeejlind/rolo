# Feed Notes

## Required environment variables

- `BOGOTA_GTFS_STATIC_URL`
- `BOGOTA_GTFS_RT_VEHICLE_POSITIONS`
- `BOGOTA_GTFS_RT_SERVICE_ALERTS`
- `BOGOTA_GTFS_RT_TRIP_UPDATES`

## Current refresh behavior

- Static GTFS: manual refresh via `npm run refresh:static`
- Vehicle positions: manual probe via `npm run reload:realtime`
- Service alerts: manual probe via `npm run reload:realtime`
- Trip updates: manual probe via `npm run reload:realtime`

## Verification note

On March 17, 2026, the scaffold's realtime probe hit the documented TransMilenio feed URLs and received `404` responses for all three protobuf endpoints. The official GTFS page still lists those URLs, so treat realtime integration as "needs revalidation" before building trip-state logic on top of it.

## Phase 0 output files

- `services/api/data/cache/stops.json`
- `services/api/data/cache/routes.json`
- `services/api/data/cache/static-metadata.json`
- `services/api/data/cache/realtime-status.json`

## Phase 1 plan

- parse trips, stop times, and service calendars
- derive stop departures from static schedules
- overlay trip updates when IDs match
- map alerts to routes and stops
- move hot responses into Redis
