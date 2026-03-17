import Constants from "expo-constants";
import { Platform } from "react-native";

const isSecureWebContext =
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  window.location.protocol === "https:";

const configuredApiBaseUrl = resolveApiBaseUrl(
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim()
);
const sameOriginApiBaseUrl = getSameOriginApiBaseUrl();

export const mobileConfig = {
  apiBaseUrl:
    configuredApiBaseUrl ?? sameOriginApiBaseUrl ?? "http://127.0.0.1:4000",
  apiBaseUrlCandidates: buildApiBaseUrlCandidates(configuredApiBaseUrl),
  language: "English",
  localizationReady: false
};

function buildApiBaseUrlCandidates(configuredValue?: string): string[] {
  const candidates = new Set<string>();

  if (configuredValue && canReachFromCurrentPage(configuredValue)) {
    candidates.add(configuredValue);
  }

  if (sameOriginApiBaseUrl) {
    candidates.add(sameOriginApiBaseUrl);
  }

  const expoHostUri =
    Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost ?? "";
  const host = expoHostUri.split(":")[0]?.trim();

  if (host && !isSecureWebContext) {
    candidates.add(`http://${host}:4000`);
  }

  if (!isSecureWebContext) {
    candidates.add("http://127.0.0.1:4000");
  }

  return Array.from(candidates);
}

function getSameOriginApiBaseUrl(): string | undefined {
  if (Platform.OS !== "web" || typeof window === "undefined") {
    return undefined;
  }

  return new URL("/api", `${window.location.origin}/`)
    .toString()
    .replace(/\/$/, "");
}

function resolveApiBaseUrl(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/$/, "");
  }

  if (Platform.OS === "web" && typeof window !== "undefined") {
    return new URL(trimmed, `${window.location.origin}/`)
      .toString()
      .replace(/\/$/, "");
  }

  return trimmed.replace(/\/$/, "");
}

function canReachFromCurrentPage(value: string): boolean {
  if (!isSecureWebContext) {
    return true;
  }

  return value.startsWith("https://");
}
