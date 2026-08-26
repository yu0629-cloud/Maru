export function recountScore(problems: Array<{ is_correct: boolean }>): { earned: number; max: number };
export function toggleProblemCorrect<T extends Record<string, unknown>>(problem: T): T;
export function problemsNeedingInpaint<T extends { is_correct: boolean; needs_inpaint: boolean }>(
  problems: T[],
): T[];
export const MISTAKE_LABELS: Record<string, string>;
