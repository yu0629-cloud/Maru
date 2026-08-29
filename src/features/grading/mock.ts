import { MOCK_PRINT_PROBLEMS } from "@/src/features/print/mock";
import type { GradedProblemView } from "@/src/features/grading/corrections";
import type { GradeResult } from "@/src/types/grading";
import type { TriageLevel } from "@/src/types/database";

export const MOCK_GRADE_RESULT: GradeResult = {
  subject: "math",
  overall_score: { earned: 7, max: 10 },
  problems: [
    {
      problem_index: "大問1 (1)",
      question_text: "8 × 9 =",
      bbox: [80, 60, 260, 940],
      is_correct: true,
      student_answer: "72",
      correct_answer: "72。8×9=72。",
      topic_tag: "かけ算",
      difficulty_level: "basic",
      mistake_type: "none",
      parent_coaching_tip: "九九は安定しています。「この調子で、次の繰り下がりも同じ丁寧さでいこう」",
      needs_inpaint: false,
      problem_type: "calc_block",
      visual_type: "text_only",
      crop_box: [80, 60, 260, 500],
    },
    {
      problem_index: "大問1 (2)",
      question_text: "52 - 18 =",
      bbox: [270, 60, 460, 940],
      is_correct: false,
      student_answer: "43",
      correct_answer: "34。十の位から繰り下がって 12-8=4。",
      topic_tag: "繰り下がり",
      difficulty_level: "basic",
      mistake_type: "concept_gap",
      parent_coaching_tip:
        "十の位から借りる意識が抜けています。「怒らないよ。52の2から8は引けないね。隣から1借りて12にしてみよう」",
      needs_inpaint: true,
      problem_type: "calc_block",
      visual_type: "text_only",
      crop_box: [270, 60, 460, 500],
    },
    {
      problem_index: "大問2",
      question_text: "つるとかめが合わせて10ひき、足の数が34本。それぞれ何ひき？",
      bbox: [480, 60, 820, 940],
      is_correct: false,
      student_answer: "つる4ひき、かめ6ひき",
      correct_answer: "つる3ひき、かめ7ひき。",
      topic_tag: "つるかめ算",
      difficulty_level: "advanced",
      mistake_type: "concept_gap",
      parent_coaching_tip: "全部かめにしたら足は何本？ そこから一緒に戻そう。",
      needs_inpaint: true,
      problem_type: "standard",
      visual_type: "text_only",
      crop_box: [480, 60, 820, 940],
    },
    {
      problem_index: "大問3",
      question_text: "立方体を切った切り口の形は？",
      bbox: [830, 60, 980, 940],
      is_correct: false,
      student_answer: "",
      correct_answer: "正六角形になる場合を確認。",
      topic_tag: "立体切断",
      difficulty_level: "advanced",
      mistake_type: "blank",
      parent_coaching_tip: "今日は図に線を1本だけ書いてみよう。",
      needs_inpaint: false,
      problem_type: "math_geometry_graph",
      visual_type: "has_figure",
      crop_box: [830, 40, 980, 700],
    },
  ],
};

const IMAGE_BY_TOPIC: Record<string, string> = {
  かけ算: MOCK_PRINT_PROBLEMS[0].imageSrc ?? "",
  繰り下がり: MOCK_PRINT_PROBLEMS[0].imageSrc ?? "",
  つるかめ算: MOCK_PRINT_PROBLEMS[2].imageSrc ?? "",
  立体切断: MOCK_PRINT_PROBLEMS[1].imageSrc ?? "",
};

export function gradeResultToView(result: GradeResult, scanId: string): GradedProblemView[] {
  return result.problems.map((problem, index) => ({
    id: `${scanId}-p${index + 1}`,
    problem_index: index + 1,
    problem_label: problem.problem_index,
    question_text: problem.question_text ?? "",
    is_correct: problem.is_correct,
    mistake_type: problem.mistake_type,
    parent_coaching_tip: problem.parent_coaching_tip,
    student_answer: problem.student_answer,
    correct_answer: problem.correct_answer,
    topic_tag: problem.topic_tag,
    imageSrc: IMAGE_BY_TOPIC[problem.topic_tag] ?? MOCK_PRINT_PROBLEMS[0].imageSrc ?? "",
    needs_inpaint: problem.needs_inpaint,
    problem_type: problem.problem_type,
    visual_type: problem.visual_type,
    crop_box: problem.crop_box,
    passage_text: problem.passage_text,
    context_text: problem.context_text,
    options_text: problem.options_text,
    bbox: problem.bbox,
  }));
}

export type CarteUnitStat = {
  unit: string;
  rate: number;
  total?: number;
  correct?: number;
  subject?: string | null;
};

export type CarteView = {
  foundation_rate: number;
  scan_count: number;
  problem_count: number;
  triage_level: TriageLevel;
  summary: string;
  weak_units: Array<CarteUnitStat & { total: number; correct: number }>;
  strong_units: CarteUnitStat[];
  careless_rate: number;
  recent_rates: number[];
};

export const EMPTY_CARTE: CarteView = {
  foundation_rate: 0,
  scan_count: 0,
  problem_count: 0,
  triage_level: "watch",
  summary: "",
  weak_units: [],
  strong_units: [],
  careless_rate: 0,
  recent_rates: [],
};

export const MOCK_CARTE: CarteView = {
  ...EMPTY_CARTE,
  foundation_rate: 0.62,
  scan_count: 8,
  problem_count: 40,
  triage_level: "needs_review",
  summary: "定着が不安定な単元がある。1日3〜5問の復習枠を守る。",
  weak_units: [
    { unit: "つるかめ算", rate: 0.25, total: 8, correct: 2, subject: "math" as const },
    { unit: "繰り下がり", rate: 0.44, total: 9, correct: 4, subject: "math" as const },
  ],
  strong_units: [
    { unit: "かけ算", rate: 0.9, total: 10, correct: 9, subject: "math" as const },
    { unit: "小数", rate: 0.8, total: 5, correct: 4, subject: "math" as const },
  ],
  careless_rate: 0.18,
  recent_rates: [0.5, 0.55, 0.6, 0.58, 0.62],
};
