import { shouldUseRemote } from "@/src/lib/backend";
import { STORAGE_BUCKETS } from "@/src/lib/storage/paths";
import { supabase } from "@/src/lib/supabase/client";
import { useReviewStore } from "@/src/stores/reviewStore";
import { useScanStore, type ScanRecord } from "@/src/stores/scanStore";

const DELETE_CONFIRM_MESSAGE =
  "このプリントを削除しますか？カルテや復習の集計からも除外されます";

export const SCAN_DELETE_CONFIRM = {
  title: "このプリントを削除",
  message: DELETE_CONFIRM_MESSAGE,
};

function dropReviewItemsForProblems(problemIds: string[]) {
  if (problemIds.length === 0) return;
  const idSet = new Set(problemIds);
  const items = useReviewStore.getState().items.filter((item) => !idSet.has(item.problemId));
  useReviewStore.getState().setItems(items);
}

async function removeStorageObject(bucket: string, path: string | null | undefined) {
  const trimmed = String(path ?? "").trim();
  if (!trimmed) return;
  const { error } = await supabase.storage.from(bucket).remove([trimmed]);
  if (error) console.warn("[manageScan] storage remove", bucket, trimmed, error.message);
}

async function fetchScanMedia(scanId: string) {
  const { data: scan } = await supabase
    .from("scans")
    .select("id, child_id, original_storage_path, annotated_storage_path, thumbnail_storage_path")
    .eq("id", scanId)
    .maybeSingle();
  const { data: problems } = await supabase
    .from("problems")
    .select("id, cropped_storage_path, blanked_storage_path")
    .eq("scan_id", scanId);
  return {
    scan,
    problems: problems ?? [],
  };
}

export async function deleteScanRecord(scan: Pick<ScanRecord, "id" | "childId" | "isDemo" | "problems">) {
  const problemIds = (scan.problems ?? []).map((problem) => problem.id).filter(Boolean);
  dropReviewItemsForProblems(problemIds);
  useScanStore.getState().remove(scan.id);

  if (scan.isDemo || (!shouldUseRemote(scan.id) && !shouldUseRemote(scan.childId))) {
    return;
  }

  const media = await fetchScanMedia(scan.id);
  const remoteProblemIds = media.problems.map((row) => row.id);
  dropReviewItemsForProblems(remoteProblemIds);

  await removeStorageObject(STORAGE_BUCKETS.originals, media.scan?.original_storage_path);
  await removeStorageObject(STORAGE_BUCKETS.annotated, media.scan?.annotated_storage_path);
  await removeStorageObject(STORAGE_BUCKETS.originals, media.scan?.thumbnail_storage_path);
  for (const problem of media.problems) {
    await removeStorageObject(STORAGE_BUCKETS.crops, problem.cropped_storage_path);
    await removeStorageObject(STORAGE_BUCKETS.blanks, problem.blanked_storage_path);
  }

  const { error } = await supabase.from("scans").delete().eq("id", scan.id);
  if (error) throw new Error(error.message || "プリントを削除できませんでした");

  if (scan.childId) {
    await supabase.rpc("update_child_carte", { p_child_id: scan.childId });
  }
}

export async function reassignScanChild(
  scan: Pick<ScanRecord, "id" | "childId" | "isDemo" | "problems">,
  nextChildId: string,
) {
  if (!nextChildId || nextChildId === scan.childId) return;
  const previousChildId = scan.childId;
  useScanStore.getState().updateChildId(scan.id, nextChildId);

  if (scan.isDemo || (!shouldUseRemote(scan.id) && !shouldUseRemote(nextChildId))) {
    return;
  }

  const { error } = await supabase.from("scans").update({ child_id: nextChildId }).eq("id", scan.id);
  if (error) {
    useScanStore.getState().updateChildId(scan.id, previousChildId);
    throw new Error(error.message || "子どもの付け替えに失敗しました");
  }

  const { error: problemError } = await supabase
    .from("problems")
    .update({ child_id: nextChildId })
    .eq("scan_id", scan.id);
  if (problemError) throw new Error(problemError.message || "問題の子どもを更新できませんでした");

  const { data: problemRows } = await supabase.from("problems").select("id").eq("scan_id", scan.id);
  const problemIds = (problemRows ?? []).map((row) => row.id);
  if (problemIds.length > 0) {
    await supabase.from("review_queue").update({ child_id: nextChildId }).in("problem_id", problemIds);
    const { data: queueRows } = await supabase
      .from("review_queue")
      .select("id")
      .in("problem_id", problemIds);
    const queueIds = (queueRows ?? []).map((row) => row.id);
    if (queueIds.length > 0) {
      await supabase.from("daily_review_assignments").update({ child_id: nextChildId }).in("review_queue_id", queueIds);
    }
  }

  dropReviewItemsForProblems(problemIds.length > 0 ? problemIds : (scan.problems ?? []).map((item) => item.id));

  if (previousChildId) {
    await supabase.rpc("update_child_carte", { p_child_id: previousChildId });
  }
  await supabase.rpc("update_child_carte", { p_child_id: nextChildId });
}
