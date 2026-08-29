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
  context_text?: string;
  options_text?: string;
  parent_figure_box?: GeminiBBox | null;
  sub_figure_box?: GeminiBBox | null;
};

/** 復習プリント用の自己完結ユニット。Gemini の problem_index は problem_number 相当。figureBase64 は切り抜き後に付与。 */
export type ProblemUnit = {
  problem_number: string | number;
  parent_context?: string;
  parent_figure_box?: GeminiBBox | null;
  question_text: string;
  sub_figure_box?: GeminiBBox | null;
  options_text?: string;
  is_correct: boolean;
  visual_type: VisualType;
  figureBase64?: string;
  subFigureBase64?: string;
};

export type GradeResult = {
  subject?: SubjectCode;
  overall_score: OverallScore;
  problems: GradeProblem[];
};
