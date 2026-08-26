import type { GeminiBBox } from "./schema.ts";

export type NormalizedBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PixelBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function isGeminiBBox(value: unknown): value is GeminiBBox {
  if (!Array.isArray(value) || value.length !== 4) return false;
  return value.every((n) => typeof n === "number" && Number.isFinite(n));
}

export function clampNorm(n: number): number {
  return Math.min(1000, Math.max(0, n));
}

export function normalizeGeminiBBox(bbox: GeminiBBox): GeminiBBox {
  const ymin = clampNorm(bbox[0]);
  const xmin = clampNorm(bbox[1]);
  const ymax = clampNorm(bbox[2]);
  const xmax = clampNorm(bbox[3]);
  return [
    Math.min(ymin, ymax),
    Math.min(xmin, xmax),
    Math.max(ymin, ymax),
    Math.max(xmin, xmax),
  ];
}

/** Gemini [ymin,xmin,ymax,xmax]/1000 → DB 用 {x,y,width,height} 0-1 */
export function geminiBBoxToNormalizedBox(bbox: GeminiBBox): NormalizedBox {
  const [ymin, xmin, ymax, xmax] = normalizeGeminiBBox(bbox);
  return {
    x: xmin / 1000,
    y: ymin / 1000,
    width: (xmax - xmin) / 1000,
    height: (ymax - ymin) / 1000,
  };
}

export function normalizedBoxToPixels(
  box: NormalizedBox,
  imageWidth: number,
  imageHeight: number,
): PixelBox {
  const left = Math.round(box.x * imageWidth);
  const top = Math.round(box.y * imageHeight);
  const width = Math.max(1, Math.round(box.width * imageWidth));
  const height = Math.max(1, Math.round(box.height * imageHeight));
  return {
    left: Math.min(Math.max(0, left), Math.max(0, imageWidth - 1)),
    top: Math.min(Math.max(0, top), Math.max(0, imageHeight - 1)),
    width: Math.min(width, imageWidth - left),
    height: Math.min(height, imageHeight - top),
  };
}
