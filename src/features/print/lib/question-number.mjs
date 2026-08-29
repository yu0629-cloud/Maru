/**
 * 元プリントの設問番号記号を、角括弧 / 丸括弧の一貫形式へ正規化する。
 */

const CIRCLED_MAP = {
  "①": "1",
  "②": "2",
  "③": "3",
  "④": "4",
  "⑤": "5",
  "⑥": "6",
  "⑦": "7",
  "⑧": "8",
  "⑨": "9",
  "⑩": "10",
  "⑪": "11",
  "⑫": "12",
  "⑬": "13",
  "⑭": "14",
  "⑮": "15",
  "⑯": "16",
  "⑰": "17",
  "⑱": "18",
  "⑲": "19",
  "⑳": "20",
  "❶": "1",
  "❷": "2",
  "❸": "3",
  "❹": "4",
  "❺": "5",
  "❻": "6",
  "❼": "7",
  "❽": "8",
  "❾": "9",
  "❿": "10",
};

function nfkc(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeToken(raw) {
  const t = nfkc(raw);
  if (!t) return "";
  if (CIRCLED_MAP[t]) return CIRCLED_MAP[t];
  return t;
}

/** 四角囲み・大枠 → `[ N ]` */
export function formatSquareNumber(token) {
  const v = normalizeToken(token);
  if (!v) return "";
  return `[ ${v} ]`;
}

/** 丸数字・小カッコ → `(N)` / `(a)` */
export function formatRoundNumber(token) {
  const v = normalizeToken(token);
  if (!v) return "";
  return `(${v})`;
}

/**
 * 先頭の設問番号を検出する。
 * @returns {{ style: 'square'|'round', token: string, raw: string, rest: string } | null}
 */
export function matchLeadingQuestionNumber(text) {
  const raw = String(text ?? "");
  if (!raw.trim()) return null;
  const s = raw.replace(/^\s+/, "");

  // 四角: 【1】 / ■1 / [1] / 1⃣
  let m = s.match(/^(【\s*([0-9０-９a-zA-Z]+)\s*】)/u);
  if (m) {
    return { style: "square", token: normalizeToken(m[2]), raw: m[1], rest: s.slice(m[1].length).replace(/^[\s　．.、:：]+/u, "") };
  }
  m = s.match(/^(■\s*([0-9０-９a-zA-Z]+))/u);
  if (m) {
    return { style: "square", token: normalizeToken(m[2]), raw: m[1], rest: s.slice(m[1].length).replace(/^[\s　．.、:：]+/u, "") };
  }
  m = s.match(/^(\[\s*([0-9０-９a-zA-Z]+)\s*\])/u);
  if (m) {
    return { style: "square", token: normalizeToken(m[2]), raw: m[1], rest: s.slice(m[1].length).replace(/^[\s　．.、:：]+/u, "") };
  }
  m = s.match(/^(([0-9０-９])\u20E3)/u);
  if (m) {
    return { style: "square", token: normalizeToken(m[2]), raw: m[1], rest: s.slice(m[1].length).replace(/^[\s　．.、:：]+/u, "") };
  }

  // 丸: ① / (1) / 1. / (a)
  m = s.match(/^([①-⑳❶-❿])/u);
  if (m) {
    return { style: "round", token: normalizeToken(m[1]), raw: m[1], rest: s.slice(m[1].length).replace(/^[\s　．.、:：]+/u, "") };
  }
  m = s.match(/^([\(（]\s*([0-9０-９a-zA-Z]+)\s*[\)）])/u);
  if (m) {
    return { style: "round", token: normalizeToken(m[2]), raw: m[1], rest: s.slice(m[1].length).replace(/^[\s　．.、:：]+/u, "") };
  }
  m = s.match(/^(([0-9０-９a-zA-Z]+)[.．])/u);
  if (m) {
    return { style: "round", token: normalizeToken(m[2]), raw: m[1], rest: s.slice(m[1].length).replace(/^[\s　．.、:：]+/u, "") };
  }

  return null;
}

/**
 * ラベル単体（problem_label など）から番号を取る。
 * 「大問1」「大問1 (2)」は大問=角括弧、末尾小問があれば丸括弧を優先。
 */
export function matchLabelQuestionNumber(label) {
  const s = nfkc(label);
  if (!s) return null;

  const nested = s.match(/大問\s*([0-9０-９]+)[\s　]*(?:[\(（]\s*([0-9０-９a-zA-Z]+)\s*[\)）]|([①-⑳❶-❿]))\s*$/u);
  if (nested) {
    const sub = nested[2] || nested[3];
    if (sub) {
      return { style: "round", token: normalizeToken(sub), raw: s, rest: "" };
    }
  }

  const major = s.match(/^大問\s*([0-9０-９]+)$/u);
  if (major) {
    return { style: "square", token: normalizeToken(major[1]), raw: s, rest: "" };
  }

  const leading = matchLeadingQuestionNumber(s);
  if (leading) return leading;

  if (/^[0-9０-９a-zA-Z]{1,4}$/u.test(s)) {
    return { style: "round", token: normalizeToken(s), raw: s, rest: "" };
  }

  return null;
}

export function formatQuestionNumberLabel(style, token) {
  if (style === "square") return formatSquareNumber(token);
  return formatRoundNumber(token);
}

/**
 * 設問本文・ラベルから正規化番号と本文を解決する。
 * @returns {{ style: 'square'|'round', token: string, label: string, body: string }}
 */
export function resolveQuestionNumber(sources = {}) {
  const stemCandidates = [
    sources.questionText,
    sources.question_text,
    sources.prompt,
    sources.stem,
    sources.text,
  ];
  for (const candidate of stemCandidates) {
    const hit = matchLeadingQuestionNumber(candidate);
    if (hit?.token) {
      return {
        style: hit.style,
        token: hit.token,
        label: formatQuestionNumberLabel(hit.style, hit.token),
        body: hit.rest,
      };
    }
  }

  const labelCandidates = [
    sources.problemLabel,
    sources.problem_label,
    sources.problemIndex,
    sources.problem_index,
    sources.label,
  ];
  for (const candidate of labelCandidates) {
    const hit = matchLabelQuestionNumber(candidate);
    if (hit?.token) {
      let body = "";
      for (const stem of stemCandidates) {
        const text = String(stem ?? "").trim();
        if (!text) continue;
        const stripped = matchLeadingQuestionNumber(text);
        body = stripped ? stripped.rest : text;
        break;
      }
      return {
        style: hit.style,
        token: hit.token,
        label: formatQuestionNumberLabel(hit.style, hit.token),
        body,
      };
    }
  }

  const fallbackBody =
    stemCandidates.map((part) => String(part ?? "").trim()).find(Boolean) || "";
  const stripped = matchLeadingQuestionNumber(fallbackBody);
  return {
    style: "round",
    token: "",
    label: "",
    body: stripped ? stripped.rest : fallbackBody,
  };
}

/** 先頭番号を本文から除去（二重表示防止） */
export function stripLeadingQuestionNumber(text) {
  const hit = matchLeadingQuestionNumber(text);
  return hit ? hit.rest : String(text ?? "").trim();
}
