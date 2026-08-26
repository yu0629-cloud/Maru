export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function isGeminiBBox(value) {
  if (!Array.isArray(value) || value.length !== 4) return false;
  return value.every((n) => typeof n === "number" && Number.isFinite(n));
}

/** resizeMode=contain の実画像矩形（レターボックス込み） */
export function containedImageRect(layoutW, layoutH, imageW, imageH) {
  if (!(layoutW > 0 && layoutH > 0 && imageW > 0 && imageH > 0)) {
    return { x: 0, y: 0, width: Math.max(0, layoutW || 0), height: Math.max(0, layoutH || 0) };
  }
  const scale = Math.min(layoutW / imageW, layoutH / imageH);
  const width = imageW * scale;
  const height = imageH * scale;
  return {
    x: (layoutW - width) / 2,
    y: (layoutH - height) / 2,
    width,
    height,
  };
}

export function letterboxImageRect(containerW, containerH, imageW, imageH) {
  const rect = containedImageRect(containerW, containerH, imageW, imageH);
  return {
    offsetX: rect.x,
    offsetY: rect.y,
    displayWidth: rect.width,
    displayHeight: rect.height,
  };
}

/** Gemini [ymin,xmin,ymax,xmax] → contain 実描画領域上のピクセル */
export function mapGeminiBBoxToLetterbox(bbox, letterbox) {
  const ymin = Number(bbox[0]);
  const xmin = Number(bbox[1]);
  const ymax = Number(bbox[2]);
  const xmax = Number(bbox[3]);
  const x = letterbox.offsetX + (xmin / 1000) * letterbox.displayWidth;
  const y = letterbox.offsetY + (ymin / 1000) * letterbox.displayHeight;
  const width = ((xmax - xmin) / 1000) * letterbox.displayWidth;
  const height = ((ymax - ymin) / 1000) * letterbox.displayHeight;
  return { x, y, width, height };
}

/** 台形補正済みの用紙全体（0〜1000）をビュー座標へ 1:1 で写す */
export function mapGeminiBBoxToView(bbox, width, height) {
  return mapGeminiBBoxToLetterbox(bbox, {
    offsetX: 0,
    offsetY: 0,
    displayWidth: width,
    displayHeight: height,
  });
}

export function gradeMarkFromMappedBox(box) {
  const r = Math.min(box.width, box.height) * 0.4;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return { cx, cy, r, x: cx - r, y: cy - r, size: r * 2 };
}

export const EQUALS_X_RATIO = 0.72;
export const ANSWER_X_RATIO = 0.82;
export const BLANK_ANSWER_GAP_RATIO = 0.7;
export const MARK_RADIUS = 22;
export const MARK_RADIUS_MIN = 20;
export const MARK_RADIUS_MAX = 25;
/** マーク直径 = 行の高さの 55%（50〜60% の中央） */
export const MARK_ROW_SIZE_RATIO = 0.55;
export const MARK_SIZE_MIN = 8;
export const MARK_SIZE_MAX = 28;
export const MARK_STROKE_WIDTH = 2.25;
export const PHOTO_Y_MAX_RATIO = 0.95;
export const PHOTO_Y_MIN_RATIO = 0.02;
export const PHOTO_X_MARGIN_RATIO = 0.02;

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp(Math.round((sorted.length - 1) * p), 0, sorted.length - 1);
  return sorted[index];
}

export function isBlankStudentAnswer(value) {
  return !String(value ?? "").trim();
}

/** 印刷1行の高さ。手書きで縦に伸びた bbox は行間ピッチと低い分位で抑える */
export function estimatePrintedRowHeight(boxes) {
  const valid = (boxes ?? []).filter((box) => box && box.height > 0);
  if (!valid.length) return 24;
  const heights = valid.map((box) => box.height);
  const compact = percentile(heights, 0.3);
  const byY = [...valid].sort((a, b) => a.y - b.y);
  const gaps = [];
  for (let i = 1; i < byY.length; i += 1) {
    const gap = byY[i].y - byY[i - 1].y;
    if (gap > 4) gaps.push(gap);
  }
  const fromGap = gaps.length ? median(gaps) * 0.62 : compact;
  return clamp(Math.min(compact, fromGap || compact), 14, 48);
}

/** 中心Xのギャップで列クラスタ（2列プリントなど） */
export function clusterOverlayColumns(items, gapRatio = 0.45) {
  const valid = (items ?? []).filter(Boolean);
  if (!valid.length) return [];
  const sorted = [...valid].sort((a, b) => {
    const acx = a.box.x + a.box.width / 2;
    const bcx = b.box.x + b.box.width / 2;
    return acx - bcx;
  });
  const medianW = median(sorted.map((item) => item.box.width)) || 1;
  const gap = medianW * gapRatio;
  const columns = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const prevCx = prev.box.x + prev.box.width / 2;
    const currCx = curr.box.x + curr.box.width / 2;
    if (currCx - prevCx > gap) columns.push([curr]);
    else columns[columns.length - 1].push(curr);
  }
  return columns;
}

function printedWidth(box, typicalW) {
  return Math.min(box.width, typicalW * 1.15);
}

function answerAnchorX(box, typicalW, rowH) {
  const width = printedWidth(box, typicalW);
  const equalsX = box.x + width * EQUALS_X_RATIO;
  const gap = clamp(rowH * BLANK_ANSWER_GAP_RATIO, 16, 28);
  return equalsX + gap;
}

function columnAnswerX(column, typicalW, rowH) {
  return median(column.map((item) => answerAnchorX(item.box, typicalW, rowH)));
}

/** 写真（contain 実描画領域）の枠内か。下部 5% は机側として除外 */
export function isMarkInsidePhoto(cx, cy, letterbox) {
  if (!letterbox || !(letterbox.displayWidth > 0) || !(letterbox.displayHeight > 0)) return false;
  const xNorm = (cx - letterbox.offsetX) / letterbox.displayWidth;
  const yNorm = (cy - letterbox.offsetY) / letterbox.displayHeight;
  if (yNorm > PHOTO_Y_MAX_RATIO || yNorm < PHOTO_Y_MIN_RATIO) return false;
  if (xNorm < PHOTO_X_MARGIN_RATIO || xNorm > 1 - PHOTO_X_MARGIN_RATIO) return false;
  return true;
}

/** マーク中心を写真枠内に収め、円全体がはみ出さないようクランプ */
export function clampMarkToPhoto(mark, letterbox) {
  const r = mark.r;
  const minX = letterbox.offsetX + r;
  const maxX = letterbox.offsetX + letterbox.displayWidth - r;
  const minY = letterbox.offsetY + r;
  const maxY = letterbox.offsetY + letterbox.displayHeight - r;
  const cx = clamp(mark.cx, minX, maxX);
  const cy = clamp(mark.cy, minY, maxY);
  return { ...mark, cx, cy, x: cx - r, y: cy - r, size: r * 2 };
}

/**
 * 解答エリア（等号の右）にコンパクトな〇✕を置く。
 * letterbox を渡すと枠外（机）は null、残りは枠内へクランプ。
 */
export function layoutAlignedGradeMarks(items, letterbox) {
  const result = (items ?? []).map(() => null);
  const indexed = [];
  (items ?? []).forEach((item, index) => {
    const box = item?.box;
    if (!box || !(box.width > 0) || !(box.height > 0)) return;
    if (letterbox && box.y > letterbox.offsetY + letterbox.displayHeight * PHOTO_Y_MAX_RATIO) return;
    indexed.push({ index, box, isBlank: Boolean(item.isBlank) });
  });
  if (!indexed.length) return result;

  for (const column of clusterOverlayColumns(indexed)) {
    const boxes = column.map((item) => item.box);
    const rowH = estimatePrintedRowHeight(boxes);
    const typicalW = percentile(boxes.map((box) => box.width), 0.4) || rowH * 4;
    const answerX = columnAnswerX(column, typicalW, rowH);
    for (const item of column) {
      const height = Math.min(item.box.height, rowH);
      const size = clamp(height * MARK_ROW_SIZE_RATIO, MARK_SIZE_MIN, MARK_SIZE_MAX);
      const r = size / 2;
      const cy = item.box.y + height / 2;
      const cx = answerX;
      if (letterbox && !isMarkInsidePhoto(cx, cy, letterbox)) continue;
      const mark = { cx, cy, r, x: cx - r, y: cy - r, size };
      result[item.index] = letterbox ? clampMarkToPhoto(mark, letterbox) : mark;
    }
  }
  return result;
}

export function isInsideLetterbox(x, y, letterbox) {
  return (
    x >= letterbox.offsetX &&
    y >= letterbox.offsetY &&
    x <= letterbox.offsetX + letterbox.displayWidth &&
    y <= letterbox.offsetY + letterbox.displayHeight
  );
}

export function geminiBBoxToDisplayRect(bbox, imageRect) {
  const ymin = clamp(Number(bbox[0]), 0, 1000);
  const xmin = clamp(Number(bbox[1]), 0, 1000);
  const ymax = clamp(Number(bbox[2]), 0, 1000);
  const xmax = clamp(Number(bbox[3]), 0, 1000);
  const top = Math.min(ymin, ymax);
  const left = Math.min(xmin, xmax);
  const bottom = Math.max(ymin, ymax);
  const right = Math.max(xmin, xmax);
  return {
    x: imageRect.x + (left / 1000) * imageRect.width,
    y: imageRect.y + (top / 1000) * imageRect.height,
    width: ((right - left) / 1000) * imageRect.width,
    height: ((bottom - top) / 1000) * imageRect.height,
  };
}

/** 解答欄の中央に、記入を覆わない小さめの〇✕を置く */
export function gradeMarkLayout(box, options = {}) {
  const min = options.min ?? 16;
  const max = options.max ?? 26;
  const size = Math.round(clamp(Math.min(box.width, box.height) * 0.28, min, max));
  return {
    x: box.x + (box.width - size) / 2,
    y: box.y + (box.height - size) / 2,
    size,
  };
}

export const FIT_PADDING_RATIO = 0.05;
export const FIT_VIEW_INSET_RATIO = 0.1;

export function bboxIntersects(a, b) {
  if (!isGeminiBBox(a) || !isGeminiBBox(b)) return false;
  const aTop = Math.min(a[0], a[2]);
  const aLeft = Math.min(a[1], a[3]);
  const aBottom = Math.max(a[0], a[2]);
  const aRight = Math.max(a[1], a[3]);
  const bTop = Math.min(b[0], b[2]);
  const bLeft = Math.min(b[1], b[3]);
  const bBottom = Math.max(b[0], b[2]);
  const bRight = Math.max(b[1], b[3]);
  return aLeft < bRight && aRight > bLeft && aTop < bBottom && aBottom > bTop;
}

export function isDisplayRectVisible(rect, view, slop = 2) {
  if (!rect || !view) return false;
  return (
    rect.x + rect.width >= -slop &&
    rect.y + rect.height >= -slop &&
    rect.x <= view.width + slop &&
    rect.y <= view.height + slop
  );
}

export function isPlausibleGeminiBBox(box) {
  if (!isGeminiBBox(box)) return false;
  const height = Math.abs(box[2] - box[0]);
  const width = Math.abs(box[3] - box[1]);
  return width >= 12 && height >= 12 && width * height >= 400;
}

/** 机の写り込みなど、本体クラスタから大きく外れた bbox を除く */
export function filterOverlayBBoxes(bboxes) {
  const valid = (bboxes ?? []).filter(isPlausibleGeminiBBox);
  if (valid.length <= 1) return valid;
  return valid.filter((box, index) => {
    const others = valid.filter((_, otherIndex) => otherIndex !== index);
    const rest = unionGeminiBBox(others, 0);
    if (!rest) return true;
    const relaxed = [rest[0] - 80, rest[1] - 80, rest[2] + 80, rest[3] + 80];
    return bboxIntersects(box, relaxed);
  });
}

/** 全問 bbox の外接矩形。各辺に paddingRatio（既定 5%）を足して 0〜1000 に収める */
export function unionGeminiBBox(bboxes, paddingRatio = FIT_PADDING_RATIO) {
  const valid = (bboxes ?? []).filter(isGeminiBBox);
  if (valid.length === 0) return null;
  let ymin = 1000;
  let xmin = 1000;
  let ymax = 0;
  let xmax = 0;
  for (const box of valid) {
    const top = Math.min(box[0], box[2]);
    const left = Math.min(box[1], box[3]);
    const bottom = Math.max(box[0], box[2]);
    const right = Math.max(box[1], box[3]);
    ymin = Math.min(ymin, top);
    xmin = Math.min(xmin, left);
    ymax = Math.max(ymax, bottom);
    xmax = Math.max(xmax, right);
  }
  if (ymax <= ymin || xmax <= xmin) return null;
  const padY = (ymax - ymin) * paddingRatio;
  const padX = (xmax - xmin) * paddingRatio;
  return [
    clamp(ymin - padY, 0, 1000),
    clamp(xmin - padX, 0, 1000),
    clamp(ymax + padY, 0, 1000),
    clamp(xmax + padX, 0, 1000),
  ];
}

/**
 * 問題領域がビューポートいっぱいに収まる transform。
 * origin は top left。配列順 [{ scale }, { translateX }, { translateY }]
 * （点には先に translate、そのあと scale がかかる CSS 順）。
 */
export function problemAreaFitTransform(cropBBox, layoutW, layoutH, letterbox) {
  if (!cropBBox || !isGeminiBBox(cropBBox) || !(layoutW > 0) || !(layoutH > 0) || !letterbox) {
    return { scale: 1, translateX: 0, translateY: 0 };
  }
  const rect = mapGeminiBBoxToLetterbox(cropBBox, letterbox);
  if (!(rect.width > 1 && rect.height > 1)) {
    return { scale: 1, translateX: 0, translateY: 0 };
  }
  const scale = Math.min(layoutW / rect.width, layoutH / rect.height);
  if (!(scale > 0) || !Number.isFinite(scale)) {
    return { scale: 1, translateX: 0, translateY: 0 };
  }
  return {
    scale,
    translateX: (layoutW / scale - rect.width) / 2 - rect.x,
    translateY: (layoutH / scale - rect.height) / 2 - rect.y,
  };
}

/**
 * crop（Gemini bbox）が layout にちょうど収まるよう、元画像全体の描画矩形を返す。
 * 縦横は必ず同じ倍率（uniform scale）。机の余白は親の overflow:hidden で切る。
 */
export function fittedImageRect(cropBBox, layoutW, layoutH, imageW, imageH, insetRatio = FIT_VIEW_INSET_RATIO) {
  if (!cropBBox || !isGeminiBBox(cropBBox) || !(imageW > 0 && imageH > 0)) {
    return containedImageRect(layoutW, layoutH, imageW, imageH);
  }
  const ymin = Math.min(cropBBox[0], cropBBox[2]);
  const xmin = Math.min(cropBBox[1], cropBBox[3]);
  const ymax = Math.max(cropBBox[0], cropBBox[2]);
  const xmax = Math.max(cropBBox[1], cropBBox[3]);
  const cropW = ((xmax - xmin) / 1000) * imageW;
  const cropH = ((ymax - ymin) / 1000) * imageH;
  if (!(cropW > 0 && cropH > 0)) {
    return containedImageRect(layoutW, layoutH, imageW, imageH);
  }
  const insetX = Math.max(0, layoutW * insetRatio);
  const insetY = Math.max(0, layoutH * insetRatio);
  const innerW = Math.max(1, layoutW - 2 * insetX);
  const innerH = Math.max(1, layoutH - 2 * insetY);
  const scale = Math.min(innerW / cropW, innerH / cropH);
  const fittedW = cropW * scale;
  const fittedH = cropH * scale;
  const originX = insetX + (innerW - fittedW) / 2;
  const originY = insetY + (innerH - fittedH) / 2;
  return {
    x: originX - (xmin / 1000) * imageW * scale,
    y: originY - (ymin / 1000) * imageH * scale,
    width: imageW * scale,
    height: imageH * scale,
  };
}

export function cropAspectRatio(bbox, fallback = 210 / 297) {
  if (!bbox || !isGeminiBBox(bbox)) return fallback;
  const width = Math.abs(bbox[3] - bbox[1]);
  const height = Math.abs(bbox[2] - bbox[0]);
  if (!(width > 0 && height > 0)) return fallback;
  return clamp(width / height, 0.55, 1.45);
}

/** 写真の向きと枠の向きが逆転しないようにする（横倒し防止） */
export function alignedFrameAspect(cropBBox, imageW, imageH, fallback = 210 / 297) {
  const photoAspect = imageW > 0 && imageH > 0 ? imageW / imageH : fallback;
  const cropAspect = cropAspectRatio(cropBBox, photoAspect);
  const photoPortrait = photoAspect <= 1;
  const cropPortrait = cropAspect <= 1;
  if (photoPortrait !== cropPortrait) return photoAspect;
  return cropAspect;
}

/** EXIF orientation 5–8 は 90° 系なので幅と高さを入れ替える */
export function sizeAfterExifOrientation(width, height, orientation) {
  if (orientation === 5 || orientation === 6 || orientation === 7 || orientation === 8) {
    return { width: height, height: width };
  }
  return { width, height };
}
