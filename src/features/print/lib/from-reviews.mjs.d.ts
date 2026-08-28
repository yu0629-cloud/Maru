export function isBlankPrintAnswer(item: {
  status?: string | null;
  answer_status?: string | null;
  answerStatus?: string | null;
  mistake_type?: string | null;
  mistakeType?: string | null;
  studentAnswer?: string | null;
  student_answer?: string | null;
  user_answer?: string | null;
  userAnswer?: string | null;
}): boolean;

export function isIncorrectForPrint(item: {
  isCorrect?: boolean;
  is_correct?: boolean | null;
  status?: string | null;
  mistake_type?: string | null;
  mistakeType?: string | null;
  studentAnswer?: string | null;
  student_answer?: string | null;
  user_answer?: string | null;
  userAnswer?: string | null;
}): boolean;

export function isQuestionNumberOnly(text?: string | null): boolean;
export function displayQuestionText(text?: string | null, label?: string | number | null): string;
export function displayTopicTag(unit?: string | null, label?: string | number | null): string;
export function questionTextOf(item: {
  questionText?: string | null;
  question_text?: string | null;
  prompt?: string | null;
  problemIndex?: string | number | null;
  problem_index?: string | number | null;
  problem_label?: string | null;
  label?: string | null;
}): string;

export function printProblemFromReview(item?: object | null): {
  id: string;
  label: string;
  topicTag: string;
  subject?: string;
  problemType?: string;
  questionText: string;
  problemIndex: string;
  studentAnswer: string;
  correctAnswer: string;
  parentCoachingTip: string;
  bbox?: unknown;
  cropBox?: unknown;
  blankedPath: string;
  croppedPath: string;
  originalPath: string;
  imageSrc: string;
  blankedImageSrc: string;
  croppedImageSrc: string;
  originalImageSrc: string;
  isCorrect: false;
  isBlanked: boolean;
  mediaExpired: boolean;
};

export function printProblemsFromScans(
  scans?: Array<{
    childId?: string;
    localUri?: string;
    originalStoragePath?: string | null;
    originalPurgedAt?: string | null;
    problems?: unknown[];
  }>,
  childId?: string,
): ReturnType<typeof printProblemFromReview>[];

export function collectPrintProblems(input?: {
  reviews?: unknown[];
  scans?: unknown[];
  extras?: unknown[];
  childId?: string;
  fallback?: unknown[];
  scope?: "daily" | "all";
  preferredIds?: Array<string | number | null | undefined>;
}): ReturnType<typeof printProblemFromReview>[];
export function stripLatexDollars(text?: string | null): string;
export const DAILY_PRINT_MAX: 5;
export function hasPrintableQuestion(item?: object | null): boolean;
export function selectProblemsForScope(
  problems?: unknown[],
  scope?: "daily" | "all",
  preferredIds?: Array<string | number | null | undefined>,
): ReturnType<typeof printProblemFromReview>[];
export function looksLikePrintedStem(text?: string | null): boolean;
