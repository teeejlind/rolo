import Constants from "expo-constants";
import { Platform } from "react-native";

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

  if (configuredValue) {
    candidates.add(configuredValue);
  }

  if (sameOriginApiBaseUrl) {
    candidates.add(sameOriginApiBaseUrl);
  }

  const expoHostUri =
    Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost ?? "";
  const host = expoHostUri.split(":")[0]?.trim();

  if (host) {
    candidates.add(`http://${host}:4000`);
  }

  candidates.add("http://127.0.0.1:4000");

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
