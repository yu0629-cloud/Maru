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

export const VISUAL_TYPES = ["text_only", "has_figure", "passage_based"] as const;

export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];
export type MistakeType = (typeof MISTAKE_TYPES)[number];
export type ProblemType = (typeof PROBLEM_TYPES)[number];
export type VisualType = (typeof VISUAL_TYPES)[number];
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
  visual_type: VisualType;
  crop_box: GeminiBBox | null;
  passage_text?: string;
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
 * Gemini に出させる抽出キー。ground_truth は手書きを見る前に問題・図から導く。
 * is_correct は ground_truth と student_answer の比較。サーバ側でも再判定する。
 * problem_index は問番号（"3", "16"）。question_text は解く式や設問文。番号だけは禁止。
 * bbox は「=」のすぐ右の解答欄 [ymin, xmin, ymax, xmax]（各 0〜1000）。式全体ではない。
 * visual_type は文字だけで解けるか、図が必要か、長文本文が必要か。
 * crop_box は has_figure のとき、図を含む「解くために必要な最小範囲」（手書き解答欄はなるべく除く）。
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
              'Printed formula or full stem to solve, e.g. "0 + 7 =", "2 + 6 =", "15 - 8 =", "2 + 4 =", "④ あの角度は、( )です。". Include "=" when printed. NEVER only a question number like "16". Do not include handwriting.',
          },
          ground_truth: {
            type: "STRING",
            description:
              "Step1: the true answer YOU derive from the printed problem, figure, protractor marks, and word bank — BEFORE reading handwriting. Example: acute angle on a protractor → 50°. NEVER copy the child's writing. If there is a word bank, pick only from those options.",
          },
          student_answer: {
            type: "STRING",
            description:
              "Step2: the child's handwritten answer exactly as written (e.g. 120° even if it is not in the word bank). Not the question number. Empty string if blank.",
          },
          is_correct: {
            type: "BOOLEAN",
            description:
              "Step3: true only if student_answer matches ground_truth. If they differ, MUST be false. For select-all questions, missing any required choice is false.",
          },
          correct_answer: {
            type: "STRING",
            description: "Same value as ground_truth. Never the child's handwriting.",
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
          visual_type: {
            type: "STRING",
            format: "enum",
            enum: ["text_only", "has_figure", "passage_based"],
            description:
              "text_only=solvable from printed numbers/letters only (arithmetic, kanji, vocab). has_figure=needs a diagram/graph/clock/illustration/table. passage_based=needs a shared reading passage or dialogue.",
          },
          crop_box: {
            type: "ARRAY",
            description:
              "For has_figure: smallest region needed to solve, including the shared parent figure/illustration, excluding the child's handwriting/answer slot as much as possible. [ymin,xmin,ymax,xmax] 0-1000. For text_only, the printed formula/stem only.",
            minItems: 4,
            maxItems: 4,
            items: { type: "NUMBER" },
          },
          passage_text: {
            type: "STRING",
            description:
              "Shared passage or dialogue for passage_based items. Empty string if not a reading item. Do not include the question itself.",
          },
        },
        required: [
          "problem_index",
          "question_text",
          "ground_truth",
          "student_answer",
          "is_correct",
          "correct_answer",
          "type",
          "topic",
          "bbox",
          "visual_type",
          "crop_box",
        ],
        propertyOrdering: [
          "problem_index",
          "question_text",
          "ground_truth",
          "student_answer",
          "is_correct",
          "correct_answer",
          "type",
          "topic",
          "bbox",
          "visual_type",
          "crop_box",
          "passage_text",
        ],
      },
    },
  },
  required: ["subject", "problems"],
  propertyOrdering: ["subject", "problems"],
} as const;

/** 1次採点用。2.5 Flash Lite は新規キーで 404 になるため 3.5 Lite を使う */
export const GEMINI_MODEL = "gemini-3.5-flash-lite";
