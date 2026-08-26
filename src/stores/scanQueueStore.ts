import { useMemo } from "react";
import { randomUUID } from "expo-crypto";
import { create } from "zustand";

export type ScanJobStatus = "queued" | "running" | "completed" | "failed";

export type ScanQueueJob = {
  id: string;
  batchId: string;
  uri: string;
  width?: number;
  height?: number;
  childId: string;
  parentId: string;
  status: ScanJobStatus;
  createdAt: number;
  scanId?: string;
  error?: string;
};

type ScanQueueState = {
  jobs: ScanQueueJob[];
  currentBatchId: string | null;
  ensureBatch: () => string;
  addJob: (job: Omit<ScanQueueJob, "status" | "createdAt"> & Partial<Pick<ScanQueueJob, "status" | "createdAt">>) => void;
  patchJob: (id: string, patch: Partial<ScanQueueJob>) => void;
  claimNextQueued: () => ScanQueueJob | null;
};

export const useScanQueueStore = create<ScanQueueState>((set, get) => ({
  jobs: [],
  currentBatchId: null,
  ensureBatch: () => {
    const existing = get().currentBatchId;
    if (existing) return existing;
    const id = randomUUID();
    set({ currentBatchId: id });
    return id;
  },
  addJob: (job) =>
    set((state) => ({
      jobs: [
        ...state.jobs,
        {
          ...job,
          status: job.status ?? "queued",
          createdAt: job.createdAt ?? Date.now(),
        },
      ],
    })),
  patchJob: (id, patch) =>
    set((state) => ({
      jobs: state.jobs.map((job) => (job.id === id ? { ...job, ...patch } : job)),
    })),
  claimNextQueued: () => {
    const next = get().jobs.find((job) => job.status === "queued");
    if (!next) return null;
    const running: ScanQueueJob = { ...next, status: "running" };
    set((state) => ({
      jobs: state.jobs.map((job) => (job.id === next.id ? running : job)),
    }));
    return running;
  },
}));

const EMPTY_JOBS: ScanQueueJob[] = [];

export function currentBatchJobs(state: Pick<ScanQueueState, "jobs" | "currentBatchId">) {
  if (!state.currentBatchId) return EMPTY_JOBS;
  const matched = state.jobs.filter((job) => job.batchId === state.currentBatchId);
  return matched.length === 0 ? EMPTY_JOBS : matched;
}

/** filter した新しい配列を selector から返すと React が無限再レンダーする */
export function useCurrentBatchJobs() {
  const jobs = useScanQueueStore((state) => state.jobs);
  const currentBatchId = useScanQueueStore((state) => state.currentBatchId);
  return useMemo(() => currentBatchJobs({ jobs, currentBatchId }), [jobs, currentBatchId]);
}
