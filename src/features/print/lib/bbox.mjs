/** @typedef {{ x: number, y: number, width: number, height: number }} NormalizedBox */

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function isNormalizedBox(value) {
  if (!value || typeof value !== "object") return false;
  return ["x", "y", "width", "height"].every(
    (key) => typeof value[key] === "number" && Number.isFinite(value[key]),
  );
}

export function geminiBBoxToNormalizedBox(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    throw new Error("INVALID_GEMINI_BBOX");
  }
  const ymin = clamp(bbox[0], 0, 1000);
  const xmin = clamp(bbox[1], 0, 1000);
  const ymax = clamp(bbox[2], 0, 1000);
  const xmax = clamp(bbox[3], 0, 1000);
  const top = Math.min(ymin, ymax);
  const left = Math.min(xmin, xmax);
  const bottom = Math.max(ymin, ymax);
  const right = Math.max(xmin, xmax);
  if (bottom <= top || right <= left) {
    throw new Error("EMPTY_CROP_BOX");
  }
  return {
    x: left / 1000,
    y: top / 1000,
    width: (right - left) / 1000,
    height: (bottom - top) / 1000,
  };
}

export function resolveCropBox(input) {
  if (isNormalizedBox(input?.cropBox)) return input.cropBox;
  if (isNormalizedBox(input?.boundingBox)) return input.boundingBox;
  if (isNormalizedBox(input?.bounding_box)) return input.bounding_box;
  if (Array.isArray(input?.bbox)) return geminiBBoxToNormalizedBox(input.bbox);
  if (Array.isArray(input?.geminiBbox)) return geminiBBoxToNormalizedBox(input.geminiBbox);
  if (Array.isArray(input?.gemini_bbox)) return geminiBBoxToNormalizedBox(input.gemini_bbox);
  return { x: 0.04, y: 0.04, width: 0.92, height: 0.24 };
}

export function cropAspect(box) {
  return box.width / Math.max(box.height, 0.01);
}
