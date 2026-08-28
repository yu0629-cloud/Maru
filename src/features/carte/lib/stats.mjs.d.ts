export type {
  CarteChartMode,
  CarteProblemRow,
  CarteTabId,
  SubjectGroup,
  TopicGroup,
} from "../stats";

export const STRONG_RATE: 0.8;
export const WEAK_RATE: 0.7;
export const EMPTY_SCAN_MESSAGE: string;

export function isPlaceholderTopic(value?: string | null): boolean;
export function fallbackTopic(subject?: string | null): string;
export function topicOf(problem?: CarteProblemRow | null): string;
export function subjectOf(problem?: CarteProblemRow | null): string;
export function tabsForProblems(
  problems?: CarteProblemRow[] | null,
): Array<{ id: CarteTabId; label: string }>;
export function filterProblemsByTab(
  problems?: CarteProblemRow[] | null,
  tab?: CarteTabId,
): CarteProblemRow[];
export function carelessRate(problems?: CarteProblemRow[] | null): number;
export function recentRatesFromProblems(
  problems?: CarteProblemRow[] | null,
  limit?: number,
): number[];
export function summarizeProblems(problems?: CarteProblemRow[] | null): {
  total: number;
  correct: number;
  rate: number;
};
export function groupSubjects(problems?: CarteProblemRow[] | null): SubjectGroup[];
export function chartModeForSubjectCount(count?: number | null): CarteChartMode;
export function groupTopics(problems?: CarteProblemRow[] | null): TopicGroup[];
export function splitTopics(groups?: TopicGroup[] | null): {
  strong: TopicGroup[];
  weak: TopicGroup[];
  settling: TopicGroup[];
  mastered: TopicGroup[];
};
export function buildCarteMastery(
  problems?: CarteProblemRow[] | null,
  tab?: CarteTabId,
  masteryByKey?: Record<string, { isMastered?: boolean }>,
): {
  summary: { total: number; correct: number; rate: number };
  strong: TopicGroup[];
  weak: TopicGroup[];
  settling: TopicGroup[];
  mastered: TopicGroup[];
};
