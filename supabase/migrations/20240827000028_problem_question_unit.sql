-- 復習プリント用の完全な問題ユニット（前提文・選択肢）

ALTER TABLE public.problems
  ADD COLUMN IF NOT EXISTS context_text TEXT,
  ADD COLUMN IF NOT EXISTS options_text TEXT;

COMMENT ON COLUMN public.problems.context_text IS
  '大問の共通説明文・前提・実験手順。図がなくてもテキスト復元できる';
COMMENT ON COLUMN public.problems.options_text IS
  '選択肢・語群。question_text から分離して印字する';
