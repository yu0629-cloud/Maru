import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { t } from "@/src/i18n";

export function AnalyzingOverlay({
  visible,
  label,
  detail,
}: {
  visible: boolean;
  label?: string;
  detail?: string;
}) {
  if (!visible) return null;
  return (
    <View pointerEvents={visible ? "auto" : "none"} style={[StyleSheet.absoluteFill, { zIndex: 20, elevation: 20 }]} className="items-center justify-center bg-black/70">
      <ActivityIndicator size="large" color="#fff" />
      <Text className="mt-4 text-base font-semibold text-white">{label ?? t("camera.overlayLabel")}</Text>
      <Text className="mt-1 px-8 text-center text-xs text-white/70">{detail ?? t("camera.overlayDetail")}</Text>
    </View>
  );
}
