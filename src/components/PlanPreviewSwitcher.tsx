import { Pressable, Text, View } from "react-native";
import { setPlanPreview } from "@/src/features/billing/preview";
import { canPreviewPlans } from "@/src/lib/env";
import { useQuotaStore } from "@/src/stores/quotaStore";
import type { SubscriptionTier } from "@/src/types/database";
import { tPlan, useT } from "@/src/i18n";

const OPTIONS: SubscriptionTier[] = ["free", "standard", "family"];

export function PlanPreviewSwitcher() {
  const t = useT();
  const previewTier = useQuotaStore((state) => state.previewTier);
  const tier = useQuotaStore((state) => state.tier);
  if (!canPreviewPlans()) return null;

  return (
    <View className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-4">
      <Text className="font-bold text-ink">{t("debug.planTitle")}</Text>
      <Text className="mt-1 text-xs text-ink/70">{t("debug.planHint")}</Text>
      <View className="mt-3 flex-row">
        {OPTIONS.map((option) => {
          const selected = tier === option;
          return (
            <Pressable
              key={option}
              className={`mr-2 flex-1 rounded-xl py-2 ${selected ? "bg-maru-500" : "bg-white"}`}
              onPress={() => void setPlanPreview(option)}
            >
              <Text className={`text-center text-xs font-semibold ${selected ? "text-white" : "text-ink"}`}>
                {tPlan(option)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable className="mt-3 rounded-xl bg-white py-2" onPress={() => void setPlanPreview(null)}>
        <Text className="text-center text-sm font-semibold text-ink">
          {previewTier ? t("debug.planReset") : t("debug.planLive")}
        </Text>
      </Pressable>
    </View>
  );
}
