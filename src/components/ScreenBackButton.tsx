import { Pressable, Text } from "react-native";
import { router } from "expo-router";

export function goBackOr(href: string) {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(href);
}

export function ScreenBackButton({
  fallbackHref = "/(app)/print",
  label = "戻る",
}: {
  fallbackHref?: string;
  label?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={12}
      onPress={() => goBackOr(fallbackHref)}
      style={{ paddingHorizontal: 4, paddingVertical: 8 }}
    >
      <Text className="text-base font-semibold text-maru-600">‹ {label}</Text>
    </Pressable>
  );
}
