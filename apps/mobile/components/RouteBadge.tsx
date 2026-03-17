import { StyleSheet, Text, View } from "react-native";
import { theme } from "../constants/theme";

interface RouteBadgeProps {
  route: string;
}

export function RouteBadge({ route }: RouteBadgeProps) {
  return (
    <View style={styles.badge}>
      <Text style={styles.label}>{route}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: theme.colors.line,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: "flex-start"
  },
  label: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4
  }
});
