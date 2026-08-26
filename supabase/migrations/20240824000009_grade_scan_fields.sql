-- grade-scan: Gemini 出力の保存と LaMa キュー

CREATE TYPE public.difficulty_level AS ENUM ('basic', 'standard', 'advanced');
CREATE TYPE public.mistake_type AS ENUM ('careless', 'concept_gap', 'blank', 'none');
CREATE TYPE public.inpaint_job_status AS ENUM ('queued', 'processing', 'completed', 'failed');

ALTER TABLE public.scans
  ADD COLUMN overall_score JSONB;

COMMENT ON COLUMN public.scans.overall_score IS
  'Gemini 採点 {earned, max}。得点/配点';

ALTER TABLE public.problems
  ADD COLUMN difficulty_level public.difficulty_level,
  ADD COLUMN mistake_type public.mistake_type,
  ADD COLUMN parent_coaching_tip TEXT,
  ADD COLUMN needs_inpaint BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN gemini_bbox JSONB;

COMMENT ON COLUMN public.problems.gemini_bbox IS
  'Gemini 正規化座標 [ymin, xmin, ymax, xmax] 各 0-1000';
COMMENT ON COLUMN public.problems.needs_inpaint IS
  '不正解かつ手書き消去が必要なとき true';

CREATE TABLE public.inpaint_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id UUID NOT NULL REFERENCES public.problems (id) ON DELETE CASCADE,
  scan_id UUID NOT NULL REFERENCES public.scans (id) ON DELETE CASCADE,
  source_storage_path TEXT NOT NULL,
  gemini_bbox JSONB NOT NULL,
  crop_box JSONB NOT NULL,
  status public.inpaint_job_status NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX inpaint_jobs_status_idx
  ON public.inpaint_jobs (status, created_at);

CREATE INDEX inpaint_jobs_scan_idx
  ON public.inpaint_jobs (scan_id);

ALTER TABLE public.inpaint_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY inpaint_jobs_parent ON public.inpaint_jobs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.scans s
      WHERE s.id = inpaint_jobs.scan_id
        AND s.parent_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.scans s
      WHERE s.id = inpaint_jobs.scan_id
        AND s.parent_id = auth.uid()
    )
  );
