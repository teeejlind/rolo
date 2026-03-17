import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "../..");
const outputRoot = path.join(repoRoot, "apps/mobile/cloudflare-api-data");
const outputMetaRoot = path.join(outputRoot, "meta");
const outputDeparturesRoot = path.join(outputRoot, "departures");

const inputPaths = {
  stops: path.join(repoRoot, "services/api/data/cache/stops.json"),
  routes: path.join(repoRoot, "services/api/data/cache/routes.json"),
  metadata: path.join(repoRoot, "services/api/data/cache/static-metadata.json"),
  journeyPatterns: path.join(repoRoot, "services/api/data/cache/journey-patterns.json"),
  trips: path.join(repoRoot, "services/api/data/gtfs/static/current/trips.txt"),
  stopTimes: path.join(repoRoot, "services/api/data/gtfs/static/current/stop_times.txt"),
  calendar: path.join(repoRoot, "services/api/data/gtfs/static/current/calendar.txt"),
  calendarDates: path.join(
    repoRoot,
    "services/api/data/gtfs/static/current/calendar_dates.txt"
  )
};

await ensureInputsExist();

const [stops, routes, metadata, journeyPatterns] = await Promise.all([
  readJson(inputPaths.stops),
  readJson(inputPaths.routes),
  readJson(inputPaths.metadata),
  readJson(inputPaths.journeyPatterns)
]);

const stopById = new Map(stops.map((stop) => [stop.id, stop]));
const routeById = new Map(routes.map((route) => [route.id, route]));

const { tripInfoById, serviceIds } = await readTrips(inputPaths.trips, routes);
await readTripTerminalStops(inputPaths.stopTimes, tripInfoById);

const destinationLabels = buildDestinationLabels(tripInfoById, routeById, stopById);
const departuresByStopId = await readDeparturesByStop(
  inputPaths.stopTimes,
  tripInfoById
);
const calendars = await readCalendar(inputPaths.calendar);
const calendarExceptions = await readCalendarDates(inputPaths.calendarDates);

await fsp.rm(outputRoot, { recursive: true, force: true });
await fsp.mkdir(outputMetaRoot, { recursive: true });
await fsp.mkdir(outputDeparturesRoot, { recursive: true });

await Promise.all([
  writeJson(path.join(outputMetaRoot, "stops.json"), stops),
  writeJson(path.join(outputMetaRoot, "routes.json"), routes),
  writeJson(path.join(outputMetaRoot, "static-metadata.json"), metadata),
  writeJson(path.join(outputMetaRoot, "journey-patterns.json"), journeyPatterns),
  writeJson(path.join(outputMetaRoot, "departure-metadata.json"), {
    serviceIds,
    destinationLabels,
    calendars,
    calendarExceptions
  }),
  writeJson(path.join(outputMetaRoot, "manifest.json"), {
    generatedAt: new Date().toISOString(),
    stopCount: stops.length,
    routeCount: routes.length,
    patternCount: journeyPatterns.length,
    departureStopCount: departuresByStopId.size
  })
]);

for (const [stopId, departures] of departuresByStopId) {
  const fileName = `${encodeStopId(stopId)}.json`;
  await writeJson(path.join(outputDeparturesRoot, fileName), {
    stopId,
    departures
  });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      outputRoot,
      stopCount: stops.length,
      routeCount: routes.length,
      departureStopCount: departuresByStopId.size,
      serviceIds
    },
    null,
    2
  )
);

async function ensureInputsExist() {
  const missing = Object.values(inputPaths).filter((filePath) => !fs.existsSync(filePath));
  if (missing.length > 0) {
    throw new Error(
      `Cloudflare API data generation is missing source files:\n${missing.join("\n")}`
    );
  }
}

async function readTrips(filePath, routes) {
  const routeIndexById = new Map(routes.map((route, index) => [route.id, index]));
  const rawTrips = new Map();
  const serviceIdSet = new Set();

  const lineReader = readline.createInterface({
    input: fs.createReadStream(filePath, "utf8"),
    crlfDelay: Infinity
  });

  let isHeader = true;
  for await (const rawLine of lineReader) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (isHeader) {
      isHeader = false;
      continue;
    }

    const [routeId, serviceId, tripId] = splitCsvLine(line);
    if (!routeId || !serviceId || !tripId) {
      continue;
    }

    const routeIndex = routeIndexById.get(routeId);
    if (routeIndex === undefined) {
      continue;
    }

    rawTrips.set(tripId, {
      routeId,
      routeIndex,
      serviceId,
      serviceIndex: -1,
      lastStopId: "",
      destinationIndex: -1
    });
    serviceIdSet.add(serviceId);
  }

  const serviceIds = Array.from(serviceIdSet).sort((first, second) =>
    first.localeCompare(second)
  );
  const serviceIndexById = new Map(
    serviceIds.map((serviceId, index) => [serviceId, index])
  );

  for (const tripInfo of rawTrips.values()) {
    tripInfo.serviceIndex = serviceIndexById.get(tripInfo.serviceId) ?? -1;
  }

  return {
    tripInfoById: rawTrips,
    serviceIds
  };
}

async function readTripTerminalStops(filePath, tripInfoById) {
  const lineReader = readline.createInterface({
    input: fs.createReadStream(filePath, "utf8"),
    crlfDelay: Infinity
  });

  let isHeader = true;
  let currentTripId = "";
  let currentLastStopId = "";

  for await (const rawLine of lineReader) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (isHeader) {
      isHeader = false;
      continue;
    }

    const [tripId, _arrivalTime, _departureTime, stopId] = splitCsvLine(line);
    if (!tripId || !stopId) {
      continue;
    }

    if (currentTripId && tripId !== currentTripId) {
      const previousTrip = tripInfoById.get(currentTripId);
      if (previousTrip) {
        previousTrip.lastStopId = currentLastStopId;
      }
      currentLastStopId = "";
    }

    currentTripId = tripId;
    currentLastStopId = stopId;
  }

  if (currentTripId) {
    const lastTrip = tripInfoById.get(currentTripId);
    if (lastTrip) {
      lastTrip.lastStopId = currentLastStopId;
    }
  }
}

function buildDestinationLabels(tripInfoById, routeById, stopById) {
  const destinationLabels = [];
  const destinationIndexByLabel = new Map();

  for (const tripInfo of tripInfoById.values()) {
    const route = routeById.get(tripInfo.routeId);
    const destinationLabel = formatDepartureDestination(
      tripInfo.lastStopId
        ? stopById.get(tripInfo.lastStopId)?.name ??
            route?.longName ??
            route?.shortName ??
            "Destination"
        : route?.longName ?? route?.shortName ?? "Destination"
    );

    let destinationIndex = destinationIndexByLabel.get(destinationLabel);
    if (destinationIndex === undefined) {
      destinationIndex = destinationLabels.length;
      destinationLabels.push(destinationLabel);
      destinationIndexByLabel.set(destinationLabel, destinationIndex);
    }

    tripInfo.destinationIndex = destinationIndex;
  }

  return destinationLabels;
}

async function readDeparturesByStop(filePath, tripInfoById) {
  const departuresByStopId = new Map();
  const lineReader = readline.createInterface({
    input: fs.createReadStream(filePath, "utf8"),
    crlfDelay: Infinity
  });

  let isHeader = true;
  for await (const rawLine of lineReader) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (isHeader) {
      isHeader = false;
      continue;
    }

    const [tripId, arrivalTime, departureTime, stopId] = splitCsvLine(line);
    if (!tripId || !stopId) {
      continue;
    }

    const tripInfo = tripInfoById.get(tripId);
    if (!tripInfo || tripInfo.serviceIndex < 0 || tripInfo.destinationIndex < 0) {
      continue;
    }

    const departures = departuresByStopId.get(stopId) ?? [];
    departures.push([
      parseGtfsTimeToSeconds(departureTime || arrivalTime || "00:00:00"),
      tripInfo.serviceIndex,
      tripInfo.routeIndex,
      tripInfo.destinationIndex
    ]);
    departuresByStopId.set(stopId, departures);
  }

  for (const departures of departuresByStopId.values()) {
    departures.sort((first, second) => first[0] - second[0]);
  }

  return departuresByStopId;
}

async function readCalendar(filePath) {
  const calendars = {};
  const content = await fsp.readFile(filePath, "utf8");
  const lines = content.split(/\r?\n/).filter(Boolean);

  for (const line of lines.slice(1)) {
    const [
      serviceId,
      monday,
      tuesday,
      wednesday,
      thursday,
      friday,
      saturday,
      sunday,
      startDate,
      endDate
    ] = splitCsvLine(line);

    if (!serviceId) {
      continue;
    }

    calendars[serviceId] = {
      monday: monday === "1",
      tuesday: tuesday === "1",
      wednesday: wednesday === "1",
      thursday: thursday === "1",
      friday: friday === "1",
      saturday: saturday === "1",
      sunday: sunday === "1",
      startDate,
      endDate
    };
  }

  return calendars;
}

async function readCalendarDates(filePath) {
  const calendarExceptions = {};
  const content = await fsp.readFile(filePath, "utf8");
  const lines = content.split(/\r?\n/).filter(Boolean);

  for (const line of lines.slice(1)) {
    const [serviceId, date, exceptionType] = splitCsvLine(line);
    if (!serviceId || !date || (exceptionType !== "1" && exceptionType !== "2")) {
      continue;
    }

    if (!calendarExceptions[serviceId]) {
      calendarExceptions[serviceId] = {};
    }

    calendarExceptions[serviceId][date] = Number(exceptionType);
  }

  return calendarExceptions;
}

function encodeStopId(stopId) {
  return encodeURIComponent(stopId);
}

function formatDepartureDestination(rawValue) {
  return rawValue
    .replace(/^[A-Z0-9-]+_+/, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseGtfsTimeToSeconds(value) {
  const [hours = "0", minutes = "0", seconds = "0"] = value.split(":");
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function splitCsvLine(line) {
  return line.replace(/^\uFEFF/, "").split(",");
}

async function readJson(filePath) {
  const content = await fsp.readFile(filePath, "utf8");
  return JSON.parse(content);
}

async function writeJson(filePath, value) {
  await fsp.writeFile(filePath, JSON.stringify(value));
}
