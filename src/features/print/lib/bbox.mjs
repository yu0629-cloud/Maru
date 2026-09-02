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
 * 親図下端。図の直下の説明（Caption・❶❷❸・各パネル注釈）は図の一部。
 * 直下の小問行は clipFigureBottomBeforeBelow で止める。
 */
export const FIGURE_BOTTOM_PAD = 0.08;
/** 図下の説明・手順注釈を図の一部として残す正規化余白（0–1000）。2〜3行分 */
export const FIGURE_CAPTION_ROOM = 72;
/** 小問本文帯。answer bbox は解答欄なので、その上の設問全文を見積もって余白を取る */
export const FIGURE_STEM_CLEARANCE = 96;
/** 図+説明の下に問題文1行だけ巻き込まれたときの行高（0–1000）。説明ブロックは残す */
export const SWALLOWED_STEM_LINE = 36;
/** ページ上部の親図が (1) 本文へ食い込まない上限 */
export const PARENT_FIGURE_YMAX = 510;
/** リード文帯の下限。これより下は図のラベル（ふた・㋐・目盛）側 */
export const LEAD_BAND_END = 148;
/** 右カラム差し込みの左端。設問本文列へ食い込ませず、図の左端は残す */
export const RIGHT_INSET_XMIN = 630;
/** 右寄りの親図で、本文列と図のあいだのラベル（イ・ウ・目盛名）を残す下限 */
export const RIGHT_FIGURE_LABEL_XMIN = 380;
/** 差し込み1枚分の高さ。図の下端は残し、次の小問までは伸ばさない */
export const INSET_MIN_HEIGHT = 188;
/** 右差し込みの幅上限。ページ右の空きまでは広げない。図の右端は詰めない */
export const INSET_MAX_WIDTH = 282;
/** 本文列との境に残る切れ端1列分。ページ端側は触らない */
export const INSET_INNER_GUTTER = 32;
/**
 * JPEG 帯マスクの幅上限。見出し切れ端（「しょう。1問10点」など）は約 0.30。
 * イ・ウは帯ごとの peel で手前で止めるので、ここを狭めて切らない。
 */
export const LEFT_STEM_MASK_MAX_WIDTH = 0.32;

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

/**
 * 小問の本文帯。(1)(2) や左〜全幅の設問ブロック。
 * 図下の ❶❷❸ キャプションではなく、問題文と判定したとき図から外す。
 */
export function looksLikeQuestionStem(box) {
  const n = usableGeminiBox(box);
  if (!n) return false;
  if (looksLikeAnswerSlot(n) && n[1] >= 480) return false;
  const h = n[2] - n[0];
  const w = n[3] - n[1];
  if (h < 32 || h > 320) return false;
  if (n[0] >= 450 && h >= 140) return false;
  if (n[1] <= 180 && w >= 360) return true;
  return looksLikeLeftStemColumn(n);
}

/** 解答欄が設問行と同じ高さ帯にある（右の空欄）。問題文の上端として使う */
export function looksLikeAnswerBesideStem(box, figure) {
  const ans = usableGeminiBox(box);
  const fig = usableGeminiBox(figure);
  if (!ans || !fig || !looksLikeAnswerSlot(ans)) return false;
  const top = Math.min(ans[0], ans[2]);
  return top > fig[0] + 90 && top < fig[2] + 100;
}

/**
 * 図+説明の下端。箱の高さでは切らない（説明❶❷❸まで消えるため）。
 * 巻き込まれた問題文は trailingStemCutFromBandSizes（画素の空き）で外す。
 */
export function estimateFigureCaptionEnd(box, options = {}) {
  const n = usableGeminiBox(box);
  if (!n) return null;
  return n[2];
}

/** JPEG 帯サイズから余白／インクの閾値。端末圧縮でも相対差で分ける */
function bandToneLimits(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const minS = sorted[0];
  const maxS = sorted[sorted.length - 1];
  const span = Math.max(1, maxS - minS);
  const whiteLimit = minS + span * 0.28;
  const inkLimit = minS + span * 0.55;
  return {
    isWhite: (s) => s <= whiteLimit,
    isInk: (s) => s >= inkLimit,
  };
}

/**
 * 親図切り抜きの下側バンド（上→下）の JPEG サイズ列から、
 * 説明と問題文のあいだの空きを探す。特定プリントの Y は使わない。
 * @param {number[]} sizes 各バンドのバイト長
 * @returns {number | null} サンプル内のカット位置 0〜1。無ければ null
 */
export function trailingStemCutFromBandSizes(sizes) {
  const nums = (Array.isArray(sizes) ? sizes : []).map((s) => Math.max(0, Number(s) || 0));
  const n = nums.length;
  if (n < 6) return null;
  const { isWhite, isInk } = bandToneLimits(nums);
  let seenInk = 0;
  for (let i = 0; i < n; i += 1) {
    if (isInk(nums[i])) seenInk += 1;
    if (!isWhite(nums[i])) continue;
    if (seenInk < 2) continue;
    let j = i;
    while (j < n && isWhite(nums[j])) j += 1;
    const remain = n - j;
    if (remain >= 1 && remain <= Math.max(3, Math.floor(n * 0.42))) {
      const remainInk = nums.slice(j).filter(isInk).length;
      if (remainInk >= 1) return i / n;
    }
    i = j - 1;
  }
  return null;
}

/**
 * 親図・表の上側バンド（上→下）から、問題文と本体のあいだの空きを探す。
 * 空きの下の図・表・説明は残す。特定プリントの Y は使わない。
 * @returns {number | null} サンプル内の残す開始位置 0〜1。無ければ null
 */
export function leadingStemCutFromBandSizes(sizes) {
  const nums = (Array.isArray(sizes) ? sizes : []).map((s) => Math.max(0, Number(s) || 0));
  const n = nums.length;
  if (n < 6) return null;
  const { isWhite, isInk } = bandToneLimits(nums);
  let i = 0;
  while (i < n && isWhite(nums[i])) i += 1;
  const stemStart = i;
  while (i < n && !isWhite(nums[i])) i += 1;
  const stemEnd = i;
  const stemBands = stemEnd - stemStart;
  if (stemBands < 1 || stemBands > Math.max(4, Math.floor(n * 0.5))) return null;
  if (stemStart === 0 && stemBands >= Math.floor(n * 0.45)) return null;
  const gapStart = i;
  while (i < n && isWhite(nums[i])) i += 1;
  if (i - gapStart < 1) return null;
  const remain = nums.slice(i);
  if (remain.length < 1) return null;
  const remainInk = remain.filter(isInk).length;
  const remainBody = remain.filter((s) => !isWhite(s)).length;
  // 表の上罫はインク扱いしないことがある。空きの下に本体帯があれば切る
  if (remainInk < 1 && remainBody < 1) return null;
  return stemEnd / n;
}

/**
 * 左切れ端用。図本体の濃さに引っ張られず、紙の白に近い列だけを空きとみなす。
 * 問題文の切れ端は図より薄いので、帯全体の 28% 閾値だと白扱いになって消えない。
 */
function leftStemToneLimits(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const minS = sorted[0];
  const maxS = sorted[sorted.length - 1];
  const span = Math.max(1, maxS - minS);
  const whiteLimit = minS + Math.max(24, span * 0.08);
  const inkLimit = minS + span * 0.42;
  return {
    isWhite: (s) => s <= whiteLimit,
    isInk: (s) => s >= inkLimit,
  };
}

/**
 * 切り抜き左端の縦帯（左→右）から、問題文と図のあいだの空きを探す。
 * 帯ごとに切る（縦一刀にしない）。イ・ウは左余白の内側なので残す。
 * @param {number[]} sizes 各縦帯のバイト長
 * @returns {number | null} サンプル内のカット位置 0〜1。無ければ null
 */
export function leftStemCutFromColumnSizes(sizes) {
  const nums = (Array.isArray(sizes) ? sizes : []).map((s) => Math.max(0, Number(s) || 0));
  const n = nums.length;
  if (n < 6) return null;
  const minS = Math.min(...nums);
  const maxS = Math.max(...nums);
  if (maxS - minS < 80 && maxS - minS < minS * 0.12) return null;
  const { isWhite, isInk } = leftStemToneLimits(nums);
  let i = 0;
  while (i < n && isWhite(nums[i])) i += 1;
  const stemStart = i;
  // イ・ウは図の左余白の右。左端から始まる本文切れ端だけ消す
  if (stemStart > 1) return null;
  while (i < n && !isWhite(nums[i])) i += 1;
  let stemEnd = i;
  // 茎の右端が急に薄い列はイ・ウ。本文切れ端だけ残して切る
  if (stemEnd - stemStart >= 2) {
    const first = nums[stemStart];
    const last = nums[stemEnd - 1];
    if (last < first * 0.72 && !isInk(last)) stemEnd -= 1;
  }
  const stemBands = stemEnd - stemStart;
  if (stemBands < 1 || stemBands > Math.max(6, Math.floor(n * 0.62))) return null;
  // 切れ端が広すぎる帯はラベルまで含む。切らず図側を残す
  if (stemEnd / n > 0.44) return null;
  i = stemEnd;
  const gapStart = i;
  while (i < n && isWhite(nums[i])) i += 1;
  if (i - gapStart < 1) return null;
  const remain = nums.slice(i);
  if (remain.length < 2) {
    if (stemEnd / n <= 0.55) return stemEnd / n;
    return null;
  }
  const remainInk = remain.filter(isInk).length;
  const remainBody = remain.filter((s) => !isWhite(s)).length;
  if (remainInk < 1 && remainBody < 1) {
    if (stemEnd / n <= 0.55) return stemEnd / n;
    return null;
  }
  return stemEnd / n;
}

/**
 * 横帯ごとの左カラムサイズから、問題文切れ端の白マスク（crop 内 0〜1）を作る。
 * 縦一刀ではイ・ウと本文が同じ X に乗るので、帯ごとに本文だけ消す。
 * @param {number[][]} bands
 * @param {{ sampleWidthFrac?: number }} [options]
 */
export function leftStemMasksFromBandColumns(bands, options = {}) {
  const rows = Array.isArray(bands) ? bands : [];
  const n = rows.length;
  if (n < 4) return [];
  const sampleFrac = Number(options.sampleWidthFrac) > 0 ? Number(options.sampleWidthFrac) : 0.72;
  const masks = [];
  for (let i = 0; i < n; i += 1) {
    const frac = leftStemCutFromColumnSizes(rows[i]);
    if (frac == null || !(frac > 0.04) || !(frac < 0.82)) continue;
    masks.push({
      x: 0,
      y: i / n,
      width: Math.min(LEFT_STEM_MASK_MAX_WIDTH, frac * sampleFrac + 0.01),
      height: 1 / n,
    });
  }
  return mergeAdjacentNormalizedMasks(masks);
}

/**
 * 認識済みの問題文 bbox が親図 crop に食い込んだ部分だけを白マスクする。
 * 縦一刀だとイ・ウと同じ高さの本文切れ端を消せないので、本文矩形の交差だけ消す。
 * @param {unknown} cropGemini
 * @param {unknown[]} stemBoxes
 * @param {{ maxWidthFrac?: number }} [options]
 */
export function swallowedStemMasksInCrop(cropGemini, stemBoxes, options = {}) {
  const crop = usableGeminiBox(cropGemini);
  if (!crop) return [];
  let cropNorm;
  try {
    cropNorm = geminiBBoxToNormalizedBox(crop);
  } catch {
    return [];
  }
  const maxWidthFrac = Number(options.maxWidthFrac) > 0 ? Number(options.maxWidthFrac) : 0.16;
  const masks = [];
  for (const raw of Array.isArray(stemBoxes) ? stemBoxes : []) {
    const clipped = clipSwallowedStemOverlap(raw, crop, maxWidthFrac);
    if (!clipped) continue;
    let rel;
    try {
      rel = relativeBoxInParent(cropNorm, geminiBBoxToNormalizedBox(clipped));
    } catch {
      continue;
    }
    if (!rel || rel.x > 0.08 || rel.width < 0.015 || rel.height < 0.018) continue;
    const y = clamp(rel.y - 0.01, 0, 1);
    masks.push({
      x: 0,
      y,
      width: clamp(rel.x + rel.width + 0.02, 0.04, maxWidthFrac),
      height: clamp(rel.height + 0.02, 0.02, 1 - y),
    });
  }
  return mergeAdjacentNormalizedMasks(masks);
}

function clipSwallowedStemOverlap(raw, crop, maxWidthFrac) {
  const stem = usableGeminiBox(raw);
  if (!stem) return null;
  const [cymin, cxmin, cymax, cxmax] = crop;
  let [ymin, xmin, ymax, xmax] = stem;
  const cropW = Math.max(1, cxmax - cxmin);
  if (xmax - xmin < 90 || ymax - ymin < 16) return null;
  if (xmin > cxmin + 90) return null;
  if (xmax < cxmin + 6) return null;
  // 全幅の設問箱でイ・ウまで消さない。左本文列と分かったときだけ
  if (!looksLikeLeftStemColumn(stem) && !looksLikeTextColumnBesideInset(stem, crop)) return null;
  const textRight = textColumnRightEdge(stem) ?? xmax;
  xmax = Math.min(xmax, textRight);
  ymin = Math.max(ymin, cymin);
  ymax = Math.min(ymax, cymax);
  xmin = Math.max(xmin, cxmin);
  xmax = Math.min(xmax, cxmax);
  if (!(ymax > ymin + 8) || !(xmax > xmin + 8)) return null;
  const maxW = cropW * maxWidthFrac;
  if (xmax - xmin > maxW) xmax = xmin + maxW;
  return [ymin, xmin, ymax, xmax];
}

/** 解答欄マスクと本文切れ端マスクを重ねて隣接をまとめる */
export function combineFigureMasks(...groups) {
  const masks = [];
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const mask of group) {
      if (!mask || typeof mask !== "object") continue;
      const x = Number(mask.x);
      const y = Number(mask.y);
      const width = Number(mask.width);
      const height = Number(mask.height);
      if (![x, y, width, height].every((n) => Number.isFinite(n))) continue;
      if (!(width > 0) || !(height > 0)) continue;
      masks.push({ x, y, width, height });
    }
  }
  return mergeAdjacentNormalizedMasks(masks);
}

function mergeAdjacentNormalizedMasks(masks) {
  const sorted = [...masks].sort((a, b) => a.y - b.y);
  if (sorted.length === 0) return [];
  const out = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = out[out.length - 1];
    const cur = sorted[i];
    const gap = cur.y - (prev.y + prev.height);
    if (gap <= 0.03 && Math.abs(cur.width - prev.width) <= 0.14) {
      const bottom = Math.max(prev.y + prev.height, cur.y + cur.height);
      const mergedH = bottom - prev.y;
      // 高い帯にまとめるとイ・ウまで白で消える
      if (mergedH > 0.22 && Math.max(prev.width, cur.width) > 0.12) {
        out.push({ ...cur });
        continue;
      }
      prev.height = mergedH;
      prev.width = Math.max(prev.width, cur.width);
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/** 検出した問題文が図のいちばん下側にあるか（説明帯の誤検出で❶❷❸を消さない） */
export function stemStartsInLowerFigureBand(stemTop, figure) {
  const fig = usableGeminiBox(figure);
  if (!fig || !Number.isFinite(Number(stemTop))) return false;
  const h = Math.max(1, fig[2] - fig[0]);
  return Number(stemTop) >= fig[0] + h * 0.78;
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
  // Gemini が左ラベル（イ・ウ）まで取れていれば 630 へ戻さない
  const gemXmin = n ? n[1] : columnStart;
  const xmin =
    gemXmin >= 480 && gemXmin < columnStart ? gemXmin : columnStart;
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
 * 右カラムの縦積み図（角度→矢印→分度器など）の上段はリードではないので切らない。
 */
export function raiseCropBelowLead(box) {
  const b = usableGeminiBox(box);
  if (!b) return null;
  if (b[0] >= LEAD_BAND_END) return b;
  if (b[1] >= 340) return b;
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
  // 差し込みは asInset のときだけ。右寄りの親図（角度＋矢印＋分度器など）を 630 固定にしない
  const inset = options.asInset === true && !lowerTable;
  const topFigure = !lowerTable && !inset && ymin <= 240;
  const rightLeaning = !lowerTable && !inset && xmin >= 400;
  // 上段ページの縦積み説明図の下段だけ取れた箱。2×2 の小パネルまでは伸ばさない
  const stackedRight =
    rightLeaning && ymin > LEAD_BAND_END && ymax <= 540 && h >= 160 && h < 280;
  // 解答欄だけの短い箱。図は手書きの左上。下の隣パネルまでは伸ばさない
  const answerSliver = rightLeaning && looksLikeAnswerSlot(nums) && h < 120;
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
      : answerSliver
        ? Math.min(Math.max(h * 2.4, 140), 200)
      : stackedRight
        ? Math.min(Math.max(h * 0.95, 152), 200)
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
        : answerSliver
          ? Math.max(h * 0.12, 8)
        : stackedRight
          ? Math.max(h * 0.85, 140)
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
        : answerSliver
          ? Math.min(Math.max(w * 1.15, 120), 168)
        : rightLeaning
          ? Math.max(w * 0.5, xmin - RIGHT_FIGURE_LABEL_XMIN, 120)
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
    // 図下の説明は図の一部。短い箱を 360 で止めず、キャプション帯まで伸ばす
    nextYmax = Math.min(nextYmax, ymax > 520 ? 490 : PARENT_FIGURE_YMAX);
  }
  const nextYmin = clamp(
    Math.max(ymin - dyTop, lowerTable ? ymin : inset ? Math.max(8, ymin - dyTop) : 8),
    0,
    1000,
  );
  // ページ上段の全幅図は左注釈を残す。右寄りの図は 18 まで広げず、ラベル帯まで左へ戻す
  let nextXmin = clamp(
    topFigure && xmin < 400
      ? Math.min(Math.max(xmin - dxLeft, 18), 36)
      : rightCol
        ? Math.max(xmin - dxLeft, RIGHT_INSET_XMIN)
        : answerSliver
          ? Math.max(xmin - dxLeft, 8)
        : rightLeaning
          ? Math.max(xmin - dxLeft, RIGHT_FIGURE_LABEL_XMIN)
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
export function clipFigureBottomBeforeBelow(expanded, original, belowBox, gap = 12, options = {}) {
  const exp = usableGeminiBox(expanded);
  const orig = usableGeminiBox(original);
  const below = usableGeminiBox(belowBox);
  if (!exp) return null;
  const topFigure = looksLikeTopParentFigure(orig ?? exp);
  const geminiAteStem = Boolean(orig && (orig[2] > 520 || orig[2] - orig[0] > 430));
  const hardCap = topFigure ? (geminiAteStem ? 490 : PARENT_FIGURE_YMAX) : null;
  const hasQuestionStem = options.hasQuestionStem === true;
  const detectedStem = looksLikeQuestionStem(below) || looksLikeAnswerBesideStem(below, orig ?? exp);

  let stop = exp[2];
  if (orig && below) {
    const origH = Math.max(1, orig[2] - orig[0]);
    const belowTop = Math.min(below[0], below[2]);
    const gapBelowFigure = belowTop - orig[2];
    if (detectedStem && belowTop > exp[0] + 110 && stemStartsInLowerFigureBand(belowTop, orig ?? exp)) {
      // 下側の問題文だけ切る。図の中腹と判定した箱では説明を残す
      stop = Math.min(stop, belowTop - gap);
    } else if (geminiAteStem) {
      stop = Math.min(stop, belowTop - gap - FIGURE_STEM_CLEARANCE, hardCap ?? stop);
    } else if (looksLikeAnswerSlot(below) && topFigure && gapBelowFigure > 120) {
      // 解答欄だけが遠い。図下の説明は残し、解答まで伸ばさない
      stop = Math.min(stop, orig[2] + FIGURE_CAPTION_ROOM, PARENT_FIGURE_YMAX);
    } else if (belowTop >= orig[0] + origH * 0.28 && belowTop <= orig[2] + 240) {
      // 直下の小問直前まで。図と小問のあいだの説明は図の一部
      const beforeStem = belowTop - gap;
      stop = Math.min(stop, Math.max(orig[2], beforeStem));
    } else if (belowTop > orig[2] + 240 && topFigure) {
      stop = Math.min(stop, orig[2] + FIGURE_CAPTION_ROOM, PARENT_FIGURE_YMAX);
    }
  } else if (topFigure && hardCap != null) {
    stop = Math.min(stop, hardCap);
  }
  if (hardCap != null) stop = Math.min(stop, hardCap);
  const captionEnd = estimateFigureCaptionEnd(orig, { hasQuestionStem });
  const peeledSwallowedStem =
    Boolean(orig) && hasQuestionStem && topFigure && !detectedStem && captionEnd != null && captionEnd < orig[2];
  if (peeledSwallowedStem) stop = Math.min(stop, captionEnd);
  if (orig && !geminiAteStem && !detectedStem && !peeledSwallowedStem && stop < orig[2]) stop = orig[2];

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

/** 2×2 などの複数パネルから、この小問の解答/設問が指す段だけ残す */
export function clipFigureToOverlappingPanel(figure, problemBox) {
  const fig = usableGeminiBox(figure);
  const slot = usableGeminiBox(problemBox);
  if (!fig || !slot) return fig;
  const figH = fig[2] - fig[0];
  const figW = fig[3] - fig[1];
  if (fig[1] < 360) return fig;
  if (fig[0] <= 240 && figH >= 220) return fig;
  if (figH < 160 || figH > 420) return fig;
  const overlapY = Math.min(fig[2], slot[2]) - Math.max(fig[0], slot[0]);
  const beside =
    slot[1] >= fig[1] + figW * 0.28 &&
    slot[0] < fig[2] + 20 &&
    slot[2] > fig[0] - 20;
  if (overlapY < 24 && !beside) return fig;
  const slotMidY = (Math.min(slot[0], slot[2]) + Math.max(slot[0], slot[2])) / 2;
  if (slotMidY < fig[0] - 24 || slotMidY > fig[2] + 48) return fig;
  const answerLike = looksLikeAnswerSlot(slot);
  // 解答欄で1パネル分しかない図は、手書きの細いYに潰さない
  if (answerLike && figH < 280) return fig;
  const pad = Math.max(28, figH * 0.08);
  let ymin = clamp(Math.min(slot[0], slotMidY) - pad, fig[0], fig[2]);
  let ymax = clamp(Math.max(slot[2], slotMidY) + pad, fig[0], fig[2]);
  if (answerLike) {
    // 解答は図の右下。上に図を残し、下の隣パネルは取らない
    const minPanel = Math.max(150, Math.min(figH * 0.48, 200));
    ymax = clamp(slot[2] + Math.min(pad, 20), fig[0], fig[2]);
    ymin = clamp(Math.min(ymin, ymax - minPanel), fig[0], fig[2]);
    const maxPanel = figH * 0.58;
    if (ymax - ymin > maxPanel) ymin = ymax - maxPanel;
  }
  if (ymax - ymin < Math.max(120, figH * 0.22)) return fig;
  if (ymax - ymin > figH * 0.82) return fig;
  return [ymin, fig[1], ymax, fig[3]];
}

function answerMaskRelativeInCrop(crop, answer) {
  const rel = relativeBoxInParent(crop, answer);
  if (!rel) return null;
  // 図を含む広い箱は右側の手書きだけ隠す
  if (rel.width > 0.38 && rel.x < 0.5) {
    const x = clamp(Math.max(rel.x + rel.width * 0.55, 0.52), 0, 1);
    return { x, y: rel.y, width: clamp(rel.x + rel.width - x, 0.08, 1 - x), height: rel.height };
  }
  return rel;
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
  const rel = answer ? answerMaskRelativeInCrop(used, answer) : null;
  const masks = rel ? [padNormalizedBox(rel, 0.05)] : [];
  return { crop: used, masks };
}

/**
 * 印刷・キャッシュ用: Gemini 生座標を expand し、大問図は枠を維持したまま切り抜き矩形を決める。
 * 戻り値の cropGemini は実際の JPEG crop と白マスクの共通基準。
 */
export function planExpandedFigureCrop(cropBox, answerBBox, options = {}) {
  const raw = usableGeminiBox(cropBox);
  if (!raw) return { cropGemini: null, masks: [] };
  const expandOpts = options.asTable
    ? { asTable: true }
    : options.asInset
      ? { asInset: true }
      : { hasQuestionStem: options.hasQuestionStem === true };
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
      clipFigureBottomBeforeBelow(expanded, raw, answerBBox, options.bottomGap ?? 10, {
        hasQuestionStem: options.hasQuestionStem === true,
      }) ?? expanded;
    expanded = clipFigureToOverlappingPanel(expanded, options.problemBox ?? answerBBox) ?? expanded;
  }
  const preserveExtent = options.preserveExtent !== false;
  // 設問本文・リードとの重なりを白マスクすると左上に帯が出る。解答欄だけ隠す
  const maskAnswer =
    options.asInset || options.asTable
      ? null
      : looksLikeAnswerSlot(options.answerSlot)
        ? options.answerSlot
        : looksLikeAnswerSlot(answerBBox)
          ? answerBBox
          : null;
  const planned = figureAnswerMasks(expanded, maskAnswer ?? null, { preserveExtent });
  const cropGemini = planned.crop ? normalizedBoxToGemini(planned.crop) : expanded;
  return { cropGemini, masks: planned.masks ?? [] };
}

