/** @typedef {{ x: number, y: number, width: number, height: number }} NormalizedBox */
/** @typedef {{ left: number, top: number, width: number, height: number }} PixelBox */

export function isNormalizedBox(value) {
  if (!value || typeof value !== "object") return false;
  return ["x", "y", "width", "height"].every((key) =>
    typeof value[key] === "number" && Number.isFinite(value[key])
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
  if (Array.isArray(input?.geminiBbox)) return geminiBBoxToNormalizedBox(input.geminiBbox);
  throw new Error("CROP_BOX_REQUIRED");
}

export function normalizedBoxToPixels(box, imageWidth, imageHeight) {
  const left = Math.round(box.x * imageWidth);
  const top = Math.round(box.y * imageHeight);
  const width = Math.max(1, Math.round(box.width * imageWidth));
  const height = Math.max(1, Math.round(box.height * imageHeight));
  return {
    left: clamp(left, 0, Math.max(0, imageWidth - 1)),
    top: clamp(top, 0, Math.max(0, imageHeight - 1)),
    width: Math.min(width, imageWidth - left),
    height: Math.min(height, imageHeight - top),
  };
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
