import { Link, useRouter } from "expo-router";
import {
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { InfoCard } from "../../components/InfoCard";
import { Screen } from "../../components/Screen";
import { theme } from "../../constants/theme";
import { usePlannerStore } from "../../lib/planner-store";
import { useSavedStore } from "../../lib/saved-store";

export default function SavedScreen() {
  const router = useRouter();
  const home = useSavedStore((state) => state.home);
  const work = useSavedStore((state) => state.work);
  const favorites = useSavedStore((state) => state.favorites);
  const pinnedStops = useSavedStore((state) => state.pinnedStops);
  const clearSlot = useSavedStore((state) => state.clearSlot);
  const removeFavorite = useSavedStore((state) => state.removeFavorite);
  const togglePinnedStop = useSavedStore((state) => state.togglePinnedStop);
  const setTrip = usePlannerStore((state) => state.setTrip);

  return (
    <Screen
      title="Saved"
      subtitle="Your repeat places and pinned stops now persist on-device so the app gets more useful over time."
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Home and work</Text>
        <View style={styles.slotRow}>
          <View style={styles.slotCard}>
            <Text style={styles.slotEyebrow}>Home</Text>
            <Text style={styles.cardTitle}>{home?.label ?? "Not set yet"}</Text>
            <Text style={styles.cardSubtitle}>
              {home?.detail ?? "Choose a place in Search, then save it as Home."}
            </Text>
            {home ? (
              <Pressable onPress={() => clearSlot("home")} style={styles.inlineAction}>
                <Text style={styles.inlineActionText}>Clear Home</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.slotCard}>
            <Text style={styles.slotEyebrow}>Work</Text>
            <Text style={styles.cardTitle}>{work?.label ?? "Not set yet"}</Text>
            <Text style={styles.cardSubtitle}>
              {work?.detail ?? "Choose a place in Search, then save it as Work."}
            </Text>
            {work ? (
              <Pressable onPress={() => clearSlot("work")} style={styles.inlineAction}>
                <Text style={styles.inlineActionText}>Clear Work</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      {home && work ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick routes</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Daily commute shortcuts</Text>
            <Text style={styles.cardSubtitle}>
              Jump straight into route planning with your saved anchors.
            </Text>
            <View style={styles.actionRow}>
              <Pressable
                onPress={() => {
                  setTrip(home, work);
                  router.push("/trips");
                }}
                style={styles.inlineAction}
              >
                <Text style={styles.inlineActionText}>Home to Work</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setTrip(work, home);
                  router.push("/trips");
                }}
                style={styles.inlineAction}
              >
                <Text style={styles.inlineActionText}>Work to Home</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Favorite places</Text>
        {favorites.length === 0 ? (
          <InfoCard title="No favorites yet">
            Pick a place in Search, then save it to favorites for quick repeat trips.
          </InfoCard>
        ) : null}

        {favorites.map((place) => (
          <View key={place.id} style={styles.card}>
            <Text style={styles.cardTitle}>{place.label}</Text>
            <Text style={styles.cardSubtitle}>{place.detail}</Text>
            <View style={styles.actionRow}>
              <Link href="/search" asChild>
                <Pressable style={styles.inlineAction}>
                  <Text style={styles.inlineActionText}>Plan from Search</Text>
                </Pressable>
              </Link>
              <Pressable
                onPress={() => removeFavorite(place.id)}
                style={styles.inlineActionMuted}
              >
                <Text style={styles.inlineActionMutedText}>Remove</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pinned stops</Text>
        {pinnedStops.length === 0 ? (
          <InfoCard title="No pinned stops yet">
            Open any stop detail screen and pin the stops you check most often.
          </InfoCard>
        ) : null}

        {pinnedStops.map((stop) => (
          <View key={stop.id} style={styles.card}>
            <Text style={styles.cardTitle}>{stop.name}</Text>
            <Text style={styles.cardSubtitle}>
              Stop {stop.code ?? stop.id}
            </Text>
            <View style={styles.actionRow}>
              <Link
                href={{ pathname: "/stop/[stopId]", params: { stopId: stop.id } }}
                asChild
              >
                <Pressable style={styles.inlineAction}>
                  <Text style={styles.inlineActionText}>Open stop</Text>
                </Pressable>
              </Link>
              <Pressable
                onPress={() => togglePinnedStop(stop)}
                style={styles.inlineActionMuted}
              >
                <Text style={styles.inlineActionMutedText}>Unpin</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: theme.spacing.sm
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.ink
  },
  slotRow: {
    gap: theme.spacing.sm
  },
  slotCard: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 6
  },
  slotEyebrow: {
    color: theme.colors.line,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase"
  },
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 8
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: theme.colors.ink
  },
  cardSubtitle: {
    color: theme.colors.mutedInk,
    lineHeight: 20
  },
  actionRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    flexWrap: "wrap"
  },
  inlineAction: {
    backgroundColor: theme.colors.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  inlineActionText: {
    color: theme.colors.accent,
    fontWeight: "800"
  },
  inlineActionMuted: {
    backgroundColor: theme.colors.lineSoft,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  inlineActionMutedText: {
    color: theme.colors.line,
    fontWeight: "800"
  }
});
