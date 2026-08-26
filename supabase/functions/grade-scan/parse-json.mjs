function stripFence(text) {
  return String(text ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function sliceJsonObject(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return text.slice(start, end + 1);
}

function skipWsAndCommas(text, index) {
  let i = index;
  while (i < text.length && /[\s,]/.test(text[i])) i += 1;
  return i;
}

function scanObjectEnd(text, start) {
  if (text[start] !== "{") return -1;
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inStr) {
      if (escape) escape = false;
      else if (char === "\\") escape = true;
      else if (char === "\"") inStr = false;
      continue;
    }
    if (char === "\"") inStr = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/** MAX_TOKENS で途切れた problems 配列から、完成したオブジェクトだけ拾う */
export function recoverTruncatedProblems(text) {
  const match = String(text ?? "").match(/"problems"\s*:\s*\[/);
  if (!match || match.index === undefined) return null;
  let i = match.index + match[0].length;
  const problems = [];
  while (i < text.length) {
    i = skipWsAndCommas(text, i);
    if (text[i] === "]") break;
    if (text[i] !== "{") break;
    const end = scanObjectEnd(text, i);
    if (end < 0) break;
    try {
      problems.push(JSON.parse(text.slice(i, end)));
    } catch {
      break;
    }
    i = end;
  }
  if (problems.length === 0) return null;
  return { problems };
}

export function parseJsonPayload(text) {
  const trimmed = stripFence(text);
  const candidates = [trimmed, sliceJsonObject(trimmed)].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // next
    }
  }
  return recoverTruncatedProblems(trimmed);
}
