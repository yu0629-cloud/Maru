export type CarteTabId =
  | "all"
  | "math"
  | "japanese"
  | "spelling_phonics"
  | "reading"
  | "writing_grammar"
  | "science"
  | "social_studies"
  | "world_languages"
  | "other";
export type CarteChartMode = "none" | "bar" | "radar";

export type TopicGroup = {
  key: string;
  subject: string;
  topic: string;
  total: number;
  correct: number;
  rate: number;
  mistakes: CarteProblemRow[];
  isMastered?: boolean;
};

export type CarteProblemRow = {
  id: string;
  scan_id?: string | null;
  subject?: string | null;
  topic?: string | null;
  unit?: string | null;
  topic_tag?: string | null;
  is_correct: boolean;
  mistake_type?: string | null;
  question_text?: string | null;
  student_answer?: string | null;
  correct_answer?: string | null;
  problem_label?: string | null;
  created_at?: string | null;
};

export type SubjectGroup = {
  subject: Exclude<CarteTabId, "all">;
  total: number;
  correct: number;
  rate: number;
};

export {
  buildCarteMastery,
  carelessRate,
  chartModeForSubjectCount,
  EMPTY_SCAN_MESSAGE,
  fallbackTopic,
  filterProblemsByTab,
  groupSubjects,
  groupTopics,
  isPlaceholderTopic,
  recentRatesFromProblems,
  splitTopics,
  STRONG_RATE,
  summarizeProblems,
  tabsForProblems,
  topicOf,
  WEAK_RATE,
} from "./lib/stats.mjs";
