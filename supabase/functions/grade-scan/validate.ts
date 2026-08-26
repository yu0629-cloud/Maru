import {
  DIFFICULTY_LEVELS,
  MISTAKE_TYPES,
  type DifficultyLevel,
  type GradeProblem,
  type GradeResult,
  type MistakeType,
} from "./schema.ts";
import { isGeminiBBox, normalizeGeminiBBox } from "./bbox.ts";
import {
  enrichCoachingTip,
  inferProblemType,
  isProblemType,
  mergeCalcBlocks,
} from "./problem-types.ts";
import { gradeFromGeminiPayload } from "./hybrid-grade.ts";
import { parseJsonPayload } from "./parse-json.mjs";

export class GradeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GradeValidationError";
  }
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new GradeValidationError(`${path} はオブジェクトである必要があります`);
  }
  return value as Record<string, unknown>;
}

function asNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new GradeValidationError(`${path} は有限の数値である必要があります`);
  }
  return value;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new GradeValidationError(`${path} は文字列である必要があります`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new GradeValidationError(`${path} は boolean である必要があります`);
  }
  return value;
}

function parseDifficulty(value: unknown, path: string): DifficultyLevel {
  const raw = asString(value, path);
  if (!DIFFICULTY_LEVELS.includes(raw as DifficultyLevel)) {
    throw new GradeValidationError(`${path} が不正です: ${raw}`);
  }
  return raw as DifficultyLevel;
}

function parseMistake(value: unknown, path: string): MistakeType {
  const raw = asString(value, path);
  if (!MISTAKE_TYPES.includes(raw as MistakeType)) {
    throw new GradeValidationError(`${path} が不正です: ${raw}`);
  }
  return raw as MistakeType;
}

export function parseGradeJson(text: string): unknown {
  const parsed = parseJsonPayload(text);
  if (parsed === null || parsed === undefined) {
    throw new GradeValidationError("Gemini 応答を JSON として解析できませんでした");
  }
  return parsed;
}

export function normalizeProblem(raw: unknown, index: number): GradeProblem {
  const path = `problems[${index}]`;
  const obj = asRecord(raw, path);

  if (!isGeminiBBox(obj.bbox)) {
    throw new GradeValidationError(`${path}.bbox は長さ4の数値配列である必要があります`);
  }

  const bbox = normalizeGeminiBBox(obj.bbox);
  const [ymin, xmin, ymax, xmax] = bbox;
  if (ymax <= ymin || xmax <= xmin) {
    throw new GradeValidationError(`${path}.bbox の範囲が不正です`);
  }

  const isCorrect = asBoolean(obj.is_correct, `${path}.is_correct`);
  const studentAnswer = asString(obj.student_answer, `${path}.student_answer`);
  const topicTag = optionalString(obj.topic_tag) ?? "未分類";
  const problemIndex = asString(obj.problem_index, `${path}.problem_index`) || `問${index + 1}`;
  const correctAnswer = asString(obj.correct_answer, `${path}.correct_answer`);

  const inferredType = isProblemType(obj.problem_type)
    ? obj.problem_type
    : inferProblemType({
        topicTag,
        problemIndex,
        studentAnswer,
        correctAnswer,
      });

  let mistakeType: MistakeType;
  if (obj.mistake_type !== undefined) {
    mistakeType = parseMistake(obj.mistake_type, `${path}.mistake_type`);
  } else if (isCorrect) {
    mistakeType = "none";
  } else if (!studentAnswer) {
    mistakeType = "blank";
  } else {
    mistakeType = "concept_gap";
  }

  let needsInpaint: boolean;
  if (typeof obj.needs_inpaint === "boolean") {
    needsInpaint = obj.needs_inpaint;
  } else {
    needsInpaint = !isCorrect && Boolean(studentAnswer);
  }

  if (isCorrect) {
    mistakeType = "none";
    needsInpaint = false;
  } else if (!studentAnswer) {
    mistakeType = "blank";
    needsInpaint = false;
  }

  const tip = optionalString(obj.parent_coaching_tip) ?? "";
  const difficulty = obj.difficulty_level !== undefined
    ? parseDifficulty(obj.difficulty_level, `${path}.difficulty_level`)
    : "standard";

  return {
    problem_index: problemIndex,
    bbox,
    is_correct: isCorrect,
    student_answer: studentAnswer,
    correct_answer: correctAnswer,
    topic_tag: topicTag,
    difficulty_level: difficulty,
    mistake_type: mistakeType,
    parent_coaching_tip: enrichCoachingTip(inferredType, tip, isCorrect),
    needs_inpaint: needsInpaint,
    problem_type: inferredType,
  };
}

export function validateGradeResult(raw: unknown): GradeResult {
  const obj = asRecord(raw, "root");

  if (!Array.isArray(obj.problems) || obj.problems.length === 0) {
    throw new GradeValidationError("problems は1件以上必要です");
  }

  const problems = mergeCalcBlocks(obj.problems.map((item, index) => normalizeProblem(item, index)));

  let earned: number;
  let max: number;
  if (obj.overall_score === undefined) {
    earned = problems.filter((problem) => problem.is_correct).length;
    max = problems.length;
  } else {
    const score = asRecord(obj.overall_score, "overall_score");
    earned = asNumber(score.earned, "overall_score.earned");
    max = asNumber(score.max, "overall_score.max");
  }

  if (max <= 0) {
    throw new GradeValidationError("overall_score.max は 0 より大きい必要があります");
  }
  if (earned < 0 || earned > max) {
    throw new GradeValidationError("overall_score.earned が配点の範囲外です");
  }

  return {
    overall_score: { earned, max },
    problems,
  };
}

/** Gemini 抽出 JSON はプログラム採点。旧判定 JSON はそのまま検証する */
export function gradeGeminiResponse(raw: unknown): GradeResult {
  try {
    const hybrid = gradeFromGeminiPayload(raw);
    if (hybrid) return hybrid;
  } catch (error) {
    throw new GradeValidationError(error instanceof Error ? error.message : "EXTRACT_INVALID");
  }
  return validateGradeResult(raw);
}

export function countCorrect(result: GradeResult) {
  const correct = result.problems.filter((p) => p.is_correct).length;
  return {
    total: result.problems.length,
    correct,
    incorrect: result.problems.length - correct,
  };
}

export function shouldQueueInpaint(problem: GradeProblem): boolean {
  return problem.is_correct === false && problem.needs_inpaint === true;
}
