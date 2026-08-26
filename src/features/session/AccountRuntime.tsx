import { useEffect } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@/src/hooks/useAuth";
import { handleRevoked, startDeviceSessionWatch } from "@/src/features/session/service";
import { hydrateChildren } from "@/src/features/children/service";
import { hydratePlanPreview } from "@/src/features/billing/preview";
import { hydrateBilling } from "@/src/lib/revenuecat/hydrate";
import { useQuotaStore } from "@/src/stores/quotaStore";

export function AccountRuntime({ children }: { children: ReactNode }) {
  const { signedIn, userId } = useAuth();

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

  return <>{children}</>;
}
