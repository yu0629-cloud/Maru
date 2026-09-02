/** プリントの名前欄・学年表記から登録済み子どもを照合する */

const KANJI_DIGIT = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

function digitFromToken(token) {
  const nfkc = String(token ?? "").normalize("NFKC");
  if (KANJI_DIGIT[nfkc] != null) return KANJI_DIGIT[nfkc];
  const n = Number(nfkc);
  return Number.isInteger(n) ? n : null;
}

export function normalizePersonName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/[\s　・･.。．]/g, "")
    .replace(/[ー−‐-]/g, "")
    .toLowerCase();
}

export function extractGradeCodes(text) {
  const raw = String(text ?? "").normalize("NFKC");
  const codes = new Set();
  const addE = (token) => {
    const n = digitFromToken(token);
    if (n >= 1 && n <= 6) codes.add(`e${n}`);
  };
  const addJ = (token) => {
    const n = digitFromToken(token);
    if (n >= 1 && n <= 3) codes.add(`j${n}`);
  };
  for (const match of raw.matchAll(/中(?:学)?\s*([1-3１-３一二三])/g)) addJ(match[1]);
  for (const match of raw.matchAll(/\bj\s*([1-3])\b/gi)) addJ(match[1]);
  for (const match of raw.matchAll(/(?:小学(?:校)?|小)\s*([1-6１-６一二三四五六])/g)) addE(match[1]);
  for (const match of raw.matchAll(/\be\s*([1-6])\b/gi)) addE(match[1]);
  return [...codes];
}

function nameScore(registeredName, detectedName) {
  const registered = normalizePersonName(registeredName);
  const detected = normalizePersonName(detectedName);
  if (!registered || !detected) return 0;
  if (registered === detected) return 100;
  if (detected.length >= 2 && registered.includes(detected)) return 80 + Math.min(detected.length, 15);
  if (registered.length >= 2 && detected.includes(registered)) return 70 + Math.min(registered.length, 15);
  return 0;
}

function bestNameMatches(children, detectedName) {
  if (!normalizePersonName(detectedName)) return [];
  const scored = children
    .map((child) => ({
      child,
      score: Math.max(nameScore(child.name, detectedName), nameScore(child.nickname, detectedName)),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || String(a.child.name).localeCompare(String(b.child.name)));
  if (scored.length === 0) return [];
  const top = scored[0].score;
  return scored.filter((row) => row.score === top).map((row) => row.child);
}

function gradeMatches(children, codes) {
  if (!codes.length) return [];
  return children.filter((child) => codes.includes(String(child.grade_code ?? "")));
}

export function readChildDetectionHint(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { detected_child_id: "", detected_child_name: "", confidence_reason: "" };
  }
  const id = typeof raw.detected_child_id === "string" ? raw.detected_child_id.trim() : "";
  const name = typeof raw.detected_child_name === "string" ? raw.detected_child_name.trim() : "";
  const reason = typeof raw.confidence_reason === "string" ? raw.confidence_reason.trim() : "";
  const grade = typeof raw.detected_grade_label === "string" ? raw.detected_grade_label.trim() : "";
  return {
    detected_child_id: id,
    detected_child_name: name,
    confidence_reason: reason,
    detected_grade_label: grade,
  };
}

function childById(children, id) {
  if (!id) return null;
  return children.find((child) => child.id === id) ?? null;
}

function fallbackReason(fallbackChild) {
  const name = fallbackChild?.name ? `${fallbackChild.name}さん` : "選択中の子ども";
  return `名前欄を特定できなかったため、${name}に振り分けました`;
}

/**
 * 優先: 名前欄 → 学年 → 選択中の子ども。
 * Gemini の UUID は登録済みのときだけヒントとして使う。
 */
export function resolveChildDetection(input = {}) {
  const children = Array.isArray(input.children) ? input.children.filter((child) => child?.id) : [];
  const hint = readChildDetectionHint(input.hint);
  const fallback =
    childById(children, input.fallbackChildId) ?? children[0] ?? null;
  const fallbackId = fallback?.id ?? input.fallbackChildId ?? "";
  const gradeHay = [hint.detected_grade_label, hint.confidence_reason, hint.detected_child_name]
    .filter(Boolean)
    .join(" ");
  const grades = extractGradeCodes(gradeHay);
  const byName = bestNameMatches(children, hint.detected_child_name);
  const byGrade = gradeMatches(children, grades);
  const hinted = childById(children, hint.detected_child_id);

  const picked = (() => {
    if (byName.length === 1) {
      return {
        child: byName[0],
        matched: true,
        fallback: false,
        reason:
          hint.confidence_reason ||
          `名前欄に『${hint.detected_child_name}』とあり、${byName[0].name}さんと一致したため`,
      };
    }
    if (byName.length > 1) {
      const namedGrade = byName.filter((child) => byGrade.some((row) => row.id === child.id));
      if (namedGrade.length === 1) {
        return {
          child: namedGrade[0],
          matched: true,
          fallback: false,
          reason:
            hint.confidence_reason ||
            `名前欄『${hint.detected_child_name}』と学年が${namedGrade[0].name}さんと一致したため`,
        };
      }
      if (hinted && byName.some((child) => child.id === hinted.id)) {
        return {
          child: hinted,
          matched: true,
          fallback: false,
          reason: hint.confidence_reason || `名前欄『${hint.detected_child_name}』が${hinted.name}さんと一致したため`,
        };
      }
    }
    if (byName.length === 0 && byGrade.length === 1) {
      return {
        child: byGrade[0],
        matched: true,
        fallback: false,
        reason: hint.confidence_reason || `プリントの学年表記が${byGrade[0].name}さんと一致したため`,
      };
    }
    if (children.length === 1) {
      return {
        child: children[0],
        matched: Boolean(byName.length || byGrade.length),
        fallback: !byName.length && !byGrade.length,
        reason:
          hint.confidence_reason ||
          (byName.length || byGrade.length
            ? `${children[0].name}さんのプリントと判定したため`
            : fallbackReason(children[0])),
      };
    }
    return {
      child: fallback,
      matched: false,
      fallback: true,
      reason: hint.confidence_reason && byName.length === 0 && byGrade.length !== 1
        ? `${hint.confidence_reason}（特定できなかったため選択中の子どもに振り分け）`
        : fallbackReason(fallback),
    };
  })();

  return {
    childId: picked.child?.id ?? fallbackId,
    detected_child_id: picked.matched ? picked.child?.id ?? "" : hint.detected_child_id,
    detected_child_name: hint.detected_child_name,
    confidence_reason: picked.reason,
    matched: Boolean(picked.matched && picked.child),
    fallback: Boolean(picked.fallback || !picked.child),
  };
}

export function formatChildrenRoster(children = [], selectedId = "") {
  if (!children.length) return "";
  const lines = children.map((child) => {
    const grade = child.gradeLabel || child.grade_code || "";
    const nick = child.nickname ? ` あだ名=${child.nickname}` : "";
    const exam = child.examTarget || child.exam_target ? ` 受験=${child.examTarget || child.exam_target}` : "";
    const current = child.id === selectedId ? " 【いま選択中】" : "";
    return `- id=${child.id} 名前=${child.name}${nick} 学年=${grade}${exam}${current}`;
  });
  return [
    "【子ども振り分け】登録済みの子どもから、このプリントの所有者を1人だけ選ぶ。",
    ...lines,
    "判定の優先順: 1) 「なまえ」「氏名」「Name」欄の手書き（漢字・ひらがな・ファーストネーム・あだ名） 2) 「小学〇年」「小〇」「中〇」などの学年表記 3) 不明なら【いま選択中】の id。",
    "detected_child_id は上の id のいずれか。特定できなければ空文字。一覧に無い UUID を作るな。",
    "detected_child_name は欄に書かれていた文字そのもの（手書き）。無いときは空文字。",
    "confidence_reason は日本語で短く（例: 名前欄に『ゆい』、学年が小6で一致したため）。",
    "図の印刷ラベルや問題文を名前だと思うな。採点の ground_truth とは別キー。",
  ].join("\n");
}
