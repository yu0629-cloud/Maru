import type { CarteJson } from "./schema.ts";

export type PromptChild = {
  name?: string | null;
  gradeLabel?: string | null;
  examTarget?: string | null;
};

function percent(rate: number | undefined): string {
  if (rate === undefined || Number.isNaN(rate)) return "不明";
  return `${Math.round(rate * 100)}%`;
}

export function formatCarteForPrompt(carte: CarteJson | null | undefined): string {
  if (!carte) {
    return [
      "カルテ未作成（初回スキャン）。",
      "- 基礎定着率は未計測として、見た目の難易度だけで判定する。",
      "- つまずきは慎重に。careless と決めつけない。",
    ].join("\n");
  }

  const weak = (carte.weak_units ?? [])
    .map((unit) => {
      const name = unit.unit ?? "未分類";
      const rate = percent(unit.rate);
      const n = unit.total ?? 0;
      return `- ${name}（正答率 ${rate}, n=${n}）`;
    })
    .join("\n");

  const priority = carte.triage?.priority_units?.join("、") || "なし";

  return [
    `基礎定着率: ${percent(carte.foundation_rate)}`,
    `トリアージ: ${carte.triage?.level ?? "watch"}`,
    `要約: ${carte.triage?.summary ?? ""}`,
    `優先単元: ${priority}`,
    `累計スキャン: ${carte.scan_count ?? 0} / 累計問題: ${carte.problem_count ?? 0}`,
    "苦手単元:",
    weak || "- （まだ弱い単元は検出されていない）",
  ].join("\n");
}

/** 抽出キーのみ。正誤はサーバ側。問番号と式、解答欄 bbox を混ぜない */
export function buildSystemPrompt(_carte?: CarteJson | null, child?: PromptChild): string {
  const childLine = [
    child?.name ? `名前: ${child.name}` : null,
    child?.gradeLabel ? `学年: ${child.gradeLabel}` : null,
  ]
    .filter(Boolean)
    .join(" / ");

  return [
    "問題を抽出して JSON だけ返す。採点・思考・解説は禁止。is_correct は出すな。",
    childLine ? `対象: ${childLine}` : "",
    "ルートに subject と problems を置く。",
    "subject はプリント全体の教科を1つ。math=算数・数学、japanese=国語（日本）、spelling_phonics=スペル・フォニックス・語彙、reading=英語の読解、writing_grammar=文法・ライティング、science=理科・科学、social_studies=社会・歴史・地理、world_languages=外国語、other=その他。",
    "画像の中身から推測する。数式・計算・図形なら math。ひらがな・漢字・国語の読解なら japanese。アルファベット表・フォニックス・スペル・語彙なら spelling_phonics。英語の長文読解なら reading。英文法・作文なら writing_grammar。実験・植物・天気・STEM なら science。地図・歴史・公民・Social Studies なら social_studies。スペイン語など外国語なら world_languages。迷ったら other。other のときはプリントのタイトルを topic に残す。",
    "各問は problem_index, question_text, student_answer, correct_answer, type, topic, bbox。",
    "キーの意味を厳守する。混ぜない。",
    'problem_index: 丸数字や先頭の番号だけ（例: "14", "3"）。式を入れない。',
    'question_text: 実際に解く計算式（例: "2 + 6 =", "0 + 7 =", "15 - 8 ="）。等号まで。手書きは入れない。問題番号だけ（"14" など）は厳禁。',
    "student_answer: 等号の右の子どもの手書き。白紙は空文字。",
    "correct_answer: その式の正しい答え。問番号ではない。",
    "bbox: [ymin, xmin, ymax, xmax]（各 0〜1000）。式全体でも問番号でもなく、子どもが答えを書くスペース（印刷された「=」のすぐ右側の解答欄）だけ。空欄でもその解答位置を囲む。高さは当該行のみ。隣の行・左の式・丸番号・机は入れない。",
    [
      "【抽出例】",
      "プリントに「⑭ 2 + 6 =」（右は空欄または手書き）とある場合：",
      '{ "problem_index": "14", "question_text": "2 + 6 =", "student_answer": "", "correct_answer": "8", "type": "math", "topic": "くり上がりのない足し算", "bbox": [解答欄の ymin, xmin, ymax, xmax] }',
      "プリントに「⑯ 2 + 4 = 6」と書かれている場合：",
      '- problem_index: "16"',
      '- question_text: "2 + 4 ="',
      '- student_answer: "6"',
      '- correct_answer: "6"',
      "- bbox: 「=」のすぐ右の「6」の位置（式 2 + 4 や ⑯ は含めない）",
      "※ question_text に \"14\" や \"16\" だけを入れるな。必ず式を抽出する。",
    ].join("\n"),
    "type は math か text。topic は必須。小学生・幼児向けの具体的な日本語の単元名（例: くり上がりのある足し算、くり下がりのない引き算、漢字の読み、漢字の書き取り、ひらがな）。番号や式を topic にしない。",
    "student_answer は薄い鉛筆も読む。低学年の筆跡（丸い4、繋がる9、雪だるまの8、閉じた0）を正しい数字にする。書いてあれば空にしない。式の正解（例: 2+7=9, 0+0=0, 4+4=8, 6+3=9）と一致する数字ならその数字を返す。本当に白紙だけ空文字。",
    "1問=1件。まとめない。",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildUserPrompt(): string {
  return [
    "subject と problems を返せ。各問に topic を必ず付ける。",
    '例: { "subject": "math", "problems": [{ "problem_index": "14", "question_text": "2 + 6 =", "student_answer": "", "correct_answer": "8", "type": "math", "topic": "くり上がりのない足し算", "bbox": [ymin,xmin,ymax,xmax] }] }',
    "question_text は式（2 + 6 =）。問番号（14）を入れるな。",
    "bbox は「=」のすぐ右の解答欄。式全体ではない。正誤は出すな。",
  ].join(" ");
}

const GRADE_LABELS: Record<string, string> = {
  e1: "小1",
  e2: "小2",
  e3: "小3",
  e4: "小4",
  e5: "小5",
  e6: "小6",
  j1: "中1",
  j2: "中2",
  j3: "中3",
};

export function gradeCodeToLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return GRADE_LABELS[code] ?? code;
}
