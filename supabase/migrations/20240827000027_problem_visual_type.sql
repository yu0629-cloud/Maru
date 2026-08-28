-- 復習プリントの図形/長文判定と切り抜き座標

ALTER TABLE public.problems
  ADD COLUMN IF NOT EXISTS visual_type TEXT,
  ADD COLUMN IF NOT EXISTS crop_box JSONB,
  ADD COLUMN IF NOT EXISTS passage_text TEXT;

ALTER TABLE public.problems
  DROP CONSTRAINT IF EXISTS problems_visual_type_check;

ALTER TABLE public.problems
  ADD CONSTRAINT problems_visual_type_check
  CHECK (
    visual_type IS NULL
    OR visual_type IN ('text_only', 'has_figure', 'passage_based')
  );

COMMENT ON COLUMN public.problems.visual_type IS
  'text_only=文字だけで解ける / has_figure=図・グラフ等が必要 / passage_based=長文本文が必要';
COMMENT ON COLUMN public.problems.crop_box IS
  'Gemini [ymin,xmin,ymax,xmax] 0-1000。has_figure のとき図を含む最小範囲';
COMMENT ON COLUMN public.problems.passage_text IS
  'passage_based の共通本文・対話文';
