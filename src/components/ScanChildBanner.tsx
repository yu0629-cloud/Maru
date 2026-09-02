import { Pressable, Text, View } from "react-native";
import { useCurrentChild } from "@/src/hooks/useCurrentChild";
import type { ScanRecord } from "@/src/stores/scanStore";
import { t } from "@/src/i18n";

export function ScanChildBanner({
  scan,
  onChangeChild,
}: {
  scan: ScanRecord;
  onChangeChild: () => void;
}) {
  const { children } = useCurrentChild();
  if (children.length <= 1) return null;

  const assigned = children.find((child) => child.id === scan.childId);
  const name = assigned?.name || scan.childDetection?.detected_child_name || t("common.child");
  const detection = scan.childDetection;
  const autoMatched = Boolean(detection?.matched) &&
    (!detection?.detected_child_id || detection.detected_child_id === scan.childId);
  const title = autoMatched
    ? t("scan.detectedChild", { name })
    : detection?.fallback && !detection.detected_child_name
      ? t("scan.detectedChildFallback", { name })
      : t("scan.detectedChild", { name });
  const reason = detection?.confidence_reason?.trim();

  return (
    <View className="mt-3 rounded-2xl bg-white px-4 py-3">
      <Text className="text-base font-semibold text-ink">{title}</Text>
      {reason ? <Text className="mt-1 text-sm text-ink/60">{reason}</Text> : null}
      <Pressable className="mt-3 self-start rounded-xl bg-ink/10 px-3 py-2" onPress={onChangeChild}>
        <Text className="font-semibold text-ink">{t("scan.changeChild")}</Text>
      </Pressable>
    </View>
  );
}
