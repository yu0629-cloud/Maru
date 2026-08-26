import { corsHeaders } from "../_shared/cors.ts";
import { createServiceClient, createUserClient } from "../_shared/supabase.ts";

type SyncBody = {
  event?: { type?: string; app_user_id?: string; product_id?: string; entitlement_ids?: string[]; id?: string };
  api_version?: string;
  appUserId?: string;
  productId?: string;
  transactionId?: string;
  tier?: "free" | "standard" | "family";
  source?: string;
};

function tierFromEntitlements(ids: string[] | undefined, productId: string | undefined, fallback?: SyncBody["tier"]) {
  const set = new Set(ids ?? []);
  if (set.has("family") || productId?.includes("family")) return "family";
  if (set.has("standard") || productId?.includes("standard")) return "standard";
  if (fallback) return fallback;
  if (productId?.startsWith("scan_ticket_")) return null;
  return "free";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const webhookSecret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  const isWebhook =
    Boolean(webhookSecret) && (auth === `Bearer ${webhookSecret}` || auth === webhookSecret);

  const payload = (await req.json()) as SyncBody;
  const service = createServiceClient();

  let parentId: string | null = null;
  const appUserId = payload.appUserId ?? payload.event?.app_user_id ?? null;
  const productId = payload.productId ?? payload.event?.product_id ?? "";
  const transactionId = payload.transactionId ?? payload.event?.id ?? `evt_${Date.now()}`;

  if (!isWebhook) {
    const userClient = createUserClient(auth);
    const { data } = await userClient.auth.getUser();
    parentId = data.user?.id ?? null;
    if (!parentId) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else if (appUserId) {
    const { data: profile } = await service
      .from("profiles")
      .select("id")
      .or(`id.eq.${appUserId},revenuecat_app_user_id.eq.${appUserId}`)
      .maybeSingle();
    parentId = profile?.id ?? (appUserId.length === 36 ? appUserId : null);
  }

  if (!parentId) {
    return new Response(JSON.stringify({ error: "profile_not_found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const eventType = payload.event?.type ?? payload.source ?? "client";
  const expired = ["EXPIRATION", "EXPIRATION_ISSUED"].includes(eventType);

  if (productId.startsWith("scan_ticket_") && !expired) {
    const { error } = await service.rpc("credit_scan_tickets", {
      p_parent_id: parentId,
      p_product_id: productId,
      p_transaction_id: transactionId,
    });
    if (error && !String(error.message).includes("duplicate")) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } else {
    const tier = expired
      ? "free"
      : tierFromEntitlements(payload.event?.entitlement_ids, productId, payload.tier) ?? payload.tier ?? "free";
    const { error } = await service.rpc("apply_subscription_entitlement", {
      p_parent_id: parentId,
      p_tier: tier,
      p_app_user_id: appUserId ?? parentId,
    });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ ok: true, parentId, productId, eventType }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
