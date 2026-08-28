-- 有料化で未削除原本の保持期限を撮影日+60日へ延長する。
-- すでに original_purged_at がある行は触らない（画像は復元しない。採点テキストは残る）。

ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS original_retain_until TIMESTAMPTZ;

COMMENT ON COLUMN public.scans.original_retain_until IS
  '原本の保持期限。無料は撮影+7日、有料化で撮影+60日へ延長。パージ後は更新しない';

CREATE OR REPLACE FUNCTION public.set_scan_original_retain_until()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_tier public.subscription_tier;
BEGIN
  IF NEW.original_retain_until IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT subscription_tier INTO v_tier
  FROM public.profiles
  WHERE id = NEW.parent_id;
  IF v_tier IN ('standard', 'family') THEN
    NEW.original_retain_until := NEW.created_at + interval '60 days';
  ELSE
    NEW.original_retain_until := NEW.created_at + interval '7 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scans_set_retain_until ON public.scans;
CREATE TRIGGER scans_set_retain_until
  BEFORE INSERT ON public.scans
  FOR EACH ROW
  EXECUTE FUNCTION public.set_scan_original_retain_until();

CREATE OR REPLACE FUNCTION public.extend_media_retention_on_upgrade(p_parent_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.scans
  SET original_retain_until = created_at + interval '60 days'
  WHERE parent_id = p_parent_id
    AND original_purged_at IS NULL
    AND original_storage_path IS NOT NULL
    AND (
      original_retain_until IS NULL
      OR original_retain_until < created_at + interval '60 days'
    );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

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

  IF p_tier IN ('standard', 'family') THEN
    PERFORM public.extend_media_retention_on_upgrade(p_parent_id);
  END IF;

  RETURN p_tier;
END;
$$;

GRANT EXECUTE ON FUNCTION public.extend_media_retention_on_upgrade(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_subscription_entitlement(UUID, public.subscription_tier, TEXT) TO service_role;
