import { billingSdk } from "@/src/lib/revenuecat/sdk";
import { refreshProfileQuota, syncEntitlementsToProfile } from "@/src/lib/revenuecat/sync";
import { useQuotaStore } from "@/src/stores/quotaStore";

export async function hydrateBilling(userId: string) {
  if (useQuotaStore.getState().previewTier) return;
  await billingSdk.configure(userId);
  const ids = await billingSdk.getActiveEntitlementIds();
  if (ids.length > 0) {
    await syncEntitlementsToProfile(userId, ids);
  } else {
    await refreshProfileQuota(userId);
  }
}
