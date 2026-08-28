-- 画像実体の期限付き削除。採点テキスト（scans / problems の行）は消さない。
--
-- 原本: 無料 7日かつ最新10枚以外 / 有料 60日
-- 切り抜き・白紙化: 復習完了（mastered/retired）または原本 TTL 後。復習中は残す。

ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS original_purged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS annotated_purged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS thumbnail_storage_path TEXT;

ALTER TABLE public.problems
  ADD COLUMN IF NOT EXISTS crop_purged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blank_purged_at TIMESTAMPTZ;

COMMENT ON COLUMN public.scans.original_storage_path IS
  '撮影原本。パージ後は NULL。採点テキスト行は残す';
COMMENT ON COLUMN public.scans.original_purged_at IS
  'Storage から原本を削除した時刻。UI は画像なしフォールバックを出す';
COMMENT ON COLUMN public.scans.annotated_purged_at IS
  '採点オーバーレイ画像を Storage から削除した時刻';
COMMENT ON COLUMN public.scans.thumbnail_storage_path IS
  '有料プラン向け軽量サムネ（任意）。未生成なら原本パージ後は画像なし';
COMMENT ON COLUMN public.problems.cropped_storage_path IS
  '不正解の切り抜き。復習中は保持し、完了または原本 TTL 後に NULL';
COMMENT ON COLUMN public.problems.crop_purged_at IS
  '切り抜き実体を削除した時刻。カルテのテキストは残す';
COMMENT ON COLUMN public.problems.blank_purged_at IS
  '白紙化画像を削除した時刻';

CREATE INDEX IF NOT EXISTS scans_original_purge_candidates_idx
  ON public.scans (parent_id, created_at DESC)
  WHERE original_storage_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS scans_annotated_purge_candidates_idx
  ON public.scans (created_at)
  WHERE annotated_storage_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS problems_crop_purge_candidates_idx
  ON public.problems (created_at)
  WHERE cropped_storage_path IS NOT NULL OR blanked_storage_path IS NOT NULL;

-- 定期実行は Edge Function `purge-expired-media`。
-- 例（Dashboard の Scheduled Functions、または外部 cron）:
-- POST /functions/v1/purge-expired-media
-- Header: x-cron-secret: <PURGE_CRON_SECRET>
--
-- pg_cron + pg_net を使う場合の雛形（有効化はプロジェクトごとに判断）:
-- select cron.schedule(
--   'purge-expired-media-daily',
--   '20 3 * * *',
--   $$select net.http_post(
--     url := current_setting('app.settings.supabase_url') || '/functions/v1/purge-expired-media',
--     headers := jsonb_build_object('x-cron-secret', current_setting('app.settings.purge_cron_secret')),
--     body := '{}'::jsonb
--   )$$
-- );
