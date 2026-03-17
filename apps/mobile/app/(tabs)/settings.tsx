import { StyleSheet, Text, View } from "react-native";
import { Screen } from "../../components/Screen";
import { theme } from "../../constants/theme";
import { mobileConfig } from "../../lib/config";

export default function SettingsScreen() {
  return (
    <Screen
      title="Settings"
      subtitle="Private beta controls, diagnostics, and future localization live here."
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Language</Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Current app language</Text>
          <Text style={styles.cardBody}>{mobileConfig.language}</Text>
          <Text style={styles.cardNote}>
            Spanish is intentionally postponed until the English-first MVP feels solid.
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Diagnostics</Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>API base URL</Text>
          <Text style={styles.mono}>{mobileConfig.apiBaseUrl}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Live Activity adapter</Text>
          <Text style={styles.cardBody}>Planned after guided-trip state management is stable.</Text>
        </View>
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
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 6
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.ink
  },
  cardBody: {
    color: theme.colors.mutedInk,
    lineHeight: 20
  },
  cardNote: {
    color: theme.colors.line,
    lineHeight: 20
  },
  mono: {
    color: theme.colors.ink,
    fontFamily: "Courier",
    fontSize: 13
  }
});
