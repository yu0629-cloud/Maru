-- 問題ごとの分野・単元。Gemini の topic を保存し、カルテ集計に使う。

ALTER TABLE public.problems
  ADD COLUMN IF NOT EXISTS topic TEXT;

UPDATE public.problems
SET topic = COALESCE(NULLIF(BTRIM(topic), ''), NULLIF(BTRIM(unit), ''), topic_tags[1], '未分類')
WHERE topic IS NULL OR BTRIM(topic) = '';

COMMENT ON COLUMN public.problems.topic IS
  'Gemini が付けた分野・単元名（例: くり上がりのある足し算）。カルテの得意・苦手集計に使う';

CREATE OR REPLACE FUNCTION public.update_child_carte(p_child_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INTEGER;
  v_correct INTEGER;
  v_rate NUMERIC(5, 4);
  v_stats JSONB := '{}'::jsonb;
  v_weak JSONB := '[]'::jsonb;
  v_priority JSONB := '[]'::jsonb;
  v_level public.triage_level;
  v_summary TEXT;
  rec RECORD;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE public.effective_problem_correct(is_correct, id))
  INTO v_total, v_correct
  FROM public.problems
  WHERE child_id = p_child_id
    AND is_correct IS NOT NULL;

  IF v_total = 0 THEN
    v_rate := 0;
  ELSE
    v_rate := round((v_correct::numeric / v_total), 4);
  END IF;

  FOR rec IN
    SELECT
      subject,
      coalesce(nullif(btrim(topic), ''), nullif(btrim(unit), ''), '未分類') AS unit,
      count(*) AS total,
      count(*) FILTER (WHERE public.effective_problem_correct(is_correct, id)) AS correct
    FROM public.problems
    WHERE child_id = p_child_id
      AND is_correct IS NOT NULL
    GROUP BY subject, coalesce(nullif(btrim(topic), ''), nullif(btrim(unit), ''), '未分類')
  LOOP
    v_stats := jsonb_set(
      v_stats,
      ARRAY[coalesce(rec.subject::text, 'other'), 'units', rec.unit],
      jsonb_build_object(
        'correct', rec.correct,
        'total', rec.total,
        'rate', round((rec.correct::numeric / rec.total), 4),
        'weak', (rec.total >= 3 AND (rec.correct::numeric / rec.total) < 0.7)
      ),
      true
    );

    IF rec.total >= 3 AND (rec.correct::numeric / rec.total) < 0.7 THEN
      v_weak := v_weak || jsonb_build_array(
        jsonb_build_object(
          'subject', rec.subject,
          'unit', rec.unit,
          'correct', rec.correct,
          'total', rec.total,
          'rate', round((rec.correct::numeric / rec.total), 4)
        )
      );
      v_priority := v_priority || jsonb_build_array(rec.unit);
    END IF;
  END LOOP;

  FOR rec IN
    SELECT
      subject,
      count(*) AS total,
      count(*) FILTER (WHERE public.effective_problem_correct(is_correct, id)) AS correct
    FROM public.problems
    WHERE child_id = p_child_id
      AND is_correct IS NOT NULL
    GROUP BY subject
  LOOP
    v_stats := jsonb_set(
      v_stats,
      ARRAY[coalesce(rec.subject::text, 'other')],
      coalesce(v_stats -> coalesce(rec.subject::text, 'other'), '{}'::jsonb) ||
        jsonb_build_object(
          'correct', rec.correct,
          'total', rec.total,
          'foundation_rate', round((rec.correct::numeric / rec.total), 4)
        ),
      true
    );
  END LOOP;

  IF v_total < 5 THEN
    v_level := 'watch';
    v_summary := 'データ蓄積中。まずは継続スキャンを優先。';
  ELSIF v_rate < 0.45 OR jsonb_array_length(v_weak) >= 4 THEN
    v_level := 'critical';
    v_summary := '基礎の穴が広い。苦手単元を絞って解き直しを固定する。';
  ELSIF v_rate < 0.70 OR jsonb_array_length(v_weak) >= 1 THEN
    v_level := 'needs_review';
    v_summary := '定着が不安定な単元がある。1日3〜5問の復習枠を守る。';
  ELSE
    v_level := 'solid';
    v_summary := '基礎は安定。間隔を伸ばしつつ新規単元へ進めてよい。';
  END IF;

  UPDATE public.child_cartes
  SET
    foundation_rate = v_rate,
    weak_units = v_weak,
    subject_stats = v_stats,
    triage = jsonb_build_object(
      'level', v_level,
      'priority_units', v_priority,
      'summary', v_summary
    ),
    scan_count = (SELECT count(*) FROM public.scans WHERE child_id = p_child_id AND status = 'completed'),
    problem_count = v_total,
    last_scan_at = (
      SELECT max(completed_at) FROM public.scans WHERE child_id = p_child_id AND status = 'completed'
    ),
    updated_at = now()
  WHERE child_id = p_child_id;
END;
$$;
