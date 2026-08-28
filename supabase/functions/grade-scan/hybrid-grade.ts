export {
  GRADE_KINDS,
  COACHING_TIP_MAX,
  isGradeKind,
  inferGradeKind,
  problemTypeFromKind,
  placeholderBBox,
  parseGeminiBBox,
  coerceGeminiBBox,
  normalizeShortText,
  parseNumberToken,
  numbersEqual,
  splitAnswerItems,
  answersMatchStrict,
  looksLikeSelectAll,
  optionCountHint,
  splitOptionNumbers,
  findSupplementaryDegreePair,
  applyCopiedAnswerGuards,
  extractArithmeticExpression,
  evaluateArithmetic,
  expectedMathValue,
  gradeMath,
  gradeShortText,
  gradeFreeText,
  gradeText,
  templateTip,
  parseExtractProblems,
  extractProblemList,
  isQuestionNumberOnly,
  gradeExtractedProblems,
  gradeFromGeminiPayload,
} from "./hybrid-grade.mjs";

export type GradeKind = "math" | "text";

export type ExtractedProblem = {
  problem_index: string;
  question_text: string;
  student_answer: string;
  correct_answer: string;
  ground_truth?: string;
  type: GradeKind;
  topic?: string;
  bbox?: [number, number, number, number] | null;
  visual_type?: "text_only" | "has_figure" | "passage_based";
  crop_box?: [number, number, number, number] | null;
  passage_text?: string;
  word_bank?: string;
  gemini_is_correct?: boolean;
};
