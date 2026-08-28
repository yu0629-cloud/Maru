export type ProblemType =
  | "calc_block"
  | "math_geometry_graph"
  | "kanji"
  | "reading_passage"
  | "science_social_diagram"
  | "integrated_essay"
  | "standard";

export type AnswerStyle = "calc" | "geometry" | "graph" | "kanji" | "lined" | "diagram" | "essay";

export type VisualType = "text_only" | "has_figure" | "passage_based";

export type PrintProblem = {
  id: string;
  label: string;
  topicTag: string;
  subject?: string;
  unit?: string;
  problemType?: ProblemType;
  visualType?: VisualType;
  imageSrc?: string;
  figureImageSrc?: string;
  figureBase64?: string;
  blankedImageSrc?: string;
  croppedImageSrc?: string;
  originalImageSrc?: string;
  blankedPath?: string;
  croppedPath?: string;
  originalPath?: string;
  bbox?: [number, number, number, number];
  cropBox?: { x: number; y: number; width: number; height: number };
  figureCropBox?: [number, number, number, number] | null;
  passageText?: string;
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
  kind: "calc" | "text" | "figure" | "passage";
  layout: "compact" | "wide";
  stem: string;
  visualType?: VisualType;
  figureSrc?: string;
  passage?: string;
  masks?: Array<{ x: number; y: number; width: number; height: number }>;
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
  geminiBoxToPixelCrop,
  resolveCropBox,
  expandPrintCropBox,
  answerMaskBox,
  figureAnswerMasks,
  shrinkCropExcludingAnswer,
  WORKSHEET_PER_PAGE,
  PRINT_ROWS_PER_PAGE,
  PRINT_CSS,
  ANSWER_STYLE_LABELS,
  PROBLEM_TYPE_LABELS,
} from "./lib/document.mjs";

export {
  VISUAL_TYPES,
  isVisualType,
  inferVisualType,
  figureDataSrcOf,
  figureImageSrcOf,
  passageTextOf,
  figureCropBoxOf,
  coerceGeminiBox,
} from "./lib/visual.mjs";
