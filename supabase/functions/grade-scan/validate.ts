import {
  DIFFICULTY_LEVELS,
  MISTAKE_TYPES,
  type DifficultyLevel,
  type GradeProblem,
  type GradeResult,
  type MistakeType,
} from "./schema.ts";
import { isGeminiBBox, normalizeGeminiBBox } from "./bbox.ts";
import { mentionsDataTable, normalizeOcrText } from "./ocr-text.mjs";
import {
  enrichCoachingTip,
  inferProblemType,
  isProblemType,
  mergeCalcBlocks,
} from "./problem-types.ts";
import {
  answersMatchStrict,
  applyCopiedAnswerGuards,
  canonicalizeChoiceAnswer,
  dedupeExtractedProblems,
  gradeFromGeminiPayload,
  isQuestionNumberOnly,
  normalizeAnswerType,
  normalizeTeacherMark,
  parseMarkerCoordinate,
  resolveOverlayBBox,
  teacherMarkVerdict,
} from "./hybrid-grade.ts";
import { parseJsonPayload } from "./parse-json.mjs";
import { resolveScanSubject } from "./subject.ts";
import { inferVisualType, isVisualType, type VisualType } from "./visual.ts";
import { readChildDetectionHint } from "./match-child.mjs";

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

function readQuestionUnit(obj: Record<string, unknown>) {
  const unitRaw = obj.question_unit;
  const unit =
    unitRaw && typeof unitRaw === "object" && !Array.isArray(unitRaw)
      ? (unitRaw as Record<string, unknown>)
      : {};
  const context = normalizeOcrText(
    optionalString(unit.parent_context) ??
      optionalString(unit.context_text) ??
      optionalString(obj.parent_context) ??
      optionalString(obj.context_text) ??
      optionalString(obj.passage_text) ??
      "",
  );
  const options = normalizeOcrText(
    optionalString(unit.options_text) ??
      optionalString(obj.options_text) ??
      optionalString(obj.word_bank) ??
      "",
  );
  const questionFromUnit = optionalString(unit.question_text)
    ? normalizeOcrText(optionalString(unit.question_text) ?? "")
    : undefined;
  const crop = unit.crop_box ?? obj.crop_box;
  const parentFigure = unit.parent_figure_box ?? obj.parent_figure_box;
  const subFigure = unit.sub_figure_box ?? obj.sub_figure_box;
  return { context, options, questionFromUnit, crop, parentFigure, subFigure };
}

function parseUsableBox(value: unknown): GradeProblem["crop_box"] {
  if (!isGeminiBBox(value)) return null;
  const normalized = normalizeGeminiBBox(value);
  const [ymin, xmin, ymax, xmax] = normalized;
  if (ymax <= ymin || xmax <= xmin) return null;
  return normalized;
}

function sameGeminiBox(
  a: GradeProblem["crop_box"] | undefined,
  b: GradeProblem["crop_box"] | undefined,
): boolean {
  if (!a || !b) return false;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

/** 表が必須／あった方がよいのに sub_figure_box が空の小問へ、同一プリントの表座標を補う／ページ下部を推定。親図もあるときは両方残す */
function inferTableBoxBelow(parent: GradeProblem["crop_box"] | null): NonNullable<GradeProblem["crop_box"]> {
  const p = parseUsableBox(parent);
  const floor = p
    ? Math.min(1000, Math.max(Math.max(p[2] + 140, 640), 600))
    : 680;
  const capped = Math.min(Math.max(floor, 600), 780);
  const ymax = 978;
  if (ymax - capped < 90) {
    return [Math.max(0, ymax - 180), 40, ymax, 960];
  }
  return [capped, 40, ymax, 960];
}

function fillMissingSubFigureBoxes(problems: GradeProblem[]): GradeProblem[] {
  const donors = problems
    .map((problem) => problem.sub_figure_box)
    .filter((box): box is NonNullable<GradeProblem["crop_box"]> => Boolean(parseUsableBox(box)));
  const parentDonors = problems
    .map((problem) => problem.parent_figure_box)
    .filter((box): box is NonNullable<GradeProblem["crop_box"]> => Boolean(parseUsableBox(box)));
  return problems.map((problem) => {
    const needsTable = mentionsDataTable(`${problem.question_text ?? ""} ${problem.context_text ?? ""}`);
    const hasSub = Boolean(parseUsableBox(problem.sub_figure_box));
    let parent = parseUsableBox(problem.parent_figure_box) ?? parentDonors[0] ?? null;
    let visualType = problem.visual_type;
    if (
      visualType === "text_only" &&
      (parent || hasSub || needsTable)
    ) {
      visualType = "has_figure";
    }
    if (hasSub || !needsTable) {
      const next = {
        ...problem,
        parent_figure_box: parent ?? problem.parent_figure_box,
        visual_type: visualType,
      };
      return next;
    }
    const donor = donors.find((box) => !sameGeminiBox(box, parent)) ?? donors[0] ?? inferTableBoxBelow(parent);
    return {
      ...problem,
      parent_figure_box: parent ?? problem.parent_figure_box,
      sub_figure_box: donor,
      visual_type: visualType === "passage_based" ? visualType : "has_figure",
    };
  });
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

  const unit = readQuestionUnit(obj);
  const optionsTextEarly = unit.options || optionalString(obj.word_bank) || "";
  const rawStudent = obj.student_answer === null ? "" : asString(obj.student_answer, `${path}.student_answer`);
  const flaggedBlank = obj.is_blank === true || !rawStudent.trim();
  const answerType = flaggedBlank ? "none" : normalizeAnswerType(obj.answer_type, rawStudent);
  const studentAnswer = flaggedBlank ? "" : canonicalizeChoiceAnswer(rawStudent, optionsTextEarly, answerType);
  const topicTag = optionalString(obj.topic_tag) ?? optionalString(obj.topic) ?? "未分類";
  const problemIndex = asString(obj.problem_index, `${path}.problem_index`) || `問${index + 1}`;
  const groundTruth = canonicalizeChoiceAnswer(optionalString(obj.ground_truth) || "", optionsTextEarly, answerType);
  const correctAnswer =
    groundTruth ||
    canonicalizeChoiceAnswer(asString(obj.correct_answer, `${path}.correct_answer`), optionsTextEarly, answerType);
  const questionTextRaw =
    unit.questionFromUnit ??
    optionalString(obj.question_text) ??
    optionalString(obj.questionText) ??
    optionalString(obj.prompt) ??
    "";
  const questionText = isQuestionNumberOnly(questionTextRaw) ? "" : normalizeOcrText(questionTextRaw);
  const parentFigureBox = parseUsableBox(unit.parentFigure);
  const subFigureBox = parseUsableBox(unit.subFigure);

  const teacherMark = normalizeTeacherMark(
    optionalString(obj.teacher_mark) ?? optionalString(obj.teacherMark) ?? optionalString(obj.score_mark),
  );
  const marked = teacherMarkVerdict(teacherMark);
  let isCorrect = asBoolean(obj.is_correct, `${path}.is_correct`);
  if (marked !== null) {
    isCorrect = marked;
  } else if (groundTruth && !answersMatchStrict(studentAnswer, groundTruth)) {
    isCorrect = false;
  }
  if (marked === null) {
    isCorrect = applyCopiedAnswerGuards(
      {
        question_text: questionText,
        topic: topicTag,
        student_answer: studentAnswer,
        ground_truth: groundTruth || correctAnswer,
        correct_answer: correctAnswer,
        passage_text: unit.context || optionalString(obj.passage_text) || "",
        word_bank: optionsTextEarly,
        options_text: optionsTextEarly,
        context_text: unit.context,
        bbox,
        parent_figure_box: parentFigureBox,
        sub_figure_box: subFigureBox,
        answer_type: answerType,
      },
      isCorrect,
    );
  }
  const markerCoordinate = parseMarkerCoordinate(
    obj.marker_coordinate ?? obj.markerCoordinate ?? obj.mark_coordinate,
  );
  const snappedBbox = resolveOverlayBBox(
    {
      bbox,
      marker_coordinate: markerCoordinate,
      parent_figure_box: parentFigureBox,
      sub_figure_box: subFigureBox,
      answer_type: answerType,
    },
    index,
    1,
  );

  const inferredType = isProblemType(obj.problem_type)
    ? obj.problem_type
    : inferProblemType({
        topicTag,
        problemIndex,
        questionText,
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

  let visualType: VisualType = isVisualType(obj.visual_type)
    ? (obj.visual_type as VisualType)
    : inferVisualType({
        visual_type: obj.visual_type,
        problem_type: inferredType,
        question_text: questionText,
        topic: topicTag,
        parent_context: unit.context,
        options_text: unit.options,
        parent_figure_box: unit.parentFigure,
        sub_figure_box: unit.subFigure,
      });

  let cropBox: GradeProblem["crop_box"] = parseUsableBox(unit.crop);
  if (!cropBox) cropBox = parentFigureBox ?? subFigureBox;
  if ((parentFigureBox || subFigureBox) && visualType === "text_only") {
    visualType = "has_figure";
  }

  const contextText = unit.context;
  const optionsText = unit.options;
  const passageText =
    visualType === "passage_based" ? contextText || optionalString(obj.passage_text) || "" : contextText;

  return {
    problem_index: problemIndex,
    question_text: questionText,
    bbox: snappedBbox,
    marker_coordinate: markerCoordinate,
    is_correct: isCorrect,
    student_answer: studentAnswer,
    answer_type: answerType,
    is_blank: flaggedBlank || !studentAnswer,
    teacher_mark: teacherMark,
    correct_answer: correctAnswer,
    topic_tag: topicTag,
    difficulty_level: difficulty,
    mistake_type: mistakeType,
    parent_coaching_tip: enrichCoachingTip(inferredType, tip, isCorrect),
    needs_inpaint: needsInpaint,
    problem_type: inferredType,
    visual_type: visualType,
    crop_box: cropBox,
    passage_text: passageText,
    context_text: contextText,
    options_text: optionsText,
    parent_figure_box: parentFigureBox,
    sub_figure_box: subFigureBox,
  };
}

export function validateGradeResult(raw: unknown): GradeResult {
  const obj = asRecord(raw, "root");

  if (!Array.isArray(obj.problems) || obj.problems.length === 0) {
    throw new GradeValidationError("problems は1件以上必要です");
  }

  const uniqueRaw = dedupeExtractedProblems(obj.problems);
  const problems = fillMissingSubFigureBoxes(
    mergeCalcBlocks(uniqueRaw.map((item, index) => normalizeProblem(item, index))),
  );

  let earned: number;
  let max: number;
  if (obj.overall_score === undefined || uniqueRaw.length !== obj.problems.length) {
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
    subject: resolveScanSubject({ subject: obj.subject, problems }),
    overall_score: { earned, max },
    problems,
    child_detection: readChildDetectionHint(obj),
  };
}

/** Gemini 抽出 JSON はプログラム採点。旧判定 JSON はそのまま検証する */
export function gradeGeminiResponse(raw: unknown): GradeResult {
  const detection = readChildDetectionHint(raw);
  try {
    const hybrid = gradeFromGeminiPayload(raw);
    if (hybrid) return { ...hybrid, child_detection: detection };
  } catch (error) {
    throw new GradeValidationError(error instanceof Error ? error.message : "EXTRACT_INVALID");
  }
  return { ...validateGradeResult(raw), child_detection: detection };
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
