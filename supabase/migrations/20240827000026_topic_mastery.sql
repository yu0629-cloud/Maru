-- 単元ごとの手動克服と忘却曲線（おさらい日）

CREATE TABLE public.topic_mastery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES public.children (id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  topic TEXT NOT NULL,
  is_mastered BOOLEAN NOT NULL DEFAULT false,
  mastered_at TIMESTAMPTZ,
  review_stage INTEGER NOT NULL DEFAULT 0 CHECK (review_stage >= 0 AND review_stage <= 3),
  next_review_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT topic_mastery_child_topic_unique UNIQUE (child_id, subject, topic)
);

CREATE INDEX topic_mastery_child_idx ON public.topic_mastery (child_id);

COMMENT ON TABLE public.topic_mastery IS
  'カルテ単元の手動克服。review_stage 1=7日, 2=14日, 3=30日後におさらい';

ALTER TABLE public.topic_mastery ENABLE ROW LEVEL SECURITY;

CREATE POLICY topic_mastery_parent ON public.topic_mastery
  FOR ALL TO authenticated
  USING (public.owns_child(child_id))
  WITH CHECK (public.owns_child(child_id));
