import { MOCK_CARTE } from "@/src/features/grading/mock";
import { shouldUseRemote } from "@/src/lib/backend";
import { supabase } from "@/src/lib/supabase/client";
import { useCurrentChild } from "@/src/hooks/useCurrentChild";
import { useReviewStore } from "@/src/stores/reviewStore";
import { applyLeechToCarte, type LeechAction } from "@/src/features/review/leech";
import { isolateLeeches, type ReviewQueueItem } from "@/src/features/review/select";
import { useCallback, useEffect, useState } from "react";

export function useCarte() {
  const { currentChild, currentChildId } = useCurrentChild();
  const items = useReviewStore((state) => state.items);
  const resolveLeechInStore = useReviewStore((state) => state.resolveLeech);
  const [carte, setCarte] = useState(MOCK_CARTE);
  const mock = !shouldUseRemote(currentChildId);

  const refresh = useCallback(async () => {
    if (mock || !currentChildId) {
      return;
    }
    const { data } = await supabase
      .from("child_cartes")
      .select("foundation_rate, weak_units, subject_stats, triage, scan_count, problem_count")
      .eq("child_id", currentChildId)
      .maybeSingle();
    if (!data) return;
    const weak = (data.weak_units ?? []) as Array<{
      unit: string;
      rate: number;
      total: number;
      correct: number;
    }>;
    setCarte({
      foundation_rate: Number(data.foundation_rate),
      scan_count: data.scan_count,
      problem_count: data.problem_count,
      triage_level: (data.triage as { level?: "needs_review" })?.level ?? "needs_review",
      summary: (data.triage as { summary?: string })?.summary ?? "",
      weak_units: weak,
      strong_units: MOCK_CARTE.strong_units,
      careless_rate: MOCK_CARTE.careless_rate,
      recent_rates: MOCK_CARTE.recent_rates,
    });
  }, [currentChildId, mock]);

  useEffect(() => {
    if (mock || !currentChildId) {
      setCarte(MOCK_CARTE);
      return;
    }
    void refresh();
  }, [currentChildId, mock, refresh]);

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

  return {
    child: currentChild,
    carte,
    leeches: isolateLeeches(items),
    resolveLeech,
    restoreLeech,
    mocked: mock,
  };
}
