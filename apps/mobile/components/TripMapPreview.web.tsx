import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
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
      <View style={styles.diagram}>
        <View style={styles.endpointCard}>
          <Text style={styles.endpointEyebrow}>From</Text>
          <Text style={styles.endpointTitle}>{from.label}</Text>
          <Text style={styles.endpointDetail}>
            {from.lat.toFixed(5)}, {from.lon.toFixed(5)}
          </Text>
        </View>
        <View style={styles.connector}>
          <View style={styles.connectorDot} />
          <View style={styles.connectorLine} />
          <View style={styles.connectorDotAccent} />
        </View>
        <View style={styles.endpointCard}>
          <Text style={styles.endpointEyebrow}>To</Text>
          <Text style={styles.endpointTitle}>{to.label}</Text>
          <Text style={styles.endpointDetail}>
            {to.lat.toFixed(5)}, {to.lon.toFixed(5)}
          </Text>
        </View>
      </View>
      <Text style={styles.mapCaption}>{caption}</Text>
      <Pressable
        onPress={() => {
          void Linking.openURL(buildGoogleTransitDirectionsUrl(from, to));
        }}
        style={styles.externalButton}
      >
        <Text style={styles.externalButtonText}>Open route in Google Maps</Text>
      </Pressable>
    </View>
  );
}

function buildGoogleTransitDirectionsUrl(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number }
): string {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", `${from.lat},${from.lon}`);
  url.searchParams.set("destination", `${to.lat},${to.lon}`);
  url.searchParams.set("travelmode", "transit");
  return url.toString();
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
  diagram: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: "#F8FBFB",
    padding: theme.spacing.md,
    gap: theme.spacing.sm
  },
  endpointCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    gap: 4
  },
  endpointEyebrow: {
    color: theme.colors.line,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6
  },
  endpointTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.ink
  },
  endpointDetail: {
    color: theme.colors.mutedInk
  },
  connector: {
    alignItems: "center",
    gap: 6
  },
  connectorDot: {
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: theme.colors.line
  },
  connectorLine: {
    width: 3,
    height: 34,
    borderRadius: 999,
    backgroundColor: theme.colors.border
  },
  connectorDotAccent: {
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: theme.colors.accent
  },
  mapCaption: {
    color: theme.colors.mutedInk
  },
  externalButton: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.accent,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  externalButtonText: {
    color: "#FFFFFF",
    fontWeight: "800"
  }
});
