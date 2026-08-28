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
 */
export function shrinkCropExcludingAnswer(crop, answer) {
  if (!isNormalizedBox(crop)) return crop;
  if (!isNormalizedBox(answer)) return crop;
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
  const ymin = Math.min(nums[0], nums[2]) / 1000;
  const xmin = Math.min(nums[1], nums[3]) / 1000;
  const ymax = Math.max(nums[0], nums[2]) / 1000;
  const xmax = Math.max(nums[1], nums[3]) / 1000;
  if (!(ymax > ymin) || !(xmax > xmin)) return null;
  let originX = Math.floor(xmin * imgW);
  let originY = Math.floor(ymin * imgH);
  originX = clamp(originX, 0, imgW - 1);
  originY = clamp(originY, 0, imgH - 1);
  const width = Math.max(8, Math.min(Math.ceil((xmax - xmin) * imgW), imgW - originX));
  const height = Math.max(8, Math.min(Math.ceil((ymax - ymin) * imgH), imgH - originY));
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

/** 図 crop から解答欄を除いた切り抜き範囲と、残った重なりの白マスク（crop 内 0〜1） */
export function figureAnswerMasks(cropGemini, bboxGemini) {
  const crop = asGeminiBox(cropGemini);
  if (!crop) return { crop: null, masks: [] };
  const answer = asGeminiBox(bboxGemini);
  const used = answer ? shrinkCropExcludingAnswer(crop, answer) : crop;
  const rel = answer ? relativeBoxInParent(used, answer) : null;
  const masks = rel ? [padNormalizedBox(rel, 0.06)] : [];
  return { crop: used, masks };
}

