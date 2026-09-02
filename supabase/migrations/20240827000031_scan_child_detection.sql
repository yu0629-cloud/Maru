-- スキャン時の子ども自動判定（名前欄 / 学年）を scans に残す。
-- scans / problems / review_queue の child_id は既存の必須 FK。

ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS detected_child_id UUID REFERENCES public.children (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS detected_child_name TEXT,
  ADD COLUMN IF NOT EXISTS child_detection_reason TEXT,
  ADD COLUMN IF NOT EXISTS child_detection_matched BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.scans.detected_child_id IS 'Gemini が名前欄・学年から推定した子ども。確定 child_id と異なる場合あり';
COMMENT ON COLUMN public.scans.detected_child_name IS 'プリント名前欄から読んだ表記';
COMMENT ON COLUMN public.scans.child_detection_reason IS '自動判定の根拠（日本語）';
COMMENT ON COLUMN public.scans.child_detection_matched IS '登録済み子どもと照合できたか。false なら選択中の子どもへフォールバック';
