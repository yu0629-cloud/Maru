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

/**
 * ページ下部の表領域を推定する。見出し行〜最終行が入る高さにする。
 * @returns {[number, number, number, number]}
 */
export function inferTableBoxBelow(parent) {
  const p = usableGeminiBox(parent);
  // 親図直下の小問は避けつつ、表全体（複数行）が入るよう上端を上げすぎない
  const floor = p ? clamp(Math.max(p[2] + 140, 640), 600, 780) : 680;
  const ymax = 978;
  if (ymax - floor < 90) {
    return [clamp(ymax - 180, 0, 1000), 40, ymax, 960];
  }
  return [floor, 40, ymax, 960];
}

/**
 * 小問固有の表・グラフ座標。明示箱 → 親より下の crop → 推定。
 * @returns {[number, number, number, number] | null}
 */
export function resolveSubFigureBox(item) {
  const explicit = usableGeminiBox(item?.subFigureBox ?? item?.sub_figure_box);
  if (explicit) return explicit;
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
    return crop;
  }
  // crop が表領域そのもの（ページ下）ならそれを使う
  if (crop && crop[0] >= 560 && (!parent || crop[0] >= parent[2] - 20)) {
    return crop;
  }
  return inferTableBoxBelow(parent);
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
    sub = inferTableBoxBelow(candidate);
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
    const key = String(problem?.originalPath || problem?.original_path || problem?.scanId || problem?.scan_id || "").trim() || "__solo__";
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
    const key = String(problem?.originalPath || problem?.original_path || problem?.scanId || problem?.scan_id || "").trim() || "__solo__";
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
