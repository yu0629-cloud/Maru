import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { push } from "@/src/lib/nav/href";
import { ChildSwitcher } from "@/src/components/ChildSwitcher";
import { ChildScoped } from "@/src/components/ChildScoped";
import { ExpiredMediaNotice } from "@/src/components/ExpiredMediaNotice";
import { useDailyReviews } from "@/src/features/review/useDailyReviews";
import { ReviewPrintList } from "@/src/features/review/ReviewPrintList";
import { useEnsureDemoChild } from "@/src/hooks/useEnsureDemoChild";
import { displayQuestionText } from "@/src/features/print/lib/from-reviews.mjs";
import { PrintScopeToggle } from "@/src/features/print/PrintScopeToggle";
import { usePrintDocument } from "@/src/features/print/usePrintDocument";
import { useCurrentChild } from "@/src/hooks/useCurrentChild";
import { usePrintStore } from "@/src/stores/printStore";
import { useT } from "@/src/i18n";
import { useEffect, useRef } from "react";

export default function ReviewScreen() {
  return (
    <ChildScoped>
      <ReviewBody />
    </ChildScoped>
  );
}

function ReviewBody() {
  useEnsureDemoChild();
  const t = useT();
  const { currentChildId } = useCurrentChild();
  const { daily, recordResult, mocked } = useDailyReviews();
  const { candidates, problems } = usePrintDocument();
  const clearExcluded = usePrintStore((state) => state.clearExcluded);
  const previousChildId = useRef(currentChildId);

  useEffect(() => {
    if (previousChildId.current === currentChildId) return;
    previousChildId.current = currentChildId;
    clearExcluded();
  }, [clearExcluded, currentChildId]);

  function openPrint() {
    if (problems.length === 0) {
      Alert.alert(t("review.noneSelectedTitle"), t("review.noneSelectedBody"));
      return;
    }
    push("/(app)/print");
  }

  return (
    <ScrollView className="flex-1 bg-cream px-5 pt-6">
      <Text className="text-2xl font-bold text-ink">{t("review.title")}</Text>
      <Text className="mt-2 text-ink/70">
        {t("review.subtitle")}
        {mocked ? t("common.sample") : ""}
      </Text>
      <View className="mt-4">
        <ChildSwitcher />
      </View>

      {daily.length > 0 ? (
        <View className="mt-6">
          <Text className="text-lg font-bold text-ink">{t("review.todayAgain")}</Text>
          {daily.map((item) => {
            const stem = displayQuestionText(item.questionText || item.prompt, item.label);
            return (
              <View key={item.id} className={`mt-3 rounded-2xl bg-white p-4 ${item.completed ? "opacity-50" : ""}`}>
                <Text className="font-bold text-ink">
                  {t("common.question", { label: item.label })}
                  {item.topicTag ? `　${item.topicTag}` : ""}
                </Text>
                {stem ? <Text className="mt-2 text-lg font-semibold text-ink">{stem}</Text> : null}
                {item.mediaExpired ? <ExpiredMediaNotice compact /> : null}
                <View className="mt-3 flex-row gap-2">
                  <Pressable
                    className="flex-1 rounded-xl bg-maru-500 py-2"
                    onPress={() => void recordResult(item.id, true)}
                  >
                    <Text className="text-center font-semibold text-white">{t("review.solved")}</Text>
                  </Pressable>
                  <Pressable
                    className="flex-1 rounded-xl bg-ink/10 py-2"
                    onPress={() => void recordResult(item.id, false)}
                  >
                    <Text className="text-center font-semibold text-ink">{t("review.again")}</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      <Text className="mt-8 text-lg font-bold text-ink">{t("review.printProblems")}</Text>
      <PrintScopeToggle />
      <ReviewPrintList candidates={candidates} />

      <Pressable className="mt-6 rounded-xl bg-ink px-4 py-3" onPress={openPrint}>
        <Text className="text-center font-semibold text-white">
          {problems.length > 0
            ? t("review.printSelected", { count: problems.length })
            : t("review.printAll")}
        </Text>
      </Pressable>
      <View className="h-10" />
    </ScrollView>
  );
}
