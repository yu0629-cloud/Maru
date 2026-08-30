import { usableGeminiBox, clamp, prepareParentFigureBox } from "./bbox.mjs";
import { normalizeOcrText } from "./ocr-text.mjs";

export { normalizeOcrText } from "./ocr-text.mjs";

const TABLE_VISUAL_RE =
  /[表和衰裏乗]にまとめると|表にまとめ|次の表|下の表|上の表|右の表|左の表|表から|表を見|表より|表の中|下のようになりました|結果を表|実験の結果|結果から|結果について|グラフから|グラフを見|グラフ/;

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
  return /下の図|次の図|右の図|上の図|図のような|図を見|図から|手順で|実験/.test(hay);
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
    if (top < bestTop) {
      bestTop = top;
      best = box;
    }
  }
  if (best) return best;
  return usableGeminiBox(current?.bbox ?? current?.gemini_bbox ?? current?.geminiBbox);
}

/** crop_box がページ上部の共通図らしいか（表だけ補完したときに親を落とさない） */
export function looksLikeParentFigureBox(box, sub = null) {
  const p = usableGeminiBox(box);
  if (!p) return false;
  const h = p[2] - p[0];
  if (h < 90) return false;
  if (p[0] > 480) return false;
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
  if (!needsDataTableVisual(item)) return null;

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
export function resolveParentFigureBox(item) {
  const explicitSub = usableGeminiBox(item?.subFigureBox ?? item?.sub_figure_box);
  const explicit = usableGeminiBox(item?.parentFigureBox ?? item?.parent_figure_box);
  const crop =
    usableGeminiBox(item?.figureCropBox) ||
    usableGeminiBox(item?.crop_box) ||
    usableGeminiBox(item?.cropBoxGemini);
  const candidate =
    explicit || (looksLikeParentFigureBox(crop, explicitSub) ? crop : null);
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
  const subDonors = new Map();
  for (const [key, group] of byScan) {
    const parents = group
      .map((row) => {
        const explicit = usableGeminiBox(row.parentFigureBox ?? row.parent_figure_box);
        if (explicit) return explicit;
        const crop = usableGeminiBox(row.figureCropBox) || usableGeminiBox(row.crop_box);
        return looksLikeParentFigureBox(crop) ? crop : null;
      })
      .filter(Boolean);
    const subs = group
      .map((row) => usableGeminiBox(row.subFigureBox ?? row.sub_figure_box))
      .filter(Boolean);
    parentDonors.set(key, parents[0] ?? null);
    subDonors.set(key, subs[0] ?? null);
  }

  return list.map((problem) => {
    const key =
      String(problem?.originalPath || problem?.original_path || problem?.scanId || problem?.scan_id || "").trim() ||
      `solo:${String(problem?.id || problem?.problemId || "")}`;
    let parent = usableGeminiBox(problem.parentFigureBox ?? problem.parent_figure_box);
    let sub = usableGeminiBox(problem.subFigureBox ?? problem.sub_figure_box);
    const wantsTable = needsDataTableVisual(problem);
    const wantsParent = benefitsFromParentFigure(problem);
    const scanParent = parentDonors.get(key) ?? null;
    const scanSub = subDonors.get(key) ?? null;
    const crop =
      usableGeminiBox(problem.figureCropBox) ||
      usableGeminiBox(problem.crop_box) ||
      usableGeminiBox(problem.cropBoxGemini);

    if (!parent && looksLikeParentFigureBox(crop, sub || scanSub)) parent = crop;
    if (!parent && (wantsParent || wantsTable)) parent = scanParent;
    if (!sub && wantsTable) {
      sub =
        scanSub ??
        resolveSubFigureBox({
          ...problem,
          parentFigureBox: parent,
          parent_figure_box: parent,
        });
    }

    if (wantsTable && !parent && scanParent) parent = scanParent;
    if (wantsTable && !sub && scanSub) sub = scanSub;

    if (!wantsTable && !parent && !sub) return problem;

    return {
      ...problem,
      visualType: problem.visualType === "passage_based" ? problem.visualType : "has_figure",
      visual_type: problem.visual_type === "passage_based" ? problem.visual_type : "has_figure",
      parentFigureBox: parent ?? problem.parentFigureBox ?? null,
      parent_figure_box: parent ?? problem.parent_figure_box ?? null,
      subFigureBox: sub ?? problem.subFigureBox ?? null,
      sub_figure_box: sub ?? problem.sub_figure_box ?? null,
    };
  });
}
