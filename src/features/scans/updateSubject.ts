import { shouldUseRemote } from "@/src/lib/backend";
import { supabase } from "@/src/lib/supabase/client";
import { useScanStore, type ScanRecord } from "@/src/stores/scanStore";
import type { SubjectCode } from "@/src/types/database";

export async function updateScanSubject(
  scan: Pick<ScanRecord, "id" | "childId" | "isDemo">,
  subject: SubjectCode,
) {
  useScanStore.getState().updateSubject(scan.id, subject);
  if (scan.isDemo || !shouldUseRemote(scan.childId) || !shouldUseRemote(scan.id)) return;

  const { error } = await supabase.from("scans").update({ subject }).eq("id", scan.id);
  if (error) throw new Error(error.message || "スキャンの教科を更新できませんでした");

  const { error: problemError } = await supabase.from("problems").update({ subject }).eq("scan_id", scan.id);
  if (problemError) throw new Error(problemError.message || "問題の教科を更新できませんでした");

  await supabase.rpc("update_child_carte", { p_child_id: scan.childId });
}
