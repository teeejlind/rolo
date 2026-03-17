export type SupportedLanguage = "en";

export interface RouteSummary {
  id: string;
  shortName: string;
  longName: string;
  color?: string;
  textColor?: string;
}

export interface StopSummary {
  id: string;
  code?: string;
  name: string;
  lat: number;
  lon: number;
  zoneId?: string;
}

export interface NearbyStop extends StopSummary {
  distanceMeters: number;
}

export interface SearchResultStop {
  type: "stop";
  item: StopSummary;
}

export interface SearchResultRoute {
  type: "route";
  item: RouteSummary;
}

export type SearchResult = SearchResultStop | SearchResultRoute;

export interface JourneyQueryPoint {
  label: string;
  detail?: string;
  kind?: "place" | "stop" | "freeform";
  lat: number;
  lon: number;
}

export interface JourneyStopHint extends StopSummary {
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
  fromStop: StopSummary;
  toStop: StopSummary;
  stopCount: number;
  durationMinutes: number;
}

export interface JourneyTransferLeg {
  kind: "transfer";
  instruction: string;
  atStop: StopSummary;
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

export interface FeedProbeResult {
  key: "vehicle_positions" | "service_alerts" | "trip_updates";
  url: string;
  ok: boolean;
  statusCode?: number;
  contentLength?: number;
  checkedAt: string;
  error?: string;
}

export interface StaticFeedMetadata {
  sourceUrl?: string;
  downloadedAt?: string;
  stopCount: number;
  routeCount: number;
}

export interface SystemStatus {
  status: "ok" | "degraded";
  language: SupportedLanguage;
  checkedAt: string;
  staticFeed: {
    configured: boolean;
    available: boolean;
    metadata: StaticFeedMetadata;
  };
  realtime: {
    lastProbeAt?: string;
    feeds: FeedProbeResult[];
  };
}
