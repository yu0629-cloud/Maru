-- 英語圏の主要教科を subject_code に追加する。値の利用は次マイグレーション。

ALTER TYPE public.subject_code ADD VALUE IF NOT EXISTS 'spelling_phonics';
ALTER TYPE public.subject_code ADD VALUE IF NOT EXISTS 'reading';
ALTER TYPE public.subject_code ADD VALUE IF NOT EXISTS 'writing_grammar';
ALTER TYPE public.subject_code ADD VALUE IF NOT EXISTS 'social_studies';
ALTER TYPE public.subject_code ADD VALUE IF NOT EXISTS 'world_languages';

COMMENT ON TYPE public.subject_code IS
  'プリント教科。math / japanese / spelling_phonics / reading / writing_grammar / science / social_studies / world_languages / other。旧 english→world_languages、旧 social→social_studies';
