import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { distanceBetweenMeters } from "@transito-bogota/transit-core";
import type {
  JourneyItinerary,
  JourneyPlanResponse,
  JourneyQueryPoint,
  JourneyRideLeg,
  JourneyStopHint,
  RouteSummary,
  StopSummary
} from "@transito-bogota/types";
import { paths } from "../config.js";

interface JourneyPatternCacheRecord {
  id: string;
  routeId: string;
  stopIds: string[];
  stopOffsetsSeconds: number[];
  tripCount: number;
}

interface JourneyPatternRuntime extends JourneyPatternCacheRecord {
  stopIndicesByStopId: Map<string, number[]>;
}

interface StopOccurrence {
  pattern: JourneyPatternRuntime;
  index: number;
}

interface JourneyDataset {
  stops: StopSummary[];
  stopById: Map<string, StopSummary>;
  routeById: Map<string, RouteSummary>;
  patterns: JourneyPatternRuntime[];
  stopOccurrences: Map<string, StopOccurrence[]>;
}

interface JourneyCandidateDraft {
  itinerary: JourneyItinerary;
  rankingScore: number;
}

const STOP_SEARCH_RADII_METERS = [700, 1100, 1800, 2600];
const WALKING_METERS_PER_MINUTE = 80;
const TRANSFER_MINUTES = 4;
const WAIT_BUFFER_MINUTES = 4;
const MAX_ORIGIN_STOPS = 4;
const MAX_DESTINATION_STOPS = 4;
const MAX_RESULTS = 4;

let datasetPromise: Promise<JourneyDataset> | null = null;

export async function planJourneys(params: {
  from: JourneyQueryPoint;
  to: JourneyQueryPoint;
}): Promise<JourneyPlanResponse> {
  const dataset = await loadJourneyDataset();
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
        ? "These are static GTFS journey suggestions based on nearby stops, direct rides, and one-transfer patterns. Live timings and full OTP routing are still ahead."
        : "No static GTFS journey match was found yet. This planner currently checks nearby stops plus direct and one-transfer patterns only.",
    itineraries: rankedJourneys
  };
}

async function loadJourneyDataset(): Promise<JourneyDataset> {
  if (!datasetPromise) {
    datasetPromise = buildJourneyDataset();
  }

  return datasetPromise;
}

async function buildJourneyDataset(): Promise<JourneyDataset> {
  const stops = (await readJson<StopSummary[]>(paths.stopsCacheFile)) ?? [];
  const routes = (await readJson<RouteSummary[]>(paths.routesCacheFile)) ?? [];

  let patterns = await readJson<JourneyPatternCacheRecord[]>(paths.journeyPatternsCacheFile);
  if (!patterns) {
    patterns = await buildJourneyPatternsFromGtfs();
    await writeJson(paths.journeyPatternsCacheFile, patterns);
  }

  const stopById = new Map(stops.map((stop) => [stop.id, stop]));
  const routeById = new Map(routes.map((route) => [route.id, route]));
  const runtimePatterns = patterns.map((pattern) => ({
    ...pattern,
    stopIndicesByStopId: buildStopIndices(pattern.stopIds)
  }));

  const stopOccurrences = new Map<string, StopOccurrence[]>();
  for (const pattern of runtimePatterns) {
    pattern.stopIds.forEach((stopId, index) => {
      const current = stopOccurrences.get(stopId) ?? [];
      current.push({ pattern, index });
      stopOccurrences.set(stopId, current);
    });
  }

  return {
    stops,
    stopById,
    routeById,
    patterns: runtimePatterns,
    stopOccurrences
  };
}

async function buildJourneyPatternsFromGtfs(): Promise<JourneyPatternCacheRecord[]> {
  const tripsPath = path.join(paths.staticCurrentRoot, "trips.txt");
  const stopTimesPath = path.join(paths.staticCurrentRoot, "stop_times.txt");

  if (!fs.existsSync(tripsPath) || !fs.existsSync(stopTimesPath)) {
    throw new Error(
      "Journey planning needs trips.txt and stop_times.txt in the extracted GTFS feed."
    );
  }

  const tripToRoute = await readTripToRouteMap(tripsPath);
  const patternMap = new Map<
    string,
    JourneyPatternCacheRecord & { bestTotalSeconds: number }
  >();

  const stopTimesStream = fs.createReadStream(stopTimesPath, "utf8");
  const lineReader = readline.createInterface({
    input: stopTimesStream,
    crlfDelay: Infinity
  });

  let isFirstLine = true;
  let currentTripId = "";
  let currentStopIds: string[] = [];
  let currentDepartureSeconds: number[] = [];

  for await (const rawLine of lineReader) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (isFirstLine) {
      isFirstLine = false;
      continue;
    }

    const [tripId, arrivalTime, departureTime, stopId] = splitCsvLine(line);
    if (!tripId || !stopId) {
      continue;
    }

    if (currentTripId && tripId !== currentTripId) {
      finalizeTripPattern(
        patternMap,
        tripToRoute,
        currentTripId,
        currentStopIds,
        currentDepartureSeconds
      );
      currentStopIds = [];
      currentDepartureSeconds = [];
    }

    currentTripId = tripId;
    currentStopIds.push(stopId);
    currentDepartureSeconds.push(
      parseGtfsTimeToSeconds(departureTime || arrivalTime || "00:00:00")
    );
  }

  if (currentTripId) {
    finalizeTripPattern(
      patternMap,
      tripToRoute,
      currentTripId,
      currentStopIds,
      currentDepartureSeconds
    );
  }

  return Array.from(patternMap.values())
    .map(({ bestTotalSeconds: _ignored, ...pattern }) => pattern)
    .sort((first, second) => {
      if (first.routeId !== second.routeId) {
        return first.routeId.localeCompare(second.routeId);
      }

      return second.tripCount - first.tripCount;
    });
}

function finalizeTripPattern(
  patternMap: Map<string, JourneyPatternCacheRecord & { bestTotalSeconds: number }>,
  tripToRoute: Map<string, string>,
  tripId: string,
  stopIds: string[],
  departureSeconds: number[]
) {
  const routeId = tripToRoute.get(tripId);
  if (!routeId || stopIds.length < 2 || departureSeconds.length !== stopIds.length) {
    return;
  }

  const firstTime = departureSeconds[0];
  const stopOffsetsSeconds = departureSeconds.map((value) =>
    Math.max(0, value - firstTime)
  );
  const totalSeconds = stopOffsetsSeconds[stopOffsetsSeconds.length - 1] ?? 0;
  const cacheKey = `${routeId}|${stopIds.join(">")}`;
  const existing = patternMap.get(cacheKey);

  if (!existing) {
    patternMap.set(cacheKey, {
      id: `pattern-${patternMap.size + 1}`,
      routeId,
      stopIds: [...stopIds],
      stopOffsetsSeconds,
      tripCount: 1,
      bestTotalSeconds: totalSeconds
    });
    return;
  }

  existing.tripCount += 1;
  if (totalSeconds < existing.bestTotalSeconds) {
    existing.stopOffsetsSeconds = stopOffsetsSeconds;
    existing.bestTotalSeconds = totalSeconds;
  }
}

async function readTripToRouteMap(filePath: string): Promise<Map<string, string>> {
  const tripToRoute = new Map<string, string>();
  const stream = fs.createReadStream(filePath, "utf8");
  const lineReader = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  let isFirstLine = true;
  for await (const rawLine of lineReader) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (isFirstLine) {
      isFirstLine = false;
      continue;
    }

    const [routeId, _serviceId, tripId] = splitCsvLine(line);
    if (routeId && tripId) {
      tripToRoute.set(tripId, routeId);
    }
  }

  return tripToRoute;
}

function buildDirectJourneys(
  dataset: JourneyDataset,
  from: JourneyQueryPoint,
  to: JourneyQueryPoint,
  originStops: JourneyStopHint[],
  destinationStops: JourneyStopHint[]
): JourneyCandidateDraft[] {
  const journeys: JourneyCandidateDraft[] = [];
  const seen = new Set<string>();

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

function buildOneTransferJourneys(
  dataset: JourneyDataset,
  from: JourneyQueryPoint,
  to: JourneyQueryPoint,
  originStops: JourneyStopHint[],
  destinationStops: JourneyStopHint[]
): JourneyCandidateDraft[] {
  const journeys: JourneyCandidateDraft[] = [];
  const seen = new Set<string>();

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
  route: RouteSummary,
  from: JourneyQueryPoint,
  to: JourneyQueryPoint,
  originStop: JourneyStopHint,
  destinationStop: JourneyStopHint,
  pattern: JourneyPatternRuntime,
  originIndex: number,
  destinationIndex: number
): JourneyCandidateDraft {
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

  const rideLeg: JourneyRideLeg = {
    kind: "ride",
    instruction: `Ride ${route.shortName} from ${originStop.name} to ${destinationStop.name} for ${stopCount} stops.`,
    routeId: route.id,
    routeShortName: route.shortName,
    routeLongName: route.longName,
    fromStop: stopToSummary(originStop),
    toStop: stopToSummary(destinationStop),
    stopCount,
    durationMinutes: rideDurationMinutes
  };

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
        rideLeg,
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
  firstRoute: RouteSummary,
  secondRoute: RouteSummary,
  from: JourneyQueryPoint,
  to: JourneyQueryPoint,
  originStop: JourneyStopHint,
  transferStop: StopSummary,
  destinationStop: JourneyStopHint,
  firstPattern: JourneyPatternRuntime,
  secondPattern: JourneyPatternRuntime,
  originIndex: number,
  transferIndexFirstPattern: number,
  transferIndexSecondPattern: number,
  destinationIndex: number
): JourneyCandidateDraft {
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
    rankingScore:
      totalMinutes +
      5 +
      walkToStartMinutes * 0.2 +
      walkToFinishMinutes * 0.2,
    itinerary: {
      id: `journey-transfer-${firstRoute.id}-${secondRoute.id}-${originStop.id}-${destinationStop.id}-${transferStop.id}`,
      label: "1 transfer",
      summary: `${firstRoute.shortName} to ${transferStop.name}, then ${secondRoute.shortName}`,
      totalMinutes,
      walkingMinutes:
        walkToStartMinutes + TRANSFER_MINUTES + walkToFinishMinutes,
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

function findNearbyStopsWithFallback(
  stops: StopSummary[],
  point: JourneyQueryPoint
): JourneyStopHint[] {
  let bestResults: JourneyStopHint[] = [];

  for (const radiusMeters of STOP_SEARCH_RADII_METERS) {
    const results = stops
      .map((stop) => ({
        ...stop,
        distanceMeters: distanceBetweenMeters(
          { lat: point.lat, lon: point.lon },
          { lat: stop.lat, lon: stop.lon }
        )
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

function buildStopIndices(stopIds: string[]): Map<string, number[]> {
  const stopIndicesByStopId = new Map<string, number[]>();
  stopIds.forEach((stopId, index) => {
    const current = stopIndicesByStopId.get(stopId) ?? [];
    current.push(index);
    stopIndicesByStopId.set(stopId, current);
  });
  return stopIndicesByStopId;
}

function durationBetweenPatternStops(
  pattern: JourneyPatternRuntime,
  startIndex: number,
  endIndex: number
): number {
  const start = pattern.stopOffsetsSeconds[startIndex] ?? 0;
  const end = pattern.stopOffsetsSeconds[endIndex] ?? start;
  return Math.max(1, Math.round((end - start) / 60));
}

function distanceToWalkMinutes(distanceMeters: number): number {
  return Math.max(1, Math.round(distanceMeters / WALKING_METERS_PER_MINUTE));
}

function stopToSummary(stop: StopSummary): StopSummary {
  return {
    id: stop.id,
    code: stop.code,
    name: stop.name,
    lat: stop.lat,
    lon: stop.lon,
    zoneId: stop.zoneId
  };
}

function parseGtfsTimeToSeconds(value: string): number {
  const [hours = "0", minutes = "0", seconds = "0"] = value.split(":");
  return (
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds)
  );
}

function splitCsvLine(line: string): string[] {
  return line.replace(/^\uFEFF/, "").split(",");
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fsp.writeFile(filePath, JSON.stringify(value));
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const file = await fsp.readFile(filePath, "utf8");
    return JSON.parse(file) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}
