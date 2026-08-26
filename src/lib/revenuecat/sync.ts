import { shouldUseRemote } from "@/src/lib/backend";
import { supabase } from "@/src/lib/supabase/client";
import { useQuotaStore } from "@/src/stores/quotaStore";
import { tierFromEntitlementIds } from "@/src/features/billing/lib/catalog.mjs";
import type { PurchaseResult } from "@/src/lib/revenuecat/types";
import type { SubscriptionTier } from "@/src/types/database";

export async function syncPurchaseToProfile(userId: string, purchase: PurchaseResult) {
  const store = useQuotaStore.getState();
  store.setFromServer({
    tier: purchase.tier,
    extraTicketBalance: (store.extraTicketBalance ?? 0) + (purchase.ticketDelta ?? 0),
  });

  if (!shouldUseRemote(userId)) return { ok: true, mocked: true };

  const { error } = await supabase.functions.invoke("sync-revenuecat", {
    body: {
      appUserId: userId,
      productId: purchase.productId,
      transactionId: purchase.transactionId,
      tier: purchase.tier,
      source: purchase.simulated ? "mock" : "client",
    },
  });
  if (error) throw error;
  await refreshProfileQuota(userId);
  return { ok: true, mocked: false };
}

export async function syncEntitlementsToProfile(userId: string, entitlementIds: string[]) {
  const tier = tierFromEntitlementIds(entitlementIds) as SubscriptionTier;
  const current = useQuotaStore.getState().tier;
  if (tier === current) return;
  if (tier === "free") {
    useQuotaStore.getState().setFromServer({ tier: "free" });
    if (shouldUseRemote(userId)) {
      await supabase.functions.invoke("sync-revenuecat", {
        body: {
          appUserId: userId,
          productId: "entitlement_expired",
          transactionId: `ent_${Date.now()}`,
          tier: "free",
          source: "customer_info",
        },
      });
      await refreshProfileQuota(userId);
    }
    return;
  }
  await syncPurchaseToProfile(userId, {
    productId: `entitlement_${tier}`,
    tier,
    transactionId: `ent_${Date.now()}`,
    simulated: !shouldUseRemote(userId),
  });
}

export async function applyMockQuotaFromBilling() {
  const { loadMockBillingSnapshot } = await import("@/src/lib/revenuecat/mock-sdk");
  const snapshot = await loadMockBillingSnapshot();
  useQuotaStore.getState().setFromServer({
    tier: snapshot.tier,
    extraTicketBalance: snapshot.extraTicketBalance,
  });
}

export async function refreshProfileQuota(userId: string) {
  if (!shouldUseRemote(userId)) {
    await applyMockQuotaFromBilling();
    return;
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier, free_scans_remaining, extra_ticket_balance")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return;
  const row = profile as {
    subscription_tier: SubscriptionTier;
    free_scans_remaining: number;
    extra_ticket_balance: number;
  };
  const { data: usage } = await supabase
    .from("monthly_usage")
    .select("scans_used")
    .eq("parent_id", userId)
    .eq("year_month", tokyoMonthStart())
    .maybeSingle();
  useQuotaStore.getState().setFromServer({
    tier: row.subscription_tier,
    freeScansRemaining: row.free_scans_remaining,
    extraTicketBalance: row.extra_ticket_balance,
    monthlyUsed: (usage as { scans_used?: number } | null)?.scans_used ?? 0,
  });
}

function tokyoMonthStart() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}-01`;
}
