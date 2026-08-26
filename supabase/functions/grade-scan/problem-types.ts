import type { ProblemType } from "./schema.ts";

export { PROBLEM_TYPES, type ProblemType } from "./schema.ts";
export {
  PROBLEM_TYPE_LABELS,
  COACHING_GUIDANCE,
  COACHING_LINES,
  PRAISE_LINES,
  isProblemType,
  inferProblemType,
  inferSubjectFromProblemType,
  enrichCoachingTip,
  mergeCalcBlocks,
} from "./problem-types.mjs";

export type MergeableProblem = {
  problem_index: string;
  bbox: [number, number, number, number];
  is_correct: boolean;
  student_answer: string;
  correct_answer: string;
  topic_tag: string;
  difficulty_level: string;
  mistake_type: string;
  parent_coaching_tip: string;
  needs_inpaint: boolean;
  problem_type: ProblemType;
};
