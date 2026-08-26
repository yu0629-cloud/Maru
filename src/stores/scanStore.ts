import { create } from "zustand";
import type { GradedProblemView } from "@/src/features/grading/corrections";
import type { OverallScore } from "@/src/types/grading";

export type ScanRecord = {
  id: string;
  childId: string;
  status: "grading" | "completed" | "failed" | "inpainting";
  localUri?: string;
  isDemo?: boolean;
  overall_score: OverallScore;
  problems: GradedProblemView[];
  confirmed?: boolean;
};

type ScanState = {
  scans: Record<string, ScanRecord>;
  upsert: (scan: ScanRecord) => void;
  updateProblems: (id: string, problems: GradedProblemView[], score: OverallScore) => void;
  markConfirmed: (id: string) => void;
};

export const useScanStore = create<ScanState>((set) => ({
  scans: {},
  upsert: (scan) => set((state) => ({ scans: { ...state.scans, [scan.id]: scan } })),
  updateProblems: (id, problems, score) =>
    set((state) => {
      const current = state.scans[id];
      if (!current) return state;
      return {
        scans: {
          ...state.scans,
          [id]: { ...current, problems, overall_score: score },
        },
      };
    }),
  markConfirmed: (id) =>
    set((state) => {
      const current = state.scans[id];
      if (!current) return state;
      return { scans: { ...state.scans, [id]: { ...current, confirmed: true, status: "completed" } } };
    }),
}));
