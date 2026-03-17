import { mobileConfig } from "./config";

export interface NearbyStop {
  id: string;
  code?: string;
  name: string;
  lat: number;
  lon: number;
  zoneId?: string;
  distanceMeters: number;
}

export interface StopDetail {
  id: string;
  code?: string;
  name: string;
  lat: number;
  lon: number;
  zoneId?: string;
}

export interface SearchStopResult {
  type: "stop";
  item: StopDetail;
}

export interface SearchRouteResult {
  type: "route";
  item: {
    id: string;
    shortName: string;
    longName: string;
    color?: string;
    textColor?: string;
  };
}

export interface SearchPlaceResult {
  type: "place";
  item: {
    id: string;
    label: string;
    detail: string;
    lat: number;
    lon: number;
    kindLabel: string;
  };
}

export type SearchResult = SearchStopResult | SearchRouteResult | SearchPlaceResult;

export interface SearchResponse {
  results: SearchResult[];
  transitApiReachable: boolean;
}

export interface StopDeparturesResponse {
  stop: StopDetail;
  departures: Array<{
    route: string;
    destination: string;
    etaMinutes?: number;
    realtime?: boolean;
    scheduledTime?: string;
    source?: "static_gtfs";
  }>;
  note?: string;
}

export interface JourneyQueryPoint {
  label: string;
  detail?: string;
  kind?: "place" | "stop" | "freeform";
  lat: number;
  lon: number;
}

export interface JourneyStopHint extends StopDetail {
  distanceMeters: number;
}

export interface JourneyWalkLeg {
  kind: "walk";
  instruction: string;
  durationMinutes: number;
  distanceMeters: number;
  fromLabel: string;
  toLabel: string;
}

export interface JourneyRideLeg {
  kind: "ride";
  instruction: string;
  routeId: string;
  routeShortName: string;
  routeLongName: string;
  fromStop: StopDetail;
  toStop: StopDetail;
  stopCount: number;
  durationMinutes: number;
}

export interface JourneyTransferLeg {
  kind: "transfer";
  instruction: string;
  atStop: StopDetail;
  durationMinutes: number;
}

export type JourneyLeg = JourneyWalkLeg | JourneyRideLeg | JourneyTransferLeg;

export interface JourneyItinerary {
  id: string;
  label: string;
  summary: string;
  totalMinutes: number;
  walkingMinutes: number;
  transferCount: number;
  routeShortNames: string[];
  source: "static_gtfs" | "otp";
  boardingStop: JourneyStopHint;
  alightingStop: JourneyStopHint;
  legs: JourneyLeg[];
}

export interface JourneyPlanResponse {
  from: JourneyQueryPoint;
  to: JourneyQueryPoint;
  generatedAt: string;
  note?: string;
  itineraries: JourneyItinerary[];
}

export async function fetchNearbyStops(lat: number, lon: number): Promise<NearbyStop[]> {
  const apiBaseUrl = await getReachableApiBaseUrl();
  const url = new URL("/stops/nearby", withTrailingSlash(apiBaseUrl));
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  url.searchParams.set("radius", "700");

  const data = await fetchJson<{ stops: NearbyStop[] }>(
    url.toString(),
    "Could not reach the transit API from this device, so nearby Bogota stops could not load."
  );
  return data.stops;
}

export async function fetchStop(stopId: string): Promise<StopDetail> {
  const apiBaseUrl = await getReachableApiBaseUrl();
  const data = await fetchJson<{ stop: StopDetail }>(
    new URL(`/stops/${stopId}`, withTrailingSlash(apiBaseUrl)).toString(),
    "Could not reach the transit API from this device, so stop details could not load."
  );
  return data.stop;
}

export async function fetchStopDepartures(
  stopId: string,
  limit?: number
): Promise<StopDeparturesResponse> {
  const apiBaseUrl = await getReachableApiBaseUrl();
  const url = new URL(
    `/stops/${stopId}/departures`,
    withTrailingSlash(apiBaseUrl)
  );
  if (limit) {
    url.searchParams.set("limit", String(limit));
  }

  return fetchJson<StopDeparturesResponse>(
    url.toString(),
    "Could not reach the transit API from this device, so departures could not load."
  );
}

export async function searchTransit(query: string): Promise<SearchResponse> {
  try {
    const apiBaseUrl = await getReachableApiBaseUrl();
    const transitUrl = new URL("/search", withTrailingSlash(apiBaseUrl));
    transitUrl.searchParams.set("q", query);

    const placeUrl = new URL("/places/search", withTrailingSlash(apiBaseUrl));
    placeUrl.searchParams.set("q", query);

    const [transitResult, placeResult] = await Promise.allSettled([
      fetchJson<{
        results: Array<SearchStopResult | SearchRouteResult>;
      }>(
        transitUrl.toString(),
        "Could not search the Bogota transit backend."
      ),
      fetchJson<{ results: SearchPlaceResult["item"][] }>(
        placeUrl.toString(),
        "Could not search Bogota places."
      )
    ]);

    if (transitResult.status === "rejected" && placeResult.status === "rejected") {
      throw new Error(
        "Could not reach the transit API from this device, so search could not run."
      );
    }

    const transitResults =
      transitResult.status === "fulfilled" ? transitResult.value.results : [];
    const placeResults =
      placeResult.status === "fulfilled"
        ? placeResult.value.results.map(
            (item) =>
              ({
                type: "place",
                item
              }) satisfies SearchPlaceResult
          )
        : [];

    return {
      results: [...placeResults, ...transitResults],
      transitApiReachable:
        transitResult.status === "fulfilled" || placeResult.status === "fulfilled"
    };
  } catch {
    const directPlaceResults = await searchPlacesDirectly(query);
    if (directPlaceResults.length === 0) {
      throw new Error(
        "Could not reach the transit API from this device, and no direct place results were available."
      );
    }

    return {
      results: directPlaceResults,
      transitApiReachable: false
    };
  }
}

export async function fetchJourneys(
  from: JourneyQueryPoint,
  to: JourneyQueryPoint
): Promise<JourneyPlanResponse> {
  const apiBaseUrl = await getReachableApiBaseUrl();
  const url = new URL("/journeys", withTrailingSlash(apiBaseUrl));
  url.searchParams.set("fromLat", String(from.lat));
  url.searchParams.set("fromLon", String(from.lon));
  url.searchParams.set("toLat", String(to.lat));
  url.searchParams.set("toLon", String(to.lon));
  url.searchParams.set("fromLabel", from.label);
  url.searchParams.set("toLabel", to.label);

  if (from.detail) {
    url.searchParams.set("fromDetail", from.detail);
  }

  if (to.detail) {
    url.searchParams.set("toDetail", to.detail);
  }

  if (from.kind) {
    url.searchParams.set("fromKind", from.kind);
  }

  if (to.kind) {
    url.searchParams.set("toKind", to.kind);
  }

  return fetchJson<JourneyPlanResponse>(
    url.toString(),
    "Could not reach the transit API from this device, so routes could not load."
  );
}

export function formatDistance(distanceMeters: number): string {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m away`;
  }

  return `${(distanceMeters / 1000).toFixed(1)} km away`;
}

export function formatWalkTime(distanceMeters: number): string {
  const walkingMinutes = Math.max(1, Math.round(distanceMeters / 80));
  return `${walkingMinutes} min walk`;
}

export function isInBogotaServiceArea(lat: number, lon: number): boolean {
  return lat >= 4.3 && lat <= 4.95 && lon >= -74.35 && lon <= -73.95;
}

async function fetchJson<T>(url: string, networkErrorMessage: string): Promise<T> {
  let response: Response;

  try {
    response = await fetch(url);
  } catch {
    throw new Error(networkErrorMessage);
  }

  if (!response.ok) {
    throw new Error(`API request failed with HTTP ${response.status}.`);
  }

  return (await response.json()) as T;
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

let reachableApiBaseUrl: string | null = null;

async function getReachableApiBaseUrl(): Promise<string> {
  if (reachableApiBaseUrl) {
    return reachableApiBaseUrl;
  }

  const candidates = mobileConfig.apiBaseUrlCandidates;
  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      await probeApiBaseUrl(candidate);
      reachableApiBaseUrl = candidate;
      return candidate;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unknown API probe error.");
    }
  }

  throw (
    lastError ??
    new Error("Could not reach the transit API from this device with any known local URL.")
  );
}

async function probeApiBaseUrl(baseUrl: string): Promise<void> {
  const response = await fetch(
    new URL("/health", withTrailingSlash(baseUrl)).toString()
  );

  if (!response.ok) {
    throw new Error(`Health check failed with HTTP ${response.status}.`);
  }
}

async function searchPlacesDirectly(query: string): Promise<SearchPlaceResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "co");
  url.searchParams.set("viewbox", "-74.30,4.85,-73.95,4.45");
  url.searchParams.set("bounded", "0");
  url.searchParams.set("q", /(bogota|bogotá|colombia)/i.test(trimmed) ? trimmed : `${trimmed}, Bogota, Colombia`);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      headers: {
        "Accept-Language": "en"
      }
    });
  } catch {
    return [];
  }

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as Array<{
    place_id: number;
    lat: string;
    lon: string;
    name?: string;
    category?: string;
    type?: string;
    address?: {
      amenity?: string;
      attraction?: string;
      road?: string;
      pedestrian?: string;
      neighbourhood?: string;
      suburb?: string;
      city?: string;
    };
  }>;

  return payload
    .map((item) => {
      const lat = Number(item.lat);
      const lon = Number(item.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
      }

      return {
        type: "place",
        item: {
          id: `osm-direct-${item.place_id}`,
          label:
            item.name ||
            item.address?.amenity ||
            item.address?.attraction ||
            item.address?.road ||
            trimmed,
          detail: [
            item.address?.road ?? item.address?.pedestrian,
            item.address?.neighbourhood ?? item.address?.suburb,
            item.address?.city,
            "Bogota"
          ]
            .filter(Boolean)
            .join(", "),
          lat,
          lon,
          kindLabel: humanizePlaceKind(item.category, item.type)
        }
      } satisfies SearchPlaceResult;
    })
    .filter((item): item is SearchPlaceResult => Boolean(item));
}

function humanizePlaceKind(category?: string, type?: string): string {
  const joined = `${category ?? ""}:${type ?? ""}`.toLowerCase();

  if (joined.includes("amenity:bus_station")) {
    return "Transit hub";
  }

  if (joined.includes("amenity:restaurant") || joined.includes("amenity:cafe")) {
    return "Food and drink";
  }

  if (joined.includes("amenity:nightclub") || joined.includes("amenity:bar")) {
    return "Nightlife";
  }

  if (joined.includes("tourism:attraction") || joined.includes("historic:")) {
    return "Landmark";
  }

  if (joined.includes("shop:")) {
    return "Shop";
  }

  if (joined.includes("amenity:school") || joined.includes("amenity:university")) {
    return "Campus";
  }

  if (type) {
    return type
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  return "Place";
}
