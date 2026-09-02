import {
  applyReviewResult as applyReviewResultImpl,
  isolateLeeches as isolateLeechesImpl,
  selectDailyReviews as selectDailyReviewsImpl,
  todayIso as todayIsoImpl,
} from "./lib/select.mjs";

export type ReviewStatus = "queued" | "active" | "leech" | "mastered" | "retired";

export type ReviewQueueItem = {
  id: string;
  assignmentId?: string;
  problemId: string;
  status: ReviewStatus;
  nextReviewOn: string;
  intervalDays: number;
  easeFactor: number;
  consecutiveMisses: number;
  consecutiveHits: number;
  reviewStage?: 0 | 1 | 2 | 3;
  review_stage?: 0 | 1 | 2 | 3;
  mistakeCount?: number;
  mistake_count?: number;
  lastReviewedAt?: string | null;
  last_reviewed_at?: string | null;
  nextReviewAt?: string | null;
  next_review_at?: string | null;
  isArchived?: boolean;
  is_archived?: boolean;
  lastResult?: boolean | null;
  leechAt?: string | null;
  completed?: boolean;
  label: string;
  topicTag: string;
  imageSrc: string;
  blankedImageSrc?: string;
  croppedImageSrc?: string;
  originalImageSrc?: string;
  bbox?: [number, number, number, number];
  cropBox?: { x: number; y: number; width: number; height: number };
  isCorrect?: boolean;
  isBlanked?: boolean;
  studentAnswer?: string;
  prompt?: string;
  questionText?: string;
  problemIndex?: string;
  expressions?: string[];
  modelText?: string;
  correctAnswer: string;
  parentCoachingTip: string;
  mediaExpired?: boolean;
  createdAt?: string;
  blankedPath?: string;
  croppedPath?: string;
  originalPath?: string;
  localUri?: string;
  subject?: string;
  problemType?:
    | "calc_block"
    | "math_geometry_graph"
    | "kanji"
    | "reading_passage"
    | "science_social_diagram"
    | "integrated_essay"
    | "standard";
};

export function todayIso(now?: Date): string {
  return todayIsoImpl(now);
}

export function selectDailyReviews(
  items: ReviewQueueItem[],
  options?: { min?: number; max?: number; today?: string; masteryByKey?: Record<string, { isMastered?: boolean; nextReviewDate?: string | null }> },
): {
  daily: ReviewQueueItem[];
  truncated: boolean;
  belowMin: boolean;
  available: number;
} {
  return selectDailyReviewsImpl(items, options);
}

export function isolateLeeches(items: ReviewQueueItem[]): ReviewQueueItem[] {
  return isolateLeechesImpl(items);
}

export function applyReviewResult(
  item: ReviewQueueItem,
  isCorrect: boolean,
  options?: { leechMissThreshold?: number; masteredIntervalDays?: number; masteredHitThreshold?: number; now?: Date },
): ReviewQueueItem {
  return applyReviewResultImpl(item, isCorrect, options);
}
