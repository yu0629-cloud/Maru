import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { ChildSwitcher } from "@/src/components/ChildSwitcher";
import { ChildScoped } from "@/src/components/ChildScoped";
import { useDailyReviews } from "@/src/features/review/useDailyReviews";
import { useEnsureDemoChild } from "@/src/hooks/useEnsureDemoChild";

export default function ReviewScreen() {
  return (
    <ChildScoped>
      <ReviewBody />
    </ChildScoped>
  );
}

function ReviewBody() {
  useEnsureDemoChild();
  const { daily, leeches, belowMin, recordResult, mocked } = useDailyReviews();

  return (
    <ScrollView className="flex-1 bg-cream px-5 pt-6">
      <Text className="text-2xl font-bold text-ink">今日の復習</Text>
      <Text className="mt-2 text-ink/70">
        最大5問・10〜15分。3回連続ミスは要指導リストへ退場します。
        {mocked ? "（モックデータ）" : ""}
      </Text>
      <View className="mt-4">
        <ChildSwitcher />
      </View>

      {belowMin ? (
        <Text className="mt-4 text-sm text-ink/60">今日の出題は少なめです。スキャンが増えると5問に近づきます。</Text>
      ) : null}

      {daily.map((item) => (
        <View key={item.id} className={`mt-4 rounded-2xl bg-white p-4 ${item.completed ? "opacity-50" : ""}`}>
          <Text className="font-bold text-ink">
            問 {item.label}　{item.topicTag}
          </Text>
          <Text className="mt-1 text-xs text-ink/50">連続ミス {item.consecutiveMisses} / 3</Text>
          <View className="mt-3 flex-row gap-2">
            <Pressable
              className="flex-1 rounded-xl bg-maru-500 py-2"
              onPress={() => void recordResult(item.id, true)}
            >
              <Text className="text-center font-semibold text-white">解けた</Text>
            </Pressable>
            <Pressable
              className="flex-1 rounded-xl bg-ink/10 py-2"
              onPress={() => void recordResult(item.id, false)}
            >
              <Text className="text-center font-semibold text-ink">もう一回</Text>
            </Pressable>
          </View>
        </View>
      ))}

      <Pressable className="mt-6 rounded-xl bg-ink px-4 py-3" onPress={() => router.push("/(app)/print")}>
        <Text className="text-center font-semibold text-white">この復習をA4にまとめて印刷</Text>
      </Pressable>

      <Text className="mt-8 text-lg font-bold text-ink">要指導リスト</Text>
      <Text className="mt-1 text-sm text-ink/60">Leech（3回連続ミス）。今日の5枠には入れません。</Text>
      {leeches.length === 0 ? (
        <Text className="mt-3 text-sm text-ink/50">今は隔離中の問題はありません。</Text>
      ) : (
        leeches.map((item) => (
          <View key={item.id} className="mt-3 rounded-2xl border border-maru-500/30 bg-white p-4">
            <Text className="font-bold text-maru-600">
              {item.label}　{item.topicTag}
            </Text>
            <Text className="mt-2 text-sm leading-5 text-ink/80">{item.parentCoachingTip}</Text>
          </View>
        ))
      )}
      <View className="h-10" />
    </ScrollView>
  );
}
