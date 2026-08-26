import { Redirect } from "expo-router";
import { useAuth } from "@/src/hooks/useAuth";
import { ActivityIndicator, View } from "react-native";

export default function Index() {
  const { ready, signedIn } = useAuth();

  if (!ready) {
    return (
      <View className="flex-1 items-center justify-center bg-cream">
        <ActivityIndicator color="#C44738" />
      </View>
    );
  }

  if (signedIn) return <Redirect href="/(app)" />;
  return <Redirect href="/(auth)/login" />;
}
