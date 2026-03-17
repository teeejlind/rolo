# Transito Bogota

English-first transit MVP for Bogota, with mobile-first UX and a new web deployment path for friend testing.

This repo is the Phase 0 foundation for a private daily-use app focused on:

- nearby stops and departures
- stop detail
- trip planning through OpenTripPlanner
- guided trips and Live Activities later
- favorites, recents, Home, and Work

The product can add Spanish later, but the current build is intentionally English-first because the primary tester is English-speaking.

## What is here today

- `apps/mobile`: Expo Router app for phone and web
- `services/api`: Fastify API starter plus static GTFS refresh tooling
- `services/routing`: OpenTripPlanner notes and config templates
- `packages/types`: shared transit-facing TypeScript types
- `packages/transit-core`: shared helpers like distance math and query cleanup
- `docs`: working architecture and product notes
- `infra/docker`: local Docker stack for Postgres, Redis, and OTP

## Git vs GitHub

- Git is the version history living on your computer inside this folder.
- GitHub is the website where we can publish this repo later.
- I already ran `git init`, so this folder is now a real Git repository.
- It is not connected to GitHub yet, which is fine. We can do that together when you are ready.

## First-time setup

1. Run `npm install`
2. Run `npm run setup`
3. Open `.env` and fill in `BOGOTA_GTFS_STATIC_URL`
4. Run `npm run refresh:static`
5. Run `npm run dev:api`
6. In a second terminal, run `npm run dev:mobile`

If you are testing on a physical iPhone instead of the simulator:

1. Run `npm run local-ip`
2. Put that IP into `EXPO_PUBLIC_API_BASE_URL` inside `.env`
3. Restart the mobile app after changing the env value

## Useful commands

- `npm run dev`: starts API and mobile together
- `npm run dev:api`: starts only the backend
- `npm run dev:mobile`: starts only Expo
- `npm run web`: starts the Expo web dev server
- `npm run build:web`: exports the web build
- `npm run deploy:web:cloudflare`: builds and deploys the web app through Cloudflare Workers
- `npm run refresh:static`: downloads and validates the static GTFS feed
- `npm run reload:realtime`: probes the GTFS-Realtime endpoints and stores a local status snapshot
- `npm run typecheck`: runs TypeScript checks for the API and mobile app

## Current status

The scaffold is intentionally practical rather than complete:

- static GTFS refresh is implemented
- realtime probing is implemented
- nearby stop search and text search are implemented from cached static data
- OTP routing is documented and scaffolded, but not wired end-to-end yet
- Live Activities are planned behind an adapter boundary, not implemented yet

## Recommended next milestone

Build Phase 1 in this order:

1. finish stop departures from static GTFS plus realtime overlays
2. connect the mobile Home screen to the API
3. wire OpenTripPlanner into `/journeys`
4. add favorites and recents storage
5. add guided trip state management

## Docs

- [Working requirements](/Users/tjlind/Desktop/Transit App/docs/requirements.md)
- [Architecture](/Users/tjlind/Desktop/Transit App/docs/architecture.md)
- [Feed notes](/Users/tjlind/Desktop/Transit App/docs/feed-notes.md)
- [Web deployment](/Users/tjlind/Desktop/Transit App/docs/web-deployment.md)
