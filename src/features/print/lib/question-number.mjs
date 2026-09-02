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

const NUM_TO_CIRCLED = {
  1: "①",
  2: "②",
  3: "③",
  4: "④",
  5: "⑤",
  6: "⑥",
  7: "⑦",
  8: "⑧",
  9: "⑨",
  10: "⑩",
  11: "⑪",
  12: "⑫",
  13: "⑬",
  14: "⑭",
  15: "⑮",
  16: "⑯",
  17: "⑰",
  18: "⑱",
  19: "⑲",
  20: "⑳",
};

const KEYCAP = "\u20E3";

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

/** 大問番号 → `1⃣` */
export function formatSquareNumber(token) {
  const v = normalizeToken(token);
  if (!v) return "";
  if (/^[0-9]{1,2}$/.test(v)) return `${v}${KEYCAP}`;
  return `[ ${v} ]`;
}

/** 小問番号 → `①` / `(a)` */
export function formatRoundNumber(token) {
  const v = normalizeToken(token);
  if (!v) return "";
  const circled = NUM_TO_CIRCLED[Number(v)];
  if (circled) return circled;
  return `(${v})`;
}

/** 大問1の小問1 → `1⃣①`。片方だけならその記号だけ */
export function formatMajorSubLabel(major, sub) {
  const majorLabel = major ? formatSquareNumber(major) : "";
  const subLabel = sub ? formatRoundNumber(sub) : "";
  return `${majorLabel}${subLabel}`;
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
  // 「(1)の結果」「①の器具」は参照なので設問番号にしない
  m = s.match(/^([①-⑳❶-❿])(?!\s*の)/u);
  if (m) {
    return { style: "round", token: normalizeToken(m[1]), raw: m[1], rest: s.slice(m[1].length).replace(/^[\s　．.、:：]+/u, "") };
  }
  m = s.match(/^([\(（]\s*([0-9０-９a-zA-Z]+)\s*[\)）])(?!\s*の)/u);
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
 * 小問の本文か（図の手順❶や選択肢①は除く）。
 * (1)（2）問3【1】など、新しい設問ブロックの開始だけ true。
 */
export function looksLikeProblemStemText(text) {
  const s = String(text ?? "").replace(/^\s+/, "");
  if (!s) return false;
  if (/^[❶-❿①-⑳]/.test(s)) return false;
  const hit = matchLeadingQuestionNumber(s);
  if (!hit?.token) return false;
  return String(hit.rest ?? "").replace(/\s+/g, "").length >= 2;
}

/**
 * 大問＋小問をラベルや先頭から取る。
 * 「大問1 (1)」「1-(2)」「2(1)」「1⃣①」
 * @returns {{ major: string, sub: string } | null}
 */
export function parseMajorSub(value) {
  const s = nfkc(value);
  if (!s) return null;

  let m = s.match(/^([0-9０-９]{1,2})\u20E3\s*([①-⑳❶-❿])/u);
  if (m) return { major: normalizeToken(m[1]), sub: normalizeToken(m[2]) };

  m = s.match(/^大問\s*([0-9０-９]+)[\s　]*(?:[\(（]\s*([0-9０-９a-zA-Z]+)\s*[\)）]|([①-⑳❶-❿]))/u);
  if (m) return { major: normalizeToken(m[1]), sub: normalizeToken(m[2] || m[3] || "") };

  m = s.match(/^([0-9０-９]{1,2})\s*[-−ー~～]\s*[\(（]?([0-9０-９]{1,2}|[①-⑳❶-❿])[\)）]?/u);
  if (m) return { major: normalizeToken(m[1]), sub: normalizeToken(m[2]) };

  m = s.match(/^([0-9０-９]{1,2})\s*[\(（]\s*([0-9０-９]{1,2})\s*[\)）]/u);
  if (m) return { major: normalizeToken(m[1]), sub: normalizeToken(m[2]) };

  m = s.match(/^大問\s*([0-9０-９]+)\s*$/u);
  if (m) return { major: normalizeToken(m[1]), sub: "" };

  m = s.match(/^問\s*([0-9０-９]+)\s*$/u);
  if (m) return { major: "", sub: normalizeToken(m[1]) };

  return null;
}

function stripLeadingMajorSub(text) {
  const s = String(text ?? "").replace(/^\s+/, "");
  const parts = parseMajorSub(s);
  if (parts?.major && parts?.sub) {
    const cut = s.match(
      /^(?:大問\s*[0-9０-９]+[\s　]*(?:[\(（]\s*[0-9０-９a-zA-Z]+\s*[\)）]|[①-⑳❶-❿])|[0-9０-９]{1,2}\u20E3\s*[①-⑳❶-❿]|[0-9０-９]{1,2}\s*[-−ー~～]\s*[\(（]?[0-9０-９①-⑳❶-❿]{1,2}[\)）]?|[0-9０-９]{1,2}\s*[\(（]\s*[0-9０-９]{1,2}\s*[\)）])/u,
    );
    if (cut) return s.slice(cut[0].length).replace(/^[\s　．.、:：]+/u, "");
  }
  const hit = matchLeadingQuestionNumber(s);
  return hit ? hit.rest : s.trim();
}

/**
 * ラベル単体（problem_label など）から番号を取る。
 * 「大問1」「大問1 (2)」は大問=角括弧、末尾小問があれば丸括弧を優先。
 */
export function matchLabelQuestionNumber(label) {
  const s = nfkc(label);
  if (!s) return null;

  const parts = parseMajorSub(s);
  if (parts?.sub) {
    return { style: "round", token: parts.sub, raw: s, rest: "", major: parts.major };
  }
  if (parts?.major) {
    return { style: "square", token: parts.major, raw: s, rest: "", major: parts.major };
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
  const labelCandidates = [
    sources.problemLabel,
    sources.problem_label,
    sources.problemIndex,
    sources.problem_index,
    sources.label,
  ];

  let major = "";
  let sub = "";
  const takeParts = (value) => {
    const parts = parseMajorSub(value);
    if (!parts) return;
    if (parts.major && !major) major = parts.major;
    if (parts.sub && !sub) sub = parts.sub;
  };
  for (const candidate of labelCandidates) takeParts(candidate);
  for (const candidate of stemCandidates) takeParts(candidate);

  if (!sub || !major) {
    for (const candidate of stemCandidates) {
      const hit = matchLeadingQuestionNumber(candidate);
      if (!hit?.token) continue;
      if (hit.style === "square" && !major) major = hit.token;
      if (hit.style === "round" && !sub) sub = hit.token;
      if (major && sub) break;
    }
  }
  if (!sub || !major) {
    for (const candidate of labelCandidates) {
      const hit = matchLabelQuestionNumber(candidate);
      if (!hit?.token) continue;
      if (hit.style === "square" && !major) major = hit.token;
      if (hit.style === "round" && !sub) sub = hit.token;
      if (major && sub) break;
    }
  }

  let body = "";
  for (const stem of stemCandidates) {
    const text = String(stem ?? "").trim();
    if (!text) continue;
    body = stripLeadingMajorSub(text);
    break;
  }

  const label = formatMajorSubLabel(major, sub);
  const token = major && sub ? `${major}-${sub}` : sub || major;
  const style = major ? "square" : "round";
  return { style, token, label, body, major, sub };
}

/** アプリ・プリント共通の表示用番号（1⃣①） */
export function displayProblemNumber(sources = {}) {
  return resolveQuestionNumber(sources).label;
}

/** 先頭番号を本文から除去（二重表示防止） */
export function stripLeadingQuestionNumber(text) {
  return stripLeadingMajorSub(text);
}

/** 「(1)の結果から」など、直前の小問を指している番号 */
export function referencedPartTokens(text) {
  const s = String(text ?? "");
  const tokens = [];
  for (const match of s.matchAll(/[\(（]\s*([0-9０-９]+)\s*[\)）]\s*の/gu)) {
    const token = normalizeToken(match[1]);
    if (token && !tokens.includes(token)) tokens.push(token);
  }
  return tokens;
}
