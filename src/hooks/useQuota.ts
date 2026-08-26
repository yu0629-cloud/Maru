import { useEffect } from "react";
import { describeQuota } from "@/src/constants/plans";
import { shouldUseRemote } from "@/src/lib/backend";
import { supabase } from "@/src/lib/supabase/client";
import { useQuotaStore } from "@/src/stores/quotaStore";

export { describeQuota };

export function useQuota() {
  const store = useQuotaStore();
  const snapshot = describeQuota(store);
  const previewTier = store.previewTier;

  useEffect(() => {
    if (previewTier) return;
    if (!shouldUseRemote()) return;
    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("subscription_tier, free_scans_remaining, extra_ticket_balance")
        .eq("id", userId)
        .maybeSingle();
      if (!profile) return;
      store.setFromServer({
        tier: profile.subscription_tier,
        freeScansRemaining: profile.free_scans_remaining,
        extraTicketBalance: profile.extra_ticket_balance,
      });
    })();
  }, [store, previewTier]);

  return {
    ...snapshot,
    tier: store.tier,
    previewTier,
    consumeOne: store.consumeOne,
  };
}
