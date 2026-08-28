export function todayIso(now?: Date): string;
export function isDue(nextReviewOn: string, today?: string): boolean;
export function selectDailyReviews<
  T extends { status: string; nextReviewOn: string; consecutiveMisses: number },
>(
  items: T[],
  options?: { min?: number; max?: number; today?: string; masteryByKey?: Record<string, { isMastered?: boolean; nextReviewDate?: string | null }> },
): {
  daily: T[];
  truncated: boolean;
  belowMin: boolean;
  available: number;
};
export function isolateLeeches<T extends { status: string }>(items: T[]): T[];
export function applyReviewResult<T extends Record<string, unknown>>(
  item: T,
  isCorrect: boolean,
  options?: { leechMissThreshold?: number; masteredIntervalDays?: number; masteredHitThreshold?: number },
): T;
