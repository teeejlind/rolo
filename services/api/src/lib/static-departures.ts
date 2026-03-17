import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import type { RouteSummary, StopSummary } from "@transito-bogota/types";
import { paths } from "../config.js";

interface TripInfo {
  tripId: string;
  routeId: string;
  serviceId: string;
  lastStopId?: string;
}

interface StopTimeRecord {
  tripId: string;
  departureSeconds: number;
}

interface CalendarRecord {
  serviceId: string;
  monday: boolean;
  tuesday: boolean;
  wednesday: boolean;
  thursday: boolean;
  friday: boolean;
  saturday: boolean;
  sunday: boolean;
  startDate: string;
  endDate: string;
}

interface DepartureDataset {
  stopById: Map<string, StopSummary>;
  routeById: Map<string, RouteSummary>;
  tripById: Map<string, TripInfo>;
  stopTimesByStopId: Map<string, StopTimeRecord[]>;
  calendarByServiceId: Map<string, CalendarRecord>;
  calendarExceptionsByServiceId: Map<string, Map<string, 1 | 2>>;
}

interface BogotaTimeContext {
  ymd: string;
  weekdayKey: keyof Pick<
    CalendarRecord,
    "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"
  >;
  secondsSinceMidnight: number;
}

export interface StaticDeparture {
  route: string;
  destination: string;
  etaMinutes: number;
  scheduledTime: string;
  realtime: false;
  source: "static_gtfs";
}

let datasetPromise: Promise<DepartureDataset> | null = null;

export async function getStopDepartures(
  stopId: string,
  limit = 8
): Promise<StaticDeparture[]> {
  const dataset = await loadDepartureDataset();
  const stopTimes = dataset.stopTimesByStopId.get(stopId) ?? [];

  if (stopTimes.length === 0) {
    return [];
  }

  const now = new Date();
  const today = getBogotaTimeContext(now);
  const tomorrow = getBogotaTimeContext(new Date(now.getTime() + 24 * 60 * 60 * 1000));

  const candidates: Array<StaticDeparture & { etaRanking: number }> = [];

  for (const stopTime of stopTimes) {
    const trip = dataset.tripById.get(stopTime.tripId);
    if (!trip) {
      continue;
    }

    const route = dataset.routeById.get(trip.routeId);
    const destinationStop = trip.lastStopId
      ? dataset.stopById.get(trip.lastStopId)
      : undefined;

    if (!route) {
      continue;
    }

    const destination = formatDepartureDestination(
      destinationStop?.name ?? route.longName
    );

    if (isServiceActive(dataset, trip.serviceId, today)) {
      const etaToday = stopTime.departureSeconds - today.secondsSinceMidnight;
      if (etaToday >= 0) {
        candidates.push({
          route: route.shortName,
          destination,
          etaMinutes: Math.max(0, Math.round(etaToday / 60)),
          scheduledTime: formatBogotaServiceTime(stopTime.departureSeconds),
          realtime: false,
          source: "static_gtfs",
          etaRanking: etaToday
        });
      }
    }

    if (candidates.length >= limit * 2) {
      continue;
    }

    if (isServiceActive(dataset, trip.serviceId, tomorrow)) {
      const etaTomorrow =
        24 * 60 * 60 - today.secondsSinceMidnight + stopTime.departureSeconds;
      candidates.push({
        route: route.shortName,
        destination,
        etaMinutes: Math.max(0, Math.round(etaTomorrow / 60)),
        scheduledTime: `${formatBogotaServiceTime(stopTime.departureSeconds)} tomorrow`,
        realtime: false,
        source: "static_gtfs",
        etaRanking: etaTomorrow
      });
    }
  }

  return candidates
    .sort((first, second) => first.etaRanking - second.etaRanking)
    .slice(0, limit)
    .map(({ etaRanking: _ignore, ...departure }) => departure);
}

async function loadDepartureDataset(): Promise<DepartureDataset> {
  if (!datasetPromise) {
    datasetPromise = buildDepartureDataset();
  }

  return datasetPromise;
}

async function buildDepartureDataset(): Promise<DepartureDataset> {
  const [stops, routes] = await Promise.all([
    readJson<StopSummary[]>(paths.stopsCacheFile),
    readJson<RouteSummary[]>(paths.routesCacheFile)
  ]);

  const tripById = await readTrips(path.join(paths.staticCurrentRoot, "trips.txt"));
  const stopTimesByStopId = await readStopTimes(
    path.join(paths.staticCurrentRoot, "stop_times.txt"),
    tripById
  );
  const calendarByServiceId = await readCalendar(
    path.join(paths.staticCurrentRoot, "calendar.txt")
  );
  const calendarExceptionsByServiceId = await readCalendarDates(
    path.join(paths.staticCurrentRoot, "calendar_dates.txt")
  );

  return {
    stopById: new Map((stops ?? []).map((stop) => [stop.id, stop])),
    routeById: new Map((routes ?? []).map((route) => [route.id, route])),
    tripById,
    stopTimesByStopId,
    calendarByServiceId,
    calendarExceptionsByServiceId
  };
}

async function readTrips(filePath: string): Promise<Map<string, TripInfo>> {
  const tripById = new Map<string, TripInfo>();
  const stream = fs.createReadStream(filePath, "utf8");
  const lineReader = readline.createInterface({
    input: stream,
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
    if (routeId && serviceId && tripId) {
      tripById.set(tripId, {
        tripId,
        routeId,
        serviceId
      });
    }
  }

  return tripById;
}

async function readStopTimes(
  filePath: string,
  tripById: Map<string, TripInfo>
): Promise<Map<string, StopTimeRecord[]>> {
  const stopTimesByStopId = new Map<string, StopTimeRecord[]>();

  const stream = fs.createReadStream(filePath, "utf8");
  const lineReader = readline.createInterface({
    input: stream,
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

    const [tripId, arrivalTime, departureTime, stopId] = splitCsvLine(line);
    if (!tripId || !stopId) {
      continue;
    }

    if (currentTripId && tripId !== currentTripId) {
      const previousTrip = tripById.get(currentTripId);
      if (previousTrip && currentLastStopId) {
        previousTrip.lastStopId = currentLastStopId;
      }
      currentLastStopId = "";
    }

    currentTripId = tripId;
    currentLastStopId = stopId;

    const currentStopTimes = stopTimesByStopId.get(stopId) ?? [];
    currentStopTimes.push({
      tripId,
      departureSeconds: parseGtfsTimeToSeconds(departureTime || arrivalTime || "00:00:00")
    });
    stopTimesByStopId.set(stopId, currentStopTimes);
  }

  if (currentTripId && currentLastStopId) {
    const lastTrip = tripById.get(currentTripId);
    if (lastTrip) {
      lastTrip.lastStopId = currentLastStopId;
    }
  }

  return stopTimesByStopId;
}

async function readCalendar(filePath: string): Promise<Map<string, CalendarRecord>> {
  const calendarByServiceId = new Map<string, CalendarRecord>();
  if (!fs.existsSync(filePath)) {
    return calendarByServiceId;
  }

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

    calendarByServiceId.set(serviceId, {
      serviceId,
      monday: monday === "1",
      tuesday: tuesday === "1",
      wednesday: wednesday === "1",
      thursday: thursday === "1",
      friday: friday === "1",
      saturday: saturday === "1",
      sunday: sunday === "1",
      startDate,
      endDate
    });
  }

  return calendarByServiceId;
}

async function readCalendarDates(
  filePath: string
): Promise<Map<string, Map<string, 1 | 2>>> {
  const exceptionsByServiceId = new Map<string, Map<string, 1 | 2>>();
  if (!fs.existsSync(filePath)) {
    return exceptionsByServiceId;
  }

  const content = await fsp.readFile(filePath, "utf8");
  const lines = content.split(/\r?\n/).filter(Boolean);
  for (const line of lines.slice(1)) {
    const [serviceId, date, exceptionType] = splitCsvLine(line);
    if (!serviceId || !date || (exceptionType !== "1" && exceptionType !== "2")) {
      continue;
    }

    const current = exceptionsByServiceId.get(serviceId) ?? new Map<string, 1 | 2>();
    current.set(date, Number(exceptionType) as 1 | 2);
    exceptionsByServiceId.set(serviceId, current);
  }

  return exceptionsByServiceId;
}

function isServiceActive(
  dataset: DepartureDataset,
  serviceId: string,
  timeContext: BogotaTimeContext
): boolean {
  const exception = dataset.calendarExceptionsByServiceId.get(serviceId)?.get(timeContext.ymd);
  if (exception === 1) {
    return true;
  }
  if (exception === 2) {
    return false;
  }

  const calendar = dataset.calendarByServiceId.get(serviceId);
  if (!calendar) {
    return true;
  }

  if (timeContext.ymd < calendar.startDate || timeContext.ymd > calendar.endDate) {
    return false;
  }

  return calendar[timeContext.weekdayKey];
}

function getBogotaTimeContext(date: Date): BogotaTimeContext {
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
    weekdayKey: weekday as BogotaTimeContext["weekdayKey"],
    secondsSinceMidnight: hour * 3600 + minute * 60 + second
  };
}

function formatBogotaServiceTime(seconds: number): string {
  const normalized = ((seconds % (24 * 60 * 60)) + 24 * 60 * 60) % (24 * 60 * 60);
  const hours = Math.floor(normalized / 3600)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor((normalized % 3600) / 60)
    .toString()
    .padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatDepartureDestination(rawValue: string): string {
  return rawValue
    .replace(/^[A-Z0-9-]+_+/, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseGtfsTimeToSeconds(value: string): number {
  const [hours = "0", minutes = "0", seconds = "0"] = value.split(":");
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function splitCsvLine(line: string): string[] {
  return line.replace(/^\uFEFF/, "").split(",");
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
