import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { theme } from "../constants/theme";

const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: theme.colors.canvas
            },
            headerTintColor: theme.colors.ink,
            headerShadowVisible: false,
            contentStyle: {
              backgroundColor: theme.colors.canvas
            }
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="trips/index" options={{ title: "Trip results" }} />
          <Stack.Screen name="trips/[journeyId]" options={{ title: "Trip detail" }} />
          <Stack.Screen name="stop/[stopId]" options={{ title: "Stop detail" }} />
          <Stack.Screen name="guided/index" options={{ title: "Guided trip" }} />
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
