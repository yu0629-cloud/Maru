import { Pressable, ScrollView, Text, View } from "react-native";
import { ChildSwitcher } from "@/src/components/ChildSwitcher";
import { QuotaBadge } from "@/src/components/QuotaBadge";
import { ChildScoped } from "@/src/components/ChildScoped";
import { useDailyReviews } from "@/src/features/review/useDailyReviews";
import { useCurrentChild } from "@/src/hooks/useCurrentChild";
import { useEnsureDemoChild } from "@/src/hooks/useEnsureDemoChild";
import { useQuota } from "@/src/hooks/useQuota";
import { RecentScansSection } from "@/src/features/scans/RecentScansSection";
import { push } from "@/src/lib/nav/href";
import { t, tPlan } from "@/src/i18n";

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
      <Text className="text-2xl font-bold text-ink">{t("home.title")}</Text>
      <Text className="mt-1 text-ink/70">{t("home.subtitle", { name: currentChild?.name ?? t("common.child") })}</Text>

      <View className="mt-4">
        <ChildSwitcher />
      </View>
      <View className="mt-3">
        <QuotaBadge />
      </View>
      <Text className="mt-2 text-xs text-ink/50">
        {t("home.quotaLine", { plan: tPlan(quota.tier), monthly: quota.monthlyRemaining, tickets: quota.ticketBalance })}
      </Text>

      <Pressable className="mt-6 rounded-2xl bg-maru-500 px-4 py-5" onPress={() => push("/(app)/camera")}>
        <Text className="text-center text-lg font-bold text-white">{t("home.scanTitle")}</Text>
        <Text className="mt-1 text-center text-white/80">{t("home.scanHint", { remaining: quota.remaining })}</Text>
      </Pressable>

      <Pressable className="mt-3 rounded-2xl bg-white px-4 py-4" onPress={() => push("/(app)/review")}>
        <Text className="text-center text-lg font-bold text-ink">{t("home.reviewTitle", { count: remainingToday })}</Text>
        <Text className="mt-1 text-center text-sm text-ink/60">{t("home.reviewHint")}</Text>
      </Pressable>

      <Pressable className="mt-3 rounded-2xl bg-white px-4 py-4" onPress={() => push("/(app)/print")}>
        <Text className="text-center text-lg font-bold text-ink">{t("home.printTitle")}</Text>
      </Pressable>

      <Pressable className="mt-3 rounded-2xl bg-white px-4 py-4" onPress={() => push("/(app)/carte")}>
        <Text className="text-center text-lg font-bold text-ink">{t("home.carteTitle")}</Text>
      </Pressable>

      <RecentScansSection />

      <Pressable className="mt-3 mb-8 rounded-2xl bg-white px-4 py-4" onPress={() => push("/(app)/children")}>
        <Text className="text-center text-lg font-bold text-ink">{t("home.childrenTitle")}</Text>
      </Pressable>
    </ScrollView>
  );
}
