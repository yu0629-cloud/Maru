import type { PrintProblem } from "./html";

export const MOCK_CHILD = {
  id: "mock-child-1",
  parent_id: "mock-parent-1",
  name: "はると",
  grade_code: "e4" as const,
  exam_target: "中学受験",
  target_subjects: ["math", "japanese"] as Array<
    | "math"
    | "japanese"
    | "spelling_phonics"
    | "reading"
    | "writing_grammar"
    | "science"
    | "social_studies"
    | "world_languages"
    | "other"
  >,
  avatar_hue: 12,
  sort_order: 0,
  created_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
};

export const MOCK_PRINT_PROBLEMS: PrintProblem[] = [
  {
    id: "p-calc",
    label: "計算 (1)〜(4)",
    topicTag: "計算ドリル",
    subject: "math",
    problemType: "calc_block",
    bbox: [80, 60, 260, 940],
    isCorrect: false,
    questionText: "5 + 4 =",
    studentAnswer: "43",
    correctAnswer: "(1) 34 (2) 63 (3) 72 (4) 9",
    parentCoachingTip: "位がずれています。「位を揃えて、もう一回ゆっくり書いてみよう」",
  },
  {
    id: "p-geo",
    label: "大問3",
    topicTag: "立体切断",
    subject: "math",
    problemType: "math_geometry_graph",
    bbox: [830, 60, 980, 940],
    isCorrect: false,
    questionText: "立体を切った切り口はどんな形になりますか。",
    studentAnswer: "",
    correctAnswer: "正六角形になる場合を確認。",
    parentCoachingTip: "式の前に図が空です。「式はあとでいいよ。まず問題の条件を図に書き込んでみよう」",
  },
  {
    id: "p-std",
    label: "大問2",
    topicTag: "つるかめ算",
    subject: "math",
    problemType: "standard",
    bbox: [480, 60, 820, 940],
    isCorrect: false,
    questionText: "つるとかめが合わせて10ひきいます。足は全部で34本です。",
    studentAnswer: "つる4ひき、かめ6ひき",
    correctAnswer: "つる3ひき、かめ7ひき。",
    parentCoachingTip: "全部かめにしたら足は何本？ そこから一緒に戻そう。",
  },
  {
    id: "p-kanji",
    label: "漢字 4",
    topicTag: "漢字",
    subject: "japanese",
    problemType: "kanji",
    bbox: [100, 40, 220, 480],
    isCorrect: false,
    questionText: "「ちゅうい」の「ちゅう」を漢字で書きなさい。",
    studentAnswer: "注",
    correctAnswer: "注（さんずい＋主）",
    parentCoachingTip: "へんとつくりの幅が偏っています。",
  },
  {
    id: "p-read",
    label: "読解 2",
    topicTag: "長文読解",
    subject: "japanese",
    problemType: "reading_passage",
    visualType: "passage_based",
    bbox: [200, 50, 780, 950],
    isCorrect: false,
    questionText: "川の水かさが増えた理由を書きなさい。",
    passageText: "雨が三日続いたので、川の水かさが増えた。",
    studentAnswer: "川が増えた",
    correctAnswer: "雨が続いたから、川の水かさが増えたから。",
    parentCoachingTip: "理由の接続が見えません。",
  },
  {
    id: "p-ok",
    label: "かけ算",
    topicTag: "かけ算",
    subject: "math",
    problemType: "calc_block",
    bbox: [40, 60, 80, 940],
    isCorrect: true,
    studentAnswer: "72",
    correctAnswer: "72",
    parentCoachingTip: "九九は安定しています。",
  },
];

export function mockPrintDocumentInput() {
  return {
    title: "8月26日のまとめプリント",
    childName: MOCK_CHILD.name,
    dateLabel: "2026年8月26日",
    problems: MOCK_PRINT_PROBLEMS,
    includeCheatSheet: false,
  };
}
