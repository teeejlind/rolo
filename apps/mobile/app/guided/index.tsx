import { useQuery } from "@tanstack/react-query";
import { StyleSheet, Text, View } from "react-native";
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

export default function GuidedTripScreen() {
  const latestPlan = useJourneyStore((state) => state.latestPlan);
  const selectedJourneyId = useJourneyStore((state) => state.selectedJourneyId);
  const journey =
    latestPlan?.itineraries.find((item) => item.id === selectedJourneyId) ??
    latestPlan?.itineraries[0];

  if (!journey) {
    return (
      <Screen
        title="Guided trip"
        subtitle="Pick a route option first, then this screen will walk you through it one leg at a time."
      >
        <InfoCard title="No trip selected">
          Trip guidance needs a selected route from the trip results screen.
        </InfoCard>
      </Screen>
    );
  }

  const activeLeg = journey.legs[0];
  const firstRideLeg = journey.legs.find(
    (leg): leg is JourneyRideLeg => leg.kind === "ride"
  );
  const departuresQuery = useQuery({
    queryKey: ["guided-boarding-stop-departures", journey.boardingStop.id],
    queryFn: () => fetchStopDepartures(journey.boardingStop.id, 6),
    enabled: Boolean(firstRideLeg),
    staleTime: 60_000
  });
  const upcomingDepartures = firstRideLeg
    ? departuresQuery.data?.departures
        .filter((departure) => departure.route === firstRideLeg.routeShortName)
        .slice(0, 3) ?? []
    : [];
  const nextDeparture = upcomingDepartures[0];

  return (
    <Screen
      title="Guided trip"
      subtitle="One dominant action at a time, now anchored to the route you actually picked and the next scheduled boarding times."
    >
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>Current action</Text>
        <Text style={styles.heroTitle}>
          {activeLeg?.kind === "walk"
            ? "Start walking"
            : activeLeg?.kind === "ride"
              ? "Board when ready"
              : "Transfer now"}
        </Text>
        <Text style={styles.heroBody}>
          {activeLeg?.instruction ?? "Open a trip result first to begin guided navigation."}
        </Text>
        {firstRideLeg ? (
          <View style={styles.heroDepartureRow}>
            <RouteBadge route={firstRideLeg.routeShortName} />
            <Text style={styles.heroDepartureText}>
              {departuresQuery.isLoading
                ? `Checking ${firstRideLeg.routeShortName} departures`
                : nextDeparture
                  ? `Next ${firstRideLeg.routeShortName} leaves in ${formatDepartureLead(nextDeparture)}`
                  : `No scheduled ${firstRideLeg.routeShortName} departure matched yet`}
            </Text>
          </View>
        ) : null}
      </View>

      {firstRideLeg ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Boarding plan</Text>
          <View style={styles.boardingCard}>
            <Text style={styles.boardingLabel}>Board here</Text>
            <Text style={styles.boardingValue}>{journey.boardingStop.name}</Text>
            <Text style={styles.boardingMeta}>
              {journey.boardingStop.code
                ? `Stop ${journey.boardingStop.code}`
                : "Public stop code unavailable"}
            </Text>
            <Text style={styles.boardingMeta}>
              Ride {firstRideLeg.routeShortName} for {firstRideLeg.stopCount} stops, then exit at{" "}
              {firstRideLeg.toStop.name}.
            </Text>
            {upcomingDepartures.length > 0 ? (
              <View style={styles.departureChipRow}>
                {upcomingDepartures.map((departure, index) => (
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
            ) : (
              <Text style={styles.boardingMetaMuted}>
                {departuresQuery.isLoading
                  ? "Loading the stop board..."
                  : "The stop board did not return a matching scheduled departure yet."}
              </Text>
            )}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trip states</Text>
        {journey.legs.map((leg, index) => (
          <View
            key={`${journey.id}-${leg.kind}-${index}`}
            style={[styles.stateCard, index === 0 ? styles.stateCardActive : null]}
          >
            <Text style={styles.stateTitle}>
              Step {index + 1} • {leg.kind}
            </Text>
            <Text style={styles.stateBody}>{leg.instruction}</Text>
            <Text style={styles.stateMeta}>{leg.durationMinutes} min</Text>
          </View>
        ))}
      </View>
    </Screen>
  );
}

function formatDepartureLead(
  departure: StopDeparturesResponse["departures"][number]
): string {
  if (typeof departure.etaMinutes === "number") {
    if (departure.etaMinutes <= 0) {
      return "due now";
    }

    return `${departure.etaMinutes} min`;
  }

  return departure.scheduledTime ?? "scheduled";
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: theme.colors.ink,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    gap: 8
  },
  heroEyebrow: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#9BD2CF"
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#FFFFFF"
  },
  heroBody: {
    color: "#D7E2E5",
    lineHeight: 22
  },
  heroDepartureRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm
  },
  heroDepartureText: {
    color: "#FFFFFF",
    fontWeight: "700",
    flex: 1
  },
  section: {
    gap: theme.spacing.sm
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.ink
  },
  boardingCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 6
  },
  boardingLabel: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: theme.colors.line
  },
  boardingValue: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.ink
  },
  boardingMeta: {
    color: theme.colors.mutedInk,
    lineHeight: 20
  },
  boardingMetaMuted: {
    color: theme.colors.line,
    fontWeight: "700"
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
  stateCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 4
  },
  stateCardActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft
  },
  stateTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.ink
  },
  stateBody: {
    color: theme.colors.mutedInk,
    lineHeight: 20
  },
  stateMeta: {
    color: theme.colors.line,
    fontWeight: "700"
  }
});
