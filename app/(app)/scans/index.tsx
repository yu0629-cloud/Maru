import { ScrollView, Text, View } from "react-native";
import { ChildSwitcher } from "@/src/components/ChildSwitcher";
import { ChildScoped } from "@/src/components/ChildScoped";
import { ScanHistoryCard } from "@/src/components/ScanHistoryCard";
import { useScanHistory } from "@/src/features/storage/useScanHistory";
import { useEnsureDemoChild } from "@/src/hooks/useEnsureDemoChild";
import { push } from "@/src/lib/nav/href";
import { useT } from "@/src/i18n";

export default function ScanHistoryScreen() {
  return (
    <ChildScoped>
      <ScanHistoryBody />
    </ChildScoped>
  );
}

function ScanHistoryBody() {
  useEnsureDemoChild();
  const t = useT();
  const { items } = useScanHistory();

  return (
    <ScrollView className="flex-1 bg-cream px-5 pt-3">
      <Text className="text-2xl font-bold text-ink">{t("history.title")}</Text>
      <Text className="mt-2 text-ink/70">{t("history.subtitle")}</Text>
      <View className="mt-4">
        <ChildSwitcher />
      </View>
      {items.length === 0 ? (
        <Text className="mt-5 rounded-2xl bg-white px-4 py-3 text-sm text-ink/70">
          {t("history.empty")}
        </Text>
      ) : (
        <View className="mt-4 flex-row flex-wrap justify-between">
          {items.map((scan) => (
            <View key={scan.id} className="mb-3" style={{ width: "48.5%" }}>
              <ScanHistoryCard
                scan={scan}
                layout="grid"
                onPress={() => push(`/(app)/scan/${scan.id}?from=history`)}
              />
            </View>
          ))}
        </View>
      )}
      <View className="h-10" />
    </ScrollView>
  );
}
