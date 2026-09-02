import {
  ARCHIVE_OVERDUE_DAYS,
  RECOMMENDED_PRINT_MAX,
  REVIEW_STAGE_INTERVAL_DAYS,
  applyReviewResult as applyReviewResultImpl,
  applyScanGradesToItems as applyScanGradesToItemsImpl,
  archiveRecord as archiveRecordImpl,
  archiveStaleRecords as archiveStaleRecordsImpl,
  clampReviewStage as clampReviewStageImpl,
  emptyQuestionRecord as emptyQuestionRecordImpl,
  markRecordMastered as markRecordMasteredImpl,
  masteryStars as masteryStarsImpl,
  priorityScore as priorityScoreImpl,
  selectRecommendedReviews as selectRecommendedReviewsImpl,
  toQuestionRecord as toQuestionRecordImpl,
} from "./lib/question-record.mjs";
import type { ReviewQueueItem } from "./select";

export type ReviewStage = 0 | 1 | 2 | 3;

export type QuestionRecord = {
  id: string;
  question_text: string;
  unit_name: string;
  review_stage: ReviewStage;
  mistake_count: number;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  is_archived: boolean;
};

export { ARCHIVE_OVERDUE_DAYS, RECOMMENDED_PRINT_MAX, REVIEW_STAGE_INTERVAL_DAYS };

export function clampReviewStage(value: unknown): ReviewStage {
  return clampReviewStageImpl(value) as ReviewStage;
}

export function emptyQuestionRecord(id?: string): QuestionRecord {
  return emptyQuestionRecordImpl(id) as QuestionRecord;
}

export function toQuestionRecord(item?: object | null): QuestionRecord {
  return toQuestionRecordImpl(item ?? undefined) as QuestionRecord;
}

export function masteryStars(stage: unknown): string {
  return masteryStarsImpl(stage);
}

export function priorityScore(item: object, today?: string): number {
  return priorityScoreImpl(item, today);
}

export function archiveStaleRecords<T extends object>(items: T[], options?: { today?: string; days?: number }): T[] {
  return archiveStaleRecordsImpl(items, options) as T[];
}

export function selectRecommendedReviews(
  items: ReviewQueueItem[],
  options?: { min?: number; max?: number; today?: string; masteryByKey?: unknown },
): {
  daily: ReviewQueueItem[];
  selected: ReviewQueueItem[];
  truncated: boolean;
  belowMin: boolean;
  available: number;
} {
  return selectRecommendedReviewsImpl(items, options);
}

export function markRecordMastered<T extends object>(item: T, now?: Date): T {
  return markRecordMasteredImpl(item, now) as T;
}

export function archiveRecord<T extends object>(item: T): T {
  return archiveRecordImpl(item) as T;
}

export function applyReviewResult(
  item: ReviewQueueItem,
  isCorrect: boolean,
  options?: { leechMissThreshold?: number; now?: Date },
): ReviewQueueItem {
  return applyReviewResultImpl(item, isCorrect, options);
}

export function applyScanGradesToItems(
  items: ReviewQueueItem[],
  problems: Array<{ id?: string; problemId?: string; is_correct?: boolean | null }>,
  options?: { now?: Date; createdAt?: string; leechMissThreshold?: number },
): ReviewQueueItem[] {
  return applyScanGradesToItemsImpl(items, problems, options) as ReviewQueueItem[];
}
