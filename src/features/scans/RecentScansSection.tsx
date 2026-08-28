import { Pressable, Text, View } from "react-native";
import { ScanHistoryCard } from "@/src/components/ScanHistoryCard";
import { useScanHistory } from "@/src/features/storage/useScanHistory";
import { push } from "@/src/lib/nav/href";
import { t } from "@/src/i18n";

export function RecentScansSection({ limit = 4 }: { limit?: number }) {
  const { items } = useScanHistory();
  const preview = items.slice(0, limit);

  return (
    <View className="mt-6">
      <View className="flex-row items-end justify-between">
        <Text className="text-lg font-bold text-ink">{t("history.recentTitle")}</Text>
        <Pressable onPress={() => push("/(app)/scans")}>
          <Text className="text-sm font-semibold text-maru-600">{t("history.seeAll")}</Text>
        </Pressable>
      </View>
      {preview.length === 0 ? (
        <Text className="mt-3 rounded-2xl bg-white px-4 py-3 text-sm text-ink/70">
          {t("history.recentEmpty")}
        </Text>
      ) : (
        <View className="mt-3 flex-row flex-wrap justify-between">
          {preview.map((scan) => (
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
    </View>
  );
}
