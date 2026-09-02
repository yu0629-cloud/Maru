import { create } from "zustand";
import { MOCK_REVIEW_ITEMS } from "@/src/features/review/mock";
import { resolveLeechItem, type LeechAction } from "@/src/features/review/leech";
import {
  applyScanGradesToItems,
  archiveRecord,
  archiveStaleRecords,
  markRecordMastered,
} from "@/src/features/review/question-record";
import type { ReviewQueueItem } from "@/src/features/review/select";

type ReviewState = {
  items: ReviewQueueItem[];
  setItems: (items: ReviewQueueItem[]) => void;
  resolveLeech: (id: string, action: LeechAction) => void;
  restoreLeech: (id: string) => void;
  applyScanGrades: (
    problems: Array<{ id?: string; problemId?: string; is_correct?: boolean | null }>,
    createdAt?: string,
  ) => void;
  markMastered: (id: string) => void;
  archiveItem: (id: string) => void;
};

function matchId(item: ReviewQueueItem, id: string) {
  return item.id === id || item.problemId === id;
}

export const useReviewStore = create<ReviewState>((set) => ({
  items: archiveStaleRecords(MOCK_REVIEW_ITEMS),
  setItems: (items) => set({ items: archiveStaleRecords(items) }),
  resolveLeech: (id, action) =>
    set((state) => ({
      items: state.items.map((item) =>
        matchId(item, id) ? resolveLeechItem(item, action) : item,
      ),
    })),
  restoreLeech: (id) =>
    set((state) => ({
      items: state.items.map((item) =>
        matchId(item, id) ? resolveLeechItem(item, "requeue") : item,
      ),
    })),
  applyScanGrades: (problems, createdAt) =>
    set((state) => ({
      items: applyScanGradesToItems(state.items, problems, { createdAt }),
    })),
  markMastered: (id) =>
    set((state) => ({
      items: state.items.map((item) => (matchId(item, id) ? markRecordMastered(item) : item)),
    })),
  archiveItem: (id) =>
    set((state) => ({
      items: state.items.map((item) => (matchId(item, id) ? archiveRecord(item) : item)),
    })),
}));
