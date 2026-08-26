-- 親は自分と自分の子どもに紐づく行だけ読める

CREATE OR REPLACE FUNCTION public.owns_child(p_child_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.children
    WHERE id = p_child_id
      AND parent_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.owns_child(UUID) TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_cartes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_review_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_ticket_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_ticket_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quota_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_self ON public.profiles
  FOR ALL TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY children_parent ON public.children
  FOR ALL TO authenticated
  USING (parent_id = auth.uid())
  WITH CHECK (parent_id = auth.uid());

CREATE POLICY cartes_parent ON public.child_cartes
  FOR ALL TO authenticated
  USING (public.owns_child(child_id))
  WITH CHECK (public.owns_child(child_id));

CREATE POLICY scans_parent ON public.scans
  FOR ALL TO authenticated
  USING (parent_id = auth.uid())
  WITH CHECK (parent_id = auth.uid() AND public.owns_child(child_id));

CREATE POLICY problems_parent ON public.problems
  FOR ALL TO authenticated
  USING (public.owns_child(child_id))
  WITH CHECK (public.owns_child(child_id));

CREATE POLICY review_queue_parent ON public.review_queue
  FOR ALL TO authenticated
  USING (public.owns_child(child_id))
  WITH CHECK (public.owns_child(child_id));

CREATE POLICY daily_review_parent ON public.daily_review_assignments
  FOR ALL TO authenticated
  USING (public.owns_child(child_id))
  WITH CHECK (public.owns_child(child_id));

CREATE POLICY review_attempts_parent ON public.review_attempts
  FOR ALL TO authenticated
  USING (public.owns_child(child_id))
  WITH CHECK (public.owns_child(child_id));

CREATE POLICY print_jobs_parent ON public.print_jobs
  FOR ALL TO authenticated
  USING (parent_id = auth.uid())
  WITH CHECK (parent_id = auth.uid() AND public.owns_child(child_id));

CREATE POLICY plan_entitlements_read ON public.plan_entitlements
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY ticket_products_read ON public.scan_ticket_products
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY app_settings_read ON public.app_settings
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY monthly_usage_parent ON public.monthly_usage
  FOR ALL TO authenticated
  USING (parent_id = auth.uid())
  WITH CHECK (parent_id = auth.uid());

CREATE POLICY ticket_purchases_parent ON public.scan_ticket_purchases
  FOR SELECT TO authenticated
  USING (parent_id = auth.uid());

CREATE POLICY quota_ledger_parent ON public.quota_ledger
  FOR SELECT TO authenticated
  USING (parent_id = auth.uid());

CREATE POLICY device_sessions_parent ON public.device_sessions
  FOR ALL TO authenticated
  USING (parent_id = auth.uid())
  WITH CHECK (parent_id = auth.uid());
