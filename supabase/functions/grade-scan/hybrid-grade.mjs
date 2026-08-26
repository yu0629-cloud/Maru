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

export function parseExtractProblems(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("EXTRACT_NOT_OBJECT");
  }
  const problems = raw.problems;
  if (!Array.isArray(problems) || problems.length === 0) {
    throw new Error("EXTRACT_PROBLEMS_REQUIRED");
  }
  return problems.map((item, index) => {
    const row = item && typeof item === "object" && !Array.isArray(item) ? item : {};
    const problemIndex = String(row.problem_index ?? `問${index + 1}`).trim() || `問${index + 1}`;
    const questionText = String(row.question_text ?? row.problem_index ?? "").trim();
    const studentAnswer = String(row.student_answer ?? "").trim();
    const correctAnswer = String(row.correct_answer ?? "").trim();
    const kind =
      normalizeGradeKind(row.type) ??
      inferGradeKind({ questionText, problemIndex, correctAnswer });
    return {
      problem_index: problemIndex,
      question_text: questionText,
      student_answer: studentAnswer,
      correct_answer: correctAnswer,
      type: kind,
      bbox: parseGeminiBBox(row.bbox),
    };
  });
}

export function gradeExtractedProblems(extracted) {
  const total = extracted.length;
  const problems = extracted.map((item, index) => {
    const isCorrect =
      item.type === "math"
        ? gradeMath({
            questionText: item.question_text,
            problemIndex: item.problem_index,
            studentAnswer: item.student_answer,
            correctAnswer: item.correct_answer,
          })
        : gradeText(item.student_answer, item.correct_answer);

    const blank = !item.student_answer;
    const problemType = problemTypeFromKind(item.type, `${item.question_text} ${item.problem_index}`);
    const expected =
      item.type === "math"
        ? expectedMathValue(item.question_text, item.problem_index, item.correct_answer)
        : null;

    return {
      problem_index: item.problem_index,
      bbox: coerceGeminiBBox(item.bbox, index, total),
      is_correct: isCorrect,
      student_answer: item.student_answer,
      correct_answer:
        expected !== null && item.type === "math" ? String(expected) : item.correct_answer,
      topic_tag: (item.question_text || item.problem_index || "未分類").slice(0, 20),
      difficulty_level: "standard",
      mistake_type: isCorrect ? "none" : blank ? "blank" : item.type === "math" ? "careless" : "concept_gap",
      parent_coaching_tip: templateTip(item.type, isCorrect, item.student_answer),
      needs_inpaint: !isCorrect && !blank,
      problem_type: problemType,
    };
  });

  const earned = problems.filter((problem) => problem.is_correct).length;
  return {
    overall_score: { earned, max: problems.length },
    problems,
  };
}

export function gradeFromGeminiPayload(raw) {
  const problems = raw && typeof raw === "object" ? raw.problems : null;
  if (!Array.isArray(problems) || problems.length === 0) return null;
  const first = problems[0];
  if (!first || typeof first !== "object" || Array.isArray(first)) return null;
  const extractLike =
    normalizeGradeKind(first.type) !== null ||
    isGradeKind(first.type) ||
    !("bbox" in first);
  if (!extractLike) return null;
  return gradeExtractedProblems(parseExtractProblems(raw));
}
