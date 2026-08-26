export const PROBLEM_TYPES = [
  "calc_block",
  "math_geometry_graph",
  "kanji",
  "reading_passage",
  "science_social_diagram",
  "integrated_essay",
  "standard",
];

export const PROBLEM_TYPE_LABELS = {
  calc_block: "計算ドリル",
  math_geometry_graph: "作図・グラフ",
  kanji: "漢字・語句",
  reading_passage: "読解・記述",
  science_social_diagram: "理社の図表",
  integrated_essay: "適性検査・作文",
  standard: "文章題",
};

const CALC_HINTS = /計算ドリル|一行計算|九九|かけ算|わり算|たし算|ひき算|繰り上|繰り下|暗算|筆算/;
const GEOMETRY_HINTS = /作図|グラフ書き|展開図|立体|コンパス|定規|方眼に|円の|角度|体積|面積図|切断/;
const KANJI_HINTS = /漢字|部首|とめ|はね|はらい|語句|送り仮名|書き取り/;
const READING_HINTS = /読解|長文|記述|選択問題|傍線部|本文/;
const DIAGRAM_HINTS = /理科|社会|地図|実験|器具|回路|星座|歴史|地理|公民|天気/;
const ESSAY_HINTS = /適性検査|作文|資料読み|200字|400字|公立中高一貫|論述|意見文/;

export function isProblemType(value) {
  return typeof value === "string" && PROBLEM_TYPES.includes(value);
}

export function inferProblemType(input) {
  const hay = `${input.topicTag ?? ""} ${input.subject ?? ""} ${input.problemIndex ?? ""} ${input.studentAnswer ?? ""} ${input.correctAnswer ?? ""}`;

  if (ESSAY_HINTS.test(hay)) return "integrated_essay";
  if (KANJI_HINTS.test(hay) || (input.subject === "japanese" && /漢字|語句/.test(hay))) return "kanji";
  if (READING_HINTS.test(hay) && (input.subject === "japanese" || /国語|読解/.test(hay))) {
    return "reading_passage";
  }
  if (GEOMETRY_HINTS.test(hay)) return "math_geometry_graph";
  if (DIAGRAM_HINTS.test(hay) || input.subject === "science" || input.subject === "social") {
    return "science_social_diagram";
  }
  if (CALC_HINTS.test(hay)) return "calc_block";
  if (input.subject === "japanese") return "reading_passage";
  if (input.subject === "math") return "standard";
  return "standard";
}

export function inferSubjectFromProblemType(type, topicTag = "") {
  if (type === "kanji" || type === "reading_passage") return "japanese";
  if (type === "calc_block" || type === "math_geometry_graph") return "math";
  if (type === "integrated_essay") return "other";
  if (type === "science_social_diagram") {
    if (/社会|歴史|地理|公民|地図/.test(topicTag)) return "social";
    return "science";
  }
  if (/英語|英単/.test(topicTag)) return "english";
  if (/社会|歴史|地理/.test(topicTag)) return "social";
  if (/理科|実験|植物/.test(topicTag)) return "science";
  if (/漢字|読解|国語/.test(topicTag)) return "japanese";
  if (/算|数|図形|立体|分数/.test(topicTag)) return "math";
  return "other";
}

/** AI 向けの補完指示。保護者向け画面には出さない */
export const COACHING_GUIDANCE = {
  calc_block: "計算のどこで位が崩れたかを一言で伝え、同じ型を隣で1問だけ一緒に解く。",
  math_geometry_graph: "いきなり式を書かせず、まずは問題用紙の条件を図に書き込ませる声かけ。",
  kanji: "へんとつくりのバランスやトメ・ハネの注意点を具体的に伝える。",
  reading_passage: "指定キーワード（因果関係『〜だから』）が入っているかの誘導。",
  science_social_diagram: "単なる用語暗記ではなく、背景の理由（なぜそうなるか）を問いかける。",
  integrated_essay: "グラフの数値の変化を言葉にできているかを確認する声かけ。",
  standard: "なぜ間違えたかを先に一言。怒らず、次の一手だけ示す。",
};

export const COACHING_LINES = {
  calc_block: "位を揃えてもう一度書こう",
  math_geometry_graph: "条件を図に書き込んでみよう",
  kanji: "とめ・はねを見直そう",
  reading_passage: "答えに『だから』はある？",
  science_social_diagram: "なぜそうなるか言える？",
  integrated_essay: "グラフの変化を言葉にしよう",
  standard: "今わかることを一つ書こう",
};

const COACHING_TIP_MAX = 20;

export const PRAISE_LINES = {
  calc_block: "よくできています。位を揃える丁寧さ、このままで大丈夫です。",
  math_geometry_graph: "よくできています。図に条件を書く習慣が身についています。",
  kanji: "よくできています。とめ・はねまで丁寧に書けています。",
  reading_passage: "よくできています。本文の根拠を取る読み方ができています。",
  science_social_diagram: "よくできています。図表の読み取りができています。",
  integrated_essay: "よくできています。資料の変化を言葉にできています。",
  standard: "よくできています。この調子で次もいきましょう。",
};

function leakedGuidance(text) {
  if (!text) return false;
  return Object.values(COACHING_GUIDANCE).some((guide) => text.includes(guide.slice(0, 10)));
}

const COACHING_MARKERS = {
  calc_block: /位|繰り|計算|九九/,
  math_geometry_graph: /図に|条件を図|作図|グラフ/,
  kanji: /とめ|はね|はらい|へん|つくり|部首|バランス/,
  reading_passage: /だから|キーワード|因果/,
  science_social_diagram: /なぜ|理由|どうして/,
  integrated_essay: /グラフ|数値|変化|資料/,
  standard: /.+/,
};

export function enrichCoachingTip(type, tip, isCorrect) {
  if (isCorrect) return "";
  const trimmed = String(tip ?? "").trim();
  const leaked = leakedGuidance(trimmed);
  const raw = trimmed.length >= 4 && !leaked ? trimmed : (COACHING_LINES[type] ?? COACHING_LINES.standard);
  return raw.slice(0, COACHING_TIP_MAX);
}

/** 計算ドリルも1問ずつ返す。まとめない */
export function mergeCalcBlocks(problems) {
  return problems;
}
