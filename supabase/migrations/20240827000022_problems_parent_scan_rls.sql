-- カルテ・履歴はクォータと同じ親（scans.parent_id = auth.uid()）で読めるようにする。
-- problems.child_id が null / 別子どもでも、親のスキャンに紐づく行は見える。

DROP POLICY IF EXISTS problems_parent ON public.problems;

CREATE POLICY problems_parent ON public.problems
  FOR ALL TO authenticated
  USING (
    public.owns_child(child_id)
    OR EXISTS (
      SELECT 1
      FROM public.scans s
      WHERE s.id = scan_id
        AND s.parent_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    public.owns_child(child_id)
    OR EXISTS (
      SELECT 1
      FROM public.scans s
      WHERE s.id = scan_id
        AND s.parent_id = (SELECT auth.uid())
    )
  );

UPDATE public.problems AS p
SET child_id = s.child_id
FROM public.scans AS s
WHERE p.scan_id = s.id
  AND s.child_id IS NOT NULL
  AND p.child_id IS DISTINCT FROM s.child_id;
