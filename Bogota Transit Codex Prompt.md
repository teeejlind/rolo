# Codex Project Prompt: Build a Private Bogotá Transit iPhone MVP

You are helping build a **private, iPhone-first Bogotá transit app MVP**.

This is **not** a generic transit startup app and **not** a public multi-city product. It is a focused, dev-build-first mobile app for one primary tester who lives in or travels to Bogotá and wants a better daily transit tool.

Your job is to scaffold and implement a working repository that can grow iteratively.

## Product intent

Build an iPhone app with a clean Transit-inspired UX for Bogotá that supports:
- nearby stops/stations and upcoming departures
- stop detail with realtime or scheduled ETAs
- trip planning from origin to destination
- GO-style guided trip progression
- iOS Live Activities for active trip progression
- favorites, recents, Home, and Work
- service alerts

Do **not** build payments, NFC card features, crowdsourced rider reporting, or Android support in the first pass.

## Key constraints

1. **iPhone first**. Optimize for iOS development builds.
2. **Use tools that minimize setup pain**.
3. **Use Expo + React Native + TypeScript** for the mobile app.
4. **Use a backend** for GTFS/GTFS-RT ingestion and clean APIs.
5. **Use OpenTripPlanner (OTP)** for routing instead of implementing custom transit routing logic.
6. **Live Activities are required**, but they should sit on top of a clean trip-state engine, not a pile of hacks.
7. Keep the repo understandable by a product-minded solo operator using Codex.

## Recommended stack

### Mobile
- Expo
- React Native
- TypeScript
- Expo Router
- TanStack Query for server state
- Zustand for local client state
- react-native-maps or Expo Maps for MVP maps
- expo-notifications
- expo-location
- expo-secure-store or AsyncStorage for favorites and preferences
- expo-widgets for iOS Live Activities if practical

### Backend
- Node.js
- TypeScript
- Fastify or Express (prefer Fastify if you have no strong reason otherwise)
- PostgreSQL
- Redis
- GTFS parsing libraries as needed
- protobuf/GTFS-RT parsing

### Routing
- OpenTripPlanner in Docker
- configuration files version-controlled in repo

## Data sources

### Static GTFS
Use an env var:
- `BOGOTA_GTFS_STATIC_URL`

This should point to Bogotá’s official static GTFS ZIP for TransMilenio + SITP.

### GTFS-Realtime endpoints
Use these exact env vars and defaults:
- `BOGOTA_GTFS_RT_VEHICLE_POSITIONS=https://gis.transmilenio.gov.co/gtfs/vehiclepos.pb`
- `BOGOTA_GTFS_RT_SERVICE_ALERTS=https://gis.transmilenio.gov.co/gtfs/serviceAlerts.pb`
- `BOGOTA_GTFS_RT_TRIP_UPDATES=https://gis.transmilenio.gov.co/gtfs/tripupdate.pb`

## What to build first

### Phase 0: Repository scaffold
Create a monorepo like this:

```text
bogota-transit/
  apps/
    mobile/
  services/
    api/
    routing/
  packages/
    types/
    transit-core/
  docs/
  infra/
```

Include:
- root README
- `.env.example`
- Docker setup for local Postgres, Redis, and OTP
- scripts for setup, feed refresh, and local dev

## Phase 1: Backend foundation
Implement backend services that can:
- download and ingest static GTFS from `BOGOTA_GTFS_STATIC_URL`
- parse and normalize stops, routes, trips, stop_times, calendars
- poll GTFS-RT feeds on a schedule
- normalize:
  - vehicle positions
  - trip updates
  - service alerts
- expose clean REST endpoints

Required endpoints:
- `GET /health`
- `GET /system/status`
- `GET /stops/nearby?lat=&lon=&radius=`
- `GET /stops/:stopId`
- `GET /stops/:stopId/departures`
- `GET /search?q=`
- `GET /journeys?from=&to=&departAt=&arriveBy=`
- `GET /routes/:routeId/alerts`

Also include admin/dev endpoints:
- `POST /admin/feeds/refresh-static`
- `POST /admin/feeds/reload-realtime`

## Phase 2: OTP integration
Create routing service files and documentation to:
- mount GTFS + OSM data into OTP Docker container
- build a graph
- serve journey planning requests
- wire GTFS-RT updaters if feasible in first pass

Add documentation that explains:
- how to get Bogotá OSM extract
- how to build the OTP graph
- how app/backend call OTP

Do not overcomplicate this with Kubernetes or cloud deployment yet.

## Phase 3: Mobile app foundation
Build an Expo app with:
- Expo Router
- a clean design system
- tabs or a simple root nav structure
- screens for:
  - Home
  - Search
  - Trip results
  - Trip detail
  - Guided trip
  - Saved places
  - Settings / Debug

The app must support:
- requesting location
- reading nearby stops from backend
- opening stop detail
- searching places and stops
- planning a trip
- starting guided trip mode

## UX requirements

### Home screen
Show:
- search bar
- Home / Work shortcuts
- saved stops row if available
- nearby stops list
- each row should show route badges and next departures
- quick map preview is optional, but nice

### Stop detail
Show:
- stop name
- departures list
- route badges
- destination labels
- realtime vs scheduled state
- alert badge
- favorite button

### Trip results
Show multiple options with:
- total duration
- departure and arrival time
- walking minutes
- transfers
- major route lines
- alert indication

### Guided trip screen
Show one dominant instruction at a time:
- walk to stop
- wait for route X
- board now
- stay on for N stops
- get off now
- transfer now

Avoid clutter.

## Live Activity requirements

Implement a trip-state engine with these states:
- `walking_to_stop`
- `waiting_to_board`
- `on_vehicle`
- `walking_transfer`
- `waiting_transfer`
- `completed`
- `cancelled`

Build Live Activity support for iOS that shows:
- active route line
- destination or next action
- ETA/countdown
- stops remaining when on vehicle
- current leg state

Important:
- If `expo-widgets` is too unstable in first implementation, isolate the Live Activity feature behind an adapter and leave a fallback path.
- The guided trip flow must still work without Live Activities.

## Coding requirements

- Use TypeScript everywhere practical.
- Keep functions small and testable.
- Use domain-driven naming for transit concepts.
- Prefer clarity over cleverness.
- Add comments only where they help explain non-obvious transit logic.
- Create shared types for stops, routes, departures, alerts, journey legs, and live activity state.
- Use a feature-based folder structure inside the mobile app.

## Data-model requirements

At minimum model:
- Stop
- Route
- Trip
- StopTime
- ServiceAlert
- VehiclePosition
- Departure
- Journey
- JourneyLeg
- FavoritePlace
- FavoriteStop
- LiveTripSession

## Realtime logic requirements

- Clearly mark whether an ETA is realtime or scheduled.
- Include source freshness timestamps.
- If realtime data is stale or missing, degrade to scheduled data instead of failing.
- Never present realtime-looking UI for scheduled-only data.

## Offline and caching requirements

For the app:
- cache favorites, recents, and the last known useful stop data
- preserve recently viewed stops and routes
- allow the app to open into a useful state even when the network is weak

For the backend:
- cache hot stop departures and alerts in Redis
- avoid hammering external feeds unnecessarily

## Debugging requirements

Create a hidden or obvious debug screen in the mobile app showing:
- backend base URL
- GTFS static refresh timestamp
- GTFS-RT last poll timestamps
- OTP availability
- app build version
- current location snapshot

## Testing requirements

Add at least:
- unit tests for transit normalization helpers
- tests for ETA labeling logic (realtime vs scheduled)
- tests for journey-to-guided-trip state mapping
- one or more integration tests for stop departures API

## Initial acceptance criteria

The first meaningful milestone is reached when all of the following are true:
1. I can run the backend locally.
2. I can run OTP locally.
3. I can launch the Expo iPhone dev build.
4. The app can show nearby Bogotá stops.
5. The app can show upcoming departures for a stop.
6. The app can search origins/destinations.
7. The app can return trip plans.
8. I can start a guided trip.
9. A basic Live Activity can start and update during a guided trip.

## Deliverables expected from Codex

1. A working scaffolded repository
2. Local setup instructions that actually work
3. `.env.example`
4. Docker Compose or equivalent local orchestration
5. Basic UI for the critical screens
6. Backend APIs with typed responses
7. OTP config and docs
8. Seed scripts or feed refresh scripts
9. A short “what to build next” checklist

## Important product judgment rules

- Do not waste time on a fancy landing screen.
- Do not invent social features.
- Do not build Android abstractions now.
- Do not bury core information behind too many taps.
- Do not optimize for a public launch yet.
- Optimize for: “Can this replace my current Bogotá transit habits in dev build form?”

## Nice-to-have after the first milestone

- favorites and recent trips
- alert subscription preferences
- local notifications for “leave now” and “get off now”
- saved Home and Work
- better map polish
- richer Live Activity layouts
- stale-data warnings and diagnostics

## Output format for Codex

When you start, do this in order:
1. summarize the architecture you will implement
2. create the repo structure
3. generate the config and env files
4. scaffold the backend
5. scaffold the mobile app
6. scaffold OTP config
7. implement nearby stops flow end-to-end
8. implement trip planning flow end-to-end
9. implement guided trip mode
10. implement Live Activity adapter
11. write setup docs and next steps

Be concrete. Prefer shipping a clean thin slice over pretending to finish the whole universe.
