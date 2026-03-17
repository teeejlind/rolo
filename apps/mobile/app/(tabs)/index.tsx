import { LinearGradient } from "expo-linear-gradient";
import { Link, useRouter } from "expo-router";
import * as Location from "expo-location";
import { useEffect, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
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
import {
  fetchStopDepartures,
  fetchNearbyStops,
  formatDistance,
  formatWalkTime,
  isInBogotaServiceArea
} from "../../lib/transit";

export default function HomeScreen() {
  const router = useRouter();
  const home = useSavedStore((state) => state.home);
  const work = useSavedStore((state) => state.work);
  const setTrip = usePlannerStore((state) => state.setTrip);
  const [locationState, setLocationState] = useState<{
    status: "loading" | "ready" | "denied" | "error";
    coords?: { lat: number; lon: number };
    message?: string;
  }>({
    status: "loading"
  });

  useEffect(() => {
    let isMounted = true;

    async function loadLocation() {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!isMounted) {
          return;
        }

        if (permission.status !== "granted") {
          setLocationState({
            status: "denied",
            message: "Location is off, so nearby stops are approximate only until you allow access."
          });
          return;
        }

        let fallbackCoords:
          | {
              lat: number;
              lon: number;
            }
          | undefined;

        const lastKnown = await Location.getLastKnownPositionAsync();
        if (lastKnown && isMounted) {
          fallbackCoords = {
            lat: lastKnown.coords.latitude,
            lon: lastKnown.coords.longitude
          };
          setLocationState({
            status: "ready",
            coords: fallbackCoords,
            message: "Using your last known location while we ask your device for a fresher fix."
          });
        }

        try {
          const current = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced
          });

          if (isMounted) {
            setLocationState({
              status: "ready",
              coords: {
                lat: current.coords.latitude,
                lon: current.coords.longitude
              }
            });
          }
        } catch (error) {
          if (fallbackCoords && isMounted) {
            setLocationState({
              status: "ready",
              coords: fallbackCoords,
              message:
                "Your device would not give a fresh location right now, so the app is using your last known position."
            });
            return;
          }

          throw error;
        }
      } catch (error) {
        if (isMounted) {
          setLocationState({
            status: "error",
            message: error instanceof Error ? error.message : "Could not load your current location."
          });
        }
      }
    }

    loadLocation();

    return () => {
      isMounted = false;
    };
  }, []);

  const nearbyStopsQuery = useQuery({
    queryKey: ["nearby-stops", locationState.coords],
    queryFn: () =>
      fetchNearbyStops(locationState.coords!.lat, locationState.coords!.lon),
    enabled:
      Boolean(locationState.coords) &&
      isInBogotaServiceArea(locationState.coords!.lat, locationState.coords!.lon),
    staleTime: 60_000
  });

  const nearbyStops = nearbyStopsQuery.data ?? [];
  const departurePreviewStops = nearbyStops.slice(0, 3);
  const outsideBogota =
    locationState.coords &&
    !isInBogotaServiceArea(locationState.coords.lat, locationState.coords.lon);
  const departureQueries = useQueries({
    queries: departurePreviewStops.map((stop) => ({
      queryKey: ["stop-departures-preview", stop.id],
      queryFn: () => fetchStopDepartures(stop.id, 2),
      enabled: !outsideBogota,
      staleTime: 60_000
    }))
  });

  const departuresByStopId = new Map(
    departurePreviewStops.map((stop, index) => [stop.id, departureQueries[index]])
  );

  return (
    <Screen
      title="Departures first."
      subtitle="English-first Bogota transit, tuned for daily personal use."
    >
      <LinearGradient
        colors={["#D7F2EF", "#FFF2D8"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Text style={styles.heroEyebrow}>Right now</Text>
        <Text style={styles.heroTitle}>
          {nearbyStops.length > 0 ? "Real stops near you" : "Let’s lock in your nearby stops"}
        </Text>
        <Text style={styles.heroBody}>
          {locationState.status === "ready"
            ? "The app is now reading your actual coordinates and loading stops from the Bogota backend."
            : "I’m asking for location so the app can stop pretending every ride starts at Calle 72."}
        </Text>
      </LinearGradient>

      <Link href="/search" asChild>
        <Pressable style={styles.searchCard}>
          <Text style={styles.searchLabel}>Search places, stops, or routes</Text>
          <Text style={styles.searchHint}>Try Zona T, Calle 72, or Portal Norte</Text>
        </Pressable>
      </Link>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Saved anchors</Text>
        <View style={styles.placeRow}>
          <Link href="/saved" asChild>
            <Pressable style={styles.placeCard}>
              <Text style={styles.placeEyebrow}>Home</Text>
              <Text style={styles.placeLabel}>{home?.label ?? "Not set yet"}</Text>
              <Text style={styles.placeSubtitle}>
                {home?.detail ?? "Save a frequent origin from Search."}
              </Text>
            </Pressable>
          </Link>
          <Link href="/saved" asChild>
            <Pressable style={styles.placeCard}>
              <Text style={styles.placeEyebrow}>Work</Text>
              <Text style={styles.placeLabel}>{work?.label ?? "Not set yet"}</Text>
              <Text style={styles.placeSubtitle}>
                {work?.detail ?? "Save a frequent destination from Search."}
              </Text>
            </Pressable>
          </Link>
        </View>
      </View>

      {home && work ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick commute</Text>
          <View style={styles.quickTripCard}>
            <Text style={styles.quickTripTitle}>Use your saved places</Text>
            <Text style={styles.quickTripBody}>
              Build a route in one tap without retyping your regular endpoints.
            </Text>
            <View style={styles.quickTripActions}>
              <Pressable
                onPress={() => {
                  setTrip(home, work);
                  router.push("/trips");
                }}
                style={styles.quickTripActionPrimary}
              >
                <Text style={styles.quickTripActionPrimaryText}>Home → Work</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setTrip(work, home);
                  router.push("/trips");
                }}
                style={styles.quickTripAction}
              >
                <Text style={styles.quickTripActionText}>Work → Home</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Nearby stops</Text>
        {locationState.status === "loading" ? (
          <InfoCard title="Finding your location">
            Asking your device for its current position, then loading stops from the backend.
          </InfoCard>
        ) : null}

        {locationState.status === "denied" ? (
          <InfoCard title="Location permission is off" tone="warning">
            {locationState.message ?? "Turn on location permission in your device settings to unlock real nearby stops."}
          </InfoCard>
        ) : null}

        {locationState.status === "error" ? (
          <InfoCard title="Location hit a snag" tone="warning">
            {locationState.message ??
              "The app could not read your location. Use Search to set a route manually."}
          </InfoCard>
        ) : null}

        {locationState.status === "ready" && locationState.message ? (
          <InfoCard title="Location note">{locationState.message}</InfoCard>
        ) : null}

        {outsideBogota ? (
          <InfoCard title="You look outside Bogota">
            That is totally fine. Nearby Bogota stops will be sparse or empty from your current location, so manual trip search is the better path for now.
          </InfoCard>
        ) : null}

        {nearbyStopsQuery.isLoading ? (
          <InfoCard title="Loading nearby stops">
            The backend is searching Bogota stops around your current location.
          </InfoCard>
        ) : null}

        {nearbyStopsQuery.isError ? (
          <InfoCard title="Could not load nearby stops" tone="warning">
            {nearbyStopsQuery.error instanceof Error
              ? nearbyStopsQuery.error.message
              : "Unknown nearby stop error."}
          </InfoCard>
        ) : null}

        {!outsideBogota &&
        !nearbyStopsQuery.isLoading &&
        !nearbyStopsQuery.isError &&
        nearbyStops.length === 0 ? (
          <InfoCard title="No nearby stops yet">
            Try moving outside, or use Search while we keep building the stronger trip flows.
          </InfoCard>
        ) : null}

        {nearbyStops.map((stop) => (
          <Link
            key={stop.id}
            href={{ pathname: "/stop/[stopId]", params: { stopId: stop.id } }}
            asChild
          >
            <Pressable style={styles.stopCard}>
              <View style={styles.stopHeader}>
                <View style={styles.stopCopy}>
                  <Text style={styles.stopName}>{stop.name}</Text>
                  <Text style={styles.stopMeta}>
                    {formatWalkTime(stop.distanceMeters)} • {formatDistance(stop.distanceMeters)}
                  </Text>
                </View>
                {stop.code ? <Text style={styles.codePill}>{stop.code}</Text> : null}
              </View>

              <Text style={styles.stopFootnote}>
                {departuresByStopId.get(stop.id)?.isLoading
                  ? "Loading scheduled departures..."
                  : "Tap through for stop detail and the full departure list."}
              </Text>

              {departuresByStopId.get(stop.id)?.data?.departures
                .slice(0, 2)
                .map((departure) => (
                  <View
                    key={`${stop.id}-${departure.route}-${departure.scheduledTime}-${departure.destination}`}
                    style={styles.departurePreview}
                  >
                    <Text style={styles.departureRoute}>{departure.route}</Text>
                    <View style={styles.departurePreviewCopy}>
                      <Text numberOfLines={1} style={styles.departureDestination}>
                        {departure.destination}
                      </Text>
                      <Text style={styles.departureMeta}>
                        {typeof departure.etaMinutes === "number"
                          ? departure.etaMinutes === 0
                            ? "Due now"
                            : `${departure.etaMinutes} min`
                          : "ETA pending"}{" "}
                        • {departure.scheduledTime ?? "time pending"}
                      </Text>
                    </View>
                  </View>
                ))}
            </Pressable>
          </Link>
        ))}
      </View>

      <Link href="/search" asChild>
        <Pressable style={styles.tripCard}>
          <Text style={styles.tripCardTitle}>Plan a trip</Text>
          <Text style={styles.tripCardBody}>
            Pick a manual starting point and destination, then preview the route flow.
          </Text>
          <Text style={styles.tripPreviewText}>
            Search now supports real place selection for both ends of the trip.
          </Text>
        </Pressable>
      </Link>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    gap: 10
  },
  heroEyebrow: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: theme.colors.line
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: theme.colors.ink
  },
  heroBody: {
    fontSize: 16,
    lineHeight: 22,
    color: theme.colors.mutedInk
  },
  searchCard: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    gap: 4
  },
  searchLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: theme.colors.ink
  },
  searchHint: {
    color: theme.colors.mutedInk
  },
  section: {
    gap: theme.spacing.sm
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: theme.colors.ink
  },
  placeRow: {
    flexDirection: "row",
    gap: theme.spacing.sm
  },
  placeCard: {
    flex: 1,
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 6
  },
  placeEyebrow: {
    color: theme.colors.line,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
    textTransform: "uppercase"
  },
  placeLabel: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.ink
  },
  placeSubtitle: {
    color: theme.colors.mutedInk
  },
  stopCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.md
  },
  stopHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: theme.spacing.md
  },
  stopCopy: {
    flex: 1,
    gap: 4
  },
  stopName: {
    fontSize: 19,
    fontWeight: "800",
    color: theme.colors.ink
  },
  stopMeta: {
    color: theme.colors.mutedInk
  },
  codePill: {
    backgroundColor: theme.colors.lineSoft,
    color: theme.colors.line,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    fontWeight: "700",
    overflow: "hidden"
  },
  stopFootnote: {
    color: theme.colors.mutedInk
  },
  departurePreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.sm
  },
  departureRoute: {
    minWidth: 48,
    color: theme.colors.line,
    fontWeight: "800"
  },
  departurePreviewCopy: {
    flex: 1,
    gap: 2
  },
  departureDestination: {
    color: theme.colors.ink,
    fontWeight: "600"
  },
  departureMeta: {
    color: theme.colors.mutedInk,
    fontSize: 13
  },
  quickTripCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm
  },
  quickTripTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.ink
  },
  quickTripBody: {
    color: theme.colors.mutedInk,
    lineHeight: 20
  },
  quickTripActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm
  },
  quickTripActionPrimary: {
    backgroundColor: theme.colors.accent,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  quickTripActionPrimaryText: {
    color: "#FFFFFF",
    fontWeight: "800"
  },
  quickTripAction: {
    backgroundColor: theme.colors.lineSoft,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  quickTripActionText: {
    color: theme.colors.line,
    fontWeight: "800"
  },
  tripCard: {
    backgroundColor: theme.colors.ink,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md
  },
  tripCardTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF"
  },
  tripCardBody: {
    color: "#E4ECEE",
    lineHeight: 22
  },
  tripPreviewText: {
    color: "#D7E2E5"
  }
});
