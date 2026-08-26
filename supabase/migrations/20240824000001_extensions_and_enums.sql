-- MARU: 共通拡張とドメイン列挙型
-- タイムゾーンは課金月次リセットのため Asia/Tokyo を前提にする。

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE public.subscription_tier AS ENUM ('free', 'standard', 'family');

CREATE TYPE public.grade_code AS ENUM (
  'e1', 'e2', 'e3', 'e4', 'e5', 'e6',
  'j1', 'j2', 'j3'
);

CREATE TYPE public.subject_code AS ENUM (
  'math',
  'japanese',
  'science',
  'social',
  'english',
  'other'
);

CREATE TYPE public.scan_status AS ENUM (
  'pending',
  'uploading',
  'grading',
  'inpainting',
  'completed',
  'failed'
);

CREATE TYPE public.quota_source AS ENUM ('free', 'monthly', 'ticket');

CREATE TYPE public.review_item_status AS ENUM (
  'queued',
  'active',
  'leech',
  'mastered',
  'retired'
);

CREATE TYPE public.print_grid_type AS ENUM ('graph', 'squared', 'lined', 'blank');

CREATE TYPE public.triage_level AS ENUM ('solid', 'watch', 'needs_review', 'critical');

COMMENT ON TYPE public.subscription_tier IS 'free=初回10枚, standard=月150枚/1人, family=月400枚/3人';
COMMENT ON TYPE public.review_item_status IS 'leech=3回連続ミスで自動退場。daily queue から除外する';
