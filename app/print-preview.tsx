import { ScrollView, Text, View } from "react-native";
import { chooseAnswerStyle } from "@/src/features/print/html";
import { MOCK_PRINT_PROBLEMS, mockPrintDocumentInput } from "@/src/features/print/mock";
import { PrintPreviewSheets } from "@/src/features/print/PreviewSheets";
import { useT } from "@/src/i18n";

export default function PublicPrintPreviewScreen() {
  const t = useT();
  const input = {
    ...mockPrintDocumentInput(),
    problems: MOCK_PRINT_PROBLEMS.map((problem) => ({
      ...problem,
      answerStyle: chooseAnswerStyle(problem),
    })),
  };

  return (
    <ScrollView className="flex-1 bg-cream">
      <View className="px-5 pt-7 pb-3">
        <Text className="text-2xl font-bold text-ink">{t("print.publicTitle")}</Text>
        <Text className="mt-2 text-ink/70">{t("print.publicSubtitle")}</Text>
      </View>
      <PrintPreviewSheets input={input} />
    </ScrollView>
  );
}
