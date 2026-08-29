import { useEffect } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@/src/hooks/useAuth";
import { handleRevoked, startDeviceSessionWatch } from "@/src/features/session/service";
import { hydrateChildren } from "@/src/features/children/service";
import { hydratePlanPreview } from "@/src/features/billing/preview";
import { hydrateBilling } from "@/src/lib/revenuecat/hydrate";
import { hydrateRecentScans } from "@/src/features/storage/hydrate-scans";
import {
  hydrateGuestScans,
  startGuestScanPersistence,
} from "@/src/features/storage/guest-scans";
import { useTopicMasteryStore } from "@/src/stores/topicMasteryStore";
import { purgeLocalScanCache, toFileUri } from "@/src/lib/files/scan-image";
import { useChildStore } from "@/src/stores/childStore";
import { useQuotaStore } from "@/src/stores/quotaStore";
import { useScanQueueStore } from "@/src/stores/scanQueueStore";
import { useScanStore } from "@/src/stores/scanStore";

export function AccountRuntime({ children }: { children: ReactNode }) {
  const { signedIn, userId, isAnonymous } = useAuth();
  const currentChildId = useChildStore((state) => state.currentChildId);

  useEffect(() => {
    if (!signedIn || !userId) return;
    void hydrateChildren().catch((error) => {
      console.warn("[AccountRuntime] hydrateChildren", error);
    });
    void (async () => {
      try {
        await hydratePlanPreview();
        if (useQuotaStore.getState().previewTier) return;
        await hydrateBilling(userId);
      } catch (error) {
        console.warn("[AccountRuntime] hydrateBilling", error);
      }
    })();
    return startDeviceSessionWatch(() => {
      void handleRevoked();
    });
  }, [signedIn, userId]);

  useEffect(() => {
    if (!signedIn || !userId || !isAnonymous) return;
    const stop = startGuestScanPersistence();
    void hydrateGuestScans().catch((error) => {
      console.warn("[AccountRuntime] hydrateGuestScans", error);
    });
    return stop;
  }, [signedIn, userId, isAnonymous]);

  useEffect(() => {
    if (!signedIn || !userId) return;
    let cancelled = false;
    void (async () => {
      try {
        if (isAnonymous) {
          await hydrateGuestScans();
        }
        await hydrateRecentScans(currentChildId);
        if (isAnonymous) {
          const { persistGuestScans } = await import("@/src/features/storage/guest-scans");
          await persistGuestScans();
        }
        await useTopicMasteryStore.getState().hydrate(currentChildId);
      } catch (error) {
        console.warn("[AccountRuntime] hydrateRecentScans", error);
      }
      if (cancelled) return;
      const keepUris = [
        ...Object.values(useScanStore.getState().scans).map((scan) => scan.localUri),
        ...useScanQueueStore.getState().jobs.map((job) => job.uri),
      ];
      try {
        const { deleted } = await purgeLocalScanCache({ keepUris });
        if (cancelled || deleted.length === 0) return;
        const store = useScanStore.getState();
        const deletedSet = new Set(deleted.map((path) => toFileUri(path)));
        for (const scan of Object.values(store.scans)) {
          if (!scan.localUri) continue;
          if (deletedSet.has(toFileUri(scan.localUri))) {
            store.upsert({ ...scan, localUri: undefined });
          }
        }
      } catch (error) {
        console.warn("[AccountRuntime] purgeLocalScanCache", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [signedIn, userId, currentChildId, isAnonymous]);

  return <>{children}</>;
}
