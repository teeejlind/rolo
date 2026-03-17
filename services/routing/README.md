# Routing Service Notes

This folder is for OpenTripPlanner.

## Phase 0 status

- Docker service is scaffolded in `infra/docker/docker-compose.yml`
- `router-config.json` is version-controlled
- data inputs should live in `services/routing/data`

## Expected OTP input files

- `services/routing/data/gtfs/bogota.zip`
- `services/routing/data/osm/bogota.osm.pbf`

## Typical flow later

1. Download a Bogota OSM extract into `services/routing/data/osm`
2. Put the static GTFS zip into `services/routing/data/gtfs`
   - shortcut: run `npm run otp:prepare` to copy the already-downloaded GTFS zip into place
3. Build the OTP graph
4. Start the OTP server
5. Point the API `/journeys` endpoint at `OTP_BASE_URL`

## Current API behavior

- The API now tries OpenTripPlanner first for `/journeys`
- If OTP is not running, the API falls back to the local static GTFS planner
- That means the mobile app can show route options now, and will upgrade automatically once OTP is available

## Realtime note

GTFS-Realtime updaters are intentionally not enabled by default yet because OTP needs the correct GTFS `feedId` from the built graph. That is safer to wire once the first graph build is confirmed.
