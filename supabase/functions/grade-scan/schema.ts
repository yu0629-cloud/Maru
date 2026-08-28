import { SUBJECT_CODES, type SubjectCode } from "./subject.ts";

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
export type { SubjectCode };
export { SUBJECT_CODES };

/** Gemini Vision の正規化座標。各値は 0〜1000 */
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
};

export type GradeResult = {
  subject: SubjectCode;
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
 * Gemini に出させる抽出キー。正誤・難易度・声かけ・解説はサーバ側で補う。
 * problem_index は問番号（"3", "16"）。question_text は解く式（"0 + 7 ="）。番号だけは禁止。
 * bbox は「=」のすぐ右の解答欄 [ymin, xmin, ymax, xmax]（各 0〜1000）。式全体ではない。
 * subject はプリント全体の教科。
 */
export const GRADE_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    subject: {
      type: "STRING",
      format: "enum",
      enum: SUBJECT_CODES,
      description:
        "Subject of the whole worksheet. math=Math, japanese=Japanese language (Japan), spelling_phonics=Spelling/Phonics/Vocabulary, reading=Reading Comprehension, writing_grammar=Writing & Grammar, science=Science & STEM, social_studies=Social Studies/History/Geography, world_languages=Spanish & World Languages, other=none of the above (keep the worksheet title as topic).",
    },
    problems: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          problem_index: {
            type: "STRING",
            description:
              'Question number only (circled or leading), e.g. "3" or "16". Never the formula. Example: print "⑯ 2 + 4 = 6" → "16".',
          },
          question_text: {
            type: "STRING",
            description:
              'Printed formula or full stem to solve, e.g. "0 + 7 =", "2 + 6 =", "15 - 8 =", "2 + 4 =". Include "=". NEVER only a question number like "16". Do not include handwriting.',
          },
          student_answer: {
            type: "STRING",
            description: "Child's handwritten answer to the right of '='. Not the question number.",
          },
          correct_answer: {
            type: "STRING",
            description: "Correct answer for the printed formula. Not the question number.",
          },
          type: { type: "STRING", format: "enum", enum: ["math", "text"] },
          topic: {
            type: "STRING",
            description:
              'Required Japanese unit name for elementary/preschool, e.g. "くり上がりのある足し算", "くり下がりのある引き算", "漢字の読み", "漢字の書き取り", "ひらがな". Never a question number. Prefer specific names over generic たし算.',
          },
          bbox: {
            type: "ARRAY",
            description:
              "Answer slot immediately to the right of printed '=' (where the child writes). NOT the whole formula, NOT the circled question number. [ymin,xmin,ymax,xmax] 0-1000. One row's blank/handwriting box only. Include empty slots.",
            minItems: 4,
            maxItems: 4,
            items: { type: "NUMBER" },
          },
        },
        required: ["problem_index", "question_text", "student_answer", "correct_answer", "type", "topic", "bbox"],
        propertyOrdering: [
          "problem_index",
          "question_text",
          "student_answer",
          "correct_answer",
          "type",
          "topic",
          "bbox",
        ],
      },
    },
  },
  required: ["subject", "problems"],
  propertyOrdering: ["subject", "problems"],
} as const;

/** 1次採点用。2.5 Flash Lite は新規キーで 404 になるため 3.5 Lite を使う */
export const GEMINI_MODEL = "gemini-3.5-flash-lite";
