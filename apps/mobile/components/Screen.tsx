import type { PropsWithChildren, ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "../constants/theme";

interface ScreenProps extends PropsWithChildren {
  title: string;
  subtitle?: string;
  headerRight?: ReactNode;
  scrollEnabled?: boolean;
}

export function Screen({
  children,
  title,
  subtitle,
  headerRight,
  scrollEnabled = true
}: ScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardWrap}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          scrollEnabled={scrollEnabled}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            {headerRight}
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.canvas
  },
  keyboardWrap: {
    flex: 1
  },
  content: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: theme.spacing.md
  },
  headerCopy: {
    flex: 1,
    gap: 6
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: theme.colors.ink
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
    color: theme.colors.mutedInk
  }
});
