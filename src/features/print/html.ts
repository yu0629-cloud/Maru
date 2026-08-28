export type ProblemType =
  | "calc_block"
  | "math_geometry_graph"
  | "kanji"
  | "reading_passage"
  | "science_social_diagram"
  | "integrated_essay"
  | "standard";

export type AnswerStyle = "calc" | "geometry" | "graph" | "kanji" | "lined" | "diagram" | "essay";

export type PrintProblem = {
  id: string;
  label: string;
  topicTag: string;
  subject?: string;
  unit?: string;
  problemType?: ProblemType;
  imageSrc?: string;
  blankedImageSrc?: string;
  croppedImageSrc?: string;
  originalImageSrc?: string;
  blankedPath?: string;
  croppedPath?: string;
  originalPath?: string;
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
  answerStyle?: AnswerStyle;
  mediaExpired?: boolean;
  printCropped?: boolean;
};

export type WorksheetItem = {
  id: string;
  number: number;
  kind: "calc" | "text";
  layout: "compact" | "wide";
  stem: string;
};

export type PrintDocumentInput = {
  title?: string;
  childName?: string;
  dateLabel?: string;
  brand?: string;
  nameLabel?: string;
  emptyLabel?: string;
  htmlLang?: string;
  problems: PrintProblem[];
  includeCheatSheet?: boolean;
  perPage?: number;
  scope?: "daily" | "all";
};

export type PrintClipItem = {
  id: string;
  number: number;
  layout: "compact" | "wide";
  cropBox: { x: number; y: number; width: number; height: number };
  mask?: { x: number; y: number; width: number; height: number; kind?: string };
  imageSrc: string;
  originalImageSrc: string;
  isBlanked: boolean;
  cropMode: string;
  problemType?: string;
  label: string;
  questionText?: string;
  correctAnswer?: string;
  mediaExpired?: boolean;
};

export {
  buildPrintHtml,
  chooseAnswerStyle,
  paginateProblems,
  paginateByStyle,
  paginateWorksheet,
  problemsPerPage,
  styleToGridType,
  splitCalcExpressions,
  isRasterImage,
  calcExpressionsOf,
  looksLikeMath,
  extractQuestionText,
  extractMathExpression,
  formatMathExpression,
  formatProblemStem,
  flattenWorksheetItems,
  packWorksheetRows,
  paginateWorksheetRows,
  paginateWorksheetItems,
  toClipItems,
  packClipRows,
  paginateClipRows,
  layoutKind,
  geminiBBoxToNormalizedBox,
  resolveCropBox,
  expandPrintCropBox,
  answerMaskBox,
  WORKSHEET_PER_PAGE,
  PRINT_ROWS_PER_PAGE,
  PRINT_CSS,
  ANSWER_STYLE_LABELS,
  PROBLEM_TYPE_LABELS,
} from "./lib/document.mjs";
