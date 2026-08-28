import { useEffect, useMemo } from "react";
import { hydrateRecentScans } from "@/src/features/storage/hydrate-scans";
import { selectHistoryScans } from "@/src/features/storage/history";
import { shouldUseRemote } from "@/src/lib/backend";
import { useCurrentChild } from "@/src/hooks/useCurrentChild";
import { useQuotaStore } from "@/src/stores/quotaStore";
import { useScanStore, type ScanRecord } from "@/src/stores/scanStore";

export function useScanHistory() {
  const { currentChildId } = useCurrentChild();
  const scans = useScanStore((state) => state.scans);
  const tier = useQuotaStore((state) => state.tier);

  useEffect(() => {
    if (!shouldUseRemote()) return;
    void hydrateRecentScans(currentChildId).catch((error) => {
      console.warn("[useScanHistory] hydrateRecentScans", error);
    });
  }, [currentChildId]);

  const items = useMemo(
    () =>
      selectHistoryScans(Object.values(scans) as ScanRecord[], {
        childId: currentChildId,
        tier,
      }) as ScanRecord[],
    [currentChildId, scans, tier],
  );

  return { items, childId: currentChildId };
}
