-- RLS を通さないスキャン作成。auth.uid() が親で、その子どもだけ挿入できる。

CREATE OR REPLACE FUNCTION public.create_scan(p_child_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent_id UUID := auth.uid();
  v_id UUID;
BEGIN
  IF v_parent_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.children
    WHERE id = p_child_id
      AND parent_id = v_parent_id
  ) THEN
    RAISE EXCEPTION 'CHILD_NOT_OWNED' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.scans (parent_id, child_id, status)
  VALUES (v_parent_id, p_child_id, 'uploading')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_scan(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_scan(UUID) TO authenticated;
