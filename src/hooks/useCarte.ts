import { EMPTY_CARTE, type CarteView } from "@/src/features/grading/mock";
import { isUuid, shouldUseRemote } from "@/src/lib/backend";
import { supabase } from "@/src/lib/supabase/client";
import { useCurrentChild } from "@/src/hooks/useCurrentChild";
import { useReviewStore } from "@/src/stores/reviewStore";
import { useAuthStore } from "@/src/stores/authStore";
import { useScanStore, type ScanRecord } from "@/src/stores/scanStore";
import { applyLeechToCarte, type LeechAction } from "@/src/features/review/leech";
import { isolateLeeches, type ReviewQueueItem } from "@/src/features/review/select";
import { fetchOwnedScans } from "@/src/features/storage/hydrate-scans";
import {
  carelessRate,
  recentRatesFromProblems,
  summarizeProblems,
  type CarteProblemRow,
  type SubjectGroup,
  type TopicGroup,
} from "@/src/features/carte/stats";
import type { Database, ReviewItemStatus, TriageLevel, WeakUnit } from "@/src/types/database";
import { useCallback, useEffect, useRef, useState } from "react";

export type { CarteProblemRow, SubjectGroup, TopicGroup };
export type { CarteView };

type ChildRow = Database["public"]["Tables"]["children"]["Row"];
type ChildCarteRow = Pick<
  Database["public"]["Tables"]["child_cartes"]["Row"],
  "foundation_rate" | "weak_units" | "subject_stats" | "triage" | "scan_count" | "problem_count"
>;

type CarteProblemSource = {
  id: string;
  scan_id?: string | null;
  subject?: string | null;
  unit?: string | null;
  topic?: string | null;
  is_correct?: boolean | null;
  mistake_type?: string | null;
  question_text?: string | null;
  student_answer?: string | null;
  correct_answer?: string | null;
  problem_label?: string | null;
  created_at?: string | null;
};

const PROBLEM_SELECT =
  "id, scan_id, subject, unit, topic, is_correct, mistake_type, question_text, student_answer, correct_answer, problem_label, created_at";

const TRIAGE_LEVELS: readonly TriageLevel[] = ["solid", "watch", "needs_review", "critical"];

function asRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

function asRecord<T>(data: unknown): T | null {
  return data !== null && typeof data === "object" ? (data as T) : null;
}

function triageLevelOf(value: unknown): TriageLevel {
  return typeof value === "string" && TRIAGE_LEVELS.includes(value as TriageLevel)
    ? (value as TriageLevel)
    : "watch";
}

function weakUnitsOf(value: unknown): CarteView["weak_units"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Partial<WeakUnit> & { unit?: unknown };
    if (typeof row.unit !== "string") return [];
    return [
      {
        unit: row.unit,
        rate: Number(row.rate) || 0,
        total: Number(row.total) || 0,
        correct: Number(row.correct) || 0,
        subject: typeof row.subject === "string" ? row.subject : null,
      },
    ];
  });
}

function mapProblemRow(row: CarteProblemSource): CarteProblemRow {
  return {
    id: row.id,
    scan_id: row.scan_id,
    subject: row.subject,
    unit: row.unit,
    topic: row.topic ?? row.unit,
    is_correct: Boolean(row.is_correct),
    mistake_type: row.mistake_type,
    question_text: row.question_text,
    student_answer: row.student_answer,
    correct_answer: row.correct_answer,
    problem_label: row.problem_label,
    created_at: row.created_at,
  };
}

function carteFromProblems(problems: CarteProblemRow[], data?: ChildCarteRow | null): CarteView {
  const summary = summarizeProblems(problems);
  const scanIds = new Set(problems.map((row) => row.scan_id).filter(Boolean));
  return {
    foundation_rate: data ? Number(data.foundation_rate) || 0 : summary.rate,
    scan_count: data?.scan_count ?? scanIds.size,
    problem_count: data?.problem_count ?? problems.length,
    triage_level: triageLevelOf(data?.triage?.level),
    summary: data?.triage?.summary ?? "",
    weak_units: weakUnitsOf(data?.weak_units),
    strong_units: [],
    careless_rate: carelessRate(problems),
    recent_rates: recentRatesFromProblems(problems),
  };
}

function problemsFromLocalScans(childId: string | null): CarteProblemRow[] {
  const rows: CarteProblemRow[] = [];
  for (const scan of Object.values(useScanStore.getState().scans) as ScanRecord[]) {
    if (scan.isDemo) continue;
    const scanChild = scan.childId ?? null;
    if (childId && scanChild !== childId) continue;
    for (const problem of scan.problems ?? []) {
      rows.push({
        id: problem.id,
        scan_id: scan.id,
        subject: scan.subject,
        unit: problem.topic_tag,
        topic: problem.topic_tag,
        is_correct: problem.is_correct,
        mistake_type: problem.mistake_type,
        question_text: problem.question_text,
        student_answer: problem.student_answer,
        correct_answer: problem.correct_answer,
        problem_label: problem.problem_label,
        created_at: scan.createdAt,
      });
    }
  }
  return rows;
}

function mergeProblemRows(local: CarteProblemRow[], remote: CarteProblemRow[]) {
  const map = new Map<string, CarteProblemRow>();
  for (const row of local) map.set(row.id, row);
  for (const row of remote) map.set(row.id, row);
  return [...map.values()];
}

async function fetchProblemsForCarte(scanIds: string[], childId: string | null): Promise<CarteProblemSource[]> {
  const run = async (select: string) => {
    if (scanIds.length > 0) {
      return supabase.from("problems").select(select).in("scan_id", scanIds).order("created_at", { ascending: false }).limit(500);
    }
    if (!childId || !isUuid(childId)) return { data: [] as unknown[], error: null };
    return supabase
      .from("problems")
      .select(select)
      .eq("child_id", childId)
      .order("created_at", { ascending: false })
      .limit(500);
  };
  const first = await run(PROBLEM_SELECT);
  if (!first.error) return asRows<CarteProblemSource>(first.data);
  const missingTopic = first.error.code === "42703" || /problems\.topic does not exist/i.test(first.error.message ?? "");
  if (!missingTopic) throw first.error;
  const fallback = await run(PROBLEM_SELECT.replace(", topic,", ","));
  if (fallback.error) throw fallback.error;
  return asRows<CarteProblemSource>(fallback.data);
}

export type UseCarteResult = {
  child: ChildRow | null;
  carte: CarteView;
  problems: CarteProblemRow[];
  leeches: ReviewQueueItem[];
  records: ReviewQueueItem[];
  resolveLeech: (item: ReviewQueueItem, action: LeechAction) => Promise<void>;
  restoreLeech: (id: string) => Promise<void>;
  markUnderstood: (item: ReviewQueueItem) => Promise<void>;
  skipRecord: (item: ReviewQueueItem) => Promise<void>;
  mocked: boolean;
};

export function useCarte(): UseCarteResult {
  const { currentChild, currentChildId } = useCurrentChild();
  const parentId = useAuthStore((state) => state.userId);
  const items = useReviewStore((state) => state.items);
  const resolveLeechInStore = useReviewStore((state) => state.resolveLeech);
  const markMasteredInStore = useReviewStore((state) => state.markMastered);
  const archiveInStore = useReviewStore((state) => state.archiveItem);
  const [carte, setCarte] = useState<CarteView>(EMPTY_CARTE);
  const [problems, setProblems] = useState<CarteProblemRow[]>([]);
  const mock = !shouldUseRemote(parentId) || Boolean(currentChildId && !shouldUseRemote(currentChildId));
  const scanRevision = useScanStore((state) => state.revision);

  const refresh = useCallback(async () => {
    const local = problemsFromLocalScans(currentChildId);
    if (mock || !shouldUseRemote(parentId)) {
      setProblems(local);
      setCarte(carteFromProblems(local));
      return;
    }
    const scans = await fetchOwnedScans({ parentId, childId: currentChildId });
    console.log("Fetched scans count:", scans.length);
    const [{ data, error: carteError }, problemResult] = await Promise.all([
      currentChildId && isUuid(currentChildId)
        ? supabase
            .from("child_cartes")
            .select("foundation_rate, weak_units, subject_stats, triage, scan_count, problem_count")
            .eq("child_id", currentChildId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      fetchProblemsForCarte(
        scans.map((row) => row.id),
        currentChildId,
      ).then(
        (rows) => ({ rows, error: null as { message: string } | null }),
        (error: { message: string }) => ({ rows: [] as CarteProblemSource[], error }),
      ),
    ]);
    if (problemResult.error) {
      setProblems(local);
      setCarte(carteFromProblems(local));
      return;
    }
    const mapped = mergeProblemRows(
      local,
      problemResult.rows.map((row) =>
        mapProblemRow({
          ...row,
          subject: row.subject ?? (row.scan_id ? scans.find((scan) => scan.id === row.scan_id)?.subject : null) ?? null,
        }),
      ),
    );
    setProblems(mapped);
    setCarte(carteFromProblems(mapped, carteError ? null : asRecord<ChildCarteRow>(data)));
  }, [currentChildId, mock, parentId]);

  const fetchedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const key = `${parentId ?? "none"}:${currentChildId ?? "none"}:${mock ? "mock" : "remote"}:${scanRevision}`;
    if (fetchedKeyRef.current === key) return;
    fetchedKeyRef.current = key;
    void refresh();
  }, [currentChildId, mock, parentId, refresh, scanRevision]);

  const resolveLeech = useCallback(
    async (item: ReviewQueueItem, action: LeechAction) => {
      resolveLeechInStore(item.id, action);
      setCarte((current) => applyLeechToCarte(current, item, action));
      if (mock) return;
      const { error } = await supabase.rpc("resolve_leech_problem", {
        problem_id: item.problemId,
        action,
      });
      if (error) throw error;
      await refresh();
    },
    [mock, refresh, resolveLeechInStore],
  );

  const restoreLeech = useCallback(
    async (id: string) => {
      const item = useReviewStore.getState().items.find((row) => row.id === id || row.problemId === id);
      if (!item) return;
      await resolveLeech(item, "requeue");
    },
    [resolveLeech],
  );

  const persistRecord = useCallback(
    async (item: ReviewQueueItem, patch: { status?: ReviewItemStatus; is_archived?: boolean; review_stage?: number }) => {
      if (mock) return;
      await supabase.from("review_queue").update(patch).eq("id", item.id);
    },
    [mock],
  );

  const markUnderstood = useCallback(
    async (item: ReviewQueueItem) => {
      markMasteredInStore(item.id);
      await persistRecord(item, { status: "mastered", is_archived: false, review_stage: 3 });
    },
    [markMasteredInStore, persistRecord],
  );

  const skipRecord = useCallback(
    async (item: ReviewQueueItem) => {
      archiveInStore(item.id);
      await persistRecord(item, { status: "retired", is_archived: true });
    },
    [archiveInStore, persistRecord],
  );

  return {
    child: currentChild,
    carte,
    problems,
    leeches: isolateLeeches(items),
    records: items,
    resolveLeech,
    restoreLeech,
    markUnderstood,
    skipRecord,
    mocked: mock,
  };
}
