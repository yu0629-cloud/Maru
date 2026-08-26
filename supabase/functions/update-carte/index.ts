import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const { childId } = await req.json();
  const supabase = createServiceClient();
  await supabase.rpc("update_child_carte", { p_child_id: childId });

  return new Response(JSON.stringify({ ok: true, childId }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
