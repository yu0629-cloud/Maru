/**
 * 期限切れ画像の Storage 削除（採点テキストは残す）
 *
 * 認証: x-cron-secret: $PURGE_CRON_SECRET  または  Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY
 * スケジュール例: 毎日 03:20 に POST /functions/v1/purge-expired-media
 */
import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";
import {
  rankNewestFirst,
  shouldPurgeCrop,
  shouldPurgeOriginal,
  STORAGE_MEDIA_BUCKETS,
} from "../_shared/retention.mjs";

type Tier = "free" | "standard" | "family";
type ReviewStatus = "queued" | "active" | "leech" | "mastered" | "retired" | null;

type ScanRow = {
  id: string;
  parent_id: string;
  created_at: string;
  original_storage_path: string | null;
  annotated_storage_path: string | null;
  original_purged_at: string | null;
  original_retain_until: string | null;
};

type ProblemRow = {
  id: string;
  scan_id: string;
  cropped_storage_path: string | null;
  blanked_storage_path: string | null;
};

const PAGE = 500;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isAuthorized(req: Request) {
  const cronSecret = Deno.env.get("PURGE_CRON_SECRET") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const headerSecret = req.headers.get("x-cron-secret") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  if (cronSecret && (headerSecret === cronSecret || auth === `Bearer ${cronSecret}`)) return true;
  if (serviceKey && auth === `Bearer ${serviceKey}`) return true;
  return false;
}

async function removeObject(
  service: ReturnType<typeof createServiceClient>,
  bucket: string,
  path: string,
) {
  const { error } = await service.storage.from(bucket).remove([path]);
  if (error) throw new Error(`${bucket}/${path}: ${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405);
  }
  if (!isAuthorized(req)) {
    return json({ error: "unauthorized" }, 401);
  }

  const now = new Date().toISOString();
  const service = createServiceClient();
  const summary = {
    originals: 0,
    annotated: 0,
    crops: 0,
    blanks: 0,
    skipped: 0,
    errors: [] as string[],
  };

  const { data: scanRows, error: scanError } = await service
    .from("scans")
    .select(
      "id, parent_id, created_at, original_storage_path, annotated_storage_path, original_purged_at, original_retain_until",
    )
    .or("original_storage_path.not.is.null,annotated_storage_path.not.is.null")
    .order("created_at", { ascending: false })
    .limit(PAGE * 4);
  if (scanError) return json({ error: scanError.message }, 500);

  const scans = (scanRows ?? []) as ScanRow[];
  const parentIds = [...new Set(scans.map((row) => row.parent_id))];
  const tierByParent = new Map<string, Tier>();
  if (parentIds.length > 0) {
    const { data: profiles, error: profileError } = await service
      .from("profiles")
      .select("id, subscription_tier")
      .in("id", parentIds);
    if (profileError) return json({ error: profileError.message }, 500);
    for (const row of profiles ?? []) {
      tierByParent.set(row.id, (row.subscription_tier as Tier) ?? "free");
    }
  }

  const originalCandidates = scans.filter((row) => row.original_storage_path);
  const ranks = rankNewestFirst(
    originalCandidates.map((row) => ({
      id: row.id,
      parentId: row.parent_id,
      createdAt: row.created_at,
    })),
  );

  const originalWouldPurge = new Map<string, boolean>();
  for (const scan of scans) {
    const would = shouldPurgeOriginal({
      tier: tierByParent.get(scan.parent_id) ?? "free",
      createdAt: scan.created_at,
      newestRank: ranks.get(scan.id) ?? Number.MAX_SAFE_INTEGER,
      retainUntil: scan.original_retain_until,
      now,
    });
    originalWouldPurge.set(scan.id, would);
    if (!would) continue;

    if (scan.original_storage_path) {
      try {
        await removeObject(service, STORAGE_MEDIA_BUCKETS.originals, scan.original_storage_path);
        const { error } = await service
          .from("scans")
          .update({ original_storage_path: null, original_purged_at: now })
          .eq("id", scan.id);
        if (error) throw error;
        summary.originals += 1;
      } catch (error) {
        summary.errors.push(`original ${scan.id}: ${error instanceof Error ? error.message : "unknown"}`);
      }
    }

    if (scan.annotated_storage_path) {
      try {
        await removeObject(service, STORAGE_MEDIA_BUCKETS.annotated, scan.annotated_storage_path);
        const { error } = await service
          .from("scans")
          .update({ annotated_storage_path: null, annotated_purged_at: now })
          .eq("id", scan.id);
        if (error) throw error;
        summary.annotated += 1;
      } catch (error) {
        summary.errors.push(`annotated ${scan.id}: ${error instanceof Error ? error.message : "unknown"}`);
      }
    }
  }

  const { data: problemRows, error: problemError } = await service
    .from("problems")
    .select("id, scan_id, cropped_storage_path, blanked_storage_path")
    .or("cropped_storage_path.not.is.null,blanked_storage_path.not.is.null")
    .limit(PAGE * 4);
  if (problemError) return json({ error: problemError.message }, 500);

  const problems = (problemRows ?? []) as ProblemRow[];
  const problemIds = problems.map((row) => row.id);
  const reviewByProblem = new Map<string, ReviewStatus>();
  if (problemIds.length > 0) {
    const { data: queueRows, error: queueError } = await service
      .from("review_queue")
      .select("problem_id, status")
      .in("problem_id", problemIds);
    if (queueError) return json({ error: queueError.message }, 500);
    for (const row of queueRows ?? []) {
      reviewByProblem.set(row.problem_id, row.status as ReviewStatus);
    }
  }

  const missingScanIds = [...new Set(problems.map((row) => row.scan_id))].filter(
    (id) => !originalWouldPurge.has(id),
  );
  if (missingScanIds.length > 0) {
    const { data: extraScans } = await service
      .from("scans")
      .select("id, parent_id, created_at, original_storage_path, original_retain_until")
      .in("id", missingScanIds);
    const extra = (extraScans ?? []) as Array<{
      id: string;
      parent_id: string;
      created_at: string;
      original_storage_path: string | null;
      original_retain_until: string | null;
    }>;
    const extraParentIds = [...new Set(extra.map((row) => row.parent_id))].filter((id) => !tierByParent.has(id));
    if (extraParentIds.length > 0) {
      const { data: extraProfiles } = await service
        .from("profiles")
        .select("id, subscription_tier")
        .in("id", extraParentIds);
      for (const row of extraProfiles ?? []) {
        tierByParent.set(row.id, (row.subscription_tier as Tier) ?? "free");
      }
    }
    const extraRanks = rankNewestFirst(
      extra
        .filter((row) => row.original_storage_path)
        .map((row) => ({ id: row.id, parentId: row.parent_id, createdAt: row.created_at })),
    );
    for (const row of extra) {
      originalWouldPurge.set(
        row.id,
        shouldPurgeOriginal({
          tier: tierByParent.get(row.parent_id) ?? "free",
          createdAt: row.created_at,
          newestRank: extraRanks.get(row.id) ?? Number.MAX_SAFE_INTEGER,
          retainUntil: row.original_retain_until,
          now,
        }),
      );
    }
  }

  for (const problem of problems) {
    const purge = shouldPurgeCrop({
      reviewStatus: reviewByProblem.get(problem.id) ?? null,
      originalWouldPurge: originalWouldPurge.get(problem.scan_id) ?? false,
    });
    if (!purge) {
      summary.skipped += 1;
      continue;
    }

    if (problem.cropped_storage_path) {
      try {
        await removeObject(service, STORAGE_MEDIA_BUCKETS.crops, problem.cropped_storage_path);
        const { error } = await service
          .from("problems")
          .update({ cropped_storage_path: null, crop_purged_at: now })
          .eq("id", problem.id);
        if (error) throw error;
        summary.crops += 1;
      } catch (error) {
        summary.errors.push(`crop ${problem.id}: ${error instanceof Error ? error.message : "unknown"}`);
      }
    }

    if (problem.blanked_storage_path) {
      try {
        await removeObject(service, STORAGE_MEDIA_BUCKETS.blanks, problem.blanked_storage_path);
        const { error } = await service
          .from("problems")
          .update({ blanked_storage_path: null, blank_purged_at: now })
          .eq("id", problem.id);
        if (error) throw error;
        summary.blanks += 1;
      } catch (error) {
        summary.errors.push(`blank ${problem.id}: ${error instanceof Error ? error.message : "unknown"}`);
      }
    }
  }

  return json({ ok: true, now, ...summary });
});
