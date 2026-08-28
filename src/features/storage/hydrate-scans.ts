import { recountScore, type GradedProblemView } from "@/src/features/grading/corrections";
import { inferVisualType } from "@/src/features/print/lib/visual.mjs";
import { isUuid, shouldUseRemote } from "@/src/lib/backend";
import { STORAGE_BUCKETS } from "@/src/lib/storage/paths";
import { signedStorageUrl } from "@/src/lib/storage/signed-url";
import { supabase } from "@/src/lib/supabase/client";
import { useAuthStore } from "@/src/stores/authStore";
import { useScanStore, type ScanRecord } from "@/src/stores/scanStore";
import type { Database, MistakeType, ScanStatus } from "@/src/types/database";
import type { OverallScore } from "@/src/types/grading";
import { normalizeSubject } from "@/src/features/scans/subject";

type ScanRow = Database["public"]["Tables"]["scans"]["Row"];
type ProblemRow = Database["public"]["Tables"]["problems"]["Row"];

type HydratedScanRow = Pick<
  ScanRow,
  "id" | "child_id" | "original_storage_path" | "original_purged_at" | "status" | "overall_score" | "created_at" | "subject"
>;
type HydratedProblemRow = Pick<
  ProblemRow,
  | "id"
  | "scan_id"
  | "problem_index"
  | "problem_label"
  | "question_text"
  | "is_correct"
  | "mistake_type"
  | "parent_coaching_tip"
  | "student_answer"
  | "correct_answer"
  | "unit"
  | "topic"
  | "topic_tags"
  | "needs_inpaint"
  | "problem_type"
  | "visual_type"
  | "crop_box"
  | "passage_text"
  | "gemini_bbox"
  | "cropped_storage_path"
  | "blanked_storage_path"
>;

function asRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

const PROBLEM_SELECT =
  "id, scan_id, problem_index, problem_label, question_text, is_correct, mistake_type, parent_coaching_tip, student_answer, correct_answer, unit, topic, topic_tags, needs_inpaint, problem_type, visual_type, crop_box, passage_text, gemini_bbox, cropped_storage_path, blanked_storage_path";

function mapScanStatus(status: ScanStatus): ScanRecord["status"] {
  if (status === "failed") return "failed";
  if (status === "inpainting") return "inpainting";
  if (status === "completed") return "completed";
  return "grading";
}

function mapProblem(row: HydratedProblemRow, imageSrc = ""): GradedProblemView {
  const mistake = (row.mistake_type ?? "none") as MistakeType;
  return {
    id: row.id,
    problem_index: row.problem_index,
    problem_label: row.problem_label || String(row.problem_index),
    question_text: row.question_text ?? "",
    is_correct: row.is_correct ?? false,
    mistake_type: mistake === "careless" || mistake === "concept_gap" || mistake === "blank" ? mistake : "none",
    parent_coaching_tip: row.parent_coaching_tip ?? "",
    student_answer: row.student_answer ?? "",
    correct_answer: row.correct_answer ?? "",
    topic_tag: row.topic ?? row.unit ?? row.topic_tags?.[0] ?? "",
    imageSrc,
    needs_inpaint: row.needs_inpaint,
    problem_type: row.problem_type,
    visual_type: row.visual_type ?? inferVisualType({
      problemType: row.problem_type,
      questionText: row.question_text,
      topicTag: row.topic ?? row.unit,
    }),
    crop_box: row.crop_box ?? undefined,
    passage_text: row.passage_text ?? "",
    bbox: row.gemini_bbox ?? undefined,
  };
}

function scoreOf(row: HydratedScanRow, problems: GradedProblemView[]): OverallScore {
  if (row.overall_score && typeof row.overall_score.max === "number") return row.overall_score;
  return recountScore(problems);
}

function toRecord(row: HydratedScanRow, problems: GradedProblemView[]): ScanRecord {
  return {
    id: row.id,
    childId: row.child_id ?? "",
    status: mapScanStatus(row.status),
    originalStoragePath: row.original_storage_path,
    originalPurgedAt: row.original_purged_at,
    createdAt: row.created_at,
    subject: normalizeSubject(row.subject) ?? "other",
    overall_score: scoreOf(row, problems),
    problems,
    confirmed: row.status === "completed" || row.status === "inpainting",
  };
}

function mergeIntoStore(mapped: ScanRecord) {
  const existing = useScanStore.getState().scans[mapped.id];
  if (!existing) {
    useScanStore.getState().upsert(mapped);
    return mapped;
  }
  const keepLocalProblems = existing.problems.length > 0;
  const merged: ScanRecord = {
    ...mapped,
    localUri: existing.localUri ?? mapped.localUri,
    createdAt: existing.createdAt ?? mapped.createdAt,
    subject: mapped.subject ?? existing.subject,
    isDemo: existing.isDemo,
    problems: keepLocalProblems ? existing.problems : mapped.problems,
    overall_score: keepLocalProblems ? existing.overall_score : mapped.overall_score,
    confirmed: existing.confirmed || mapped.confirmed,
    status: existing.status === "completed" ? existing.status : mapped.status,
  };
  useScanStore.getState().upsert(merged);
  return merged;
}

async function fetchProblemsForScans(scanIds: string[]) {
  if (scanIds.length === 0) return [] as HydratedProblemRow[];
  const withTopic = await supabase
    .from("problems")
    .select(PROBLEM_SELECT)
    .in("scan_id", scanIds)
    .order("problem_index", { ascending: true });
  if (!withTopic.error) return asRows<HydratedProblemRow>(withTopic.data);
  const missingColumn =
    withTopic.error.code === "42703" ||
    /problems\.(topic|visual_type|crop_box|passage_text) does not exist/i.test(withTopic.error.message ?? "");
  if (!missingColumn) throw withTopic.error;
  const fallbackSelect = PROBLEM_SELECT.replace(", topic,", ",")
    .replace(", visual_type, crop_box, passage_text,", ",");
  const { data, error } = await supabase
    .from("problems")
    .select(fallbackSelect)
    .in("scan_id", scanIds)
    .order("problem_index", { ascending: true });
  if (error) throw error;
  return asRows<HydratedProblemRow>(data);
}

const SCAN_SELECT =
  "id, parent_id, child_id, original_storage_path, original_purged_at, status, overall_score, created_at, completed_at, subject";

/**
 * クォータと同じ親（user_id / parent_id）のスキャンを取る。
 * 選択中の子どもに加え、child_id が null の行も含める。0件なら親配下すべてにフォールバック。
 */
export async function fetchOwnedScans(input: { parentId?: string | null; childId?: string | null } = {}) {
  const parentId = input.parentId ?? useAuthStore.getState().userId;
  if (!parentId || !shouldUseRemote(parentId)) return [];

  const run = (scopeToChild: boolean) => {
    let query = supabase
      .from("scans")
      .select(SCAN_SELECT)
      .eq("parent_id", parentId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (scopeToChild && input.childId && isUuid(input.childId)) {
      query = query.or(`child_id.eq.${input.childId},child_id.is.null`);
    }
    return query;
  };

  const first = await run(Boolean(input.childId && isUuid(input.childId)));
  if (first.error) throw first.error;
  let data = first.data ?? [];
  console.log("Fetched scans count:", data.length);
  if (data.length === 0 && input.childId && isUuid(input.childId)) {
    const fallback = await run(false);
    if (fallback.error) throw fallback.error;
    data = fallback.data ?? [];
    console.log("Fetched scans count:", data.length);
  }
  return asRows<HydratedScanRow>(data);
}

async function mergeFetchedScans(scans: HydratedScanRow[]) {
  if (scans.length === 0) return;
  const problems = await fetchProblemsForScans(scans.map((row) => row.id));
  const byScan = new Map<string, HydratedProblemRow[]>();
  for (const problem of problems) {
    const list = byScan.get(problem.scan_id) ?? [];
    list.push(problem);
    byScan.set(problem.scan_id, list);
  }
  for (const scan of scans) {
    mergeIntoStore(toRecord(scan, (byScan.get(scan.id) ?? []).map((row) => mapProblem(row))));
  }
}

/** 無料上限到達後・再起動後も、7日以内の過去スキャンを閲覧できるようにメモリへ戻す */
export async function hydrateRecentScans(childId?: string | null) {
  const parentId = useAuthStore.getState().userId;
  if (!shouldUseRemote(parentId)) return;
  const scans = await fetchOwnedScans({ parentId, childId });
  await mergeFetchedScans(scans);
}

export async function hydrateScanById(scanId: string): Promise<ScanRecord | undefined> {
  if (!scanId || !shouldUseRemote()) return useScanStore.getState().scans[scanId];
  const { data, error } = await supabase
    .from("scans")
    .select(
      "id, parent_id, child_id, original_storage_path, original_purged_at, status, overall_score, created_at, completed_at, subject",
    )
    .eq("id", scanId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return useScanStore.getState().scans[scanId];
  const scan = data as HydratedScanRow;
  const problems = await fetchProblemsForScans([scan.id]);
  const views = await Promise.all(
    problems.map(async (row) => {
      const crop = await signedStorageUrl(STORAGE_BUCKETS.crops, row.cropped_storage_path);
      const blank = await signedStorageUrl(STORAGE_BUCKETS.blanks, row.blanked_storage_path);
      return mapProblem(row, crop || blank || "");
    }),
  );
  return mergeIntoStore(toRecord(scan, views));
}
