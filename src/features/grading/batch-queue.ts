import { randomUUID } from "expo-crypto";
import { maruLog } from "@/src/lib/debug/maruLog";
import { useScanQueueStore } from "@/src/stores/scanQueueStore";
import { runGradePipeline } from "@/src/features/grading/service";

/** シャッターは待たせず、裏で最大この数まで upload → grade-scan を同時実行する */
export const MAX_PARALLEL_GRADE = 4;

let inFlight = 0;

export function enqueueScanJob(input: {
  uri: string;
  childId: string;
  parentId: string;
  width?: number;
  height?: number;
}) {
  const store = useScanQueueStore.getState();
  const batchId = store.ensureBatch();
  const id = randomUUID();
  store.addJob({
    id,
    batchId,
    uri: input.uri,
    width: input.width,
    height: input.height,
    childId: input.childId,
    parentId: input.parentId,
  });
  maruLog("batch", "enqueued", { id, batchId, uri: input.uri });
  kickBatchQueue();
  return id;
}

export function retryScanJob(jobId: string) {
  const job = useScanQueueStore.getState().jobs.find((item) => item.id === jobId);
  if (!job || job.status !== "failed") return;
  useScanQueueStore.getState().patchJob(jobId, { status: "queued", error: undefined });
  maruLog("batch", "retry", { id: jobId });
  kickBatchQueue();
}

export function kickBatchQueue() {
  while (inFlight < MAX_PARALLEL_GRADE) {
    const job = useScanQueueStore.getState().claimNextQueued();
    if (!job) return;
    inFlight += 1;
    void runJob(job).finally(() => {
      inFlight -= 1;
      kickBatchQueue();
    });
  }
}

async function runJob(job: { id: string; uri: string; width?: number; height?: number; childId: string; parentId: string }) {
  maruLog("batch", "job start", { id: job.id });
  try {
    // job.uri はネイティブスキャナー済み、またはライブラリ写真を用紙クロップした画像
    const scan = await runGradePipeline({
      uri: job.uri,
      width: job.width,
      height: job.height,
      childId: job.childId,
      parentId: job.parentId,
      alreadyCompressed: false,
    });
    useScanQueueStore.getState().patchJob(job.id, {
      status: "completed",
      scanId: scan.id,
      error: undefined,
    });
    maruLog("batch", "job done", { id: job.id, scanId: scan.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "丸付けに失敗しました";
    useScanQueueStore.getState().patchJob(job.id, { status: "failed", error: message });
    maruLog("batch", "job fail", { id: job.id, error: message });
  }
}
