import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import {
  distanceBetweenMeters,
  normalizeQuery,
  normalizeTransitText
} from "@transito-bogota/transit-core";
import type {
  FeedProbeResult,
  NearbyStop,
  RouteSummary,
  SearchResult,
  StaticFeedMetadata,
  StopSummary,
  SystemStatus
} from "@transito-bogota/types";
import { config, paths } from "../config.js";

interface StaticDataset {
  metadata: StaticFeedMetadata;
  stops: StopSummary[];
  routes: RouteSummary[];
}

interface RealtimeProbeSnapshot {
  lastProbeAt?: string;
  feeds: FeedProbeResult[];
}

const REQUIRED_GTFS_FILES = [
  "agency.txt",
  "stops.txt",
  "routes.txt",
  "trips.txt",
  "stop_times.txt"
];

export async function refreshStaticFeed(): Promise<StaticDataset> {
  if (!config.staticFeedUrl) {
    throw new Error(
      "BOGOTA_GTFS_STATIC_URL is missing. Add it to .env before refreshing the static feed."
    );
  }

  await ensureDirectories();

  const response = await fetch(config.staticFeedUrl);
  if (!response.ok) {
    throw new Error(
      `Static GTFS download failed with HTTP ${response.status} ${response.statusText}.`
    );
  }

  const checkedAt = new Date().toISOString();
  const zipBytes = Buffer.from(await response.arrayBuffer());
  const zipPath = path.join(paths.downloadsRoot, "static-latest.zip");
  await fsp.writeFile(zipPath, zipBytes);

  await fsp.rm(paths.staticCurrentRoot, { force: true, recursive: true });
  await fsp.mkdir(paths.staticCurrentRoot, { recursive: true });

  const zip = new AdmZip(zipPath);
  zip.extractAllTo(paths.staticCurrentRoot, true);

  for (const requiredFile of REQUIRED_GTFS_FILES) {
    const filePath = path.join(paths.staticCurrentRoot, requiredFile);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Static GTFS is missing required file: ${requiredFile}`);
    }
  }

  const stops = readStops(path.join(paths.staticCurrentRoot, "stops.txt"));
  const routes = readRoutes(path.join(paths.staticCurrentRoot, "routes.txt"));

  const metadata: StaticFeedMetadata = {
    sourceUrl: config.staticFeedUrl,
    downloadedAt: checkedAt,
    stopCount: stops.length,
    routeCount: routes.length
  };

  await writeJson(paths.stopsCacheFile, stops);
  await writeJson(paths.routesCacheFile, routes);
  await writeJson(paths.metadataCacheFile, metadata);

  return { metadata, stops, routes };
}

export async function probeRealtimeFeeds(): Promise<RealtimeProbeSnapshot> {
  await ensureDirectories();

  const feedEntries = Object.entries(config.realtimeFeeds).filter(([, url]) => url);

  const results = await Promise.all(
    feedEntries.map(async ([key, url]) => {
      const checkedAt = new Date().toISOString();

      try {
        const response = await fetch(url, { method: "GET" });
        const bytes = Buffer.from(await response.arrayBuffer());

        const result: FeedProbeResult = {
          key: key as FeedProbeResult["key"],
          url,
          ok: response.ok,
          statusCode: response.status,
          contentLength: Number(response.headers.get("content-length") ?? bytes.length),
          checkedAt
        };

        if (!response.ok) {
          result.error = response.statusText;
        }

        return result;
      } catch (error) {
        return {
          key: key as FeedProbeResult["key"],
          url,
          ok: false,
          checkedAt,
          error: error instanceof Error ? error.message : "Unknown realtime probe error"
        } satisfies FeedProbeResult;
      }
    })
  );

  const snapshot: RealtimeProbeSnapshot = {
    lastProbeAt: new Date().toISOString(),
    feeds: results
  };

  await writeJson(paths.realtimeStatusCacheFile, snapshot);
  return snapshot;
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const dataset = await loadStaticDataset();
  const realtime = (await readJson<RealtimeProbeSnapshot>(paths.realtimeStatusCacheFile)) ?? {
    feeds: []
  };

  return {
    status:
      dataset.metadata.stopCount > 0
        ? "ok"
        : "degraded",
    language: "en",
    checkedAt: new Date().toISOString(),
    staticFeed: {
      configured: Boolean(config.staticFeedUrl),
      available: dataset.metadata.stopCount > 0,
      metadata: dataset.metadata
    },
    realtime: {
      lastProbeAt: realtime.lastProbeAt,
      feeds: realtime.feeds
    }
  };
}

export async function findNearbyStops(
  lat: number,
  lon: number,
  radiusMeters = 800,
  limit = 20
): Promise<NearbyStop[]> {
  const dataset = await loadStaticDataset();

  return dataset.stops
    .map((stop) => ({
      ...stop,
      distanceMeters: distanceBetweenMeters(
        { lat, lon },
        { lat: stop.lat, lon: stop.lon }
      )
    }))
    .filter((stop) => stop.distanceMeters <= radiusMeters)
    .sort((first, second) => first.distanceMeters - second.distanceMeters)
    .slice(0, limit);
}

export async function getStop(stopId: string): Promise<StopSummary | null> {
  const dataset = await loadStaticDataset();
  return dataset.stops.find((stop) => stop.id === stopId) ?? null;
}

export async function searchTransitEntities(query: string): Promise<SearchResult[]> {
  const dataset = await loadStaticDataset();
  const normalizedQuery = normalizeQuery(query);

  if (normalizedQuery.length < 2) {
    return [];
  }

  const stops = dataset.stops
    .filter((stop) =>
      normalizeTransitText(`${stop.name} ${stop.code ?? ""}`).includes(
        normalizeTransitText(normalizedQuery)
      )
    )
    .slice(0, 8)
    .map((item) => ({ type: "stop", item } as const));

  const routes = dataset.routes
    .filter((route) =>
      normalizeTransitText(`${route.shortName} ${route.longName}`).includes(
        normalizeTransitText(normalizedQuery)
      )
    )
    .slice(0, 8)
    .map((item) => ({ type: "route", item } as const));

  return [...stops, ...routes];
}

async function loadStaticDataset(): Promise<StaticDataset> {
  await ensureDirectories();

  const stops = (await readJson<StopSummary[]>(paths.stopsCacheFile)) ?? [];
  const routes = (await readJson<RouteSummary[]>(paths.routesCacheFile)) ?? [];
  const metadata = (await readJson<StaticFeedMetadata>(paths.metadataCacheFile)) ?? {
    stopCount: 0,
    routeCount: 0
  };

  return { metadata, stops, routes };
}

function readStops(filePath: string): StopSummary[] {
  const rows = readCsv(filePath);

  return rows
    .filter((row) => row.stop_id && row.stop_name && row.stop_lat && row.stop_lon)
    .map((row) => ({
      id: row.stop_id,
      code: row.stop_code || undefined,
      name: row.stop_name,
      lat: Number(row.stop_lat),
      lon: Number(row.stop_lon),
      zoneId: row.zone_id || undefined
    }))
    .filter((stop) => Number.isFinite(stop.lat) && Number.isFinite(stop.lon))
    .sort((first, second) => first.name.localeCompare(second.name));
}

function readRoutes(filePath: string): RouteSummary[] {
  const rows = readCsv(filePath);

  return rows
    .filter((row) => row.route_id)
    .map((row) => ({
      id: row.route_id,
      shortName: row.route_short_name || row.route_id,
      longName: row.route_long_name || row.route_desc || "Unnamed route",
      color: row.route_color || undefined,
      textColor: row.route_text_color || undefined
    }))
    .sort((first, second) => first.shortName.localeCompare(second.shortName));
}

function readCsv(filePath: string): Record<string, string>[] {
  return parse(fs.readFileSync(filePath), {
    columns: true,
    skip_empty_lines: true,
    bom: true
  }) as Record<string, string>[];
}

async function ensureDirectories(): Promise<void> {
  await Promise.all([
    fsp.mkdir(paths.cacheRoot, { recursive: true }),
    fsp.mkdir(paths.downloadsRoot, { recursive: true }),
    fsp.mkdir(paths.staticCurrentRoot, { recursive: true })
  ]);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fsp.writeFile(filePath, JSON.stringify(value, null, 2));
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
