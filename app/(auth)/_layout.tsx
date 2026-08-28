import { useAuth } from "@/src/hooks/useAuth";
import { Redirect, Stack } from "expo-router";
import { href } from "@/src/lib/nav/href";
import { ActivityIndicator, View } from "react-native";
import { usePrefsStore } from "@/src/stores/prefsStore";

export default function AuthLayout() {
  const { ready, signedIn } = useAuth();
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

  if (signedIn) {
    return <Redirect href={href("/(app)")} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        fullScreenGestureEnabled: false,
        animation: "none",
      }}
    />
  );
}
