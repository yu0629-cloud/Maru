import { create } from "zustand";
import { MOCK_REVIEW_ITEMS } from "@/src/features/review/mock";
import { resolveLeechItem, type LeechAction } from "@/src/features/review/leech";
import type { ReviewQueueItem } from "@/src/features/review/select";

type ReviewState = {
  items: ReviewQueueItem[];
  setItems: (items: ReviewQueueItem[]) => void;
  resolveLeech: (id: string, action: LeechAction) => void;
  restoreLeech: (id: string) => void;
};

export const useReviewStore = create<ReviewState>((set) => ({
  items: MOCK_REVIEW_ITEMS,
  setItems: (items) => set({ items }),
  resolveLeech: (id, action) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id || item.problemId === id ? resolveLeechItem(item, action) : item,
      ),
    })),
  restoreLeech: (id) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id || item.problemId === id ? resolveLeechItem(item, "requeue") : item,
      ),
    })),
}));
