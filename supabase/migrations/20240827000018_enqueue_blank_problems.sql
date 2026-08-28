-- 空欄・未回答も不正解と同じく復習キューへ入れる
CREATE OR REPLACE FUNCTION public.enqueue_incorrect_problems(p_scan_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.review_queue (child_id, problem_id, status, next_review_on)
  SELECT
    p.child_id,
    p.id,
    'queued',
    CURRENT_DATE + 1
  FROM public.problems p
  WHERE p.scan_id = p_scan_id
    AND (
      p.is_correct IS DISTINCT FROM TRUE
      OR p.mistake_type = 'blank'
      OR COALESCE(btrim(p.student_answer), '') = ''
    )
  ON CONFLICT (child_id, problem_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
