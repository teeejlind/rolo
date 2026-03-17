# Bogotá Transit iPhone MVP Requirements

## 1) Product summary

Build an iPhone-first transit app for Bogotá that feels much closer to Transit than to the current civic-app sludge.

The first release is **private/dev-build only** for personal use. It should be reliable enough for daily commuting, opinionated enough to save taps, and narrow enough that one person with Codex can actually ship it.

Working product name: **Transito Bogotá**

## 2) Why this exists

Bogotá already exposes the core transit data needed for a real MVP:
- static **GTFS** for TransMilenio BRT + SITP services
- official **GTFS-Realtime** feeds for vehicle positions, service alerts, and trip updates
- official route-planning behavior already exists in TransMi App, which proves the underlying data model is usable

The market gap is not “no data.” The gap is:
- weak UX
- trust issues with existing apps
- poor presentation of live departures
- weak trip guidance once a route starts
- no polished, Transit-like iPhone experience focused on Bogotá

## 3) Product goals

### Primary goal
Give the user a cleaner, faster, more trustworthy way to:
- see nearby stops/stations and upcoming departures
- plan a trip across Bogotá using TransMilenio + SITP + walking
- follow that trip in real time with iPhone-native guidance, including Live Activities

### Secondary goals
- Reduce “open three apps and pray” behavior
- Make the app useful enough for daily personal use before any public launch
- Keep the architecture simple enough to evolve into a public beta later

### Non-goals for MVP
- Android app
- payments / in-app ticketing
- NFC tullave balance checking
- crowdsourced vehicle tracking like Transit GO
- complex detour detection ML
- bikeshare / scooter / ridehail integrations
- a full multi-city platform

## 4) Target user

### Primary user
A daily or semi-daily Bogotá rider who uses TransMilenio and SITP and wants:
- fast nearby departures
- better route planning
- clearer “what do I do next?” guidance
- fewer ugly screens and less guesswork

### Initial user profile for build decisions
The initial user is you:
- iPhone user
- comfortable testing dev builds
- already understands the Bogotá system well enough to spot bad routing
- willing to trade broad feature count for cleaner execution

## 5) Product principles

1. **Departures first.** Opening the app should answer: “What can I catch near me right now?”
2. **Trip guidance over map theater.** Fancy maps are nice. “Leave now, board this bus, get off here” matters more.
3. **Realtime when available, schedule when not.** The app must clearly distinguish the two.
4. **One-tap repeat behavior.** Home, work, saved destinations, pinned stops, recent trips.
5. **Private-beta pragmatism.** Use the easiest stack that can still support Live Activities and dev builds.

## 6) Competitive reference: Transit functionality to borrow

This app should **not** clone Transit wholesale. It should borrow the parts that matter most.

### Core Transit behaviors worth copying in MVP
- nearby transit options immediately on open
- stop/line detail with upcoming ETAs
- trip planning from A to B
- compare route options
- step-by-step trip guidance via GO-style flow
- favorite locations and pinned lines
- service alerts for lines and routes
- clear distinction between real-time vs scheduled arrivals
- ability to select a specific departure, not just a generic route
- useful offline fallback for schedules already cached on device

### Transit behaviors to treat as Phase 2+
- crowdsourced GO vehicle tracking
- crowding estimates and Rate-My-Ride
- automatic detour inference
- in-app ticketing
- leaderboards / avatars / Royale-style personalization
- multimodal extras like scooters, bikeshare, ridehail

## 7) Bogotá data inventory required for MVP

### Required transit data sources

#### A. Static GTFS
Use Bogotá’s official static GTFS feed for TransMilenio + SITP.

Required uses:
- stops and stations
- routes and route names
- trips and stop sequences
- scheduled arrival/departure times
- trip planning graph build

Implementation note:
- The static GTFS URL should be configured as an environment variable so it can be swapped if the file path changes.
- Do not hardcode a dated ZIP URL in app code.

Suggested env var:
- `BOGOTA_GTFS_STATIC_URL`

#### B. GTFS-Realtime vehicle positions
Official endpoint:
- `https://gis.transmilenio.gov.co/gtfs/vehiclepos.pb`

Required uses:
- stop-level live departures
- map vehicle positions
- route progression once a trip starts

#### C. GTFS-Realtime service alerts
Official endpoint:
- `https://gis.transmilenio.gov.co/gtfs/serviceAlerts.pb`

Required uses:
- disruption banners
- route warnings in trip results
- stop closures / severe service changes

#### D. GTFS-Realtime trip updates
Official endpoint:
- `https://gis.transmilenio.gov.co/gtfs/tripupdate.pb`

Required uses:
- better ETAs when available
- stop-level countdowns
- trip-state updates during route progression

### Optional Bogotá datasets for Phase 1.5 or Phase 2
- zonal stop datasets
- trunk station datasets
- corridor/route shape datasets for map enrichment
- amenities / top-up / station services datasets
- TransMiCable infrastructure datasets

These are nice, but GTFS static already contains what the app needs for the actual rider flows.

## 8) Recommended technical approach

## Recommended stack

### Mobile app
Use **Expo + React Native + TypeScript**.

Why:
- lowest-friction path to an iPhone app you can run in dev builds
- strong ecosystem
- easy EAS development builds
- fast iteration with Codex
- current Expo tooling now supports iOS widgets and Live Activities via `expo-widgets` in alpha

### Backend
Use a small **Node.js / TypeScript backend**.

Responsibilities:
- ingest static GTFS
- poll GTFS-RT feeds
- expose clean JSON APIs for the app
- build / serve routing results
- cache and normalize data
- avoid pushing GTFS protobuf parsing and heavy routing logic into the phone app

### Routing engine
Use **OpenTripPlanner (OTP)** in Docker.

Why:
- purpose-built for routing from GTFS + OpenStreetMap
- supports GTFS-Realtime updaters
- faster and safer than writing your own transit router from scratch like a maniac

### Map layer
Preferred MVP map option:
- **react-native-maps** or **Expo Maps** for quickest time-to-value

Reason:
- easiest path for basic stop pins, vehicle markers, polylines, and user location
- MapLibre is attractive, but adds more integration complexity than this MVP needs

If custom cartography becomes important later, consider MapLibre in a future refactor.

### Geocoding / search
Use a geocoding provider abstraction.

For MVP:
- start with a simple provider that supports forward + reverse geocoding reliably in Bogotá
- do **not** rely on public Nominatim for production-like mobile volume

Suggested interface:
- `searchPlaces(query)`
- `reverseGeocode(lat, lon)`

Potential providers:
- Mapbox Geocoding
- Google Places / Geocoding
- self-hosted Nominatim later if needed

## 9) Architecture overview

### Components

#### A. Mobile app
Responsibilities:
- location permission and current location
- nearby stops UI
- trip planning UI
- favorites / recents / pinned stops
- trip guidance UI
- Live Activity state management
- local caching for recent schedules, stops, favorites

#### B. API/backend service
Responsibilities:
- fetch and refresh GTFS static feed daily or on demand
- parse GTFS-RT feeds every 15 to 30 seconds
- compute stop departures by joining static + realtime
- expose stop, route, vehicle, alert, and trip-planning endpoints
- manage normalized transit data store

#### C. OpenTripPlanner service
Responsibilities:
- build graph from Bogotá GTFS + Bogotá OSM data
- answer journey-planning queries
- optionally ingest GTFS-RT so trip plans reflect current conditions

#### D. Storage
Use PostgreSQL + Redis.

PostgreSQL:
- normalized stop, route, trip, shape, favorite, and recent-search data

Redis:
- hot cache for departures, alerts, and route planning responses

## 10) Functional requirements

## FR-1: Onboarding and permissions

### Requirements
- App launches to a lightweight intro flow on first open
- Ask for location permission with clear justification
- If denied, support manual location search and saved places
- Allow user to set Home and Work during onboarding or later

### Acceptance criteria
- User can continue without granting location
- User can still search stops and plan trips manually

## FR-2: Home screen / nearby transit

### Requirements
- On open, show nearby stops/stations sorted by walking distance
- Show upcoming departures for nearby stops
- For each departure, show:
  - route/line
  - destination/headsign
  - ETA countdown
  - whether ETA is real-time or schedule-based
  - service alert indicator if applicable
- Show user location on map and nearby stop markers
- Tapping a stop opens stop detail

### Acceptance criteria
- User can see nearby stops within 2 seconds from cached data, then refreshed data loads
- Real-time departures visually differ from scheduled departures
- Empty state handles no nearby stops gracefully

## FR-3: Stop detail

### Requirements
- Show stop/station name
- Show all upcoming departures for that stop
- Group by route where helpful
- Show stop map location
- Show service alerts affecting that stop or route
- Allow pinning a stop as favorite
- Allow creating a simple arrival reminder for one departure

### Acceptance criteria
- Stop detail can be opened from map, nearby list, search, or route leg
- User can refresh manually

## FR-4: Search

### Requirements
- Search for places, addresses, stops, and stations
- Show recent searches
- Show Home / Work / favorites prominently
- Support reverse geocoding for map-selected origin/destination

### Acceptance criteria
- Search handles Bogotá addresses and known stations reliably
- Search results return both transit entities and place results

## FR-5: Route planning

### Requirements
- User can plan a trip from:
  - current location
  - typed address
  - saved place
  - selected map point
  - stop/station
- Trip planner returns multiple ranked options
- Each option should show:
  - total travel time
  - walking time
  - number of transfers
  - route lines involved
  - next viable departure
  - alert indicator if any leg is affected
- User can optionally choose:
  - leave now
  - depart at
  - arrive by
- User can open full trip details

### Acceptance criteria
- At least 3 route options when data supports it
- App gracefully explains when no valid route exists

## FR-6: Trip detail

### Requirements
- Full leg-by-leg trip breakdown
- Show walking segments
- Show boarding stop and alighting stop
- Show the exact route line / destination
- Show departure times per leg
- Show selected departure card when user chooses a specific run
- Show map polyline for full trip and active leg

### Acceptance criteria
- User can start navigation from any route option
- User can change to a later/earlier departure before starting navigation

## FR-7: GO-style live trip guidance

### Requirements
- Once user starts a trip, app enters guided trip mode
- Guided mode must show:
  - time to leave for stop
  - walking progress to stop
  - “board now” cue
  - number of stops remaining
  - estimated arrival time
  - transfer warnings
  - “get off now” cue
- Guided mode should continue if screen is locked via Live Activity
- Guided mode should work even if the user switches apps

### Acceptance criteria
- User receives local notifications for key transitions:
  - leave now
  - approaching stop
  - transfer soon
  - get off now
- Guidance state survives brief backgrounding / app switching

## FR-8: Live Activities on iPhone

### Requirements
- When guided trip mode starts, app can start an iOS Live Activity
- Live Activity must support at minimum:
  - current phase of trip (walking / waiting / riding / transferring)
  - route line + destination
  - next action
  - ETA / countdown
  - stops remaining during ride
- Dynamic Island presentation should include minimal at-a-glance status
- Lock Screen presentation should include richer progress info

### Acceptance criteria
- Live Activity updates when the active leg changes
- Live Activity ends automatically when trip ends or is cancelled
- If Live Activity fails to start, in-app guidance still works

## FR-9: Favorites and recents

### Requirements
- Save favorite stops/stations
- Save favorite locations
- Save recent trips
- Save pinned routes/lines

### Acceptance criteria
- Favorite entities available offline from local storage
- Home screen can prioritize favorites above generic nearby results

## FR-10: Alerts and disruptions

### Requirements
- Display GTFS-RT service alerts in:
  - home screen nearby rows
  - stop detail
  - route planning results
  - guided trip mode
- Alerts should be normalized by severity where possible
- Severe alerts should trigger visual warning state

### Acceptance criteria
- App never hides active high-severity alerts on the selected route
- Alerts do not block route planning UI

## FR-11: Offline / degraded mode

### Requirements
- Cache the most recent static GTFS-derived data for stops, routes, and scheduled departures
- If network is unavailable, app should still allow:
  - stop browsing
- schedule-based route detail for cached entities
  - schedule-based trip planning if backend is reachable but realtime is not
- Clearly label stale data

### Acceptance criteria
- User can still inspect saved stops and recent trip structures offline
- Realtime-only UI elements degrade gracefully

## FR-12: Settings

### Requirements
- Units: minutes / distance conventions
- Default walking speed preset if needed
- Notification preferences
- Home / Work management
- Data source / diagnostics screen for private beta

### Acceptance criteria
- Debug info screen shows feed timestamps and last successful refresh

## 11) Non-functional requirements

### Performance
- Home screen initial paint in under 2 seconds on warm start
- Nearby departures refresh visibly in under 5 seconds under normal network conditions
- Trip planning result load target under 4 seconds for common journeys

### Reliability
- GTFS-RT ingestion failures must not crash the app
- Backend should fall back to schedule-based answers when realtime is unavailable
- All APIs should expose source timestamps for troubleshooting

### Privacy
- Keep personal data minimal
- Store favorites, recent trips, and notification preferences only
- Avoid analytics SDK bloat in the private build

### Accessibility
- Dynamic Type support
- VoiceOver labels for trip actions, stops, ETAs, and alerts
- color must not be the only signal for realtime vs scheduled vs alert state

## 12) Recommended backend APIs

## Stop APIs
- `GET /stops/nearby?lat={lat}&lon={lon}&radius={meters}`
- `GET /stops/{stopId}`
- `GET /stops/{stopId}/departures`

## Search APIs
- `GET /search?q={query}`
- `GET /geocode/reverse?lat={lat}&lon={lon}`

## Planning APIs
- `GET /journeys?from={lat,lon|placeId|stopId}&to={...}&departAt=&arriveBy=`
- `GET /journeys/{journeyId}`

## Realtime APIs
- `GET /vehicles/{vehicleId}`
- `GET /routes/{routeId}/alerts`
- `GET /system/status`

## Optional internal/admin APIs
- `POST /admin/feeds/refresh-static`
- `POST /admin/feeds/rebuild-graph`

## 13) Data processing requirements

### Static GTFS ingestion
- Download GTFS ZIP
- Validate required files exist
- Normalize stops, routes, trips, stop_times, calendar data
- Build searchable stop and route indexes
- Export graph input for OTP

### Realtime ingestion
- Poll vehicle positions every 15 to 30 seconds
- Poll trip updates every 15 to 30 seconds
- Poll service alerts every 30 to 60 seconds
- Parse protobuf feeds and map IDs to static GTFS entities
- Persist normalized snapshots and cache hot results

### Data quality handling
- If trip update references unknown trip, log and drop
- If vehicle position is stale beyond threshold, mark vehicle as stale
- If alert cannot be mapped to a visible entity, preserve raw alert and expose via diagnostics

## 14) UX requirements

## Home screen layout
Top section:
- current location or selected context
- search bar
- shortcuts for Home, Work, Favorites

Main section:
- nearby stops/stations list
- compact departure cards
- optional mini map

## Stop card
- stop name
- walking distance
- next 2 to 4 departures
- realtime/scheduled tag
- alert badge

## Route result card
- main route label(s)
- departure time
- arrival time
- total duration
- walking minutes
- transfers
- disruption badge

## Guided trip UI
- one dominant next action
- large countdown or stop count
- route badge
- clear leg progress

Design note:
This should feel calm, not civic. No cluttered info walls. No giant paragraphs. No tiny tap targets.

## 15) Live Activity state model

### Activity states
- `walking_to_stop`
- `waiting_to_board`
- `on_vehicle`
- `walking_transfer`
- `waiting_transfer`
- `completed`
- `cancelled`

### Required fields
- activity id
- journey id
- current state
- route short name
- headsign/destination
- current stop / next stop
- scheduled time
- realtime ETA if available
- stops remaining
- progress fraction (when available)
- last updated timestamp

### Update triggers
- user starts guided trip
- arrival at stop detected
- boarding inferred / manually confirmed
- next stop changes
- transfer leg begins
- final leg begins
- trip ends or user cancels

## 16) Testing requirements

### Manual test scenarios
1. Launch near a high-density Bogotá corridor and confirm nearby departures render
2. Search for a known station and confirm stop detail + ETAs
3. Plan trip from one common Bogotá point to another using current location
4. Plan trip using typed origin/destination
5. Start guided trip and verify notification timing
6. Lock phone and confirm Live Activity updates
7. Simulate loss of network and verify degraded mode
8. Simulate stale realtime feed and verify fallback labeling
9. Confirm service alerts appear on affected routes
10. Verify favorites persist across app restarts

### Beta diagnostics requirements
- hidden debug screen
- feed timestamps
- last static GTFS refresh time
- last OTP graph build time
- backend version hash
- selected journey raw JSON view for debugging

## 17) Delivery phases

## Phase 0: Foundation
- repo scaffold
- Expo app bootstrapped
- backend bootstrapped
- OTP local Docker setup
- static GTFS ingestion working

## Phase 1: Core utility
- nearby stops
- stop detail
- basic search
- favorites
- schedule + realtime departures

## Phase 2: Trip planning
- OTP-backed route planning
- trip detail
- selectable departures

## Phase 3: Guidance
- guided trip mode
- notifications
- Live Activity

## Phase 4: Polish for private daily use
- caching
- better alert surfaces
- debug tools
- UX tuning

## 18) Recommended build decisions

### Decision 1: iPhone only for now
Do not pretend this is cross-platform yet. Build for iPhone first.

### Decision 2: backend-first transit logic
Do not parse GTFS protobuf feeds in the client except maybe in experiments. Keep the app thin.

### Decision 3: OTP for routing
Do not hand-build a router. That is how hobbies die.

### Decision 4: live activity only after core guidance works
The Live Activity UI should mirror an already-working guided-trip state machine, not invent one.

## 19) Risks

### Data quality risk
Realtime data may be noisy, stale, or uneven by corridor.
Mitigation:
- show source freshness
- fall back to scheduled data clearly
- keep debug tooling visible in beta

### Geocoding risk
Bogotá address search may behave inconsistently depending on provider.
Mitigation:
- abstract provider choice
- prefer saved places and recent stops in frequent use flows

### Expo alpha risk
`expo-widgets` is currently alpha.
Mitigation:
- keep Live Activity integration isolated behind a feature boundary
- ship app value even if Live Activity needs temporary simplification

### OTP ops risk
Graph build and realtime updater config add setup complexity.
Mitigation:
- use Docker from day one
- keep configuration under version control
- document exact graph build steps

## 20) Success criteria for private beta

The MVP is successful if:
- you can use it for real Bogotá trips at least several times per week
- nearby departures feel faster and clearer than current alternatives
- route planning is usually trustworthy for common trips
- guided trip mode is useful enough that you keep it open during rides
- Live Activity helps during active trips instead of becoming decorative nonsense

## 21) Suggested repo structure

```text
bogota-transit/
  apps/
    mobile/                 # Expo iPhone app
  services/
    api/                    # Node/TS API
    routing/                # OTP config + docker files
  packages/
    ui/                     # shared UI tokens/components if needed
    types/                  # shared TypeScript types
    transit-core/           # common domain types / helpers
  docs/
    requirements.md
    architecture.md
    feed-notes.md
  infra/
    docker/
    scripts/
```

## 22) Source appendix

Transit app and product behavior:
- Transit official site: https://transitapp.com/
- Transit support: How to use Transit: https://help.transitapp.com/article/93-how-to-use-transit
- Transit support: departures / realtime / detours: https://help.transitapp.com/article/445-how-to-track-departures-on-your-transit-line
- Transit support: service alerts: https://help.transitapp.com/article/96-get-notifications-about-disruptions-on-your-line
- Transit support: offline behavior: https://help.transitapp.com/article/90-does-transit-work-offline
- Transit support: accessibility info: https://help.transitapp.com/article/98-accessibility-information
- Transit support: ticketing: https://help.transitapp.com/article/389-buy-tickets-token
- Transit support: pinned lines: https://help.transitapp.com/article/103-save-your-favorite-transit-lines
- Transit support: Royale features: https://help.transitapp.com/article/362-royale-faq
- Transit partners docs: GTFS guidance: https://resources.transitapp.com/article/458-guidelines-for-producing-gtfs-static-data-for-transit

Bogotá transit data and official app:
- Official GTFS-Realtime endpoints page: https://gis.transmilenio.gov.co/gtfs/
- World Bank metadata page for Bogotá GTFS: https://datacatalog.worldbank.org/search/dataset/0043634/bogota-colombia-transmilenio-and-sitp-transit-services-general-transit-feed-specification-gtfs
- TransMilenio homepage / route tools: https://www.transmilenio.gov.co/
- TransMi App Google Play listing: https://play.google.com/store/apps/details?id=com.nexura.transmilenio
- TransMi App App Store listing: https://apps.apple.com/pa/app/transmi-app/id1195720094

Implementation stack:
- Expo widgets docs: https://docs.expo.dev/versions/latest/sdk/widgets/
- Expo widgets blog post: https://expo.dev/blog/home-screen-widgets-and-live-activities-in-expo
- Expo maps docs: https://docs.expo.dev/versions/latest/sdk/maps/
- react-native-maps docs: https://docs.expo.dev/versions/latest/sdk/map-view/
- OpenTripPlanner GTFS-RT docs: https://docs.opentripplanner.org/en/latest/GTFS-RT-Config/
- OpenTripPlanner container image docs: https://docs.opentripplanner.org/en/v2.6.0/Container-Image/
- Apple Live Activities docs: https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities
- Nominatim usage policy: https://operations.osmfoundation.org/policies/nominatim/
