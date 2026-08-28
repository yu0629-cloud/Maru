import { Pressable, Text } from "react-native";
import { push } from "@/src/lib/nav/href";
import { useQuota } from "@/src/hooks/useQuota";
import { t } from "@/src/i18n";

export function QuotaBadge() {
  const quota = useQuota();
  return (
    <Pressable
      onPress={() => push("/(app)/settings/billing")}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      className="self-start rounded-full bg-white px-3 py-1"
      style={{ zIndex: 2 }}
    >
      <Text className="text-sm font-semibold text-ink">
        {quota.previewTier ? `${t("quota.test")} ` : ""}
        {t("quota.remaining", { count: quota.remaining })}
        {quota.ticketBalance > 0 ? ` ／ ${t("quota.tickets", { count: quota.ticketBalance })}` : ""}
      </Text>
    </Pressable>
  );
}
