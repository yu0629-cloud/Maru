import { useCallback, useEffect, useMemo, useState } from "react";
import { billingSdk } from "@/src/lib/revenuecat/sdk";
import { syncPurchaseToProfile } from "@/src/lib/revenuecat/sync";
import { offeringsForPaywall } from "@/src/features/billing/lib/catalog.mjs";
import { useAuth } from "@/src/hooks/useAuth";
import { useQuota } from "@/src/hooks/useQuota";
import type { PaywallPeriod } from "@/src/lib/revenuecat/types";
import type { SubscriptionTier } from "@/src/types/database";

export function useBilling() {
  const { userId } = useAuth();
  const quota = useQuota();
  const [period, setPeriod] = useState<PaywallPeriod>("monthly");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [native, setNative] = useState(false);
  const [storePrices, setStorePrices] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!userId) return;
    void billingSdk.configure(userId).then(async () => {
      setNative(billingSdk.native);
      const list = await billingSdk.getOfferings();
      const next: Record<string, string> = {};
      for (const offering of list) {
        next[offering.productId] = offering.priceString;
      }
      setStorePrices(next);
    });
  }, [userId]);

  const offerings = useMemo(() => {
    const catalog = offeringsForPaywall(period);
    const withStorePrice = <T extends { productId: string | null; displayPrice: string }>(item: T): T => {
      if (!item.productId) return item;
      const live = storePrices[item.productId];
      return live ? { ...item, displayPrice: live } : item;
    };
    return {
      free: catalog.free,
      standard: withStorePrice(catalog.standard),
      family: withStorePrice(catalog.family),
    };
  }, [period, storePrices]);

  const purchase = useCallback(
    async (productId: string) => {
      if (!userId) throw new Error("ログインが必要です");
      setBusy(true);
      setError(null);
      try {
        const result = await billingSdk.purchase(productId);
        await syncPurchaseToProfile(userId, result);
        return result;
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "購入に失敗しました";
        if (!/cancel/i.test(message)) setError(message);
        throw caught;
      } finally {
        setBusy(false);
      }
    },
    [userId],
  );

  const restore = useCallback(async () => {
    if (!userId) throw new Error("ログインが必要です");
    setBusy(true);
    setError(null);
    try {
      const result = await billingSdk.restore();
      if (!result) return null;
      await syncPurchaseToProfile(userId, result);
      return result;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "復元に失敗しました";
      setError(message);
      throw caught;
    } finally {
      setBusy(false);
    }
  }, [userId]);

  return {
    tier: quota.tier as SubscriptionTier,
    quota,
    period,
    setPeriod,
    offerings,
    purchase,
    restore,
    busy,
    error,
    native,
    simulated: !native,
  };
}
