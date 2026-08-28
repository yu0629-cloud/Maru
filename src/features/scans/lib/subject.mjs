export const SUBJECT_CODES = [
  "math",
  "japanese",
  "spelling_phonics",
  "reading",
  "writing_grammar",
  "science",
  "social_studies",
  "world_languages",
  "other",
];

export const DEFAULT_SUBJECT = "other";

export const SUBJECT_LABELS = {
  math: "算数・数学",
  japanese: "国語（日本）",
  spelling_phonics: "スペル・フォニックス・語彙",
  reading: "読解",
  writing_grammar: "文法・ライティング",
  science: "理科・科学",
  social_studies: "社会・歴史・地理",
  world_languages: "外国語",
  other: "その他",
};

export const SUBJECT_BADGES = {
  math: "📘 算数・数学",
  japanese: "📕 国語",
  spelling_phonics: "🔤 スペル",
  reading: "📖 読解",
  writing_grammar: "✍️ 文法",
  science: "🔬 理科・科学",
  social_studies: "🌍 社会",
  world_languages: "🌐 外国語",
  other: "📁 その他",
};

const SUBJECT_ALIASES = {
  math: "math",
  arithmetic: "math",
  算数: "math",
  数学: "math",
  "算数・数学": "math",
  japanese: "japanese",
  国語: "japanese",
  "国語（日本）": "japanese",
  spelling_phonics: "spelling_phonics",
  spelling: "spelling_phonics",
  phonics: "spelling_phonics",
  vocabulary: "spelling_phonics",
  スペル: "spelling_phonics",
  フォニックス: "spelling_phonics",
  語彙: "spelling_phonics",
  reading: "reading",
  comprehension: "reading",
  読解: "reading",
  writing_grammar: "writing_grammar",
  writing: "writing_grammar",
  grammar: "writing_grammar",
  文法: "writing_grammar",
  ライティング: "writing_grammar",
  science: "science",
  stem: "science",
  理科: "science",
  科学: "science",
  social_studies: "social_studies",
  social: "social_studies",
  history: "social_studies",
  geography: "social_studies",
  civics: "social_studies",
  社会: "social_studies",
  歴史: "social_studies",
  地理: "social_studies",
  公民: "social_studies",
  world_languages: "world_languages",
  english: "world_languages",
  spanish: "world_languages",
  french: "world_languages",
  英語: "world_languages",
  外国語: "world_languages",
  other: "other",
  その他: "other",
};

export function isSubjectCode(value) {
  return typeof value === "string" && SUBJECT_CODES.includes(value);
}

export function normalizeSubject(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  const aliased = SUBJECT_ALIASES[raw] ?? SUBJECT_ALIASES[raw.toLowerCase()];
  if (aliased) return aliased;
  return isSubjectCode(raw.toLowerCase()) ? raw.toLowerCase() : null;
}

export function normalizeSubjects(values) {
  const seen = new Set();
  const next = [];
  for (const value of values ?? []) {
    const code = normalizeSubject(value);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    next.push(code);
  }
  return next;
}

export function subjectBadge(value) {
  return SUBJECT_BADGES[normalizeSubject(value) ?? DEFAULT_SUBJECT];
}

export function subjectLabel(value) {
  return SUBJECT_LABELS[normalizeSubject(value) ?? DEFAULT_SUBJECT];
}
