/**
 * 手書き・赤ペンが入りやすい領域を白（消去）、印刷本文を黒（残す）。
 * 白 = inpaint, 黒 = keep。
 */

export const DEFAULT_MASK_ZONES = [
  { x: 0, y: 0.45, width: 1, height: 0.55 },
  { x: 0.7, y: 0, width: 0.3, height: 0.18 },
];

export function buildMaskPixels(width, height, options = {}) {
  if (width < 1 || height < 1) {
    throw new Error("INVALID_MASK_SIZE");
  }

  const pixels = new Uint8Array(width * height);
  const zones = options.maskBoxes?.length ? options.maskBoxes : DEFAULT_MASK_ZONES;

  for (const zone of zones) {
    const left = Math.round(clamp01(zone.x) * width);
    const top = Math.round(clamp01(zone.y) * height);
    const right = Math.round(clamp01(zone.x + zone.width) * width);
    const bottom = Math.round(clamp01(zone.y + zone.height) * height);
    for (let y = top; y < bottom; y++) {
      for (let x = left; x < right; x++) {
        pixels[y * width + x] = 255;
      }
    }
  }

  return { width, height, pixels };
}

export function maskCoverage(mask) {
  let white = 0;
  for (const value of mask.pixels) {
    if (value === 255) white += 1;
  }
  return white / mask.pixels.length;
}

function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}
