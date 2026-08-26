import { geminiBBoxToNormalizedBox } from "./bbox.ts";
import { inferSubjectFromProblemType } from "./problem-types.ts";
import { shouldQueueInpaint } from "./validate.ts";
import type { GradeProblem, GradeResult, ProblemType } from "./schema.ts";

export type SubjectCode = "math" | "japanese" | "science" | "social" | "english" | "other";

export function inferSubject(topicTag: string, problemType?: ProblemType): SubjectCode {
  if (problemType) return inferSubjectFromProblemType(problemType, topicTag);
  return inferSubjectFromProblemType("standard", topicTag);
}

export type ProblemInsert = {
  scan_id: string;
  child_id: string;
  problem_index: number;
  problem_label: string;
  bounding_box: { x: number; y: number; width: number; height: number };
  gemini_bbox: GradeProblem["bbox"];
  is_correct: boolean;
  student_answer: string;
  correct_answer: string;
  explanation: string;
  subject: SubjectCode;
  unit: string;
  topic_tags: string[];
  difficulty_level: GradeProblem["difficulty_level"];
  mistake_type: GradeProblem["mistake_type"];
  parent_coaching_tip: string;
  needs_inpaint: boolean;
  problem_type: ProblemType;
};

export function toProblemInserts(
  result: GradeResult,
  input: { scanId: string; childId: string },
): ProblemInsert[] {
  return result.problems.map((problem, index) => ({
    scan_id: input.scanId,
    child_id: input.childId,
    problem_index: index + 1,
    problem_label: problem.problem_index,
    bounding_box: geminiBBoxToNormalizedBox(problem.bbox),
    gemini_bbox: problem.bbox,
    is_correct: problem.is_correct,
    student_answer: problem.student_answer,
    correct_answer: problem.correct_answer,
    explanation: problem.correct_answer,
    subject: inferSubject(problem.topic_tag, problem.problem_type),
    unit: problem.topic_tag,
    topic_tags: [problem.topic_tag],
    difficulty_level: problem.difficulty_level,
    mistake_type: problem.mistake_type,
    parent_coaching_tip: problem.parent_coaching_tip,
    needs_inpaint: problem.needs_inpaint,
    problem_type: problem.problem_type,
  }));
}

export function inpaintTargetsFromInserts<T extends { is_correct: boolean; needs_inpaint: boolean }>(
  rows: T[],
): T[] {
  return rows.filter((row) => shouldQueueInpaint(row));
}
