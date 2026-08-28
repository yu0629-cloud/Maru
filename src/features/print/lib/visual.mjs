import { coerceGeminiBox } from "./bbox.mjs";

export { coerceGeminiBox } from "./bbox.mjs";

export const VISUAL_TYPES = ["text_only", "has_figure", "passage_based"];

export function isVisualType(value) {
  return value === "text_only" || value === "has_figure" || value === "passage_based";
}

export function inferVisualType(input = {}) {
  const explicit = input.visualType ?? input.visual_type;
  if (isVisualType(explicit)) return explicit;
  const type = String(input.problemType ?? input.problem_type ?? "");
  if (type === "reading_passage" || type === "integrated_essay") return "passage_based";
  if (type === "math_geometry_graph" || type === "science_social_diagram") return "has_figure";
  const hay = `${input.topicTag ?? input.topic_tag ?? input.topic ?? input.unit ?? ""} ${input.questionText ?? input.question_text ?? input.prompt ?? ""}`;
  if (/長文|読解|本文|passage|dialogue|対話文/.test(hay)) return "passage_based";
  if (/作図|グラフ|展開図|立体|時計|イラスト|地図|回路|切断|コンパス|図形/.test(hay)) return "has_figure";
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
  return String(item?.passageText ?? item?.passage_text ?? "").trim();
}

export function figureCropBoxOf(item) {
  return (
    coerceGeminiBox(item?.figureCropBox) ||
    coerceGeminiBox(item?.crop_box) ||
    coerceGeminiBox(item?.cropBoxGemini) ||
    coerceGeminiBox(item?.geminiCropBox)
  );
}
