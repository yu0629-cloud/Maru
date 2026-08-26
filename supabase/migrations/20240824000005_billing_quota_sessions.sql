-- 料金プラン、月次スキャン残数、消費型チケット、同時ログイン2台制限

CREATE TABLE public.plan_entitlements (
  tier public.subscription_tier PRIMARY KEY,
  monthly_scan_quota INTEGER NOT NULL,
  max_children INTEGER NOT NULL,
  price_jpy INTEGER NOT NULL,
  revenuecat_entitlement_id TEXT
);

INSERT INTO public.plan_entitlements (
  tier, monthly_scan_quota, max_children, price_jpy, revenuecat_entitlement_id
) VALUES
  ('free', 0, 1, 0, NULL),
  ('standard', 150, 1, 980, 'standard'),
  ('family', 400, 3, 1480, 'family');

CREATE TABLE public.monthly_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  year_month DATE NOT NULL,
  scans_used INTEGER NOT NULL DEFAULT 0 CHECK (scans_used >= 0),
  quota_limit INTEGER NOT NULL,
  UNIQUE (parent_id, year_month)
);

CREATE TABLE public.scan_ticket_products (
  product_id TEXT PRIMARY KEY,
  ticket_count INTEGER NOT NULL,
  price_jpy INTEGER NOT NULL,
  paid_members_only BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO public.scan_ticket_products (product_id, ticket_count, price_jpy)
VALUES
  ('scan_ticket_50', 50, 300),
  ('scan_ticket_100', 100, 500);

CREATE TABLE public.scan_ticket_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES public.scan_ticket_products (product_id),
  ticket_count INTEGER NOT NULL,
  price_jpy INTEGER NOT NULL,
  revenuecat_transaction_id TEXT UNIQUE,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.quota_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  scan_id UUID REFERENCES public.scans (id) ON DELETE SET NULL,
  source public.quota_source,
  delta INTEGER NOT NULL,
  free_remaining_after INTEGER,
  monthly_remaining_after INTEGER,
  ticket_remaining_after INTEGER,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX quota_ledger_parent_idx
  ON public.quota_ledger (parent_id, created_at DESC);

CREATE TABLE public.device_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  device_name TEXT,
  platform TEXT,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_id, device_id)
);

CREATE INDEX device_sessions_parent_seen_idx
  ON public.device_sessions (parent_id, last_seen_at DESC);

CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

INSERT INTO public.app_settings (key, value) VALUES
  (
    'review',
    jsonb_build_object(
      'daily_min', 3,
      'daily_max', 5,
      'leech_miss_threshold', 3,
      'mastered_interval_days', 30,
      'mastered_hit_threshold', 3
    )
  ),
  (
    'session',
    jsonb_build_object('max_concurrent_devices', 2)
  );
