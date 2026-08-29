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

export type QuestionUnit = {
  parent_context: string;
  context_text: string;
  question_text: string;
  options_text: string;
  parent_figure_box: GeminiBBox | null;
  sub_figure_box: GeminiBBox | null;
  crop_box: GeminiBBox | null;
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
  context_text?: string;
  options_text?: string;
  parent_figure_box?: GeminiBBox | null;
  sub_figure_box?: GeminiBBox | null;
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
 * question_unit は復習用の完全ユニット。parent_context / question_text / options_text / parent_figure_box / sub_figure_box。
 * parent_figure_box は大問の共通図。sub_figure_box は設問ごとの表・グラフ。付属ラベル・引き出し線・記号を含む完全境界。外側余白は約 2〜3%。問題文テキストと手書きは含めない。
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
              'Printed formula or COMPLETE stem through the final instruction, e.g. "0 + 7 =", "次の①〜③からすべて選び、番号を書きましょう。", "記号を書きましょう。", "④ あの角度は、( )です。". Never truncate mid-sentence. Include "=" when printed. NEVER only a question number like "16". Do not include handwriting.',
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
              "text_only=solvable from printed numbers/letters only (arithmetic, kanji, vocab). has_figure=needs a diagram/graph/clock/illustration/table/source figure. passage_based=needs a shared reading passage, dialogue, or underlined excerpt.",
          },
          crop_box: {
            type: "ARRAY",
            description:
              "Same as question_unit.parent_figure_box when a shared parent figure exists, otherwise question_unit.sub_figure_box or the printed formula. PURE pixels only — no printed stems/choices. [ymin,xmin,ymax,xmax] 0-1000. Use [0,0,0,0] if unused.",
            minItems: 4,
            maxItems: 4,
            items: { type: "NUMBER" },
          },
          question_unit: {
            type: "OBJECT",
            description:
              "Complete self-contained review unit: resolve every reference in the stem (figure/table/graph/passage/underline/choices) into parent_context, parent_figure_box, sub_figure_box, and options_text. Always fill all fields ([0,0,0,0] or empty string if unused).",
            properties: {
              parent_context: {
                type: "STRING",
                description:
                  'Shared stem of the parent question — lead-in, passage, dialogue, or source intro, e.g. "下の図のような手順で、てこが水平につり合うのは…". Same as context_text. Empty if standalone formula.',
              },
              context_text: {
                type: "STRING",
                description: "Same string as parent_context.",
              },
              question_text: {
                type: "STRING",
                description:
                  'This sub-question only, copied through the final period/instruction, e.g. "(3) 実験の結果を表にまとめると…", "次の①〜③からすべて選び、番号を書きましょう。", "2 + 6 =". Never truncate. Never only a number like "16".',
              },
              options_text: {
                type: "STRING",
                description:
                  "ALL numbered choices and word banks exactly as printed with nothing omitted, e.g. \"① 支点からのきょりが2倍 ② おもりを2倍 ③ 力点と作用点を入れかえる\" or \"語群: 50° 130°\". Empty string if none.",
              },
              parent_figure_box: {
                type: "ARRAY",
                description:
                  "Complete visual rectangle of the shared parent figure for ANY subject layout (science/math/social/English): illustration/photo/experiment diagram/geometry/map/circuit PLUS ALL supporting elements — leader lines/arrows end-to-end, surrounding labels (ふた / 底のない集気びん / すき間 / ねん土 / 支点 / 目盛 / units), panel IDs (ア〜エ / ㋐〜㋓ / (a)(b) / 図1 / ❶❷❸), and short captions under panels. ymin MUST clear the topmost label or leader (e.g. 「すき間」 above ㋑). ymax MUST clear the bottommost IDs/captions and STOP immediately ABOVE stem (1) or lead-in text — never include sub-question or parent-stem text. xmin MUST include the first character of leftmost labels and leader tips. xmax MUST include the full right edge of the rightmost panel (e.g. jar ㋓ / lever ❸) — clipped right edges fail. Keep outside margin ~2-3% only — no paper edge or dark background. Never include handwriting, printed stems, choices, or tables (tables go in sub_figure_box). [ymin,xmin,ymax,xmax] 0-1000. Same box for every sub-question that shares the figure. [0,0,0,0] if none.",
                minItems: 4,
                maxItems: 4,
                items: { type: "NUMBER" },
              },
              sub_figure_box: {
                type: "ARRAY",
                description:
                  "This sub-question's own ruled table/chart/data figure, applying the same complete-boundary rule (header through last row, left/right borders, axis labels/units). Non-zero when a table/chart is required OR helpful to solve (表にまとめると / 和にまとめると / 次の表 / 下の表 / 実験の結果 / 下のようになりました / グラフ), e.g. (2)(3)(6): the 左のうで / 右のうで / おもりの位置と重さ table. NEVER [0,0,0,0] in that case. When a shared parent illustration AND a data table both exist and either is required or helpful (lever diagram + weight table), fill BOTH parent_figure_box and sub_figure_box — do not omit the parent just because the table is primary. Not the parent illustration. Never include handwriting. [ymin,xmin,ymax,xmax] 0-1000. [0,0,0,0] only if none.",
                minItems: 4,
                maxItems: 4,
                items: { type: "NUMBER" },
              },
              crop_box: {
                type: "ARRAY",
                description:
                  "Legacy alias: parent_figure_box if present, else sub_figure_box. [0,0,0,0] if no figure.",
                minItems: 4,
                maxItems: 4,
                items: { type: "NUMBER" },
              },
            },
            required: [
              "parent_context",
              "context_text",
              "question_text",
              "options_text",
              "parent_figure_box",
              "sub_figure_box",
              "crop_box",
            ],
            propertyOrdering: [
              "parent_context",
              "context_text",
              "question_text",
              "options_text",
              "parent_figure_box",
              "sub_figure_box",
              "crop_box",
            ],
          },
          passage_text: {
            type: "STRING",
            description:
              "Shared passage or dialogue for passage_based items. Same content as question_unit.context_text when reading. Empty string if not a reading item.",
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
          "question_unit",
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
          "question_unit",
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
