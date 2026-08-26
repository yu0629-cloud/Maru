import { createServiceClient } from "../_shared/supabase.ts";
import { decodeBase64, stripDataUrl, toDataUri } from "./lib/base64.mjs";
import { buildMaskPixels } from "./lib/mask.mjs";
import {
  downloadOutputImage,
  extractOutputUrl,
  readReplicateToken,
  resolveInpaintModel,
  runLamaInpaint,
} from "./lib/replicate-client.mjs";
import { cropImageOrPlaceholder, encodeMaskPng, type CroppedImage } from "./image-ops.ts";

type NormalizedBox = { x: number; y: number; width: number; height: number };

export type InpaintRequest = {
  jobId?: string;
  problemId?: string;
  scanId?: string;
  sourceStoragePath?: string;
  geminiBbox?: number[];
  cropBox?: NormalizedBox;
  imageBase64?: string;
  maskBoxes?: Array<{ x: number; y: number; width: number; height: number }>;
  dryRun?: boolean;
  force?: boolean;
  forceMock?: boolean;
};

type ServiceClient = ReturnType<typeof createServiceClient>;

function envMap() {
  return {
    MOCK_INPAINT: Deno.env.get("MOCK_INPAINT") ?? "",
    REPLICATE_API_TOKEN: Deno.env.get("REPLICATE_API_TOKEN") ?? "",
    REPLICATE_INPAINT_MODEL: Deno.env.get("REPLICATE_INPAINT_MODEL") ?? "",
    REPLICATE_INPAINT_VERSION: Deno.env.get("REPLICATE_INPAINT_VERSION") ?? "",
  };
}

export async function loadContext(input: InpaintRequest, supabase?: ServiceClient) {
  if (input.dryRun && !input.jobId && !input.problemId) {
    const stripped = input.imageBase64 ? stripDataUrl(input.imageBase64) : null;
    return {
      job: { id: "dry-run", status: "queued", attempts: 0 },
      problemId: "dry-run",
      scanId: input.scanId ?? "dry-run",
      cropBox: input.cropBox,
      geminiBbox: input.geminiBbox,
      sourceStoragePath: input.sourceStoragePath ?? "",
      ids: { parentId: "dry", childId: "dry", problemId: "dry-run" },
      imageBytes: stripped ? decodeBase64(stripped.data) : new Uint8Array(),
    };
  }

  if (!supabase) {
    throw new Error("SUPABASE_REQUIRED");
  }

  let job: {
    id: string;
    status: string;
    attempts: number;
    problem_id: string;
    scan_id: string;
    source_storage_path: string;
    gemini_bbox: number[];
    crop_box: NormalizedBox;
  } | null = null;

  if (input.jobId) {
    const { data, error } = await supabase
      .from("inpaint_jobs")
      .select("id, status, attempts, problem_id, scan_id, source_storage_path, gemini_bbox, crop_box")
      .eq("id", input.jobId)
      .maybeSingle();
    if (error || !data) throw new Error("INPAINT_JOB_NOT_FOUND");
    job = data;
  }

  const problemId = input.problemId ?? job?.problem_id;
  if (!problemId) throw new Error("PROBLEM_ID_REQUIRED");

  if (!job) {
    const { data: latest } = await supabase
      .from("inpaint_jobs")
      .select("id, status, attempts, problem_id, scan_id, source_storage_path, gemini_bbox, crop_box")
      .eq("problem_id", problemId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    job = latest;
  }

  const { data: problem, error: problemError } = await supabase
    .from("problems")
    .select("id, child_id, scan_id, cropped_storage_path, blanked_storage_path, bounding_box, gemini_bbox")
    .eq("id", problemId)
    .maybeSingle();
  if (problemError || !problem) throw new Error("PROBLEM_NOT_FOUND");

  const { data: scan, error: scanError } = await supabase
    .from("scans")
    .select("id, parent_id, child_id, original_storage_path")
    .eq("id", problem.scan_id)
    .maybeSingle();
  if (scanError || !scan) throw new Error("SCAN_NOT_FOUND");

  const stripped = input.imageBase64 ? stripDataUrl(input.imageBase64) : null;

  return {
    job: {
      id: job?.id ?? input.jobId ?? problem.id,
      status: job?.status ?? "queued",
      attempts: job?.attempts ?? 0,
      croppedStoragePath: problem.cropped_storage_path,
      blankedStoragePath: problem.blanked_storage_path,
    },
    problemId: problem.id,
    scanId: scan.id,
    cropBox: input.cropBox ?? job?.crop_box ?? problem.bounding_box,
    geminiBbox: input.geminiBbox ?? job?.gemini_bbox ?? problem.gemini_bbox,
    sourceStoragePath: input.sourceStoragePath ?? job?.source_storage_path ?? scan.original_storage_path ?? "",
    ids: {
      parentId: scan.parent_id,
      childId: problem.child_id,
      problemId: problem.id,
    },
    imageBytes: stripped ? decodeBase64(stripped.data) : undefined,
  };
}

export function createInpaintDeps(options: {
  supabase?: ServiceClient;
  dryRun?: boolean;
  allowPlaceholder: boolean;
}) {
  const supabase = options.supabase;
  const env = envMap();

  return {
    env,
    maxAttempts: 5,
    loadContext: (input: InpaintRequest) => loadContext(input, supabase),
    downloadOriginal: async (path: string) => {
      if (!supabase || !path) throw new Error("ORIGINAL_IMAGE_MISSING");
      const { data, error } = await supabase.storage.from("scan-originals").download(path);
      if (error || !data) throw new Error(error?.message ?? "ORIGINAL_DOWNLOAD_FAILED");
      return new Uint8Array(await data.arrayBuffer());
    },
    cropImage: (bytes: Uint8Array, cropBox: NormalizedBox) =>
      cropImageOrPlaceholder(bytes, cropBox, options.allowPlaceholder),
    buildMask: buildMaskPixels,
    encodeMaskPng,
    mockInpaint: async (cropped: CroppedImage) => cropped.bytes,
    lamaInpaint: async (payload: {
      imageBytes: Uint8Array;
      imageMime: string;
      maskBytes: Uint8Array;
    }) => {
      const token = readReplicateToken(env);
      if (!token) throw new Error("REPLICATE_API_TOKEN_MISSING");
      const prediction = await runLamaInpaint({
        token,
        model: resolveInpaintModel(env),
        version: env.REPLICATE_INPAINT_VERSION || undefined,
        input: {
          image: toDataUri(payload.imageMime, payload.imageBytes),
          mask: toDataUri("image/png", payload.maskBytes),
        },
      });
      return downloadOutputImage(extractOutputUrl(prediction.output));
    },
    upload: async (bucket: string, path: string, bytes: Uint8Array, contentType: string) => {
      if (options.dryRun || !supabase) return;
      const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
        contentType,
        upsert: true,
      });
      if (error) throw new Error(`UPLOAD_FAILED:${bucket}:${error.message}`);
    },
    updateProblem: async (problemId: string, fields: Record<string, string>) => {
      if (options.dryRun || !supabase) return;
      const { error } = await supabase.from("problems").update(fields).eq("id", problemId);
      if (error) throw new Error(`PROBLEM_UPDATE_FAILED:${error.message}`);
    },
    markProcessing: async (jobId: string, attempts: number) => {
      if (options.dryRun || !supabase || jobId === "dry-run") return;
      await supabase
        .from("inpaint_jobs")
        .update({
          status: "processing",
          started_at: new Date().toISOString(),
          attempts,
          last_error: null,
        })
        .eq("id", jobId);
    },
    markCompleted: async (jobId: string) => {
      if (options.dryRun || !supabase || jobId === "dry-run") return;
      await supabase
        .from("inpaint_jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", jobId);
    },
    markFailed: async (jobId: string, message: string) => {
      if (options.dryRun || !supabase || jobId === "dry-run") return;
      await supabase
        .from("inpaint_jobs")
        .update({
          status: "failed",
          last_error: message.slice(0, 800),
        })
        .eq("id", jobId);
    },
    countActiveJobs: async (scanId: string) => {
      if (options.dryRun || !supabase) return 0;
      const { count, error } = await supabase
        .from("inpaint_jobs")
        .select("id", { count: "exact", head: true })
        .eq("scan_id", scanId)
        .in("status", ["queued", "processing"]);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    completeScan: async (scanId: string) => {
      if (options.dryRun || !supabase || scanId === "dry-run") return;
      await supabase
        .from("scans")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", scanId)
        .eq("status", "inpainting");
    },
  };
}
