import { normalizeQuery } from "@transito-bogota/transit-core";
import { config } from "../config.js";

interface NominatimSearchResult {
  place_id: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  category?: string;
  type?: string;
  importance?: number;
  address?: {
    amenity?: string;
    attraction?: string;
    road?: string;
    pedestrian?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
  };
}

export interface PlaceSummary {
  id: string;
  label: string;
  detail: string;
  lat: number;
  lon: number;
  kindLabel: string;
}

interface CachedPlaces {
  expiresAt: number;
  results: PlaceSummary[];
}

const placeCache = new Map<string, CachedPlaces>();
const PLACE_CACHE_TTL_MS = 1000 * 60 * 60 * 12;

export async function searchPlaces(query: string): Promise<PlaceSummary[]> {
  const normalizedQuery = normalizeQuery(query);
  if (normalizedQuery.length < 2) {
    return [];
  }

  const cached = placeCache.get(normalizedQuery);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.results;
  }

  const requestUrl = new URL("/search", withTrailingSlash(config.nominatimBaseUrl));
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
      "User-Agent": "transito-bogota-dev/0.1 (local development)"
    }
  });

  if (!response.ok) {
    throw new Error(`Place search failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as NominatimSearchResult[];
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
        } satisfies PlaceSummary;
      })
      .filter((item): item is PlaceSummary => Boolean(item))
  );

  placeCache.set(normalizedQuery, {
    expiresAt: Date.now() + PLACE_CACHE_TTL_MS,
    results
  });

  return results;
}

function buildBogotaQuery(query: string): string {
  const trimmed = query.trim();
  if (/(bogota|bogotá|colombia)/i.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}, Bogota, Colombia`;
}

function dedupePlaces(results: PlaceSummary[]): PlaceSummary[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = `${normalizeQuery(result.label)}-${result.lat.toFixed(4)}-${result.lon.toFixed(4)}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
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

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
