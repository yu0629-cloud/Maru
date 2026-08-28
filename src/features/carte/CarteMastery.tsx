import { Pressable, Text, View } from "react-native";
import { useEffect, useMemo, useState } from "react";
import { CarteSubjectCards, CarteSubjectChart } from "@/src/features/carte/CarteSubjectChart";
import { t, tSubject } from "@/src/i18n";
import {
  buildCarteMastery,
  groupSubjects,
  type CarteProblemRow,
  type CarteTabId,
  type SubjectGroup,
  type TopicGroup,
} from "@/src/features/carte/stats";
import { useCurrentChild } from "@/src/hooks/useCurrentChild";
import { EMPTY_TOPIC_MASTERY, useTopicMasteryStore } from "@/src/stores/topicMasteryStore";

function RateBar({ rate, tone = "neutral" }: { rate: number; tone?: "weak" | "strong" | "neutral" | "mastered" }) {
  const fill =
    tone === "strong" || tone === "mastered" ? "bg-emerald-600" : tone === "weak" ? "bg-maru-500" : "bg-ink/40";
  return (
    <View className="mt-2 h-2.5 overflow-hidden rounded-full bg-cream">
      <View className={`h-2.5 rounded-full ${fill}`} style={{ width: `${Math.round(rate * 100)}%` }} />
    </View>
  );
}

function TopicCard({
  group,
  tone,
  expandable,
  showSubject,
  mastered,
  onToggleMastery,
}: {
  group: TopicGroup;
  tone: "weak" | "strong" | "neutral" | "mastered";
  expandable?: boolean;
  showSubject?: boolean;
  mastered?: boolean;
  onToggleMastery?: (group: TopicGroup) => void;
}) {
  const [open, setOpen] = useState(false);
  const body = (
    <>
      <View className="flex-row items-start justify-between">
        <Text className="flex-1 font-bold text-ink">{group.topic}</Text>
        <View className="ml-2 items-end">
          <Text className={`font-bold ${tone === "strong" || tone === "mastered" ? "text-emerald-700" : "text-ink"}`}>
            {Math.round(group.rate * 100)}%
          </Text>
          {showSubject ? (
            <Text className="mt-0.5 text-[11px] text-ink/50">{tSubject(group.subject)}</Text>
          ) : null}
        </View>
      </View>
      {mastered ? (
        <View className="mt-2 self-start rounded-full bg-emerald-100 px-2 py-0.5">
          <Text className="text-[11px] font-semibold text-emerald-800">✅ {t("carte.masteredBadge")}</Text>
        </View>
      ) : null}
      <Text className="mt-1 text-xs text-ink/60">
        {t("common.questionsCount", { correct: group.correct, total: group.total })}
      </Text>
      <RateBar rate={group.rate} tone={tone} />
    </>
  );

  return (
    <View className="mt-3 rounded-2xl bg-white p-4">
      {expandable ? (
        <Pressable accessibilityRole="button" onPress={() => setOpen((value) => !value)}>
          {body}
          <Text className="mt-2 text-xs font-semibold text-maru-600">
            {open ? t("carte.hideMistakes") : t("carte.showMistakes")}
          </Text>
        </Pressable>
      ) : (
        body
      )}
      {onToggleMastery ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={mastered ? t("carte.unmarkMastered") : t("carte.markMastered")}
          accessibilityState={{ checked: Boolean(mastered) }}
          className={`mt-3 self-start rounded-full px-3 py-1.5 ${mastered ? "bg-emerald-600" : "bg-cream"}`}
          onPress={() => onToggleMastery(group)}
        >
          <Text className={`text-xs font-semibold ${mastered ? "text-white" : "text-ink"}`}>
            {mastered ? `✅ ${t("carte.masteredBadge")}` : t("carte.markMastered")}
          </Text>
        </Pressable>
      ) : null}
      {expandable && open ? (
        group.mistakes.length === 0 ? (
          <Text className="mt-3 text-sm text-ink/50">{t("carte.noMistakesLeft")}</Text>
        ) : (
          group.mistakes.map((item: CarteProblemRow) => (
            <View key={item.id} className="mt-3 rounded-xl bg-cream px-3 py-2">
              <Text className="text-xs text-ink/50">{t("common.question", { label: item.problem_label ?? "" })}</Text>
              <Text className="mt-0.5 font-semibold text-ink">{item.question_text || t("carte.noQuestion")}</Text>
              <Text className="mt-1 text-sm text-ink/70">{t("carte.studentAnswer", { answer: item.student_answer || t("common.none") })}</Text>
              <Text className="mt-0.5 text-sm text-ink/70">{t("carte.correctAnswer", { answer: item.correct_answer || t("common.none") })}</Text>
            </View>
          ))
        )
      ) : null}
    </View>
  );
}

function TopicBreakdown({
  mastery,
  showSubject,
  onToggleMastery,
}: {
  mastery: {
    summary: { total: number; correct: number; rate: number };
    strong: TopicGroup[];
    weak: TopicGroup[];
    settling: TopicGroup[];
    mastered: TopicGroup[];
  };
  showSubject: boolean;
  onToggleMastery: (group: TopicGroup) => void;
}) {
  return (
    <>
      <View className="mt-4 rounded-2xl bg-white p-4">
        <Text className="text-sm text-ink/60">{showSubject ? t("carte.summaryAll") : t("carte.summarySubject")}</Text>
        <Text className="mt-1 text-3xl font-bold text-ink">{Math.round(mastery.summary.rate * 100)}%</Text>
        <Text className="mt-1 text-sm text-ink/70">
        {t("common.questionsCount", { correct: mastery.summary.correct, total: mastery.summary.total })}
        </Text>
        <RateBar rate={mastery.summary.rate} tone={mastery.summary.rate >= 0.8 ? "strong" : "weak"} />
      </View>

      <Text className="mt-6 font-bold text-ink">{t("carte.weakTitle")}</Text>
      {mastery.weak.length === 0 ? (
        <Text className="mt-2 text-sm text-ink/50">{t("carte.weakEmpty")}</Text>
      ) : (
        mastery.weak.map((group: TopicGroup) => (
          <TopicCard
            key={group.key}
            group={group}
            tone="weak"
            expandable
            showSubject={showSubject}
            onToggleMastery={onToggleMastery}
          />
        ))
      )}

      <Text className="mt-6 font-bold text-ink">{t("carte.strongTitle")}</Text>
      {mastery.strong.length === 0 ? (
        <Text className="mt-2 text-sm text-ink/50">{t("carte.strongEmpty")}</Text>
      ) : (
        mastery.strong.map((group: TopicGroup) => (
          <TopicCard
            key={group.key}
            group={group}
            tone="strong"
            showSubject={showSubject}
            onToggleMastery={onToggleMastery}
          />
        ))
      )}

      {mastery.settling.length > 0 ? (
        <>
          <Text className="mt-6 font-bold text-ink">{t("carte.settlingTitle")}</Text>
          {mastery.settling.map((group: TopicGroup) => (
            <TopicCard
              key={group.key}
              group={group}
              tone="neutral"
              showSubject={showSubject}
              onToggleMastery={onToggleMastery}
            />
          ))}
        </>
      ) : null}

      <Text className="mt-6 font-bold text-ink">{t("carte.masteredTitle")}</Text>
      {mastery.mastered.length === 0 ? (
        <Text className="mt-2 text-sm text-ink/50">{t("carte.masteredEmpty")}</Text>
      ) : (
        mastery.mastered.map((group: TopicGroup) => (
          <TopicCard
            key={group.key}
            group={group}
            tone="mastered"
            showSubject={showSubject}
            mastered
            onToggleMastery={onToggleMastery}
          />
        ))
      )}
    </>
  );
}

export function CarteMastery({ problems }: { problems: CarteProblemRow[] }) {
  const [tab, setTab] = useState<CarteTabId>("all");
  const { currentChildId } = useCurrentChild();
  const masteryByKey = useTopicMasteryStore((state) =>
    currentChildId ? state.byChild[currentChildId] ?? EMPTY_TOPIC_MASTERY : EMPTY_TOPIC_MASTERY,
  );
  const subjects = useMemo(() => groupSubjects(problems), [problems]);
  const compare = subjects.length >= 2;
  const activeTab: CarteTabId = subjects.length === 1 ? subjects[0].subject : tab;
  const mastery = useMemo(
    () => buildCarteMastery(problems, activeTab, masteryByKey),
    [problems, activeTab, masteryByKey],
  );
  const showUnits = !compare || activeTab !== "all";
  const showSubject = activeTab === "all";

  useEffect(() => {
    void useTopicMasteryStore.getState().hydrate(currentChildId);
  }, [currentChildId]);

  useEffect(() => {
    if (tab !== "all" && !subjects.some((item) => item.subject === tab)) {
      setTab("all");
    }
  }, [subjects, tab]);

  function selectSubject(subject: SubjectGroup["subject"]) {
    if (!compare) {
      setTab(subject);
      return;
    }
    setTab(activeTab === subject ? "all" : subject);
  }

  function onToggleMastery(group: TopicGroup) {
    if (!currentChildId) return;
    void useTopicMasteryStore.getState().toggleMastered(currentChildId, group.subject, group.topic);
  }

  if (problems.length === 0) {
    return (
      <View className="mt-5 rounded-2xl bg-white p-4">
        <Text className="text-base leading-6 text-ink/70">{t("carte.empty")}</Text>
      </View>
    );
  }

  return (
    <View className="mt-5">
      <CarteSubjectChart subjects={subjects} selected={activeTab} onSelect={selectSubject} />
      <CarteSubjectCards subjects={subjects} selected={activeTab} onSelect={selectSubject} />

      {showUnits ? (
        <>
          {compare && activeTab !== "all" ? (
            <Pressable accessibilityRole="button" className="mt-4 self-start" onPress={() => setTab("all")}>
              <Text className="text-xs font-semibold text-maru-600">{t("carte.backToCompare")}</Text>
            </Pressable>
          ) : null}
          <TopicBreakdown mastery={mastery} showSubject={showSubject} onToggleMastery={onToggleMastery} />
        </>
      ) : (
        <Text className="mt-4 text-sm leading-5 text-ink/50">
          {t("carte.tapHint")}
        </Text>
      )}
    </View>
  );
}
