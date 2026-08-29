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
  parentFigureSrc?: string;
  parentFigureBase64?: string;
  subFigureSrc?: string;
  subFigureBase64?: string;
  blankedImageSrc?: string;
  croppedImageSrc?: string;
  originalImageSrc?: string;
  blankedPath?: string;
  croppedPath?: string;
  originalPath?: string;
  bbox?: [number, number, number, number];
  cropBox?: { x: number; y: number; width: number; height: number };
  figureCropBox?: [number, number, number, number] | null;
  parentFigureBox?: [number, number, number, number] | null;
  subFigureBox?: [number, number, number, number] | null;
  passageText?: string;
  contextText?: string;
  parentContext?: string;
  optionsText?: string;
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
  number: string | number;
  numberLabel?: string;
  numberStyle?: "square" | "round";
  kind: "calc" | "text" | "figure" | "passage";
  layout: "compact" | "wide";
  stem: string;
  visualType?: VisualType;
  figureSrc?: string;
  passage?: string;
  context?: string;
  options?: string;
  masks?: Array<{ x: number; y: number; width: number; height: number }>;
  occupancy?: { widthPct: number; heightMm: number } | null;
  parentFigureSrc?: string;
  subFigureSrc?: string;
  parentOccupancy?: { widthPct: number; heightMm: number } | null;
  subOccupancy?: { widthPct: number; heightMm: number } | null;
  subMasks?: Array<{ x: number; y: number; width: number; height: number }>;
  parts?: Array<{
    number: string | number;
    numberLabel?: string;
    numberStyle?: "square" | "round";
    stem: string;
    options?: string;
    subFigureSrc?: string;
    subOccupancy?: { widthPct: number; heightMm: number } | null;
    subMasks?: Array<{ x: number; y: number; width: number; height: number }>;
  }>;
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
  resolveQuestionNumber,
  stripLeadingQuestionNumber,
  formatSquareNumber,
  formatRoundNumber,
  matchLeadingQuestionNumber,
  flattenWorksheetItems,
  mergeSharedFigureItems,
  occupancyFromBox,
  cropOccupancyOf,
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
  padNormalizedBox,
  figureAnswerMasks,
  shrinkCropExcludingAnswer,
  expandFigureGeminiBox,
  planExpandedFigureCrop,
  prepareParentFigureBox,
  stripRepeatedLead,
  WORKSHEET_PER_PAGE,
  PRINT_ROWS_PER_PAGE,
  A4_CONTENT_WIDTH_MM,
  A4_CONTENT_HEIGHT_MM,
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
  parentFigureBoxOf,
  subFigureBoxOf,
  parentFigureSrcOf,
  subFigureSrcOf,
  parentContextOf,
  coerceGeminiBox,
  contextTextOf,
  optionsTextOf,
} from "./lib/visual.mjs";

export {
  needsDataTableVisual,
  benefitsFromDataTableVisual,
  benefitsFromParentFigure,
  mentionsDataTable,
  looksLikeParentFigureBox,
  inferTableBoxBelow,
  resolveSubFigureBox,
  resolveParentFigureBox,
  enrichPrintFigureBoxes,
} from "./lib/figure-boxes.mjs";
