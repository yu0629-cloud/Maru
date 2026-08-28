-- 本番で `column problems.topic does not exist` が出ないよう、欠けている列を必ず足す。

ALTER TABLE public.problems
  ADD COLUMN IF NOT EXISTS topic TEXT;

COMMENT ON COLUMN public.problems.topic IS
  'Gemini が付けた分野・単元名（例: くり上がりのある足し算）。カルテの得意・苦手集計に使う';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'scans'
      AND column_name = 'subject'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typname = 'subject_code'
    ) THEN
      ALTER TABLE public.scans ADD COLUMN subject public.subject_code;
    ELSE
      ALTER TABLE public.scans ADD COLUMN subject TEXT;
    END IF;
  END IF;
END
$$;

UPDATE public.problems
SET topic = COALESCE(NULLIF(BTRIM(topic), ''), NULLIF(BTRIM(unit), ''), topic_tags[1])
WHERE topic IS NULL OR BTRIM(COALESCE(topic, '')) = '';
