/** @typedef {{ x: number, y: number, width: number, height: number }} NormalizedBox */

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/**
 * Gemini / Postgres JSONB の crop_box を [ymin, xmin, ymax, xmax] に揃える。
 * 配列・JSON 文字列・数値キーオブジェクトを受け付ける。
 */
export function coerceGeminiBox(value) {
  if (value == null) return null;
  let raw = value;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      raw = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (Array.isArray(raw) && raw.length >= 4) {
    const nums = [Number(raw[0]), Number(raw[1]), Number(raw[2]), Number(raw[3])];
    if (nums.some((n) => !Number.isFinite(n))) return null;
    return nums;
  }
  if (raw && typeof raw === "object") {
    if (raw.ymin != null || raw.xmin != null) {
      const nums = [Number(raw.ymin), Number(raw.xmin), Number(raw.ymax), Number(raw.xmax)];
      if (nums.every((n) => Number.isFinite(n))) return nums;
    }
    const nums = [Number(raw[0]), Number(raw[1]), Number(raw[2]), Number(raw[3])];
    if (nums.every((n) => Number.isFinite(n))) return nums;
  }
  return null;
}

/** 面積のない [0,0,0,0] などは切り抜き対象にしない
 * @returns {[number, number, number, number] | null}
 */
export function usableGeminiBox(value) {
  const nums = coerceGeminiBox(value);
  if (!nums) return null;
  const ymin = Math.min(nums[0], nums[2]);
  const xmin = Math.min(nums[1], nums[3]);
  const ymax = Math.max(nums[0], nums[2]);
  const xmax = Math.max(nums[1], nums[3]);
  if (!(ymax > ymin) || !(xmax > xmin)) return null;
  return [ymin, xmin, ymax, xmax];
}

/**
 * 親図は左右ラベル・上部注釈が切れないよう余白を取る。
 * 下端は記号（ア〜エ・すき間）まで含めつつ、小問「(1)」行を巻き込みすぎないよう抑える。
 * 表は見出し〜最終行が入るよう上下左右を少し広げる。
 */
export const FIGURE_PAD = 0.05;
export const FIGURE_SIDE_PAD = 0.08;
/** 親図の右端。てこは Gemini がおもりで切り、空のうでの目盛を落とす */
export const FIGURE_PARENT_RIGHT_PAD = 0.16;
export const FIGURE_PARENT_RIGHT_MIN = 88;
export const FIGURE_PARENT_XMAX = 992;
export const FIGURE_TOP_PAD = 0.05;
/**
 * 親図下端。てこ手順注釈（❶❷❸）が切れないよう文字帯まで広げる。
 * 直下の小問行は clipFigureBottomBeforeBelow で止める。
 */
export const FIGURE_BOTTOM_PAD = 0.08;
/** 図下の手順注釈・記号帯を確保する正規化余白（0–1000） */
export const FIGURE_CAPTION_ROOM = 42;
/** 小問本文帯。answer bbox は解答欄なので、その上の設問全文を見積もって余白を取る */
export const FIGURE_STEM_CLEARANCE = 96;
/** ページ上部の親図が (1) 本文へ食い込まない上限 */
export const PARENT_FIGURE_YMAX = 510;

export function looksLikeTopParentFigure(box) {
  const n = usableGeminiBox(box);
  if (!n) return false;
  return n[0] <= 240 && n[2] - n[0] >= 90;
}

/** 図・表の切り抜きを広げる。親図は注釈・左右端優先、表は行全体が入るよう厚め
 * @returns {[number, number, number, number] | null}
 */
export function expandFigureGeminiBox(box, pad = FIGURE_PAD, options = {}) {
  const nums = usableGeminiBox(box);
  if (!nums) return null;
  const ymin = nums[0];
  const xmin = nums[1];
  const ymax = nums[2];
  const xmax = nums[3];
  const h = Math.max(1, ymax - ymin);
  const w = Math.max(1, xmax - xmin);
  // ページ下半分の箱、または明示的な表指定
  const lowerTable =
    options.asTable === true || ymin >= 520 || (ymin >= 450 && h <= 380);
  const topFigure = !lowerTable && ymin <= 240;
  const sidePad = lowerTable ? 0.04 : FIGURE_SIDE_PAD;
  const topPad = lowerTable ? 0 : FIGURE_TOP_PAD;
  const bottomPad = lowerTable ? 0.04 : topFigure ? 0.04 : FIGURE_BOTTOM_PAD;
  const dyTop = lowerTable ? 0 : Math.max(h * topPad, 18);
  const dyBottom = Math.max(
    h * bottomPad,
    lowerTable ? 20 : topFigure ? 18 : FIGURE_CAPTION_ROOM,
  );
  const dxLeft = Math.max(w * sidePad, lowerTable ? 16 : 24);
  const dxRight = lowerTable
    ? Math.max(w * 0.04, 16)
    : Math.max(w * (topFigure ? FIGURE_PARENT_RIGHT_PAD : FIGURE_SIDE_PAD), topFigure ? FIGURE_PARENT_RIGHT_MIN : 28);
  const xmaxCap = lowerTable ? 970 : topFigure ? FIGURE_PARENT_XMAX : 982;
  let nextYmax = clamp(ymax + dyBottom, 0, 1000);
  if (topFigure) {
    // Gemini が (1) 本文まで箱に入れても、親図は手順注釈までで止める
    nextYmax = Math.min(nextYmax, ymax > 520 ? 490 : PARENT_FIGURE_YMAX);
  }
  // 紙の外（机・余白）まで広げない。親図の右だけ目盛が残るよう厚くする
  const nextYmin = clamp(Math.max(ymin - dyTop, lowerTable ? ymin : 8), 0, 1000);
  const nextXmin = clamp(Math.max(xmin - dxLeft, 18), 0, 1000);
  const nextXmax = clamp(Math.min(xmax + dxRight, xmaxCap), 0, 1000);
  const next = [nextYmin, nextXmin, nextYmax, nextXmax];
  if (!(next[2] > next[0]) || !(next[3] > next[1])) return nums;
  return next;
}

/**
 * 拡張後の ymax を、直下の小問／解答行の上端直前で止める。
 * 図下の記号・手順注釈（❶❷❸）は残し、「(1) …」設問本文は含めない。
 * answer bbox は解答欄なので、図〜解答のあいだの設問帯ごと落とす。
 * @returns {[number, number, number, number] | null}
 */
export function clipFigureBottomBeforeBelow(expanded, original, belowBox, gap = 12) {
  const exp = usableGeminiBox(expanded);
  const orig = usableGeminiBox(original);
  const below = usableGeminiBox(belowBox);
  if (!exp) return null;
  const topFigure = looksLikeTopParentFigure(orig ?? exp);
  const geminiAteStem = Boolean(orig && (orig[2] > 520 || orig[2] - orig[0] > 430));
  const hardCap = topFigure ? (geminiAteStem ? 490 : PARENT_FIGURE_YMAX) : null;

  let stop = exp[2];
  if (orig && below) {
    const origH = Math.max(1, orig[2] - orig[0]);
    const belowTop = Math.min(below[0], below[2]);
    if (belowTop >= orig[0] + origH * 0.28 && belowTop <= orig[2] + 240) {
      const captionEnd = Math.min(orig[2] + FIGURE_CAPTION_ROOM, PARENT_FIGURE_YMAX);
      const gapBelowFigure = belowTop - orig[2];
      if (gapBelowFigure > FIGURE_CAPTION_ROOM + 16) {
        stop = Math.min(stop, captionEnd, belowTop - gap);
      } else {
        stop = Math.min(stop, belowTop - gap - FIGURE_STEM_CLEARANCE);
      }
    } else if (belowTop > orig[2] + 240 && topFigure) {
      stop = Math.min(stop, orig[2] + FIGURE_CAPTION_ROOM, PARENT_FIGURE_YMAX);
    }
  } else if (topFigure && hardCap != null) {
    stop = Math.min(stop, hardCap);
  }
  if (hardCap != null) stop = Math.min(stop, hardCap);

  const origH = orig ? Math.max(1, orig[2] - orig[0]) : 160;
  const minH = geminiAteStem ? Math.max(90, Math.min(origH * 0.35, 220)) : Math.max(100, origH * 0.4);
  const minYmax = exp[0] + minH;
  if (stop > minYmax && stop < exp[2]) {
    return [exp[0], exp[1], clamp(stop, 0, 1000), exp[3]];
  }
  if (hardCap != null && exp[2] > hardCap && hardCap > exp[0] + 80) {
    return [exp[0], exp[1], clamp(hardCap, 0, 1000), exp[3]];
  }
  return exp;
}

/**
 * 親図が子図（表）に実際に食い込むときだけ ymax を止める。
 * クリップで親図が潰れる場合は切らない（図が消えるのを防ぐ）。
 * @returns {[number, number, number, number] | null}
 */
export function prepareParentFigureBox(parent, sub, gap = 8) {
  const p = usableGeminiBox(parent);
  if (!p) return null;
  const s = usableGeminiBox(sub);
  if (!s) return p;
  if (s[0] >= p[2] + 36) return p;
  const origH = Math.max(1, p[2] - p[0]);
  const expandBottom = Math.max(origH * FIGURE_BOTTOM_PAD, FIGURE_CAPTION_ROOM);
  const limit = s[0] - gap - expandBottom;
  if (!(p[2] > limit)) return p;
  const minH = Math.max(140, origH * 0.6);
  if (limit < p[0] + minH) return p;
  const ymax = Math.max(p[0] + minH, limit);
  if (!(ymax > p[0])) return p;
  return [p[0], p[1], ymax, p[3]];
}

export function isNormalizedBox(value) {
  if (!value || typeof value !== "object") return false;
  return ["x", "y", "width", "height"].every(
    (key) => typeof value[key] === "number" && Number.isFinite(value[key]),
  );
}

export function geminiBBoxToNormalizedBox(bbox) {
  const nums = coerceGeminiBox(bbox);
  if (!nums) {
    throw new Error("INVALID_GEMINI_BBOX");
  }
  const ymin = clamp(nums[0], 0, 1000);
  const xmin = clamp(nums[1], 0, 1000);
  const ymax = clamp(nums[2], 0, 1000);
  const xmax = clamp(nums[3], 0, 1000);
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

/** 計算ドリルの1行（解答欄が細い帯）か */
export function isAnswerOnlyCrop(box) {
  return box.height < 0.14 && box.width < 0.62;
}

export function expandPrintCropBox(box) {
  const rowLike = box.height < 0.14;
  let x = box.x;
  let y = box.y;
  let width = box.width;
  let height = box.height;
  if (rowLike) {
    const minH = 0.12;
    if (height < minH) {
      const extra = minH - height;
      y = clamp(y - extra * 0.3, 0, 1);
      height = Math.min(1 - y, minH);
    }
    const mid = box.x + box.width / 2;
    if (width < 0.45) {
      if (mid < 0.5) {
        x = 0.03;
        width = 0.46;
      } else {
        x = 0.51;
        width = 0.46;
      }
    } else {
      x = clamp(x - 0.02, 0, 1);
      width = Math.min(1 - x, width + 0.04);
    }
  }
  return { x, y, width, height };
}

/** 行の右（等号の右＝手書き解答）だけ白くする。問題文は左に残す */
export function answerMaskBox(original, expanded = original) {
  if (!isAnswerOnlyCrop(original)) {
    return { x: 0, y: 0.48, width: 1, height: 0.52, kind: "bottom" };
  }
  return { x: 0.62, y: 0, width: 0.38, height: 1, kind: "right" };
}

export function intersectNormalized(a, b) {
  if (!isNormalizedBox(a) || !isNormalizedBox(b)) return null;
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** child を parent 内の 0〜1 座標にする。重なりがなければ null */
export function relativeBoxInParent(parent, child) {
  const hit = intersectNormalized(parent, child);
  if (!hit || parent.width <= 0 || parent.height <= 0) return null;
  return {
    x: (hit.x - parent.x) / parent.width,
    y: (hit.y - parent.y) / parent.height,
    width: hit.width / parent.width,
    height: hit.height / parent.height,
  };
}

export function padNormalizedBox(box, pad = 0.04) {
  const x = clamp(box.x - pad, 0, 1);
  const y = clamp(box.y - pad, 0, 1);
  return {
    x,
    y,
    width: clamp(box.width + pad * 2, 0, 1 - x),
    height: clamp(box.height + pad * 2, 0, 1 - y),
  };
}

/**
 * 図の crop から解答欄 bbox を端に沿って除外する。
 * 中央に重なって残面積が足りないときは元の crop を返す（白マスク側で隠す）。
 * 大問図など広い矩形（preserveExtent）では切り落としせず、必ず元の crop を返す。
 */
export function shrinkCropExcludingAnswer(crop, answer, options = {}) {
  if (!isNormalizedBox(crop)) return crop;
  if (!isNormalizedBox(answer)) return crop;
  if (options.preserveExtent === true) return crop;
  // 大問図・横並び実験図など広い領域は端を削るとラベルが落ちるのでシュリンクしない
  if (crop.width >= 0.55 && crop.height >= 0.22) return crop;
  const hit = intersectNormalized(crop, answer);
  if (!hit) return crop;
  const spanX = hit.width / crop.width;
  const spanY = hit.height / crop.height;
  let { x, y, width, height } = crop;
  if (spanX <= spanY && spanX < 0.55) {
    if (hit.x + hit.width / 2 >= crop.x + crop.width / 2) {
      width = Math.max(0.08, hit.x - crop.x - 0.008);
    } else {
      const nextX = hit.x + hit.width + 0.008;
      width = Math.max(0.08, crop.x + crop.width - nextX);
      x = nextX;
    }
  } else if (spanY < 0.55) {
    if (hit.y + hit.height / 2 >= crop.y + crop.height / 2) {
      height = Math.max(0.08, hit.y - crop.y - 0.008);
    } else {
      const nextY = hit.y + hit.height + 0.008;
      height = Math.max(0.08, crop.y + crop.height - nextY);
      y = nextY;
    }
  } else {
    return crop;
  }
  if (width * height < crop.width * crop.height * 0.32) return crop;
  return {
    x: clamp(x, 0, 1),
    y: clamp(y, 0, 1),
    width: clamp(width, 0.04, 1),
    height: clamp(height, 0.04, 1),
  };
}

export function normalizedBoxToGemini(box) {
  return [
    Math.round(box.y * 1000),
    Math.round(box.x * 1000),
    Math.round((box.y + box.height) * 1000),
    Math.round((box.x + box.width) * 1000),
  ];
}

/**
 * 0〜1000 の Gemini 座標を、画像ピクセルの crop 矩形（整数）に変換する。
 */
export function geminiBoxToPixelCrop(box, imageWidth, imageHeight) {
  const nums = coerceGeminiBox(box);
  if (!nums) return null;
  const imgW = Math.max(0, Math.round(Number(imageWidth) || 0));
  const imgH = Math.max(0, Math.round(Number(imageHeight) || 0));
  if (imgW < 8 || imgH < 8) return null;
  // Gemini crop_box は 0〜1000。実ファイル解像度へ写す（表示サイズは使わない）
  const ymin = Math.min(nums[0], nums[2]);
  const xmin = Math.min(nums[1], nums[3]);
  const ymax = Math.max(nums[0], nums[2]);
  const xmax = Math.max(nums[1], nums[3]);
  if (!(ymax > ymin) || !(xmax > xmin)) return null;
  let originX = Math.round((xmin / 1000) * imgW);
  let originY = Math.round((ymin / 1000) * imgH);
  originX = clamp(originX, 0, imgW - 1);
  originY = clamp(originY, 0, imgH - 1);
  const width = Math.max(8, Math.min(Math.round(((xmax - xmin) / 1000) * imgW), imgW - originX));
  const height = Math.max(8, Math.min(Math.round(((ymax - ymin) / 1000) * imgH), imgH - originY));
  if (width < 8 || height < 8) return null;
  return { originX, originY, width, height };
}

function asGeminiBox(value) {
  const nums = coerceGeminiBox(value);
  if (!nums) return null;
  try {
    return geminiBBoxToNormalizedBox(nums);
  } catch {
    return null;
  }
}

/** 図 crop から解答欄を除いた切り抜き範囲と、残った重なりの白マスク（crop 内 0〜1）
 * options.preserveExtent=true のとき crop は削らず、解答は白マスクのみで隠す（大問図向け）
 */
export function figureAnswerMasks(cropGemini, bboxGemini, options = {}) {
  const crop = asGeminiBox(cropGemini);
  if (!crop) return { crop: null, masks: [] };
  const answer = asGeminiBox(bboxGemini);
  const preserveExtent = options.preserveExtent === true;
  const used =
    answer && !preserveExtent ? shrinkCropExcludingAnswer(crop, answer, options) : crop;
  const rel = answer ? relativeBoxInParent(used, answer) : null;
  const masks = rel ? [padNormalizedBox(rel, 0.06)] : [];
  return { crop: used, masks };
}

/**
 * 印刷・キャッシュ用: Gemini 生座標を expand し、大問図は枠を維持したまま切り抜き矩形を決める。
 * 戻り値の cropGemini は実際の JPEG crop と白マスクの共通基準。
 */
export function planExpandedFigureCrop(cropBox, answerBBox, options = {}) {
  const raw = usableGeminiBox(cropBox);
  if (!raw) return { cropGemini: null, masks: [] };
  const expandOpts = options.asTable ? { asTable: true } : {};
  let expanded = expandFigureGeminiBox(raw, FIGURE_PAD, expandOpts) ?? raw;
  if (options.clipBottomBeforeStem !== false && !options.asTable) {
    expanded =
      clipFigureBottomBeforeBelow(expanded, raw, answerBBox, options.bottomGap ?? 10) ?? expanded;
  }
  const preserveExtent = options.preserveExtent !== false;
  const planned = figureAnswerMasks(expanded, answerBBox ?? null, { preserveExtent });
  const cropGemini = planned.crop ? normalizedBoxToGemini(planned.crop) : expanded;
  return { cropGemini, masks: planned.masks ?? [] };
}

