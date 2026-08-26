-- 親プロフィールと複数チルドレン（最大3人、プランにより制限）

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT NOT NULL DEFAULT '',
  subscription_tier public.subscription_tier NOT NULL DEFAULT 'free',
  revenuecat_app_user_id TEXT UNIQUE,
  current_child_id UUID,
  free_scans_remaining INTEGER NOT NULL DEFAULT 10
    CHECK (free_scans_remaining >= 0),
  extra_ticket_balance INTEGER NOT NULL DEFAULT 0
    CHECK (extra_ticket_balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.children (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  grade_code public.grade_code NOT NULL DEFAULT 'e4',
  exam_target TEXT,
  avatar_hue SMALLINT NOT NULL DEFAULT 12
    CHECK (avatar_hue BETWEEN 0 AND 359),
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX children_parent_name_idx
  ON public.children (parent_id, lower(name));

CREATE INDEX children_parent_id_idx
  ON public.children (parent_id, sort_order);

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_current_child_fk
  FOREIGN KEY (current_child_id)
  REFERENCES public.children (id)
  ON DELETE SET NULL;

COMMENT ON TABLE public.profiles IS '親アカウント。Auth ユーザーと 1:1';
COMMENT ON COLUMN public.profiles.free_scans_remaining IS 'フリープラン初回10枚の買い切り残数';
COMMENT ON COLUMN public.profiles.extra_ticket_balance IS '有料会員の消費型IAPチケット残数';
COMMENT ON COLUMN public.profiles.current_child_id IS 'ワンタップ切り替え中の子ども';
COMMENT ON TABLE public.children IS '1親あたり最大3人。実制限はプランの max_children';
