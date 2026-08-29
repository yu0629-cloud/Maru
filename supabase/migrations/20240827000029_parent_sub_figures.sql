-- 大問の共通図と、設問ごとの表・グラフを分離する

ALTER TABLE public.problems
  ADD COLUMN IF NOT EXISTS parent_figure_box JSONB,
  ADD COLUMN IF NOT EXISTS sub_figure_box JSONB;

COMMENT ON COLUMN public.problems.parent_figure_box IS
  '大問全体の共通図・実験イラスト。Gemini [ymin,xmin,ymax,xmax] 0-1000';
COMMENT ON COLUMN public.problems.sub_figure_box IS
  '設問に付随する表・グラフ・補足図。Gemini [ymin,xmin,ymax,xmax] 0-1000';
