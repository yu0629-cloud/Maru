import { corsHeaders } from "../_shared/cors.ts";
import { HttpError, jsonError } from "./errors.ts";
import {
  enqueueBackground,
  executeGradeScan,
  type GradeScanInput,
  type PipelineDeps,
} from "./pipeline.ts";

const GRADE_SCAN_HTTP_TIMEOUT_MS = 20_000;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new HttpError(504, "GRADE_SCAN_TIMEOUT", "採点が時間内に終わりませんでした"));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  try {
    const input = (await req.json()) as GradeScanInput;
    console.log("[grade-scan] request", {
      storagePath: input.storagePath ?? null,
      scanId: input.scanId ?? null,
      childId: input.childId ?? null,
      hasBase64: Boolean(input.imageBase64),
    });
    if (input.imageBase64) {
      return jsonResponse(413, {
        ok: false,
        error: "IMAGE_BASE64_DISABLED",
        message: "画像は Storage にアップロードし、storagePath だけ送ってください",
      });
    }

    const deps: PipelineDeps = {
      authHeader: req.headers.get("Authorization") ?? undefined,
    };
    const { output, background } = await withTimeout(executeGradeScan(input, deps), GRADE_SCAN_HTTP_TIMEOUT_MS);
    if (background) enqueueBackground(background);
    return jsonResponse(200, output);
  } catch (error) {
    const parsed = jsonError(error);
    return jsonResponse(parsed.status, parsed.body);
  }
});
