-- Storage パス規約: {bucket}/{parent_id}/{child_id}/{scan_or_problem_id}/file

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'scan-originals',
    'scan-originals',
    false,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'scan-annotated',
    'scan-annotated',
    false,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'problem-crops',
    'problem-crops',
    false,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'problem-blanks',
    'problem-blanks',
    false,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  )
ON CONFLICT (id) DO NOTHING;

CREATE POLICY scan_originals_parent ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'scan-originals'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'scan-originals'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY scan_annotated_parent ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'scan-annotated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'scan-annotated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY problem_crops_parent ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'problem-crops'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'problem-crops'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY problem_blanks_parent ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'problem-blanks'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'problem-blanks'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
