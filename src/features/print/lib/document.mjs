import {
  chooseAnswerStyle,
  problemsPerPage,
  styleToGridType,
  ANSWER_STYLE_LABELS,
  PROBLEM_TYPE_LABELS,
} from "./problem-types.mjs";
import { cssCropStyle, packClipRows, paginateClipRows, toClipItems } from "./clip-layout.mjs";

export { chooseAnswerStyle, problemsPerPage, styleToGridType, ANSWER_STYLE_LABELS, PROBLEM_TYPE_LABELS };
export {
  toClipItems,
  packClipRows,
  paginateClipRows,
  layoutKind,
  isIncorrectPrintProblem,
  estimateRowHeightMm,
} from "./clip-layout.mjs";
export { geminiBBoxToNormalizedBox, resolveCropBox } from "./bbox.mjs";

export const WORKSHEET_PER_PAGE = 16;

const DUMMY_QUESTION = /計算\s*\(\s*1\s*\)|計算ブロック|問計算|ブロック\d*|計算ドリル|^大問\s*\d+$|^漢字\s*\d+$|^読解\s*\d+$|^理科\s*\d+$|^適性検査$|^作図$|^文章題$|^計算$|^適性$/;

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function splitCalcExpressions(text) {
  return String(text ?? "")
    .split(/[\s,、　]+/)
    .map((part) => part.trim())
    .filter((part) => part && /[0-9０-９]/.test(part) && /[+\-×÷＋−＊/=＝]/.test(part));
}

export function isRasterImage(src) {
  const value = String(src ?? "");
  if (!value) return false;
  if (value.startsWith("data:image/svg")) return false;
  return /^(https?:|file:|content:|data:image\/(png|jpe?g|webp))/i.test(value);
}

export function calcExpressionsOf(item) {
  if (Array.isArray(item?.expressions) && item.expressions.length) {
    return item.expressions.map((part) => String(part).trim()).filter(Boolean);
  }
  return splitCalcExpressions(item?.prompt ?? item?.questionText ?? "");
}

export function looksLikeMath(text) {
  const value = String(text ?? "").trim();
  if (!value) return false;
  return /[0-9０-９].*[+\-×÷＋−*/=＝]/.test(value) || /^[0-9０-９+\-×÷＋−*/=＝\s()（）]+$/.test(value);
}

export function extractQuestionText(item) {
  const candidates = [
    item?.questionText,
    item?.question_text,
    item?.prompt,
    item?.problemIndex,
    item?.problem_index,
    looksLikeMath(item?.label) ? item.label : "",
  ];
  for (const candidate of candidates) {
    const text = String(candidate ?? "").trim();
    if (!text || DUMMY_QUESTION.test(text)) continue;
    return text;
  }
  return "";
}

export function formatMathExpression(text) {
  let value = String(text ?? "").trim();
  value = value.replace(/^\(\s*\d+\s*\)\s*/, "");
  value = value.replace(/\s*[＝=]\s*$/, "");
  value = value.replace(/([0-9０-９)])\s*([+\-×÷＋−*/])\s*(?=[0-9０-９(])/g, "$1 $2 ");
  value = value.replace(/\s+/g, " ").trim();
  return `${value} = `;
}

export function formatProblemStem(text, number) {
  const raw = String(text ?? "").trim();
  const body = looksLikeMath(raw) ? formatMathExpression(raw) : raw.replace(/^\(\s*\d+\s*\)\s*/, "");
  return `(${number}) ${body}`;
}

export function flattenWorksheetItems(problems) {
  const items = [];
  for (const problem of problems ?? []) {
    const expressions = calcExpressionsOf(problem);
    if (expressions.length) {
      for (const expression of expressions) {
        items.push({
          id: `${problem.id ?? "p"}-${items.length + 1}`,
          number: items.length + 1,
          kind: "calc",
          stem: formatProblemStem(expression, items.length + 1),
        });
      }
      continue;
    }
    const text = extractQuestionText(problem);
    if (!text) continue;
    items.push({
      id: `${problem.id ?? "p"}-${items.length + 1}`,
      number: items.length + 1,
      kind: looksLikeMath(text) ? "calc" : "text",
      stem: formatProblemStem(text, items.length + 1),
    });
  }
  return items;
}

export function paginateProblems(items, perPage) {
  const pages = [];
  const size = Math.min(WORKSHEET_PER_PAGE, Math.max(1, perPage ?? WORKSHEET_PER_PAGE));
  for (let i = 0; i < items.length; i += size) {
    pages.push(items.slice(i, i + size));
  }
  return pages;
}

export function paginateWorksheet(items, perPage = WORKSHEET_PER_PAGE) {
  return paginateProblems(items, perPage);
}

export function paginateByStyle(items) {
  return paginateWorksheet(flattenWorksheetItems(items));
}

export const PRINT_CSS = `
@page { size: A4 portrait; margin: 10mm; }
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  background: #ece7df;
  color: #1f2933;
  font-family: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif;
}
.sheet {
  width: 210mm;
  min-height: 297mm;
  height: 297mm;
  margin: 0 auto 8mm;
  padding: 10mm;
  background: #fff;
  display: flex;
  flex-direction: column;
  page-break-after: always;
  break-after: page;
}
.sheet:last-child { page-break-after: auto; break-after: auto; }
.sheet-head {
  border-bottom: 2px solid #c44738;
  padding-bottom: 6px;
  margin-bottom: 8px;
}
.brand { font-size: 10px; letter-spacing: 0.18em; color: #c44738; font-weight: 700; }
.title { font-size: 16px; margin: 2px 0 6px; font-weight: 700; }
.meta-print {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #1f2933;
}
.body { flex: 1; display: flex; flex-direction: column; gap: 6px; min-height: 0; }
.row {
  display: grid;
  gap: 8px;
  page-break-inside: avoid;
  break-inside: avoid;
}
.row.cols-1 { grid-template-columns: 1fr; }
.row.cols-2 { grid-template-columns: 1fr 1fr; }
.cell {
  border: 1px solid #e5ddd4;
  border-radius: 4px;
  padding: 5px;
  page-break-inside: avoid;
  break-inside: avoid;
}
.cell-no { font-size: 10px; color: #8a8178; margin-bottom: 3px; }
.crop {
  position: relative;
  overflow: hidden;
  background: #fbfaf6;
  width: 100%;
}
.crop img, .crop svg {
  display: block;
  width: 100%;
  height: auto;
}
.crop.css-crop img {
  position: absolute;
  max-width: none;
}
.mask {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 55%;
  background: #fff;
  box-shadow: inset 0 1px 0 #e8e0d6;
}
.mask-corner {
  position: absolute;
  top: 0;
  right: 0;
  width: 30%;
  height: 18%;
  background: #fff;
}
.foot {
  margin-top: 6px;
  text-align: center;
  font-size: 10px;
  color: #6b7280;
}
@media print {
  html, body { background: #fff; }
  .sheet { margin: 0; box-shadow: none; }
  .row, .cell { page-break-inside: avoid; break-inside: avoid; }
}
`;

function facsimileSvg(item) {
  const ar = item.cropBox.width / Math.max(item.cropBox.height, 0.01);
  const w = 800;
  const h = Math.max(140, Math.round(w / ar));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="xMidYMid meet">
    <rect width="${w}" height="${h}" fill="#fbfaf6"/>
    <rect x="10" y="10" width="${w - 20}" height="${h - 20}" fill="none" stroke="#e4dacd"/>
  </svg>`;
}

function cropInner(item) {
  const src = item.imageSrc || item.originalImageSrc;
  const raster = isRasterImage(src);
  if (item.cropMode === "css-crop" && raster) {
    const css = cssCropStyle(item.cropBox);
    return `<img alt="" src="${escapeHtml(src)}" style="width:${css.imgWidth};height:${css.imgHeight};left:${css.imgLeft};top:${css.imgTop};" />`;
  }
  if (raster) {
    return `<img alt="" src="${escapeHtml(src)}" />`;
  }
  return facsimileSvg(item);
}

function clipCell(item) {
  const css = cssCropStyle(item.cropBox);
  const cropClass = item.cropMode === "css-crop" && isRasterImage(item.imageSrc || item.originalImageSrc) ? "crop css-crop" : "crop";
  const mask = item.isBlanked
    ? ""
    : `<div class="mask"></div><div class="mask-corner"></div>`;
  return `<article class="cell">
    <div class="cell-no">(${item.number})</div>
    <div class="${cropClass}" style="aspect-ratio: ${css.aspect};">${cropInner(item)}${mask}</div>
  </article>`;
}

export function buildPrintHtml(input) {
  const childName = String(input.childName ?? "").trim();
  const dateLabel = String(input.dateLabel ?? "").trim();
  const items = toClipItems(input.problems ?? []);
  const pages = paginateClipRows(packClipRows(items));
  const sheets = (pages.length ? pages : [[]]).map((rows, index) => {
    const total = Math.max(1, pages.length);
    const body = rows
      .map((row) => `<div class="row cols-${row.length}">${row.map(clipCell).join("")}</div>`)
      .join("");
    return `
    <section class="sheet">
      <header class="sheet-head">
        <div class="brand">MARU 家庭学習</div>
        <h1 class="title">${escapeHtml(input.title ?? "今日のまとめプリント")}</h1>
        <div class="meta-print">
          <span>なまえ: ${escapeHtml(childName || "—")}</span>
          <span>${escapeHtml(dateLabel || "")}</span>
        </div>
      </header>
      <div class="body">${body}</div>
      <footer class="foot">${index + 1}/${total}</footer>
    </section>`;
  }).join("");

  return `<!doctype html>
<html lang="ja">
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
