export const PROBLEM_TYPES = [
  "calc_block",
  "math_geometry_graph",
  "kanji",
  "reading_passage",
  "science_social_diagram",
  "integrated_essay",
  "standard",
];

export const ANSWER_STYLES = ["calc", "geometry", "graph", "kanji", "lined", "diagram", "essay"];

export const PROBLEM_TYPE_LABELS = {
  calc_block: "計算ドリル",
  math_geometry_graph: "作図・グラフ",
  kanji: "漢字・語句",
  reading_passage: "読解・記述",
  science_social_diagram: "理社の図表",
  integrated_essay: "適性検査・作文",
  standard: "文章題",
};

export const ANSWER_STYLE_LABELS = {
  calc: "計算スペース（2〜3列）",
  geometry: "方眼＋作図余白",
  graph: "方眼",
  kanji: "漢字マス（十字リーダー）",
  lined: "記述罫線",
  diagram: "図表＋理由欄",
  essay: "原稿用紙マス目",
};

const STYLE_BY_TYPE = {
  calc_block: "calc",
  math_geometry_graph: "geometry",
  kanji: "kanji",
  reading_passage: "lined",
  science_social_diagram: "diagram",
  integrated_essay: "essay",
  standard: null,
};

export function chooseAnswerStyle(input) {
  const type = input.problemType ?? input.problem_type;
  if (type && STYLE_BY_TYPE[type]) return STYLE_BY_TYPE[type];

  const topic = `${input.topicTag ?? ""} ${input.unit ?? ""}`;
  const subject = input.subject ?? "";

  if (subject === "japanese" || /漢字|語句|ひらがな|カタカナ|部首/.test(topic)) return "kanji";
  if (/適性検査|作文|資料読み|200字|400字|論述/.test(topic)) return "essay";
  if (/読解|長文|記述/.test(topic)) return "lined";
  if (
    subject === "science" ||
    subject === "social" ||
    subject === "social_studies" ||
    /理科|社会|地図|実験|器具|science|social studies|history|geography/i.test(topic)
  ) {
    return "diagram";
  }
  if (/作図|グラフ書き|展開図|立体|コンパス|切断/.test(topic)) return "geometry";
  if (/計算ドリル|一行計算|九九|かけ算|わり算|繰り上|繰り下|筆算/.test(topic)) return "calc";
  if (
    subject === "math" ||
    /算|数|図形|分数|小数|つるかめ|速さ|割合|面積|体積|角度|繰り/.test(topic)
  ) {
    return "graph";
  }
  return "lined";
}

export function problemsPerPage(styles) {
  if (styles.some((style) => style === "essay")) return 1;
  if (styles.some((style) => style === "geometry" || style === "diagram" || style === "lined")) return 2;
  if (styles.some((style) => style === "kanji" || style === "graph")) return 2;
  if (styles.every((style) => style === "calc")) return 3;
  return styles.length >= 4 ? 4 : 3;
}

export function styleToGridType(style) {
  if (style === "kanji" || style === "essay") return "squared";
  if (style === "graph" || style === "geometry") return "graph";
  if (style === "lined" || style === "diagram") return "lined";
  return "blank";
}
