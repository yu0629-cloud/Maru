export function escapeHtml(value: unknown): string;
export function splitCalcExpressions(text?: string | null): string[];
export function isRasterImage(src?: string | null): boolean;
export function calcExpressionsOf(item: {
  expressions?: string[];
  prompt?: string;
  questionText?: string;
}): string[];
export function looksLikeMath(text?: string | null): boolean;
export function extractQuestionText(item: {
  questionText?: string;
  question_text?: string;
  prompt?: string;
  problemIndex?: string;
  problem_index?: string;
  label?: string;
}): string;
export function formatMathExpression(text?: string | null): string;
export function formatProblemStem(text: string | null | undefined, number: number): string;
export function flattenWorksheetItems(problems: unknown[]): Array<{
  id: string;
  number: number;
  kind: "calc" | "text";
  stem: string;
}>;
export const WORKSHEET_PER_PAGE: 16;
export function chooseAnswerStyle(input: {
  topicTag?: string;
  unit?: string;
  subject?: string;
  problemType?: string;
  problem_type?: string;
}): "calc" | "geometry" | "graph" | "kanji" | "lined" | "diagram" | "essay";
export function problemsPerPage(
  styles: Array<"calc" | "geometry" | "graph" | "kanji" | "lined" | "diagram" | "essay">,
): 1 | 2 | 3 | 4;
export function paginateProblems<T>(items: T[], perPage?: number): T[][];
export function paginateWorksheet<T>(items: T[], perPage?: number): T[][];
export function paginateByStyle<T>(items: T[]): Array<
  Array<{
    id: string;
    number: number;
    kind: "calc" | "text";
    stem: string;
  }>
>;
export function styleToGridType(
  style: "calc" | "geometry" | "graph" | "kanji" | "lined" | "diagram" | "essay",
): "graph" | "squared" | "lined" | "blank";
export const PRINT_CSS: string;
export const ANSWER_STYLE_LABELS: Record<string, string>;
export const PROBLEM_TYPE_LABELS: Record<string, string>;
export function buildPrintHtml(input: {
  title?: string;
  childName?: string;
  dateLabel?: string;
  includeCheatSheet?: boolean;
  perPage?: number;
  problems: Array<{
    id: string;
    label: string;
    topicTag: string;
    subject?: string;
    unit?: string;
    problemType?: string;
    imageSrc?: string;
    prompt?: string;
    questionText?: string;
    problemIndex?: string;
    expressions?: string[];
    modelText?: string;
    correctAnswer: string;
    parentCoachingTip: string;
    answerStyle?: "calc" | "geometry" | "graph" | "kanji" | "lined" | "diagram" | "essay";
  }>;
}): string;
