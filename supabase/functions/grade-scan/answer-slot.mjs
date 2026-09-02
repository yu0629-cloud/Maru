/** 手書き解答欄の bbox / 印刷文の誤読をサーバ側で落とす */

export const ANSWER_TYPES = ["handwritten_text", "circle_selection", "none"];

export function normalizeAnswerType(value, student = "") {
  const raw = String(value ?? "").trim();
  if (ANSWER_TYPES.includes(raw)) return raw;
  return String(student ?? "").trim() ? "handwritten_text" : "none";
}

export function isCircleSelection(value) {
  return normalizeAnswerType(value) === "circle_selection";
}

function parseGeminiBBox(value) {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const nums = value.map((n) => Number(n));
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const ymin = Math.min(1000, Math.max(0, nums[0]));
  const xmin = Math.min(1000, Math.max(0, nums[1]));
  const ymax = Math.min(1000, Math.max(0, nums[2]));
  const xmax = Math.min(1000, Math.max(0, nums[3]));
  const box = [
    Math.min(ymin, ymax),
    Math.min(xmin, xmax),
    Math.max(ymin, ymax),
    Math.max(xmin, xmax),
  ];
  if (box[2] <= box[0] || box[3] <= box[1]) return null;
  return box;
}

function stripAnswerNoise(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\s　]+/g, "")
    .replace(/[()（）【】\[\]「」『』]/g, "")
    .toLowerCase();
}

function boxSize(box) {
  return { h: box[2] - box[0], w: box[3] - box[1] };
}

function intersection(a, b) {
  const ymin = Math.max(a[0], b[0]);
  const xmin = Math.max(a[1], b[1]);
  const ymax = Math.min(a[2], b[2]);
  const xmax = Math.min(a[3], b[3]);
  if (ymax <= ymin || xmax <= xmin) return 0;
  return (ymax - ymin) * (xmax - xmin);
}

function area(box) {
  const { h, w } = boxSize(box);
  return Math.max(0, h) * Math.max(0, w);
}

export function boxIou(a, b) {
  const left = parseGeminiBBox(a);
  const right = parseGeminiBBox(b);
  if (!left || !right) return 0;
  const inter = intersection(left, right);
  const union = area(left) + area(right) - inter;
  return union > 0 ? inter / union : 0;
}

export function boxContainment(inner, outer) {
  const a = parseGeminiBBox(inner);
  const b = parseGeminiBBox(outer);
  if (!a || !b) return 0;
  const innerArea = area(a);
  if (innerArea <= 0) return 0;
  return intersection(a, b) / innerArea;
}

/** 図・表の上に置かれた箱（解答欄ではない） */
export function looksLikeFigureAnswerBBox(bbox, parentBox, subBox) {
  const box = parseGeminiBBox(bbox);
  if (!box) return false;
  const { h, w } = boxSize(box);
  if (w >= 180 && h >= 70) return true;
  if (w * h >= 80 * 220) return true;
  for (const fig of [parentBox, subBox]) {
    if (boxIou(box, fig) >= 0.15) return true;
    if (boxContainment(box, fig) >= 0.5) return true;
  }
  return false;
}

/** 1行の（ ）／＝右の解答欄らしい小さな箱 */
export function looksLikeHandwritingSlot(bbox) {
  const box = parseGeminiBBox(bbox);
  if (!box) return false;
  const { h, w } = boxSize(box);
  if (h <= 0 || w <= 0) return false;
  if (h > 90 || w > 420) return false;
  if (w * h > 70 * 380) return false;
  return true;
}

export function parseOptionBodies(optionsText) {
  const text = String(optionsText ?? "");
  if (!text) return [];
  const marks = [...text.matchAll(/[①-⑳]/g)];
  if (marks.length === 0) return [];
  const out = [];
  for (let i = 0; i < marks.length; i++) {
    const n = marks[i][0].charCodeAt(0) - "①".charCodeAt(0) + 1;
    const start = marks[i].index + marks[i][0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length;
    const body = text.slice(start, end).replace(/^[.\s：:、．]+/, "").trim();
    if (body) out.push({ n, body });
  }
  return out;
}

/** 印刷された選択肢本文を番号に戻す。手書きの番号はそのまま */
export function canonicalizeChoiceAnswer(answer, optionsText, answerType) {
  const raw = String(answer ?? "").trim();
  if (!raw) return raw;
  const bodies = parseOptionBodies(optionsText);
  if (bodies.length === 0) return raw;
  const ans = stripAnswerNoise(raw);
  if (/^[0-9①-⑳]+$/.test(ans)) return raw;
  if (isCircleSelection(answerType)) {
    const exact = bodies.filter((item) => stripAnswerNoise(item.body) === ans);
    return exact.length === 1 ? String(exact[0].n) : raw;
  }
  if (ans.length < 6) return raw;
  for (const item of bodies) {
    const body = stripAnswerNoise(item.body);
    if (!body || body.length < 6) continue;
    if (body === ans || body.includes(ans) || ans.includes(body)) return String(item.n);
  }
  return raw;
}

const PRINTED_FIGURE_LABEL = /気体採取器|ハンドル|集気びん|ねん土|すき間|ふた/;

export function looksLikePrintedFigureLabel(student) {
  return PRINTED_FIGURE_LABEL.test(String(student ?? "").normalize("NFKC"));
}

export function looksLikePrintedLabelAnswer(student, item = {}) {
  const ans = stripAnswerNoise(student);
  if (ans.length < 3 || /^[0-9①-⑳]+$/.test(ans)) return false;
  if (looksLikePrintedFigureLabel(student)) return true;
  const printed = [item.question_text, item.options_text, item.word_bank, item.context_text, item.passage_text]
    .filter(Boolean)
    .join("");
  const hay = stripAnswerNoise(printed);
  if (ans.length >= 4 && hay.includes(ans)) return true;
  const bodies = parseOptionBodies(item.options_text || item.word_bank || "");
  return bodies.some((row) => {
    const body = stripAnswerNoise(row.body);
    return body.length >= 6 && (body === ans || body.includes(ans) || ans.includes(body));
  });
}

/**
 * 図の印刷ラベル／選択肢本文を答案にした誤〇を落とす。
 * 計算の「=」右と、短い番号の正当な一致は触らない。
 */
export function applyHandwritingSlotGuards(item, isCorrect) {
  if (!isCorrect) return false;
  if (isCircleSelection(item.answer_type)) return isCorrect;
  if (/[=＝]/.test(String(item.question_text ?? ""))) return isCorrect;
  const printed = looksLikePrintedLabelAnswer(item.student_answer, item);
  if (!printed) return isCorrect;
  const onFigure = looksLikeFigureAnswerBBox(item.bbox, item.parent_figure_box, item.sub_figure_box);
  const copied =
    Boolean(stripAnswerNoise(item.student_answer)) &&
    stripAnswerNoise(item.student_answer) === stripAnswerNoise(item.ground_truth || item.correct_answer);
  if (onFigure || (copied && !looksLikeHandwritingSlot(item.bbox))) return false;
  return isCorrect;
}

/** 図に乗った bbox を、図の外側の1行解答欄へ寄せる（〇×の位置） */
export function snapBBoxToAnswerSlot(bbox, parentBox, subBox, answerType) {
  const box = parseGeminiBBox(bbox);
  if (!box) return bbox ?? null;
  if (isCircleSelection(answerType)) return box;
  const figure = parseGeminiBBox(parentBox) || parseGeminiBBox(subBox);
  if (!figure) return box;
  if (!looksLikeFigureAnswerBBox(box, parentBox, subBox)) return box;
  const cy = (box[0] + box[2]) / 2;
  const h = 36;
  const ymin = Math.max(0, Math.round(cy - h / 2));
  const ymax = Math.min(1000, ymin + h);
  if (figure[1] > 240) {
    const xmax = Math.max(80, Math.round(figure[1] - 12));
    const xmin = Math.max(40, xmax - 240);
    return [ymin, xmin, ymax, xmax];
  }
  if (figure[3] < 760) {
    const xmin = Math.min(920, Math.round(figure[3] + 12));
    const xmax = Math.min(980, xmin + 240);
    return [ymin, xmin, ymax, xmax];
  }
  return [ymin, 640, ymax, 920];
}
