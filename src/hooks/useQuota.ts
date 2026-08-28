import { useEffect } from "react";
import { describeQuota } from "@/src/constants/plans";
import { shouldUseRemote } from "@/src/lib/backend";
import { supabase } from "@/src/lib/supabase/client";
import { useQuotaStore } from "@/src/stores/quotaStore";

export { describeQuota };

let quotaRemoteHydrated = false;

export function useQuota() {
  const tier = useQuotaStore((state) => state.tier);
  const freeScansRemaining = useQuotaStore((state) => state.freeScansRemaining);
  const monthlyUsed = useQuotaStore((state) => state.monthlyUsed);
  const extraTicketBalance = useQuotaStore((state) => state.extraTicketBalance);
  const previewTier = useQuotaStore((state) => state.previewTier);
  const consumeOne = useQuotaStore((state) => state.consumeOne);
  const setFromServer = useQuotaStore((state) => state.setFromServer);

  const snapshot = describeQuota({
    tier,
    freeScansRemaining,
    monthlyUsed,
    extraTicketBalance,
  });

  useEffect(() => {
    if (previewTier) return;
    if (!shouldUseRemote()) return;
    if (quotaRemoteHydrated) return;
    quotaRemoteHydrated = true;
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        quotaRemoteHydrated = false;
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("subscription_tier, free_scans_remaining, extra_ticket_balance")
        .eq("id", userId)
        .maybeSingle();
      if (!profile) return;
      setFromServer({
        tier: profile.subscription_tier,
        freeScansRemaining: profile.free_scans_remaining,
        extraTicketBalance: profile.extra_ticket_balance,
      });
    })();
  }, [previewTier, setFromServer]);

  return {
    ...snapshot,
    tier,
    previewTier,
    consumeOne,
  };
}
