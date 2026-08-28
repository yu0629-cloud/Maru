-- プリント全体の教科タグ。列は当初からある subject_code。Gemini 判定と保護者の上書きを明示する。

COMMENT ON COLUMN public.scans.subject IS
  'プリント全体の教科。Gemini が画像から判定し、保護者がアプリから上書きできる';

UPDATE public.scans
SET subject = 'other'
WHERE subject IS NULL;
