-- 問題単位カルテ: 定着ステージ・累積ミス・おやすみBOX
ALTER TABLE public.review_queue
  ADD COLUMN IF NOT EXISTS review_stage SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mistake_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

UPDATE public.review_queue
SET mistake_count = GREATEST(mistake_count, consecutive_misses)
WHERE mistake_count < consecutive_misses;

UPDATE public.review_queue
SET review_stage = 3
WHERE status = 'mastered' AND review_stage < 3;

UPDATE public.review_queue
SET is_archived = true, status = 'retired'
WHERE is_archived = false
  AND status IS DISTINCT FROM 'mastered'
  AND next_review_on <= CURRENT_DATE - 30;

CREATE OR REPLACE FUNCTION public.archive_stale_question_records(p_child_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.review_queue
  SET is_archived = true, status = 'retired'
  WHERE is_archived = false
    AND status IS DISTINCT FROM 'mastered'
    AND next_review_on <= CURRENT_DATE - 30
    AND (p_child_id IS NULL OR child_id = p_child_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_incorrect_problems(p_scan_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.review_queue (
    child_id, problem_id, status, next_review_on, review_stage, mistake_count, is_archived
  )
  SELECT
    p.child_id,
    p.id,
    'queued',
    CURRENT_DATE + 1,
    0,
    1,
    false
  FROM public.problems p
  WHERE p.scan_id = p_scan_id
    AND (
      p.is_correct IS DISTINCT FROM TRUE
      OR p.mistake_type = 'blank'
      OR COALESCE(btrim(p.student_answer), '') = ''
    )
  ON CONFLICT (child_id, problem_id) DO UPDATE
  SET
    status = 'queued',
    review_stage = 0,
    mistake_count = public.review_queue.mistake_count + 1,
    next_review_on = CURRENT_DATE + 1,
    last_reviewed_at = now(),
    last_result = false,
    is_archived = false,
    consecutive_misses = public.review_queue.consecutive_misses + 1,
    consecutive_hits = 0,
    interval_days = 1;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.review_queue rq
  SET
    review_stage = LEAST(3, rq.review_stage + 1),
    last_reviewed_at = now(),
    last_result = true,
    consecutive_hits = rq.consecutive_hits + 1,
    consecutive_misses = 0,
    next_review_on = CASE
      WHEN LEAST(3, rq.review_stage + 1) = 1 THEN CURRENT_DATE + 3
      WHEN LEAST(3, rq.review_stage + 1) = 2 THEN CURRENT_DATE + 7
      ELSE rq.next_review_on
    END,
    status = CASE
      WHEN LEAST(3, rq.review_stage + 1) >= 3 THEN 'mastered'
      ELSE 'active'
    END,
    is_archived = false
  FROM public.problems p
  WHERE p.scan_id = p_scan_id
    AND p.id = rq.problem_id
    AND p.is_correct IS TRUE
    AND COALESCE(p.mistake_type, '') IS DISTINCT FROM 'blank'
    AND COALESCE(btrim(p.student_answer), '') <> '';

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_daily_reviews(
  p_child_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max INTEGER;
  v_existing INTEGER;
  v_slots INTEGER;
  v_inserted INTEGER := 0;
BEGIN
  PERFORM public.archive_stale_question_records(p_child_id);

  SELECT (value ->> 'daily_max')::int INTO v_max
  FROM public.app_settings
  WHERE key = 'review';

  v_max := least(coalesce(v_max, 5), 6);

  SELECT count(*) INTO v_existing
  FROM public.daily_review_assignments
  WHERE child_id = p_child_id
    AND review_date = p_date;

  v_slots := v_max - v_existing;
  IF v_slots <= 0 THEN
    RETURN 0;
  END IF;

  WITH due AS (
    SELECT rq.id
    FROM public.review_queue rq
    WHERE rq.child_id = p_child_id
      AND rq.is_archived = false
      AND rq.status IN ('queued', 'active')
      AND rq.next_review_on <= p_date
      AND NOT EXISTS (
        SELECT 1
        FROM public.daily_review_assignments a
        WHERE a.review_queue_id = rq.id
          AND a.review_date = p_date
      )
    ORDER BY rq.mistake_count DESC, rq.next_review_on ASC, rq.created_at ASC
    LIMIT v_slots
  ),
  numbered AS (
    SELECT id, row_number() OVER () + v_existing AS sort_order
    FROM due
  )
  INSERT INTO public.daily_review_assignments (
    child_id, review_date, review_queue_id, sort_order
  )
  SELECT p_child_id, p_date, id, sort_order
  FROM numbered;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  UPDATE public.review_queue
  SET status = 'active'
  WHERE id IN (
    SELECT review_queue_id
    FROM public.daily_review_assignments
    WHERE child_id = p_child_id AND review_date = p_date
  )
  AND status = 'queued';

  RETURN v_inserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_review_result(
  p_review_queue_id UUID,
  p_is_correct BOOLEAN
)
RETURNS public.review_item_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.review_queue%ROWTYPE;
  v_leech_at INTEGER;
  v_next_stage SMALLINT;
BEGIN
  SELECT * INTO v_item
  FROM public.review_queue
  WHERE id = p_review_queue_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REVIEW_ITEM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT (value ->> 'leech_miss_threshold')::int
  INTO v_leech_at
  FROM public.app_settings
  WHERE key = 'review';

  v_leech_at := coalesce(v_leech_at, 3);

  INSERT INTO public.review_attempts (review_queue_id, child_id, is_correct)
  VALUES (p_review_queue_id, v_item.child_id, p_is_correct);

  UPDATE public.daily_review_assignments
  SET completed = true
  WHERE review_queue_id = p_review_queue_id
    AND review_date = CURRENT_DATE;

  IF p_is_correct THEN
    v_next_stage := least(3, coalesce(v_item.review_stage, 0) + 1);
    v_item.review_stage := v_next_stage;
    v_item.consecutive_hits := v_item.consecutive_hits + 1;
    v_item.consecutive_misses := 0;
    v_item.is_archived := false;
    v_item.last_result := true;
    IF v_next_stage = 1 THEN
      v_item.interval_days := 3;
      v_item.next_review_on := CURRENT_DATE + 3;
      v_item.status := 'active';
    ELSIF v_next_stage = 2 THEN
      v_item.interval_days := 7;
      v_item.next_review_on := CURRENT_DATE + 7;
      v_item.status := 'active';
    ELSE
      v_item.status := 'mastered';
    END IF;
  ELSE
    v_item.review_stage := 0;
    v_item.mistake_count := coalesce(v_item.mistake_count, 0) + 1;
    v_item.consecutive_misses := v_item.consecutive_misses + 1;
    v_item.consecutive_hits := 0;
    v_item.interval_days := 1;
    v_item.next_review_on := CURRENT_DATE + 1;
    v_item.is_archived := false;
    v_item.last_result := false;
    IF v_item.consecutive_misses >= v_leech_at THEN
      v_item.status := 'leech';
      v_item.leech_at := now();
    ELSE
      v_item.status := 'active';
    END IF;
  END IF;

  UPDATE public.review_queue
  SET
    status = v_item.status,
    next_review_on = v_item.next_review_on,
    interval_days = v_item.interval_days,
    ease_factor = v_item.ease_factor,
    consecutive_misses = v_item.consecutive_misses,
    consecutive_hits = v_item.consecutive_hits,
    review_count = review_count + 1,
    last_result = v_item.last_result,
    last_reviewed_at = now(),
    leech_at = v_item.leech_at,
    review_stage = v_item.review_stage,
    mistake_count = v_item.mistake_count,
    is_archived = v_item.is_archived
  WHERE id = p_review_queue_id;

  RETURN v_item.status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_stale_question_records(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_incorrect_problems(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_daily_reviews(UUID, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_review_result(UUID, BOOLEAN) TO authenticated;
