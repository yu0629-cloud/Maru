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
/** リード文帯の下限。これより下は図のラベル（ふた・㋐・目盛）側 */
export const LEAD_BAND_END = 148;
/** 右カラム差し込みの左端。設問本文列へ食い込ませず、図の左端は残す */
export const RIGHT_INSET_XMIN = 630;
/** 差し込み1枚分の高さ。図の下端は残し、次の小問までは伸ばさない */
export const INSET_MIN_HEIGHT = 188;
/** 右差し込みの幅上限。ページ右の空きまでは広げない。図の右端は詰めない */
export const INSET_MAX_WIDTH = 282;
/** 本文列との境に残る切れ端1列分。ページ端側は触らない */
export const INSET_INNER_GUTTER = 32;

export function looksLikeTopParentFigure(box) {
  const n = usableGeminiBox(box);
  if (!n) return false;
  return n[0] <= 240 && n[2] - n[0] >= 90;
}

/** 設問横の解答欄（低く狭い、または右寄りの枠）。差し込み図の下端クリップに使う */
export function looksLikeAnswerSlot(box) {
  const n = usableGeminiBox(box);
  if (!n) return false;
  const h = n[2] - n[0];
  const w = n[3] - n[1];
  return h <= 160 && (w <= 420 || n[1] >= 480);
}

/** 左カラムの設問本文。差し込み図の左端をこの右端で止める */
export function looksLikeLeftStemColumn(box) {
  const n = usableGeminiBox(box);
  if (!n) return false;
  return n[1] <= 160 && n[3] <= 700 && n[3] - n[1] >= 280;
}

/** 設問文が左〜中央にある（全幅の bbox でも本文列として扱う） */
export function looksLikeTextColumnBesideInset(stem, inset) {
  const n = usableGeminiBox(stem);
  const exp = usableGeminiBox(inset);
  if (!n || !exp) return false;
  if (n[1] > 220 || n[3] - n[1] < 280) return false;
  const overlapY = Math.min(n[2], exp[2]) - Math.max(n[0], exp[0]);
  return overlapY > 40;
}

/** 本文列の右端。全幅箱はページ右まで伸びるので、左〜中央で切る */
export function textColumnRightEdge(stem) {
  const n = usableGeminiBox(stem);
  if (!n) return null;
  if (n[3] > 720) return 652;
  return n[3];
}

/** 右差し込みの左端。本文列の直後から始め、プリントごとに630へ固定しない */
export function rightInsetColumnStart(stem, box) {
  const n = usableGeminiBox(stem);
  if (!n) return RIGHT_INSET_XMIN;
  const probe = usableGeminiBox(box) ?? [300, RIGHT_INSET_XMIN, 520, 980];
  if (!looksLikeTextColumnBesideInset(n, probe) && !looksLikeLeftStemColumn(n)) return RIGHT_INSET_XMIN;
  return clamp((textColumnRightEdge(n) ?? 640) + INSET_INNER_GUTTER, 480, 760);
}

/** 差し込みが設問本文列へ食い込んだら、本文の右端＋切れ端分から始める */
export function clipInsetLeftAfterStem(expanded, stemBox) {
  const exp = usableGeminiBox(expanded);
  const stem = usableGeminiBox(stemBox);
  if (!exp) return null;
  if (!looksLikeTextColumnBesideInset(stem, exp) && !looksLikeLeftStemColumn(stem)) return exp;
  const textRight = textColumnRightEdge(stem) ?? stem[3];
  const after = textRight + INSET_INNER_GUTTER;
  if (after <= exp[1] + 4) return exp;
  if (exp[3] - after < 160) return exp;
  return [exp[0], clamp(after, 0, 1000), exp[2], exp[3]];
}

/**
 * 差し込み図の下端を、直下の設問続き・手書き解答の直前で止める。
 * 図のびん底は残し、印刷文や前回の「( 2 )」は入れない。
 */
export function clipInsetBottomBeforeAnswer(expanded, original, answerBox, gap = 8) {
  const exp = usableGeminiBox(expanded);
  const ans = usableGeminiBox(answerBox);
  if (!exp) return null;
  if (!ans) return exp;
  const overlapX = Math.min(exp[3], ans[3]) - Math.max(exp[1], ans[1]);
  let stop = exp[2];
  if (looksLikeAnswerSlot(ans) && overlapX >= 48 && ans[0] > exp[0] + 140 && ans[0] < exp[2] + 64) {
    stop = Math.min(stop, ans[0] - gap);
  } else if (ans[2] - ans[0] > 180 && overlapX >= 48) {
    const answerBand = ans[2] - 72;
    if (answerBand > exp[0] + 160 && exp[2] > answerBand) {
      stop = Math.min(stop, answerBand - gap);
    }
  }
  if (!(stop > exp[0] + 150) || !(stop < exp[2])) return exp;
  return [exp[0], exp[1], clamp(stop, 0, 1000), exp[3]];
}

/**
 * 差し込みは設問の先頭ブロックの横だけ。
 * 選択肢・「番号を書きましょう」・次の小問は同じカラムに落ちても入れない。
 */
export function clipInsetToStemWindow(expanded, stemBox) {
  const exp = usableGeminiBox(expanded);
  const stem = usableGeminiBox(stemBox);
  if (!exp) return null;
  if (!stem) return exp;
  const beside = looksLikeLeftStemColumn(stem) || looksLikeTextColumnBesideInset(stem, exp) || stem[0] <= exp[0] + 100;
  if (!beside) return exp;
  const stemH = Math.max(1, stem[2] - stem[0]);
  const aligned = stem[0] <= exp[0] + 48;
  const figureSpan = clamp(stemH * 0.7, 188, 220);
  const windowEnd = (aligned ? stem[0] : exp[0]) + figureSpan;
  const stop = Math.max(windowEnd, exp[0] + 176);
  if (!(stop < exp[2]) || !(stop > exp[0] + 150)) return exp;
  return [exp[0], exp[1], clamp(stop, 0, 1000), exp[3]];
}

/** 短い箱を伸ばしたとき、親図の底・本文のはみ出し・直下1行を端から落とす */
export function trimInsetSliverEdges(expanded, original) {
  const exp = usableGeminiBox(expanded);
  const orig = usableGeminiBox(original);
  if (!exp) return null;
  if (!orig || orig[2] - orig[0] >= 140) return exp;
  return trimInsetNeighborEdges(exp, null, { fromSliver: true });
}

function insetPlaceOf(box, options = {}) {
  if (options.place === "left" || options.place === "right") return options.place;
  const n = usableGeminiBox(box);
  return n && n[3] <= 440 && n[1] < 400 ? "left" : "right";
}

/**
 * 差し込みの内側（本文列側）の切れ端だけ落とす。
 * ページ端側・上下は触らない。特定プリントの座標は使わない。
 */
export function trimInsetNeighborEdges(expanded, stem, options = {}) {
  const exp = usableGeminiBox(expanded);
  if (!exp) return null;
  const place = insetPlaceOf(exp, options);
  let ymin = exp[0];
  let xmin = exp[1];
  let ymax = exp[2];
  let xmax = exp[3];
  if (place === "left") {
    // 左の図: 右が本文列。ページ左端は維持
    if (xmax - xmin >= 180) xmax = Math.max(xmax - 10, xmin + 160);
    return [ymin, xmin, ymax, xmax];
  }
  // 右の図: 左が本文列。ページ右端は維持。切れ端は1回だけ落とす
  if (looksLikeTextColumnBesideInset(stem, exp) || looksLikeLeftStemColumn(stem)) {
    const after = (textColumnRightEdge(stem) ?? 640) + INSET_INNER_GUTTER;
    if (xmax - after >= 170) xmin = Math.max(xmin, after);
  } else if (xmax - xmin >= 200 && Math.abs(xmin - RIGHT_INSET_XMIN) <= 8) {
    xmin = Math.min(xmin + INSET_INNER_GUTTER, xmax - 170);
  }
  return [ymin, xmin, ymax, xmax];
}

/**
 * Gemini の細い帯を、設問横の左右カラムで「図1枚分」に直す。
 * 親図へは戻さず、次の小問まで伸ばさない。ページ右の空きまでは広げない。
 */
export function forceInsetColumnBox(box, options = {}) {
  const n = usableGeminiBox(box);
  const place = insetPlaceOf(n, options);
  if (place === "left") {
    if (!n) return [180, 36, 460, 380];
    const ymin = clamp(n[0] - 24, 8, 700);
    const ymax = clamp(Math.max(n[2] + 52, ymin + 200), ymin + 160, 760);
    return [ymin, 36, ymax, 380];
  }
  const floor = Number.isFinite(Number(options.floor)) ? Number(options.floor) : 318;
  const h = n ? n[2] - n[0] : 0;
  const w = n ? n[3] - n[1] : 0;
  const columnStart = rightInsetColumnStart(options.stem, n);
  // すでに図1枚分なら左右を再拡張しない（本文側の切れ端整理を戻さない）
  if (h >= 186 && h <= 230 && w >= 180 && n[1] >= 480) {
    const xmax = clamp(n[3], n[1] + 200, 990);
    return [n[0], n[1], n[2], xmax];
  }
  const sliver = h > 0 && h < 140;
  const onParentEdge = sliver && n[0] <= floor + 16;
  const ymin = sliver
    ? clamp(Math.max(n[0] + (onParentEdge ? 12 : 0), floor + 8), 300, 400)
    : clamp(Math.max(n ? n[0] - 16 : 336, floor), 300, 400);
  const down = sliver ? 120 : 52;
  const ymaxCap = sliver ? ymin + 220 : ymin + 240;
  const ymax = clamp(Math.max(n ? n[2] + down : 0, ymin + INSET_MIN_HEIGHT), ymin + 160, ymaxCap);
  const xmin = columnStart;
  const gemXmax = n ? n[3] : xmin + 280;
  const pageCap = RIGHT_INSET_XMIN + INSET_MAX_WIDTH;
  const xmax = sliver
    ? clamp(
        gemXmax >= 950 ? Math.min(gemXmax, pageCap) : Math.max(gemXmax, xmin + 240),
        xmin + 240,
        960,
      )
    : clamp(
        Math.min(Math.max(gemXmax + 16, xmin + 260), gemXmax >= 950 ? pageCap : 990),
        xmin + 240,
        990,
      );
  return [ymin, xmin, ymax, xmax];
}

export function looksLikeInsetCrop(box, options = {}) {
  if (options.asInset === true) return true;
  const n = usableGeminiBox(box);
  if (!n) return false;
  const w = n[3] - n[1];
  const h = n[2] - n[0];
  if (h < 70 || w < 80 || w > 540) return false;
  return n[1] >= 340 || n[3] <= 440;
}

/**
 * 親図クロップからリード文帯を外す（テキスト判定なし）。
 * 短い箱はリード終端までだけ上げ、図ラベルを残す。
 */
export function raiseCropBelowLead(box) {
  const b = usableGeminiBox(box);
  if (!b) return null;
  if (b[0] >= LEAD_BAND_END) return b;
  const minRemain = 56;
  // 2行リードを図に残さない。短い箱はラベル帯までしか上げない
  const target = b[0] < 100 && b[2] - b[0] >= 220 ? 176 : LEAD_BAND_END;
  const raised = Math.min(target, b[2] - minRemain);
  if (raised > b[0] + 8 && b[2] - raised >= 50) return [raised, b[1], b[2], b[3]];
  return b;
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
  // 表は asTable のときだけ。位置だけで表扱いするとページ下の図の上が欠ける
  const lowerTable = options.asTable === true;
  const inset = looksLikeInsetCrop(nums, options) && !lowerTable;
  const topFigure = !lowerTable && !inset && ymin <= 240;
  const tightInset = inset && (h < 160 || w < 220);
  const sidePad = lowerTable || inset ? 0.04 : FIGURE_SIDE_PAD;
  const topPad = lowerTable || inset ? 0 : FIGURE_TOP_PAD;
  const bottomPad = lowerTable || inset ? 0.04 : topFigure ? 0.04 : FIGURE_BOTTOM_PAD;
  const dyTop = lowerTable
    ? 0
    : inset
      ? tightInset
        ? Math.max(h * 0.4, 72)
        : ymin >= 300
          ? Math.min(Math.max(h * 0.08, 12), 20)
          : Math.max(h * 0.2, 48)
      : topFigure
        ? ymin <= LEAD_BAND_END
          ? 0
          : Math.min(Math.max(0, ymin - LEAD_BAND_END), 12)
        : ymin < LEAD_BAND_END - 4
          ? 0
          : Math.max(h * topPad, 18);
  const dyBottom = Math.max(
    h * bottomPad,
    lowerTable
      ? 20
      : inset
        ? tightInset
          ? Math.max(h * 0.55, 96)
          : Math.max(h * 0.18, 48)
        : FIGURE_CAPTION_ROOM,
  );
  const rightCol = inset && xmin >= 500;
  const leftCol = inset && xmax <= 500;
  const dxLeft = Math.max(
    w * sidePad,
    lowerTable
      ? 12
      : rightCol
        ? Math.max(w * 0.32, xmin - RIGHT_INSET_XMIN, 72)
        : inset
          ? Math.max(w * 0.08, 18)
          : 24,
  );
  const dxRight = lowerTable
    ? Math.max(w * 0.08, 16)
    : rightCol
      ? Math.max(w * 0.2, 56)
      : leftCol
        ? Math.max(w * 0.03, 6)
        : inset
          ? Math.max(w * 0.08, 16)
          : Math.max(w * (topFigure ? FIGURE_PARENT_RIGHT_PAD : FIGURE_SIDE_PAD), topFigure ? FIGURE_PARENT_RIGHT_MIN : 28);
  const xmaxCap = lowerTable ? 970 : rightCol ? FIGURE_PARENT_XMAX : inset ? 970 : topFigure ? FIGURE_PARENT_XMAX : 982;
  let nextYmax = clamp(ymax + dyBottom, 0, 1000);
  if (topFigure) {
    nextYmax = Math.min(nextYmax, ymax > 520 ? 490 : PARENT_FIGURE_YMAX);
    if (ymax <= 350) nextYmax = Math.min(nextYmax, Math.max(ymax + 12, 350), 360);
  }
  const nextYmin = clamp(
    Math.max(ymin - dyTop, lowerTable ? ymin : inset ? Math.max(8, ymin - dyTop) : 8),
    0,
    1000,
  );
  // 横長の親図だけ左ラベル用に余白。右寄せの図は左端へ引っ張らない
  let nextXmin = clamp(
    topFigure && w >= 550
      ? Math.min(Math.max(xmin - dxLeft, 18), 36)
      : rightCol
        ? Math.max(xmin - dxLeft, RIGHT_INSET_XMIN)
        : Math.max(xmin - dxLeft, inset ? 8 : 18),
    0,
    1000,
  );
  let nextXmax = clamp(Math.min(xmax + dxRight, xmaxCap), 0, 1000);
  if (inset && !lowerTable) {
    return forceInsetColumnBox(nums, options);
  }
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
    // 解答欄だけが遠くにある＝あいだに (1) 本文がある。親図を解答まで伸ばさない
    if (
      looksLikeAnswerSlot(below) &&
      topFigure &&
      belowTop - orig[2] > 120 &&
      origH < 280
    ) {
      stop = Math.min(stop, orig[2] + 16, 360);
    } else if (belowTop >= orig[0] + origH * 0.28 && belowTop <= orig[2] + 240) {
      const captionEnd = Math.min(orig[2] + FIGURE_CAPTION_ROOM, PARENT_FIGURE_YMAX);
      const gapBelowFigure = belowTop - orig[2];
      if (gapBelowFigure > FIGURE_CAPTION_ROOM + 16) {
        stop = Math.min(stop, captionEnd, belowTop - gap);
      } else if (origH < 260) {
        // 設問が近いときはねん土分だけ。余白があると (1) 本文まで親図に入る
        const room = Math.max(12, Math.min(FIGURE_CAPTION_ROOM, belowTop - orig[2] - 6));
        stop = Math.min(stop, orig[2] + room, belowTop - gap, PARENT_FIGURE_YMAX);
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
  const overlapX = Math.min(p[3], s[3]) - Math.max(p[1], s[1]);
  // 右／左カラムの差し込みは親の下ではなく横。ねん土まで残す
  if (overlapX < (p[3] - p[1]) * 0.45) return p;
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
  const expandOpts = options.asTable ? { asTable: true } : options.asInset ? { asInset: true } : {};
  let expanded = expandFigureGeminiBox(raw, FIGURE_PAD, expandOpts) ?? raw;
  if (options.asInset) {
    expanded = forceInsetColumnBox(raw, { ...options, stem: answerBBox });
    expanded = clipInsetLeftAfterStem(expanded, answerBBox) ?? expanded;
    const beforeWindow = expanded;
    expanded = clipInsetToStemWindow(expanded, answerBBox) ?? expanded;
    const windowed = expanded[2] < beforeWindow[2] - 4;
    expanded =
      clipInsetBottomBeforeAnswer(expanded, raw, answerBBox, options.bottomGap ?? 8) ?? expanded;
    expanded = trimInsetSliverEdges(expanded, raw) ?? expanded;
    expanded =
      trimInsetNeighborEdges(expanded, answerBBox, {
        place: insetPlaceOf(expanded, options),
        keepBottom: windowed,
      }) ?? expanded;
  } else if (options.clipBottomBeforeStem !== false && !options.asTable) {
    expanded =
      clipFigureBottomBeforeBelow(expanded, raw, answerBBox, options.bottomGap ?? 10) ?? expanded;
  }
  const preserveExtent = options.preserveExtent !== false;
  // 設問本文・リードとの重なりを白マスクすると左上に帯が出る。解答欄だけ隠す
  const maskAnswer =
    options.asInset || options.asTable
      ? null
      : looksLikeAnswerSlot(answerBBox)
        ? answerBBox
        : null;
  const planned = figureAnswerMasks(expanded, maskAnswer ?? null, { preserveExtent });
  const cropGemini = planned.crop ? normalizedBoxToGemini(planned.crop) : expanded;
  return { cropGemini, masks: planned.masks ?? [] };
}

