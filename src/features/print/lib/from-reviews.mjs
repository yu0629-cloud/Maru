/** 採点・復習キューからお直しプリント用の不正解・空欄問題を集める */

import { figureCropBoxOf, figureDataSrcOf, figureImageSrcOf, inferVisualType, passageTextOf, contextTextOf, optionsTextOf } from "./visual.mjs";
import { normalizeOcrText } from "./ocr-text.mjs";
import { matchLeadingQuestionNumber, referencedPartTokens, resolveQuestionNumber } from "./question-number.mjs";
import { figureFamilyOf, sameFigureFamily } from "./figure-boxes.mjs";

export function isBlankPrintAnswer(item) {
  const status = String(item?.status ?? item?.answer_status ?? item?.answerStatus ?? "").toLowerCase();
  if (status === "unanswered" || status === "blank") return true;
  if (item?.mistake_type === "blank" || item?.mistakeType === "blank") return true;
  const answer =
    item?.studentAnswer ?? item?.student_answer ?? item?.user_answer ?? item?.userAnswer ?? "";
  return !String(answer ?? "").trim();
}

/** 間違えた問題と、手書きがない空欄・未回答を復習対象にする */
export function isIncorrectForPrint(item) {
  if (isBlankPrintAnswer(item)) return true;
  if (item?.isCorrect === true || item?.is_correct === true) return false;
  return true;
}

export function stripLatexDollars(text) {
  return String(text ?? "")
    .replace(/\$/g, "")
    .replace(/＄/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isQuestionNumberOnly(text) {
  const value = stripLatexDollars(text).normalize("NFKC");
  if (!value || looksLikePrintedStem(value)) return false;
  return /^(?:問|No\.?|#)?[\s(（]*[0-9０-９①-⑳㉑-㉟❶-❿]{1,3}[)）]?[.．、号番]?$/i.test(value);
}

export function displayQuestionText(text, label) {
  const value = normalizeOcrText(stripLatexDollars(text));
  if (!value || isQuestionNumberOnly(value)) return "";
  const index = stripLatexDollars(label);
  if (index && value === index) return "";
  return value;
}

export function displayTopicTag(unit, label) {
  const value = String(unit ?? "").trim();
  if (!value || isQuestionNumberOnly(value)) return "";
  const index = String(label ?? "").trim();
  if (index && value === index) return "";
  return value;
}

export function questionTextOf(item) {
  const candidates = [item?.questionText, item?.question_text, item?.prompt];
  for (const candidate of candidates) {
    const text = displayQuestionText(candidate, item?.label ?? item?.problem_label ?? item?.problem_index);
    if (text) return text;
  }
  for (const candidate of [item?.problemIndex, item?.problem_index, item?.problem_label, item?.label]) {
    const text = String(candidate ?? "").trim();
    if (looksLikePrintedStem(text)) return text;
  }
  return "";
}

function preferPageSource(item) {
  const local = String(item?.localUri || item?.local_uri || "").trim();
  const original = String(item?.originalImageSrc || item?.original_image_src || "").trim();
  const isPage = (uri) => Boolean(uri) && !uri.startsWith("data:image/") && !uri.startsWith("mock");
  if (isPage(local)) return local;
  if (isPage(original)) return original;
  return local || original || "";
}

export function printProblemFromReview(item) {
  const label = String(item?.label || item?.problemIndex || item?.problem_label || "問").trim() || "問";
  const expired = Boolean(item?.mediaExpired);
  const originalLocal = String(item?.localUri || item?.local_uri || "").trim();
  return {
    id: String(item?.problemId || item?.id || label),
    label,
    topicTag: item?.topicTag || item?.topic_tag || item?.unit || "",
    subject: item?.subject,
    problemType: item?.problemType || item?.problem_type,
    questionText: questionTextOf(item),
    problemIndex: item?.problemIndex || item?.problem_label || label,
    studentAnswer: item?.studentAnswer || item?.student_answer || "",
    correctAnswer: item?.correctAnswer || item?.correct_answer || "",
    parentCoachingTip: item?.parentCoachingTip || item?.parent_coaching_tip || "",
    bbox: item?.bbox ?? item?.gemini_bbox ?? item?.geminiBbox,
    cropBox: item?.cropBox || item?.bounding_box,
    visualType: inferVisualType(item),
    figureCropBox: figureCropBoxOf(item),
    parentFigureBox: item?.parentFigureBox ?? item?.parent_figure_box ?? null,
    subFigureBox: item?.subFigureBox ?? item?.sub_figure_box ?? null,
    // 採点時の切り抜き JPEG は印字に使わない。生スキャンから切り直す
    figureImageSrc: "",
    figureBase64: "",
    parentFigureSrc: "",
    parentFigureBase64: "",
    subFigureSrc: "",
    subFigureBase64: "",
    passageText: normalizeOcrText(passageTextOf(item)),
    contextText: normalizeOcrText(String(item?.contextText ?? item?.context_text ?? item?.parent_context ?? passageTextOf(item) ?? "").trim()),
    parentContext: normalizeOcrText(String(item?.parentContext ?? item?.parent_context ?? item?.contextText ?? item?.context_text ?? "").trim()),
    optionsText: normalizeOcrText(String(item?.optionsText ?? item?.options_text ?? "").trim()),
    blankedPath: expired ? "" : item?.blankedPath || "",
    croppedPath: expired ? "" : item?.croppedPath || "",
    originalPath: expired ? "" : item?.originalPath || "",
    scanId: item?.scanId ?? item?.scan_id ?? "",
    scan_id: item?.scanId ?? item?.scan_id ?? "",
    localUri: expired ? "" : originalLocal,
    imageSrc: expired ? "" : item?.blankedImageSrc || item?.croppedImageSrc || item?.imageSrc || "",
    blankedImageSrc: expired ? "" : item?.blankedImageSrc || "",
    croppedImageSrc: expired ? "" : item?.croppedImageSrc || "",
    originalImageSrc: expired ? "" : preferPageSource(item),
    isCorrect:
      item?.printRole === "prerequisite" || item?.isCorrect === true || item?.is_correct === true,
    printRole: item?.printRole || "review",
    isBlanked: Boolean(item?.isBlanked || item?.blankedImageSrc || item?.blankedPath || isBlankPrintAnswer(item)),
    mediaExpired: expired,
    printSource: item?.printSource || "review",
    createdAt: item?.createdAt || item?.created_at || null,
    reviewStage: item?.reviewStage ?? item?.review_stage ?? 0,
    mistakeCount: item?.mistakeCount ?? item?.mistake_count ?? item?.consecutiveMisses ?? 0,
    nextReviewAt: item?.nextReviewAt ?? item?.next_review_at ?? item?.nextReviewOn ?? null,
    isArchived: item?.isArchived === true || item?.is_archived === true || item?.status === "retired",
    status: item?.status,
  };
}

function scanProblemToReview(problem, scan, expired) {
  const label = String(problem.problem_label || `問${problem.problem_index ?? ""}`.trim() || "問");
  return printProblemFromReview({
    id: problem.id,
    problemId: problem.id,
    label,
    topicTag: problem.topic_tag,
    subject: problem.subject,
    problemType: problem.problem_type,
    questionText: problem.question_text || problem.questionText || "",
    prompt: problem.prompt,
    problemIndex: label,
    studentAnswer: problem.student_answer,
    correctAnswer: problem.correct_answer,
    parentCoachingTip: problem.parent_coaching_tip,
    bbox: problem.bbox ?? problem.gemini_bbox ?? problem.geminiBbox,
    cropBox: problem.bounding_box,
    visualType: problem.visual_type || problem.visualType,
    figureCropBox: problem.crop_box || problem.figureCropBox,
    parentFigureBox: problem.parent_figure_box || problem.parentFigureBox,
    subFigureBox: problem.sub_figure_box || problem.subFigureBox,
    figureImageSrc: "",
    figureBase64: "",
    passageText: problem.passage_text || problem.passageText,
    contextText: problem.context_text || problem.contextText || problem.parent_context,
    parentContext: problem.parent_context || problem.parentContext || problem.context_text,
    optionsText: problem.options_text || problem.optionsText,
    imageSrc: problem.imageSrc,
    localUri: scan.localUri,
    originalPath: scan.originalStoragePath,
    blankedPath: problem.blanked_storage_path,
    croppedPath: problem.cropped_storage_path,
    isCorrect: problem.is_correct ?? problem.isCorrect,
    mistake_type: problem.mistake_type,
    mediaExpired: expired,
    printSource: "scan",
    createdAt: scan.createdAt || scan.created_at || problem.created_at || null,
  });
}

function partTokenOf(problem) {
  const resolved = resolveQuestionNumber({
    questionText: problem?.questionText ?? problem?.question_text,
    label: problem?.label ?? problem?.problem_label ?? problem?.problemIndex ?? problem?.problem_index,
    problemLabel: problem?.problem_label,
    problemIndex: problem?.problemIndex ?? problem?.problem_index,
  });
  return String(resolved.sub || resolved.token || questionNumberToken(problem) || "").trim();
}

function samePrintUnit(a, b) {
  const ctxA = contextHaystack(a);
  const ctxB = contextHaystack(b);
  if (
    ctxA &&
    ctxB &&
    (ctxA === ctxB ||
      (ctxA.length >= 14 && ctxB.includes(ctxA)) ||
      (ctxB.length >= 14 && ctxA.includes(ctxB)))
  ) {
    return true;
  }
  const scanA = scanToken(a);
  const scanB = scanToken(b);
  return Boolean(scanA && scanA === scanB && figureFamilyOf(a) && sameFigureFamily(a, b));
}

export function printProblemsFromScans(scans, childId) {
  const out = [];
  for (const scan of scans ?? []) {
    if (childId && scan.childId !== childId) continue;
    const expired = Boolean(scan.originalPurgedAt && !scan.localUri && !scan.originalStoragePath);
    const rows = scan.problems ?? [];
    const printed = rows.map((problem) => scanProblemToReview(problem, scan, expired));
    const picked = new Map();
    for (let i = 0; i < printed.length; i++) {
      if (!isIncorrectForPrint(rows[i])) continue;
      const problem = printed[i];
      const refs = referencedPartTokens(`${problem.questionText} ${rows[i]?.question_text ?? ""}`);
      for (const token of refs) {
        const prev = printed.find((row) => partTokenOf(row) === token && samePrintUnit(row, problem));
        if (!prev || picked.has(prev.id)) continue;
        const role = isIncorrectForPrint(prev) ? "review" : "prerequisite";
        picked.set(prev.id, { ...prev, printRole: role, isCorrect: role === "prerequisite" });
      }
      if (!picked.has(problem.id)) {
        picked.set(problem.id, { ...problem, printRole: "review", isCorrect: false });
      }
    }
    out.push(...picked.values());
  }
  return out;
}

export function looksLikePrintedStem(text) {
  const value = stripLatexDollars(text);
  if (!value) return false;
  return /[0-9０-９].*[+\-×÷＋−*/=＝]/.test(value) || /[+\-×÷＋−*/=＝].*[0-9０-９]/.test(value);
}

export const DAILY_PRINT_MAX = 5;
export const RECOMMENDED_PRINT_MAX = 6;

export function hasPrintableQuestion(item) {
  if (questionTextOf(item)) return true;
  if (contextTextOf(item) || optionsTextOf(item) || passageTextOf(item)) return true;
  const visual = inferVisualType(item);
  if (visual === "has_figure" && (figureDataSrcOf(item) || figureImageSrcOf(item) || figureCropBoxOf(item))) return true;
  if (visual === "passage_based" && passageTextOf(item)) return true;
  const answer = stripLatexDollars(item?.correctAnswer ?? item?.correct_answer ?? "");
  return /[0-9０-９]+(?:\s*[+\-×÷＋−*/]\s*[0-9０-９]+)+/.test(answer);
}

function isDuePrintItem(item, today) {
  if (item?.isArchived === true || item?.is_archived === true || item?.status === "retired" || item?.status === "mastered") {
    return false;
  }
  const due = item?.nextReviewAt ?? item?.next_review_at ?? item?.nextReviewOn;
  return !due || String(due).slice(0, 10) <= today;
}

function todayIsoLocal(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function recommendedSort(problems, today) {
  return [...problems].sort((a, b) => {
    const missA = Number(a?.mistakeCount ?? a?.mistake_count ?? a?.consecutiveMisses ?? 0) || 0;
    const missB = Number(b?.mistakeCount ?? b?.mistake_count ?? b?.consecutiveMisses ?? 0) || 0;
    if (missB !== missA) return missB - missA;
    const dueA = String(a?.nextReviewAt ?? a?.next_review_at ?? a?.nextReviewOn ?? today);
    const dueB = String(b?.nextReviewAt ?? b?.next_review_at ?? b?.nextReviewOn ?? today);
    return dueA.localeCompare(dueB);
  });
}

export function selectProblemsForScope(problems, scope = "daily", preferredIds = []) {
  const printable = (problems ?? []).filter(hasPrintableQuestion);
  if (scope === "all") return printable;
  if (scope === "today") {
    const scans = printable.filter((item) => item?.printSource === "scan");
    return scans.length ? scans : printable;
  }
  if (scope === "recommended") {
    const today = todayIsoLocal();
    const due = printable.filter((item) => isDuePrintItem(item, today));
    return recommendedSort(due.length ? due : printable, today).slice(0, RECOMMENDED_PRINT_MAX);
  }
  const preferred = new Set((preferredIds ?? []).map((id) => String(id)));
  const first = printable.filter((item) => preferred.has(String(item.id)) || preferred.has(String(item.problemId)));
  const rest = printable.filter((item) => !preferred.has(String(item.id)) && !preferred.has(String(item.problemId)));
  return [...first, ...rest].slice(0, DAILY_PRINT_MAX);
}

function mergeKey(problem) {
  const id = String(problem?.id || problem?.problemId || "").trim();
  if (id) return `id:${id}`;
  return contentDedupeKey(problem);
}

function contextHaystack(problem) {
  return normalizeOcrText(
    String(problem?.parentContext || problem?.parent_context || problem?.contextText || problem?.context_text || ""),
  )
    .replace(/\s+/g, "")
    .normalize("NFKC");
}

function normalizedStem(problem) {
  const ctx = contextHaystack(problem);
  let rawQ = normalizeOcrText(
    String(problem?.questionText || problem?.question_text || problem?.stem || ""),
  )
    .replace(/\s+/g, "")
    .normalize("NFKC");
  if (ctx && rawQ.startsWith(ctx)) rawQ = rawQ.slice(ctx.length);
  if (ctx && ctx.length >= 12 && rawQ.includes(ctx)) rawQ = rawQ.split(ctx).join("");
  return rawQ
    .replace(/^(?:問|No\.?|#)?[\(（\[]?[0-9０-９①-⑳㉑-㉟❶-❿㋐-㋾]+[\)）\]]?[.．、:：\s]*/i, "")
    .replace(/次の[①-③0-9０-９〜~\-から選び、番号を書きましょう。]+$/u, "")
    .trim();
}

function toAsciiDigits(value) {
  return String(value ?? "").replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

function questionNumberToken(problem) {
  const resolved = resolveQuestionNumber({
    questionText: problem?.questionText ?? problem?.question_text,
    label: problem?.label ?? problem?.problem_label ?? problem?.problemIndex ?? problem?.problem_index,
    problemLabel: problem?.problem_label,
    problemIndex: problem?.problemIndex ?? problem?.problem_index,
  });
  if (resolved.token) return resolved.token;
  const stemHit = matchLeadingQuestionNumber(problem?.questionText || problem?.question_text || "");
  if (stemHit?.token) return stemHit.token;
  const raw = String(
    problem?.problemIndex || problem?.problem_index || problem?.label || problem?.problem_label || "",
  )
    .normalize("NFKC")
    .replace(/\s+/g, "");
  const pair = raw.match(/([0-9０-９]{1,2})[-−ー~～][\(（]?([0-9０-９]{1,2})/);
  if (pair) return `${toAsciiDigits(pair[1])}-${toAsciiDigits(pair[2])}`;
  const match = raw.match(/(?:問)?[\(（\[]?([0-9０-９]{1,2})[\)）\]]?/);
  if (!match) return "";
  return toAsciiDigits(match[1]);
}

function scanToken(problem) {
  const raw = String(problem?.originalPath || problem?.original_path || problem?.scanId || problem?.scan_id || "")
    .trim()
    .replace(/[?#].*$/, "");
  if (!raw) return "";
  return (raw.split(/[/\\]/).filter(Boolean).pop() || raw).toLowerCase();
}

/** 問題文＋大問文脈で同一小問を判定（番号表記ゆれを吸収） */
export function contentDedupeKey(problem) {
  const ctx = normalizeOcrText(
    String(problem?.parentContext || problem?.parent_context || problem?.contextText || problem?.context_text || ""),
  )
    .replace(/\s+/g, "")
    .normalize("NFKC")
    .slice(0, 96);
  let rawQ = normalizeOcrText(
    String(problem?.questionText || problem?.question_text || problem?.stem || ""),
  )
    .replace(/\s+/g, "")
    .normalize("NFKC");
  if (ctx && rawQ.startsWith(ctx)) rawQ = rawQ.slice(ctx.length);
  // リード文が question に混ざっている場合も落とす
  if (ctx && ctx.length >= 12 && rawQ.includes(ctx)) rawQ = rawQ.split(ctx).join("");
  const q = rawQ
    .replace(/^(?:問|No\.?|#)?[\(（\[]?[0-9０-９①-⑳㉑-㉟❶-❿㋐-㋾]+[\)）\]]?[.．、:：\s]*/i, "")
    .slice(0, 120);
  // 正解の表記ゆれで同一小問が二重に残るのを防ぐ（解答欄内容はキーに使わない）
  return `q:${ctx}|${q}`;
}

/** 文脈が空でも同一設問文なら同じ小問（正解の食い違いは無視） */
export function stemDedupeKey(problem) {
  const q = normalizedStem(problem).slice(0, 80);
  if (q.length < 18) return "";
  return `stem:${q}`;
}

/** 同一スキャンの同じ小問番号 */
export function scanNumberDedupeKey(problem) {
  const scan = scanToken(problem);
  const num = questionNumberToken(problem);
  if (!scan || !num) return "";
  return `sn:${scan}|${num}`;
}

/**
 * 同一小問の重複を除去。id 優先、なければ問題文＋親文脈。
 * 先勝ち（scans → extras → reviews の順を保つ）。
 */
export function dedupePrintProblems(problems) {
  const out = [];
  const seenId = new Set();
  const seenContent = new Set();
  for (const problem of problems ?? []) {
    if (!problem) continue;
    const id = String(problem.id || problem.problemId || "").trim();
    if (id) {
      if (seenId.has(id)) continue;
      seenId.add(id);
    }
    const keys = [contentDedupeKey(problem), stemDedupeKey(problem), scanNumberDedupeKey(problem)].filter(
      (key) => key && key !== "q:||",
    );
    if (keys.some((key) => seenContent.has(key))) continue;
    for (const key of keys) seenContent.add(key);
    out.push(problem);
  }
  return out;
}

function attachPrerequisitesFromPool(targets, pool) {
  const out = [...(targets ?? [])];
  const seen = new Set(out.map((row) => String(row.id)));
  for (const item of [...out]) {
    for (const token of referencedPartTokens(item.questionText)) {
      const prev = (pool ?? []).find((row) => partTokenOf(row) === token && samePrintUnit(row, item));
      if (!prev || seen.has(String(prev.id))) continue;
      const role = isIncorrectForPrint(prev) ? "review" : "prerequisite";
      seen.add(String(prev.id));
      const idx = out.findIndex((row) => row.id === item.id);
      out.splice(idx < 0 ? out.length : idx, 0, { ...prev, printRole: role, isCorrect: role === "prerequisite" });
    }
  }
  return out;
}

/**
 * 直前の採点（scans）を優先し、復習キューの不正解・空欄を足す。
 * question_text が無い／番号だけの残骸は入れない。
 */
export function collectPrintProblems(input = {}) {
  const childId = input.childId;
  const fromScans = printProblemsFromScans(input.scans, childId);
  const fromExtras = (input.extras ?? []).filter(isIncorrectForPrint).map(printProblemFromReview);
  const fromReviews = (input.reviews ?? [])
    .filter((item) => item?.status !== "mastered" && item?.status !== "retired" && item?.isArchived !== true && item?.is_archived !== true)
    .filter(isIncorrectForPrint)
    .map(printProblemFromReview);
  const merged = [];
  const seen = new Set();
  for (const problem of [...fromScans, ...fromExtras, ...fromReviews]) {
    if (!hasPrintableQuestion(problem)) continue;
    const key = mergeKey(problem);
    const extras = [contentDedupeKey(problem), stemDedupeKey(problem), scanNumberDedupeKey(problem)].filter(
      (item) => item && item !== "q:||",
    );
    if (seen.has(key) || extras.some((item) => seen.has(item))) continue;
    seen.add(key);
    for (const item of extras) seen.add(item);
    merged.push(problem);
  }
  const extraPool = (input.extras ?? []).map((item) =>
    printProblemFromReview({
      ...item,
      printRole: isIncorrectForPrint(item) ? "review" : "prerequisite",
    }),
  );
  const unique = attachPrerequisitesFromPool(dedupePrintProblems(merged), extraPool);
  const scope = input.scope ?? "all";
  if (scope === "today") {
    const todayOnly = dedupePrintProblems(fromScans.filter(hasPrintableQuestion));
    if (todayOnly.length) return todayOnly;
  }
  if (unique.length) {
    return selectProblemsForScope(unique, scope, input.preferredIds ?? []);
  }
  const fallback = dedupePrintProblems(
    (input.fallback ?? []).filter(isIncorrectForPrint).filter(hasPrintableQuestion),
  );
  return selectProblemsForScope(fallback, scope, input.preferredIds ?? []);
}
