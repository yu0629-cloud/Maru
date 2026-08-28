export const SUBJECT_CODES: readonly [
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
export const DEFAULT_SUBJECT: "other";
export const SUBJECT_LABELS: Record<(typeof SUBJECT_CODES)[number], string>;
export const SUBJECT_BADGES: Record<(typeof SUBJECT_CODES)[number], string>;
export function isSubjectCode(value: unknown): value is (typeof SUBJECT_CODES)[number];
export function normalizeSubject(value?: string | null): (typeof SUBJECT_CODES)[number] | null;
export function normalizeSubjects(values?: Array<string | null | undefined> | null): Array<(typeof SUBJECT_CODES)[number]>;
export function subjectBadge(value?: string | null): string;
export function subjectLabel(value?: string | null): string;
