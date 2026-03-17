export function normalizeQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeTransitText(value: string): string {
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

export function distanceBetweenMeters(
  first: { lat: number; lon: number },
  second: { lat: number; lon: number }
): number {
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

export function formatDistanceMeters(distanceMeters: number): string {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }

  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
