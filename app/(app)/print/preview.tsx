import { ScrollView, Text, View } from "react-native";
import { ScreenBackButton } from "@/src/components/ScreenBackButton";
import { PrintPreviewSheets } from "@/src/features/print/PreviewSheets";
import { usePrintDocument } from "@/src/features/print/usePrintDocument";
import { useEnsureDemoChild } from "@/src/hooks/useEnsureDemoChild";

export default function PrintPreviewScreen() {
  useEnsureDemoChild();
  const input = usePrintDocument();

  return (
    <ScrollView className="flex-1 bg-cream">
      <View className="px-4 pt-3 pb-2">
        <ScreenBackButton fallbackHref="/(app)/print" />
        <Text className="mt-1 text-xl font-bold text-ink">A4縦プレビュー</Text>
        <Text className="mt-1 text-ink/70">間違えた問題の切り抜きです。なまえと日付は印字済みです。</Text>
      </View>
      <PrintPreviewSheets input={input} />
    </ScrollView>
  );
}
