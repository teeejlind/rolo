import { Link, useRouter } from "expo-router";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  const [searchTerm, setSearchTerm] = useState("");
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
  const activeSearchTerm = searchTerm.trim();

  useEffect(() => {
    const cleaned = query.trim();
    if (cleaned.length < 2) {
      setSearchTerm("");
      return;
    }

    const timeoutId = setTimeout(() => {
      setSearchTerm(cleaned);
    }, 350);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [query]);

  function applySelection(field: PlannerField, selection: PlannerSelection) {
    setSelection(field, selection);
    setQuery("");
    setSearchTerm("");

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
      activeSearchTerm.toLowerCase() === normalizedCleaned
        ? searchQuery.data?.results.find((result) => {
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

  function triggerImmediateSearch(value: string) {
    const cleaned = value.trim();
    setSearchTerm(cleaned.length >= 2 ? cleaned : "");
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
            [bestMatch?.district, bestMatch?.city].filter(Boolean).join(", ") ||
            "Use your live device position",
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

  const searchQuery = useQuery({
    queryKey: ["search", activeSearchTerm],
    queryFn: () => searchTransit(activeSearchTerm),
    enabled: activeSearchTerm.length >= 2,
    staleTime: 60_000
  });

  function renderSearchResult(
    result:
      | NonNullable<typeof searchQuery.data>["results"][number]
      | undefined
  ) {
    if (!result) {
      return null;
    }

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
            Route search is live. Stop-level route departures are the next upgrade.
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
        <Text style={styles.pickHint}>Tap to use as {activeField}</Text>
      </Pressable>
    );
  }

  return (
    <Screen
      title="Search"
      subtitle="One search bar, fast results, and quicker trip setup."
    >
      <View style={styles.searchPanel}>
        <View style={styles.searchPanelHeader}>
          <Text style={styles.sectionTitle}>Trip planner</Text>
          <View style={styles.plannerActions}>
            <Pressable onPress={swap} style={styles.smallAction}>
              <Text style={styles.smallActionText}>Swap</Text>
            </Pressable>
            <Pressable onPress={() => clearField(activeField)} style={styles.smallAction}>
              <Text style={styles.smallActionText}>Clear {activeField}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.plannerRow}>
          <Pressable
            onPress={() => setActiveField("from")}
            style={[
              styles.plannerCard,
              activeField === "from" ? styles.plannerCardActive : null
            ]}
          >
            <Text style={styles.plannerLabel}>From</Text>
            <Text numberOfLines={1} style={styles.plannerValue}>
              {from?.label ?? "Tap a result below"}
            </Text>
            <Text numberOfLines={1} style={styles.plannerDetail}>
              {from?.detail ?? "Start point, landmark, or current location"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveField("to")}
            style={[
              styles.plannerCard,
              activeField === "to" ? styles.plannerCardActive : null
            ]}
          >
            <Text style={styles.plannerLabel}>To</Text>
            <Text numberOfLines={1} style={styles.plannerValue}>
              {to?.label ?? "Tap a result below"}
            </Text>
            <Text numberOfLines={1} style={styles.plannerDetail}>
              {to?.detail ?? "Destination, stop, or neighborhood"}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.searchLabel}>
          Filling {activeField === "from" ? "From" : "To"}
        </Text>
        <TextInput
          autoCapitalize="words"
          autoCorrect={false}
          onChangeText={setQuery}
          onSubmitEditing={() => triggerImmediateSearch(trimmedQuery)}
          placeholder="Search places, businesses, addresses, stops..."
          placeholderTextColor={theme.colors.mutedInk}
          returnKeyType="search"
          style={styles.input}
          value={query}
        />
        <Text style={styles.searchHint}>
          Results update right below. Tap one result to fill {activeField}.
        </Text>

        {currentLocationSelection && activeField === "from" ? (
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
            style={styles.inlineShortcut}
          >
            <Text style={styles.inlineShortcutTitle}>Use current location</Text>
            <Text style={styles.inlineShortcutBody}>
              {currentLocationSelection.detail}
            </Text>
          </Pressable>
        ) : null}

        {trimmedQuery.length >= 2 ? (
          <Pressable
            onPress={() => applyFreeformSelection(activeField, trimmedQuery)}
            style={styles.inlineShortcut}
          >
            <Text style={styles.inlineShortcutTitle}>Use typed place exactly</Text>
            <Text style={styles.inlineShortcutBody}>
              Use "{trimmedQuery}" as your {activeField}.
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Results</Text>

        {trimmedQuery.length < 2 ? (
          <InfoCard title="Start typing">
            Search for places like Theatron, Andino, Monserrate, or Portal Norte.
            Results land right below this box now.
          </InfoCard>
        ) : null}

        {searchQuery.isLoading ? (
          <InfoCard title="Searching">
            Looking through Bogota transit data and place matches as you type.
          </InfoCard>
        ) : null}

        {searchQuery.isError ? (
          <InfoCard title="Search hit a snag" tone="warning">
            {searchQuery.error instanceof Error
              ? searchQuery.error.message
              : "Unknown search error."}
          </InfoCard>
        ) : null}

        {activeSearchTerm.length >= 2 &&
        !searchQuery.isLoading &&
        !searchQuery.isError &&
        searchQuery.data &&
        !searchQuery.data.transitApiReachable ? (
          <InfoCard title="Transit backend unavailable">
            Stop and route matches are temporarily offline, but place search still works for trip setup.
          </InfoCard>
        ) : null}

        {activeSearchTerm.length >= 2 &&
        !searchQuery.isLoading &&
        !searchQuery.isError &&
        (searchQuery.data?.results.length ?? 0) === 0 ? (
          <InfoCard title="No matches yet">
            Try a more specific Bogota search like "Theatron Bogota" or "Portal Norte Bogota".
          </InfoCard>
        ) : null}

        {activeSearchTerm.length >= 2 &&
        !searchQuery.isLoading &&
        !searchQuery.isError &&
        (searchQuery.data?.results.length ?? 0) > 0 ? (
          <Text style={styles.resultsMeta}>
            {searchQuery.data?.results.length} result
            {searchQuery.data?.results.length === 1 ? "" : "s"} for "{activeSearchTerm}".
            Tap one to fill {activeField}.
          </Text>
        ) : null}

        {activeSearchTerm.length >= 2
          ? searchQuery.data?.results.map((result) => renderSearchResult(result))
          : null}
      </View>

      {(from || to) && trimmedQuery.length < 2 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Keep these handy</Text>

          {from ? (
            <View style={styles.savedActionCard}>
              <Text style={styles.savedActionTitle}>Starting point</Text>
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
              <Text style={styles.savedActionTitle}>Destination</Text>
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
      ) : null}

      {(home || work || favorites.length > 0) && trimmedQuery.length < 2 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick picks</Text>

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
            <View style={styles.quickPillRow}>
              {favorites.slice(0, 6).map((favorite) => (
                <Pressable
                  key={favorite.id}
                  onPress={() => applySelection(activeField, favorite)}
                  style={styles.quickPill}
                >
                  <Text style={styles.quickPillText}>{favorite.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trip plan</Text>
        {from && to ? (
          <Link href="/trips" asChild>
            <Pressable style={styles.previewCard}>
              <Text style={styles.previewTitle}>See routes and departures</Text>
              <Text style={styles.previewBody}>
                {from.label} → {to.label}
              </Text>
            </Pressable>
          </Link>
        ) : (
          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Set both points</Text>
            <Text style={styles.previewBody}>
              Pick a start and destination, then the trip screen will show route options and the next departures from the boarding stop.
            </Text>
          </View>
        )}
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
  searchPanel: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm
  },
  searchPanelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: theme.spacing.sm
  },
  plannerActions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    flexWrap: "wrap",
    justifyContent: "flex-end"
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
  plannerRow: {
    gap: theme.spacing.sm
  },
  plannerCard: {
    backgroundColor: "#FFFFFF",
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
  searchLabel: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.ink
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
  searchHint: {
    color: theme.colors.mutedInk,
    lineHeight: 20
  },
  inlineShortcut: {
    backgroundColor: theme.colors.lineSoft,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: 4
  },
  inlineShortcutTitle: {
    color: theme.colors.line,
    fontWeight: "800"
  },
  inlineShortcutBody: {
    color: theme.colors.ink
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
  quickPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm
  },
  quickPill: {
    backgroundColor: theme.colors.lineSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  quickPillText: {
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
  resultSubtitle: {
    color: theme.colors.mutedInk
  },
  resultsMeta: {
    color: theme.colors.line,
    fontWeight: "700"
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
  pickHint: {
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
