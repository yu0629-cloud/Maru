import { usableGeminiBox } from "./bbox.mjs";

export { coerceGeminiBox, usableGeminiBox } from "./bbox.mjs";

export const VISUAL_TYPES = ["text_only", "has_figure", "passage_based"];

export function isVisualType(value) {
  return value === "text_only" || value === "has_figure" || value === "passage_based";
}

function hasFigureBox(input = {}) {
  return Boolean(
    usableGeminiBox(input.parentFigureBox ?? input.parent_figure_box) ||
      usableGeminiBox(input.subFigureBox ?? input.sub_figure_box),
  );
}

export function inferVisualType(input = {}) {
  const explicit = input.visualType ?? input.visual_type;
  if (hasFigureBox(input) && explicit !== "passage_based") return "has_figure";
  if (isVisualType(explicit)) return explicit;
  const type = String(input.problemType ?? input.problem_type ?? "");
  if (type === "reading_passage" || type === "integrated_essay") return "passage_based";
  if (type === "math_geometry_graph" || type === "science_social_diagram") return "has_figure";
  const hay = `${input.topicTag ?? input.topic_tag ?? input.topic ?? input.unit ?? ""} ${input.questionText ?? input.question_text ?? input.prompt ?? ""} ${input.parentContext ?? input.parent_context ?? input.contextText ?? input.context_text ?? ""} ${input.optionsText ?? input.options_text ?? ""}`;
  if (/長文|読解|本文|passage|dialogue|対話文|会話文|下線部/.test(hay)) return "passage_based";
  if (/作図|グラフ|展開図|立体|時計|イラスト|地図|回路|切断|コンパス|図形|資料|次の表|下の表|表にまと|和にまと|下の図|次の図|右の図/.test(hay)) return "has_figure";
  return "text_only";
}

export function figureImageSrcOf(item) {
  if (inferVisualType(item) !== "has_figure") return "";
  return String(item?.figureImageSrc ?? item?.figure_image_src ?? "").trim();
}

function asDataImageSrc(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:image/svg")) return "";
  if (raw.startsWith("data:image/")) return raw;
  if (/^https?:|^file:|^content:/i.test(raw)) return "";
  if (raw.length > 32 && /^[A-Za-z0-9+/=\s]+$/.test(raw)) {
    return `data:image/jpeg;base64,${raw.replace(/\s+/g, "")}`;
  }
  return "";
}

/** HTML / プレビュー用。file:// は使わず data URI だけ返す */
export function figureDataSrcOf(item) {
  if (inferVisualType(item) !== "has_figure") return "";
  return (
    asDataImageSrc(item?.figureBase64 ?? item?.figure_base64) ||
    asDataImageSrc(item?.figureImageSrc ?? item?.figure_image_src)
  );
}

export function passageTextOf(item) {
  return String(item?.passageText ?? item?.passage_text ?? item?.contextText ?? item?.context_text ?? "").trim();
}

export function parentContextOf(item) {
  return String(
    item?.parentContext ??
      item?.parent_context ??
      item?.contextText ??
      item?.context_text ??
      "",
  ).trim();
}

export function contextTextOf(item) {
  return parentContextOf(item) || String(item?.passageText ?? item?.passage_text ?? "").trim();
}

export function optionsTextOf(item) {
  return String(item?.optionsText ?? item?.options_text ?? "").trim();
}

export function figureCropBoxOf(item) {
  return (
    usableGeminiBox(item?.figureCropBox) ||
    usableGeminiBox(item?.crop_box) ||
    usableGeminiBox(item?.cropBoxGemini) ||
    usableGeminiBox(item?.geminiCropBox)
  );
}

export function subFigureBoxOf(item) {
  return usableGeminiBox(item?.subFigureBox ?? item?.sub_figure_box);
}

export function parentFigureBoxOf(item) {
  const parent = usableGeminiBox(item?.parentFigureBox ?? item?.parent_figure_box);
  if (parent) return parent;
  if (subFigureBoxOf(item)) return null;
  return figureCropBoxOf(item);
}

export function parentFigureSrcOf(item) {
  if (inferVisualType(item) !== "has_figure") return "";
  const parent =
    asDataImageSrc(item?.parentFigureBase64 ?? item?.parent_figure_base64) ||
    asDataImageSrc(item?.parentFigureSrc ?? item?.parent_figure_src);
  if (parent) return parent;
  if (subFigureBoxOf(item) && !parentFigureBoxOf(item)) return "";
  return figureDataSrcOf(item);
}

export function subFigureSrcOf(item) {
  return (
    asDataImageSrc(item?.subFigureBase64 ?? item?.sub_figure_base64) ||
    asDataImageSrc(item?.subFigureSrc ?? item?.sub_figure_src)
  );
}
