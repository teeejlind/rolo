import type { PropsWithChildren } from "react";
import { StyleSheet, Text, View } from "react-native";
import { theme } from "../constants/theme";

interface InfoCardProps extends PropsWithChildren {
  title?: string;
  tone?: "default" | "warning";
}

export function InfoCard({
  children,
  title,
  tone = "default"
}: InfoCardProps) {
  return (
    <View style={[styles.card, tone === "warning" ? styles.warningCard : null]}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <Text style={[styles.body, tone === "warning" ? styles.warningBody : null]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: 6
  },
  warningCard: {
    backgroundColor: theme.colors.warningSoft,
    borderColor: "#E8B7AB"
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: theme.colors.ink
  },
  body: {
    color: theme.colors.mutedInk,
    lineHeight: 21
  },
  warningBody: {
    color: theme.colors.warning
  }
});
