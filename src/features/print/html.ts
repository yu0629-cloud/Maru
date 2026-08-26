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
};

export type WorksheetItem = {
  id: string;
  number: number;
  kind: "calc" | "text";
  stem: string;
};

export type PrintDocumentInput = {
  title?: string;
  childName?: string;
  dateLabel?: string;
  problems: PrintProblem[];
  includeCheatSheet?: boolean;
  perPage?: number;
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
  formatMathExpression,
  formatProblemStem,
  flattenWorksheetItems,
  toClipItems,
  packClipRows,
  paginateClipRows,
  layoutKind,
  geminiBBoxToNormalizedBox,
  resolveCropBox,
  WORKSHEET_PER_PAGE,
  PRINT_CSS,
  ANSWER_STYLE_LABELS,
  PROBLEM_TYPE_LABELS,
} from "./lib/document.mjs";
