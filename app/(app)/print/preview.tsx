import { ScrollView, Text, View } from "react-native";
import { ScreenBackButton } from "@/src/components/ScreenBackButton";
import { PrintPreviewSheets } from "@/src/features/print/PreviewSheets";
import { PrintScopeToggle } from "@/src/features/print/PrintScopeToggle";
import { usePrintDocument } from "@/src/features/print/usePrintDocument";
import { useEnsureDemoChild } from "@/src/hooks/useEnsureDemoChild";
import { useT } from "@/src/i18n";

export default function PrintPreviewScreen() {
  useEnsureDemoChild();
  const t = useT();
  const input = usePrintDocument();

  return (
    <ScrollView className="flex-1 bg-cream">
      <View className="px-4 pt-3 pb-2">
        <ScreenBackButton fallbackHref="/(app)/print" />
        <Text className="mt-1 text-xl font-bold text-ink">{t("print.previewTitle")}</Text>
        <Text className="mt-1 text-ink/70">{t("print.previewSubtitle")}</Text>
        <PrintScopeToggle />
      </View>
      <PrintPreviewSheets input={input} />
    </ScrollView>
  );
}
