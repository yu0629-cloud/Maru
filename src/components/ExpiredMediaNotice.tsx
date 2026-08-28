import { Text, View } from "react-native";
import { EXPIRED_IMAGE_MESSAGE } from "@/src/features/storage/retention";
import { t } from "@/src/i18n";

export { EXPIRED_IMAGE_MESSAGE };

export function ExpiredMediaNotice({ compact = false }: { compact?: boolean }) {
  return (
    <View className={`items-center justify-center rounded-2xl bg-white ${compact ? "px-2 py-3" : "mt-4 px-4 py-6"}`}>
      <Text className={`text-center leading-5 text-ink/70 ${compact ? "text-xs" : "text-sm"}`}>
        {t("history.expiredNotice")}
      </Text>
    </View>
  );
}
