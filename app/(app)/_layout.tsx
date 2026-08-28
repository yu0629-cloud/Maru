import { useAuth } from "@/src/hooks/useAuth";
import { Redirect, Stack } from "expo-router";
import { href } from "@/src/lib/nav/href";
import { ActivityIndicator, View } from "react-native";
import { AccountRuntime } from "@/src/features/session/AccountRuntime";
import { ScreenBackButton } from "@/src/components/ScreenBackButton";
import { useT } from "@/src/i18n";
import { usePrefsStore } from "@/src/stores/prefsStore";

export const unstable_settings = {
  initialRouteName: "(tabs)",
};

export default function AppLayout() {
  const { ready, signedIn } = useAuth();
  const t = useT();
  const onboardingDone = usePrefsStore((state) => state.onboardingDone);

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-cream">
        <ActivityIndicator color="#C44738" />
      </View>
    );
  }

  if (!onboardingDone) {
    return <Redirect href={href("/onboarding")} />;
  }

  if (!signedIn) {
    return <Redirect href={href("/(auth)/login")} />;
  }

  return (
    <AccountRuntime>
      <Stack
        screenOptions={{
          headerShown: true,
          headerTintColor: "#C44738",
          headerStyle: { backgroundColor: "#F7F4EE" },
          headerShadowVisible: false,
          headerTitleStyle: { color: "#0F172A", fontWeight: "700" },
          contentStyle: { backgroundColor: "#F7F4EE" },
          gestureEnabled: true,
          fullScreenGestureEnabled: false,
          animation: "none",
          animationDuration: 0,
          freezeOnBlur: true,
        }}
      >
        <Stack.Screen
          name="(tabs)"
          options={{
            headerShown: false,
            gestureEnabled: false,
            fullScreenGestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="settings/billing"
          options={{
            title: t("nav.billing"),
            headerLeft: () => <ScreenBackButton fallbackHref="/(app)/settings" />,
          }}
        />
        <Stack.Screen
          name="settings/devices"
          options={{
            title: t("nav.devices"),
            headerLeft: () => <ScreenBackButton fallbackHref="/(app)/settings" />,
          }}
        />
        <Stack.Screen
          name="settings/legal/[doc]"
          options={{
            title: t("nav.legal"),
            headerLeft: () => <ScreenBackButton fallbackHref="/(app)/settings" />,
          }}
        />
        <Stack.Screen
          name="children/index"
          options={{
            title: t("nav.children"),
            headerLeft: () => <ScreenBackButton fallbackHref="/(app)/settings" />,
          }}
        />
        <Stack.Screen
          name="scans/index"
          options={{
            title: t("nav.history"),
            headerLeft: () => <ScreenBackButton fallbackHref="/(app)" />,
          }}
        />
        <Stack.Screen
          name="scan/batch"
          options={{
            title: t("nav.batch"),
            headerLeft: () => <ScreenBackButton fallbackHref="/(app)/camera" />,
          }}
        />
        <Stack.Screen
          name="scan/[id]"
          options={({ route }) => {
            const from = (route.params as { from?: string } | undefined)?.from;
            return {
              title: t("nav.result"),
              headerLeft: () => (
                <ScreenBackButton
                  fallbackHref={from === "history" ? "/(app)/scans" : "/(app)/scan/batch"}
                />
              ),
            };
          }}
        />
        <Stack.Screen
          name="print/index"
          options={{
            title: t("nav.print"),
            headerLeft: () => <ScreenBackButton fallbackHref="/(app)/review" />,
          }}
        />
        <Stack.Screen
          name="print/preview"
          options={{
            title: t("nav.preview"),
            headerLeft: () => <ScreenBackButton fallbackHref="/(app)/print" />,
          }}
        />
      </Stack>
    </AccountRuntime>
  );
}
