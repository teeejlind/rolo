import { useQuery } from "@tanstack/react-query";
import { Link, useLocalSearchParams } from "expo-router";
import {
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { InfoCard } from "../../components/InfoCard";
import { RouteBadge } from "../../components/RouteBadge";
import { Screen } from "../../components/Screen";
import { theme } from "../../constants/theme";
import { useJourneyStore } from "../../lib/journey-store";
import {
  fetchStopDepartures,
  type JourneyRideLeg,
  type StopDeparturesResponse
} from "../../lib/transit";

export default function TripDetailScreen() {
  const { journeyId } = useLocalSearchParams<{ journeyId: string }>();
  const latestPlan = useJourneyStore((state) => state.latestPlan);
  const selectedJourneyId = useJourneyStore((state) => state.selectedJourneyId);

  const journey =
    latestPlan?.itineraries.find((item) => item.id === journeyId) ??
    latestPlan?.itineraries.find((item) => item.id === selectedJourneyId);

  if (!journey) {
    return (
      <Screen
        title="Trip detail"
        subtitle="Pick a route option from the trip results screen first."
      >
        <InfoCard title="No journey selected">
          The latest trip plan is not in memory right now. Go back to Trip results and choose a route option again.
        </InfoCard>
      </Screen>
    );
  }

  const firstRideLeg = journey.legs.find(
    (leg): leg is JourneyRideLeg => leg.kind === "ride"
  );
  const departuresQuery = useQuery({
    queryKey: ["trip-boarding-stop-departures", journey.boardingStop.id],
    queryFn: () => fetchStopDepartures(journey.boardingStop.id, 6),
    enabled: Boolean(firstRideLeg),
    staleTime: 60_000
  });

  const upcomingBoardingDepartures = firstRideLeg
    ? departuresQuery.data?.departures
        .filter((departure) => departure.route === firstRideLeg.routeShortName)
        .slice(0, 3) ?? []
    : [];
  const firstUpcomingDeparture = upcomingBoardingDepartures[0];

  return (
    <Screen
      title={journey.label}
      subtitle={`${journey.totalMinutes} min total • Walk ${journey.walkingMinutes} min • Transfers ${journey.transferCount}`}
    >
      <View style={styles.hero}>
        <View style={styles.routeRow}>
          {journey.routeShortNames.map((route) => (
            <RouteBadge key={`${journey.id}-${route}`} route={route} />
          ))}
        </View>
        <Text style={styles.heroMeta}>{journey.summary}</Text>
        <Text style={styles.heroStops}>
          Board at {journey.boardingStop.name} • Exit at {journey.alightingStop.name}
        </Text>
      </View>

      {firstRideLeg ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Boarding timing</Text>
          <View style={styles.departureCard}>
            <RouteBadge route={firstRideLeg.routeShortName} />
            <View style={styles.departureCopy}>
              <Text style={styles.departureTitle}>
                {departuresQuery.isLoading
                  ? "Checking the next scheduled departures"
                  : firstUpcomingDeparture
                    ? `${firstRideLeg.routeShortName} from ${journey.boardingStop.name}`
                    : `No scheduled ${firstRideLeg.routeShortName} departure found yet`}
              </Text>
              <Text style={styles.departureMeta}>
                {departuresQuery.isLoading
                  ? "Pulling scheduled departures from the static GTFS feed."
                  : firstUpcomingDeparture
                    ? `${formatDepartureLead(firstUpcomingDeparture)} • ${firstUpcomingDeparture.scheduledTime}`
                    : "Try opening the stop detail for the full departure board."}
              </Text>
              {upcomingBoardingDepartures.length > 0 ? (
                <View style={styles.departureChipRow}>
                  {upcomingBoardingDepartures.map((departure, index) => (
                    <View
                      key={`${journey.id}-${departure.route}-${departure.scheduledTime ?? index}`}
                      style={styles.departureChip}
                    >
                      <Text style={styles.departureChipText}>
                        {formatDepartureLead(departure)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Legs</Text>
        {journey.legs.map((leg, index) => (
          <View key={`${journey.id}-${leg.kind}-${index}`} style={styles.legCard}>
            <Text style={styles.legKind}>{leg.kind}</Text>
            <Text style={styles.legDetail}>{leg.instruction}</Text>
            <Text style={styles.legMeta}>
              {leg.durationMinutes} min
              {"distanceMeters" in leg ? ` • ${Math.round(leg.distanceMeters)} m` : ""}
              {"routeShortName" in leg ? ` • ${leg.routeShortName}` : ""}
            </Text>
          </View>
        ))}
      </View>

      <Link href="/guided" asChild>
        <Pressable style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Start guided trip</Text>
        </Pressable>
      </Link>
    </Screen>
  );
}

function formatDepartureLead(
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

const styles = StyleSheet.create({
  hero: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm
  },
  routeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm
  },
  heroMeta: {
    color: theme.colors.mutedInk
  },
  heroStops: {
    color: theme.colors.line,
    fontWeight: "700"
  },
  departureCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm
  },
  departureCopy: {
    flex: 1,
    gap: 4
  },
  departureTitle: {
    color: theme.colors.ink,
    fontSize: 16,
    fontWeight: "700"
  },
  departureMeta: {
    color: theme.colors.mutedInk
  },
  departureChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    marginTop: 4
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
  section: {
    gap: theme.spacing.sm
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.ink
  },
  legCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 4
  },
  legKind: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: theme.colors.line
  },
  legDetail: {
    fontSize: 16,
    lineHeight: 22,
    color: theme.colors.ink
  },
  legMeta: {
    color: theme.colors.mutedInk
  },
  primaryButton: {
    backgroundColor: theme.colors.accent,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 16,
    alignItems: "center"
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800"
  }
});
