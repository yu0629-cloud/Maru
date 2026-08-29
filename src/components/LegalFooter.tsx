import { Pressable, Text, View } from "react-native";
import { LEGAL_DOCS, LEGAL_LINK_IDS, openLegalUrl } from "@/src/constants/legal";
import { useT } from "@/src/i18n";

export function LegalLinkList() {
  const t = useT();
  return (
    <View className="mt-6 overflow-hidden rounded-2xl bg-white">
      <Text className="px-4 pb-1 pt-4 text-lg font-bold text-ink">{t("settings.legalTitle")}</Text>
      {LEGAL_LINK_IDS.map((id, index) => (
        <Pressable
          key={id}
          accessibilityRole="link"
          className={`flex-row items-center justify-between px-4 py-4 ${
            index < LEGAL_LINK_IDS.length - 1 ? "border-b border-ink/10" : ""
          }`}
          onPress={() => void openLegalUrl(LEGAL_DOCS[id].url)}
        >
          <Text className="flex-1 pr-3 text-ink">{t(`settings.${id}`)}</Text>
          <Text className="text-ink/30">›</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function LegalFooter() {
  const t = useT();
  return (
    <View className="mt-8 flex-row flex-wrap items-center justify-center">
      {LEGAL_LINK_IDS.map((id, index) => (
        <View key={id} className="flex-row items-center">
          {index > 0 ? <Text className="mx-2 text-ink/30">·</Text> : null}
          <Pressable accessibilityRole="link" onPress={() => void openLegalUrl(LEGAL_DOCS[id].url)}>
            <Text className="text-center text-sm text-ink/50">{t(`settings.${id}`)}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
