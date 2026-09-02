/**
 * 机の上の写真から用紙の矩形を推定する。
 * 暗い机（JPEGが小さい）と、木目などのテクスチャ机（端のJPEGが大きい）の両方を見る。
 * 特定プリントの座標は使わない。
 */

function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 端の暗い帯を除いたコンテンツ区間。全体が均一ならすでに用紙スキャン。
 * @param {number[]} sizes
 * @returns {{ start: number, end: number } | null} end は排他
 */
export function contentSpanFromSizes(sizes) {
  const nums = (Array.isArray(sizes) ? sizes : []).map((s) => Math.max(0, Number(s) || 0));
  const n = nums.length;
  if (n < 6) return null;
  const maxS = Math.max(...nums);
  const minS = Math.min(...nums);
  if (!(maxS > 0)) return null;
  // 均一＝スキャナー済み。机の余白が無い
  if (maxS - minS < Math.max(80, maxS * 0.22)) return null;
  const thresh = minS + (maxS - minS) * 0.28;
  let start = 0;
  while (start < n && nums[start] < thresh) start += 1;
  let end = n;
  while (end > start && nums[end - 1] < thresh) end -= 1;
  if (end - start < Math.max(3, Math.floor(n * 0.36))) return null;
  return { start, end };
}

/**
 * 端が机のテクスチャ（中央より JPEG が大きい）なら、静かな中央を紙とする。
 * @param {number[]} sizes
 * @returns {{ start: number, end: number } | null}
 */
export function quietCenterSpan(sizes) {
  const nums = (Array.isArray(sizes) ? sizes : []).map((s) => Math.max(0, Number(s) || 0));
  const n = nums.length;
  if (n < 6) return null;
  const mid = nums.slice(Math.floor(n * 0.22), Math.ceil(n * 0.78));
  if (mid.length < 2) return null;
  const midMed = median(mid);
  const maxS = Math.max(...nums);
  if (!(midMed > 0) || !(maxS > midMed * 1.16)) return null;
  const thresh = midMed * 1.2;
  let start = 0;
  while (start < Math.floor(n * 0.38) && nums[start] > thresh) start += 1;
  let end = n;
  while (end > Math.ceil(n * 0.62) && nums[end - 1] > thresh) end -= 1;
  if (end - start < Math.max(3, Math.floor(n * 0.4))) return null;
  if (start === 0 && end === n) return null;
  return { start, end };
}

function pickSpan(ink, quiet, n) {
  if (ink && quiet) {
    const inkTrim = (ink.start + (n - ink.end)) / Math.max(1, n);
    const quietTrim = (quiet.start + (n - quiet.end)) / Math.max(1, n);
    return quietTrim >= inkTrim ? quiet : ink;
  }
  return ink || quiet;
}

/**
 * 縦横の帯サイズから、画像内 0〜1 の用紙クロップを返す。
 * ほぼ全面が紙なら null（切らない）。
 * @param {number[]} rowSizes 上→下
 * @param {number[]} colSizes 左→右
 * @returns {{ x: number, y: number, width: number, height: number } | null}
 */
export function paperCropFromProfiles(rowSizes, colSizes) {
  const rowN = Array.isArray(rowSizes) ? rowSizes.length : 0;
  const colN = Array.isArray(colSizes) ? colSizes.length : 0;
  const row = pickSpan(contentSpanFromSizes(rowSizes), quietCenterSpan(rowSizes), rowN);
  const col = pickSpan(contentSpanFromSizes(colSizes), quietCenterSpan(colSizes), colN);
  if (!row && !col) return null;
  if (rowN < 6 || colN < 6) return null;
  const y0 = row ? row.start / rowN : 0;
  const y1 = row ? row.end / rowN : 1;
  const x0 = col ? col.start / colN : 0;
  const x1 = col ? col.end / colN : 1;
  const padX = 0.02;
  const padY = 0.02;
  const x = Math.max(0, x0 - padX);
  const y = Math.max(0, y0 - padY);
  const width = Math.min(1 - x, x1 - x0 + padX * 2);
  const height = Math.min(1 - y, y1 - y0 + padY * 2);
  if (!(width >= 0.42) || !(height >= 0.42)) return null;
  // ほぼ全面ならスキャナー済みとして触らない
  if (x <= 0.03 && y <= 0.03 && x + width >= 0.97 && y + height >= 0.97) return null;
  const trimmed = 1 - width * height;
  if (trimmed < 0.06) return null;
  return { x, y, width, height };
}

/**
 * 全ページ写真上の Gemini 箱を、用紙クロップ後の 0〜1000 へ写す。
 * @param {unknown} box
 * @param {{ x: number, y: number, width: number, height: number }} paper
 * @returns {[number, number, number, number] | null}
 */
export function remapGeminiBoxToPaper(box, paper) {
  if (!paper || !(paper.width > 0) || !(paper.height > 0)) return null;
  const raw = Array.isArray(box) ? box : null;
  if (!raw || raw.length < 4) return null;
  const nums = [Number(raw[0]), Number(raw[1]), Number(raw[2]), Number(raw[3])];
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const ymin = Math.min(nums[0], nums[2]);
  const xmin = Math.min(nums[1], nums[3]);
  const ymax = Math.max(nums[0], nums[2]);
  const xmax = Math.max(nums[1], nums[3]);
  const px = paper.x * 1000;
  const py = paper.y * 1000;
  const pw = paper.width * 1000;
  const ph = paper.height * 1000;
  const next = [
    ((ymin - py) / ph) * 1000,
    ((xmin - px) / pw) * 1000,
    ((ymax - py) / ph) * 1000,
    ((xmax - px) / pw) * 1000,
  ].map((n) => Math.max(0, Math.min(1000, n)));
  if (!(next[2] > next[0] + 8) || !(next[3] > next[1] + 8)) return null;
  return next;
}
