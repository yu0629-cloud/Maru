import { shouldUseRemote } from "@/src/lib/backend";
import { maruLog, maruStep } from "@/src/lib/debug/maruLog";
import { isExpoGo } from "@/src/lib/env";
import { withTimeout } from "@/src/lib/async/timeout";
import { compressScanForGrade, persistScanImage, toFileUri } from "@/src/lib/files/scan-image";
import { uploadCompressedScan } from "@/src/lib/storage/upload-scan";
import { getMemoryAccessToken } from "@/src/lib/supabase/access-token";
import { supabase } from "@/src/lib/supabase/client";
import { gradeResultToView, MOCK_GRADE_RESULT } from "@/src/features/grading/mock";
import { recountScore } from "@/src/features/grading/corrections";
import { normalizeSubject } from "@/src/features/scans/subject";
import { useScanStore, type ScanRecord } from "@/src/stores/scanStore";
import { problemsNeedingInpaint } from "@/src/features/grading/corrections";
import type { GradeResult } from "@/src/types/grading";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type GradeStage = "prepare" | "upload" | "grade" | "demo";

async function mockGrade(input: { uri: string; childId: string }): Promise<ScanRecord> {
  maruLog("grade", "mockGrade", { uri: input.uri, childId: input.childId });
  const id = `mock-scan-${Date.now()}`;
  const problems = gradeResultToView(MOCK_GRADE_RESULT, id).map((problem) => ({
    ...problem,
    imageSrc: input.uri.startsWith("mock") ? problem.imageSrc : "",
  }));
  const scan: ScanRecord = {
    id,
    childId: input.childId,
    status: "completed",
    localUri: toFileUri(input.uri),
    isDemo: true,
    createdAt: new Date().toISOString(),
    subject: "math",
    overall_score: recountScore(problems),
    problems,
  };
  useScanStore.getState().upsert(scan);
  return scan;
}

function recordFromGradeResult(input: {
  scanId: string;
  childId: string;
  localUri: string;
  originalStoragePath?: string | null;
  result: GradeResult;
}): ScanRecord {
  const problems = gradeResultToView(input.result, input.scanId).map((problem) => ({
    ...problem,
    imageSrc: "",
  }));
  const scan: ScanRecord = {
    id: input.scanId,
    childId: input.childId,
    status: "completed",
    localUri: toFileUri(input.localUri),
    originalStoragePath: input.originalStoragePath,
    originalPurgedAt: null,
    createdAt: new Date().toISOString(),
    subject: normalizeSubject(input.result.subject) ?? "other",
    overall_score: input.result.overall_score ?? recountScore(problems),
    problems,
  };
  useScanStore.getState().upsert(scan);
  return scan;
}

function mapGradeScanError(status: number, payload: { error?: string; message?: string } | null) {
  const code = payload?.error ?? "";
  const message = payload?.message ?? "";
  if (status === 504 || code === "GRADE_SCAN_TIMEOUT" || message.includes("GEMINI_TIMEOUT")) {
    return "採点に時間がかかりすぎました。もう一度お試しください。";
  }
  if (status === 401 || status === 403) return "ログインの有効期限が切れています。もう一度ログインしてください。";
  if (message.includes("GEMINI_HTTP_400") || message.includes("INVALID_ARGUMENT")) {
    return "採点サーバーが画像を受け取れませんでした。もう一度撮影して試してください。";
  }
  if (message.includes("GEMINI_HTTP_404") || message.includes("no longer available")) {
    return "採点モデルの設定が古くなっています。アプリを更新してもう一度お試しください。";
  }
  if (code === "GEMINI_API_KEY_MISSING") return "採点用の API キーがサーバーに設定されていません。";
  if (code === "QUOTA_EXCEEDED" || message.includes("QUOTA_EXCEEDED")) return "スキャン残数がありません。";
  return message || code || `採点サーバーエラー (${status})`;
}

type GradeScanPayload = {
  ok?: boolean;
  scanId?: string | null;
  subject?: GradeResult["subject"];
  overall_score?: GradeResult["overall_score"];
  problems?: GradeResult["problems"];
  error?: string;
  message?: string;
};

const GRADE_SCAN_TIMEOUT_MS = 45_000;

function postJson(url: string, headers: Record<string, string>, body: string, timeoutMs: number) {
  return new Promise<{ status: number; text: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.timeout = timeoutMs;
    xhr.responseType = "text";
    xhr.ontimeout = () => reject(new Error("採点に時間がかかりすぎました。もう一度お試しください。"));
    xhr.onerror = () => reject(new Error("採点サーバーに接続できませんでした。"));
    xhr.onload = () => resolve({ status: xhr.status, text: String(xhr.responseText ?? "") });
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    xhr.send(body);
  });
}

async function invokeGradeScan(body: Record<string, unknown>): Promise<GradeScanPayload> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) throw new Error("Supabase 環境変数がありません");

  const token = (await getMemoryAccessToken()) ?? anonKey;
  const started = Date.now();
  const { status, text } = await postJson(
    `${supabaseUrl}/functions/v1/grade-scan`,
    {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    JSON.stringify(body),
    GRADE_SCAN_TIMEOUT_MS,
  );

  maruLog("grade", "grade-scan http", {
    status,
    ms: Date.now() - started,
    body: text.slice(0, 400),
  });

  let payload: GradeScanPayload | null = null;
  try {
    payload = text ? (JSON.parse(text) as GradeScanPayload) : null;
  } catch {
    throw new Error(mapGradeScanError(status, { message: text.slice(0, 120) }));
  }

  if (status < 200 || status >= 300 || !payload?.ok) {
    throw new Error(mapGradeScanError(status, payload));
  }
  return payload;
}

async function gradeViaEdgeFunction(input: {
  uri: string;
  parentId: string;
  childId: string;
  width?: number;
  height?: number;
  alreadyCompressed?: boolean;
}): Promise<ScanRecord> {
  // 台形補正済みの長方形用紙を長辺1280に圧縮し、Storage → grade-scan（Gemini）へ流す
  const compressed = input.alreadyCompressed
    ? { uri: input.uri, width: input.width ?? 0, height: input.height ?? 0 }
    : await maruStep("grade", "compress", () =>
        compressScanForGrade(input.uri, { width: input.width, height: input.height }),
      );

  const uploaded = await maruStep("grade", "storage upload", () =>
    uploadCompressedScan({
      uri: compressed.uri,
      parentId: input.parentId,
      childId: input.childId,
    }),
  );

  const payload = await maruStep("grade", "invoke grade-scan", () =>
    invokeGradeScan({
      storagePath: uploaded.storagePath,
      scanId: uploaded.scanId,
      mimeType: "image/jpeg",
      childId: input.childId,
      parentId: input.parentId,
    }),
  );

  if (!payload.problems || !payload.overall_score) {
    throw new Error(payload.message ?? payload.error ?? "丸付けに失敗しました");
  }

  return recordFromGradeResult({
    scanId: payload.scanId ?? `scan-${Date.now()}`,
    childId: input.childId,
    localUri: compressed.uri,
    originalStoragePath: uploaded.storagePath,
    result: { subject: payload.subject, overall_score: payload.overall_score, problems: payload.problems },
  });
}

export async function runGradePipeline(
  input: {
    uri: string;
    parentId: string;
    childId: string;
    width?: number;
    height?: number;
    alreadyCompressed?: boolean;
  },
  onStage?: (stage: GradeStage) => void,
) {
  const remote = shouldUseRemote(input.parentId) && shouldUseRemote(input.childId);
  maruLog("grade", "runGradePipeline", {
    uri: input.uri,
    parentId: input.parentId,
    childId: input.childId,
    expoGo: isExpoGo(),
    remote,
    alreadyCompressed: Boolean(input.alreadyCompressed),
  });
  if (!remote || input.uri.startsWith("mock")) {
    onStage?.("demo");
    return mockGrade({ uri: input.uri, childId: input.childId });
  }
  if (!input.alreadyCompressed) onStage?.("prepare");
  onStage?.("upload");
  onStage?.("grade");
  return gradeViaEdgeFunction(input);
}

function throwIfError(error: { message: string } | null, fallback: string) {
  if (error) throw new Error(error.message || fallback);
}

async function waitForPersistedProblems(scanId: string, timeoutMs = 12_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { data, error } = await supabase
      .from("problems")
      .select("id, problem_index")
      .eq("scan_id", scanId);
    throwIfError(error, "問題データの取得に失敗しました");
    if (data && data.length > 0) {
      maruLog("grade", "persisted problems ready", { scanId, count: data.length, ms: Date.now() - started });
      return data;
    }
    await sleep(400);
  }
  throw new Error("採点結果の保存がまだ終わっていません。数秒後にもう一度お試しください。");
}

async function confirmRemote(scan: ScanRecord) {
  maruLog("grade", "confirm start", { scanId: scan.id, problems: scan.problems.length });
  const rows = await waitForPersistedProblems(scan.id);
  const byIndex = new Map(rows.map((row) => [row.problem_index, row.id]));

  for (const problem of scan.problems) {
    const problemId = byIndex.get(problem.problem_index);
    if (!problemId) continue;
    const { error } = await supabase
      .from("problems")
      .update({
        is_correct: problem.is_correct,
        mistake_type: problem.mistake_type,
        needs_inpaint: problem.needs_inpaint,
      })
      .eq("id", problemId);
    throwIfError(error, "問題の更新に失敗しました");
  }

  const { error: enqueueError } = await supabase.rpc("enqueue_incorrect_problems", { p_scan_id: scan.id });
  throwIfError(enqueueError, "復習キューの更新に失敗しました");

  const { error: carteError } = await supabase.rpc("update_child_carte", { p_child_id: scan.childId });
  throwIfError(carteError, "カルテの更新に失敗しました");

  const jobs = problemsNeedingInpaint(scan.problems);
  for (const problem of jobs) {
    const problemId = byIndex.get(problem.problem_index);
    if (!problemId) continue;
    void supabase.functions.invoke("inpaint-handwriting", {
      body: { problemId, scanId: scan.id },
    });
  }

  const { error: scanError } = await supabase
    .from("scans")
    .update({
      correct_count: scan.problems.filter((item) => item.is_correct).length,
      incorrect_count: scan.problems.filter((item) => !item.is_correct).length,
      total_problems: scan.problems.length,
      overall_score: recountScore(scan.problems),
    })
    .eq("id", scan.id);
  throwIfError(scanError, "スキャンの更新に失敗しました");

  maruLog("grade", "confirm done", { scanId: scan.id, inpainted: jobs.length });
  return { inpainted: jobs.length };
}

export async function confirmScanCorrections(scan: ScanRecord) {
  useScanStore.getState().updateProblems(scan.id, scan.problems, recountScore(scan.problems));
  useScanStore.getState().markConfirmed(scan.id);

  if (!shouldUseRemote(scan.childId)) {
    await sleep(400);
    return { inpainted: problemsNeedingInpaint(scan.problems).length };
  }

  return withTimeout(
    confirmRemote(scan),
    20_000,
    "保存に時間がかかりすぎました。もう一度お試しください。",
  );
}

export { persistScanImage };
