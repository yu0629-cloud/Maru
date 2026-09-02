import { useCallback, useEffect, useMemo, useRef } from "react";
import { REVIEW_CONFIG } from "@/src/constants/review";
import { MOCK_REVIEW_ITEMS } from "@/src/features/review/mock";
import { shouldUseRemote } from "@/src/lib/backend";
import { supabase } from "@/src/lib/supabase/client";
import { useReviewStore } from "@/src/stores/reviewStore";
import { EMPTY_TOPIC_MASTERY, useTopicMasteryStore } from "@/src/stores/topicMasteryStore";
import {
  applyReviewResult,
  isolateLeeches,
  todayIso,
  type ReviewQueueItem,
} from "@/src/features/review/select";
import { archiveStaleRecords, clampReviewStage, selectRecommendedReviews } from "@/src/features/review/question-record";
import { printProblemsFromScans } from "@/src/features/print/lib/from-reviews.mjs";
import { useScanStore } from "@/src/stores/scanStore";
import { displayQuestionText, displayTopicTag, hasPrintableQuestion } from "@/src/features/print/lib/from-reviews.mjs";
import { displayProblemNumber } from "@/src/features/print/lib/question-number.mjs";
import { useCurrentChild } from "@/src/hooks/useCurrentChild";
import { t } from "@/src/i18n";

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
    const queueSelect =
      "id, problem_id, status, next_review_on, interval_days, ease_factor, consecutive_misses, consecutive_hits, last_result, leech_at, last_reviewed_at, review_stage, mistake_count, is_archived";
    const queueResult = await supabase.from("review_queue").select(queueSelect).eq("child_id", currentChildId);
    const queueFallback = queueResult.error
      ? await supabase
          .from("review_queue")
          .select(
            "id, problem_id, status, next_review_on, interval_days, ease_factor, consecutive_misses, consecutive_hits, last_result, leech_at, last_reviewed_at",
          )
          .eq("child_id", currentChildId)
      : null;
    const queueRows = (queueResult.data ?? queueFallback?.data ?? []) as Array<{
      id: string;
      problem_id: string;
      status: ReviewQueueItem["status"];
      next_review_on: string;
      interval_days: number;
      ease_factor: number;
      consecutive_misses: number;
      consecutive_hits: number;
      last_result: boolean | null;
      leech_at: string | null;
      last_reviewed_at: string | null;
      review_stage?: number;
      mistake_count?: number;
      is_archived?: boolean;
    }>;
    const problemIds = (queueRows ?? []).map((row) => row.problem_id);
    const { data: problems } = await supabase
      .from("problems")
      .select(
        "id, scan_id, problem_label, question_text, unit, topic_tags, blanked_storage_path, cropped_storage_path, crop_purged_at, blank_purged_at, bounding_box, gemini_bbox, is_correct, student_answer, parent_coaching_tip, correct_answer, subject, problem_type, created_at",
      )
      .in("id", problemIds.length ? problemIds : ["00000000-0000-0000-0000-000000000000"]);

    const problemMap = new Map((problems ?? []).map((problem) => [problem.id, problem]));
    const scanIds = [...new Set((problems ?? []).map((problem) => problem.scan_id).filter(Boolean))];
    const { data: scans } = scanIds.length
      ? await supabase
          .from("scans")
          .select("id, original_storage_path, original_purged_at")
          .in("id", scanIds)
      : { data: [] as Array<{ id: string; original_storage_path: string | null; original_purged_at: string | null }> };
    const scanMap = new Map((scans ?? []).map((scan) => [scan.id, scan]));
    const assignmentMap = new Map((assigned ?? []).map((row) => [row.review_queue_id, row]));
    const mapped: ReviewQueueItem[] = (queueRows ?? []).map((row) => {
      const problem = problemMap.get(row.problem_id);
      const assignment = assignmentMap.get(row.id);
      const scan = problem ? scanMap.get(problem.scan_id) : undefined;
      const originalPath = scan?.original_storage_path ?? null;
      const blankPath = problem?.blanked_storage_path;
      const cropPath = problem?.cropped_storage_path;
      const mediaExpired = Boolean(
        (problem?.crop_purged_at || problem?.blank_purged_at || scan?.original_purged_at) &&
          !blankPath &&
          !cropPath &&
          !originalPath,
      );
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
        lastReviewedAt: row.last_reviewed_at,
        last_reviewed_at: row.last_reviewed_at,
        reviewStage: clampReviewStage(row.review_stage),
        review_stage: clampReviewStage(row.review_stage),
        mistakeCount: (row as { mistake_count?: number }).mistake_count ?? row.consecutive_misses,
        mistake_count: (row as { mistake_count?: number }).mistake_count ?? row.consecutive_misses,
        nextReviewAt: row.next_review_on,
        next_review_at: row.next_review_on,
        isArchived: (row as { is_archived?: boolean }).is_archived === true || row.status === "retired",
        is_archived: (row as { is_archived?: boolean }).is_archived === true || row.status === "retired",
        completed: assignment?.completed ?? false,
        label:
          displayProblemNumber({
            problem_label: problem?.problem_label,
            question_text: problem?.question_text,
          }) ||
          problem?.problem_label ||
          t("common.questionBare"),
        topicTag: displayTopicTag(problem?.unit ?? problem?.topic_tags?.[0], problem?.problem_label),
        questionText: displayQuestionText(problem?.question_text, problem?.problem_label),
        blankedPath: blankPath ?? "",
        croppedPath: cropPath ?? "",
        originalPath: originalPath ?? "",
        imageSrc: "",
        blankedImageSrc: "",
        croppedImageSrc: "",
        originalImageSrc: "",
        mediaExpired,
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
        createdAt: problem?.created_at ?? undefined,
      };
    });
    setItems(archiveStaleRecords(mapped));
  }, [currentChildId, mock, setItems]);

  const fetchedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const key = `${currentChildId ?? "none"}:${mock ? "mock" : "remote"}`;
    if (fetchedKeyRef.current === key) return;
    fetchedKeyRef.current = key;
    void refresh();
  }, [currentChildId, mock, refresh]);

  const masteryByKey = useTopicMasteryStore((state) =>
    currentChildId ? state.byChild[currentChildId] ?? EMPTY_TOPIC_MASTERY : EMPTY_TOPIC_MASTERY,
  );
  const scans = useScanStore((state) => state.scans);
  const printableItems = useMemo(
    () => archiveStaleRecords(items).filter(hasPrintableQuestion),
    [items],
  );
  const selected = useMemo(
    () =>
      selectRecommendedReviews(printableItems, {
        min: REVIEW_CONFIG.dailyMin,
        max: REVIEW_CONFIG.recommendedMax,
        masteryByKey,
      }),
    [printableItems, masteryByKey],
  );
  const daily = selected.daily;
  const todayRedo = useMemo(
    () => printProblemsFromScans(Object.values(scans), currentChildId ?? undefined),
    [scans, currentChildId],
  );
  const leeches = useMemo(() => isolateLeeches(printableItems), [printableItems]);

  const recordResult = useCallback(
    async (queueId: string, isCorrect: boolean) => {
      setItems(
        useReviewStore.getState().items.map((item) =>
          item.id === queueId
            ? applyReviewResult(item, isCorrect, { leechMissThreshold: REVIEW_CONFIG.leechMissThreshold })
            : item,
        ),
      );
      if (isCorrect && currentChildId) {
        const item = useReviewStore.getState().items.find((row) => row.id === queueId);
        if (item?.topicTag) {
          void useTopicMasteryStore.getState().advanceOnCorrect(currentChildId, item.subject, item.topicTag);
        }
      }
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
    items,
    daily,
    recommended: daily,
    todayRedo,
    available: selected.available,
    belowMin: selected.belowMin,
    leeches,
    recordResult,
    refresh,
  };
}
