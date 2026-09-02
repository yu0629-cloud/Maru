import {
  usableGeminiBox,
  clamp,
  prepareParentFigureBox,
  raiseCropBelowLead,
  looksLikeInsetCrop,
  looksLikeLeftStemColumn,
  looksLikeQuestionStem,
  looksLikeTopParentFigure,
  LEAD_BAND_END,
  RIGHT_INSET_XMIN,
  rightInsetColumnStart,
  forceInsetColumnBox,
  clipInsetToStemWindow,
  clipInsetLeftAfterStem,
  trimInsetSliverEdges,
  trimInsetNeighborEdges,
} from "./bbox.mjs";
import { normalizeOcrText } from "./ocr-text.mjs";
import { looksLikeProblemStemText, matchLeadingQuestionNumber } from "./question-number.mjs";

export { normalizeOcrText } from "./ocr-text.mjs";

const TABLE_VISUAL_RE =
  /[表和衰裏乗]にまとめると|表にまとめ|次の表|下の表|上の表|右の表|左の表|表から|表を見|表より|表の中|結果を表|グラフから|グラフを見|グラフ/;

/** 表があると助かるが、無いときは推測クロップしない（「結果から」は結論問題にも使う） */
const TABLE_INHERIT_RE = /実験の結果|結果について|下のようになりました/;

/** 設問が図中の記号・実験器具を指している（「下の図」が無くても図が要る） */
const LABELED_DIAGRAM_RE =
  /[㋐-㋾]|[ア-エウ]\s*の(?:上|下|左|右)|すき間|線香|集気びん|ろうそく|てこが|水平につり/;

function problemHaystack(item = {}) {
  return normalizeOcrText(
    [
      item.questionText,
      item.question_text,
      item.prompt,
      item.parentContext,
      item.parent_context,
      item.contextText,
      item.context_text,
      item.optionsText,
      item.options_text,
    ]
      .map((part) => String(part ?? ""))
      .join(" "),
  );
}

/**
 * データ表・グラフが解くのに必須、またはあった方が解きやすいか。
 * （「必須のときだけ」ではない）
 */
export function needsDataTableVisual(item = {}) {
  return TABLE_VISUAL_RE.test(problemHaystack(item));
}

/** 同一大問の表箱だけ借りる。ページ下を表と決め打ちしない */
export function mayInheritDataTable(item = {}) {
  return needsDataTableVisual(item) || TABLE_INHERIT_RE.test(problemHaystack(item));
}

/** @deprecated alias — needsDataTableVisual と同じ（必須／あった方がよい） */
export function benefitsFromDataTableVisual(item = {}) {
  return needsDataTableVisual(item);
}

export function mentionsDataTable(value) {
  return needsDataTableVisual({ questionText: value });
}

/**
 * 親図があると解きやすいか（表と併用する判断用）。
 * 表を出す小問では実験手順の親図もあった方がよい、とみなす。
 */
export function benefitsFromParentFigure(item = {}) {
  const hay = problemHaystack(item);
  if (needsDataTableVisual(item)) return true;
  if (LABELED_DIAGRAM_RE.test(hay)) return true;
  return /下の図|次の図|右の図|上の図|図のような|図を見|図から|手順で|実験/.test(hay);
}

/**
 * 「右の図」ではない右寄りの縦積み図（角度＋矢印＋分度器など）。
 * 差し込み扱いすると左ラベルと上段パネルが切れる。
 */
function keepRightColumnParentBox(box, item = {}) {
  const n = usableGeminiBox(box);
  if (!n || !looksLikeInsetFigureBox(n)) return false;
  if (needsInsetFigure(item)) return false;
  return n[1] >= 400 && n[3] >= 760 && (n[2] - n[0] >= 180 || n[0] <= 240);
}

/** てことろうそくなど、別実験の図を取り違えないための系統 */
export function figureFamilyOf(item = {}) {
  const hay = problemHaystack(item);
  const lever = /てこ|おもり|支点|うで/.test(hay);
  const candle = /ろうそく|線香|集気びん|すき間|[㋐-㋾]/.test(hay);
  const tube = /検知管|ゴムキャップ/.test(hay);
  if ([lever, candle, tube].filter(Boolean).length > 1) return "mixed";
  if (lever) return "lever";
  if (candle) return "candle";
  if (tube) return "tube";
  return "";
}

export function sameFigureFamily(a = {}, b = {}) {
  const fa = figureFamilyOf(a);
  const fb = figureFamilyOf(b);
  if (!fa || !fb) return true;
  if (fa === "mixed" || fb === "mixed") return false;
  return fa === fb;
}

/** 親図座標が無いとき、ページ上部の共通図を仮定する */
export function inferParentFigureBox(item = {}) {
  const explicit = usableGeminiBox(item?.parentFigureBox ?? item?.parent_figure_box);
  if (explicit && (!looksLikeInsetFigureBox(explicit) || keepRightColumnParentBox(explicit, item))) {
    return explicit;
  }
  const crop =
    usableGeminiBox(item?.figureCropBox) ||
    usableGeminiBox(item?.crop_box) ||
    usableGeminiBox(item?.cropBoxGemini);
  if (looksLikeParentFigureBox(crop)) return crop;
  if (!benefitsFromParentFigure(item)) return null;
  if (needsInsetFigure(item)) return [88, 48, 330, 960];
  const hay = problemHaystack(item);
  if (/[㋐-㋾]|すき間/.test(hay)) return [88, 48, 430, 960];
  if (needsDataTableVisual(item)) return [88, 48, 400, 960];
  return [88, 48, 400, 960];
}

/** 本文を巻き込んだ縦長箱より、図だけの狭い箱を優先する */
export function preferParentFigureBox(a, b) {
  const A = usableGeminiBox(a);
  const B = usableGeminiBox(b);
  if (!A) return B;
  if (!B) return A;
  const aH = A[2] - A[0];
  const bH = B[2] - B[0];
  const aW = A[3] - A[1];
  const bW = B[3] - B[1];
  if (aW >= 500 && bW < 500 && aW - bW >= 80) return A;
  if (bW >= 500 && aW < 500 && bW - aW >= 80) return B;
  if (aH > 360 && bH <= 360) return B;
  if (bH > 360 && aH <= 360) return A;
  if (Math.abs(aW - bW) >= 80) return aW >= bW ? A : B;
  return aH <= bH ? A : B;
}

/** 印字するリード文「下の図のように…」を親図クロップから外す */
export function trimParentBoxExcludingLead(box, item = {}) {
  const b = usableGeminiBox(box);
  if (!b) return null;
  const h = Math.max(1, b[2] - b[0]);
  const hay = problemHaystack(item);
  const mentionsLead = /下の図|次の図|図のような/.test(hay);
  const startsInTitle = b[0] < 80;
  const startsInLeadLine = b[0] >= 120 && b[0] < LEAD_BAND_END + 4;
  // Gemini がリードを箱に入れた短いクロップだけ切る。推定箱 ymin≈88 は図上端なので触らない
  if (h < 280 && (startsInTitle || startsInLeadLine)) return raiseCropBelowLead(b);
  if (!mentionsLead) return b;
  return raiseCropBelowLead(b) ?? b;
}

/** 親図が (1) 本文・差し込み図まで伸びているとき、図本体で止める */
export function trimParentBottomBeforeQuestion(box, item = {}) {
  const b = usableGeminiBox(box);
  if (!b || !looksLikeTopParentFigure(b)) return b;
  const stem = stemBoxOf(item);
  if (
    (looksLikeQuestionStem(stem) || looksLikeLeftStemColumn(stem)) &&
    stem[0] > b[0] + 70 &&
    stem[0] < b[2] + 80
  ) {
    const stop = Math.max(b[0] + 140, Math.min(b[2], stem[0] - 8));
    if (stop < b[2]) return [b[0], b[1], stop, b[3]];
  }
  if (needsInsetFigure(item) && b[2] > 320 && b[2] - b[0] > 160) {
    const stop = Math.max(b[0] + 140, Math.min(b[2], 338));
    if (stop < b[2]) return [b[0], b[1], stop, b[3]];
  }
  return b;
}

function sameBox(a, b) {
  if (!a || !b) return false;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

function shareKeyOf(item) {
  const path = String(item?.originalPath || item?.original_path || item?.scanId || item?.scan_id || "").trim();
  if (path) return path.replace(/[?#].*$/, "").split(/[/\\]/).filter(Boolean).pop() || path;
  return String(item?.originalImageSrc || item?.original_image_src || "").replace(/[?#].*$/, "");
}

/**
 * 同一スキャン内で、親図より下にある解答/小問 bbox のうち最も上端が早いもの。
 * 親図切り抜きが (1) 本文を巻き込まないようにする。
 * @returns {[number, number, number, number] | null}
 */
function contextKeyOf(item) {
  return normalizeOcrText(
    String(item?.parentContext || item?.parent_context || item?.contextText || item?.context_text || ""),
  )
    .replace(/\s+/g, "")
    .slice(0, 80);
}

export function earliestStemBelowParent(problems, parentBox, current) {
  const parent = usableGeminiBox(parentBox);
  if (!parent) return usableGeminiBox(current?.bbox ?? current?.gemini_bbox ?? current?.geminiBbox);
  const key = shareKeyOf(current);
  const ctx = contextKeyOf(current);
  const parentMid = parent[0] + (parent[2] - parent[0]) * 0.28;
  let bestNumbered = null;
  let bestNumber = Infinity;
  let bestNumberTop = Infinity;
  let bestStem = null;
  let bestStemTop = Infinity;
  let best = null;
  let bestTop = Infinity;
  const list = Array.isArray(problems) ? problems : [];
  for (const row of list) {
    const rowKey = shareKeyOf(row);
    if (key && rowKey && rowKey !== key) {
      const rowCtx = contextKeyOf(row);
      if (!ctx || !rowCtx || (ctx !== rowCtx && !ctx.includes(rowCtx) && !rowCtx.includes(ctx))) continue;
    }
    const box = usableGeminiBox(row?.bbox ?? row?.gemini_bbox ?? row?.geminiBbox);
    if (!box) continue;
    const top = Math.min(box[0], box[2]);
    if (top < parentMid) continue;
    if (top >= parent[2] + 260) continue;
    const qText = String(row?.questionText ?? row?.question_text ?? row?.stem ?? "");
    const numbered = looksLikeProblemStemText(qText) ? matchLeadingQuestionNumber(qText) : null;
    const tokenNum = numbered ? Number.parseInt(numbered.token, 10) : NaN;
    if (Number.isFinite(tokenNum) && (tokenNum < bestNumber || (tokenNum === bestNumber && top < bestNumberTop))) {
      bestNumber = tokenNum;
      bestNumberTop = top;
      bestNumbered = box;
    }
    if (looksLikeQuestionStem(box) && top < bestStemTop) {
      bestStemTop = top;
      bestStem = box;
    }
    if (top < bestTop) {
      bestTop = top;
      best = box;
    }
  }
  if (bestNumbered) return bestNumbered;
  if (bestStem) return bestStem;
  if (best) return best;
  return usableGeminiBox(current?.bbox ?? current?.gemini_bbox ?? current?.geminiBbox);
}

/** 設問横の差し込み図（「右の図」「左の図」）。幅が狭く左右いずれか */
export function looksLikeInsetFigureBox(box) {
  return looksLikeInsetCrop(box);
}

export function needsInsetFigure(item = {}) {
  return /右の図|左の図/.test(problemHaystack(item));
}

/** 元プリントの「右の図／左の図／下の図」に合わせて配置する */
export function figurePlacementOf(item = {}) {
  const hay = problemHaystack(item);
  if (/右の図/.test(hay)) return "right";
  if (/左の図/.test(hay)) return "left";
  return "below";
}

/** crop_box がページ上部の共通図らしいか（表だけ補完したときに親を落とさない） */
export function looksLikeParentFigureBox(box, sub = null) {
  const p = usableGeminiBox(box);
  if (!p) return false;
  const h = p[2] - p[0];
  if (h < 90) return false;
  if (p[0] > 480) return false;
  // 差し込み図を親図扱いすると、上の横長図が消える
  if (looksLikeInsetFigureBox(p)) return false;
  const s = usableGeminiBox(sub);
  if (s && sameBox(p, s)) return false;
  if (s && p[0] >= s[0] - 8 && Math.abs(p[2] - s[2]) < 40) return false;
  return true;
}

function hasPrintedChoices(item = {}) {
  const hay = [
    item.optionsText,
    item.options_text,
    item.questionText,
    item.question_text,
  ]
    .map((part) => String(part ?? ""))
    .join(" ");
  return /[①-⑳❶-❿]/.test(hay);
}

/**
 * 表切り抜きから、設問の選択肢帯を外す。
 * options_text は印字用で、crop 座標の計算には使っていなかった。
 */
export function trimTableBoxExcludingChoices(box, item = {}) {
  const b = usableGeminiBox(box);
  if (!b) return null;
  const hasChoices = hasPrintedChoices(item);
  const h = b[2] - b[0];
  const topTrim = hasChoices ? 48 : 8;
  // 下端は「箱が①〜③帯まで伸びている」ときだけ切る。表の最終行は残す
  const likelyIncludesOptions = hasChoices && (b[2] >= 925 || h >= 260);
  const bottomTrim = likelyIncludesOptions ? 40 : 0;
  const ymin = clamp(b[0] + topTrim, 0, 1000);
  const ymax = clamp(b[2] - bottomTrim, 0, 1000);
  if (!(ymax > ymin + 70)) return b;
  return [ymin, b[1], ymax, b[3]];
}

export function inferTableBoxBelow(parent, item = {}) {
  const p = usableGeminiBox(parent);
  // 見出し〜最終行が入る高さ。選択肢帯まで伸ばさない
  const floor = p ? clamp(Math.max(p[2] + 180, 680), 640, 760) : 700;
  const ymax = clamp(floor + 230, floor + 140, 930);
  return trimTableBoxExcludingChoices([floor, 48, ymax, 952], item) ?? [floor, 48, ymax, 952];
}

/**
 * 小問固有の表・グラフ座標。明示箱 → 親より下の crop → 推定。
 * 明示箱が浅い（行が見切れる）ときは下端を伸ばす。
 * @returns {[number, number, number, number] | null}
 */
export function resolveSubFigureBox(item) {
  if (!needsDataTableVisual(item)) return null;
  const explicit = usableGeminiBox(item?.subFigureBox ?? item?.sub_figure_box);
  if (explicit) {
    return trimTableBoxExcludingChoices(
      [
        clamp(explicit[0] - 4, 0, 1000),
        clamp(explicit[1] - 8, 0, 1000),
        clamp(explicit[2] + 8, 0, 1000),
        clamp(explicit[3] + 8, 0, 1000),
      ],
      item,
    );
  }

  const parent =
    usableGeminiBox(item?.parentFigureBox ?? item?.parent_figure_box) ||
    (looksLikeParentFigureBox(item?.figureCropBox) ? usableGeminiBox(item?.figureCropBox) : null) ||
    (looksLikeParentFigureBox(item?.crop_box) ? usableGeminiBox(item?.crop_box) : null);
  const crop =
    usableGeminiBox(item?.figureCropBox) ||
    usableGeminiBox(item?.crop_box) ||
    usableGeminiBox(item?.cropBoxGemini);

  if (crop && parent && !sameBox(crop, parent) && crop[0] >= parent[2] - 40) {
    return trimTableBoxExcludingChoices(
      [
        clamp(crop[0] - 4, 0, 1000),
        clamp(crop[1] - 8, 0, 1000),
        clamp(crop[2] + 8, 0, 1000),
        clamp(crop[3] + 8, 0, 1000),
      ],
      item,
    );
  }
  if (crop && crop[0] >= 560 && (!parent || crop[0] >= parent[2] - 20)) {
    return trimTableBoxExcludingChoices(
      [
        clamp(crop[0] - 4, 0, 1000),
        clamp(crop[1] - 8, 0, 1000),
        clamp(crop[2] + 8, 0, 1000),
        clamp(crop[3] + 8, 0, 1000),
      ],
      item,
    );
  }
  return inferTableBoxBelow(parent, item);
}

/**
 * 親図座標。parent_figure_box → 上部の crop_box → 表とのクリップ。
 * 表だけ補完されても crop_box の共通図を落とさない。
 * @returns {[number, number, number, number] | null}
 */
function parentBoxOf(item) {
  return (
    usableGeminiBox(item?.parentFigureBox ?? item?.parent_figure_box) ||
    (looksLikeParentFigureBox(item?.figureCropBox) ? usableGeminiBox(item?.figureCropBox) : null) ||
    (looksLikeParentFigureBox(item?.crop_box) ? usableGeminiBox(item?.crop_box) : null)
  );
}

function stemBoxOf(item) {
  return usableGeminiBox(item?.bbox ?? item?.gemini_bbox ?? item?.geminiBbox);
}

/**
 * 親図の見た目の下端。箱が小問本文まで伸びているときはクリップして、
 * 差し込み図を「親の下・設問の横」に置く。
 */
function parentFloorForInset(parent, _stem) {
  const p = usableGeminiBox(parent);
  if (!p) return 318;
  if (looksLikeTopParentFigure(p)) {
    // 親箱が小問まで伸びていても、差し込みは上段図の下端付近から
    return Math.min(Math.max(p[2], 318), 336);
  }
  return Math.min(p[2], 640);
}

/** 小問「右の図／左の図」の差し込み座標。親図と縦に混ざった右カラムは下側だけ使う */
export function inferInsetFigureBox(item) {
  if (!needsInsetFigure(item)) return null;
  const parent = parentBoxOf(item);
  const stem = stemBoxOf(item);
  const place = figurePlacementOf(item);
  const floor = parent ? parentFloorForInset(parent, stem) : 318;
  const columnStart = place === "left" ? 36 : rightInsetColumnStart(stem, null);
  const seed = [clamp(floor + 4, 300, 400), columnStart, floor + 80, place === "left" ? 380 : 990];
  const box = forceInsetColumnBox(seed, { place, floor, stem });
  return clipInsetToStemWindow(box, stem) ?? box;
}

/** Gemini の狭い箱と推定カラムを足して、図全体が入る範囲にする */
export function mergeInsetFigureBox(explicit, inferred, place = "right") {
  const a = usableGeminiBox(explicit);
  const b = usableGeminiBox(inferred);
  if (!a) return b;
  if (!b) return a;
  // 右の図なのに左半分から始まる箱は設問文。推定カラムだけ使う
  if (place === "right" && a[1] < 480) return b;
  if (place === "left" && a[3] > 420) return b;
  const overlapY = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const overlapX = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  if (overlapY < 20 && overlapX < 20) return b;
  const aW = a[3] - a[1];
  const aH = a[2] - a[0];
  // 狭い Gemini 箱は上下だけ足す。左右は推定カラム（設問文を巻き込まない）
  if (aW < 240 || aH < 160) {
    return [Math.min(a[0], b[0]), b[1], Math.max(a[2], b[2]), b[3]];
  }
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

export function resolveInsetFigureBox(item) {
  if (!needsInsetFigure(item)) return null;
  const parent = parentBoxOf(item);
  const stem = stemBoxOf(item);
  const floor = parentFloorForInset(parent, stem);
  const inferred = inferInsetFigureBox({ ...item, parentFigureBox: parent, parent_figure_box: parent });
  const place = figurePlacementOf(item);
  const rawExplicit =
    usableGeminiBox(item?.subFigureBox ?? item?.sub_figure_box) ||
    usableGeminiBox(item?.figureCropBox) ||
    usableGeminiBox(item?.crop_box) ||
    usableGeminiBox(item?.cropBoxGemini);
  // 親図帯に重なる箱・短い箱は設問横の推定カラムを使う
  const explicit =
    rawExplicit &&
    looksLikeInsetFigureBox(rawExplicit) &&
    rawExplicit[0] >= floor - 24 &&
    rawExplicit[2] - rawExplicit[0] >= 180
      ? rawExplicit
      : null;
  let box = mergeInsetFigureBox(explicit, inferred, place) ?? inferred ?? explicit;
  if (!box) return null;
  const column = forceInsetColumnBox(box, { place, floor, stem });
  const left = clipInsetLeftAfterStem(column, stem) ?? column;
  const beforeWindow = left;
  const windowed = clipInsetToStemWindow(left, stem) ?? left;
  const sliverSrc =
    rawExplicit && rawExplicit[2] - rawExplicit[0] < 140 ? rawExplicit : box[2] - box[0] < 140 ? box : null;
  const sliverTrimmed = sliverSrc ? trimInsetSliverEdges(windowed, sliverSrc) ?? windowed : windowed;
  return (
    trimInsetNeighborEdges(sliverTrimmed, stem, {
      place,
      keepBottom: windowed[2] < beforeWindow[2] - 4,
    }) ?? sliverTrimmed
  );
}

export function resolveParentFigureBox(item) {
  const explicitSub = usableGeminiBox(item?.subFigureBox ?? item?.sub_figure_box);
  const rawExplicit = usableGeminiBox(item?.parentFigureBox ?? item?.parent_figure_box);
  const explicit = rawExplicit && (!looksLikeInsetFigureBox(rawExplicit) || keepRightColumnParentBox(rawExplicit, item))
    ? rawExplicit
    : null;
  const crop =
    usableGeminiBox(item?.figureCropBox) ||
    usableGeminiBox(item?.crop_box) ||
    usableGeminiBox(item?.cropBoxGemini);
  const candidate = trimParentBottomBeforeQuestion(
    trimParentBoxExcludingLead(
      explicit || (looksLikeParentFigureBox(crop, explicitSub) ? crop : null) || inferParentFigureBox(item),
      item,
    ),
    item,
  );
  if (!candidate) return null;

  let sub = explicitSub;
  if (!sub && needsDataTableVisual(item)) {
    sub = inferTableBoxBelow(candidate, item);
  } else if (!sub) {
    sub = usableGeminiBox(item?.subFigureBox ?? item?.sub_figure_box);
  }
  return prepareParentFigureBox(candidate, sub) ?? candidate;
}

/**
 * 同一スキャン内で親図・表座標を共有し、
 * 解くのに必須／あった方がよい小問へ図と表の両方を補完する。
 */
export function enrichPrintFigureBoxes(problems) {
  const list = Array.isArray(problems) ? problems : [];
  const byScan = new Map();
  for (const problem of list) {
    const key =
      String(problem?.originalPath || problem?.original_path || problem?.scanId || problem?.scan_id || "").trim() ||
      `solo:${String(problem?.id || problem?.problemId || "")}`;
    if (!byScan.has(key)) byScan.set(key, []);
    byScan.get(key).push(problem);
  }

  const parentDonors = new Map();
  const parentExplicit = new Map();
  const subDonors = new Map();
  const insetDonors = new Map();
  for (const [key, group] of byScan) {
    for (const row of group) {
      const family = figureFamilyOf(row);
      const donorKey = family && family !== "mixed" ? `${key}::${family}` : `${key}::any`;
      const explicit = usableGeminiBox(row.parentFigureBox ?? row.parent_figure_box);
      const crop = usableGeminiBox(row.figureCropBox) || usableGeminiBox(row.crop_box);
      if (explicit && (!looksLikeInsetFigureBox(explicit) || keepRightColumnParentBox(explicit, row))) {
        parentDonors.set(
          donorKey,
          parentExplicit.get(donorKey)
            ? preferParentFigureBox(parentDonors.get(donorKey), explicit)
            : explicit,
        );
        parentExplicit.set(donorKey, true);
      } else if (looksLikeParentFigureBox(crop) && !parentExplicit.get(donorKey) && !parentDonors.has(donorKey)) {
        parentDonors.set(donorKey, crop);
      }
      const sub = usableGeminiBox(row.subFigureBox ?? row.sub_figure_box);
      if (sub && needsDataTableVisual(row) && !subDonors.has(donorKey)) subDonors.set(donorKey, sub);
      const insetCrop =
        (looksLikeInsetFigureBox(sub) ? sub : null) ||
        (needsInsetFigure(row) && looksLikeInsetFigureBox(crop) ? crop : null);
      if (insetCrop && !insetDonors.has(donorKey)) insetDonors.set(donorKey, insetCrop);
    }
  }

  const donorOf = (map, key, problem) => {
    const family = figureFamilyOf(problem);
    if (family && family !== "mixed") return map.get(`${key}::${family}`) ?? null;
    return (
      map.get(`${key}::any`) ??
      map.get(`${key}::lever`) ??
      map.get(`${key}::candle`) ??
      map.get(`${key}::tube`) ??
      null
    );
  };

  return list.map((problem) => {
    const key =
      String(problem?.originalPath || problem?.original_path || problem?.scanId || problem?.scan_id || "").trim() ||
      `solo:${String(problem?.id || problem?.problemId || "")}`;
    let parent = usableGeminiBox(problem.parentFigureBox ?? problem.parent_figure_box);
    const wantsTable = needsDataTableVisual(problem);
    const wantsInset = needsInsetFigure(problem);
    const inheritTable = mayInheritDataTable(problem);
    const wantsParent = benefitsFromParentFigure(problem);
    let sub = wantsTable || wantsInset ? usableGeminiBox(problem.subFigureBox ?? problem.sub_figure_box) : null;
    if (sub && wantsInset && !wantsTable && !looksLikeInsetFigureBox(sub)) {
      const place = figurePlacementOf(problem);
      const inColumn = place === "left" ? sub[3] <= 500 : sub[1] >= 320;
      if (!inColumn) sub = null;
    }
    const scanParent = donorOf(parentDonors, key, problem);
    const scanSub = donorOf(subDonors, key, problem);
    const scanInset = donorOf(insetDonors, key, problem);
    const crop =
      usableGeminiBox(problem.figureCropBox) ||
      usableGeminiBox(problem.crop_box) ||
      usableGeminiBox(problem.cropBoxGemini);

    if (parent && looksLikeInsetFigureBox(parent)) parent = null;
    if (!parent) parent = scanParent;
    if (!parent && looksLikeParentFigureBox(crop, sub || scanSub)) parent = crop;
    if (!parent && (wantsParent || wantsTable)) {
      parent = inferParentFigureBox({
        ...problem,
        parentFigureBox: null,
        parent_figure_box: null,
      });
    }
    parent = trimParentBottomBeforeQuestion(trimParentBoxExcludingLead(parent, problem), problem);
    if (!sub && wantsTable) {
      sub =
        scanSub ??
        resolveSubFigureBox({
          ...problem,
          parentFigureBox: parent,
          parent_figure_box: parent,
        });
    }
    if (!sub && inheritTable) sub = scanSub;
    if (!sub && wantsInset) {
      const stem = earliestStemBelowParent(list, parent, problem) ?? stemBoxOf(problem);
      sub =
        resolveInsetFigureBox({
          ...problem,
          parentFigureBox: parent,
          parent_figure_box: parent,
          bbox: stem,
        }) || (scanInset && looksLikeInsetFigureBox(scanInset) ? scanInset : null);
    }

    if ((wantsTable || inheritTable) && !parent && scanParent) parent = scanParent;
    if (wantsTable && !sub && scanSub) sub = scanSub;

    if (!wantsTable && !wantsInset && !parent && !sub) return problem;

    return {
      ...problem,
      visualType: problem.visualType === "passage_based" ? problem.visualType : "has_figure",
      visual_type: problem.visual_type === "passage_based" ? problem.visual_type : "has_figure",
      parentFigureBox: parent ?? problem.parentFigureBox ?? null,
      parent_figure_box: parent ?? problem.parent_figure_box ?? null,
      subFigureBox: sub,
      sub_figure_box: sub,
    };
  });
}
