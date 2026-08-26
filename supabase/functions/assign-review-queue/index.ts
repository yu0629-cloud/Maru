import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const { childId, date } = await req.json();
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("assign_daily_reviews", {
    p_child_id: childId,
    p_date: date,
  });

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, assigned: data }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
