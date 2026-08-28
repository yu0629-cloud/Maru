export {
  DEFAULT_SUBJECT,
  SUBJECT_BADGES,
  SUBJECT_CODES,
  SUBJECT_LABELS,
  inferSubject,
  isSubjectCode,
  majoritySubject,
  normalizeSubject,
  resolveScanSubject,
} from "./subject.mjs";

export type SubjectCode =
  | "math"
  | "japanese"
  | "spelling_phonics"
  | "reading"
  | "writing_grammar"
  | "science"
  | "social_studies"
  | "world_languages"
  | "other";
