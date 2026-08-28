import { Redirect } from "expo-router";
import { href } from "@/src/lib/nav/href";
import { useAuth } from "@/src/hooks/useAuth";
import { ActivityIndicator, View } from "react-native";
import { usePrefsStore } from "@/src/stores/prefsStore";

export default function Index() {
  const { ready, signedIn } = useAuth();
  const prefsReady = usePrefsStore((state) => state.ready);
  const onboardingDone = usePrefsStore((state) => state.onboardingDone);

  if (!ready || !prefsReady) {
    return (
      <View className="flex-1 items-center justify-center bg-cream">
        <ActivityIndicator color="#C44738" />
      </View>
    );
  }

  if (!onboardingDone) return <Redirect href={href("/onboarding")} />;
  if (signedIn) return <Redirect href={href("/(app)")} />;
  return <Redirect href={href("/(auth)/login")} />;
}
