import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
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
import { useSavedStore } from "../../lib/saved-store";
import { fetchStop, fetchStopDepartures } from "../../lib/transit";

export default function StopDetailScreen() {
  const { stopId } = useLocalSearchParams<{ stopId: string }>();
  const togglePinnedStop = useSavedStore((state) => state.togglePinnedStop);
  const isPinnedStop = useSavedStore((state) => state.isPinnedStop);

  const stopQuery = useQuery({
    queryKey: ["stop", stopId],
    queryFn: () => fetchStop(stopId!),
    enabled: Boolean(stopId)
  });

  const departuresQuery = useQuery({
    queryKey: ["stop-departures", stopId],
    queryFn: () => fetchStopDepartures(stopId!),
    enabled: Boolean(stopId)
  });

  const stop = stopQuery.data;
  const pinned = stop ? isPinnedStop(stop.id) : false;

  return (
    <Screen
      title={stop?.name ?? "Stop detail"}
      subtitle="Real stop record plus the next scheduled departures from the Bogota GTFS feed."
    >
      {stopQuery.isLoading ? (
        <InfoCard title="Loading stop">
          Pulling the real stop record from the backend.
        </InfoCard>
      ) : null}

      {stopQuery.isError ? (
        <InfoCard title="Could not load stop" tone="warning">
          {stopQuery.error instanceof Error ? stopQuery.error.message : "Unknown stop error."}
        </InfoCard>
      ) : null}

      {stop ? (
        <View style={styles.headerCard}>
          <Text style={styles.headerMeta}>Stop code: {stop.code ?? "No public code yet"}</Text>
          <Text style={styles.headerMeta}>
            {stop.lat.toFixed(5)}, {stop.lon.toFixed(5)}
          </Text>
          <Pressable
            onPress={() => togglePinnedStop(stop)}
            style={pinned ? styles.pinnedActionActive : styles.pinnedAction}
          >
            <Text style={pinned ? styles.pinnedActionActiveText : styles.pinnedActionText}>
              {pinned ? "Pinned in Saved" : "Pin this stop"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Upcoming departures</Text>
        {departuresQuery.isLoading ? (
          <InfoCard title="Loading departures">
            Asking the backend for departures at this stop.
          </InfoCard>
        ) : null}

        {departuresQuery.data?.note ? (
          <InfoCard title="Schedule note">{departuresQuery.data.note}</InfoCard>
        ) : null}

        {departuresQuery.data &&
        departuresQuery.data.departures.length === 0 &&
        !departuresQuery.isLoading ? (
          <InfoCard title="No scheduled departures">
            This stop loaded correctly, but I could not find any upcoming departures in the current GTFS schedule window.
          </InfoCard>
        ) : null}

        {departuresQuery.data?.departures.map((departure) => (
          <View
            key={`${stopId}-${departure.route}-${departure.destination}`}
            style={styles.departureCard}
          >
            <RouteBadge route={departure.route} />
            <View style={styles.departureCopy}>
              <Text style={styles.destination}>{departure.destination}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.metaStrong}>
                  {typeof departure.etaMinutes === "number"
                    ? departure.etaMinutes === 0
                      ? "Due now"
                      : `${departure.etaMinutes} min`
                    : "ETA pending"}
                </Text>
                <Text style={styles.meta}>at {departure.scheduledTime ?? "time pending"}</Text>
              </View>
              <Text style={styles.meta}>
                {departure.realtime ? "Realtime prediction" : "Scheduled from static GTFS"}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm
  },
  headerMeta: {
    color: theme.colors.mutedInk
  },
  pinnedAction: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.lineSoft,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  pinnedActionActive: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  pinnedActionText: {
    color: theme.colors.line,
    fontWeight: "800"
  },
  pinnedActionActiveText: {
    color: theme.colors.accent,
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
  destination: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.ink
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6
  },
  metaStrong: {
    color: theme.colors.ink,
    fontWeight: "700"
  },
  meta: {
    color: theme.colors.mutedInk
  }
});
