import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { ChildSwitcher } from "@/src/components/ChildSwitcher";
import { QuotaBadge } from "@/src/components/QuotaBadge";
import { ChildScoped } from "@/src/components/ChildScoped";
import { useDailyReviews } from "@/src/features/review/useDailyReviews";
import { useCurrentChild } from "@/src/hooks/useCurrentChild";
import { useEnsureDemoChild } from "@/src/hooks/useEnsureDemoChild";
import { useQuota } from "@/src/hooks/useQuota";

export default function HomeScreen() {
  return (
    <ChildScoped>
      <HomeBody />
    </ChildScoped>
  );
}

function HomeBody() {
  useEnsureDemoChild();
  const { currentChild } = useCurrentChild();
  const quota = useQuota();
  const { daily } = useDailyReviews();
  const remainingToday = daily.filter((item) => !item.completed).length;

  return (
    <ScrollView className="flex-1 bg-cream px-5 pt-5">
      <Text className="text-2xl font-bold text-ink">今日の家庭学習</Text>
      <Text className="mt-1 text-ink/70">{currentChild?.name ?? "子ども"}の丸付け・復習・印刷</Text>

      <View className="mt-4">
        <ChildSwitcher />
      </View>
      <View className="mt-3">
        <QuotaBadge />
      </View>
      <Text className="mt-2 text-xs text-ink/50">
        {quota.label}　月次残 {quota.monthlyRemaining}　チケット {quota.ticketBalance}
      </Text>

      <Pressable className="mt-6 rounded-2xl bg-maru-500 px-4 py-5" onPress={() => router.push("/(app)/camera")}>
        <Text className="text-center text-lg font-bold text-white">プリントを撮影して丸付け</Text>
        <Text className="mt-1 text-center text-white/80">連続で撮って、裏で丸付けします。残 {quota.remaining}枚</Text>
      </Pressable>

      <Pressable className="mt-3 rounded-2xl bg-white px-4 py-4" onPress={() => router.push("/(app)/review")}>
        <Text className="text-center text-lg font-bold text-ink">今日の復習（{remainingToday}問）</Text>
        <Text className="mt-1 text-center text-sm text-ink/60">最大5問。Leech は要指導リストへ</Text>
      </Pressable>

      <Pressable className="mt-3 rounded-2xl bg-white px-4 py-4" onPress={() => router.push("/(app)/print")}>
        <Text className="text-center text-lg font-bold text-ink">A4まとめプリント印刷</Text>
      </Pressable>

      <Pressable className="mt-3 rounded-2xl bg-white px-4 py-4" onPress={() => router.push("/(app)/carte")}>
        <Text className="text-center text-lg font-bold text-ink">生徒カルテ</Text>
      </Pressable>

      <Pressable className="mt-3 mb-8 rounded-2xl bg-white px-4 py-4" onPress={() => router.push("/(app)/children")}>
        <Text className="text-center text-lg font-bold text-ink">子どもを追加・切り替え</Text>
      </Pressable>
    </ScrollView>
  );
}
