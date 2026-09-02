export const VISUAL_TYPES = ["text_only", "has_figure", "passage_based"];

export function isVisualType(value) {
  return value === "text_only" || value === "has_figure" || value === "passage_based";
}

function hasUsableBox(value) {
  if (!Array.isArray(value) || value.length < 4) return false;
  const ymin = Math.min(Number(value[0]), Number(value[2]));
  const xmin = Math.min(Number(value[1]), Number(value[3]));
  const ymax = Math.max(Number(value[0]), Number(value[2]));
  const xmax = Math.max(Number(value[1]), Number(value[3]));
  return ymax > ymin && xmax > xmin;
}

export function inferVisualType(input = {}) {
  const explicit = input.visual_type ?? input.visualType;
  const hasFigure =
    hasUsableBox(input.parent_figure_box ?? input.parentFigureBox) ||
    hasUsableBox(input.sub_figure_box ?? input.subFigureBox);
  if (hasFigure && explicit !== "passage_based") return "has_figure";
  if (isVisualType(explicit)) return explicit;
  const type = String(input.problem_type ?? input.problemType ?? "");
  if (type === "reading_passage" || type === "integrated_essay") return "passage_based";
  if (type === "math_geometry_graph" || type === "science_social_diagram") return "has_figure";
  const hay = `${input.topic ?? input.topic_tag ?? input.topicTag ?? ""} ${input.question_text ?? input.questionText ?? ""} ${input.parent_context ?? input.parentContext ?? input.context_text ?? input.contextText ?? ""} ${input.options_text ?? input.optionsText ?? ""}`;
  if (/長文|読解|本文|passage|dialogue|対話文|会話文|下線部/.test(hay)) return "passage_based";
  if (/作図|グラフ|展開図|立体|時計|イラスト|地図|回路|切断|コンパス|図形|資料|次の表|下の表|表にまと|和にまと|下の図|次の図|右の図|すき間|線香|集気びん|ろうそく|[㋐-㋾]|[ア-エウ]の(?:上|下)/.test(hay)) return "has_figure";
  return "text_only";
}
