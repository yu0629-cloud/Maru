-- 旧 english / social を新キーへ寄せる（ADD VALUE と同一トランザクションでは使えない環境向けに分離）

UPDATE public.scans
SET subject = 'world_languages'
WHERE subject::text = 'english';

UPDATE public.scans
SET subject = 'social_studies'
WHERE subject::text = 'social';

UPDATE public.problems
SET subject = 'world_languages'
WHERE subject::text = 'english';

UPDATE public.problems
SET subject = 'social_studies'
WHERE subject::text = 'social';

UPDATE public.children
SET target_subjects = ARRAY(
  SELECT CASE v::text
    WHEN 'english' THEN 'world_languages'::public.subject_code
    WHEN 'social' THEN 'social_studies'::public.subject_code
    ELSE v
  END
  FROM unnest(target_subjects) AS v
)
WHERE target_subjects && ARRAY['english'::public.subject_code, 'social'::public.subject_code];
