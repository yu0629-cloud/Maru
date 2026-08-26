import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

export function AnalyzingOverlay({
  visible,
  label = "まるつけしています…",
  detail = "問題枠の抽出とつまずき分析を実行中",
}: {
  visible: boolean;
  label?: string;
  detail?: string;
}) {
  if (!visible) return null;
  return (
    <View pointerEvents="auto" style={[StyleSheet.absoluteFill, { zIndex: 40, elevation: 40 }]} className="items-center justify-center bg-black/70">
      <ActivityIndicator size="large" color="#fff" />
      <Text className="mt-4 text-base font-semibold text-white">{label}</Text>
      <Text className="mt-1 px-8 text-center text-xs text-white/70">{detail}</Text>
    </View>
  );
}
