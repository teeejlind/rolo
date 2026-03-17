import { distanceBetweenMeters } from "@transito-bogota/transit-core";
import type {
  JourneyItinerary,
  JourneyLeg,
  JourneyPlanResponse,
  JourneyQueryPoint,
  JourneyRideLeg,
  JourneyStopHint,
  StopSummary
} from "@transito-bogota/types";
import { config } from "../config.js";

const OTP_GRAPHQL_PATHS = ["/otp/gtfs/v1", "/otp/routers/default/index/graphql"];

interface OtpPlanLocationInput {
  label: string;
  location: {
    coordinates: {
      latitude: number;
      longitude: number;
    };
  };
}

interface OtpRoutingError {
  code?: string;
  description?: string;
}

interface OtpStopRef {
  gtfsId?: string;
  code?: string;
  name?: string;
  lat?: number;
  lon?: number;
}

interface OtpPlaceRef {
  name?: string;
  lat?: number;
  lon?: number;
  stop?: OtpStopRef | null;
}

interface OtpRouteRef {
  gtfsId?: string;
  shortName?: string;
  longName?: string;
}

interface OtpLeg {
  mode: string;
  transitLeg?: boolean;
  duration?: string;
  distance?: number;
  from?: OtpPlaceRef | null;
  to?: OtpPlaceRef | null;
  route?: OtpRouteRef | null;
}

interface OtpItineraryNode {
  start?: string;
  end?: string;
  walkDistance?: number;
  walkTime?: string;
  duration?: string;
  numberOfTransfers?: number;
  legs?: OtpLeg[];
}

interface OtpPlanConnectionResponse {
  data?: {
    planConnection?: {
      routingErrors?: OtpRoutingError[];
      edges?: Array<{
        node?: OtpItineraryNode | null;
      }>;
    };
  };
  errors?: Array<{
    message?: string;
  }>;
}

export async function planJourneysWithOtp(params: {
  from: JourneyQueryPoint;
  to: JourneyQueryPoint;
}): Promise<JourneyPlanResponse | null> {
  const endpoint = await resolveOtpGraphQlEndpoint();
  if (!endpoint) {
    return null;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: OTP_PLAN_CONNECTION_QUERY,
      variables: {
        origin: toOtpLocation(params.from),
        destination: toOtpLocation(params.to),
        dateTime: {
          earliestDeparture: new Date().toISOString()
        },
        first: 4,
        searchWindow: "PT2H",
        modes: {
          direct: {
            mode: "WALK"
          },
          access: {
            mode: "WALK"
          },
          egress: {
            mode: "WALK"
          },
          transfer: {
            mode: "WALK"
          },
          transit: [
            { mode: "BUS" },
            { mode: "RAIL" },
            { mode: "TRAM" }
          ]
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`OTP request failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as OtpPlanConnectionResponse;
  const queryErrors = payload.errors?.map((item) => item.message).filter(Boolean) ?? [];
  if (queryErrors.length > 0) {
    throw new Error(`OTP GraphQL error: ${queryErrors.join("; ")}`);
  }

  const routingErrors =
    payload.data?.planConnection?.routingErrors
      ?.map((item) => item.description || item.code)
      .filter(Boolean) ?? [];

  const itineraries = (payload.data?.planConnection?.edges ?? [])
    .map((edge, index) =>
      edge.node ? mapOtpItinerary(edge.node, params.from, params.to, index) : null
    )
    .filter((item): item is JourneyItinerary => Boolean(item));

  if (itineraries.length === 0) {
    return {
      from: params.from,
      to: params.to,
      generatedAt: new Date().toISOString(),
      note:
        routingErrors.length > 0
          ? `OTP did not return itineraries: ${routingErrors.join("; ")}`
          : "OTP is reachable, but it did not return itineraries for this request.",
      itineraries: []
    };
  }

  return {
    from: params.from,
    to: params.to,
    generatedAt: new Date().toISOString(),
    note: "Routing provided by OpenTripPlanner.",
    itineraries
  };
}

async function resolveOtpGraphQlEndpoint(): Promise<string | null> {
  for (const path of OTP_GRAPHQL_PATHS) {
    const endpoint = new URL(path, withTrailingSlash(config.otpBaseUrl)).toString();
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          query: "query Ping { __typename }"
        })
      });

      if (response.ok) {
        return endpoint;
      }
    } catch {
      // Try the next known endpoint path.
    }
  }

  return null;
}

function mapOtpItinerary(
  itinerary: OtpItineraryNode,
  from: JourneyQueryPoint,
  to: JourneyQueryPoint,
  index: number
): JourneyItinerary | null {
  const legs = itinerary.legs ?? [];
  if (legs.length === 0) {
    return null;
  }

  const mappedLegs = legs
    .map((leg) => mapOtpLeg(leg, from, to))
    .filter((item): item is JourneyLeg => Boolean(item));

  const firstTransitLeg = mappedLegs.find(
    (leg): leg is JourneyRideLeg => leg.kind === "ride"
  );
  const lastTransitLeg = [...mappedLegs]
    .reverse()
    .find((leg): leg is JourneyRideLeg => leg.kind === "ride");

  const boardingStop = firstTransitLeg
    ? toJourneyStopHint(firstTransitLeg.fromStop, from)
    : toSyntheticStopHint(from, "Walk start");
  const alightingStop = lastTransitLeg
    ? toJourneyStopHint(lastTransitLeg.toStop, to)
    : toSyntheticStopHint(to, "Walk end");

  const totalMinutes =
    parseIsoDurationToMinutes(itinerary.duration) ||
    computeMinutesBetween(itinerary.start, itinerary.end) ||
    mappedLegs.reduce((sum, leg) => sum + leg.durationMinutes, 0);
  const walkingMinutes =
    parseIsoDurationToMinutes(itinerary.walkTime) ||
    mappedLegs.reduce(
      (sum, leg) => sum + (leg.kind === "walk" ? leg.durationMinutes : 0),
      0
    );
  const routeShortNames = mappedLegs
    .filter((leg): leg is JourneyRideLeg => leg.kind === "ride")
    .map((leg) => leg.routeShortName);

  return {
    id: `journey-otp-${index + 1}`,
    label: index === 0 ? "Best match" : `OTP option ${index + 1}`,
    summary: buildOtpSummary(routeShortNames, boardingStop.name, alightingStop.name),
    totalMinutes,
    walkingMinutes,
    transferCount:
      typeof itinerary.numberOfTransfers === "number"
        ? itinerary.numberOfTransfers
        : Math.max(0, routeShortNames.length - 1),
    routeShortNames,
    source: "otp",
    boardingStop,
    alightingStop,
    legs: mappedLegs
  };
}

function mapOtpLeg(
  leg: OtpLeg,
  from: JourneyQueryPoint,
  to: JourneyQueryPoint
): JourneyLeg | null {
  const fromPlace = leg.from ?? {};
  const toPlace = leg.to ?? {};
  const durationMinutes = parseIsoDurationToMinutes(leg.duration) || 1;

  if (leg.transitLeg && leg.route?.gtfsId) {
    return {
      kind: "ride",
      instruction: `Ride ${leg.route.shortName ?? leg.route.gtfsId} from ${placeLabel(fromPlace, from.label)} to ${placeLabel(toPlace, to.label)}.`,
      routeId: leg.route.gtfsId,
      routeShortName: leg.route.shortName ?? leg.route.gtfsId,
      routeLongName: leg.route.longName ?? "Transit leg",
      fromStop: otpPlaceToStopSummary(fromPlace),
      toStop: otpPlaceToStopSummary(toPlace),
      stopCount: 0,
      durationMinutes
    };
  }

  return {
    kind: "walk",
    instruction: `Walk from ${placeLabel(fromPlace, from.label)} to ${placeLabel(toPlace, to.label)}.`,
    durationMinutes,
    distanceMeters: Math.max(0, Math.round(leg.distance ?? 0)),
    fromLabel: placeLabel(fromPlace, from.label),
    toLabel: placeLabel(toPlace, to.label)
  };
}

function otpPlaceToStopSummary(place: OtpPlaceRef): StopSummary {
  const stop = place.stop;
  return {
    id: stop?.gtfsId ?? placeLabel(place, "unknown-stop"),
    code: stop?.code,
    name: stop?.name ?? placeLabel(place, "Unknown stop"),
    lat: stop?.lat ?? place.lat ?? 0,
    lon: stop?.lon ?? place.lon ?? 0,
    zoneId: undefined
  };
}

function toJourneyStopHint(stop: StopSummary, point: JourneyQueryPoint): JourneyStopHint {
  return {
    ...stop,
    distanceMeters:
      Number.isFinite(stop.lat) && Number.isFinite(stop.lon)
        ? Math.round(
            distanceBetweenMeters(
              { lat: point.lat, lon: point.lon },
              { lat: stop.lat, lon: stop.lon }
            )
          )
        : 0
  };
}

function toSyntheticStopHint(
  point: JourneyQueryPoint,
  fallbackName: string
): JourneyStopHint {
  return {
    id: `synthetic-${fallbackName.toLowerCase().replace(/\s+/g, "-")}`,
    code: undefined,
    name: point.label || fallbackName,
    lat: point.lat,
    lon: point.lon,
    zoneId: undefined,
    distanceMeters: 0
  };
}

function toOtpLocation(point: JourneyQueryPoint): OtpPlanLocationInput {
  return {
    label: point.label,
    location: {
      coordinates: {
        latitude: point.lat,
        longitude: point.lon
      }
    }
  };
}

function buildOtpSummary(
  routeShortNames: string[],
  boardingStopName: string,
  alightingStopName: string
): string {
  if (routeShortNames.length === 0) {
    return `Walk from ${boardingStopName} to ${alightingStopName}`;
  }

  if (routeShortNames.length === 1) {
    return `${routeShortNames[0]} from ${boardingStopName} to ${alightingStopName}`;
  }

  return `${routeShortNames.join(" + ")} via ${boardingStopName}`;
}

function placeLabel(place: OtpPlaceRef, fallback: string): string {
  return place.stop?.name ?? place.name ?? fallback;
}

function parseIsoDurationToMinutes(value?: string): number {
  if (!value) {
    return 0;
  }

  const match = /^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/u.exec(value);
  if (!match) {
    return 0;
  }

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return Math.max(1, Math.round(hours * 60 + minutes + seconds / 60));
}

function computeMinutesBetween(start?: string, end?: string): number {
  if (!start || !end) {
    return 0;
  }

  const startTime = Date.parse(start);
  const endTime = Date.parse(end);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    return 0;
  }

  return Math.max(1, Math.round((endTime - startTime) / 60_000));
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

const OTP_PLAN_CONNECTION_QUERY = `
  query PlanConnection(
    $origin: PlanLabeledLocationInput!
    $destination: PlanLabeledLocationInput!
    $dateTime: PlanDateTimeInput!
    $first: Int
    $searchWindow: Duration
    $modes: PlanModesInput
  ) {
    planConnection(
      origin: $origin
      destination: $destination
      dateTime: $dateTime
      first: $first
      searchWindow: $searchWindow
      modes: $modes
    ) {
      routingErrors {
        code
        description
      }
      edges {
        node {
          start
          end
          duration
          walkDistance
          walkTime
          numberOfTransfers
          legs {
            mode
            transitLeg
            duration
            distance
            from {
              name
              lat
              lon
              stop {
                gtfsId
                code
                name
                lat
                lon
              }
            }
            to {
              name
              lat
              lon
              stop {
                gtfsId
                code
                name
                lat
                lon
              }
            }
            route {
              gtfsId
              shortName
              longName
            }
          }
        }
      }
    }
  }
`;
