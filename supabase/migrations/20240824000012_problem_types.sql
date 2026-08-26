-- 問題タイプ（計算ドリル、作図、漢字、読解、理社図表、適性検査）

CREATE TYPE public.problem_type AS ENUM (
  'calc_block',
  'math_geometry_graph',
  'kanji',
  'reading_passage',
  'science_social_diagram',
  'integrated_essay',
  'standard'
);

ALTER TABLE public.problems
  ADD COLUMN IF NOT EXISTS problem_type public.problem_type NOT NULL DEFAULT 'standard';

COMMENT ON COLUMN public.problems.problem_type IS
  'Gemini が判定する問題タイプ。印刷レイアウトと声かけの切り分けに使う';

CREATE INDEX IF NOT EXISTS problems_child_type_idx
  ON public.problems (child_id, problem_type);
