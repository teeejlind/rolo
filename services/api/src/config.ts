import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
export const serviceRoot = path.resolve(sourceDirectory, "..");
export const repoRoot = path.resolve(serviceRoot, "../..");

dotenv.config({ path: path.join(repoRoot, ".env") });

export const config = {
  port: Number(process.env.PORT ?? 4000),
  staticFeedUrl: process.env.BOGOTA_GTFS_STATIC_URL?.trim(),
  nominatimBaseUrl:
    process.env.NOMINATIM_BASE_URL?.trim() ?? "https://nominatim.openstreetmap.org",
  otpBaseUrl: process.env.OTP_BASE_URL?.trim() ?? "http://localhost:8080",
  realtimeFeeds: {
    vehicle_positions: process.env.BOGOTA_GTFS_RT_VEHICLE_POSITIONS?.trim() ?? "",
    service_alerts: process.env.BOGOTA_GTFS_RT_SERVICE_ALERTS?.trim() ?? "",
    trip_updates: process.env.BOGOTA_GTFS_RT_TRIP_UPDATES?.trim() ?? ""
  }
};

export const paths = {
  dataRoot: path.join(serviceRoot, "data"),
  cacheRoot: path.join(serviceRoot, "data/cache"),
  gtfsRoot: path.join(serviceRoot, "data/gtfs"),
  downloadsRoot: path.join(serviceRoot, "data/gtfs/downloads"),
  staticCurrentRoot: path.join(serviceRoot, "data/gtfs/static/current"),
  stopsCacheFile: path.join(serviceRoot, "data/cache/stops.json"),
  routesCacheFile: path.join(serviceRoot, "data/cache/routes.json"),
  journeyPatternsCacheFile: path.join(serviceRoot, "data/cache/journey-patterns.json"),
  metadataCacheFile: path.join(serviceRoot, "data/cache/static-metadata.json"),
  realtimeStatusCacheFile: path.join(serviceRoot, "data/cache/realtime-status.json")
};
