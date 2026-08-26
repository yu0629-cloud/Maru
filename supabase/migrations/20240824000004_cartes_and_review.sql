-- 生徒カルテ（JSONB蓄積）と破綻しない忘却曲線キュー

CREATE TABLE public.child_cartes (
  child_id UUID PRIMARY KEY REFERENCES public.children (id) ON DELETE CASCADE,
  foundation_rate NUMERIC(5, 4) NOT NULL DEFAULT 0
    CHECK (foundation_rate BETWEEN 0 AND 1),
  weak_units JSONB NOT NULL DEFAULT '[]'::jsonb,
  subject_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  triage JSONB NOT NULL DEFAULT jsonb_build_object(
    'level', 'watch',
    'priority_units', '[]'::jsonb,
    'summary', ''
  ),
  scan_count INTEGER NOT NULL DEFAULT 0,
  problem_count INTEGER NOT NULL DEFAULT 0,
  last_scan_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.child_cartes IS
  'スキャン履歴から基礎定着率・苦手単元を蓄積。トリアージは update_child_carte()';
COMMENT ON COLUMN public.child_cartes.weak_units IS
  '[{subject, unit, rate, total, correct}] rate < 0.6 かつ n >= 3';
COMMENT ON COLUMN public.child_cartes.subject_stats IS
  '{math:{correct,total,foundation_rate,units:{単元名:{correct,total,rate,weak}}}}';

CREATE TABLE public.review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES public.children (id) ON DELETE CASCADE,
  problem_id UUID NOT NULL REFERENCES public.problems (id) ON DELETE CASCADE,
  status public.review_item_status NOT NULL DEFAULT 'queued',
  next_review_on DATE NOT NULL DEFAULT (CURRENT_DATE + 1),
  interval_days INTEGER NOT NULL DEFAULT 1 CHECK (interval_days >= 1),
  ease_factor NUMERIC(4, 2) NOT NULL DEFAULT 2.50 CHECK (ease_factor >= 1.30),
  consecutive_misses INTEGER NOT NULL DEFAULT 0,
  consecutive_hits INTEGER NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  last_result BOOLEAN,
  last_reviewed_at TIMESTAMPTZ,
  leech_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (child_id, problem_id)
);

CREATE INDEX review_queue_due_idx
  ON public.review_queue (child_id, next_review_on, status)
  WHERE status IN ('queued', 'active');

CREATE TABLE public.daily_review_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES public.children (id) ON DELETE CASCADE,
  review_date DATE NOT NULL,
  review_queue_id UUID NOT NULL REFERENCES public.review_queue (id) ON DELETE CASCADE,
  sort_order SMALLINT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (child_id, review_date, review_queue_id)
);

CREATE INDEX daily_review_child_date_idx
  ON public.daily_review_assignments (child_id, review_date, sort_order);

CREATE TABLE public.review_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_queue_id UUID NOT NULL REFERENCES public.review_queue (id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children (id) ON DELETE CASCADE,
  is_correct BOOLEAN NOT NULL,
  reviewed_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX review_attempts_child_date_idx
  ON public.review_attempts (child_id, reviewed_on DESC);

CREATE TABLE public.print_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children (id) ON DELETE CASCADE,
  title TEXT,
  grid_type public.print_grid_type NOT NULL DEFAULT 'squared',
  problem_ids UUID[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX print_jobs_child_idx
  ON public.print_jobs (child_id, created_at DESC);
