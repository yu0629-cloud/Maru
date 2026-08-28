import { Text, View } from "react-native";
import { t } from "@/src/i18n";

export function PaywallCarryoverNote() {
  return (
    <View className="mt-4 rounded-2xl bg-white px-4 py-4">
      <Text className="text-sm leading-6 text-ink/80">{t("billing.freeCarryover")}</Text>
    </View>
  );
}
