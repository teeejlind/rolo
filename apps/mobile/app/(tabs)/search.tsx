import { Link, useRouter } from "expo-router";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { InfoCard } from "../../components/InfoCard";
import { RouteBadge } from "../../components/RouteBadge";
import { Screen } from "../../components/Screen";
import { theme } from "../../constants/theme";
import type { PlannerField, PlannerSelection } from "../../lib/planner-store";
import { usePlannerStore } from "../../lib/planner-store";
import { useSavedStore } from "../../lib/saved-store";
import { searchTransit } from "../../lib/transit";

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [lastSubmittedQuery, setLastSubmittedQuery] = useState("");
  const [currentLocationSelection, setCurrentLocationSelection] = useState<{
    label: string;
    detail: string;
    lat: number;
    lon: number;
  } | null>(null);
  const activeField = usePlannerStore((state) => state.activeField);
  const from = usePlannerStore((state) => state.from);
  const to = usePlannerStore((state) => state.to);
  const setActiveField = usePlannerStore((state) => state.setActiveField);
  const setSelection = usePlannerStore((state) => state.setSelection);
  const swap = usePlannerStore((state) => state.swap);
  const clearField = usePlannerStore((state) => state.clearField);
  const setSlot = useSavedStore((state) => state.setSlot);
  const saveFavorite = useSavedStore((state) => state.saveFavorite);
  const isFavorite = useSavedStore((state) => state.isFavorite);
  const home = useSavedStore((state) => state.home);
  const work = useSavedStore((state) => state.work);
  const favorites = useSavedStore((state) => state.favorites);
  const trimmedQuery = query.trim();

  function applySelection(field: PlannerField, selection: PlannerSelection) {
    setSelection(field, selection);
    setQuery("");

    const nextFrom = field === "from" ? selection : from;
    const nextTo = field === "to" ? selection : to;
    if (nextFrom && nextTo) {
      router.push("/trips");
    }
  }

  function resolveSelectionFromLatestResults(
    field: PlannerField,
    value: string
  ): PlannerSelection {
    const cleaned = value.trim();
    const normalizedCleaned = cleaned.toLowerCase();
    const matchingResult =
      lastSubmittedQuery.trim().toLowerCase() === normalizedCleaned
        ? searchMutation.data?.results.find((result) => {
            if (result.type === "place") {
              return (
                result.item.label.toLowerCase().includes(normalizedCleaned) ||
                result.item.detail.toLowerCase().includes(normalizedCleaned)
              );
            }

            if (result.type === "stop") {
              return result.item.name.toLowerCase().includes(normalizedCleaned);
            }

            return false;
          })
        : undefined;

    if (matchingResult?.type === "place") {
      return {
        id: matchingResult.item.id,
        kind: "place",
        label: matchingResult.item.label,
        detail: matchingResult.item.detail,
        kindLabel: matchingResult.item.kindLabel,
        lat: matchingResult.item.lat,
        lon: matchingResult.item.lon,
        mapsQuery: `${matchingResult.item.label}, Bogota, Colombia`
      };
    }

    if (matchingResult?.type === "stop") {
      return {
        id: matchingResult.item.id,
        kind: "stop",
        label: matchingResult.item.name,
        detail: `Stop ${matchingResult.item.code ?? matchingResult.item.id}`,
        kindLabel: "Transit stop",
        lat: matchingResult.item.lat,
        lon: matchingResult.item.lon,
        stopId: matchingResult.item.id,
        mapsQuery: matchingResult.item.name
      };
    }

    return {
      id: `freeform-${field}-${cleaned.toLowerCase()}`,
      kind: "freeform",
      label: cleaned,
      detail: "Manual place or landmark in Bogota",
      mapsQuery: `${cleaned}, Bogota, Colombia`
    };
  }

  function applyFreeformSelection(field: PlannerField, value: string) {
    const cleaned = value.trim();
    if (cleaned.length < 2) {
      return;
    }

    applySelection(field, resolveSelectionFromLatestResults(field, cleaned));
  }

  function runSearch(value: string) {
    const cleaned = value.trim();
    if (cleaned.length < 2) {
      return;
    }

    setLastSubmittedQuery(cleaned);
    searchMutation.mutate(cleaned);
  }

  useEffect(() => {
    let isMounted = true;

    async function loadCurrentLocation() {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          return;
        }

        const lastKnown = await Location.getLastKnownPositionAsync();
        if (!lastKnown || !isMounted) {
          return;
        }

        const reverse = await Location.reverseGeocodeAsync({
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude
        });

        const bestMatch = reverse[0];
        if (!isMounted) {
          return;
        }

        setCurrentLocationSelection({
          label: "Current location",
          detail:
            [
              bestMatch?.district,
              bestMatch?.city
            ]
              .filter(Boolean)
              .join(", ") || "Use your live device position",
          lat: lastKnown.coords.latitude,
          lon: lastKnown.coords.longitude
        });
      } catch {
        // Silent fallback. Manual search is the priority.
      }
    }

    loadCurrentLocation();

    return () => {
      isMounted = false;
    };
  }, []);

  const searchMutation = useMutation({
    mutationFn: (searchText: string) => searchTransit(searchText)
  });

  return (
    <Screen
      title="Search"
      subtitle="Search Bogota deliberately, then pick a result for From or To."
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trip planner</Text>
        <View style={styles.plannerStack}>
          <Pressable
            onPress={() => setActiveField("from")}
            style={[
              styles.plannerCard,
              activeField === "from" ? styles.plannerCardActive : null
            ]}
          >
            <Text style={styles.plannerLabel}>From</Text>
            <Text style={styles.plannerValue}>{from?.label ?? "Choose a starting point"}</Text>
            <Text style={styles.plannerDetail}>
              {from?.detail ?? "Search a place, stop, or use your current location"}
            </Text>
          </Pressable>

          <View style={styles.plannerActions}>
            <Pressable onPress={swap} style={styles.smallAction}>
              <Text style={styles.smallActionText}>Swap</Text>
            </Pressable>
            <Pressable onPress={() => clearField(activeField)} style={styles.smallAction}>
              <Text style={styles.smallActionText}>Clear active</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={() => setActiveField("to")}
            style={[
              styles.plannerCard,
              activeField === "to" ? styles.plannerCardActive : null
            ]}
          >
            <Text style={styles.plannerLabel}>To</Text>
            <Text style={styles.plannerValue}>{to?.label ?? "Choose a destination"}</Text>
            <Text style={styles.plannerDetail}>
              {to?.detail ?? "Search a place or stop in Bogota"}
            </Text>
          </Pressable>
        </View>

        {from ? (
          <View style={styles.savedActionCard}>
            <Text style={styles.savedActionTitle}>Keep this starting point handy</Text>
            <Text style={styles.savedActionBody}>{from.label}</Text>
            <View style={styles.savedActionRow}>
              <Pressable onPress={() => setSlot("home", from)} style={styles.savedAction}>
                <Text style={styles.savedActionText}>Save as Home</Text>
              </Pressable>
              <Pressable onPress={() => saveFavorite(from)} style={styles.savedActionMuted}>
                <Text style={styles.savedActionMutedText}>
                  {isFavorite(from.id) ? "Saved to favorites" : "Save favorite"}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {to ? (
          <View style={styles.savedActionCard}>
            <Text style={styles.savedActionTitle}>Keep this destination ready</Text>
            <Text style={styles.savedActionBody}>{to.label}</Text>
            <View style={styles.savedActionRow}>
              <Pressable onPress={() => setSlot("work", to)} style={styles.savedAction}>
                <Text style={styles.savedActionText}>Save as Work</Text>
              </Pressable>
              <Pressable onPress={() => saveFavorite(to)} style={styles.savedActionMuted}>
                <Text style={styles.savedActionMutedText}>
                  {isFavorite(to.id) ? "Saved to favorites" : "Save favorite"}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      {home || work || favorites.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Saved shortcuts</Text>
          {home ? (
            <Pressable
              onPress={() => applySelection(activeField, home)}
              style={styles.quickChoice}
            >
              <Text style={styles.quickChoiceTitle}>Use Home</Text>
              <Text style={styles.quickChoiceBody}>{home.label}</Text>
            </Pressable>
          ) : null}
          {work ? (
            <Pressable
              onPress={() => applySelection(activeField, work)}
              style={styles.quickChoice}
            >
              <Text style={styles.quickChoiceTitle}>Use Work</Text>
              <Text style={styles.quickChoiceBody}>{work.label}</Text>
            </Pressable>
          ) : null}
          {favorites.length > 0 ? (
            <View style={styles.tagRow}>
              {favorites.slice(0, 6).map((favorite) => (
                <Pressable
                  key={favorite.id}
                  onPress={() => applySelection(activeField, favorite)}
                  style={styles.tag}
                >
                  <Text style={styles.tagText}>{favorite.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.searchBox}>
        <Text style={styles.searchLabel}>
          Searching for: {activeField === "from" ? "starting point" : "destination"}
        </Text>
        <TextInput
          autoCapitalize="words"
          autoCorrect={false}
          onChangeText={setQuery}
          onSubmitEditing={() => runSearch(trimmedQuery)}
          placeholder="Try Theatron, Andino, Museo del Oro, Portal Norte..."
          placeholderTextColor={theme.colors.mutedInk}
          returnKeyType="search"
          style={styles.input}
          value={query}
        />
        <Text style={styles.searchHint}>
          Search for businesses, landmarks, neighborhoods, addresses, stops, or routes. Tap Search first, then choose a result.
        </Text>

        {trimmedQuery.length >= 2 ? (
          <View style={styles.inlineActions}>
            <Pressable
              onPress={() => runSearch(trimmedQuery)}
              style={styles.searchAction}
            >
              <Text style={styles.searchActionText}>Search Bogota</Text>
            </Pressable>
            <Pressable
              onPress={() => applyFreeformSelection("from", trimmedQuery)}
              style={[
                styles.inlineAction,
                activeField === "from" ? styles.inlineActionActive : null
              ]}
            >
              <Text style={styles.inlineActionText}>Use as From</Text>
            </Pressable>
            <Pressable
              onPress={() => applyFreeformSelection("to", trimmedQuery)}
              style={[
                styles.inlineAction,
                activeField === "to" ? styles.inlineActionActive : null
              ]}
            >
              <Text style={styles.inlineActionText}>Use as To</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Try these</Text>
        <View style={styles.tagRow}>
          {["Theatron", "Andino", "Museo del Oro", "Portal Norte"].map((item) => (
            <Pressable
              key={item}
              onPress={() => {
                setQuery(item);
                runSearch(item);
              }}
              style={styles.tag}
            >
              <Text style={styles.tagText}>{item}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Results</Text>
        {currentLocationSelection ? (
          <Pressable
            onPress={() => {
              applySelection(activeField, {
                id: "current-location",
                kind: "place",
                label: currentLocationSelection.label,
                detail: currentLocationSelection.detail,
                kindLabel: "Current location",
                lat: currentLocationSelection.lat,
                lon: currentLocationSelection.lon,
                mapsQuery: "Current location"
              });
            }}
            style={styles.quickChoice}
          >
            <Text style={styles.quickChoiceTitle}>Use current location</Text>
            <Text style={styles.quickChoiceBody}>{currentLocationSelection.detail}</Text>
          </Pressable>
        ) : null}

        {trimmedQuery.length >= 2 ? (
          <Pressable
            onPress={() => applyFreeformSelection(activeField, trimmedQuery)}
            style={styles.quickChoice}
          >
            <Text style={styles.quickChoiceTitle}>Use typed place</Text>
            <Text style={styles.quickChoiceBody}>
              Use "{trimmedQuery}" as your {activeField === "from" ? "starting point" : "destination"} even if search is imperfect.
            </Text>
          </Pressable>
        ) : null}

        {trimmedQuery.length >= 2 ? (
          <InfoCard title="Manual planner tip">
            This search is now place-first. You should be able to search for venue names, landmarks, shopping centers, and neighborhoods without knowing the stop name first.
          </InfoCard>
        ) : null}

        {!searchMutation.isPending &&
        searchMutation.data &&
        !searchMutation.data.transitApiReachable ? (
          <InfoCard title="Transit backend unavailable">
            Stop and route results are temporarily offline, but place search still works for manual trip setup.
          </InfoCard>
        ) : null}

        {lastSubmittedQuery.length < 2 ? (
          <InfoCard title="Start with a search">
            Type a place like Theatron, a business like Andino, a landmark like Monserrate, or a stop like Portal Norte, then tap Search Bogota.
          </InfoCard>
        ) : null}

        {searchMutation.isPending ? (
          <InfoCard title="Searching">
            Looking through Bogota transit data plus OpenStreetMap place results.
          </InfoCard>
        ) : null}

        {searchMutation.isError ? (
          <InfoCard title="Search hit a snag" tone="warning">
            {searchMutation.error instanceof Error
              ? searchMutation.error.message
              : "Unknown search error."}
          </InfoCard>
        ) : null}

        {!searchMutation.isPending &&
        !searchMutation.isError &&
        lastSubmittedQuery.length >= 2 &&
        (searchMutation.data?.results.length ?? 0) === 0 ? (
          <InfoCard title="No matches yet">
            Try a more specific Bogota search like "Theatron Bogota" or "Portal Norte Bogota".
          </InfoCard>
        ) : null}

        {!searchMutation.isPending &&
        !searchMutation.isError &&
        lastSubmittedQuery.length >= 2 &&
        (searchMutation.data?.results.length ?? 0) > 0 ? (
          <Text style={styles.resultsMeta}>
            {searchMutation.data?.results.length} result{searchMutation.data?.results.length === 1 ? "" : "s"} found for "{lastSubmittedQuery}". Tap any one to fill the {activeField} field.
          </Text>
        ) : null}

        {searchMutation.data?.results.map((result) => {
          if (result.type === "stop") {
            return (
              <Pressable
                key={result.item.id}
                onPress={() => {
                  const selectedStop: PlannerSelection = {
                    id: result.item.id,
                    kind: "stop",
                    label: result.item.name,
                    detail: `Stop ${result.item.code ?? result.item.id}`,
                    kindLabel: "Transit stop",
                    lat: result.item.lat,
                    lon: result.item.lon,
                    stopId: result.item.id
                  };
                  applySelection(activeField, selectedStop);
                }}
                style={styles.resultCard}
              >
                <Text style={styles.resultTitle}>{result.item.name}</Text>
                <Text style={styles.resultSubtitle}>
                  Stop {result.item.code ?? result.item.id}
                </Text>
                <Text style={styles.pickHint}>Tap to use as {activeField}</Text>
              </Pressable>
            );
          }

          if (result.type === "route") {
            return (
              <View key={result.item.id} style={styles.resultCard}>
                <RouteBadge route={result.item.shortName} />
                <Text style={styles.resultTitle}>{result.item.longName}</Text>
                <Text style={styles.resultSubtitle}>
                  Route search works now. Full line detail is next.
                </Text>
              </View>
            );
          }

          return (
            <Pressable
              key={result.item.id}
              onPress={() => {
                const selectedPlace: PlannerSelection = {
                  id: result.item.id,
                  kind: "place",
                  label: result.item.label,
                  detail: result.item.detail,
                  kindLabel: result.item.kindLabel,
                  lat: result.item.lat,
                  lon: result.item.lon,
                  mapsQuery: `${result.item.label}, Bogota, Colombia`
                };
                applySelection(activeField, selectedPlace);
              }}
              style={styles.resultCard}
            >
              <View style={styles.placeHeader}>
                <Text style={styles.resultTitle}>{result.item.label}</Text>
                <View style={styles.placeKindPill}>
                  <Text style={styles.placeKindText}>{result.item.kindLabel}</Text>
                </View>
              </View>
              <Text style={styles.resultSubtitle}>{result.item.detail}</Text>
              <Text style={styles.placeHint}>Tap to use as {activeField}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Try a trip plan</Text>
        {from && to ? (
          <Link href="/trips" asChild>
            <Pressable style={styles.previewCard}>
              <Text style={styles.previewTitle}>Preview routes</Text>
              <Text style={styles.previewBody}>
                {from.label} → {to.label}
              </Text>
            </Pressable>
          </Link>
        ) : (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Choose both trip points</Text>
            <Text style={styles.previewBody}>
              Pick both From and To first, then the trip screen will show the best transit matches we can build from the current Bogota data.
            </Text>
          </View>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBox: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: 4
  },
  searchLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.ink
  },
  searchHint: {
    color: theme.colors.mutedInk,
    lineHeight: 20
  },
  inlineActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
    marginTop: 8
  },
  searchAction: {
    backgroundColor: theme.colors.accent,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  searchActionText: {
    color: "#FFFFFF",
    fontWeight: "800"
  },
  inlineAction: {
    backgroundColor: theme.colors.lineSoft,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  inlineActionActive: {
    backgroundColor: theme.colors.accentSoft
  },
  inlineActionText: {
    color: theme.colors.line,
    fontWeight: "800"
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    color: theme.colors.ink
  },
  section: {
    gap: theme.spacing.sm
  },
  plannerStack: {
    gap: theme.spacing.sm
  },
  plannerCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 4
  },
  plannerCardActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft
  },
  plannerLabel: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: theme.colors.line
  },
  plannerValue: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.ink
  },
  plannerDetail: {
    color: theme.colors.mutedInk,
    lineHeight: 20
  },
  savedActionCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm
  },
  savedActionTitle: {
    color: theme.colors.line,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase"
  },
  savedActionBody: {
    color: theme.colors.ink,
    fontSize: 16,
    fontWeight: "700"
  },
  savedActionRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    flexWrap: "wrap"
  },
  savedAction: {
    backgroundColor: theme.colors.accent,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  savedActionText: {
    color: "#FFFFFF",
    fontWeight: "800"
  },
  savedActionMuted: {
    backgroundColor: theme.colors.lineSoft,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  savedActionMutedText: {
    color: theme.colors.line,
    fontWeight: "800"
  },
  plannerActions: {
    flexDirection: "row",
    gap: theme.spacing.sm
  },
  smallAction: {
    backgroundColor: theme.colors.lineSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  smallActionText: {
    color: theme.colors.line,
    fontWeight: "700"
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.ink
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm
  },
  tag: {
    backgroundColor: theme.colors.lineSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  quickChoice: {
    backgroundColor: theme.colors.lineSoft,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: 4
  },
  quickChoiceTitle: {
    color: theme.colors.line,
    fontWeight: "800"
  },
  quickChoiceBody: {
    color: theme.colors.ink
  },
  tagText: {
    color: theme.colors.line,
    fontWeight: "700"
  },
  resultCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 6
  },
  resultTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: theme.colors.ink
  },
  placeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: theme.spacing.sm
  },
  placeKindPill: {
    backgroundColor: theme.colors.lineSoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  placeKindText: {
    color: theme.colors.line,
    fontSize: 12,
    fontWeight: "800"
  },
  resultSubtitle: {
    color: theme.colors.mutedInk
  },
  resultsMeta: {
    color: theme.colors.line,
    fontWeight: "700"
  },
  pickHint: {
    color: theme.colors.line,
    fontWeight: "700"
  },
  placeHint: {
    color: theme.colors.line,
    fontWeight: "700"
  },
  previewCard: {
    backgroundColor: theme.colors.accentSoft,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    gap: 6
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.ink
  },
  previewBody: {
    color: theme.colors.mutedInk
  }
});
