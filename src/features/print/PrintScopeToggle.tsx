import { Pressable, Text, View } from "react-native";
import { usePrintStore, type PrintProblemScope } from "@/src/stores/printStore";
import { t } from "@/src/i18n";

export function PrintScopeToggle() {
  const scope = usePrintStore((state) => state.scope);
  const setScope = usePrintStore((state) => state.setScope);
  const options: Array<{ id: PrintProblemScope; label: string; hint: string }> = [
    { id: "today", label: t("review.scopeToday"), hint: t("review.scopeTodayHint") },
    { id: "recommended", label: t("review.scopeRecommended"), hint: t("review.scopeRecommendedHint") },
  ];

  return (
    <View className="mt-4">
      <Text className="text-sm font-bold text-ink">{t("review.scopeTitle")}</Text>
      <View className="mt-2 flex-row">
        {options.map((option) => {
          const selected = scope === option.id || (scope === "daily" && option.id === "recommended") || (scope === "all" && option.id === "today");
          return (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={`mr-2 flex-1 rounded-xl px-2 py-2 ${selected ? "bg-maru-500" : "bg-white"}`}
              onPress={() => setScope(option.id)}
            >
              <Text className={`text-center text-xs font-semibold ${selected ? "text-white" : "text-ink"}`}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text className="mt-2 text-xs text-ink/60">{options.find((option) => option.id === scope || (scope === "daily" && option.id === "recommended") || (scope === "all" && option.id === "today"))?.hint}</Text>
    </View>
  );
}
