import { StyleSheet, Text, View } from "react-native";
import { InfoCard } from "../../components/InfoCard";
import { Screen } from "../../components/Screen";
import { theme } from "../../constants/theme";
import { useJourneyStore } from "../../lib/journey-store";

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

  return (
    <Screen
      title="Guided trip"
      subtitle="One dominant action at a time. This is still a simple state machine, but it now follows the route you actually selected."
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
      </View>

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
  section: {
    gap: theme.spacing.sm
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.ink
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
