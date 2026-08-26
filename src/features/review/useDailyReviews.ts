import { useCallback, useEffect, useMemo } from "react";
import { REVIEW_CONFIG } from "@/src/constants/review";
import { MOCK_REVIEW_ITEMS } from "@/src/features/review/mock";
import { shouldUseRemote } from "@/src/lib/backend";
import { supabase } from "@/src/lib/supabase/client";
import { useReviewStore } from "@/src/stores/reviewStore";
import {
  applyReviewResult,
  isolateLeeches,
  selectDailyReviews,
  todayIso,
  type ReviewQueueItem,
} from "@/src/features/review/select";
import { useCurrentChild } from "@/src/hooks/useCurrentChild";

export function useDailyReviews() {
  const { currentChild, currentChildId } = useCurrentChild();
  const items = useReviewStore((state) => state.items);
  const setItems = useReviewStore((state) => state.setItems);
  const mock = !shouldUseRemote(currentChildId);

  const refresh = useCallback(async () => {
    if (mock || !currentChildId) {
      setItems(
        MOCK_REVIEW_ITEMS.map((item) => ({
          ...item,
          id: `${currentChildId ?? "none"}-${item.id}`,
        })),
      );
      return;
    }
    await supabase.rpc("assign_daily_reviews", {
      p_child_id: currentChildId,
      p_date: todayIso(),
    });
    const { data: assigned } = await supabase
      .from("daily_review_assignments")
      .select("id, completed, review_queue_id")
      .eq("child_id", currentChildId)
      .eq("review_date", todayIso());
    const { data: queueRows } = await supabase
      .from("review_queue")
      .select(
        "id, problem_id, status, next_review_on, interval_days, ease_factor, consecutive_misses, consecutive_hits, last_result, leech_at",
      )
      .eq("child_id", currentChildId);
    const problemIds = (queueRows ?? []).map((row) => row.problem_id);
    const { data: problems } = await supabase
      .from("problems")
      .select(
        "id, scan_id, problem_label, unit, topic_tags, blanked_storage_path, cropped_storage_path, bounding_box, gemini_bbox, is_correct, student_answer, parent_coaching_tip, correct_answer, subject, problem_type",
      )
      .in("id", problemIds.length ? problemIds : ["00000000-0000-0000-0000-000000000000"]);

    const problemMap = new Map((problems ?? []).map((problem) => [problem.id, problem]));
    const scanIds = [...new Set((problems ?? []).map((problem) => problem.scan_id).filter(Boolean))];
    const { data: scans } = scanIds.length
      ? await supabase.from("scans").select("id, original_storage_path").in("id", scanIds)
      : { data: [] as Array<{ id: string; original_storage_path: string | null }> };
    const scanMap = new Map((scans ?? []).map((scan) => [scan.id, scan]));
    const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
    const assignmentMap = new Map((assigned ?? []).map((row) => [row.review_queue_id, row]));
    const mapped: ReviewQueueItem[] = (queueRows ?? []).map((row) => {
      const problem = problemMap.get(row.problem_id);
      const assignment = assignmentMap.get(row.id);
      const originalPath = problem ? scanMap.get(problem.scan_id)?.original_storage_path : null;
      const blankPath = problem?.blanked_storage_path;
      const cropPath = problem?.cropped_storage_path;
      return {
        id: row.id,
        assignmentId: assignment?.id,
        problemId: row.problem_id,
        status: row.status,
        nextReviewOn: row.next_review_on,
        intervalDays: row.interval_days,
        easeFactor: Number(row.ease_factor),
        consecutiveMisses: row.consecutive_misses,
        consecutiveHits: row.consecutive_hits,
        lastResult: row.last_result,
        leechAt: row.leech_at,
        completed: assignment?.completed ?? false,
        label: problem?.problem_label ?? "問",
        topicTag: problem?.unit ?? problem?.topic_tags?.[0] ?? "未分類",
        imageSrc: blankPath ? `${baseUrl}/storage/v1/object/public/problem-blanks/${blankPath}` : "",
        blankedImageSrc: blankPath ? `${baseUrl}/storage/v1/object/public/problem-blanks/${blankPath}` : "",
        croppedImageSrc: cropPath ? `${baseUrl}/storage/v1/object/public/problem-crops/${cropPath}` : "",
        originalImageSrc: originalPath ? `${baseUrl}/storage/v1/object/public/scan-originals/${originalPath}` : "",
        bbox: problem?.gemini_bbox ?? undefined,
        cropBox: problem?.bounding_box ?? undefined,
        isCorrect: problem?.is_correct ?? false,
        isBlanked: Boolean(blankPath),
        studentAnswer: problem?.student_answer ?? undefined,
        problemIndex: problem?.problem_label ?? undefined,
        correctAnswer: problem?.correct_answer ?? "",
        parentCoachingTip: problem?.parent_coaching_tip ?? "",
        subject: problem?.subject ?? undefined,
        problemType: problem?.problem_type ?? undefined,
      };
    });
    setItems(mapped);
  }, [currentChildId, mock, setItems]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = useMemo(
    () => selectDailyReviews(items, { min: REVIEW_CONFIG.dailyMin, max: REVIEW_CONFIG.dailyMax }),
    [items],
  );
  const leeches = useMemo(() => isolateLeeches(items), [items]);

  const recordResult = useCallback(
    async (queueId: string, isCorrect: boolean) => {
      setItems(
        useReviewStore.getState().items.map((item) =>
          item.id === queueId
            ? applyReviewResult(item, isCorrect, { leechMissThreshold: REVIEW_CONFIG.leechMissThreshold })
            : item,
        ),
      );
      if (mock) return;
      await supabase.rpc("record_review_result", {
        p_review_queue_id: queueId,
        p_is_correct: isCorrect,
      });
      if (currentChildId) {
        await supabase.rpc("update_child_carte", { p_child_id: currentChildId });
      }
    },
    [currentChildId, mock, setItems],
  );

  return {
    child: currentChild,
    loading: false,
    error: null as string | null,
    mocked: mock,
    daily: selected.daily,
    available: selected.available,
    belowMin: selected.belowMin,
    leeches,
    recordResult,
    refresh,
  };
}
