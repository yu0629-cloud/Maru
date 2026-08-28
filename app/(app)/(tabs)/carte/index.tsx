import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { ChildSwitcher } from "@/src/components/ChildSwitcher";
import { ChildScoped } from "@/src/components/ChildScoped";
import { RecentScansSection } from "@/src/features/scans/RecentScansSection";
import { CarteMastery } from "@/src/features/carte/CarteMastery";
import { useCarte } from "@/src/hooks/useCarte";
import { useEnsureDemoChild } from "@/src/hooks/useEnsureDemoChild";
import type { LeechAction } from "@/src/features/review/leech";
import type { ReviewQueueItem } from "@/src/features/review/select";
import { push } from "@/src/lib/nav/href";
import { tSubjectBadge, useT } from "@/src/i18n";

function ActionGlyph({ glyph, tone }: { glyph: string; tone: "green" | "blue" }) {
  return (
    <View
      className={`mr-1.5 h-5 w-5 items-center justify-center rounded-full ${
        tone === "green" ? "bg-white/25" : "bg-white/20"
      }`}
    >
      <Text className="text-[11px] font-bold text-white">{glyph}</Text>
    </View>
  );
}

export default function CarteScreen() {
  return (
    <ChildScoped>
      <CarteBody />
    </ChildScoped>
  );
}

function CarteBody() {
  useEnsureDemoChild();
  const t = useT();
  const { child, carte, problems, leeches, resolveLeech, mocked } = useCarte();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function run(item: ReviewQueueItem, action: LeechAction) {
    setBusyId(item.id);
    try {
      await resolveLeech(item, action);
    } catch (error) {
      Alert.alert(t("carte.updateFailed"), error instanceof Error ? error.message : t("common.unknown"));
    } finally {
      setBusyId(null);
    }
  }

  function confirmMaster(item: ReviewQueueItem) {
    Alert.alert(t("carte.confirmMasterTitle"), t("carte.confirmMasterBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("carte.clear"), onPress: () => void run(item, "master") },
    ]);
  }

  return (
    <ScrollView className="flex-1 bg-cream px-5 pt-5">
      <Text className="text-2xl font-bold text-ink">{t("carte.title")}</Text>
      <Text className="mt-1 text-ink/70">
        {t("carte.subtitle", { name: child?.name ?? t("common.child") })}
        {mocked ? t("common.mock") : ""}
      </Text>
      <View className="mt-4">
        <ChildSwitcher />
      </View>

      <CarteMastery problems={problems ?? []} />

      <Pressable className="mt-4 rounded-2xl bg-white px-4 py-4" onPress={() => push("/(app)/scans")}>
        <Text className="text-center text-lg font-bold text-ink">{t("carte.historyTitle")}</Text>
        <Text className="mt-1 text-center text-sm text-ink/60">{t("carte.historyHint")}</Text>
      </Pressable>

      <RecentScansSection />

      {problems.length > 0 ? (
        <View className="mt-5 rounded-2xl bg-white p-4">
          <Text className="font-bold text-ink">{t("carte.carelessTitle")}</Text>
          {problems.some((row) => !row.is_correct) ? (
            <Text className="mt-1 text-ink/70">{t("carte.carelessRate", { rate: Math.round(carte.careless_rate * 100) })}</Text>
          ) : (
            <Text className="mt-1 text-ink/70">{t("carte.noIncorrect")}</Text>
          )}
          {carte.recent_rates.length > 0 ? (
            <>
              <Text className="mt-3 text-sm text-ink/60">{t("carte.recentRates")}</Text>
              <View className="mt-2 flex-row items-end gap-2">
                {carte.recent_rates.map((rate, index) => (
                  <View key={index} className="w-8 items-center">
                    <View className="w-4 rounded-t bg-maru-500" style={{ height: 8 + rate * 48 }} />
                    <Text className="mt-1 text-[10px] text-ink/50">{Math.round(rate * 100)}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}
        </View>
      ) : null}

      <Text className="mt-6 font-bold text-ink">{t("carte.leechTitle")}</Text>
      <Text className="mt-1 text-sm text-ink/60">{t("carte.leechHint")}</Text>
      {leeches.length === 0 ? (
        <Text className="mt-2 text-sm text-ink/50">{t("carte.leechEmpty")}</Text>
      ) : (
        leeches.map((item) => (
          <View key={item.id} className="mt-3 rounded-2xl bg-white p-4">
            <Text className="font-bold text-ink">
              {item.subject ? `${tSubjectBadge(item.subject)}　` : ""}
              {item.label}　{item.topicTag}
            </Text>
            <Text className="mt-2 text-sm text-ink/70">{item.parentCoachingTip}</Text>
            <View className="mt-3 flex-row gap-2">
              <Pressable
                disabled={busyId === item.id}
                className="flex-1 flex-row items-center justify-center rounded-xl bg-emerald-600 py-2.5"
                onPress={() => confirmMaster(item)}
              >
                <ActionGlyph glyph="✓" tone="green" />
                <Text className="text-center text-xs font-semibold text-white">{t("carte.mastered")}</Text>
              </Pressable>
              <Pressable
                disabled={busyId === item.id}
                className="flex-1 flex-row items-center justify-center rounded-xl bg-sky-600 py-2.5"
                onPress={() => void run(item, "requeue")}
              >
                <ActionGlyph glyph="↻" tone="blue" />
                <Text className="text-center text-xs font-semibold text-white">{t("carte.requeue")}</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
      <View className="h-10" />
    </ScrollView>
  );
}
