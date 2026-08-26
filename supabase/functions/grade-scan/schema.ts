export const DIFFICULTY_LEVELS = ["basic", "standard", "advanced"] as const;
export const MISTAKE_TYPES = ["careless", "concept_gap", "blank", "none"] as const;
export const PROBLEM_TYPES = [
  "calc_block",
  "math_geometry_graph",
  "kanji",
  "reading_passage",
  "science_social_diagram",
  "integrated_essay",
  "standard",
] as const;

export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];
export type MistakeType = (typeof MISTAKE_TYPES)[number];
export type ProblemType = (typeof PROBLEM_TYPES)[number];

/** Gemini Vision の正規化座標。各値は 0〜1000 */
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

export type CarteJson = {
  foundation_rate?: number;
  weak_units?: Array<{
    subject?: string | null;
    unit?: string;
    correct?: number;
    total?: number;
    rate?: number;
  }>;
  subject_stats?: Record<string, unknown>;
  triage?: {
    level?: string;
    priority_units?: string[];
    summary?: string;
  };
  scan_count?: number;
  problem_count?: number;
};

/**
 * Gemini に出させるのはこの5キーだけ。正誤・難易度・声かけ・解説はサーバ側で補う。
 * bbox は Vision 正規化座標 [ymin, xmin, ymax, xmax]（各 0〜1000）。
 * 手書きインクではなく、印刷された問題式（等号と解答枠を含む1行）の矩形。
 */
export const GRADE_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    problems: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          problem_index: { type: "STRING" },
          student_answer: { type: "STRING" },
          correct_answer: { type: "STRING" },
          type: { type: "STRING", format: "enum", enum: ["math", "text"] },
          bbox: {
            type: "ARRAY",
            description:
              "Printed formula row including '=' and answer slot, not handwriting. [ymin,xmin,ymax,xmax] 0-1000. One row only.",
            minItems: 4,
            maxItems: 4,
            items: { type: "NUMBER" },
          },
        },
        required: ["problem_index", "student_answer", "correct_answer", "type", "bbox"],
        propertyOrdering: ["problem_index", "student_answer", "correct_answer", "type", "bbox"],
      },
    },
  },
  required: ["problems"],
  propertyOrdering: ["problems"],
} as const;

/** 1次採点用。2.5 Flash Lite は新規キーで 404 になるため 3.5 Lite を使う */
export const GEMINI_MODEL = "gemini-3.5-flash-lite";
