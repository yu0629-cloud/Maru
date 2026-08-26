-- scans INSERT を軽くする。
-- クォータ消費トリガーは scans には付いていない。遅い原因は auth.uid() を行ごとに評価する RLS。
-- (select auth.uid()) で InitPlan 化し、owns_child を EXISTS にインラインする。

DROP POLICY IF EXISTS scans_parent ON public.scans;

CREATE POLICY scans_select ON public.scans
  FOR SELECT TO authenticated
  USING (parent_id = (SELECT auth.uid()));

CREATE POLICY scans_insert ON public.scans
  FOR INSERT TO authenticated
  WITH CHECK (
    parent_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.children c
      WHERE c.id = child_id
        AND c.parent_id = (SELECT auth.uid())
    )
  );

CREATE POLICY scans_update ON public.scans
  FOR UPDATE TO authenticated
  USING (parent_id = (SELECT auth.uid()))
  WITH CHECK (parent_id = (SELECT auth.uid()));

CREATE POLICY scans_delete ON public.scans
  FOR DELETE TO authenticated
  USING (parent_id = (SELECT auth.uid()));
