/**
 * カメラ撮影からカルテ更新までのクライアント側オーケストレーション。
 * API キーは持たず、実処理は Edge Functions に委譲する。
 */
export const gradingFlowSteps = [
  "capture",
  "upload-original",
  "insert-scan",
  "consume-quota",
  "invoke-grade-scan",
  "poll-scan-status",
  "show-result",
] as const;

export type GradingFlowStep = (typeof gradingFlowSteps)[number];
