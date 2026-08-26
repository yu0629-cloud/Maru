import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, createUserClient } from "../_shared/supabase.ts";

const BUCKETS = ["scan-originals", "problem-crops", "problem-blanks"];

async function removePrefix(service: ReturnType<typeof createServiceClient>, bucket: string, prefix: string) {
  const { data: items } = await service.storage.from(bucket).list(prefix, { limit: 1000 });
  if (!items || items.length === 0) return;
  const files: string[] = [];
  for (const item of items) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (!item.id) {
      await removePrefix(service, bucket, path);
    } else {
      files.push(path);
    }
  }
  if (files.length > 0) {
    await service.storage.from(bucket).remove(files);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createUserClient(auth);
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userId = userData.user.id;
  const service = createServiceClient();

  for (const bucket of BUCKETS) {
    await removePrefix(service, bucket, userId);
  }

  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, deleted: userId }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
