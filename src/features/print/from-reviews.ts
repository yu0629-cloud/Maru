import type { PrintProblem } from "@/src/features/print/html";
import { MOCK_PRINT_PROBLEMS } from "@/src/features/print/mock";
import type { ReviewQueueItem } from "@/src/features/review/select";
import type { ScanRecord } from "@/src/stores/scanStore";
import type { PrintProblemScope } from "@/src/stores/printStore";
import {
  collectPrintProblems as collectPrintProblemsImpl,
  isBlankPrintAnswer,
  isIncorrectForPrint,
  printProblemFromReview,
  printProblemsFromScans,
  questionTextOf,
  isQuestionNumberOnly,
  displayQuestionText,
  displayTopicTag,
  hasPrintableQuestion,
  selectProblemsForScope,
  stripLatexDollars,
  DAILY_PRINT_MAX,
  dedupePrintProblems,
  contentDedupeKey,
} from "./lib/from-reviews.mjs";

export function toPrintProblems(reviews: ReviewQueueItem[]): PrintProblem[] {
  return collectPrintProblems({ reviews });
}

export function collectPrintProblems(input: {
  reviews?: ReviewQueueItem[];
  scans?: ScanRecord[];
  extras?: PrintProblem[];
  childId?: string;
  allowMockFallback?: boolean;
  scope?: PrintProblemScope;
  preferredIds?: Array<string | number | null | undefined>;
}): PrintProblem[] {
  return collectPrintProblemsImpl({
    reviews: input.reviews,
    scans: input.scans,
    extras: input.extras,
    childId: input.childId,
    scope: input.scope,
    preferredIds: input.preferredIds,
    fallback: input.allowMockFallback
      ? MOCK_PRINT_PROBLEMS.filter((problem) => problem.isCorrect !== true)
      : [],
  }) as PrintProblem[];
}

export {
  isBlankPrintAnswer,
  isIncorrectForPrint,
  printProblemFromReview,
  printProblemsFromScans,
  questionTextOf,
  isQuestionNumberOnly,
  displayQuestionText,
  displayTopicTag,
  hasPrintableQuestion,
  selectProblemsForScope,
  stripLatexDollars,
  DAILY_PRINT_MAX,
  dedupePrintProblems,
  contentDedupeKey,
};
