-- 印刷された問題文・数式を problems に保存する（問番号だけの problem_label と分離）
ALTER TABLE public.problems
  ADD COLUMN IF NOT EXISTS question_text TEXT;

COMMENT ON COLUMN public.problems.question_text IS
  '印刷された問題文・数式（例: 0 + 7 =）。手書き解答は含めない';

UPDATE public.problems
SET question_text = problem_label
WHERE COALESCE(btrim(question_text), '') = ''
  AND problem_label ~ '[0-9０-９].*[+\-×÷＋−*/=＝]';
