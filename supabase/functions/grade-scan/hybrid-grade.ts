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
  snapBBoxToAnswerSlot,
  canonicalizeChoiceAnswer,
  normalizeAnswerType,
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
  context_text?: string;
  options_text?: string;
  parent_figure_box?: [number, number, number, number] | null;
  sub_figure_box?: [number, number, number, number] | null;
  word_bank?: string;
  answer_type?: "handwritten_text" | "circle_selection" | "none";
  is_blank?: boolean;
  gemini_is_correct?: boolean;
};
