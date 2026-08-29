import { Pressable, ScrollView, Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { LEGAL_DOCS, openLegalUrl, type LegalDocId } from "@/src/constants/legal";
import { useT } from "@/src/i18n";

export default function LegalDocScreen() {
  const t = useT();
  const { doc } = useLocalSearchParams<{ doc: LegalDocId }>();
  const content = LEGAL_DOCS[doc] ?? LEGAL_DOCS.terms;
  const url = content.url;

  return (
    <ScrollView className="flex-1 bg-cream px-5 pt-5">
      <Text className="text-2xl font-bold text-ink">{content.title}</Text>
      {url ? (
        <Pressable
          accessibilityRole="link"
          className="mt-3 rounded-2xl bg-white px-4 py-4"
          onPress={() => void openLegalUrl(url)}
        >
          <Text className="text-center font-bold text-maru-600">{t("common.openInBrowser")}</Text>
        </Pressable>
      ) : null}
      <Text className="mt-4 mb-10 text-base leading-7 text-ink">{content.body}</Text>
    </ScrollView>
  );
}
