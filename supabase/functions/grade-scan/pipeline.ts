import { createServiceClient } from "../_shared/supabase.ts";
import { geminiBBoxToNormalizedBox } from "./bbox.ts";
import { HttpError } from "./errors.ts";
import { createGeminiClient, type GeminiClient, type GeminiImagePart } from "./gemini.ts";
import { base64ToBytes, bytesToBase64, fetchImageAsBase64, guessMimeType, stripDataUrl } from "./image.ts";
import { inpaintTargetsFromInserts, toProblemInserts } from "./persist.ts";
import { buildSystemPrompt, buildUserPrompt, gradeCodeToLabel } from "./prompt.ts";
import { buildEnrichSystemPrompt, buildEnrichUserPrompt } from "./enrich.ts";
import { countCorrect, shouldQueueInpaint, validateGradeResult } from "./validate.ts";
import { enrichCoachingTip, inferProblemType } from "./problem-types.ts";
import type { CarteJson, GradeResult } from "./schema.ts";
import { SAMPLE_GRADE_RESULT } from "./fixtures/sample.ts";

export const SCAN_IMAGE_BUCKET = "scan-originals";

export type GradeScanInput = {
  scanId?: string;
  storagePath?: string;
  storageBucket?: string;
  imageBase64?: string;
  imageUrl?: string;
  mimeType?: string;
  childId?: string;
  parentId?: string;
  carteJsonb?: CarteJson;
  dryRun?: boolean;
};

export type GradeScanPersisted = {
  problemCount: number;
  inpaintQueued: number;
  reviewEnqueued: number | null;
};

export type GradeScanOutput = {
  ok: true;
  dryRun: boolean;
  scanId: string | null;
  subject: GradeResult["subject"];
  overall_score: GradeResult["overall_score"];
  problems: GradeResult["problems"];
  persisted: GradeScanPersisted;
  personalized: boolean;
};

export type GradeScanExecution = {
  output: GradeScanOutput;
  background?: Promise<GradeScanPersisted | void>;
};

type ServiceClient = ReturnType<typeof createServiceClient>;

export type PipelineDeps = {
  supabase?: ServiceClient;
  gemini?: GeminiClient;
  invokeInpaint?: (payload: Record<string, unknown>) => Promise<void>;
  authHeader?: string;
  awaitBackground?: boolean;
};

type ScanRow = {
  id: string;
  parent_id: string;
  child_id: string;
  original_storage_path: string | null;
  quota_source: string | null;
  status: string;
};

function loadMockFixture(): GradeResult {
  return validateGradeResult(SAMPLE_GRADE_RESULT);
}

function assertOwnedStoragePath(path: string, parentId: string, childId: string): string {
  const normalized = path.replace(/^\/+/, "").replace(/\\/g, "/");
  if (!normalized || normalized.includes("..") || normalized.includes("//")) {
    throw new HttpError(400, "INVALID_STORAGE_PATH");
  }
  const prefix = `${parentId}/${childId}/`;
  if (!normalized.startsWith(prefix)) {
    throw new HttpError(403, "STORAGE_PATH_NOT_OWNED");
  }
  return normalized;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function downloadStorageImage(
  supabase: ServiceClient,
  path: string,
  mimeType?: string,
  bucket = SCAN_IMAGE_BUCKET,
): Promise<GeminiImagePart> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) {
    throw new HttpError(404, "IMAGE_NOT_FOUND", error?.message ?? "Storage から画像を取得できません");
  }
  const bytes = new Uint8Array(await data.arrayBuffer());
  console.log("[grade-scan] storage download", { bucket, path, bytes: bytes.byteLength });
  return {
    mimeType: mimeType ?? guessMimeType(path),
    data: bytesToBase64(bytes),
  };
}

async function resolveImage(
  input: GradeScanInput,
  scan: { original_storage_path: string | null } | null,
  supabase: ServiceClient | undefined,
): Promise<GeminiImagePart> {
  if (input.storagePath) {
    if (!supabase) {
      throw new HttpError(400, "IMAGE_REQUIRED", "storagePath の取得には Storage が必要です");
    }
    if (input.parentId && input.childId) {
      assertOwnedStoragePath(input.storagePath, input.parentId, input.childId);
    }
    return downloadStorageImage(
      supabase,
      input.storagePath,
      input.mimeType,
      input.storageBucket ?? SCAN_IMAGE_BUCKET,
    );
  }

  if (input.imageBase64) {
    const stripped = stripDataUrl(input.imageBase64);
    return {
      mimeType: stripped.mimeType ?? input.mimeType ?? "image/jpeg",
      data: stripped.data,
    };
  }

  if (input.imageUrl) {
    const fetched = await fetchImageAsBase64(input.imageUrl);
    return {
      mimeType: input.mimeType ?? fetched.mimeType,
      data: fetched.data,
    };
  }

  const path = scan?.original_storage_path;
  if (!path || !supabase) {
    throw new HttpError(400, "IMAGE_REQUIRED", "storagePath / imageUrl / scan 画像のいずれかが必要です");
  }

  return downloadStorageImage(supabase, path, input.mimeType);
}

async function loadScanContext(
  input: GradeScanInput,
  supabase: ServiceClient,
): Promise<{
  scan: ScanRow;
  child: { name: string; grade_code: string; exam_target: string | null };
}> {
  if (!input.scanId) {
    throw new HttpError(400, "SCAN_ID_REQUIRED");
  }

  const { data: scan, error } = await supabase
    .from("scans")
    .select("id, parent_id, child_id, original_storage_path, quota_source, status")
    .eq("id", input.scanId)
    .maybeSingle();

  if (error || !scan) {
    throw new HttpError(404, "SCAN_NOT_FOUND");
  }

  const { data: child } = await supabase
    .from("children")
    .select("name, grade_code, exam_target")
    .eq("id", scan.child_id)
    .maybeSingle();

  return {
    scan,
    child: child ?? { name: "", grade_code: "e4", exam_target: null },
  };
}

async function defaultInvokeInpaint(payload: Record<string, unknown>) {
  const baseUrl = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!baseUrl || !key) return;

  await fetch(`${baseUrl}/functions/v1/inpaint-handwriting`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(payload),
  });
}

export function enqueueBackground(task: Promise<unknown>) {
  const wrapped = task.catch((error) => {
    console.error("[grade-scan] background persist failed", error);
  });
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } })
    .EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(wrapped);
    return;
  }
  void wrapped;
}

function estimatedPersisted(result: GradeResult): GradeScanPersisted {
  return {
    problemCount: result.problems.length,
    inpaintQueued: result.problems.filter(shouldQueueInpaint).length,
    reviewEnqueued: null,
  };
}

async function persistGradeOutcome(
  input: {
    scan: ScanRow;
    result: GradeResult;
    supabase: ServiceClient;
    invokeInpaint: (payload: Record<string, unknown>) => Promise<void>;
  },
): Promise<GradeScanPersisted> {
  const { scan, result, supabase, invokeInpaint } = input;
  const counts = countCorrect(result);

  await supabase.from("problems").delete().eq("scan_id", scan.id);

  const inserts = toProblemInserts(result, { scanId: scan.id, childId: scan.child_id });
  const { data: inserted, error: insertError } = await supabase
    .from("problems")
    .insert(inserts)
    .select("id, problem_index, is_correct, needs_inpaint");

  if (insertError || !inserted) {
    await supabase
      .from("scans")
      .update({ status: "failed", error_message: insertError?.message ?? "INSERT_FAILED" })
      .eq("id", scan.id);
    throw new HttpError(500, "PROBLEM_INSERT_FAILED", insertError?.message);
  }

  const queued = inpaintTargetsFromInserts(
    inserted as Array<{
      id: string;
      problem_index: number;
      is_correct: boolean;
      needs_inpaint: boolean;
    }>,
  );

  const sourcePath = scan.original_storage_path ?? "";
  const jobs = queued.map((row) => {
    const problem = result.problems[row.problem_index - 1];
    return {
      problem_id: row.id,
      scan_id: scan.id,
      source_storage_path: sourcePath,
      gemini_bbox: problem.bbox,
      crop_box: geminiBBoxToNormalizedBox(problem.bbox),
      status: "queued" as const,
    };
  });

  if (jobs.length > 0) {
    const { data: createdJobs, error: jobError } = await supabase
      .from("inpaint_jobs")
      .insert(jobs)
      .select("id, problem_id, source_storage_path, gemini_bbox, crop_box");

    if (jobError) {
      await supabase
        .from("scans")
        .update({ status: "failed", error_message: jobError.message })
        .eq("id", scan.id);
      throw new HttpError(500, "INPAINT_QUEUE_FAILED", jobError.message);
    }

    for (const job of createdJobs ?? []) {
      enqueueBackground(
        invokeInpaint({
          jobId: job.id,
          problemId: job.problem_id,
          scanId: scan.id,
          sourceStoragePath: job.source_storage_path,
          geminiBbox: job.gemini_bbox,
          cropBox: job.crop_box,
        }),
      );
    }
  }

  const { data: reviewCount } = await supabase.rpc("enqueue_incorrect_problems", {
    p_scan_id: scan.id,
  });
  await supabase.rpc("update_child_carte", { p_child_id: scan.child_id });

  await supabase
    .from("scans")
    .update({
      status: jobs.length > 0 ? "inpainting" : "completed",
      subject: result.subject ?? inserts[0]?.subject ?? "other",
      total_problems: counts.total,
      correct_count: counts.correct,
      incorrect_count: counts.incorrect,
      overall_score: result.overall_score,
      gemini_raw: result,
      completed_at: jobs.length > 0 ? null : new Date().toISOString(),
    })
    .eq("id", scan.id);

  return {
    problemCount: inserts.length,
    inpaintQueued: jobs.length,
    reviewEnqueued: typeof reviewCount === "number" ? reviewCount : null,
  };
}

async function applyIncorrectEnrichment(input: {
  gemini: GeminiClient;
  image: GeminiImagePart;
  result: GradeResult;
  carte: CarteJson | null;
  supabase: ServiceClient;
  scan: ScanRow;
}) {
  const incorrect = input.result.problems.filter((problem) => !problem.is_correct);
  if (incorrect.length === 0) return;

  const items = await input.gemini.enrichIncorrect({
    systemPrompt: buildEnrichSystemPrompt(input.carte),
    userPrompt: buildEnrichUserPrompt(incorrect),
    image: input.image,
  });
  if (items.length === 0) return;

  const byLabel = new Map(input.result.problems.map((problem, index) => [problem.problem_index, index + 1]));
  for (const item of items) {
    const problemIndex = byLabel.get(item.problem_index);
    if (!problemIndex) continue;
    const problem = input.result.problems[problemIndex - 1];
    const problemType = inferProblemType({
      topicTag: item.topic_tag,
      problemIndex: item.problem_index,
      studentAnswer: problem.student_answer,
      correctAnswer: problem.correct_answer,
    });
    await input.supabase
      .from("problems")
      .update({
        unit: item.topic_tag,
        topic: item.topic_tag,
        topic_tags: [item.topic_tag],
        parent_coaching_tip:
          problem.parent_coaching_tip.length >= 8
            ? problem.parent_coaching_tip
            : enrichCoachingTip(problemType, item.parent_coaching_tip, false),
        mistake_type: problem.student_answer ? item.mistake_type : "blank",
        problem_type: problemType,
      })
      .eq("scan_id", input.scan.id)
      .eq("problem_index", problemIndex);
  }

  await input.supabase.rpc("update_child_carte", { p_child_id: input.scan.child_id });
}

async function uploadOriginal(
  supabase: ServiceClient,
  path: string,
  image: GeminiImagePart,
) {
  const bytes = base64ToBytes(image.data);
  const { error } = await supabase.storage.from(SCAN_IMAGE_BUCKET).upload(path, bytes, {
    contentType: image.mimeType,
    upsert: true,
  });
  if (error) {
    throw new HttpError(500, "STORAGE_UPLOAD_FAILED", error.message);
  }
}

async function persistDirectScan(input: {
  scan: ScanRow;
  parentId: string;
  childId: string;
  path: string;
  image: GeminiImagePart;
  result: GradeResult;
  supabase: ServiceClient;
  gemini: GeminiClient;
  invokeInpaint: (payload: Record<string, unknown>) => Promise<void>;
  skipUpload?: boolean;
}): Promise<GradeScanPersisted> {
  const { scan, parentId, childId, path, image, result, supabase, gemini, invokeInpaint, skipUpload } = input;

  try {
    const { error: insertError } = await supabase.from("scans").insert({
      id: scan.id,
      parent_id: parentId,
      child_id: childId,
      original_storage_path: path,
      status: "grading",
    });
    if (insertError) {
      throw new HttpError(500, "SCAN_INSERT_FAILED", insertError.message);
    }

    if (!skipUpload) {
      await uploadOriginal(supabase, path, image);
    }

    const { error: quotaError } = await supabase.rpc("consume_scan_quota", {
      p_parent_id: parentId,
      p_scan_id: scan.id,
    });
    if (quotaError) {
      await supabase
        .from("scans")
        .update({ status: "failed", error_message: quotaError.message ?? "QUOTA_EXCEEDED" })
        .eq("id", scan.id);
      throw new HttpError(402, "QUOTA_EXCEEDED", quotaError.message);
    }

    const persisted = await persistGradeOutcome({ scan, result, supabase, invokeInpaint });
    try {
      const { data: carteRow } = await supabase
        .from("child_cartes")
        .select("foundation_rate, weak_units, subject_stats, triage, scan_count, problem_count")
        .eq("child_id", childId)
        .maybeSingle();
      await applyIncorrectEnrichment({
        gemini,
        image,
        result,
        carte: (carteRow as CarteJson | null) ?? null,
        supabase,
        scan,
      });
    } catch (error) {
      console.error("[grade-scan] incorrect enrich failed", error);
    }
    return persisted;
  } catch (error) {
    await supabase
      .from("scans")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "PERSIST_FAILED",
      })
      .eq("id", scan.id);
    throw error;
  }
}

async function runDirectGradeScan(
  input: GradeScanInput,
  deps: PipelineDeps,
  supabase: ServiceClient,
): Promise<GradeScanExecution> {
  if (!input.childId) {
    throw new HttpError(400, "CHILD_ID_REQUIRED");
  }

  const gemini = deps.gemini ?? createGeminiClient(loadMockFixture);

  const { data: child } = await supabase
    .from("children")
    .select("id, parent_id, name, grade_code, exam_target")
    .eq("id", input.childId)
    .maybeSingle();

  if (!child) {
    throw new HttpError(404, "CHILD_NOT_FOUND");
  }

  const parentId = (input.parentId ?? child.parent_id) as string;
  if (child.parent_id && parentId !== child.parent_id) {
    throw new HttpError(403, "CHILD_NOT_OWNED");
  }

  const preuploaded = Boolean(input.storagePath);
  const path = preuploaded
    ? assertOwnedStoragePath(input.storagePath as string, parentId, input.childId)
    : `${parentId}/${input.childId}/${crypto.randomUUID()}/original.jpg`;
  const fromPath = path.split("/")[2];
  const scanId = input.scanId && isUuid(input.scanId)
    ? input.scanId
    : fromPath && isUuid(fromPath)
      ? fromPath
      : crypto.randomUUID();
  const scan: ScanRow = {
    id: scanId,
    parent_id: parentId,
    child_id: input.childId,
    original_storage_path: path,
    quota_source: null,
    status: "grading",
  };

  const image = await resolveImage(
    { ...input, parentId, storagePath: preuploaded ? path : input.storagePath },
    null,
    supabase,
  );
  console.log("[grade-scan] image ready", { bytes: Math.round((image.data.length * 3) / 4), mimeType: image.mimeType });

  const systemPrompt = buildSystemPrompt(null, {
    name: child.name ?? "",
    gradeLabel: gradeCodeToLabel(child.grade_code ?? "e4"),
    examTarget: child.exam_target ?? null,
  });

  console.log("[grade-scan] gemini grade start", { scanId, childId: input.childId });

  const result = await gemini.gradeWorksheet({
    systemPrompt,
    userPrompt: buildUserPrompt(),
    image,
  });

  const background = persistDirectScan({
    scan,
    parentId,
    childId: input.childId,
    path,
    image,
    result,
    supabase,
    gemini,
    invokeInpaint: deps.invokeInpaint ?? defaultInvokeInpaint,
    skipUpload: preuploaded,
  });

  return {
    output: {
      ok: true,
      dryRun: false,
      scanId,
      subject: result.subject,
      overall_score: result.overall_score,
      problems: result.problems,
      persisted: estimatedPersisted(result),
      personalized: false,
    },
    background,
  };
}

export async function executeGradeScan(
  input: GradeScanInput,
  deps: PipelineDeps = {},
): Promise<GradeScanExecution> {
  const dryRun = Boolean(input.dryRun);
  const supabase = deps.supabase ?? (dryRun && !input.scanId ? undefined : createServiceClient());
  const gemini = deps.gemini ?? createGeminiClient(loadMockFixture);

  if (
    !dryRun &&
    input.childId &&
    supabase &&
    (input.storagePath || (input.imageBase64 && !input.scanId))
  ) {
    return runDirectGradeScan(input, { ...deps, gemini }, supabase);
  }

  let scan: ScanRow | null = null;
  let child = { name: "", grade_code: "e4", exam_target: null as string | null };
  const carte: CarteJson | null = input.carteJsonb ?? null;

  if (input.scanId && supabase) {
    const loaded = await loadScanContext(input, supabase);
    scan = loaded.scan;
    child = loaded.child;
  }

  const image = await resolveImage(input, scan, supabase);
  const systemPrompt = buildSystemPrompt(null, {
    name: child.name,
    gradeLabel: gradeCodeToLabel(child.grade_code),
    examTarget: child.exam_target,
  });

  if (scan && supabase && !dryRun) {
    if (!scan.quota_source) {
      const { error } = await supabase.rpc("consume_scan_quota", {
        p_parent_id: scan.parent_id,
        p_scan_id: scan.id,
      });
      if (error) {
        throw new HttpError(402, "QUOTA_EXCEEDED", error.message);
      }
    }

    await supabase
      .from("scans")
      .update({ status: "grading", error_message: null })
      .eq("id", scan.id);
  }

  let result: GradeResult;
  try {
    result = await gemini.gradeWorksheet({
      systemPrompt,
      userPrompt: buildUserPrompt(),
      image,
    });
  } catch (error) {
    if (scan && supabase && !dryRun) {
      await supabase
        .from("scans")
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message : "GEMINI_FAILED",
        })
        .eq("id", scan.id);
    }
    throw error;
  }

  if (dryRun || !scan || !supabase) {
    return {
      output: {
        ok: true,
        dryRun: true,
        scanId: scan?.id ?? input.scanId ?? null,
        subject: result.subject,
        overall_score: result.overall_score,
        problems: result.problems,
        persisted: {
          problemCount: 0,
          inpaintQueued: result.problems.filter(shouldQueueInpaint).length,
          reviewEnqueued: null,
        },
        personalized: Boolean(carte),
      },
    };
  }

  const background = (async () => {
    const persisted = await persistGradeOutcome({
      scan,
      result,
      supabase,
      invokeInpaint: deps.invokeInpaint ?? defaultInvokeInpaint,
    });
    try {
      let enrichCarte = carte;
      if (!enrichCarte) {
        const { data: carteRow } = await supabase
          .from("child_cartes")
          .select("foundation_rate, weak_units, subject_stats, triage, scan_count, problem_count")
          .eq("child_id", scan.child_id)
          .maybeSingle();
        enrichCarte = (carteRow as CarteJson | null) ?? null;
      }
      await applyIncorrectEnrichment({
        gemini,
        image,
        result,
        carte: enrichCarte,
        supabase,
        scan,
      });
    } catch (error) {
      console.error("[grade-scan] incorrect enrich failed", error);
    }
    return persisted;
  })();

  return {
    output: {
      ok: true,
      dryRun: false,
      scanId: scan.id,
      subject: result.subject,
      overall_score: result.overall_score,
      problems: result.problems,
      persisted: estimatedPersisted(result),
      personalized: Boolean(carte),
    },
    background,
  };
}

export async function runGradeScan(
  input: GradeScanInput,
  deps: PipelineDeps = {},
): Promise<GradeScanOutput> {
  const { output, background } = await executeGradeScan(input, deps);
  if (!background) return output;

  if (deps.awaitBackground) {
    const persisted = await background;
    if (persisted && typeof persisted === "object" && "problemCount" in persisted) {
      return { ...output, persisted };
    }
    return output;
  }

  enqueueBackground(background);
  return output;
}
