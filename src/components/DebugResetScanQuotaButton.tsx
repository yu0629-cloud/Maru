import { useState } from "react";
import { Alert, Pressable, Text } from "react-native";
import { resetFreeScanQuotaForDebug } from "@/src/features/billing/reset-free-scans";
import { canPreviewPlans } from "@/src/lib/env";
import { useT } from "@/src/i18n";

export function DebugResetScanQuotaButton() {
  const t = useT();
  const [busy, setBusy] = useState(false);
  if (!canPreviewPlans()) return null;

  async function onPress() {
    if (busy) return;
    setBusy(true);
    try {
      await resetFreeScanQuotaForDebug();
      Alert.alert(t("debug.quotaResetDone"));
    } catch (error) {
      Alert.alert(t("debug.quotaResetFail"), error instanceof Error ? error.message : t("common.tryAgain"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Pressable
      className="mb-10 mt-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-4"
      disabled={busy}
      onPress={() => void onPress()}
    >
      <Text className="text-center font-bold text-ink">
        {busy ? t("debug.quotaResetBusy") : t("debug.quotaReset")}
      </Text>
      <Text className="mt-1 text-center text-xs text-ink/60">{t("debug.quotaResetHint")}</Text>
    </Pressable>
  );
}
