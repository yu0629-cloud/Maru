import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { ChildSwitcher } from "@/src/components/ChildSwitcher";
import { ChildScoped } from "@/src/components/ChildScoped";
import { useCarte } from "@/src/hooks/useCarte";
import { useEnsureDemoChild } from "@/src/hooks/useEnsureDemoChild";
import type { LeechAction } from "@/src/features/review/leech";
import type { ReviewQueueItem } from "@/src/features/review/select";

function RateBar({ rate }: { rate: number }) {
  return (
    <View className="mt-2 h-3 overflow-hidden rounded-full bg-white">
      <View className="h-3 rounded-full bg-maru-500" style={{ width: `${Math.round(rate * 100)}%` }} />
    </View>
  );
}

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
  const { child, carte, leeches, resolveLeech, mocked } = useCarte();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function run(item: ReviewQueueItem, action: LeechAction) {
    setBusyId(item.id);
    try {
      await resolveLeech(item, action);
    } catch (error) {
      Alert.alert("更新に失敗しました", error instanceof Error ? error.message : "unknown");
    } finally {
      setBusyId(null);
    }
  }

  function confirmMaster(item: ReviewQueueItem) {
    Alert.alert(
      "理解できたとしてクリアしますか？",
      "要指導リストから外し、マスター済みにします。苦手単元のスコアも再集計します。",
      [
        { text: "キャンセル", style: "cancel" },
        { text: "クリアする", onPress: () => void run(item, "master") },
      ],
    );
  }

  return (
    <ScrollView className="flex-1 bg-cream px-5 pt-5">
      <Text className="text-2xl font-bold text-ink">生徒カルテ</Text>
      <Text className="mt-1 text-ink/70">
        {child?.name ?? "子ども"}の定着とつまずき
        {mocked ? "（モック）" : ""}
      </Text>
      <View className="mt-4">
        <ChildSwitcher />
      </View>

      <View className="mt-5 rounded-2xl bg-white p-4">
        <Text className="text-sm text-ink/60">基礎定着率</Text>
        <Text className="mt-1 text-3xl font-bold text-ink">{Math.round(carte.foundation_rate * 100)}%</Text>
        <RateBar rate={carte.foundation_rate} />
        <Text className="mt-3 text-sm leading-5 text-ink/70">{carte.summary}</Text>
      </View>

      <Text className="mt-6 font-bold text-ink">苦手単元（正答率60%未満）</Text>
      <View className="mt-2 flex-row flex-wrap gap-2">
        {carte.weak_units.length === 0 ? (
          <Text className="text-sm text-ink/50">いま苦手単元はありません。</Text>
        ) : (
          carte.weak_units.map((unit) => (
            <View key={unit.unit} className="rounded-full bg-maru-500 px-3 py-1">
              <Text className="text-xs font-semibold text-white">
                {unit.unit} {Math.round(unit.rate * 100)}%
              </Text>
            </View>
          ))
        )}
      </View>

      <Text className="mt-5 font-bold text-ink">得意単元</Text>
      <View className="mt-2 flex-row flex-wrap gap-2">
        {carte.strong_units.map((unit) => (
          <View key={unit.unit} className="rounded-full bg-white px-3 py-1">
            <Text className="text-xs text-ink">
              {unit.unit} {Math.round(unit.rate * 100)}%
            </Text>
          </View>
        ))}
      </View>

      <View className="mt-5 rounded-2xl bg-white p-4">
        <Text className="font-bold text-ink">ケアレスミス傾向</Text>
        <Text className="mt-1 text-ink/70">不正解のうち {Math.round(carte.careless_rate * 100)}% がケアレスです。</Text>
        <Text className="mt-3 text-sm text-ink/60">直近の正答率</Text>
        <View className="mt-2 flex-row items-end gap-2">
          {carte.recent_rates.map((rate, index) => (
            <View key={index} className="w-8 items-center">
              <View className="w-4 rounded-t bg-maru-500" style={{ height: 8 + rate * 48 }} />
              <Text className="mt-1 text-[10px] text-ink/50">{Math.round(rate * 100)}</Text>
            </View>
          ))}
        </View>
      </View>

      <Text className="mt-6 font-bold text-ink">要指導リスト（Leech）</Text>
      <Text className="mt-1 text-sm text-ink/60">親が「理解できた」か「もう一度復習」を選べます。</Text>
      {leeches.length === 0 ? (
        <Text className="mt-2 text-sm text-ink/50">3回連続ミスの問題はありません。</Text>
      ) : (
        leeches.map((item) => (
          <View key={item.id} className="mt-3 rounded-2xl bg-white p-4">
            <Text className="font-bold text-ink">
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
                <Text className="text-center text-xs font-semibold text-white">理解できた（クリア）</Text>
              </Pressable>
              <Pressable
                disabled={busyId === item.id}
                className="flex-1 flex-row items-center justify-center rounded-xl bg-sky-600 py-2.5"
                onPress={() => void run(item, "requeue")}
              >
                <ActionGlyph glyph="↻" tone="blue" />
                <Text className="text-center text-xs font-semibold text-white">もう一度復習する</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
      <View className="h-10" />
    </ScrollView>
  );
}
