import { cropAspect, resolveCropBox } from "./bbox.mjs";

export const PAGE_BODY_MM = 248;
export const DEFAULT_ANSWER_MASK = { x: 0, y: 0.45, width: 1, height: 0.55 };

const WIDE_TYPES = new Set([
  "math_geometry_graph",
  "reading_passage",
  "science_social_diagram",
  "integrated_essay",
]);

export function isIncorrectPrintProblem(problem) {
  return problem?.isCorrect !== true && problem?.is_correct !== true;
}

export function layoutKind(problem, cropBox = resolveCropBox(problem)) {
  const type = problem?.problemType ?? problem?.problem_type ?? "";
  if (type === "calc_block" || type === "kanji") return "compact";
  if (WIDE_TYPES.has(type)) return "wide";
  const ar = cropAspect(cropBox);
  if (ar < 1.15 || cropBox.height >= 0.3) return "wide";
  return "compact";
}

export function toClipItems(problems) {
  const items = [];
  for (const problem of problems ?? []) {
    if (!isIncorrectPrintProblem(problem)) continue;
    const cropBox = resolveCropBox(problem);
    const imageSrc =
      problem.blankedImageSrc ||
      problem.croppedImageSrc ||
      problem.imageSrc ||
      problem.originalImageSrc ||
      "";
    items.push({
      id: String(problem.id ?? items.length + 1),
      number: items.length + 1,
      layout: layoutKind(problem, cropBox),
      cropBox,
      imageSrc,
      originalImageSrc: problem.originalImageSrc || "",
      isBlanked: Boolean(problem.isBlanked || problem.blankedImageSrc),
      cropMode: problem.blankedImageSrc || problem.croppedImageSrc || (problem.imageSrc && !problem.originalImageSrc)
        ? "image"
        : problem.originalImageSrc
          ? "css-crop"
          : "facsimile",
      problemType: problem.problemType ?? problem.problem_type,
      label: problem.label ?? "",
    });
  }
  return items;
}

export function packClipRows(items) {
  const rows = [];
  let pending = null;
  for (const item of items) {
    if (item.layout === "wide") {
      if (pending) {
        rows.push([pending]);
        pending = null;
      }
      rows.push([item]);
      continue;
    }
    if (pending) {
      rows.push([pending, item]);
      pending = null;
    } else {
      pending = item;
    }
  }
  if (pending) rows.push([pending]);
  return rows;
}

export function estimateRowHeightMm(row) {
  const colWidth = row.length === 2 ? 88 : 186;
  const cap = row.length === 2 ? 72 : 128;
  const heights = row.map((item) => {
    const ar = cropAspect(item.cropBox);
    return Math.min(cap, Math.max(32, colWidth / ar));
  });
  return Math.max(...heights) + 8;
}

export function paginateClipRows(rows, bodyMm = PAGE_BODY_MM) {
  const pages = [];
  let current = [];
  let used = 0;
  for (const row of rows) {
    const height = estimateRowHeightMm(row);
    if (current.length > 0 && used + height > bodyMm) {
      pages.push(current);
      current = [row];
      used = height;
    } else {
      current.push(row);
      used += height;
    }
  }
  if (current.length) pages.push(current);
  return pages;
}

export function cssCropStyle(box) {
  return {
    imgWidth: `${(1 / Math.max(box.width, 0.01)) * 100}%`,
    imgHeight: `${(1 / Math.max(box.height, 0.01)) * 100}%`,
    imgLeft: `${(-box.x / Math.max(box.width, 0.01)) * 100}%`,
    imgTop: `${(-box.y / Math.max(box.height, 0.01)) * 100}%`,
    aspect: `${Math.max(box.width, 0.01)} / ${Math.max(box.height, 0.01)}`,
  };
}
