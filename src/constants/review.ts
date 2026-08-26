export const REVIEW_CONFIG = {
  dailyMin: 3,
  dailyMax: 5,
  leechMissThreshold: 3,
  masteredIntervalDays: 30,
  masteredHitThreshold: 3,
  initialIntervalDays: 1,
  initialEaseFactor: 2.5,
} as const;

export const GRADE_LABELS = {
  e1: "小1",
  e2: "小2",
  e3: "小3",
  e4: "小4",
  e5: "小5",
  e6: "小6",
  j1: "中1",
  j2: "中2",
  j3: "中3",
} as const;

export const SUBJECT_LABELS = {
  math: "算数",
  japanese: "国語",
  science: "理科",
  social: "社会",
  english: "英語",
  other: "その他",
} as const;
