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

/** 抽出＋自己検証。ground_truth は手書きを見る前に導く。正誤はサーバでも再判定する */
export function buildSystemPrompt(_carte?: CarteJson | null, child?: PromptChild): string {
  const childLine = [
    child?.name ? `名前: ${child.name}` : null,
    child?.gradeLabel ? `学年: ${child.gradeLabel}` : null,
  ]
    .filter(Boolean)
    .join(" / ");

  return [
    "問題を抽出して JSON だけ返す。解説文は書くな。",
    childLine ? `対象: ${childLine}` : "",
    "ルートに subject と problems を置く。",
    "subject はプリント全体の教科を1つ。math=算数・数学、japanese=国語（日本）、spelling_phonics=スペル・フォニックス・語彙、reading=英語の読解、writing_grammar=文法・ライティング、science=理科・科学、social_studies=社会・歴史・地理、world_languages=外国語、other=その他。",
    "画像の中身から推測する。数式・計算・図形なら math。ひらがな・漢字・国語の読解なら japanese。アルファベット表・フォニックス・スペル・語彙なら spelling_phonics。英語の長文読解なら reading。英文法・作文なら writing_grammar。実験・植物・天気・STEM なら science。地図・歴史・公民・Social Studies なら social_studies。スペイン語など外国語なら world_languages。迷ったら other。other のときはプリントのタイトルを topic に残す。",
    "各問は problem_index, question_text, ground_truth, student_answer, is_correct, correct_answer, type, topic, bbox, visual_type, crop_box。",
    "キーの意味を厳守する。混ぜない。",
    "【採点思考。JSON を書く前に必ずこの順で行う。書かれている手書きを正解だとみなすな】",
    "Step 1 ground_truth: 印刷された問題文・図・分度器の目盛り・語群（選択肢）・実験の表だけから、自分で真の正解をゼロから導く。手書きはまだ見るな。鋭角なら内側の目盛り（右0°基準なら50°）、鈍角なら外側。語群に 50° と 130° の両方があっても、手書き側を選ぶな。『すべて選び』は表や文を自分で判定し、正しい番号をすべて列挙する（例: 1,3）。計算は式を自分で解け。",
    "Step 2 student_answer: 子どもの手書きをそのまま読む。語群にある「130°」や誤った「2」でも、書いたとおり抽出する。白紙は空文字。",
    "Step 3 is_correct: ground_truth と student_answer を厳密に比較する。一致しなければ必ず false。『すべて選べ』で一部しか選んでいない場合（正解が 1と3 なのに 2 だけ等）も false。",
    "ground_truth に手書きをコピーするな。student_answer を正解に寄せて直すな。",
    'problem_index: 丸数字や先頭の番号だけ（例: "14", "3"）。式を入れない。',
    'question_text: 実際に解く計算式または設問文（例: "2 + 6 =", "0 + 7 =", "④ ㋐の角度は、( )です。語群: じょうぎ 分度器 アイ イウ アウ 130° 50°"）。語群や①②③の文は省略せず入れる。等号があれば等号まで。手書きは入れない。問題番号だけ（"14" など）は厳禁。',
    "student_answer: 解答欄の子どもの手書き。白紙は空文字。",
    "correct_answer: ground_truth と同じ値。手書きではない。",
    "bbox: [ymin, xmin, ymax, xmax]（各 0〜1000）。式全体でも問番号でもなく、子どもが答えを書くスペース（印刷された「=」のすぐ右側の解答欄）だけ。空欄でもその解答位置を囲む。高さは当該行のみ。隣の行・左の式・丸番号・机は入れない。",
    "visual_type: text_only / has_figure / passage_based のどれか1つ。計算式・漢字・語彙など文字だけで解けるなら text_only。図形・グラフ・時計・イラスト・表など画像がないと解けないなら has_figure。長文読解・対話文など共通の本文が必要ななら passage_based。",
    "crop_box: [ymin, xmin, ymax, xmax]（各 0〜1000）。has_figure のときは、親問題の共通図や説明イラストを含めた「解くために必要な最小範囲」。子どもの手書き解答欄はなるべく除く。text_only のときは印刷された式・問題文の範囲。passage_based のときは該当設問の範囲（本文は passage_text）。",
    "passage_text: passage_based のときだけ、共通の本文・対話文。設問文は入れない。それ以外は空文字。",
    [
      "【抽出例】",
      "プリントに「⑭ 2 + 6 =」（右は空欄または手書き）とある場合：",
      '{ "problem_index": "14", "question_text": "2 + 6 =", "ground_truth": "8", "student_answer": "", "is_correct": false, "correct_answer": "8", "type": "math", "topic": "くり上がりのない足し算", "bbox": [解答欄], "visual_type": "text_only", "crop_box": [式の範囲] }',
      "プリントに「⑯ 2 + 4 = 6」と書かれている場合：",
      '- problem_index: "16"',
      '- question_text: "2 + 4 ="',
      '- ground_truth: "6"',
      '- student_answer: "6"',
      '- is_correct: true',
      '- correct_answer: "6"',
      "- bbox: 「=」のすぐ右の「6」の位置（式 2 + 4 や ⑯ は含めない）",
      "分度器の図で鋭角㋐を読み、語群に 50° と 130° があり、子どもが外側の 130° と書いた場合：",
      '- question_text: "④ ㋐の角度は、( )です。語群: 130° 50°"',
      '- ground_truth: "50°"（内側目盛り。手書きの 130° をコピーするな）',
      '- student_answer: "130°"（書いたとおり）',
      "- is_correct: false",
      "てこの『①〜③からすべて選び』で、表から正しいのは ① と ③、子どもが ② だけ書いた場合：",
      '- question_text: "次の①〜③からすべて選び、番号を書きましょう。"',
      '- ground_truth: "1,3"',
      '- student_answer: "2"',
      "- is_correct: false（2 を ground_truth にコピーするな。一部選択も不正解）",
      "※ question_text に \"14\" や \"16\" だけを入れるな。必ず式または設問を抽出する。",
    ].join("\n"),
    "type は math か text。topic は必須。小学生・幼児向けの具体的な日本語の単元名（例: くり上がりのある足し算、くり下がりのない引き算、漢字の読み、漢字の書き取り、ひらがな）。番号や式を topic にしない。",
    "student_answer は薄い鉛筆も読む。低学年の筆跡（丸い4、繋がる9、雪だるまの8、閉じた0）を正しい数字にする。書いてあれば空にしない。本当に白紙だけ空文字。",
    "1問=1件。まとめない。",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildUserPrompt(): string {
  return [
    "subject と problems を返せ。各問に ground_truth と topic を必ず付ける。",
    "先に図と印刷文から ground_truth を出し、次に手書きを student_answer に取り、最後に比較して is_correct を付ける。",
    '例: { "subject": "math", "problems": [{ "problem_index": "4", "question_text": "④ ㋐の角度は、( )です。語群: 130° 50°", "ground_truth": "50°", "student_answer": "130°", "is_correct": false, "correct_answer": "50°", "type": "math", "topic": "角度", "bbox": [ymin,xmin,ymax,xmax], "visual_type": "has_figure", "crop_box": [ymin,xmin,ymax,xmax] }] }',
    "question_text は式（2 + 6 =）または設問。問番号（14）を入れるな。",
    "bbox は「=」のすぐ右の解答欄。式全体ではない。ground_truth に手書きを入れるな。",
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
