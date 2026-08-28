import { geminiBBoxToNormalizedBox } from "./bbox.ts";
import { inferSubject, resolveScanSubject, type SubjectCode } from "./subject.ts";
import { shouldQueueInpaint } from "./validate.ts";
import type { GradeProblem, GradeResult, ProblemType, VisualType } from "./schema.ts";

export type { SubjectCode };
export { inferSubject, resolveScanSubject };

export type ProblemInsert = {
  scan_id: string;
  child_id: string;
  problem_index: number;
  problem_label: string;
  question_text: string;
  bounding_box: { x: number; y: number; width: number; height: number };
  gemini_bbox: GradeProblem["bbox"];
  is_correct: boolean;
  student_answer: string;
  correct_answer: string;
  explanation: string;
  subject: SubjectCode;
  unit: string;
  topic: string;
  topic_tags: string[];
  difficulty_level: GradeProblem["difficulty_level"];
  mistake_type: GradeProblem["mistake_type"];
  parent_coaching_tip: string;
  needs_inpaint: boolean;
  problem_type: ProblemType;
  visual_type: VisualType;
  crop_box: GradeProblem["bbox"] | null;
  passage_text: string;
};

export function toProblemInserts(
  result: GradeResult,
  input: { scanId: string; childId: string },
): ProblemInsert[] {
  const scanSubject = resolveScanSubject(result);
  return result.problems.map((problem, index) => ({
    scan_id: input.scanId,
    child_id: input.childId,
    problem_index: index + 1,
    problem_label: problem.problem_index,
    question_text: problem.question_text ?? "",
    bounding_box: geminiBBoxToNormalizedBox(problem.bbox),
    gemini_bbox: problem.bbox,
    is_correct: problem.is_correct,
    student_answer: problem.student_answer,
    correct_answer: problem.correct_answer,
    explanation: problem.correct_answer,
    subject: scanSubject,
    unit: problem.topic_tag,
    topic: problem.topic_tag,
    topic_tags: [problem.topic_tag],
    difficulty_level: problem.difficulty_level,
    mistake_type: problem.mistake_type,
    parent_coaching_tip: problem.parent_coaching_tip,
    needs_inpaint: problem.needs_inpaint,
    problem_type: problem.problem_type,
    visual_type: problem.visual_type,
    crop_box: problem.crop_box,
    passage_text: problem.passage_text ?? "",
  }));
}

export function inpaintTargetsFromInserts<T extends { is_correct: boolean; needs_inpaint: boolean }>(
  rows: T[],
): T[] {
  return rows.filter((row) => shouldQueueInpaint(row));
}
