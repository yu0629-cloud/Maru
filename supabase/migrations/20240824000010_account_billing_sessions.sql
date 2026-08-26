-- 子ども対象教科、端末の追い出し、課金同期 RPC

ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS target_subjects public.subject_code[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.children.target_subjects IS '家庭学習で見る教科。UI の対象教科チップ';

CREATE OR REPLACE FUNCTION public.apply_subscription_entitlement(
  p_parent_id UUID,
  p_tier public.subscription_tier,
  p_app_user_id TEXT DEFAULT NULL
)
RETURNS public.subscription_tier
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET
    subscription_tier = p_tier,
    revenuecat_app_user_id = COALESCE(p_app_user_id, revenuecat_app_user_id, p_parent_id::text)
  WHERE id = p_parent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  RETURN p_tier;
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
  UPDATE public.device_sessions
  SET last_seen_at = now()
  WHERE parent_id = p_parent_id
    AND device_id = p_device_id;

  RETURN FOUND;
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
DECLARE
  v_max INTEGER;
  v_existing UUID;
  v_count INTEGER;
  v_id UUID;
  v_evicted TEXT;
BEGIN
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

GRANT EXECUTE ON FUNCTION public.apply_subscription_entitlement(UUID, public.subscription_tier, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.heartbeat_device_session(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_device_session(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.credit_scan_tickets(UUID, TEXT, TEXT) TO service_role;
