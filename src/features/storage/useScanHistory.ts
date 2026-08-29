import { useEffect, useMemo } from "react";
import { hydrateRecentScans } from "@/src/features/storage/hydrate-scans";
import { hydrateGuestScans } from "@/src/features/storage/guest-scans";
import { selectHistoryScans } from "@/src/features/storage/history";
import { shouldUseRemote } from "@/src/lib/backend";
import { useAuth } from "@/src/hooks/useAuth";
import { useCurrentChild } from "@/src/hooks/useCurrentChild";
import { useQuotaStore } from "@/src/stores/quotaStore";
import { useScanStore, type ScanRecord } from "@/src/stores/scanStore";

export function useScanHistory() {
  const { currentChildId } = useCurrentChild();
  const { isAnonymous } = useAuth();
  const scans = useScanStore((state) => state.scans);
  const tier = useQuotaStore((state) => state.tier);

  useEffect(() => {
    if (isAnonymous) {
      void hydrateGuestScans().catch((error) => {
        console.warn("[useScanHistory] hydrateGuestScans", error);
      });
    }
    if (!shouldUseRemote()) return;
    void hydrateRecentScans(currentChildId).catch((error) => {
      console.warn("[useScanHistory] hydrateRecentScans", error);
    });
  }, [currentChildId, isAnonymous]);

  const items = useMemo(
    () =>
      selectHistoryScans(Object.values(scans) as ScanRecord[], {
        childId: currentChildId,
        tier,
        isAnonymous,
      }) as ScanRecord[],
    [currentChildId, scans, tier, isAnonymous],
  );

  return { items, childId: currentChildId };
}
