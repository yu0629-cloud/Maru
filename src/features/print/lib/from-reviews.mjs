/** 採点・復習キューからお直しプリント用の不正解・空欄問題を集める */

import { figureCropBoxOf, figureDataSrcOf, figureImageSrcOf, inferVisualType, passageTextOf } from "./visual.mjs";

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
  const value = stripLatexDollars(text);
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

export function printProblemFromReview(item) {
  const label = String(item?.label || item?.problemIndex || item?.problem_label || "問").trim() || "問";
  const expired = Boolean(item?.mediaExpired);
  const originalLocal = String(item?.localUri || "").trim();
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
    bbox: item?.bbox,
    cropBox: item?.cropBox || item?.bounding_box,
    visualType: inferVisualType(item),
    figureCropBox: figureCropBoxOf(item),
    figureImageSrc: expired ? "" : figureImageSrcOf(item),
    figureBase64: expired ? "" : String(item?.figureBase64 ?? item?.figure_base64 ?? "").trim(),
    passageText: passageTextOf(item),
    blankedPath: expired ? "" : item?.blankedPath || "",
    croppedPath: expired ? "" : item?.croppedPath || "",
    originalPath: expired ? "" : item?.originalPath || "",
    imageSrc: expired ? "" : item?.blankedImageSrc || item?.croppedImageSrc || item?.imageSrc || "",
    blankedImageSrc: expired ? "" : item?.blankedImageSrc || "",
    croppedImageSrc: expired ? "" : item?.croppedImageSrc || "",
    originalImageSrc: expired ? "" : item?.originalImageSrc || originalLocal || "",
    isCorrect: false,
    isBlanked: Boolean(item?.isBlanked || item?.blankedImageSrc || item?.blankedPath || isBlankPrintAnswer(item)),
    mediaExpired: expired,
  };
}

export function printProblemsFromScans(scans, childId) {
  const out = [];
  for (const scan of scans ?? []) {
    if (childId && scan.childId && scan.childId !== childId) continue;
    const expired = Boolean(scan.originalPurgedAt && !scan.localUri && !scan.originalStoragePath);
    for (const problem of scan.problems ?? []) {
      if (!isIncorrectForPrint(problem)) continue;
      const label = String(problem.problem_label || `問${problem.problem_index ?? ""}`.trim() || "問");
      out.push(
        printProblemFromReview({
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
          bbox: problem.bbox,
          cropBox: problem.bounding_box,
          visualType: problem.visual_type || problem.visualType,
          figureCropBox: problem.crop_box || problem.figureCropBox,
          figureImageSrc: problem.figureImageSrc,
          figureBase64: problem.figureBase64,
          passageText: problem.passage_text || problem.passageText,
          imageSrc: problem.imageSrc,
          localUri: scan.localUri,
          originalPath: scan.originalStoragePath,
          blankedPath: problem.blanked_storage_path,
          croppedPath: problem.cropped_storage_path,
          isCorrect: false,
          mistake_type: problem.mistake_type,
          mediaExpired: expired,
        }),
      );
    }
  }
  return out;
}

export function looksLikePrintedStem(text) {
  const value = stripLatexDollars(text);
  if (!value) return false;
  return /[0-9０-９].*[+\-×÷＋−*/=＝]/.test(value) || /[+\-×÷＋−*/=＝].*[0-9０-９]/.test(value);
}

export const DAILY_PRINT_MAX = 5;

export function hasPrintableQuestion(item) {
  if (questionTextOf(item)) return true;
  const visual = inferVisualType(item);
  if (visual === "has_figure" && (figureDataSrcOf(item) || figureImageSrcOf(item) || figureCropBoxOf(item))) return true;
  if (visual === "passage_based" && passageTextOf(item)) return true;
  const answer = stripLatexDollars(item?.correctAnswer ?? item?.correct_answer ?? "");
  return /[0-9０-９]+(?:\s*[+\-×÷＋−*/]\s*[0-9０-９]+)+/.test(answer);
}

export function selectProblemsForScope(problems, scope = "daily", preferredIds = []) {
  const printable = (problems ?? []).filter(hasPrintableQuestion);
  if (scope === "all") return printable;
  const preferred = new Set((preferredIds ?? []).map((id) => String(id)));
  const first = printable.filter((item) => preferred.has(String(item.id)) || preferred.has(String(item.problemId)));
  const rest = printable.filter((item) => !preferred.has(String(item.id)) && !preferred.has(String(item.problemId)));
  return [...first, ...rest].slice(0, 5);
}

function mergeKey(problem) {
  return `${problem.label}|${problem.topicTag}|${problem.correctAnswer}|${problem.questionText}`;
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
    .filter((item) => item?.status !== "mastered" && item?.status !== "retired")
    .filter(isIncorrectForPrint)
    .map(printProblemFromReview);
  const merged = [];
  const seen = new Set();
  for (const problem of [...fromScans, ...fromExtras, ...fromReviews]) {
    if (!hasPrintableQuestion(problem)) continue;
    const key = mergeKey(problem);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(problem);
  }
  if (merged.length) {
    return selectProblemsForScope(merged, input.scope ?? "all", input.preferredIds ?? []);
  }
  const fallback = (input.fallback ?? []).filter(isIncorrectForPrint).filter(hasPrintableQuestion);
  return selectProblemsForScope(fallback, input.scope ?? "all", input.preferredIds ?? []);
}
