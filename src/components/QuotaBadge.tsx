import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuota } from "@/src/hooks/useQuota";

export function QuotaBadge() {
  const quota = useQuota();
  return (
    <Pressable
      onPress={() => router.push("/(app)/settings/billing")}
      className="self-start rounded-full bg-white px-3 py-1"
    >
      <Text className="text-sm font-semibold text-ink">
        {quota.previewTier ? "テスト " : ""}
        残 {quota.remaining}枚
        {quota.ticketBalance > 0 ? ` ／ チケット ${quota.ticketBalance}` : ""}
      </Text>
    </Pressable>
  );
}
