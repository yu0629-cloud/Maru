export const REVIEW_STAGE_DAYS: { 1: 7; 2: 14; 3: 30 };
export const RECENT_MISS_MAX_DAYS: 7;
export const SETTLING_RATE_MIN: 0.5;
export const SETTLING_RATE_MAX: 0.8;

export type TopicMastery = {
  isMastered: boolean;
  masteredAt: string | null;
  reviewStage: number;
  nextReviewDate: string | null;
};

export type TopicMasteryMap = Record<string, TopicMastery>;

export function todayIso(now?: Date): string;
export function addDaysIso(iso?: string | null, days?: number): string;
export function daysUntil(iso?: string | null, today?: string): number | null;
export function daysAgo(iso?: string | null, today?: string): number | null;
export function topicKey(subject?: string | null, topic?: string | null): string;
export function emptyMastery(): TopicMastery;
export function normalizeMastery(value?: unknown): TopicMastery;
export function intervalDaysForStage(stage?: number | null): number | null;
export function nextReviewDateForStage(stage?: number | null, fromIso?: string): string | null;
export function markTopicMastered(record?: TopicMastery | null, now?: Date): TopicMastery;
export function unmarkTopicMastered(): TopicMastery;
export function advanceMasteryOnCorrect(record?: TopicMastery | null, now?: Date): TopicMastery;
export function applyTopicMastery<T extends { key: string; rate: number }>(
  split: { strong?: T[]; weak?: T[]; settling?: T[]; mastered?: T[] } | null | undefined,
  masteryByKey?: TopicMasteryMap,
): { strong: Array<T & { isMastered: boolean }>; weak: Array<T & { isMastered: boolean }>; settling: Array<T & { isMastered: boolean }>; mastered: Array<T & { isMastered: boolean }> };
export function selectBalancedReviews<T extends { id: string; status?: string; nextReviewOn?: string }>(
  items: T[],
  options?: {
    min?: number;
    max?: number;
    today?: string;
    masteryByKey?: TopicMasteryMap;
  },
): {
  daily: T[];
  truncated: boolean;
  belowMin: boolean;
  available: number;
};
