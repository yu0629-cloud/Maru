import type { DifficultyLevel, MistakeType, ProblemType, SubjectCode, VisualType } from "./database";

export type { DifficultyLevel, MistakeType, ProblemType, SubjectCode, VisualType };
export type GeminiBBox = [ymin: number, xmin: number, ymax: number, xmax: number];

export type OverallScore = {
  earned: number;
  max: number;
};

export type GradeProblem = {
  problem_index: string;
  question_text: string;
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
  visual_type?: VisualType;
  crop_box?: GeminiBBox | null;
  passage_text?: string;
};

export type GradeResult = {
  subject?: SubjectCode;
  overall_score: OverallScore;
  problems: GradeProblem[];
};
