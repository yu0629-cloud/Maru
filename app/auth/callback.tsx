import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { createSessionFromUrl } from "@/src/features/auth/service";
import * as Linking from "expo-linking";

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams();

  useEffect(() => {
    void (async () => {
      const url = await Linking.getInitialURL();
      if (url) await createSessionFromUrl(url);
      router.replace(params.error ? "/(auth)/login" : "/(app)");
    })();
  }, [params.error]);

  return (
    <View className="flex-1 items-center justify-center bg-cream">
      <ActivityIndicator color="#C44738" />
    </View>
  );
}
