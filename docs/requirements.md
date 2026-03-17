# Working Requirements Snapshot

This file is the active working summary for implementation.

The original source docs are still in the repo root:

- `Bogota Transit Codex Prompt.md`
- `Bogota Transit MVP Requirements.md`

## Product direction

- Private MVP for one primary tester
- iPhone-first
- English-first for the first release
- Spanish localization can be added later
- Clean, calm UX inspired by Transit

## Phase 0 deliverables

- Monorepo scaffold
- Expo mobile app starter
- Fastify API starter
- GTFS static refresh tooling
- GTFS-Realtime probe tooling
- Docker compose for Postgres, Redis, and OTP
- Beginner-friendly setup docs

## MVP priorities

1. Nearby stops and departures
2. Stop detail
3. Search for places and stops
4. OTP-backed trip planning
5. Guided trip mode
6. Live Activities after the trip-state engine exists

## Not in scope now

- Android
- payments
- NFC or card balance features
- crowdsourced rider data
- multi-city support

## Language note

Station names and route names will stay as official proper nouns, but the interface copy, labels, onboarding, and debug tools should default to English for now.
