import "../global.css";
import { View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthSessionBootstrap } from "@/src/features/auth/AuthBootstrap";
import { I18nProvider } from "@/src/i18n";

export default function RootLayout() {
  return (
    <I18nProvider>
      <View style={{ flex: 1 }} collapsable={false}>
        <StatusBar style="dark" />
        <AuthSessionBootstrap />
        <Stack
          screenOptions={{
            headerShown: false,
            gestureEnabled: false,
            fullScreenGestureEnabled: false,
            animation: "none",
            animationDuration: 0,
          }}
        >
          <Stack.Screen name="(app)" options={{ gestureEnabled: false, fullScreenGestureEnabled: false }} />
          <Stack.Screen name="onboarding" options={{ gestureEnabled: false, fullScreenGestureEnabled: false }} />
        </Stack>
      </View>
    </I18nProvider>
  );
}
