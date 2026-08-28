import { Pressable, Text } from "react-native";
import { router, type Href } from "expo-router";
import { href } from "@/src/lib/nav/href";
import { t } from "@/src/i18n";

export function goBackOr(path: string) {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(href(path));
}

export function ScreenBackButton({
  fallbackHref = "/(app)/print",
  label,
}: {
  fallbackHref?: Href | string;
  label?: string;
}) {
  const text = label ?? t("common.back");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={text}
      hitSlop={12}
      onPress={() => goBackOr(String(fallbackHref))}
      style={{ paddingHorizontal: 4, paddingVertical: 8, zIndex: 2 }}
    >
      <Text className="text-base font-semibold text-maru-600">‹ {text}</Text>
    </Pressable>
  );
}
