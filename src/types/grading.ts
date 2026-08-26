import type { DifficultyLevel, MistakeType, ProblemType } from "./database";

export type { DifficultyLevel, MistakeType, ProblemType };
export type GeminiBBox = [ymin: number, xmin: number, ymax: number, xmax: number];

export type OverallScore = {
  earned: number;
  max: number;
};

export type GradeProblem = {
  problem_index: string;
  bbox: GeminiBBox;
  is_correct: boolean;
  student_answer: string;
  correct_answer: string;
  topic_tag: string;
  difficulty_level: DifficultyLevel;
  mistake_type: MistakeType;
  parent_coaching_tip: string;
  needs_inpaint: boolean;
  problem_type: ProblemType;
};

export type GradeResult = {
  overall_score: OverallScore;
  problems: GradeProblem[];
};
