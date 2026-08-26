-- ログイン時の register_device_session を 2 台制限の追い出し実装に揃える。
-- 3 台目は最古端末を DELETE し、当該端末の Realtime / heartbeat でログアウトする。

ALTER TABLE public.device_sessions REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.device_sessions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DROP FUNCTION IF EXISTS public.register_device_session(UUID, TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.register_device_session(
  p_parent_id UUID,
  p_device_id TEXT,
  p_device_name TEXT DEFAULT NULL,
  p_platform TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max INTEGER;
  v_existing UUID;
  v_count INTEGER;
  v_id UUID;
  v_evicted TEXT;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_parent_id THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT (value ->> 'max_concurrent_devices')::int INTO v_max
  FROM public.app_settings
  WHERE key = 'session';

  v_max := coalesce(v_max, 2);

  SELECT id INTO v_existing
  FROM public.device_sessions
  WHERE parent_id = p_parent_id
    AND device_id = p_device_id;

  IF v_existing IS NOT NULL THEN
    UPDATE public.device_sessions
    SET
      last_seen_at = now(),
      device_name = coalesce(p_device_name, device_name),
      platform = coalesce(p_platform, platform)
    WHERE id = v_existing;

    RETURN jsonb_build_object(
      'session_id', v_existing,
      'evicted_device_id', NULL,
      'status', 'refreshed'
    );
  END IF;

  SELECT count(*) INTO v_count
  FROM public.device_sessions
  WHERE parent_id = p_parent_id;

  IF v_count >= v_max THEN
    SELECT device_id INTO v_evicted
    FROM public.device_sessions
    WHERE parent_id = p_parent_id
    ORDER BY last_seen_at ASC
    LIMIT 1;

    DELETE FROM public.device_sessions
    WHERE parent_id = p_parent_id
      AND device_id = v_evicted;
  END IF;

  INSERT INTO public.device_sessions (parent_id, device_id, device_name, platform)
  VALUES (p_parent_id, p_device_id, p_device_name, p_platform)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'session_id', v_id,
    'evicted_device_id', v_evicted,
    'status', CASE WHEN v_evicted IS NULL THEN 'registered' ELSE 'replaced_oldest' END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_device_session(
  p_parent_id UUID,
  p_device_id TEXT,
  p_device_name TEXT DEFAULT NULL,
  p_platform TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.register_device_session(p_parent_id, p_device_id, p_device_name, p_platform);
END;
$$;

CREATE OR REPLACE FUNCTION public.heartbeat_device_session(
  p_parent_id UUID,
  p_device_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() IS DISTINCT FROM p_parent_id THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  UPDATE public.device_sessions
  SET last_seen_at = now()
  WHERE parent_id = p_parent_id
    AND device_id = p_device_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_device_session(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_device_session(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_device_session(UUID, TEXT) TO authenticated;
