import { create } from "zustand";
import type { GradedProblemView } from "@/src/features/grading/corrections";
import type { OverallScore } from "@/src/types/grading";
import type { SubjectCode } from "@/src/types/database";

export type ScanChildDetection = {
  detected_child_id: string;
  detected_child_name: string;
  confidence_reason: string;
  matched: boolean;
  fallback: boolean;
};

export type ScanRecord = {
  id: string;
  childId: string;
  childDetection?: ScanChildDetection;
  status: "grading" | "completed" | "failed" | "inpainting";
  localUri?: string;
  originalStoragePath?: string | null;
  originalPurgedAt?: string | null;
  isDemo?: boolean;
  createdAt?: string;
  subject?: SubjectCode;
  overall_score: OverallScore;
  problems: GradedProblemView[];
  confirmed?: boolean;
};

type ScanState = {
  scans: Record<string, ScanRecord>;
  revision: number;
  upsert: (scan: ScanRecord) => void;
  updateProblems: (id: string, problems: GradedProblemView[], score: OverallScore) => void;
  updateSubject: (id: string, subject: SubjectCode) => void;
  updateChildId: (id: string, childId: string) => void;
  remove: (id: string) => void;
  markConfirmed: (id: string) => void;
};

export const useScanStore = create<ScanState>((set) => ({
  scans: {},
  revision: 0,
  upsert: (scan) =>
    set((state) => {
      const prev = state.scans[scan.id];
      return {
        scans: {
          ...state.scans,
          [scan.id]: {
            ...scan,
            createdAt: scan.createdAt ?? prev?.createdAt,
            subject: scan.subject ?? prev?.subject,
          },
        },
      };
    }),
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
  updateSubject: (id, subject) =>
    set((state) => {
      const current = state.scans[id];
      if (!current) return state;
      return { scans: { ...state.scans, [id]: { ...current, subject } } };
    }),
  updateChildId: (id, childId) =>
    set((state) => {
      const current = state.scans[id];
      if (!current) return state;
      const childDetection = current.childDetection
        ? {
            ...current.childDetection,
            fallback: childId !== current.childDetection.detected_child_id,
            matched: childId === current.childDetection.detected_child_id,
          }
        : current.childDetection;
      return {
        revision: state.revision + 1,
        scans: { ...state.scans, [id]: { ...current, childId, childDetection } },
      };
    }),
  remove: (id) =>
    set((state) => {
      if (!state.scans[id]) return state;
      const { [id]: _removed, ...rest } = state.scans;
      return { scans: rest, revision: state.revision + 1 };
    }),
  markConfirmed: (id) =>
    set((state) => {
      const current = state.scans[id];
      if (!current) return state;
      return { scans: { ...state.scans, [id]: { ...current, confirmed: true, status: "completed" } } };
    }),
}));
