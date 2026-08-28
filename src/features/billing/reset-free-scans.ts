import { FREE_SCAN_GRANT } from "@/src/constants/plans";
import { isUuid, shouldUseRemote } from "@/src/lib/backend";
import { supabase } from "@/src/lib/supabase/client";
import { useAuthStore } from "@/src/stores/authStore";
import { useQuotaStore } from "@/src/stores/quotaStore";

/** 開発用。無料枠の消費を 0 枚に戻し、カメラでまた 10 枚撮れるようにする */
export async function resetFreeScanQuotaForDebug() {
  useQuotaStore.getState().resetFreeScansForDebug();
  const userId = useAuthStore.getState().userId;
  if (!userId || !shouldUseRemote(userId) || !isUuid(userId)) return;
  const { error } = await supabase
    .from("profiles")
    .update({ free_scans_remaining: FREE_SCAN_GRANT })
    .eq("id", userId);
  if (error) throw error;
}
