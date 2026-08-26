-- 共通トリガー、クォータ消費、カルテ更新、復習割当、端末制限

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE TRIGGER children_set_updated_at
  BEFORE UPDATE ON public.children
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

CREATE OR REPLACE FUNCTION public.tokyo_month_start(p_at TIMESTAMPTZ DEFAULT now())
RETURNS DATE
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT date_trunc('month', p_at AT TIME ZONE 'Asia/Tokyo')::date;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, revenuecat_app_user_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', ''),
    NEW.id::text
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

CREATE OR REPLACE FUNCTION public.init_child_carte()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.child_cartes (child_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER children_init_carte
  AFTER INSERT ON public.children
  FOR EACH ROW EXECUTE PROCEDURE public.init_child_carte();

CREATE OR REPLACE FUNCTION public.set_first_child_as_current()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET current_child_id = NEW.id
  WHERE id = NEW.parent_id
    AND current_child_id IS NULL;

  RETURN NEW;
END;
$$;

CREATE TRIGGER children_set_current
  AFTER INSERT ON public.children
  FOR EACH ROW EXECUTE PROCEDURE public.set_first_child_as_current();

CREATE OR REPLACE FUNCTION public.enforce_child_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier public.subscription_tier;
  v_max INTEGER;
  v_count INTEGER;
BEGIN
  SELECT subscription_tier INTO v_tier
  FROM public.profiles
  WHERE id = NEW.parent_id;

  SELECT max_children INTO v_max
  FROM public.plan_entitlements
  WHERE tier = v_tier;

  SELECT count(*) INTO v_count
  FROM public.children
  WHERE parent_id = NEW.parent_id
    AND id IS DISTINCT FROM NEW.id;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'CHILD_LIMIT_REACHED: tier=% max=%', v_tier, v_max
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER children_enforce_limit
  BEFORE INSERT OR UPDATE OF parent_id ON public.children
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_child_limit();

-- スキャン1枚分の残数を原子的に消費する。
-- フリー: free_scans_remaining のみ
-- 有料: 月次残数 → 追加チケット。チケット購入は有料会員限定。
CREATE OR REPLACE FUNCTION public.consume_scan_quota(p_parent_id UUID, p_scan_id UUID DEFAULT NULL)
RETURNS public.quota_source
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_ent public.plan_entitlements%ROWTYPE;
  v_month DATE := public.tokyo_month_start();
  v_usage public.monthly_usage%ROWTYPE;
  v_source public.quota_source;
  v_monthly_remaining INTEGER := 0;
BEGIN
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_parent_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_ent
  FROM public.plan_entitlements
  WHERE tier = v_profile.subscription_tier;

  IF v_profile.subscription_tier = 'free' THEN
    IF v_profile.free_scans_remaining <= 0 THEN
      RAISE EXCEPTION 'QUOTA_EXCEEDED' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.profiles
    SET free_scans_remaining = free_scans_remaining - 1
    WHERE id = p_parent_id;

    v_source := 'free';
  ELSE
    INSERT INTO public.monthly_usage (parent_id, year_month, scans_used, quota_limit)
    VALUES (p_parent_id, v_month, 0, v_ent.monthly_scan_quota)
    ON CONFLICT (parent_id, year_month) DO UPDATE
      SET quota_limit = EXCLUDED.quota_limit
    RETURNING * INTO v_usage;

    SELECT * INTO v_usage
    FROM public.monthly_usage
    WHERE parent_id = p_parent_id AND year_month = v_month
    FOR UPDATE;

    v_monthly_remaining := v_usage.quota_limit - v_usage.scans_used;

    IF v_monthly_remaining > 0 THEN
      UPDATE public.monthly_usage
      SET scans_used = scans_used + 1
      WHERE id = v_usage.id;

      v_source := 'monthly';
      v_monthly_remaining := v_monthly_remaining - 1;
    ELSIF v_profile.extra_ticket_balance > 0 THEN
      UPDATE public.profiles
      SET extra_ticket_balance = extra_ticket_balance - 1
      WHERE id = p_parent_id;

      v_source := 'ticket';
    ELSE
      RAISE EXCEPTION 'QUOTA_EXCEEDED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = p_parent_id;

  INSERT INTO public.quota_ledger (
    parent_id,
    scan_id,
    source,
    delta,
    free_remaining_after,
    monthly_remaining_after,
    ticket_remaining_after,
    note
  ) VALUES (
    p_parent_id,
    p_scan_id,
    v_source,
    -1,
    v_profile.free_scans_remaining,
    v_monthly_remaining,
    v_profile.extra_ticket_balance,
    'scan_consume'
  );

  IF p_scan_id IS NOT NULL THEN
    UPDATE public.scans
    SET quota_source = v_source
    WHERE id = p_scan_id;
  END IF;

  RETURN v_source;
END;
$$;

CREATE OR REPLACE FUNCTION public.credit_scan_tickets(
  p_parent_id UUID,
  p_product_id TEXT,
  p_transaction_id TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_product public.scan_ticket_products%ROWTYPE;
BEGIN
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_parent_id
  FOR UPDATE;

  IF v_profile.subscription_tier = 'free' THEN
    RAISE EXCEPTION 'TICKETS_PAID_ONLY' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_product
  FROM public.scan_ticket_products
  WHERE product_id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'UNKNOWN_PRODUCT' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.scan_ticket_purchases (
    parent_id, product_id, ticket_count, price_jpy, revenuecat_transaction_id
  ) VALUES (
    p_parent_id,
    v_product.product_id,
    v_product.ticket_count,
    v_product.price_jpy,
    p_transaction_id
  );

  UPDATE public.profiles
  SET extra_ticket_balance = extra_ticket_balance + v_product.ticket_count
  WHERE id = p_parent_id
  RETURNING * INTO v_profile;

  INSERT INTO public.quota_ledger (
    parent_id,
    source,
    delta,
    ticket_remaining_after,
    note
  ) VALUES (
    p_parent_id,
    'ticket',
    v_product.ticket_count,
    v_profile.extra_ticket_balance,
    'iap_credit:' || p_product_id
  );

  RETURN v_profile.extra_ticket_balance;
END;
$$;

-- スキャン完了後にカルテ JSONB を再集計し、トリアージを付ける
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
  SELECT count(*), count(*) FILTER (WHERE is_correct)
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
      count(*) FILTER (WHERE is_correct) AS correct
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
      count(*) FILTER (WHERE is_correct) AS correct
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

-- 不正解問題を翌日起点でキュー投入。当日枠は詰まらせない。
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
    AND p.is_correct IS FALSE
  ON CONFLICT (child_id, problem_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
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
  SELECT (value ->> 'daily_max')::int INTO v_max
  FROM public.app_settings
  WHERE key = 'review';

  v_max := coalesce(v_max, 5);

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
      AND rq.status IN ('queued', 'active')
      AND rq.next_review_on <= p_date
      AND NOT EXISTS (
        SELECT 1
        FROM public.daily_review_assignments a
        WHERE a.review_queue_id = rq.id
          AND a.review_date = p_date
      )
    ORDER BY rq.next_review_on ASC, rq.consecutive_misses DESC, rq.created_at ASC
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

-- 復習結果を記録。3連続ミスで Leech 退場。
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
  v_mastered_interval INTEGER;
  v_mastered_hits INTEGER;
  v_next_interval INTEGER;
BEGIN
  SELECT * INTO v_item
  FROM public.review_queue
  WHERE id = p_review_queue_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REVIEW_ITEM_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT
    (value ->> 'leech_miss_threshold')::int,
    (value ->> 'mastered_interval_days')::int,
    (value ->> 'mastered_hit_threshold')::int
  INTO v_leech_at, v_mastered_interval, v_mastered_hits
  FROM public.app_settings
  WHERE key = 'review';

  v_leech_at := coalesce(v_leech_at, 3);
  v_mastered_interval := coalesce(v_mastered_interval, 30);
  v_mastered_hits := coalesce(v_mastered_hits, 3);

  INSERT INTO public.review_attempts (review_queue_id, child_id, is_correct)
  VALUES (p_review_queue_id, v_item.child_id, p_is_correct);

  UPDATE public.daily_review_assignments
  SET completed = true
  WHERE review_queue_id = p_review_queue_id
    AND review_date = CURRENT_DATE;

  IF p_is_correct THEN
    v_next_interval := greatest(1, round(v_item.interval_days * v_item.ease_factor)::int);
    v_item.consecutive_hits := v_item.consecutive_hits + 1;
    v_item.consecutive_misses := 0;
    v_item.interval_days := v_next_interval;
    v_item.next_review_on := CURRENT_DATE + v_next_interval;
    v_item.ease_factor := least(3.00, v_item.ease_factor + 0.10);
    v_item.status := 'active';

    IF v_item.interval_days >= v_mastered_interval
       AND v_item.consecutive_hits >= v_mastered_hits THEN
      v_item.status := 'mastered';
    END IF;
  ELSE
    v_item.consecutive_misses := v_item.consecutive_misses + 1;
    v_item.consecutive_hits := 0;
    v_item.interval_days := 1;
    v_item.next_review_on := CURRENT_DATE + 1;
    v_item.ease_factor := greatest(1.30, v_item.ease_factor - 0.20);

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
    last_result = p_is_correct,
    last_reviewed_at = now(),
    leech_at = v_item.leech_at
  WHERE id = p_review_queue_id;

  RETURN v_item.status;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_device_session(
  p_parent_id UUID,
  p_device_id TEXT,
  p_device_name TEXT DEFAULT NULL,
  p_platform TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max INTEGER;
  v_existing UUID;
  v_count INTEGER;
  v_id UUID;
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

    RETURN v_existing;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.device_sessions
  WHERE parent_id = p_parent_id;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'DEVICE_LIMIT_REACHED' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.device_sessions (parent_id, device_id, device_name, platform)
  VALUES (p_parent_id, p_device_id, p_device_name, p_platform)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_device_session(
  p_parent_id UUID,
  p_device_id TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.device_sessions
  WHERE parent_id = p_parent_id
    AND device_id = p_device_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_scan_quota(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.credit_scan_tickets(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_child_carte(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_incorrect_problems(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_daily_reviews(UUID, DATE) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_review_result(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_device_session(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_device_session(UUID, TEXT) TO authenticated;
