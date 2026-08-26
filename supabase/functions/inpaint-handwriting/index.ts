import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import { createInpaintDeps, type InpaintRequest } from "./adapters.ts";
import { runInpaintJob } from "./lib/pipeline-core.mjs";
import { shouldUseMockInpaint } from "./lib/replicate-client.mjs";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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
    const input = (await req.json()) as InpaintRequest;
    const dryRun = Boolean(input.dryRun);
    const supabase = input.jobId || input.problemId ? createServiceClient() : undefined;

    const deps = createInpaintDeps({
      supabase,
      dryRun,
      allowPlaceholder: dryRun || shouldUseMockInpaint({
        MOCK_INPAINT: Deno.env.get("MOCK_INPAINT") ?? "",
        REPLICATE_API_TOKEN: Deno.env.get("REPLICATE_API_TOKEN") ?? "",
      }),
    });

    const result = await runInpaintJob(input, deps);
    return jsonResponse(200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "INPAINT_FAILED";
    const status = message === "INPAINT_JOB_NOT_FOUND" || message === "PROBLEM_NOT_FOUND"
      ? 404
      : message === "INPAINT_MAX_ATTEMPTS"
      ? 409
      : 500;
    return jsonResponse(status, { ok: false, error: message });
  }
});
