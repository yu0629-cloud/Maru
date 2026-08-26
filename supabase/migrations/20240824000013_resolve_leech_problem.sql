-- 親が要指導リスト（Leech）を手動でマスター / 復習復帰する

CREATE OR REPLACE FUNCTION public.effective_problem_correct(
  p_is_correct BOOLEAN,
  p_problem_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(p_is_correct, false)
      OR EXISTS (
        SELECT 1
        FROM public.review_queue rq
        WHERE rq.problem_id = p_problem_id
          AND rq.status = 'mastered'
      );
$$;

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
      coalesce(unit, '未分類') AS unit,
      count(*) AS total,
      count(*) FILTER (WHERE public.effective_problem_correct(is_correct, id)) AS correct
    FROM public.problems
    WHERE child_id = p_child_id
      AND is_correct IS NOT NULL
    GROUP BY subject, coalesce(unit, '未分類')
  LOOP
    v_stats := jsonb_set(
      v_stats,
      ARRAY[coalesce(rec.subject::text, 'other'), 'units', rec.unit],
      jsonb_build_object(
        'correct', rec.correct,
        'total', rec.total,
        'rate', round((rec.correct::numeric / rec.total), 4),
        'weak', (rec.total >= 3 AND (rec.correct::numeric / rec.total) < 0.6)
      ),
      true
    );

    IF rec.total >= 3 AND (rec.correct::numeric / rec.total) < 0.6 THEN
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

CREATE OR REPLACE FUNCTION public.resolve_leech_problem(
  problem_id UUID,
  action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.review_queue%ROWTYPE;
  v_next DATE;
BEGIN
  IF action IS NULL OR action NOT IN ('master', 'requeue') THEN
    RAISE EXCEPTION 'INVALID_LEECH_ACTION' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_item
  FROM public.review_queue rq
  WHERE rq.problem_id = resolve_leech_problem.problem_id
    AND rq.status = 'leech'
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT * INTO v_item
    FROM public.review_queue rq
    WHERE rq.problem_id = resolve_leech_problem.problem_id
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    SELECT * INTO v_item
    FROM public.review_queue rq
    WHERE rq.id = resolve_leech_problem.problem_id
    FOR UPDATE;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LEECH_ITEM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT public.owns_child(v_item.child_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  v_next := (now() AT TIME ZONE 'Asia/Tokyo')::date + 1;

  IF action = 'master' THEN
    UPDATE public.review_queue
    SET
      status = 'mastered',
      consecutive_misses = 0,
      consecutive_hits = GREATEST(consecutive_hits, 3),
      leech_at = NULL,
      last_result = true,
      last_reviewed_at = now(),
      interval_days = GREATEST(interval_days, 30)
    WHERE id = v_item.id
    RETURNING * INTO v_item;
  ELSE
    UPDATE public.review_queue
    SET
      status = 'queued',
      consecutive_misses = 0,
      leech_at = NULL,
      interval_days = 1,
      next_review_on = v_next,
      last_reviewed_at = now()
    WHERE id = v_item.id
    RETURNING * INTO v_item;
  END IF;

  PERFORM public.update_child_carte(v_item.child_id);

  RETURN jsonb_build_object(
    'ok', true,
    'action', action,
    'status', v_item.status,
    'next_review_on', v_item.next_review_on,
    'child_id', v_item.child_id,
    'problem_id', v_item.problem_id,
    'review_queue_id', v_item.id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_leech_problem(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_child_carte(UUID) TO authenticated, service_role;
