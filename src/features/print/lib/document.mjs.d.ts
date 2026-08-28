export function escapeHtml(value: unknown): string;
export function splitCalcExpressions(text?: string | null): string[];
export function isRasterImage(src?: string | null): boolean;
export function calcExpressionsOf(item: {
  expressions?: string[];
  prompt?: string;
  questionText?: string;
}): string[];
export function looksLikeMath(text?: string | null): boolean;
export function extractMathExpression(text?: string | null): string;
export function extractQuestionText(item: {
  questionText?: string;
  question_text?: string;
  prompt?: string;
  problemIndex?: string;
  problem_index?: string;
  problem_label?: string;
  label?: string;
  correctAnswer?: string;
  correct_answer?: string;
}): string;
export function formatMathExpression(text?: string | null): string;
export function formatProblemStem(text: string | null | undefined, number: number): string;
export function flattenWorksheetItems(problems: unknown[]): Array<{
  id: string;
  number: number;
  kind: "calc" | "text" | "figure" | "passage";
  layout: "compact" | "wide";
  stem: string;
  visualType?: "text_only" | "has_figure" | "passage_based";
  figureSrc?: string;
  passage?: string;
  masks?: Array<{ x: number; y: number; width: number; height: number }>;
}>;
export function packWorksheetRows<T extends { layout?: string }>(items: T[]): T[][];
export function paginateWorksheetRows<T>(rows: T[][], maxRows?: number): T[][][];
export function paginateWorksheetItems<T>(items: T[], perPage?: number): T[][];
export const WORKSHEET_PER_PAGE: 6;
export const PRINT_ROWS_PER_PAGE: 3;
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
    kind: "calc" | "text" | "figure" | "passage";
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
  scope?: "daily" | "all";
  problems: Array<{
    id: string;
    label: string;
    topicTag: string;
    subject?: string;
    unit?: string;
    problemType?: string;
    visualType?: string;
    figureImageSrc?: string;
    figureBase64?: string;
    figureCropBox?: unknown;
    passageText?: string;
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
export function toClipItems(problems?: unknown[]): Array<{
  id: string;
  number: number;
  layout: "compact" | "wide";
  cropBox: { x: number; y: number; width: number; height: number };
  mask?: { x: number; y: number; width: number; height: number; kind: string };
  imageSrc: string;
  originalImageSrc: string;
  isBlanked: boolean;
  cropMode: string;
  problemType?: string;
  label: string;
  questionText?: string;
  correctAnswer?: string;
  mediaExpired?: boolean;
}>;
export function packClipRows<T>(items: T[]): T[][];
export function paginateClipRows<T>(rows: T[][], maxHeightMm?: number): T[][][];
export function layoutKind(problem: unknown, cropBox?: unknown): "compact" | "wide";
export function geminiBBoxToNormalizedBox(bbox: unknown): {
  x: number;
  y: number;
  width: number;
  height: number;
};
export function coerceGeminiBox(value?: unknown): [number, number, number, number] | null;
export function geminiBoxToPixelCrop(
  box: unknown,
  imageWidth: number,
  imageHeight: number,
): { originX: number; originY: number; width: number; height: number } | null;
export function resolveCropBox(input?: object | null): {
  x: number;
  y: number;
  width: number;
  height: number;
};
export function expandPrintCropBox(box: {
  x: number;
  y: number;
  width: number;
  height: number;
}): { x: number; y: number; width: number; height: number };
export function answerMaskBox(
  original: { x: number; y: number; width: number; height: number },
  expanded?: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number; kind: string };
export function shrinkCropExcludingAnswer(
  crop: { x: number; y: number; width: number; height: number },
  answer?: { x: number; y: number; width: number; height: number } | null,
): { x: number; y: number; width: number; height: number };
export function figureAnswerMasks(
  cropGemini?: unknown,
  bboxGemini?: unknown,
): {
  crop: { x: number; y: number; width: number; height: number } | null;
  masks: Array<{ x: number; y: number; width: number; height: number }>;
};
