import { useEffect } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { InfoCard } from "../../components/InfoCard";
import { RouteBadge } from "../../components/RouteBadge";
import { Screen } from "../../components/Screen";
import { TripMapPreview } from "../../components/TripMapPreview";
import { theme } from "../../constants/theme";
import { useJourneyStore } from "../../lib/journey-store";
import type { PlannerSelection } from "../../lib/planner-store";
import { usePlannerStore } from "../../lib/planner-store";
import {
  fetchStopDepartures,
  fetchJourneys,
  type JourneyItinerary,
  type JourneyRideLeg,
  type StopDeparturesResponse,
  type JourneyPlanResponse
} from "../../lib/transit";

interface CoordinatePoint {
  lat: number;
  lon: number;
}

export default function TripResultsScreen() {
  const router = useRouter();
  const from = usePlannerStore((state) => state.from);
  const to = usePlannerStore((state) => state.to);
  const setLatestPlan = useJourneyStore((state) => state.setLatestPlan);
  const setSelectedJourneyId = useJourneyStore((state) => state.setSelectedJourneyId);

  const fromCoords = getSelectionCoords(from);
  const toCoords = getSelectionCoords(to);
  const canRequestJourneys = Boolean(from && to && fromCoords && toCoords);

  const journeyQuery = useQuery({
    queryKey: [
      "journeys",
      from?.id,
      fromCoords?.lat,
      fromCoords?.lon,
      to?.id,
      toCoords?.lat,
      toCoords?.lon
    ],
    queryFn: () =>
      fetchJourneys(
        {
          label: from!.label,
          detail: from!.detail,
          kind: from!.kind,
          lat: fromCoords!.lat,
          lon: fromCoords!.lon
        },
        {
          label: to!.label,
          detail: to!.detail,
          kind: to!.kind,
          lat: toCoords!.lat,
          lon: toCoords!.lon
        }
      ),
    enabled: canRequestJourneys,
    staleTime: 60_000
  });

  useEffect(() => {
    if (journeyQuery.data) {
      setLatestPlan(journeyQuery.data);
    }
  }, [journeyQuery.data, setLatestPlan]);

  const itineraries = journeyQuery.data?.itineraries ?? [];
  const topItinerary = itineraries[0];
  const boardingStopIds: string[] = [];

  for (const itinerary of itineraries) {
    if (!boardingStopIds.includes(itinerary.boardingStop.id)) {
      boardingStopIds.push(itinerary.boardingStop.id);
    }
  }

  const departuresQueries = useQueries({
    queries: boardingStopIds.map((stopId) => ({
      queryKey: ["trip-card-stop-departures", stopId],
      queryFn: () => fetchStopDepartures(stopId, 8),
      enabled: canRequestJourneys,
      staleTime: 60_000
    }))
  });

  return (
    <Screen
      title="Trip results"
      subtitle="Real in-app routing is live now with static GTFS suggestions, nearby boarding hints, and a map preview."
    >
      {from && to ? (
        <View style={styles.selectionCard}>
          <Text style={styles.selectionLabel}>From</Text>
          <Text style={styles.selectionValue}>{from.label}</Text>
          {from.kindLabel ? <Text style={styles.selectionKind}>{from.kindLabel}</Text> : null}
          <Text style={styles.selectionDetail}>{from.detail}</Text>

          <Text style={styles.selectionLabel}>To</Text>
          <Text style={styles.selectionValue}>{to.label}</Text>
          {to.kindLabel ? <Text style={styles.selectionKind}>{to.kindLabel}</Text> : null}
          <Text style={styles.selectionDetail}>{to.detail}</Text>
        </View>
      ) : (
        <InfoCard title="Trip setup is incomplete">
          Go back to Search and choose both a starting point and a destination.
        </InfoCard>
      )}

      {from && to && !canRequestJourneys ? (
        <InfoCard title="Pick a precise place result" tone="warning">
          At least one trip endpoint is still plain text only. Search again and tap a real place or stop result so the app has coordinates for routing.
        </InfoCard>
      ) : null}

      {from && to && fromCoords && toCoords ? (
        <TripMapPreview
          from={{
            label: from.label,
            detail: from.detail,
            lat: fromCoords.lat,
            lon: fromCoords.lon
          }}
          to={{
            label: to.label,
            detail: to.detail,
            lat: toCoords.lat,
            lon: toCoords.lon
          }}
          caption="The preview shows your endpoints. The route cards below come from the Bogota planner."
        />
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Route options</Text>

        {journeyQuery.isLoading ? (
          <InfoCard title="Planning your trip">
            Checking nearby Bogotá stops and building direct and one-transfer options from the GTFS feed.
          </InfoCard>
        ) : null}

        {journeyQuery.isError ? (
          <InfoCard title="Could not plan this trip" tone="warning">
            {journeyQuery.error instanceof Error
              ? journeyQuery.error.message
              : "Unknown journey planning error."}
          </InfoCard>
        ) : null}

        {journeyQuery.data?.note ? (
          <InfoCard title="Planner note">{journeyQuery.data.note}</InfoCard>
        ) : null}

        {!journeyQuery.isLoading &&
        !journeyQuery.isError &&
        canRequestJourneys &&
        (journeyQuery.data?.itineraries.length ?? 0) === 0 ? (
          <InfoCard title="No in-app route match yet">
            The current planner did not find a direct or one-transfer static GTFS match for these endpoints. Use an external map for now, and we’ll improve this again when OTP is connected.
          </InfoCard>
        ) : null}

        {itineraries.map((itinerary) => {
          const boardingDepartures = getStopDepartureData(
            itinerary.boardingStop.id,
            boardingStopIds,
            departuresQueries
          );
          const rideLeg = getFirstRideLeg(itinerary);
          const matchingDepartures = getMatchingDepartures(
            rideLeg,
            boardingDepartures
          );

          return (
          <Pressable
            key={itinerary.id}
            onPress={() => {
              setLatestPlan(journeyQuery.data as JourneyPlanResponse);
              setSelectedJourneyId(itinerary.id);
              router.push({
                pathname: "/trips/[journeyId]",
                params: { journeyId: itinerary.id }
              });
            }}
            style={styles.itineraryCard}
          >
            <View style={styles.itineraryHeader}>
              <View style={styles.itineraryTitleBlock}>
                <Text style={styles.itineraryTitle}>{itinerary.label}</Text>
                <Text style={styles.itinerarySource}>
                  {itinerary.source === "otp" ? "OTP" : "Static fallback"}
                </Text>
              </View>
              <Text style={styles.itineraryDuration}>{itinerary.totalMinutes} min</Text>
            </View>

            <View style={styles.routeRow}>
              {itinerary.routeShortNames.map((route) => (
                <RouteBadge key={`${itinerary.id}-${route}`} route={route} />
              ))}
            </View>

            <Text style={styles.itinerarySummary}>{itinerary.summary}</Text>
            <Text style={styles.itineraryMeta}>
              Walk {itinerary.walkingMinutes} min • Transfers {itinerary.transferCount}
            </Text>
            <Text style={styles.itineraryStops}>
              Board at {itinerary.boardingStop.name} • Exit at {itinerary.alightingStop.name}
            </Text>

            {rideLeg ? (
              <View style={styles.departurePanel}>
                <Text style={styles.departurePanelLabel}>Next departures</Text>
                <Text style={styles.departurePanelTitle}>
                  {matchingDepartures.length > 0
                    ? `${rideLeg.routeShortName} from ${itinerary.boardingStop.name}`
                    : boardingDepartures
                      ? `No scheduled ${rideLeg.routeShortName} departure matched yet`
                      : "Checking the next departures from this boarding stop"}
                </Text>
                <View style={styles.departureChipRow}>
                  {matchingDepartures.length > 0 ? (
                    matchingDepartures.map((departure, index) => (
                      <View
                        key={`${itinerary.id}-${departure.route}-${departure.scheduledTime ?? index}`}
                        style={styles.departureChip}
                      >
                        <Text style={styles.departureChipText}>
                          {formatDepartureBadge(departure)}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <View style={styles.departureChipMuted}>
                      <Text style={styles.departureChipMutedText}>
                        {boardingDepartures
                          ? "Try opening trip detail for the full stop board."
                          : "Loading stop board"}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.departurePanelMeta}>
                  {matchingDepartures[0]?.destination ??
                    rideLeg.routeLongName}
                </Text>
              </View>
            ) : null}
          </Pressable>
          );
        })}
      </View>

      {topItinerary ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Best match stops</Text>
          <View style={styles.stopHintCard}>
            <Text style={styles.stopHintLabel}>Boarding stop</Text>
            <Text style={styles.stopHintValue}>{topItinerary.boardingStop.name}</Text>
            <Text style={styles.stopHintDetail}>
              {topItinerary.boardingStop.code
                ? `Stop ${topItinerary.boardingStop.code}`
                : "No public stop code yet"}
            </Text>
          </View>
          <View style={styles.stopHintCard}>
            <Text style={styles.stopHintLabel}>Arrival stop</Text>
            <Text style={styles.stopHintValue}>{topItinerary.alightingStop.name}</Text>
            <Text style={styles.stopHintDetail}>
              {topItinerary.alightingStop.code
                ? `Stop ${topItinerary.alightingStop.code}`
                : "No public stop code yet"}
            </Text>
          </View>
        </View>
      ) : null}

      {from && to ? (
        <Pressable
          onPress={() => {
            const url =
              Platform.OS === "web"
                ? buildGoogleTransitDirectionsUrl(fromCoords, toCoords)
                : buildAppleTransitDirectionsUrl(from, to);
            void Linking.openURL(url);
          }}
          style={styles.fallbackButton}
        >
          <Text style={styles.fallbackButtonText}>
            {Platform.OS === "web"
              ? "Open route in Google Maps"
              : "Open directions in Apple Maps"}
          </Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

function getStopDepartureData(
  stopId: string,
  boardingStopIds: string[],
  departuresQueries: Array<{ data?: StopDeparturesResponse }>
): StopDeparturesResponse | undefined {
  const index = boardingStopIds.indexOf(stopId);
  if (index < 0) {
    return undefined;
  }

  return departuresQueries[index]?.data;
}

function getFirstRideLeg(itinerary: JourneyItinerary): JourneyRideLeg | undefined {
  return itinerary.legs.find(
    (leg): leg is JourneyRideLeg => leg.kind === "ride"
  );
}

function getMatchingDepartures(
  rideLeg: JourneyRideLeg | undefined,
  stopDepartures: StopDeparturesResponse | undefined
) {
  if (!rideLeg || !stopDepartures) {
    return [];
  }

  return stopDepartures.departures
    .filter((departure) => departure.route === rideLeg.routeShortName)
    .slice(0, 3);
}

function formatDepartureBadge(
  departure: StopDeparturesResponse["departures"][number]
): string {
  if (typeof departure.etaMinutes === "number") {
    if (departure.etaMinutes <= 0) {
      return "Due now";
    }

    return `${departure.etaMinutes} min`;
  }

  if (departure.scheduledTime) {
    return departure.scheduledTime;
  }

  return "Scheduled";
}

function buildAppleTransitDirectionsUrl(
  from: PlannerSelection,
  to: PlannerSelection
): string {
  const saddr = buildAppleMapsAddress(from);
  const daddr = buildAppleMapsAddress(to);
  return `http://maps.apple.com/?saddr=${encodeURIComponent(saddr)}&daddr=${encodeURIComponent(daddr)}&dirflg=r`;
}

function buildGoogleTransitDirectionsUrl(
  from: CoordinatePoint | null,
  to: CoordinatePoint | null
): string {
  if (!from || !to) {
    return "https://www.google.com/maps";
  }

  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", `${from.lat},${from.lon}`);
  url.searchParams.set("destination", `${to.lat},${to.lon}`);
  url.searchParams.set("travelmode", "transit");
  return url.toString();
}

function buildAppleMapsAddress(selection: PlannerSelection): string {
  if (
    typeof selection.lat === "number" &&
    Number.isFinite(selection.lat) &&
    typeof selection.lon === "number" &&
    Number.isFinite(selection.lon)
  ) {
    return `${selection.lat},${selection.lon}`;
  }

  return selection.mapsQuery ?? selection.label;
}

function getSelectionCoords(selection?: PlannerSelection): CoordinatePoint | null {
  if (
    !selection ||
    typeof selection.lat !== "number" ||
    !Number.isFinite(selection.lat) ||
    typeof selection.lon !== "number" ||
    !Number.isFinite(selection.lon)
  ) {
    return null;
  }

  return {
    lat: selection.lat,
    lon: selection.lon
  };
}

const styles = StyleSheet.create({
  selectionCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 6
  },
  selectionLabel: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: theme.colors.line
  },
  selectionValue: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.ink
  },
  selectionKind: {
    color: theme.colors.line,
    fontWeight: "700"
  },
  selectionDetail: {
    color: theme.colors.mutedInk,
    marginBottom: 6
  },
  section: {
    gap: theme.spacing.sm
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.ink
  },
  itineraryCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm
  },
  itineraryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  itineraryTitleBlock: {
    gap: 4
  },
  itineraryTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.ink
  },
  itinerarySource: {
    color: theme.colors.line,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  itineraryDuration: {
    color: theme.colors.line,
    fontWeight: "800"
  },
  routeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm
  },
  itinerarySummary: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.ink
  },
  itineraryMeta: {
    color: theme.colors.mutedInk
  },
  itineraryStops: {
    color: theme.colors.line,
    fontWeight: "700"
  },
  departurePanel: {
    backgroundColor: "#F7FBFB",
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm
  },
  departurePanelLabel: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: theme.colors.line
  },
  departurePanelTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.ink
  },
  departureChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm
  },
  departureChip: {
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  departureChipText: {
    color: theme.colors.ink,
    fontWeight: "800"
  },
  departureChipMuted: {
    backgroundColor: theme.colors.lineSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  departureChipMutedText: {
    color: theme.colors.line,
    fontWeight: "700"
  },
  departurePanelMeta: {
    color: theme.colors.mutedInk
  },
  stopHintCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: 4
  },
  stopHintLabel: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: theme.colors.line
  },
  stopHintValue: {
    fontSize: 17,
    fontWeight: "800",
    color: theme.colors.ink
  },
  stopHintDetail: {
    color: theme.colors.mutedInk
  },
  fallbackButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 16,
    alignItems: "center"
  },
  fallbackButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800"
  }
});
