import Fastify from "fastify";
import cors from "@fastify/cors";
import { planJourneys } from "./lib/journey-planner.js";
import { planJourneysWithOtp } from "./lib/otp-client.js";
import { searchPlaces } from "./lib/place-search.js";
import { getStopDepartures } from "./lib/static-departures.js";
import {
  findNearbyStops,
  getStop,
  getSystemStatus,
  probeRealtimeFeeds,
  refreshStaticFeed,
  searchTransitEntities
} from "./lib/static-feed.js";

export function buildServer() {
  const app = Fastify({
    logger: true
  });

  app.register(cors, {
    origin: true
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "transito-bogota-api",
    checkedAt: new Date().toISOString()
  }));

  app.get("/system/status", async () => getSystemStatus());

  app.get("/stops/nearby", async (request, reply) => {
    const { lat, lon, radius } = request.query as {
      lat?: string;
      lon?: string;
      radius?: string;
    };

    const parsedLat = Number(lat);
    const parsedLon = Number(lon);
    const parsedRadius = radius ? Number(radius) : 800;

    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLon)) {
      reply.code(400);
      return { error: "lat and lon are required query params." };
    }

    return {
      stops: await findNearbyStops(parsedLat, parsedLon, parsedRadius)
    };
  });

  app.get("/stops/:stopId", async (request, reply) => {
    const { stopId } = request.params as { stopId: string };
    const stop = await getStop(stopId);

    if (!stop) {
      reply.code(404);
      return { error: `Stop ${stopId} was not found in the cached static dataset.` };
    }

    return { stop };
  });

  app.get("/stops/:stopId/departures", async (request, reply) => {
    const { stopId } = request.params as { stopId: string };
    const { limit } = request.query as { limit?: string };
    const stop = await getStop(stopId);

    if (!stop) {
      reply.code(404);
      return { error: `Stop ${stopId} was not found in the cached static dataset.` };
    }

    return {
      stop,
      departures: await getStopDepartures(stopId, limit ? Number(limit) : 8),
      note:
        "These are scheduled departures from the static GTFS feed. Realtime overlays will land after the official GTFS-RT URLs are usable again."
    };
  });

  app.get("/search", async (request) => {
    const { q = "" } = request.query as { q?: string };
    return {
      query: q,
      results: await searchTransitEntities(q)
    };
  });

  app.get("/places/search", async (request) => {
    const { q = "" } = request.query as { q?: string };
    return {
      query: q,
      results: await searchPlaces(q)
    };
  });

  app.get("/journeys", async (request, reply) => {
    const {
      fromLat,
      fromLon,
      toLat,
      toLon,
      fromLabel = "Origin",
      fromDetail = "",
      fromKind,
      toLabel = "Destination",
      toDetail = "",
      toKind
    } = request.query as {
      fromLat?: string;
      fromLon?: string;
      toLat?: string;
      toLon?: string;
      fromLabel?: string;
      fromDetail?: string;
      fromKind?: "place" | "stop" | "freeform";
      toLabel?: string;
      toDetail?: string;
      toKind?: "place" | "stop" | "freeform";
    };

    const parsedFromLat = Number(fromLat);
    const parsedFromLon = Number(fromLon);
    const parsedToLat = Number(toLat);
    const parsedToLon = Number(toLon);

    if (
      !Number.isFinite(parsedFromLat) ||
      !Number.isFinite(parsedFromLon) ||
      !Number.isFinite(parsedToLat) ||
      !Number.isFinite(parsedToLon)
    ) {
      reply.code(400);
      return {
        error:
          "fromLat, fromLon, toLat, and toLon are required query params for journey planning."
      };
    }

    const requestPayload = {
      from: {
        label: fromLabel,
        detail: fromDetail,
        kind: fromKind,
        lat: parsedFromLat,
        lon: parsedFromLon
      },
      to: {
        label: toLabel,
        detail: toDetail,
        kind: toKind,
        lat: parsedToLat,
        lon: parsedToLon
      }
    };

    try {
      const otpPlan = await planJourneysWithOtp(requestPayload);
      if (otpPlan && otpPlan.itineraries.length > 0) {
        return otpPlan;
      }

      const staticPlan = await planJourneys(requestPayload);
      if (otpPlan === null) {
        return {
          ...staticPlan,
          note: "OpenTripPlanner is not running locally yet, so this trip uses the static GTFS fallback planner."
        };
      }

      if (otpPlan?.note) {
        return {
          ...staticPlan,
          note: `${otpPlan.note} Falling back to static GTFS routing.`
        };
      }

      return staticPlan;
    } catch (error) {
      const staticPlan = await planJourneys(requestPayload);
      return {
        ...staticPlan,
        note: `OTP was unavailable, so this trip uses the static GTFS fallback planner. ${
          error instanceof Error ? error.message : "Unknown OTP error."
        }`
      };
    }
  });

  app.get("/routes/:routeId/alerts", async (request) => {
    const { routeId } = request.params as { routeId: string };
    return {
      routeId,
      alerts: [],
      note: "GTFS-Realtime alert normalization is planned for the next backend phase."
    };
  });

  app.post("/admin/feeds/refresh-static", async () => {
    const dataset = await refreshStaticFeed();
    return {
      ok: true,
      metadata: dataset.metadata
    };
  });

  app.post("/admin/feeds/reload-realtime", async () => {
    const snapshot = await probeRealtimeFeeds();
    return {
      ok: true,
      realtime: snapshot
    };
  });

  return app;
}
