# Architecture

## Monorepo layout

- `apps/mobile`: Expo Router app
- `services/api`: API, GTFS refresh scripts, normalized cache files
- `services/routing`: OTP setup notes and config templates
- `packages/types`: shared domain types
- `packages/transit-core`: shared helpers

## Mobile responsibilities

- location permission
- nearby stop UI
- stop detail UI
- journey request UI
- guided trip UI shell
- local storage for saved entities later

## API responsibilities

- download and validate static GTFS
- cache normalized stop and route datasets locally
- expose nearby stop and search endpoints
- expose system status for debugging
- probe GTFS-Realtime endpoints
- host the future `/journeys` bridge to OTP

## Routing responsibilities

- host OTP in Docker
- mount Bogota GTFS and OSM inputs
- build and serve the graph
- later attach GTFS-Realtime updaters

## Current tradeoffs

- PostgreSQL and Redis are scaffolded in Docker but not required for the first static-feed slice
- static GTFS is cached as JSON so the API is easy to start before database ingestion exists
- the mobile app is seeded with sample data first so the UI shape can evolve before the API is fully wired
- localization is postponed, but copy should stay easy to extract later
