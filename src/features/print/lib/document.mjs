import {
  chooseAnswerStyle,
  problemsPerPage,
  styleToGridType,
  ANSWER_STYLE_LABELS,
  PROBLEM_TYPE_LABELS,
} from "./problem-types.mjs";
import { isIncorrectForPrint, isQuestionNumberOnly, stripLatexDollars } from "./from-reviews.mjs";

export { chooseAnswerStyle, problemsPerPage, styleToGridType, ANSWER_STYLE_LABELS, PROBLEM_TYPE_LABELS };
export {
  toClipItems,
  packClipRows,
  paginateClipRows,
  layoutKind,
  isIncorrectPrintProblem,
  estimateRowHeightMm,
} from "./clip-layout.mjs";
export { geminiBBoxToNormalizedBox, resolveCropBox, expandPrintCropBox, answerMaskBox } from "./bbox.mjs";

export const WORKSHEET_PER_PAGE = 6;
export const PRINT_ROWS_PER_PAGE = 3;

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
  return /^(https?:|file:|content:|data:image\/(png|jpe?g|webp))/i.test(value);
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
  value = value.replace(/^\(\s*\d+\s*\)\s*/, "");
  const expr = extractMathExpression(value) || value.replace(/\s*[＝=]\s*.*$/, "");
  value = expr.replace(/([0-9０-９)])\s*([+\-×÷＋−*/])\s*(?=[0-9０-９(])/g, "$1 $2 ");
  value = value.replace(/\s+/g, " ").trim();
  if (!value) return "";
  return /[＝=]\s*$/.test(value) ? value : `${value} =`;
}

export function formatProblemStem(text, number) {
  const raw = String(text ?? "").trim();
  const expr = extractMathExpression(raw);
  const body = expr ? formatMathExpression(expr) : raw.replace(/^\(\s*\d+\s*\)\s*/, "");
  return `(${number}) ${body}`.trim();
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

function toWorksheetItem(problem, text, number, kind) {
  const cleaned = String(text ?? "").replace(/\$/g, "").trim();
  const expr = extractMathExpression(cleaned);
  const stem = expr ? formatMathExpression(expr) : cleaned.replace(/\$/g, "").trim();
  return {
    id: `${problem?.id ?? "p"}-${number}`,
    number,
    kind,
    layout: worksheetLayout(kind, stem, problem),
    stem,
  };
}

export function flattenWorksheetItems(problems) {
  const items = [];
  for (const problem of problems ?? []) {
    if (!isIncorrectForPrint(problem)) continue;
    const expressions = calcExpressionsOf(problem);
    if (expressions.length) {
      for (const expression of expressions) {
        if (isQuestionNumberOnly(expression)) continue;
        items.push(toWorksheetItem(problem, expression, items.length + 1, "calc"));
      }
      continue;
    }
    const text = extractQuestionText(problem);
    if (!text || isQuestionNumberOnly(text) || DUMMY_QUESTION.test(text)) continue;
    items.push(toWorksheetItem(problem, text, items.length + 1, worksheetKind(problem, text)));
  }
  return items;
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

export function paginateWorksheetRows(rows, maxRows = PRINT_ROWS_PER_PAGE) {
  const pages = [];
  const size = Math.max(1, maxRows);
  for (let i = 0; i < (rows ?? []).length; i += size) {
    pages.push(rows.slice(i, i + size));
  }
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
`;

function sanitizeStem(text) {
  return String(text ?? "")
    .replace(/\$/g, "")
    .replace(/＄/g, "")
    .replace(/&#36;/gi, "")
    .replace(/&dollar;/gi, "")
    .trim();
}

function worksheetCell(item) {
  const stem = escapeHtml(sanitizeStem(item.stem)).replace(/\$/g, "").trim();
  return `<div class="item" style="display: flex; flex-direction: row; align-items: center; justify-content: space-between; border: 1.5px solid #d0d0d0; border-radius: 8px; padding: 10px 14px; margin-bottom: 10px; background: #fff; box-sizing: border-box; min-height: 60px; page-break-inside: avoid;">
  <div style="display: flex; flex-direction: row; align-items: center; font-size: 22px; font-weight: bold; color: #222; white-space: nowrap;">
    <span style="font-size: 15px; color: #666; margin-right: 10px;">(${item.number})</span>
    <span>${stem}</span>
  </div>
  <div class="answer-box" style="width: 60px; height: 35px; border: 2px solid #333; display: inline-block; box-sizing: border-box;">&nbsp;</div>
</div>`;
}

export function buildPrintHtml(input) {
  const childName = String(input.childName ?? "").trim();
  const dateLabel = String(input.dateLabel ?? "").trim();
  let items = flattenWorksheetItems(input.problems ?? []).map((item) => ({
    ...item,
    stem: sanitizeStem(item.stem),
  }));
  if (input.scope === "daily") items = items.slice(0, 5);
  const singlePage = input.scope !== "all";
  const pages = singlePage ? [items] : paginateWorksheetItems(items, WORKSHEET_PER_PAGE);
  const sheets = pages.map((pageItems, index) => {
    const total = Math.max(1, pages.length);
    const body = pageItems.length
      ? pageItems.map(worksheetCell).join("")
      : `<p style="padding: 48px 12px; text-align: center; font-size: 14px; color: #6b7280;">${escapeHtml(input.emptyLabel ?? "間違えた問題はまだありません。")}</p>`;
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
      <div>${body}</div>
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
