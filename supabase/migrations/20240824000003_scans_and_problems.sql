-- 撮影スキャンと、Gemini Vision が切り出した問題枠

CREATE TABLE public.scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children (id) ON DELETE CASCADE,
  original_storage_path TEXT,
  annotated_storage_path TEXT,
  status public.scan_status NOT NULL DEFAULT 'pending',
  subject public.subject_code,
  unit_hint TEXT,
  total_problems INTEGER NOT NULL DEFAULT 0 CHECK (total_problems >= 0),
  correct_count INTEGER NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
  incorrect_count INTEGER NOT NULL DEFAULT 0 CHECK (incorrect_count >= 0),
  quota_source public.quota_source,
  gemini_raw JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX scans_child_created_idx
  ON public.scans (child_id, created_at DESC);

CREATE INDEX scans_parent_status_idx
  ON public.scans (parent_id, status);

CREATE TABLE public.problems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES public.scans (id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children (id) ON DELETE CASCADE,
  problem_index INTEGER NOT NULL CHECK (problem_index >= 1),
  problem_label TEXT,
  bounding_box JSONB NOT NULL,
  is_correct BOOLEAN,
  student_answer TEXT,
  correct_answer TEXT,
  explanation TEXT,
  subject public.subject_code,
  unit TEXT,
  topic_tags TEXT[] NOT NULL DEFAULT '{}',
  cropped_storage_path TEXT,
  blanked_storage_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT problems_scan_index_unique UNIQUE (scan_id, problem_index),
  CONSTRAINT problems_bbox_object CHECK (jsonb_typeof(bounding_box) = 'object')
);

CREATE INDEX problems_child_incorrect_idx
  ON public.problems (child_id, created_at DESC)
  WHERE is_correct IS FALSE;

CREATE INDEX problems_child_unit_idx
  ON public.problems (child_id, subject, unit);

COMMENT ON COLUMN public.problems.bounding_box IS
  '正規化座標 {x,y,width,height} 各 0-1。元画像左上原点';
COMMENT ON COLUMN public.problems.blanked_storage_path IS
  'LaMa inpainting 後の手書き消去画像';
