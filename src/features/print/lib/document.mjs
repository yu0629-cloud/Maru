import {
  chooseAnswerStyle,
  problemsPerPage,
  styleToGridType,
  ANSWER_STYLE_LABELS,
  PROBLEM_TYPE_LABELS,
} from "./problem-types.mjs";
import { isIncorrectForPrint, isQuestionNumberOnly, stripLatexDollars, dedupePrintProblems } from "./from-reviews.mjs";
import { expandFigureGeminiBox, figureAnswerMasks, geminiBBoxToNormalizedBox, intersectNormalized, planExpandedFigureCrop, prepareParentFigureBox } from "./bbox.mjs";
import { normalizeOcrText } from "./ocr-text.mjs";
import { figureCropBoxOf, figureDataSrcOf, figureImageSrcOf, inferVisualType, parentContextOf, parentFigureBoxOf, parentFigureSrcOf, passageTextOf, contextTextOf, optionsTextOf, subFigureBoxOf, subFigureSrcOf } from "./visual.mjs";
import { needsDataTableVisual, resolveSubFigureBox, earliestStemBelowParent } from "./figure-boxes.mjs";
import {
  resolveQuestionNumber,
  stripLeadingQuestionNumber,
  formatSquareNumber,
  formatRoundNumber,
  matchLeadingQuestionNumber,
} from "./question-number.mjs";

export { chooseAnswerStyle, problemsPerPage, styleToGridType, ANSWER_STYLE_LABELS, PROBLEM_TYPE_LABELS };
export {
  resolveQuestionNumber,
  stripLeadingQuestionNumber,
  formatSquareNumber,
  formatRoundNumber,
  matchLeadingQuestionNumber,
} from "./question-number.mjs";
export {
  toClipItems,
  packClipRows,
  paginateClipRows,
  layoutKind,
  isIncorrectPrintProblem,
  estimateRowHeightMm,
} from "./clip-layout.mjs";
export {
  coerceGeminiBox,
  geminiBBoxToNormalizedBox,
  geminiBoxToPixelCrop,
  resolveCropBox,
  expandPrintCropBox,
  answerMaskBox,
  figureAnswerMasks,
  padNormalizedBox,
  shrinkCropExcludingAnswer,
  usableGeminiBox,
  expandFigureGeminiBox,
  planExpandedFigureCrop,
  prepareParentFigureBox,
  clipFigureBottomBeforeBelow,
  PARENT_FIGURE_YMAX,
  looksLikeTopParentFigure,
} from "./bbox.mjs";

export const WORKSHEET_PER_PAGE = 6;
export const PRINT_ROWS_PER_PAGE = 3;
/** 大問図カードを1シートに載せる小問数。溢れてページをまたがないよう分割する */
export const FIGURE_PARTS_PER_SHEET = 2;
/** A4 から左右余白 12mm を除いた本文幅・高さ */
export const A4_CONTENT_WIDTH_MM = 186;
export const A4_CONTENT_HEIGHT_MM = 273;

const DUMMY_QUESTION = /計算\s*\(\s*1\s*\)|計算ブロック|問計算|ブロック\d*|計算ドリル|^大問\s*\d+$|^漢字\s*\d+$|^読解\s*\d+$|^理科\s*\d+$|^適性検査$|^作図$|^文章題$|^計算$|^適性$/;

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function splitCalcExpressions(text) {
  const value = stripLatexDollars(text);
  if (!value) return [];
  const parts = value
    .split(/[,、]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const out = [];
  for (const part of parts) {
    const expr = extractMathExpression(part);
    if (expr) out.push(expr);
    else if (/[0-9０-９]/.test(part) && /[+\-×÷＋−＊/=＝]/.test(part)) out.push(part);
  }
  return out;
}

export function isRasterImage(src) {
  const value = String(src ?? "");
  if (!value) return false;
  if (value.startsWith("data:image/svg")) return false;
  return /^(https?:|file:|content:|ph:|data:image\/(png|jpe?g|webp))/i.test(value);
}

export function occupancyFromBox(gemini, options = {}) {
  const padded = expandFigureGeminiBox(gemini, undefined, options) ?? gemini;
  if (!padded) return { widthPct: 100, heightMm: 60 };
  const ymin = Math.min(padded[0], padded[2]);
  const xmin = Math.min(padded[1], padded[3]);
  const ymax = Math.max(padded[0], padded[2]);
  const xmax = Math.max(padded[1], padded[3]);
  const heightRatio = Math.min(1, Math.max(0.08, (ymax - ymin) / 1000));
  const widthRatio = Math.min(1, Math.max(0.2, (xmax - xmin) / 1000));
  const rawHeight = heightRatio * A4_CONTENT_HEIGHT_MM;
  const heightMm = options.asTable ? Math.min(rawHeight, 92) : Math.min(rawHeight, 68);
  return {
    widthPct: Math.round(widthRatio * 1000) / 10,
    heightMm: Math.round(heightMm * 10) / 10,
  };
}

/** crop_box の元ページ占有率を A4 本文サイズへ写す */
export function cropOccupancyOf(problem) {
  return occupancyFromBox(parentFigureBoxOf(problem) || figureCropBoxOf(problem) || subFigureBoxOf(problem));
}

export function calcExpressionsOf(item) {
  if (Array.isArray(item?.expressions) && item.expressions.length) {
    return item.expressions.map((part) => String(part).replace(/\$/g, "").trim()).filter(Boolean);
  }
  return splitCalcExpressions(item?.prompt ?? item?.questionText ?? "");
}

export function looksLikeMath(text) {
  const value = stripLatexDollars(text);
  if (!value) return false;
  return /[0-9０-９].*[+\-×÷＋−*/=＝]/.test(value) || /[+\-×÷＋−*/=＝].*[0-9０-９]/.test(value);
}

export function extractMathExpression(text) {
  const value = stripLatexDollars(text);
  const match = value.match(/[0-9０-９]+(?:\s*[+\-×÷＋−*/]\s*[0-9０-９]+)+/);
  return match ? match[0] : "";
}

export function extractQuestionText(item) {
  const candidates = [
    item?.questionText,
    item?.question_text,
    item?.prompt,
    item?.problemIndex,
    item?.problem_index,
    item?.problem_label,
    item?.label,
    item?.correctAnswer,
    item?.correct_answer,
    item?.modelText,
  ];
  for (const candidate of candidates) {
    const expr = extractMathExpression(candidate);
    if (expr) return expr;
  }
  for (const candidate of [
    item?.questionText,
    item?.question_text,
    item?.prompt,
    looksLikeMath(item?.label) ? item.label : "",
    looksLikeMath(item?.problemIndex) ? item.problemIndex : "",
    looksLikeMath(item?.problem_label) ? item.problem_label : "",
  ]) {
    const text = stripLatexDollars(candidate);
    if (!text || isQuestionNumberOnly(text) || DUMMY_QUESTION.test(text)) continue;
    return text;
  }
  return "";
}

export function formatMathExpression(text) {
  let value = String(text ?? "").replace(/\$/g, "").trim();
  value = stripLatexDollars(value);
  value = stripLeadingQuestionNumber(value);
  const expr = extractMathExpression(value) || value.replace(/\s*[＝=]\s*.*$/, "");
  value = expr.replace(/([0-9０-９)])\s*([+\-×÷＋−*/])\s*(?=[0-9０-９(])/g, "$1 $2 ");
  value = value.replace(/\s+/g, " ").trim();
  if (!value) return "";
  return /[＝=]\s*$/.test(value) ? value : `${value} =`;
}

export function formatProblemStem(text, numberOrLabel) {
  const raw = String(text ?? "").trim();
  const resolved = resolveQuestionNumber({
    questionText: raw,
    label: numberOrLabel,
  });
  const expr = extractMathExpression(resolved.body || raw);
  const body = expr
    ? formatMathExpression(expr)
    : stripLeadingQuestionNumber(resolved.body || raw);
  const label =
    resolved.label ||
    (numberOrLabel != null && String(numberOrLabel).trim()
      ? formatRoundNumber(numberOrLabel)
      : "");
  return [label, body].filter(Boolean).join(" ").trim();
}

function numberMarkup(itemOrPart) {
  const label = String(itemOrPart?.numberLabel ?? "").trim();
  if (!label) return "";
  const square = itemOrPart?.numberStyle === "square";
  const cls = square ? "num num-square" : "num";
  return `<span class="${cls}">${escapeHtml(label)}</span>`;
}

function worksheetKind(problem, text) {
  if (extractMathExpression(text) || looksLikeMath(text)) return "calc";
  const type = problem?.problemType ?? problem?.problem_type ?? "";
  if (type === "calc_block") return "calc";
  return "text";
}

function worksheetLayout(kind, stem, problem) {
  const type = problem?.problemType ?? problem?.problem_type ?? "";
  if (kind === "calc" || type === "kanji") return "compact";
  if (String(stem).length > 28) return "wide";
  if (type === "reading_passage" || type === "math_geometry_graph" || type === "integrated_essay") return "wide";
  return "compact";
}

function toWorksheetItem(problem, text, number, kind, extra = {}) {
  const cleaned = String(text ?? "").replace(/\$/g, "").trim();
  const resolved = resolveQuestionNumber({
    questionText: cleaned,
    question_text: problem?.questionText ?? problem?.question_text,
    prompt: problem?.prompt,
    problemLabel: problem?.problemLabel ?? problem?.problem_label,
    problem_label: problem?.problem_label,
    problemIndex: problem?.problemIndex ?? problem?.problem_index,
    problem_index: problem?.problem_index,
    label: problem?.label,
  });
  const expr = kind === "figure" || kind === "passage" ? "" : extractMathExpression(resolved.body || cleaned);
  const stem = expr
    ? formatMathExpression(expr)
    : stripLeadingQuestionNumber(resolved.body || cleaned).replace(/\$/g, "").trim();
  const context = String(extra.context ?? "").trim();
  const options = String(extra.options ?? "").trim();
  const figureSrc = extra.figureSrc ?? "";
  const occupancy = extra.occupancy ?? null;
  const layout =
    kind === "figure" || kind === "passage" || context || options || figureSrc
      ? "wide"
      : worksheetLayout(kind, stem, problem);
  const numberLabel = resolved.label || (number != null ? formatRoundNumber(number) : "");
  const numberStyle = resolved.label ? resolved.style : "round";
  return {
    id: `${problem?.id ?? "p"}-${resolved.token || number}`,
    number: resolved.token || number,
    numberLabel,
    numberStyle,
    kind,
    layout,
    stem,
    visualType: extra.visualType ?? inferVisualType(problem),
    figureSrc,
    passage: extra.passage ?? "",
    context,
    options,
    masks: extra.masks ?? [],
    occupancy,
    parentFigureSrc: extra.parentFigureSrc ?? "",
    subFigureSrc: extra.subFigureSrc ?? "",
    parentOccupancy: extra.parentOccupancy ?? occupancy,
    subOccupancy: extra.subOccupancy ?? null,
    subMasks: extra.subMasks ?? [],
    shareScan: extra.shareScan ?? "",
    shareCrop: extra.shareCrop ?? null,
  };
}

function scanShareId(problem) {
  const path = String(problem?.originalPath || problem?.original_path || "").trim();
  if (path) return path;
  const src = String(problem?.originalImageSrc || problem?.original_image_src || "").trim();
  if (!src) return "";
  return src.replace(/[?#].*$/, "");
}

function cropsEquivalent(a, b, minIou = 0.45) {
  try {
    const A = geminiBBoxToNormalizedBox(a);
    const B = geminiBBoxToNormalizedBox(b);
    const hit = intersectNormalized(A, B);
    if (!hit) return false;
    const inter = hit.width * hit.height;
    const union = A.width * A.height + B.width * B.height - inter;
    return union > 0 && inter / union >= minIou;
  } catch {
    return false;
  }
}

/** file / storage パス差を吸収して同一スキャン判定 */
export function normalizeShareScan(value) {
  const raw = String(value ?? "")
    .trim()
    .replace(/[?#].*$/, "");
  if (!raw) return "";
  const base = raw.split(/[/\\]/).filter(Boolean).pop() || raw;
  return base.replace(/\.(jpe?g|png|webp|heic)$/i, "").toLowerCase();
}

function normalizeFigureContext(value) {
  return normalizeOcrText(String(value ?? ""))
    .replace(/\s+/g, "")
    .normalize("NFKC");
}

function sameSharedFigure(a, b) {
  if (!a || !b || a.kind !== "figure" || b.kind !== "figure") return false;
  const scanA = normalizeShareScan(a.shareScan);
  const scanB = normalizeShareScan(b.shareScan);
  if (scanA && scanB && scanA !== scanB) return false;
  const ctxA = normalizeFigureContext(a.context);
  const ctxB = normalizeFigureContext(b.context);
  const sharedCtx =
    Boolean(ctxA && ctxB) &&
    (ctxA === ctxB ||
      (ctxA.length >= 14 && ctxB.includes(ctxA)) ||
      (ctxB.length >= 14 && ctxA.includes(ctxB)));
  // スキャンも文脈も無いときは座標が似ていても別大問（てことろうそくの取り違え防止）
  if (!scanA && !scanB && !sharedCtx) return false;
  if (scanA && scanA === scanB) {
    if (sharedCtx) return true;
    if (a.shareCrop && b.shareCrop) return cropsEquivalent(a.shareCrop, b.shareCrop, 0.25);
    return false;
  }
  return sharedCtx;
}

function partWantsDataTable(part, context = "") {
  return needsDataTableVisual({
    questionText: part?.stem,
    optionsText: part?.options,
    parentContext: context,
  });
}

function asFigurePart(item) {
  const wantsTable = partWantsDataTable(
    { stem: item.stem, options: item.options },
    item.context,
  );
  return {
    number: item.number,
    numberLabel: item.numberLabel || "",
    numberStyle: item.numberStyle || "round",
    stem: item.stem,
    options: item.options || "",
    subFigureSrc: wantsTable ? item.subFigureSrc || "" : "",
    subOccupancy: wantsTable ? item.subOccupancy ?? null : null,
    subMasks: wantsTable ? item.subMasks ?? [] : [],
  };
}

function figurePartKey(part) {
  const num = String(part?.numberLabel || part?.number || "")
    .replace(/\s+/g, "")
    .normalize("NFKC")
    .replace(/[()（）\[\]【】]/g, "");
  const stem = normalizeOcrText(String(part?.stem || ""))
    .replace(/\s+/g, "")
    .normalize("NFKC")
    .replace(/^(?:問|No\.?|#)?[\(（\[]?[0-9０-９①-⑳❶-❿㋐-㋾]+[\)）\]]?[.．、:：]*/i, "")
    .slice(0, 80);
  // 番号が取れれば番号優先（表記ゆれした同一小問を落とす）
  if (num && stem) return `${num}|${stem}`;
  if (stem) return `|${stem}`;
  return `${num}|`;
}

function pushUniqueFigurePart(parts, part) {
  const key = figurePartKey(part);
  if (!key || key === "|") {
    parts.push(part);
    return;
  }
  if (parts.some((row) => figurePartKey(row) === key)) return;
  parts.push(part);
}

/** 同じ大問の共通図は1つにまとめ、ユニークな小問だけを並べる */
export function mergeSharedFigureItems(items) {
  const out = [];
  for (const item of items ?? []) {
    const host = item.kind === "figure" ? out.find((row) => sameSharedFigure(row, item)) : null;
    if (host) {
      const parts = host.parts?.length ? [...host.parts] : [asFigurePart(host)];
      pushUniqueFigurePart(parts, asFigurePart(item));
      host.parts = parts;
      // 共有図はホスト側の最新切り抜きを優先（後勝ちで空上書きしない）
      if (item.parentFigureSrc && !host.parentFigureSrc) host.parentFigureSrc = item.parentFigureSrc;
      if (item.figureSrc && !host.figureSrc) host.figureSrc = item.figureSrc;
      // 表画像はホストに1つだけ保持（各小問へのフォールバック用）
      if (item.subFigureSrc && !host.subFigureSrc) {
        host.subFigureSrc = item.subFigureSrc;
        host.subOccupancy = item.subOccupancy ?? host.subOccupancy;
        host.subMasks = item.subMasks ?? host.subMasks;
      }
      if (!host.context && item.context) host.context = item.context;
      continue;
    }
    out.push({
      ...item,
      parts: item.kind === "figure" ? [asFigurePart(item)] : undefined,
    });
  }
  return out;
}

export function flattenWorksheetItems(problems) {
  const uniqueProblems = dedupePrintProblems(problems ?? []);
  const items = [];
  for (const problem of uniqueProblems) {
    if (!isIncorrectForPrint(problem)) continue;
    let visual = inferVisualType(problem);
    const subBoxEarly = resolveSubFigureBox(problem) ?? subFigureBoxOf(problem);
    const subSrcEarly = subFigureSrcOf(problem);
    if ((subSrcEarly || subBoxEarly || needsDataTableVisual(problem)) && visual === "text_only") {
      visual = "has_figure";
    }
    const figureSrc = figureDataSrcOf(problem) || (isRasterImage(figureImageSrcOf(problem)) ? figureImageSrcOf(problem) : "");
    const context = contextTextOf(problem) || (visual === "passage_based" ? passageTextOf(problem) : "");
    const options = optionsTextOf(problem);

    if (visual === "passage_based") {
      const question = extractQuestionText(problem);
      const body = context || passageTextOf(problem) || question;
      if (!body && !options && !question) continue;
      if (body && (isQuestionNumberOnly(body) || DUMMY_QUESTION.test(body)) && !question && !options) continue;
      items.push(
        toWorksheetItem(problem, question && question !== body ? question : "", items.length + 1, "passage", {
          visualType: visual,
          passage: body,
          context: body,
          options,
          figureSrc,
        }),
      );
      continue;
    }

    if (visual === "has_figure") {
      const question = extractQuestionText(problem);
      const parentSrc = parentFigureSrcOf(problem);
      const subSrc = subFigureSrcOf(problem);
      const figureSrc = parentSrc || subSrc || figureDataSrcOf(problem) || (isRasterImage(figureImageSrcOf(problem)) ? figureImageSrcOf(problem) : "");
      if (!figureSrc && !context && !options && (!question || isQuestionNumberOnly(question) || DUMMY_QUESTION.test(question))) {
        continue;
      }
      const subBox = resolveSubFigureBox(problem) ?? subFigureBoxOf(problem);
      const parentBox =
        prepareParentFigureBox(parentFigureBoxOf(problem), subBox) ??
        parentFigureBoxOf(problem);
      const answerBox =
        earliestStemBelowParent(uniqueProblems, parentBox || figureCropBoxOf(problem), problem) ??
        problem?.bbox ??
        problem?.gemini_bbox ??
        problem?.geminiBbox;
      const parentPlan = planExpandedFigureCrop(parentBox || figureCropBoxOf(problem), answerBox, {
        preserveExtent: true,
      });
      const subPlan = subBox
        ? planExpandedFigureCrop(subBox, null, {
            preserveExtent: true,
            clipBottomBeforeStem: false,
            asTable: true,
          })
        : { cropGemini: null, masks: [] };
      const parentMasks = parentSrc ? parentPlan.masks : [];
      const subMasks = subSrc ? subPlan.masks : [];
      items.push(
        toWorksheetItem(problem, question, items.length + 1, "figure", {
          visualType: visual,
          figureSrc: parentSrc || (subSrc ? "" : figureSrc),
          parentFigureSrc: parentSrc || (subSrc ? "" : figureSrc),
          subFigureSrc: subSrc,
          context: parentContextOf(problem) || context,
          options,
          masks: parentMasks,
          occupancy: occupancyFromBox(parentBox || figureCropBoxOf(problem)),
          parentOccupancy: occupancyFromBox(parentBox || figureCropBoxOf(problem)),
          subOccupancy: subBox ? occupancyFromBox(subBox, { asTable: true }) : null,
          subMasks,
          shareScan: scanShareId(problem),
          shareCrop: parentBox || figureCropBoxOf(problem),
        }),
      );
      continue;
    }

    const expressions = calcExpressionsOf(problem);
    if (expressions.length && !context && !options) {
      for (const expression of expressions) {
        if (isQuestionNumberOnly(expression)) continue;
        items.push(toWorksheetItem(problem, expression, items.length + 1, "calc"));
      }
      continue;
    }
    const text = extractQuestionText(problem);
    if (!text && !context && !options) continue;
    if (text && (isQuestionNumberOnly(text) || DUMMY_QUESTION.test(text)) && !context && !options) continue;
    items.push(
      toWorksheetItem(problem, text, items.length + 1, worksheetKind(problem, text), {
        context,
        options,
      }),
    );
  }
  return mergeSharedFigureItems(items);
}

export function packWorksheetRows(items) {
  const rows = [];
  let pending = null;
  for (const item of items ?? []) {
    if (item.layout === "wide") {
      if (pending) {
        rows.push([pending]);
        pending = null;
      }
      rows.push([item]);
      continue;
    }
    if (pending) {
      rows.push([pending, item]);
      pending = null;
    } else {
      pending = item;
    }
  }
  if (pending) rows.push([pending]);
  return rows;
}

/** 小問が多い大問は、図のあとに続く小問を次シートへ送る */
export function explodeFigureItemsForPages(items, maxParts = FIGURE_PARTS_PER_SHEET) {
  const size = Math.max(1, maxParts);
  const out = [];
  for (const item of items ?? []) {
    const parts = Array.isArray(item?.parts) ? item.parts : null;
    if (item?.kind !== "figure" || !parts || parts.length <= size) {
      out.push(item);
      continue;
    }
    out.push({ ...item, parts: parts.slice(0, size) });
    for (let i = size; i < parts.length; i += size) {
      out.push({
        ...item,
        id: `${item.id}-cont-${i}`,
        parentFigureSrc: "",
        figureSrc: "",
        context: "",
        occupancy: null,
        parentOccupancy: null,
        masks: [],
        parts: parts.slice(i, i + size),
      });
    }
  }
  return out;
}

export function paginateWorksheetRows(rows, maxRows = PRINT_ROWS_PER_PAGE) {
  const pages = [];
  const size = Math.max(1, maxRows);
  let bucket = [];
  for (const row of rows ?? []) {
    const sole = Array.isArray(row) && row.length === 1 ? row[0] : null;
    const figureCard = sole && sole.kind === "figure";
    // 2つ目以降の大問・続き小問は次ページ。先頭はヘッダーと同じページに残す
    if (figureCard && bucket.length > 0) {
      pages.push(bucket);
      bucket = [row];
      continue;
    }
    bucket.push(row);
    if (!figureCard && bucket.length >= size) {
      pages.push(bucket);
      bucket = [];
    }
  }
  if (bucket.length) pages.push(bucket);
  return pages;
}

export function paginateWorksheetItems(items, perPage = WORKSHEET_PER_PAGE) {
  const pages = [];
  const size = Math.max(1, perPage);
  const list = items ?? [];
  for (let i = 0; i < list.length; i += size) {
    pages.push(list.slice(i, i + size));
  }
  return pages.length ? pages : [[]];
}

export function paginateProblems(items, perPage) {
  return paginateWorksheetItems(items, perPage ?? WORKSHEET_PER_PAGE);
}

export function paginateWorksheet(items, perPage = WORKSHEET_PER_PAGE) {
  return paginateProblems(items, perPage);
}

export function paginateByStyle(items) {
  return paginateWorksheetRows(packWorksheetRows(flattenWorksheetItems(items)));
}

export const PRINT_CSS = `
@page { size: A4; margin: 12mm; }
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  background: #fff;
  color: #222;
  font-family: "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif;
}
.sheet {
  width: 100%;
  box-sizing: border-box;
  page-break-after: always;
  break-after: page;
}
.sheet:last-child,
.sheet.single {
  page-break-after: auto;
  break-after: auto;
}
/* ヘッダー直後で改ページされ、1枚目が空白になるのを防ぐ */
.sheet > header {
  break-after: avoid-page;
  page-break-after: avoid;
}
.sheet > .print-body {
  break-before: avoid-page;
  page-break-before: avoid;
}
.print-body > .item:first-child {
  break-before: avoid-page;
  page-break-before: avoid;
}
img {
  break-inside: avoid;
  page-break-inside: avoid;
}
.item-row {
  display: flex;
  flex-direction: row;
  gap: 10px;
  margin-bottom: 8px;
}
.item-row > .item {
  flex: 1 1 0;
  margin-bottom: 0;
  min-width: 0;
}
.item {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  border: 1.5px solid #d0d0d0;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
  background: #fff;
  box-sizing: border-box;
  min-height: 48px;
}
.item-compact {
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  page-break-inside: avoid;
  break-inside: avoid;
}
.item-head {
  font-size: 14px;
  line-height: 1.5;
  color: #222;
}
.item-head .num {
  font-size: 14px;
  font-weight: 400;
  color: #666;
  margin-right: 8px;
}
.item-stem .num {
  font-size: 14px;
  font-weight: 400;
  color: #666;
  margin-right: 8px;
}
.num-square {
  font-weight: 700;
  color: #222;
}
.item-context {
  font-size: 14px;
  font-weight: 400;
  line-height: 1.5;
  color: #333;
  white-space: pre-wrap;
}
.item-stem {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
  color: #222;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.item-options {
  font-size: 14px;
  font-weight: 400;
  line-height: 1.5;
  color: #222;
  white-space: pre-wrap;
}
.item-part {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
  page-break-inside: avoid;
  break-inside: avoid;
}
.item-stem,
.item-options,
.item-context {
  page-break-inside: avoid;
  break-inside: avoid;
}
.item-part + .item-part {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #eee;
}
.answer-box {
  flex: 0 0 auto;
  width: 60px;
  height: 35px;
  border: 2px solid #333;
  border-radius: 4px;
  box-sizing: border-box;
  background: #fff;
  margin-top: 2px;
}
.item-figure img,
.figure-media img {
  width: 100%;
  max-width: 100%;
  height: auto;
  object-fit: contain;
  object-position: top center;
  display: block;
  margin: 0 auto;
  page-break-inside: avoid;
  break-inside: avoid;
}
.figure-media {
  position: relative;
  width: min(var(--crop-w, 100%), 100%);
  max-width: 100%;
  margin: 0 auto;
  text-align: center;
  page-break-inside: avoid;
  break-inside: avoid;
}
.figure-media.parent-figure img {
  max-height: 68mm;
}
.figure-media.sub-figure {
  width: 100%;
}
.figure-media.sub-figure img {
  max-height: none;
}
/* 大問カード全体は小問のあいだで折り返してよい。図・表・小問は分割しない */
.item-figure {
  page-break-inside: auto;
  break-inside: auto;
  break-before: auto;
  page-break-before: auto;
}
.figure-media.parent-figure,
.figure-media.sub-figure {
  page-break-inside: avoid;
  break-inside: avoid;
}
.figure-mask {
  position: absolute;
  background: #fff;
  pointer-events: none;
}
.answer-frame {
  min-height: 20mm;
  border: 2px solid #333;
  border-radius: 6px;
  margin-top: 4px;
  background: #fff;
  box-sizing: border-box;
}
.passage-block {
  white-space: pre-wrap;
  border: 1px solid #ddd;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 14px;
  line-height: 1.5;
  color: #222;
  background: #fbfbfb;
}
`;

function sanitizeStem(text) {
  return normalizeOcrText(String(text ?? ""))
    .replace(/\$/g, "")
    .replace(/＄/g, "")
    .replace(/&#36;/gi, "")
    .replace(/&dollar;/gi, "")
    .trim();
}

/** 画像として出す表があるとき、壊れた Markdown 表テキストは出さない */
export function stripMarkdownTables(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const kept = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\|.*\|$/.test(trimmed)) continue;
    if (/^\|?[\s:\-|]+$/.test(trimmed) && trimmed.includes("-")) continue;
    if (/^[\s|:-]{3,}$/.test(trimmed)) continue;
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** 大問リード文が小問本文に重複しているときは小問側から除く */
export function stripRepeatedLead(stem, context) {
  const s = sanitizeStem(stem);
  const c = sanitizeStem(context);
  if (!s) return "";
  if (!c) return s;
  if (s === c) return "";
  if (s.startsWith(c)) {
    return s.slice(c.length).replace(/^[\s　、。：:]+/u, "").trim();
  }
  if (c.length >= 10 && s.includes(c)) {
    return s.split(c).join(" ").replace(/\s+/g, " ").trim();
  }
  return s;
}

function answerMarkup(kind, hasOptions) {
  if (kind === "figure" && !hasOptions) return `<div class="answer-frame">&nbsp;</div>`;
  return `<div style="display: flex; justify-content: flex-end;"><div class="answer-box">&nbsp;</div></div>`;
}

/** 親図と同じ bytes でも、占有領域が違えば表など別切り抜きとみなす */
function isDistinctSubFigure(parentSrc, subSrc, parentOcc, subOcc) {
  const parent = String(parentSrc ?? "").trim();
  const sub = String(subSrc ?? "").trim();
  if (!sub) return false;
  if (sub !== parent) return true;
  if (!subOcc || !Number.isFinite(subOcc.heightMm)) return false;
  if (!parentOcc || !Number.isFinite(parentOcc.heightMm)) return true;
  return (
    Math.abs(Number(subOcc.heightMm) - Number(parentOcc.heightMm)) > 0.5 ||
    Math.abs(Number(subOcc.widthPct) - Number(parentOcc.widthPct)) > 0.5
  );
}

function figureMediaHtml(rawSrc, occupancy, masks, variant = "") {
  const embed = String(rawSrc ?? "").startsWith("data:image/") ? String(rawSrc) : "";
  if (!embed) return "";
  const src = escapeHtml(embed);
  const maskHtml = (Array.isArray(masks) ? masks : [])
    .map((mask) => {
      const left = Number((Number(mask.x) * 100).toFixed(3));
      const top = Number((Number(mask.y) * 100).toFixed(3));
      const width = Number((Number(mask.width) * 100).toFixed(3));
      const height = Number((Number(mask.height) * 100).toFixed(3));
      if (![left, top, width, height].every((n) => Number.isFinite(n))) return "";
      return `<div class="figure-mask" style="left:${left}%;top:${top}%;width:${width}%;height:${height}%;"></div>`;
    })
    .join("");
  const occ =
    occupancy && Number.isFinite(occupancy.widthPct)
      ? `style="--crop-w:${Number(occupancy.widthPct)}%;--crop-h:${Number(occupancy.heightMm)}mm;"`
      : "";
  const variantClass = variant ? ` ${variant}` : "";
  return `<div class="figure-media${variantClass}" ${occ}>
    <img src="${src}" alt="" />
    ${maskHtml}
  </div>`;
}

function figurePartsOf(item) {
  if (Array.isArray(item.parts) && item.parts.length) return item.parts;
  return [
    {
      number: item.number,
      numberLabel: item.numberLabel || "",
      numberStyle: item.numberStyle || "round",
      stem: item.stem,
      options: item.options || "",
      subFigureSrc: item.subFigureSrc || "",
      subOccupancy: item.subOccupancy ?? null,
      subMasks: item.subMasks ?? [],
    },
  ];
}

function worksheetCell(item) {
  const rawContext = item.context || (item.kind === "passage" ? item.passage : "");
  const context = escapeHtml(sanitizeStem(rawContext)).replace(/\$/g, "").trim();
  const options = escapeHtml(sanitizeStem(item.options)).replace(/\$/g, "").trim();
  const stem = escapeHtml(
    stripLeadingQuestionNumber(stripRepeatedLead(item.stem, rawContext)),
  )
    .replace(/\$/g, "")
    .trim();
  const hasFigureSrc = Boolean(item.parentFigureSrc || item.figureSrc);
  const compact = item.layout === "compact" && !hasFigureSrc && !context && !options;
  const num = numberMarkup(item);
  if (compact) {
    return `<div class="item item-compact">
  <div class="item-stem">${num}${stem}</div>
  <div class="answer-box">&nbsp;</div>
</div>`;
  }
  if (item.kind === "figure") {
    const parts = figurePartsOf(item);
    const contextBlock = context ? `<div class="item-context">${context}</div>` : "";
    const parentSrc = String(item.parentFigureSrc || item.figureSrc || "").trim();
    const parentImage = figureMediaHtml(
      parentSrc,
      item.parentOccupancy || item.occupancy,
      item.masks,
      "parent-figure",
    );
    const parentOcc = item.parentOccupancy || item.occupancy;
    const shownSubs = new Set();
    const partsHtml = parts
      .map((part) => {
        const partStem = escapeHtml(
          stripLeadingQuestionNumber(stripRepeatedLead(part.stem, rawContext)),
        )
          .replace(/\$/g, "")
          .trim();
        const wantsTable = partWantsDataTable(part, rawContext);
        const subSrc = String(
          part.subFigureSrc || (wantsTable ? item.subFigureSrc : "") || "",
        ).trim();
        const subOcc = part.subOccupancy ?? (wantsTable ? item.subOccupancy : null);
        const subKey =
          subOcc && Number.isFinite(subOcc.heightMm)
            ? `occ:${Math.round(Number(subOcc.widthPct) * 10)}:${Math.round(Number(subOcc.heightMm) * 10)}`
            : subSrc
              ? `src:${subSrc.length}:${subSrc.slice(40, 88)}`
              : "";
        let subImage = "";
        // 親図の二重描画を避けつつ、表が必要な小問にだけ1回出す
        if (
          wantsTable &&
          isDistinctSubFigure(parentSrc, subSrc, parentOcc, subOcc) &&
          subKey &&
          !shownSubs.has(subKey)
        ) {
          shownSubs.add(subKey);
          subImage = figureMediaHtml(subSrc, subOcc, part.subMasks ?? item.subMasks, "sub-figure");
        }
        const rawOptions = stripMarkdownTables(part.options || "");
        const partOptions = escapeHtml(sanitizeStem(rawOptions)).replace(/\$/g, "").trim();
        const partNum = numberMarkup(part);
        const question = partStem && partStem !== context
          ? `<div class="item-stem">${partNum}${partStem}</div>`
          : `<div class="item-head">${partNum}</div>`;
        return `<div class="item-part">
  ${question}
  ${subImage}
  ${partOptions ? `<div class="item-options">${partOptions}</div>` : ""}
  ${answerMarkup("figure", Boolean(partOptions))}
</div>`;
      })
      .join("");
    return `<div class="item item-figure">
  ${contextBlock}
  ${parentImage}
  ${partsHtml}
</div>`;
  }
  const image = figureMediaHtml(
    item.parentFigureSrc || item.figureSrc,
    item.parentOccupancy || item.occupancy,
    item.masks,
  );
  const head = `<div class="item-head">${num}${context && item.kind !== "passage" ? `<span class="item-context">${context}</span>` : ""}</div>`;
  const passage = item.kind === "passage" && context
    ? `<div class="passage-block">${context}</div>`
    : "";
  const question = stem && stem !== context ? `<div class="item-stem">${stem}</div>` : "";
  const optionBlock = options ? `<div class="item-options">${options}</div>` : "";
  const kindClass = item.kind === "passage" ? "item-passage" : "";
  return `<div class="item ${kindClass}">
  ${head}
  ${passage}
  ${image}
  ${question}
  ${optionBlock}
  ${answerMarkup(item.kind, Boolean(options))}
</div>`;
}

function renderWorksheetRow(row) {
  if (!Array.isArray(row) || row.length === 0) return "";
  if (row.length === 1) return worksheetCell(row[0]);
  return `<div class="item-row">${row.map(worksheetCell).join("")}</div>`;
}

export function buildPrintHtml(input) {
  const childName = String(input.childName ?? "").trim();
  const dateLabel = String(input.dateLabel ?? "").trim();
  let items = flattenWorksheetItems(input.problems ?? []).map((item) => ({
    ...item,
    stem: sanitizeStem(item.stem),
    context: sanitizeStem(item.context),
    options: sanitizeStem(item.options),
    passage: sanitizeStem(item.passage),
  }));
  if (input.scope === "daily") items = items.slice(0, 5);
  const singlePage = input.scope !== "all";
  items = explodeFigureItemsForPages(items);
  const rows = packWorksheetRows(items);
  const pages = singlePage ? [rows] : paginateWorksheetRows(rows, PRINT_ROWS_PER_PAGE);
  const emptyBody = `<p style="padding: 48px 12px; text-align: center; font-size: 14px; color: #6b7280;">${escapeHtml(input.emptyLabel ?? "間違えた問題はまだありません。")}</p>`;
  const sheets = pages.map((pageRows, index) => {
    const total = Math.max(1, pages.length);
    const body = pageRows.length ? pageRows.map(renderWorksheetRow).join("") : emptyBody;
    const sheetClass = singlePage || pages.length === 1 ? "sheet single" : "sheet";
    return `
    <section class="${sheetClass}">
      <header style="border-bottom: 2px solid #c44738; padding-bottom: 6px; margin-bottom: 10px;">
        <div style="font-size: 10px; letter-spacing: 0.18em; color: #c44738; font-weight: 700;">${escapeHtml(input.brand ?? "MARU 家庭学習")}</div>
        <h1 style="font-size: 16px; margin: 2px 0 6px; font-weight: 700;">${escapeHtml(input.title ?? "今日のまとめプリント")}</h1>
        <div style="display: flex; justify-content: space-between; font-size: 12px; color: #222;">
          <span>${escapeHtml(input.nameLabel ?? `なまえ: ${childName || "—"}`)}</span>
          <span>${escapeHtml(dateLabel || "")}</span>
        </div>
      </header>
      <div class="print-body">${body}</div>
      <footer style="margin-top: 8px; text-align: center; font-size: 10px; color: #6b7280;">${index + 1}/${total}</footer>
    </section>`;
  }).join("");

  return `<!doctype html>
<html lang="${escapeHtml(input.htmlLang ?? "ja")}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(input.title ?? "MARU まとめプリント")}</title>
  <style>${PRINT_CSS}</style>
</head>
<body>
${sheets}
</body>
</html>`;
}
