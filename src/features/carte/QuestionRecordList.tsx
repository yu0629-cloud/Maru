import { Pressable, Text, View } from "react-native";
import { masteryStars, toQuestionRecord } from "@/src/features/review/question-record";
import type { ReviewQueueItem } from "@/src/features/review/select";
import { t } from "@/src/i18n";

export function QuestionRecordList({
  items,
  onMaster,
  onSkip,
  busyId,
}: {
  items: ReviewQueueItem[];
  onMaster: (item: ReviewQueueItem) => void;
  onSkip: (item: ReviewQueueItem) => void;
  busyId?: string | null;
}) {
  const visible = items.filter((item) => item.status !== "mastered" && item.status !== "retired" && item.isArchived !== true && item.is_archived !== true);
  if (visible.length === 0) {
    return <Text className="mt-2 text-sm text-ink/50">{t("carte.recordsEmpty")}</Text>;
  }

  return (
    <View>
      {visible.map((item) => {
        const record = toQuestionRecord(item);
        const busy = busyId === item.id;
        return (
          <View key={item.id} className="mt-3 rounded-2xl bg-white p-4">
            <View className="flex-row items-start justify-between">
              <Text className="flex-1 font-bold text-ink">{record.unit_name || item.label}</Text>
              <Text className="ml-2 text-base text-amber-500">{masteryStars(record.review_stage)}</Text>
            </View>
            <Text className="mt-2 text-sm text-ink">{record.question_text || t("carte.noQuestion")}</Text>
            <Text className="mt-1 text-xs text-ink/50">{t("carte.mistakeCount", { count: record.mistake_count })}</Text>
            <View className="mt-3 flex-row gap-2">
              <Pressable
                disabled={busy}
                accessibilityRole="button"
                className="flex-1 rounded-xl bg-emerald-600 py-2"
                onPress={() => onMaster(item)}
              >
                <Text className="text-center text-xs font-semibold text-white">{t("carte.understood")}</Text>
              </Pressable>
              <Pressable
                disabled={busy}
                accessibilityRole="button"
                className="flex-1 rounded-xl bg-ink/10 py-2"
                onPress={() => onSkip(item)}
              >
                <Text className="text-center text-xs font-semibold text-ink">{t("carte.skip")}</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}
