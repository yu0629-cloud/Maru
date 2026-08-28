import {
  DEFAULT_SUBJECT,
  SUBJECT_BADGES as subjectBadgesImpl,
  SUBJECT_CODES as subjectCodesImpl,
  SUBJECT_LABELS as subjectLabelsImpl,
  isSubjectCode as isSubjectCodeImpl,
  normalizeSubject as normalizeSubjectImpl,
  normalizeSubjects as normalizeSubjectsImpl,
  subjectBadge,
  subjectLabel,
} from "./lib/subject.mjs";

export const SUBJECT_CODES = subjectCodesImpl as unknown as readonly [
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
export type SubjectCode = (typeof SUBJECT_CODES)[number];
export const SUBJECT_LABELS = subjectLabelsImpl as Record<SubjectCode, string>;
export const SUBJECT_BADGES = subjectBadgesImpl as Record<SubjectCode, string>;

export { DEFAULT_SUBJECT, subjectBadge, subjectLabel };

export function isSubjectCode(value: unknown): value is SubjectCode {
  return isSubjectCodeImpl(value);
}

export function normalizeSubject(value?: string | null): SubjectCode | null {
  const normalized = normalizeSubjectImpl(value);
  return isSubjectCode(normalized) ? normalized : null;
}

export function normalizeSubjects(values?: Array<string | null | undefined> | null): SubjectCode[] {
  return normalizeSubjectsImpl(values) as SubjectCode[];
}
