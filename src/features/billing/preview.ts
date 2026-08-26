import AsyncStorage from "@react-native-async-storage/async-storage";
import type { SubscriptionTier } from "@/src/types/database";
import { useAuthStore } from "@/src/stores/authStore";
import { useQuotaStore } from "@/src/stores/quotaStore";
import { refreshProfileQuota } from "@/src/lib/revenuecat/sync";

const PREVIEW_KEY = "maru.dev.previewTier";

function isTier(value: string | null): value is SubscriptionTier {
  return value === "free" || value === "standard" || value === "family";
}

export async function hydratePlanPreview() {
  const raw = await AsyncStorage.getItem(PREVIEW_KEY);
  if (!isTier(raw)) return;
  useQuotaStore.getState().applyPreview(raw);
}

export async function setPlanPreview(tier: SubscriptionTier | null) {
  if (!tier) {
    await AsyncStorage.removeItem(PREVIEW_KEY);
    useQuotaStore.getState().clearPreview();
    const userId = useAuthStore.getState().userId;
    if (userId) await refreshProfileQuota(userId);
    return;
  }
  await AsyncStorage.setItem(PREVIEW_KEY, tier);
  useQuotaStore.getState().applyPreview(tier);
}
