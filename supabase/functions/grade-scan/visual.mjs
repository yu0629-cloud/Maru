export const VISUAL_TYPES = ["text_only", "has_figure", "passage_based"];

export function isVisualType(value) {
  return value === "text_only" || value === "has_figure" || value === "passage_based";
}

export function inferVisualType(input = {}) {
  const explicit = input.visual_type ?? input.visualType;
  if (isVisualType(explicit)) return explicit;
  const type = String(input.problem_type ?? input.problemType ?? "");
  if (type === "reading_passage" || type === "integrated_essay") return "passage_based";
  if (type === "math_geometry_graph" || type === "science_social_diagram") return "has_figure";
  const hay = `${input.topic ?? input.topic_tag ?? input.topicTag ?? ""} ${input.question_text ?? input.questionText ?? ""}`;
  if (/長文|読解|本文|passage|dialogue|対話文/.test(hay)) return "passage_based";
  if (/作図|グラフ|展開図|立体|時計|イラスト|地図|回路|切断|コンパス|図形/.test(hay)) return "has_figure";
  return "text_only";
}
