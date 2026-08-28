export type TopicMastery = {
  isMastered: boolean;
  masteredAt: string | null;
  reviewStage: number;
  nextReviewDate: string | null;
};

export type TopicMasteryMap = Record<string, TopicMastery>;

export {
  REVIEW_STAGE_DAYS,
  RECENT_MISS_MAX_DAYS,
  SETTLING_RATE_MIN,
  SETTLING_RATE_MAX,
  addDaysIso,
  advanceMasteryOnCorrect,
  applyTopicMastery,
  daysAgo,
  emptyMastery,
  intervalDaysForStage,
  markTopicMastered,
  nextReviewDateForStage,
  normalizeMastery,
  selectBalancedReviews,
  todayIso,
  topicKey,
  unmarkTopicMastered,
} from "./lib/mastery.mjs";
