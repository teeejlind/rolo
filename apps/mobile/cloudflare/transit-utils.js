export function normalizeQuery(value) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeTransitText(value) {
  return normalizeQuery(stripDiacritics(value))
    .replace(/[.,-]/g, " ")
    .replace(/\bavenida carrera\b/g, "ak")
    .replace(/\bavenida calle\b/g, "ac")
    .replace(/\bcarrera\b/g, "kr")
    .replace(/\bcra\b/g, "kr")
    .replace(/\bcalle\b/g, "cl")
    .replace(/\btransversal\b/g, "tv")
    .replace(/\bdiagonal\b/g, "dg")
    .replace(/\bautopista\b/g, "aut")
    .replace(/\s+/g, " ")
    .trim();
}

export function distanceBetweenMeters(first, second) {
  const earthRadiusMeters = 6_371_000;
  const lat1 = toRadians(first.lat);
  const lat2 = toRadians(second.lat);
  const deltaLat = toRadians(second.lat - first.lat);
  const deltaLon = toRadians(second.lon - first.lon);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
}

export function buildBogotaQuery(query) {
  const trimmed = query.trim();
  if (/(bogota|bogotá|colombia)/i.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}, Bogota, Colombia`;
}

export function humanizePlaceKind(category, type) {
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

export function formatDepartureDestination(rawValue) {
  return rawValue
    .replace(/^[A-Z0-9-]+_+/, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function withTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

export function encodeStopId(stopId) {
  return encodeURIComponent(stopId);
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function stripDiacritics(value) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
