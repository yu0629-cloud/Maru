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
  extractArithmeticExpression,
  evaluateArithmetic,
  expectedMathValue,
  gradeMath,
  gradeShortText,
  gradeFreeText,
  gradeText,
  templateTip,
  parseExtractProblems,
  gradeExtractedProblems,
  gradeFromGeminiPayload,
} from "./hybrid-grade.mjs";

export type GradeKind = "math" | "text";

export type ExtractedProblem = {
  problem_index: string;
  question_text: string;
  student_answer: string;
  correct_answer: string;
  type: GradeKind;
  bbox?: [number, number, number, number] | null;
  gemini_is_correct?: boolean;
};
