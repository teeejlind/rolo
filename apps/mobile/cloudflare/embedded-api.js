import {
  buildBogotaQuery,
  distanceBetweenMeters,
  encodeStopId,
  formatDepartureDestination,
  humanizePlaceKind,
  normalizeQuery,
  normalizeTransitText,
  withTrailingSlash
} from "./transit-utils.js";

const STOP_SEARCH_RADII_METERS = [700, 1100, 1800, 2600];
const WALKING_METERS_PER_MINUTE = 80;
const TRANSFER_MINUTES = 4;
const WAIT_BUFFER_MINUTES = 4;
const MAX_ORIGIN_STOPS = 4;
const MAX_DESTINATION_STOPS = 4;
const MAX_RESULTS = 4;
const PLACE_CACHE_TTL_MS = 1000 * 60 * 60 * 12;

const assetJsonCache = new Map();
const placeCache = new Map();
let coreDatasetPromise = null;
let departureMetadataPromise = null;

export async function maybeHandleEmbeddedApi(request, env) {
  const requestUrl = new URL(request.url);
  if (!requestUrl.pathname.startsWith("/api/")) {
    return null;
  }

  if (request.method !== "GET") {
    return json(
      { error: "This public MVP API currently supports GET routes only." },
      { status: 405 }
    );
  }

  const pathname = requestUrl.pathname.replace(/^\/api/, "") || "/";

  try {
    if (pathname === "/health") {
      return json({
        status: "ok",
        service: "transito-bogota-cloudflare-api",
        checkedAt: new Date().toISOString()
      });
    }

    if (pathname === "/system/status") {
      const dataset = await loadCoreDataset(env);
      return json({
        status: dataset.metadata.stopCount > 0 ? "ok" : "degraded",
        language: "en",
        checkedAt: new Date().toISOString(),
        staticFeed: {
          configured: true,
          available: dataset.metadata.stopCount > 0,
          metadata: dataset.metadata
        },
        realtime: {
          feeds: []
        }
      });
    }

    if (pathname === "/search") {
      const dataset = await loadCoreDataset(env);
      const query = requestUrl.searchParams.get("q") ?? "";
      return json({
        query,
        results: searchTransitEntities(dataset, query)
      });
    }

    if (pathname === "/places/search") {
      const query = requestUrl.searchParams.get("q") ?? "";
      return json({
        query,
        results: await searchPlaces(query)
      });
    }

    if (pathname === "/stops/nearby") {
      const lat = Number(requestUrl.searchParams.get("lat"));
      const lon = Number(requestUrl.searchParams.get("lon"));
      const radiusMeters = Number(requestUrl.searchParams.get("radius") ?? "800");

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return json(
          { error: "lat and lon are required query params." },
          { status: 400 }
        );
      }

      const dataset = await loadCoreDataset(env);
      return json({
        stops: findNearbyStops(dataset.stops, lat, lon, radiusMeters)
      });
    }

    const stopMatch = pathname.match(/^\/stops\/([^/]+)$/);
    if (stopMatch) {
      const stopId = decodeURIComponent(stopMatch[1]);
      const dataset = await loadCoreDataset(env);
      const stop = dataset.stopById.get(stopId);
      if (!stop) {
        return json(
          { error: `Stop ${stopId} was not found in the static worker dataset.` },
          { status: 404 }
        );
      }

      return json({ stop });
    }

    const departuresMatch = pathname.match(/^\/stops\/([^/]+)\/departures$/);
    if (departuresMatch) {
      const stopId = decodeURIComponent(departuresMatch[1]);
      const dataset = await loadCoreDataset(env);
      const stop = dataset.stopById.get(stopId);
      if (!stop) {
        return json(
          { error: `Stop ${stopId} was not found in the static worker dataset.` },
          { status: 404 }
        );
      }

      const limit = Number(requestUrl.searchParams.get("limit") ?? "8");
      return json({
        stop,
        departures: await getStopDepartures(env, limit, stopId),
        note:
          "These are scheduled departures from the static GTFS worker dataset. Realtime overlays are still pending the official GTFS-RT feeds."
      });
    }

    if (pathname === "/journeys") {
      const fromLat = Number(requestUrl.searchParams.get("fromLat"));
      const fromLon = Number(requestUrl.searchParams.get("fromLon"));
      const toLat = Number(requestUrl.searchParams.get("toLat"));
      const toLon = Number(requestUrl.searchParams.get("toLon"));

      if (
        !Number.isFinite(fromLat) ||
        !Number.isFinite(fromLon) ||
        !Number.isFinite(toLat) ||
        !Number.isFinite(toLon)
      ) {
        return json(
          {
            error:
              "fromLat, fromLon, toLat, and toLon are required query params for journey planning."
          },
          { status: 400 }
        );
      }

      const dataset = await loadCoreDataset(env);
      const from = {
        label: requestUrl.searchParams.get("fromLabel") ?? "Origin",
        detail: requestUrl.searchParams.get("fromDetail") ?? "",
        kind: requestUrl.searchParams.get("fromKind") ?? undefined,
        lat: fromLat,
        lon: fromLon
      };
      const to = {
        label: requestUrl.searchParams.get("toLabel") ?? "Destination",
        detail: requestUrl.searchParams.get("toDetail") ?? "",
        kind: requestUrl.searchParams.get("toKind") ?? undefined,
        lat: toLat,
        lon: toLon
      };

      return json(planJourneys(dataset, { from, to }));
    }

    const alertsMatch = pathname.match(/^\/routes\/([^/]+)\/alerts$/);
    if (alertsMatch) {
      const routeId = decodeURIComponent(alertsMatch[1]);
      return json({
        routeId,
        alerts: [],
        note: "Live route alerts are not wired into the Cloudflare MVP yet."
      });
    }
  } catch (error) {
    if (error instanceof MissingAssetError) {
      return null;
    }

    return json(
      {
        error:
          error instanceof Error ? error.message : "Unknown Cloudflare API error."
      },
      { status: 500 }
    );
  }

  return json({ error: "Not found" }, { status: 404 });
}

async function loadCoreDataset(env) {
  if (!coreDatasetPromise) {
    coreDatasetPromise = (async () => {
      const [stops, routes, metadata, patterns] = await Promise.all([
        loadAssetJson(env, "/api-data/meta/stops.json"),
        loadAssetJson(env, "/api-data/meta/routes.json"),
        loadAssetJson(env, "/api-data/meta/static-metadata.json"),
        loadAssetJson(env, "/api-data/meta/journey-patterns.json")
      ]);

      const stopById = new Map(stops.map((stop) => [stop.id, stop]));
      const routeById = new Map(routes.map((route) => [route.id, route]));
      const runtimePatterns = patterns.map((pattern) => ({
        ...pattern,
        stopIndicesByStopId: buildStopIndices(pattern.stopIds)
      }));

      const stopOccurrences = new Map();
      for (const pattern of runtimePatterns) {
        pattern.stopIds.forEach((stopId, index) => {
          const current = stopOccurrences.get(stopId) ?? [];
          current.push({ pattern, index });
          stopOccurrences.set(stopId, current);
        });
      }

      return {
        stops,
        routes,
        metadata,
        patterns: runtimePatterns,
        stopById,
        routeById,
        stopOccurrences
      };
    })();
  }

  return coreDatasetPromise;
}

async function loadDepartureMetadata(env) {
  if (!departureMetadataPromise) {
    departureMetadataPromise = loadAssetJson(
      env,
      "/api-data/meta/departure-metadata.json"
    );
  }

  return departureMetadataPromise;
}

async function getStopDepartures(env, limit, stopId) {
  const [dataset, departureMetadata, departureFile] = await Promise.all([
    loadCoreDataset(env),
    loadDepartureMetadata(env),
    loadAssetJson(
      env,
      `/api-data/departures/${encodeStopId(stopId)}.json`,
      { allowMissing: true }
    )
  ]);

  const records = departureFile?.departures ?? [];
  if (records.length === 0) {
    return [];
  }

  const now = new Date();
  const today = getBogotaTimeContext(now);
  const tomorrow = getBogotaTimeContext(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  const candidates = [];

  for (const [departureSeconds, serviceIndex, routeIndex, destinationIndex] of records) {
    const serviceId = departureMetadata.serviceIds[serviceIndex];
    const route = dataset.routes[routeIndex];
    const destination =
      departureMetadata.destinationLabels[destinationIndex] ??
      formatDepartureDestination(route?.longName ?? "Destination");

    if (isServiceActive(departureMetadata, serviceId, today)) {
      const etaToday = departureSeconds - today.secondsSinceMidnight;
      if (etaToday >= 0) {
        candidates.push({
          route: route?.shortName ?? route?.id ?? "Route",
          destination,
          etaMinutes: Math.max(0, Math.round(etaToday / 60)),
          scheduledTime: formatBogotaServiceTime(departureSeconds),
          realtime: false,
          source: "static_gtfs",
          etaRanking: etaToday
        });
      }
    }

    if (candidates.length >= limit * 2) {
      continue;
    }

    if (isServiceActive(departureMetadata, serviceId, tomorrow)) {
      const etaTomorrow =
        24 * 60 * 60 - today.secondsSinceMidnight + departureSeconds;
      candidates.push({
        route: route?.shortName ?? route?.id ?? "Route",
        destination,
        etaMinutes: Math.max(0, Math.round(etaTomorrow / 60)),
        scheduledTime: `${formatBogotaServiceTime(departureSeconds)} tomorrow`,
        realtime: false,
        source: "static_gtfs",
        etaRanking: etaTomorrow
      });
    }
  }

  return candidates
    .sort((first, second) => first.etaRanking - second.etaRanking)
    .reduce((deduped, candidate) => {
      const duplicateKey = `${candidate.route}|${candidate.destination}|${candidate.scheduledTime}`;
      const alreadyIncluded = deduped.some(
        (departure) =>
          `${departure.route}|${departure.destination}|${departure.scheduledTime}` ===
          duplicateKey
      );

      if (alreadyIncluded || deduped.length >= limit) {
        return deduped;
      }

      const { etaRanking, ...departure } = candidate;
      deduped.push(departure);
      return deduped;
    }, []);
}

function isServiceActive(departureMetadata, serviceId, timeContext) {
  const exception = departureMetadata.calendarExceptions?.[serviceId]?.[timeContext.ymd];
  if (exception === 1) {
    return true;
  }
  if (exception === 2) {
    return false;
  }

  const calendar = departureMetadata.calendars?.[serviceId];
  if (!calendar) {
    return true;
  }

  if (timeContext.ymd < calendar.startDate || timeContext.ymd > calendar.endDate) {
    return false;
  }

  return calendar[timeContext.weekdayKey];
}

function getBogotaTimeContext(date) {
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const timeParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Bogota",
    weekday: "long"
  })
    .format(date)
    .toLowerCase();

  const year = dateParts.find((part) => part.type === "year")?.value ?? "0000";
  const month = dateParts.find((part) => part.type === "month")?.value ?? "00";
  const day = dateParts.find((part) => part.type === "day")?.value ?? "00";
  const hour = Number(timeParts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(timeParts.find((part) => part.type === "minute")?.value ?? 0);
  const second = Number(timeParts.find((part) => part.type === "second")?.value ?? 0);

  return {
    ymd: `${year}${month}${day}`,
    weekdayKey: weekday,
    secondsSinceMidnight: hour * 3600 + minute * 60 + second
  };
}

function formatBogotaServiceTime(seconds) {
  const normalized = ((seconds % (24 * 60 * 60)) + 24 * 60 * 60) % (24 * 60 * 60);
  const hours = Math.floor(normalized / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((normalized % 3600) / 60)
    .toString()
    .padStart(2, "0");
  return `${hours}:${minutes}`;
}

function findNearbyStops(stops, lat, lon, radiusMeters = 800, limit = 20) {
  return stops
    .map((stop) => ({
      ...stop,
      distanceMeters: distanceBetweenMeters({ lat, lon }, stop)
    }))
    .filter((stop) => stop.distanceMeters <= radiusMeters)
    .sort((first, second) => first.distanceMeters - second.distanceMeters)
    .slice(0, limit);
}

function searchTransitEntities(dataset, query) {
  const normalized = normalizeQuery(query);
  if (normalized.length < 2) {
    return [];
  }

  const stops = dataset.stops
    .filter((stop) =>
      normalizeTransitText(`${stop.name} ${stop.code ?? ""}`).includes(
        normalizeTransitText(normalized)
      )
    )
    .slice(0, 8)
    .map((item) => ({ type: "stop", item }));

  const routes = dataset.routes
    .filter((route) =>
      normalizeTransitText(`${route.shortName} ${route.longName}`).includes(
        normalizeTransitText(normalized)
      )
    )
    .slice(0, 8)
    .map((item) => ({ type: "route", item }));

  return [...stops, ...routes];
}

async function searchPlaces(query) {
  const normalized = normalizeQuery(query);
  if (normalized.length < 2) {
    return [];
  }

  const cached = placeCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.results;
  }

  const requestUrl = new URL("/search", withTrailingSlash("https://nominatim.openstreetmap.org"));
  requestUrl.searchParams.set("format", "jsonv2");
  requestUrl.searchParams.set("limit", "5");
  requestUrl.searchParams.set("addressdetails", "1");
  requestUrl.searchParams.set("countrycodes", "co");
  requestUrl.searchParams.set("dedupe", "1");
  requestUrl.searchParams.set("viewbox", "-74.30,4.85,-73.95,4.45");
  requestUrl.searchParams.set("bounded", "0");
  requestUrl.searchParams.set("q", buildBogotaQuery(query));

  const response = await fetch(requestUrl, {
    headers: {
      "Accept-Language": "en",
      "User-Agent": "transito-bogota-web/0.1 (cloudflare worker)"
    }
  });

  if (!response.ok) {
    throw new Error(`Place search failed with HTTP ${response.status}.`);
  }

  const payload = await response.json();
  const results = dedupePlaces(
    payload
      .map((item) => {
        const lat = Number(item.lat);
        const lon = Number(item.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          return null;
        }

        const label =
          item.name ||
          item.address?.amenity ||
          item.address?.attraction ||
          item.address?.road ||
          query.trim();

        const detail = [
          item.address?.road ?? item.address?.pedestrian,
          item.address?.neighbourhood ?? item.address?.suburb,
          item.address?.city,
          "Bogota"
        ]
          .filter(Boolean)
          .join(", ");

        return {
          id: `osm-${item.place_id}`,
          label,
          detail: detail || item.display_name,
          lat,
          lon,
          kindLabel: humanizePlaceKind(item.category, item.type)
        };
      })
      .filter(Boolean)
  );

  placeCache.set(normalized, {
    expiresAt: Date.now() + PLACE_CACHE_TTL_MS,
    results
  });

  return results;
}

function dedupePlaces(results) {
  const seen = new Set();
  return results.filter((result) => {
    const key = `${normalizeQuery(result.label)}-${result.lat.toFixed(4)}-${result.lon.toFixed(4)}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function planJourneys(dataset, params) {
  const originStops = findNearbyStopsWithFallback(dataset.stops, params.from);
  const destinationStops = findNearbyStopsWithFallback(dataset.stops, params.to);

  const directJourneys = buildDirectJourneys(
    dataset,
    params.from,
    params.to,
    originStops,
    destinationStops
  );

  const transferJourneys =
    directJourneys.length >= MAX_RESULTS
      ? []
      : buildOneTransferJourneys(
          dataset,
          params.from,
          params.to,
          originStops,
          destinationStops
        );

  const rankedJourneys = [...directJourneys, ...transferJourneys]
    .sort((first, second) => first.rankingScore - second.rankingScore)
    .slice(0, MAX_RESULTS)
    .map(({ itinerary }, index) => ({
      ...itinerary,
      label: index === 0 ? "Best match" : itinerary.label
    }));

  return {
    from: params.from,
    to: params.to,
    generatedAt: new Date().toISOString(),
    note:
      rankedJourneys.length > 0
        ? "These trips come from the static GTFS worker planner using nearby stops, direct rides, and one-transfer patterns."
        : "No static GTFS journey match was found. This planner currently checks nearby stops plus direct and one-transfer patterns only.",
    itineraries: rankedJourneys
  };
}

function buildDirectJourneys(dataset, from, to, originStops, destinationStops) {
  const journeys = [];
  const seen = new Set();

  for (const originStop of originStops.slice(0, MAX_ORIGIN_STOPS)) {
    const originOccurrences = dataset.stopOccurrences.get(originStop.id) ?? [];

    for (const destinationStop of destinationStops.slice(0, MAX_DESTINATION_STOPS)) {
      for (const originOccurrence of originOccurrences) {
        const destinationIndices =
          originOccurrence.pattern.stopIndicesByStopId.get(destinationStop.id) ?? [];

        for (const destinationIndex of destinationIndices) {
          if (destinationIndex <= originOccurrence.index) {
            continue;
          }

          const route = dataset.routeById.get(originOccurrence.pattern.routeId);
          if (!route) {
            continue;
          }

          const dedupeKey = `direct|${route.id}|${originStop.id}|${destinationStop.id}`;
          if (seen.has(dedupeKey)) {
            continue;
          }

          seen.add(dedupeKey);
          journeys.push(
            buildDirectJourneyDraft(
              route,
              from,
              to,
              originStop,
              destinationStop,
              originOccurrence.pattern,
              originOccurrence.index,
              destinationIndex
            )
          );
        }
      }
    }
  }

  return journeys;
}

function buildOneTransferJourneys(dataset, from, to, originStops, destinationStops) {
  const journeys = [];
  const seen = new Set();

  for (const originStop of originStops.slice(0, 3)) {
    const originOccurrences = dataset.stopOccurrences.get(originStop.id) ?? [];

    for (const destinationStop of destinationStops.slice(0, 3)) {
      for (const originOccurrence of originOccurrences) {
        const firstRoute = dataset.routeById.get(originOccurrence.pattern.routeId);
        if (!firstRoute) {
          continue;
        }

        const maxTransferIndex = Math.min(
          originOccurrence.pattern.stopIds.length - 2,
          originOccurrence.index + 24
        );

        for (
          let transferIndex = originOccurrence.index + 1;
          transferIndex <= maxTransferIndex;
          transferIndex += 1
        ) {
          const transferStopId = originOccurrence.pattern.stopIds[transferIndex];
          if (
            !transferStopId ||
            transferStopId === originStop.id ||
            transferStopId === destinationStop.id
          ) {
            continue;
          }

          const transferStop = dataset.stopById.get(transferStopId);
          if (!transferStop) {
            continue;
          }

          const secondLegOccurrences = dataset.stopOccurrences.get(transferStopId) ?? [];
          for (const secondLegOccurrence of secondLegOccurrences) {
            if (secondLegOccurrence.pattern.routeId === originOccurrence.pattern.routeId) {
              continue;
            }

            const secondRoute = dataset.routeById.get(secondLegOccurrence.pattern.routeId);
            if (!secondRoute) {
              continue;
            }

            const destinationIndices =
              secondLegOccurrence.pattern.stopIndicesByStopId.get(destinationStop.id) ?? [];

            for (const destinationIndex of destinationIndices) {
              if (destinationIndex <= secondLegOccurrence.index) {
                continue;
              }

              const dedupeKey = [
                "transfer",
                firstRoute.id,
                secondRoute.id,
                originStop.id,
                transferStop.id,
                destinationStop.id
              ].join("|");

              if (seen.has(dedupeKey)) {
                continue;
              }

              seen.add(dedupeKey);
              journeys.push(
                buildTransferJourneyDraft(
                  firstRoute,
                  secondRoute,
                  from,
                  to,
                  originStop,
                  transferStop,
                  destinationStop,
                  originOccurrence.pattern,
                  secondLegOccurrence.pattern,
                  originOccurrence.index,
                  transferIndex,
                  secondLegOccurrence.index,
                  destinationIndex
                )
              );
            }
          }
        }
      }
    }
  }

  return journeys;
}

function buildDirectJourneyDraft(
  route,
  from,
  to,
  originStop,
  destinationStop,
  pattern,
  originIndex,
  destinationIndex
) {
  const walkToStartMinutes = distanceToWalkMinutes(originStop.distanceMeters);
  const walkToFinishMinutes = distanceToWalkMinutes(destinationStop.distanceMeters);
  const rideDurationMinutes = durationBetweenPatternStops(
    pattern,
    originIndex,
    destinationIndex
  );
  const totalMinutes =
    walkToStartMinutes + WAIT_BUFFER_MINUTES + rideDurationMinutes + walkToFinishMinutes;
  const stopCount = destinationIndex - originIndex;

  return {
    rankingScore: totalMinutes + walkToStartMinutes * 0.2 + walkToFinishMinutes * 0.2,
    itinerary: {
      id: `journey-direct-${route.id}-${originStop.id}-${destinationStop.id}`,
      label: "Direct ride",
      summary: `${route.shortName} from ${originStop.name} to ${destinationStop.name}`,
      totalMinutes,
      walkingMinutes: walkToStartMinutes + walkToFinishMinutes,
      transferCount: 0,
      routeShortNames: [route.shortName],
      source: "static_gtfs",
      boardingStop: originStop,
      alightingStop: destinationStop,
      legs: [
        {
          kind: "walk",
          instruction: `Walk from ${from.label} to ${originStop.name}.`,
          durationMinutes: walkToStartMinutes,
          distanceMeters: originStop.distanceMeters,
          fromLabel: from.label,
          toLabel: originStop.name
        },
        {
          kind: "ride",
          instruction: `Ride ${route.shortName} from ${originStop.name} to ${destinationStop.name} for ${stopCount} stops.`,
          routeId: route.id,
          routeShortName: route.shortName,
          routeLongName: route.longName,
          fromStop: stopToSummary(originStop),
          toStop: stopToSummary(destinationStop),
          stopCount,
          durationMinutes: rideDurationMinutes
        },
        {
          kind: "walk",
          instruction: `Walk from ${destinationStop.name} to ${to.label}.`,
          durationMinutes: walkToFinishMinutes,
          distanceMeters: destinationStop.distanceMeters,
          fromLabel: destinationStop.name,
          toLabel: to.label
        }
      ]
    }
  };
}

function buildTransferJourneyDraft(
  firstRoute,
  secondRoute,
  from,
  to,
  originStop,
  transferStop,
  destinationStop,
  firstPattern,
  secondPattern,
  originIndex,
  transferIndexFirstPattern,
  transferIndexSecondPattern,
  destinationIndex
) {
  const walkToStartMinutes = distanceToWalkMinutes(originStop.distanceMeters);
  const walkToFinishMinutes = distanceToWalkMinutes(destinationStop.distanceMeters);
  const firstRideMinutes = durationBetweenPatternStops(
    firstPattern,
    originIndex,
    transferIndexFirstPattern
  );
  const secondRideMinutes = durationBetweenPatternStops(
    secondPattern,
    transferIndexSecondPattern,
    destinationIndex
  );
  const totalMinutes =
    walkToStartMinutes +
    WAIT_BUFFER_MINUTES +
    firstRideMinutes +
    TRANSFER_MINUTES +
    secondRideMinutes +
    walkToFinishMinutes;
  const firstStopCount = transferIndexFirstPattern - originIndex;
  const secondStopCount = destinationIndex - transferIndexSecondPattern;

  return {
    rankingScore: totalMinutes + 5 + walkToStartMinutes * 0.2 + walkToFinishMinutes * 0.2,
    itinerary: {
      id: `journey-transfer-${firstRoute.id}-${secondRoute.id}-${originStop.id}-${destinationStop.id}-${transferStop.id}`,
      label: "1 transfer",
      summary: `${firstRoute.shortName} to ${transferStop.name}, then ${secondRoute.shortName}`,
      totalMinutes,
      walkingMinutes: walkToStartMinutes + TRANSFER_MINUTES + walkToFinishMinutes,
      transferCount: 1,
      routeShortNames: [firstRoute.shortName, secondRoute.shortName],
      source: "static_gtfs",
      boardingStop: originStop,
      alightingStop: destinationStop,
      legs: [
        {
          kind: "walk",
          instruction: `Walk from ${from.label} to ${originStop.name}.`,
          durationMinutes: walkToStartMinutes,
          distanceMeters: originStop.distanceMeters,
          fromLabel: from.label,
          toLabel: originStop.name
        },
        {
          kind: "ride",
          instruction: `Ride ${firstRoute.shortName} from ${originStop.name} to ${transferStop.name} for ${firstStopCount} stops.`,
          routeId: firstRoute.id,
          routeShortName: firstRoute.shortName,
          routeLongName: firstRoute.longName,
          fromStop: stopToSummary(originStop),
          toStop: transferStop,
          stopCount: firstStopCount,
          durationMinutes: firstRideMinutes
        },
        {
          kind: "transfer",
          instruction: `Transfer at ${transferStop.name} to ${secondRoute.shortName}.`,
          atStop: transferStop,
          durationMinutes: TRANSFER_MINUTES
        },
        {
          kind: "ride",
          instruction: `Ride ${secondRoute.shortName} from ${transferStop.name} to ${destinationStop.name} for ${secondStopCount} stops.`,
          routeId: secondRoute.id,
          routeShortName: secondRoute.shortName,
          routeLongName: secondRoute.longName,
          fromStop: transferStop,
          toStop: stopToSummary(destinationStop),
          stopCount: secondStopCount,
          durationMinutes: secondRideMinutes
        },
        {
          kind: "walk",
          instruction: `Walk from ${destinationStop.name} to ${to.label}.`,
          durationMinutes: walkToFinishMinutes,
          distanceMeters: destinationStop.distanceMeters,
          fromLabel: destinationStop.name,
          toLabel: to.label
        }
      ]
    }
  };
}

function findNearbyStopsWithFallback(stops, point) {
  let bestResults = [];

  for (const radiusMeters of STOP_SEARCH_RADII_METERS) {
    const results = stops
      .map((stop) => ({
        ...stop,
        distanceMeters: distanceBetweenMeters(point, stop)
      }))
      .filter((stop) => stop.distanceMeters <= radiusMeters)
      .sort((first, second) => first.distanceMeters - second.distanceMeters)
      .slice(0, 8);

    if (results.length > 0) {
      bestResults = results;
    }

    if (results.length >= 3) {
      return results;
    }
  }

  return bestResults;
}

function buildStopIndices(stopIds) {
  const stopIndicesByStopId = new Map();
  stopIds.forEach((stopId, index) => {
    const current = stopIndicesByStopId.get(stopId) ?? [];
    current.push(index);
    stopIndicesByStopId.set(stopId, current);
  });
  return stopIndicesByStopId;
}

function durationBetweenPatternStops(pattern, startIndex, endIndex) {
  const start = pattern.stopOffsetsSeconds[startIndex] ?? 0;
  const end = pattern.stopOffsetsSeconds[endIndex] ?? start;
  return Math.max(1, Math.round((end - start) / 60));
}

function distanceToWalkMinutes(distanceMeters) {
  return Math.max(1, Math.round(distanceMeters / WALKING_METERS_PER_MINUTE));
}

function stopToSummary(stop) {
  return {
    id: stop.id,
    code: stop.code,
    name: stop.name,
    lat: stop.lat,
    lon: stop.lon,
    zoneId: stop.zoneId
  };
}

async function loadAssetJson(env, assetPath, options = {}) {
  if (!options.allowMissing && assetJsonCache.has(assetPath)) {
    return assetJsonCache.get(assetPath);
  }

  const response = await env.ASSETS.fetch(
    new Request(new URL(assetPath, "https://transito-bogota-assets.local"))
  );

  if (response.status === 404) {
    if (options.allowMissing) {
      return null;
    }
    throw new MissingAssetError(assetPath);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    const preview = (await response.text()).replace(/\s+/g, " ").slice(0, 80);
    if (options.allowMissing && preview.toLowerCase().startsWith("<!doctype html")) {
      return null;
    }

    throw new Error(
      `Static asset ${assetPath} returned ${contentType || "non-JSON content"}: ${preview}`
    );
  }

  const payload = await response.json();
  if (!options.allowMissing) {
    assetJsonCache.set(assetPath, payload);
  }
  return payload;
}

function json(body, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("access-control-allow-origin", "*");
  return new Response(JSON.stringify(body), {
    ...init,
    headers
  });
}

class MissingAssetError extends Error {
  constructor(assetPath) {
    super(`Missing required Cloudflare API asset: ${assetPath}`);
    this.name = "MissingAssetError";
  }
}
