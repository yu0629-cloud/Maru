import { resolveScanSubject } from "./subject.mjs";
import { inferVisualType } from "./visual.mjs";

export const GRADE_KINDS = ["math", "text"];

export const COACHING_TIP_MAX = 20;

const KIND_TIPS = {
  math: "位を揃えてもう一度",
  text: "表記を見直そう",
  blank: "空欄。まず1つ書こう",
};

const FULLWIDTH_OP = {
  "＋": "+",
  "－": "-",
  "−": "-",
  "×": "*",
  "÷": "/",
  "／": "/",
  "＊": "*",
  "＝": "=",
  "ｘ": "*",
  "x": "*",
  "X": "*",
  "・": "*",
};

export function isGradeKind(value) {
  return value === "math" || value === "text";
}

export function normalizeGradeKind(value) {
  if (value === "math") return "math";
  if (value === "text" || value === "short_text" || value === "free_text") return "text";
  return null;
}

export function inferGradeKind(input) {
  const hay = `${input.questionText ?? ""} ${input.problemIndex ?? ""} ${input.correctAnswer ?? ""}`;
  if (extractArithmeticExpression(hay)) return "math";
  return "text";
}

export function problemTypeFromKind(kind, questionText = "") {
  const hay = questionText;
  if (kind === "math") {
    if (/作図|グラフ|展開図|立体|角度|面積|体積|切断/.test(hay)) return "math_geometry_graph";
    return "calc_block";
  }
  if (/適性検査|作文|200字|400字|論述/.test(hay)) return "integrated_essay";
  if (/理科|社会|地図|実験|歴史|地理|公民|天気/.test(hay)) return "science_social_diagram";
  if (/漢字|部首|語句|送り仮名/.test(hay)) return "kanji";
  if (/説明|理由|なぜ|述べ|読解/.test(hay)) return "reading_passage";
  return "standard";
}

export function placeholderBBox(index, total) {
  const n = Math.max(total, 1);
  const h = 1000 / n;
  const ymin = Math.round(index * h);
  const ymax = Math.max(ymin + 12, Math.round((index + 1) * h));
  return [ymin, 40, Math.min(1000, ymax), 960];
}

/** Gemini bbox [ymin,xmin,ymax,xmax] 0〜1000。不正なら null */
export function parseGeminiBBox(value) {
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

export function coerceGeminiBBox(value, index, total) {
  return parseGeminiBBox(value) ?? placeholderBBox(index, total);
}

export function normalizeShortText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[ぁ-ゖ]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60))
    .replace(/[\s　]+/g, "")
    .replace(/[ー−‐]/g, "-")
    .toLowerCase();
}

export function parseNumberToken(value) {
  const text = normalizeShortText(value).replace(/,/g, "");
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

function stripAnswerNoise(value) {
  return normalizeShortText(value)
    .replace(/[°度]/g, "")
    .replace(/[()（）【】\[\]「」『』]/g, "");
}

export function splitAnswerItems(text) {
  const raw = String(text ?? "").normalize("NFKC").trim();
  if (!raw) return [];
  const parts = raw
    .split(/\s*(?:,|、|，|\/|／|&|および)\s*/)
    .map((part) => stripAnswerNoise(part))
    .filter(Boolean);
  return parts.length ? parts : [];
}

/** ground_truth と手書きを厳密比較。一部選択は不正解。°/度は同一視 */
export function answersMatchStrict(studentAnswer, groundTruth) {
  const studentRaw = String(studentAnswer ?? "").trim();
  const truthRaw = String(groundTruth ?? "").trim();
  if (!studentRaw || !truthRaw) return false;
  if (stripAnswerNoise(studentRaw) === stripAnswerNoise(truthRaw)) return true;
  const truthItems = splitAnswerItems(truthRaw);
  const studentItems = splitAnswerItems(studentRaw);
  if (truthItems.length === 0) return false;
  if (truthItems.length > 1) {
    const studentSet = new Set(studentItems);
    if (truthItems.some((item) => !studentSet.has(item))) return false;
    if (studentItems.length !== truthItems.length) return false;
    return true;
  }
  const studentNum = parseNumberToken(studentRaw);
  const truthNum = parseNumberToken(truthRaw);
  if (studentNum !== null && truthNum !== null) {
    const studentRest = stripAnswerNoise(studentRaw).replace(/-?\d+(?:\.\d+)?/g, "");
    const truthRest = stripAnswerNoise(truthRaw).replace(/-?\d+(?:\.\d+)?/g, "");
    if (studentRest && truthRest && studentRest !== truthRest) return false;
    return numbersEqual(studentNum, truthNum);
  }
  return false;
}

export function looksLikeSelectAll(text) {
  return /すべて選|すべてえら|全部選|該当するものをすべて/.test(String(text ?? ""));
}

export function optionCountHint(text) {
  const circled = String(text ?? "").match(/[①-⑳]/g);
  if (circled && new Set(circled).size >= 3) return new Set(circled).size;
  if (/①\s*[〜~～\-ーからと]\s*③|[1１]\s*[〜~～\-ー]\s*[3３]|①〜③|[1１]〜[3３]/.test(String(text ?? ""))) return 3;
  return 0;
}

export function splitOptionNumbers(answer) {
  const text = String(answer ?? "");
  const circled = [...text.matchAll(/[①-⑳]/g)].map((match) => match[0].charCodeAt(0) - "①".charCodeAt(0) + 1);
  const digits = [...text.matchAll(/[1-9１-９]/g)].map((match) => Number(match[0].normalize("NFKC")));
  return [...new Set([...circled, ...digits])].sort((a, b) => a - b);
}

export function findSupplementaryDegreePair(text) {
  const nums = [...String(text ?? "").matchAll(/(\d+)\s*(?:°|度)/g)].map((match) => Number(match[1]));
  const uniq = [...new Set(nums)].filter((n) => n > 0 && n < 180);
  for (let i = 0; i < uniq.length; i++) {
    for (let j = i + 1; j < uniq.length; j++) {
      if (uniq[i] + uniq[j] === 180) {
        return [Math.min(uniq[i], uniq[j]), Math.max(uniq[i], uniq[j])];
      }
    }
  }
  return null;
}

function answersLookCopied(student, ground) {
  return stripAnswerNoise(student) === stripAnswerNoise(ground) && Boolean(stripAnswerNoise(student));
}

/**
 * Gemini が手書きを ground_truth にコピーしたときの誤〇を落とす。
 * - すべて選び + 3択以上なのに答えが1つだけ、かつ key が答案と同じ
 * - 語群に補角ペア（50°と130°など）があり、答案＝コピーされた key なら鋭角側を採用
 */
export function applyCopiedAnswerGuards(item, isCorrect, pageHay = "") {
  const ground = item.ground_truth || item.correct_answer;
  const hay = [item.question_text, item.topic, item.passage_text, item.context_text, item.options_text, item.word_bank, ground, pageHay]
    .filter(Boolean)
    .join(" ");
  const copied = answersLookCopied(item.student_answer, ground);

  if (looksLikeSelectAll(hay) && optionCountHint(hay) >= 3) {
    const studentOpts = splitOptionNumbers(item.student_answer);
    const truthOpts = splitOptionNumbers(ground);
    if (studentOpts.length === 1 && (copied || truthOpts.length <= 1)) {
      return false;
    }
  }

  const pair = findSupplementaryDegreePair(hay);
  const studentDeg = parseNumberToken(item.student_answer);
  if (pair && studentDeg !== null && (studentDeg === pair[0] || studentDeg === pair[1])) {
    const groundDeg = parseNumberToken(ground);
    if (copied || groundDeg === null || groundDeg === studentDeg) {
      const expected = /鈍角/.test(hay) ? pair[1] : pair[0];
      return numbersEqual(studentDeg, expected);
    }
  }

  return isCorrect;
}

export function numbersEqual(a, b) {
  if (a === b) return true;
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

function replaceOps(text) {
  return String(text ?? "").replace(/[＋－−×÷／＊＝ｘxX・]/g, (char) => FULLWIDTH_OP[char] ?? char);
}

export function extractArithmeticExpression(text) {
  const replaced = replaceOps(text).replace(/[□■◯○?？_＿]/g, "");
  const candidates = replaced.match(/-?\d+(?:\.\d+)?(?:\s*[+\-*/()]\s*-?\d+(?:\.\d+)?)+/g);
  if (!candidates || candidates.length === 0) return null;
  const raw = candidates[candidates.length - 1];
  if (/余|あまり/.test(text)) return null;
  return raw.replace(/\s+/g, "");
}

export function evaluateArithmetic(expr) {
  const s = String(expr ?? "").replace(/\s+/g, "");
  if (!s || !/^[\d.+\-*/()]+$/.test(s)) return null;
  let i = 0;
  const peek = () => s[i] ?? "";
  function parseNumber() {
    const start = i;
    while (/\d|\./.test(peek())) i += 1;
    if (start === i) throw new Error("num");
    const n = Number(s.slice(start, i));
    if (!Number.isFinite(n)) throw new Error("nan");
    return n;
  }
  function parseFactor() {
    if (peek() === "+") {
      i += 1;
      return parseFactor();
    }
    if (peek() === "-") {
      i += 1;
      return -parseFactor();
    }
    if (peek() === "(") {
      i += 1;
      const value = parseExpr();
      if (peek() !== ")") throw new Error("paren");
      i += 1;
      return value;
    }
    return parseNumber();
  }
  function parseTerm() {
    let left = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const op = s[i];
      i += 1;
      const right = parseFactor();
      if (op === "/" && right === 0) throw new Error("div0");
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }
  function parseExpr() {
    let left = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = s[i];
      i += 1;
      const right = parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }
  try {
    const value = parseExpr();
    if (i !== s.length) return null;
    return value;
  } catch {
    return null;
  }
}

export function expectedMathValue(questionText, problemIndex, correctAnswer) {
  const expr =
    extractArithmeticExpression(questionText) ??
    extractArithmeticExpression(problemIndex) ??
    extractArithmeticExpression(String(questionText).split("=")[0] ?? "");
  if (expr) {
    const computed = evaluateArithmetic(expr);
    if (computed !== null) return computed;
  }
  return parseNumberToken(correctAnswer);
}

export function gradeMath(input) {
  const studentRaw = String(input.studentAnswer ?? "").trim();
  if (!studentRaw) return false;
  if (normalizeShortText(studentRaw) === normalizeShortText(input.correctAnswer)) return true;
  const student = parseNumberToken(input.studentAnswer);
  if (student === null) {
    return false;
  }
  const expected = expectedMathValue(input.questionText, input.problemIndex, input.correctAnswer);
  if (expected === null) {
    const correctNum = parseNumberToken(input.correctAnswer);
    if (correctNum === null) {
      return normalizeShortText(input.studentAnswer) === normalizeShortText(input.correctAnswer);
    }
    return numbersEqual(student, correctNum);
  }
  return numbersEqual(student, expected);
}

export function gradeShortText(studentAnswer, correctAnswer) {
  if (!String(studentAnswer ?? "").trim()) return false;
  return normalizeShortText(studentAnswer) === normalizeShortText(correctAnswer);
}

function tokens(text) {
  return normalizeShortText(text).match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}a-z0-9]+/gu) ?? [];
}

export function gradeFreeText(studentAnswer, correctAnswer, geminiCorrect) {
  if (typeof geminiCorrect === "boolean") return geminiCorrect;
  if (!String(studentAnswer ?? "").trim()) return false;
  if (!String(correctAnswer ?? "").trim()) return false;
  const a = normalizeShortText(studentAnswer);
  const b = normalizeShortText(correctAnswer);
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const studentTokens = new Set(tokens(studentAnswer));
  const correctTokens = tokens(correctAnswer);
  if (correctTokens.length === 0) return false;
  const hit = correctTokens.filter((token) => studentTokens.has(token)).length;
  return hit / correctTokens.length >= 0.55;
}

export function gradeText(studentAnswer, correctAnswer) {
  if (gradeShortText(studentAnswer, correctAnswer)) return true;
  return gradeFreeText(studentAnswer, correctAnswer);
}

export function templateTip(kind, isCorrect, studentAnswer) {
  if (isCorrect) return "";
  if (!String(studentAnswer ?? "").trim()) return KIND_TIPS.blank;
  return (KIND_TIPS[kind] ?? KIND_TIPS.text).slice(0, COACHING_TIP_MAX);
}

function looksLikePrintedFormula(text) {
  const value = String(text ?? "").trim();
  if (!value) return false;
  return /[0-9０-９].*[+\-×÷＋−*/=＝]/.test(value) || /[+\-×÷＋−*/=＝].*[0-9０-９]/.test(value);
}

/** 「16」「⑯」「問16」など、問題番号だけ（数式ではない） */
export function isQuestionNumberOnly(text) {
  const value = String(text ?? "")
    .trim()
    .normalize("NFKC");
  if (!value || looksLikePrintedFormula(value)) return false;
  return /^(?:問|No\.?|#)?[\s(（]*[0-9０-９①-⑳㉑-㉟❶-❿]{1,3}[)）]?[.．、号番]?$/i.test(value);
}

export function extractProblemList(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("EXTRACT_NOT_OBJECT");
  }
  const problems = raw.problems ?? raw.questions;
  if (!Array.isArray(problems) || problems.length === 0) {
    throw new Error("EXTRACT_PROBLEMS_REQUIRED");
  }
  return problems;
}

export function parseExtractProblems(raw) {
  const problems = extractProblemList(raw);
  return problems.map((item, index) => {
    const row = item && typeof item === "object" && !Array.isArray(item) ? item : {};
    const unitRaw = row.question_unit && typeof row.question_unit === "object" && !Array.isArray(row.question_unit)
      ? row.question_unit
      : {};
    const contextText = String(
      unitRaw.parent_context ?? unitRaw.context_text ?? row.parent_context ?? row.context_text ?? row.passage_text ?? row.passageText ?? "",
    ).trim();
    const optionsText = String(unitRaw.options_text ?? row.options_text ?? row.word_bank ?? row.wordBank ?? "").trim();
    const rawPrinted = String(
      unitRaw.question_text ?? row.question_text ?? row.questionText ?? row.prompt ?? "",
    ).trim();
    const printedIsIndex = isQuestionNumberOnly(rawPrinted);
    const printed = printedIsIndex ? "" : rawPrinted;
    const numberLike = String(
      row.problem_index ?? row.problem_number ?? row.question_number ?? (printedIsIndex ? rawPrinted : ""),
    ).trim();
    const formulaInIndex = looksLikePrintedFormula(numberLike);
    const problemIndex =
      formulaInIndex && !printed ? String(index + 1) : numberLike || `問${index + 1}`;
    const questionText = printed || (formulaInIndex ? numberLike : "");
    const studentAnswer = String(row.student_answer ?? row.user_answer ?? row.userAnswer ?? "").trim();
    const groundTruth = String(row.ground_truth ?? row.groundTruth ?? "").trim();
    const correctAnswer = groundTruth || String(row.correct_answer ?? "").trim();
    const topic = String(row.topic ?? row.topic_tag ?? "").trim();
    const kind =
      normalizeGradeKind(row.type) ??
      inferGradeKind({ questionText, problemIndex, correctAnswer });
    return {
      problem_index: problemIndex,
      question_text: questionText,
      student_answer: studentAnswer,
      correct_answer: correctAnswer,
      ground_truth: groundTruth || correctAnswer,
      type: kind,
      topic,
      bbox: parseGeminiBBox(row.bbox),
      visual_type: inferVisualType({
        visual_type: row.visual_type ?? row.visualType,
        question_text: questionText,
        topic,
        parent_context: contextText,
        options_text: optionsText,
      }),
      crop_box: parseGeminiBBox(unitRaw.crop_box ?? row.crop_box ?? row.cropBox) || parseGeminiBBox(unitRaw.parent_figure_box ?? row.parent_figure_box) || parseGeminiBBox(unitRaw.sub_figure_box ?? row.sub_figure_box),
      parent_figure_box: parseGeminiBBox(unitRaw.parent_figure_box ?? row.parent_figure_box),
      sub_figure_box: parseGeminiBBox(unitRaw.sub_figure_box ?? row.sub_figure_box),
      passage_text: contextText,
      context_text: contextText,
      options_text: optionsText,
      word_bank: optionsText,
    };
  });
}

export function gradeExtractedProblems(extracted, subjectHint) {
  const total = extracted.length;
  const pageHay = extracted
    .map((item) => [item.question_text, item.topic, item.word_bank, item.options_text, item.context_text].filter(Boolean).join(" "))
    .join(" ");
  const problems = extracted.map((item, index) => {
    const ground = item.ground_truth || item.correct_answer;
    const hasFormula = Boolean(
      extractArithmeticExpression(item.question_text) || extractArithmeticExpression(item.problem_index),
    );
    const rawCorrect =
      item.type === "math" && hasFormula
        ? gradeMath({
            questionText: item.question_text,
            problemIndex: item.problem_index,
            studentAnswer: item.student_answer,
            correctAnswer: ground,
          })
        : answersMatchStrict(item.student_answer, ground);
    const isCorrect = applyCopiedAnswerGuards(item, rawCorrect, pageHay);

    const blank = !item.student_answer;
    const problemType = problemTypeFromKind(item.type, `${item.question_text} ${item.problem_index}`);
    const expected =
      item.type === "math"
        ? expectedMathValue(item.question_text, item.problem_index, ground)
        : null;

    return {
      problem_index: item.problem_index,
      question_text: item.question_text,
      bbox: coerceGeminiBBox(item.bbox, index, total),
      is_correct: isCorrect,
      student_answer: item.student_answer,
      correct_answer:
        expected !== null && item.type === "math" && hasFormula ? String(expected) : ground,
      ground_truth: ground,
      topic_tag: (
        item.topic ||
        (item.question_text && !isQuestionNumberOnly(item.question_text) ? item.question_text : "") ||
        "未分類"
      ).slice(0, 40),
      difficulty_level: "standard",
      mistake_type: isCorrect ? "none" : blank ? "blank" : item.type === "math" ? "careless" : "concept_gap",
      parent_coaching_tip: templateTip(item.type, isCorrect, item.student_answer),
      needs_inpaint: !isCorrect && !blank,
      problem_type: problemType,
      visual_type: inferVisualType({
        visual_type: item.visual_type,
        problem_type: problemType,
        question_text: item.question_text,
        topic: item.topic,
        parent_context: item.context_text || item.passage_text,
        options_text: item.options_text || item.word_bank,
      }),
      crop_box: item.crop_box ?? null,
      passage_text: item.passage_text || item.context_text || "",
      context_text: item.context_text || item.passage_text || "",
      options_text: item.options_text || item.word_bank || "",
      parent_figure_box: item.parent_figure_box ?? null,
      sub_figure_box: item.sub_figure_box ?? null,
    };
  });

  const earned = problems.filter((problem) => problem.is_correct).length;
  return {
    subject: resolveScanSubject({ subject: subjectHint, problems }),
    overall_score: { earned, max: problems.length },
    problems,
  };
}

export function gradeFromGeminiPayload(raw) {
  if (!raw || typeof raw !== "object") return null;
  const problems = raw.problems ?? raw.questions;
  if (!Array.isArray(problems) || problems.length === 0) return null;
  const first = problems[0];
  if (!first || typeof first !== "object" || Array.isArray(first)) return null;
  const extractLike =
    normalizeGradeKind(first.type) !== null ||
    isGradeKind(first.type) ||
    "question_number" in first ||
    "user_answer" in first ||
    (!("bbox" in first) && !("is_correct" in first));
  if (!extractLike) return null;
  return gradeExtractedProblems(parseExtractProblems({ ...raw, problems }), raw.subject);
}
