import { StyleSheet, Text, View } from "react-native";
import MapView, {
  Marker,
  Polyline
} from "react-native-maps";
import { theme } from "../constants/theme";

interface TripMapPreviewProps {
  from: {
    label: string;
    detail?: string;
    lat: number;
    lon: number;
  };
  to: {
    label: string;
    detail?: string;
    lat: number;
    lon: number;
  };
  caption: string;
}

export function TripMapPreview({ from, to, caption }: TripMapPreviewProps) {
  return (
    <View style={styles.mapCard}>
      <Text style={styles.mapTitle}>Trip map</Text>
      <MapView
        key={`${from.label}-${to.label}`}
        initialRegion={buildRegion(from, to)}
        style={styles.map}
      >
        <Marker
          coordinate={{ latitude: from.lat, longitude: from.lon }}
          description={from.detail}
          pinColor={theme.colors.line}
          title={`From: ${from.label}`}
        />
        <Marker
          coordinate={{ latitude: to.lat, longitude: to.lon }}
          description={to.detail}
          pinColor={theme.colors.accent}
          title={`To: ${to.label}`}
        />
        <Polyline
          coordinates={[
            { latitude: from.lat, longitude: from.lon },
            { latitude: to.lat, longitude: to.lon }
          ]}
          strokeColor={theme.colors.line}
          strokeWidth={3}
        />
      </MapView>
      <Text style={styles.mapCaption}>{caption}</Text>
    </View>
  );
}

function buildRegion(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number }
) {
  const latitude = (from.lat + to.lat) / 2;
  const longitude = (from.lon + to.lon) / 2;
  const latitudeDelta = Math.max(Math.abs(from.lat - to.lat) * 1.6, 0.06);
  const longitudeDelta = Math.max(Math.abs(from.lon - to.lon) * 1.6, 0.06);

  return {
    latitude,
    longitude,
    latitudeDelta,
    longitudeDelta
  };
}

const styles = StyleSheet.create({
  mapCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm
  },
  mapTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: theme.colors.ink
  },
  map: {
    height: 240,
    borderRadius: theme.radius.md
  },
  mapCaption: {
    color: theme.colors.mutedInk
  }
});
